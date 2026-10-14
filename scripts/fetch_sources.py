"""Download the text of every source cited in the provider profiles.

Each page is cached as plain text under srccache/ keyed by a hash of its URL,
with a status file so blocked or failed fetches are recorded rather than retried.
"""
import concurrent.futures, hashlib, html, io, json, os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
CACHE = ROOT + 'srccache/'
PROV = ROOT + 'providers.js'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
os.makedirs(CACHE, exist_ok=True)


def key(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def to_text(body, ctype):
    if 'pdf' in ctype or body[:4] == b'%PDF':
        try:
            from pypdf import PdfReader
            return '\n'.join((p.extract_text() or '') for p in PdfReader(io.BytesIO(body)).pages[:40])
        except Exception:
            return ''
    t = body.decode('utf-8', 'ignore')
    t = re.sub(r'(?is)<(script|style|noscript)[^>]*>.*?</\1>', ' ', t)
    t = re.sub(r'(?s)<[^>]+>', ' ', t)
    t = html.unescape(t)
    return re.sub(r'\s+', ' ', t)


def fetch(url):
    k = key(url)
    if os.path.exists(CACHE + k + '.json'):
        return json.load(open(CACHE + k + '.json'))
    rec = {'url': url, 'ok': False, 'status': None, 'chars': 0}
    try:
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*',
                                                   'Accept-Language': 'en-US,en;q=0.9'})
        with urllib.request.urlopen(req, timeout=25) as r:
            body = r.read(12_000_000)
            rec['status'] = r.status
            text = to_text(body, r.headers.get('Content-Type', ''))
    except urllib.error.HTTPError as e:
        rec['status'] = e.code
        text = ''
    except Exception as e:
        rec['status'] = type(e).__name__
        text = ''
    # Pages that only return a bot wall or a script shell count as failed.
    if len(text) > 1500 and not re.search(r'(?i)(enable javascript|are you a robot|access denied|captcha|unusual traffic)', text[:3000]):
        rec['ok'] = True
    rec['chars'] = len(text)
    open(CACHE + k + '.txt', 'w').write(text)
    json.dump(rec, open(CACHE + k + '.json', 'w'))
    return rec


def main():
    s = open(PROV).read()
    provs = json.loads(s[s.index('['):s.rindex(']') + 1])
    urls = sorted({src['url'] for p in provs for src in p['sources']})
    print(len(urls), 'unique source URLs')
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
        recs = list(ex.map(fetch, urls))
    ok = sum(r['ok'] for r in recs)
    print('%d fetched with text, %d failed or blocked' % (ok, len(recs) - ok))
    from collections import Counter
    print(Counter(str(r['status']) for r in recs if not r['ok']).most_common(10))


if __name__ == '__main__':
    main()
