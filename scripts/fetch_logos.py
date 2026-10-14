"""Download a square brand icon for each provider and major buyer.

Order of preference: the site's apple-touch-icon or largest PNG icon from its
HTML, then a few well-known icon paths, then Google's favicon service. Every
image is normalized to a 128x128 PNG and saved under neoclouds/logos/.
"""
import concurrent.futures, html, io, json, os, re, sys, urllib.parse, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
OUT = ROOT + 'logos/'
PROV = ROOT + 'providers.js'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

BUYERS = {
    'b-anthropic': 'https://www.anthropic.com', 'b-openai': 'https://openai.com', 'b-meta': 'https://about.meta.com',
    'b-nvidia': 'https://www.nvidia.com', 'b-cursor': 'https://cursor.com', 'b-cognition': 'https://cognition.ai',
    'b-perplexity': 'https://www.perplexity.ai', 'b-cohere': 'https://cohere.com', 'b-reflection-ai': 'https://reflection.ai',
    'b-jane-street': 'https://www.janestreet.com', 'b-thinking-machines-lab': 'https://thinkingmachines.ai',
    'b-figure-ai': 'https://www.figure.ai', 'b-amd': 'https://www.amd.com', 'b-fal': 'https://fal.ai',
    'b-higgsfield': 'https://higgsfield.ai', 'b-notion': 'https://www.notion.so', 'b-ramp': 'https://ramp.com',
    'b-suno': 'https://suno.com', 'b-nokia': 'https://www.nokia.com', 'b-uc-berkeley': 'https://www.berkeley.edu',
}


def get(url, timeout=15):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.geturl(), r.headers.get('Content-Type', '')


def candidates(site):
    out = []
    try:
        body, final, _ = get(site)
        text = body.decode('utf-8', 'ignore')
        for m in re.finditer(r'<link\b[^>]*>', text, re.I):
            tag = m.group(0)
            rel = re.search(r'rel=["\']([^"\']+)["\']', tag, re.I)
            href = re.search(r'href=["\']([^"\']+)["\']', tag, re.I)
            if not rel or not href:
                continue
            rel = rel.group(1).lower()
            if 'icon' not in rel:
                continue
            h = urllib.parse.urljoin(final, html.unescape(href.group(1)))
            if h.lower().endswith('.svg') or 'mask-icon' in rel:
                continue
            sizes = re.search(r'sizes=["\'](\d+)x\d+', tag, re.I)
            score = int(sizes.group(1)) if sizes else (180 if 'apple' in rel else 32)
            out.append((score, h))
        base = '{0.scheme}://{0.netloc}'.format(urllib.parse.urlparse(final))
    except Exception:
        base = site.rstrip('/')
    out.sort(reverse=True)
    urls = [u for _, u in out]
    urls += [base + '/apple-touch-icon.png', base + '/apple-touch-icon-precomposed.png']
    dom = urllib.parse.urlparse(base).netloc
    urls += ['https://www.google.com/s2/favicons?domain=%s&sz=256' % dom]
    return urls


def load_image(url):
    body, _, ctype = get(url)
    im = Image.open(io.BytesIO(body))
    if getattr(im, 'n_frames', 1) > 1:  # .ico with several sizes: take the largest
        best = None
        for i in range(im.n_frames):
            im.seek(i)
            if best is None or im.size[0] > best.size[0]:
                best = im.copy()
        im = best
    return im.convert('RGBA')


def normalize(im):
    w, h = im.size
    side = max(w, h)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    return canvas.resize((128, 128), Image.LANCZOS)


def fetch(slug, site):
    tried = []
    for url in candidates(site):
        try:
            im = load_image(url)
        except Exception:
            tried.append(url)
            continue
        if min(im.size) < 48:
            tried.append(url + ' (too small %sx%s)' % im.size)
            continue
        normalize(im).save(OUT + slug + '.png', optimize=True)
        return slug, url, min(im.size)
    return slug, None, tried[:3]


def main():
    s = open(PROV).read()
    provs = json.loads(s[s.index('['):s.rindex(']') + 1])
    jobs = {p['slug']: p['website'] for p in provs if p.get('website')}
    jobs.update(BUYERS)
    only = sys.argv[1:]
    if only:
        jobs = {k: v for k, v in jobs.items() if k in only}
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for r in ex.map(lambda kv: fetch(*kv), jobs.items()):
            results.append(r)
            print(r[0].ljust(36), 'OK %spx' % r[2] if r[1] else 'MISS', r[1] or '')
    ok = [r for r in results if r[1]]
    print('\n%d of %d logos saved' % (len(ok), len(results)))


if __name__ == '__main__':
    main()
