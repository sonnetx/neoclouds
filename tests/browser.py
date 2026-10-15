"""Load the guide in Chromium and check the interactions that have broken before.

Serves the repository root on a free local port. Set CHROME_PATH to use a
system Chrome instead of the Playwright download.
"""
import asyncio, functools, http.server, os, re, socketserver, sys, threading
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
failures = []


def check(ok, message):
    print(('ok   ' if ok else 'FAIL ') + message)
    if not ok:
        failures.append(message)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class QuietServer(socketserver.ThreadingTCPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        pass  # The browser drops connections when a test navigates mid-download.


def serve():
    httpd = QuietServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, 'http://127.0.0.1:%d/' % httpd.server_address[1]


BANDS_MATCH_HEADERS = """() => {
  const svg = document.getElementById('net-svg').getBoundingClientRect();
  const edges = sel => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().right - svg.x));
  return JSON.stringify(edges('#net-cols span')) === JSON.stringify(edges('.net-band'));
}"""


async def main():
    httpd, base = serve()
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=os.environ.get('CHROME_PATH') or None)
        for width in (1440, 1000, 390):
            page = await browser.new_page(viewport={'width': width, 'height': 900})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            await page.goto(base + '#network')
            await page.wait_for_selector('.net-node')
            await page.wait_for_timeout(500)
            check(not errors, '%dpx loads without script errors %s' % (width, errors or ''))
            scroll = await page.evaluate('[document.documentElement.scrollWidth, innerWidth]')
            check(scroll[0] <= scroll[1], '%dpx has no horizontal scroll' % width)
            check(await page.evaluate(BANDS_MATCH_HEADERS), '%dpx column headers line up with their bands' % width)
            await page.close()

        page = await browser.new_page(viewport={'width': 1440, 'height': 900})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        # The button must select the profile's own company, including ones with short map labels.
        for slug, label in (('coreweave', 'CoreWeave'), ('microsoft-azure', 'Microsoft'), ('aws', 'AWS')):
            await page.goto(base + '#/' + slug)
            await page.click('[data-net]')
            await page.wait_for_timeout(700)
            sel = await page.evaluate("[...document.querySelectorAll('.net-node.sel')].map(n => n.getAttribute('aria-label').split(',')[0])")
            check(sel == [label], 'Show on the network from %s selects %s (got %s)' % (slug, label, sel))
        await page.goto(base + '#/akamai')
        check(await page.locator('[data-net]').count() == 0, 'profiles that are not on the map have no network button')

        # Zooming keeps the headers over their columns.
        await page.goto(base + '#network')
        await page.wait_for_selector('.net-node')
        box = await page.locator('#net-svg').bounding_box()
        await page.mouse.move(box['x'] + box['width'] * 0.7, box['y'] + box['height'] / 2)
        for _ in range(3):
            await page.mouse.wheel(0, -200)
            await page.wait_for_timeout(100)
        await page.wait_for_timeout(400)
        check(await page.evaluate(BANDS_MATCH_HEADERS), 'column headers follow zoom')

        # Panel titles link to the company website, for providers and for buyers.
        for query, host in (('CoreWeave', 'coreweave.com'), ('Anthropic', 'anthropic.com')):
            await page.fill('#net-search', query)
            await page.press('#net-search', 'Enter')
            await page.wait_for_timeout(500)
            href = await page.evaluate("(document.querySelector('#net-panel h3 a') || {}).href || ''")
            check(host in href, '%s panel title links to %s (got %r)' % (query, host, href))

        # Fal is a provider with its own profile, not a buyer-only node.
        await page.goto(base + '#network')
        await page.fill('#net-search', 'Fal')
        await page.press('#net-search', 'Enter')
        await page.wait_for_timeout(500)
        kicker = await page.evaluate("(document.querySelector('#net-panel .kicker') || {}).textContent || ''")
        check(kicker.lower() != 'buyer' and await page.locator('#net-panel a.go').count() == 1, 'Fal opens as a provider with a profile link (kicker %r)' % kicker)

        await page.goto(base + '#providers')
        pills = await page.evaluate("[...document.querySelectorAll('#cats button')].map(b => b.textContent)")
        names = [re.sub(r'\d+$', '', p).strip() for p in pills]
        expected = ['All', 'Neoclouds', 'Hyperscalers', 'Other clouds', 'AI platforms', 'Marketplaces', 'Data center developers', 'AI labs']
        check(names == expected, 'directory shows the broad company types (got %s)' % names)
        # The introduction shows on the first view only.
        check(await page.evaluate("document.getElementById('hero').hidden"), 'the introduction is hidden off the Network view')
        layouts = await page.evaluate("[...document.querySelectorAll('[data-layout]')].map(b => b.dataset.layout)")
        check(layouts == ['logos', 'table', 'map'], 'Providers offers three layouts (got %s)' % layouts)

        # Region, accelerator and sort sit in a Filters menu that counts active filters and closes on an outside click.
        await page.click('#filters summary')
        await page.select_option('#region', 'Europe')
        await page.wait_for_timeout(200)
        count = await page.evaluate("document.getElementById('filter-count').textContent")
        check(count == '1', 'Filters shows one active filter (got %r)' % count)
        await page.mouse.click(5, 5)
        check(not await page.evaluate("document.getElementById('filters').open"), 'Filters closes on an outside click')
        await page.click('#clear-filters')

        await page.goto(base + '#network')
        check(not await page.evaluate("document.getElementById('hero').hidden"), 'the introduction shows on the Network view')

        # The Guide tab is gone. Its old links open the network instead of a blank page,
        # and the method link lands on the About the data note.
        tabs = await page.evaluate("[...document.querySelectorAll('#tabs a')].map(a => a.textContent.trim())")
        check(tabs == ['Network', 'Providers', 'Timeline', 'Prices'], 'the tabs are Network, Providers, Timeline and Prices (got %s)' % tabs)
        for old in ('#guide', '#comparing', '#glossary'):
            await page.goto(base + old)
            await page.wait_for_timeout(300)
            shown = await page.evaluate("[...document.querySelectorAll('.view')].filter(v => !v.hidden).map(v => v.id)")
            check(shown == ['view-network'], 'old link %s opens the network (got %s)' % (old, shown))
        await page.goto(base + '#method')
        await page.wait_for_timeout(400)
        about = await page.evaluate("(() => { const r = document.getElementById('method').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()")
        check(about, 'the method link scrolls to About the data')
        check(not errors, 'interactions run without script errors %s' % (errors or ''))
        await browser.close()
    httpd.shutdown()


asyncio.run(main())
if failures:
    sys.exit('%d browser checks failed' % len(failures))
