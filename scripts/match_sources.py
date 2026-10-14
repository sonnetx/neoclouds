"""Match each profile sentence and key figure to the cited pages that support it.

A sentence with numbers is supported when the cited pages together contain at
least 80% of its numbers, matched with their units (so 6 GW must appear as 6 GW
or 6 gigawatts). Years count only when a sentence has no other numbers. A
sentence without numbers is supported when one page contains at least two of
its distinctive names. Results go to citations.json for the page and to a
review report for anything a downloaded page does not support.
"""
import hashlib, json, math, os, re, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from match_tokens import tokens

ROOT = os.path.dirname(HERE) + '/'
# srccache/ holds the fetched page text (see fetch_sources.py). It is not committed.
CACHE = ROOT + 'srccache/'
S = ROOT + 'overrides/'
PROV = os.environ.get('NEOCLOUD_PROV', ROOT + 'providers.js')
CITES_OUT = os.environ.get('NEOCLOUD_CITES_OUT', ROOT + 'citations.js')
FIELDS = ['snippet', 'origin', 'today', 'platform', 'outlook']
COMMON = set('''which their there about after where while would could should these those other being since under
company companies through between before again into using based offers offer sells sells also built build builds runs
began started first later added customers customer service services capacity platform cloud clouds compute'''.split())
STOP = set('''The A An And Or In On At Of For To By With From As Its It Is Are Was Were Has Had Have This That These Those Which Who
What When Where While After Before Since Until Into Over Under About Also Both Each Every Most More Many Much Some Any Other
Such Than Then There Their They Them Our We He She His Her One Two Three Four Five Six Seven Eight Nine Ten First Second Third
January February March April May June July August September October November December Jan Feb Mar Apr Jun Jul Aug Sep Sept Oct Nov Dec
Q1 Q2 Q3 Q4 US USD GPU GPUs AI CEO CTO Inc Ltd LLC Corp Corporation Company Group Cloud Founded Launched Parent Headquarters'''.split())


def key(url):
    return hashlib.sha1(url.encode()).hexdigest()[:16]


def split_sentences(t):
    parts = re.sub(r'([.!?])\s+(?=[A-Z0-9$\u20ac])', '\\1\u0001', t or '').split('\u0001')
    return [p for p in parts if p.strip()]


def names(s, own):
    words = re.findall(r"[A-Z][A-Za-z0-9&'\-]{2,}|[A-Z]{2,}[0-9A-Za-z\-]*", s)
    out = []
    for w in words:
        w = w.strip("'")
        if w in STOP or w.lower() in own:
            continue
        out.append(w)
    return list(dict.fromkeys(out))


def load(url):
    k = key(url)
    try:
        rec = json.load(open(CACHE + k + '.json'))
    except FileNotFoundError:
        return False, ''
    text = open(CACHE + k + '.txt').read() if rec['ok'] else ''
    text = re.sub(r'(?<=\d),(?=\d{3}\b)', '', text)
    return bool(rec['ok']), text


def assess(unit, srcs, own, is_fact=False):
    toks, years = tokens(unit)
    nm = names(unit.split(':', 1)[1] if is_fact and ':' in unit else unit, own)
    if not toks and years and (is_fact or not nm):
        toks = years
    okset = [i for i, (ok, _) in enumerate(srcs) if ok]
    anyfail = any(not ok for ok, _ in srcs)
    if toks:
        need = max(1, math.ceil(0.8 * len(toks)))
        covered, cites = set(), []
        while len(cites) < 3:
            best, gain = None, set()
            for i in okset:
                g = {j for j, (_, rx) in enumerate(toks) if j not in covered and rx.search(srcs[i][1])}
                if len(g) > len(gain):
                    best, gain = i, g
            if best is None:
                break
            covered |= gain
            cites.append(best)
            if len(covered) == len(toks):
                break
        if len(covered) >= need:
            return 'supported', cites
        return ('unknown' if anyfail else 'unsupported'), cites
    if not nm:
        # Descriptive sentences: cite the page that shares the most content words.
        words = [w for w in re.findall(r'[a-z]{5,}', unit.lower()) if w not in own and w not in COMMON]
        words = list(dict.fromkeys(words))
        best, score = None, 0
        for i in okset:
            low = srcs[i][1].lower()
            sc = sum(1 for w in words if w in low)
            if sc > score:
                best, score = i, sc
        if words and score >= max(2, math.ceil(0.5 * len(words))):
            return 'supported', [best]
        return 'nothing-to-check', []
    need = 2 if len(nm) >= 2 else 1
    best, score = None, 0
    for i in okset:
        sc = sum(1 for w in nm if w in srcs[i][1])
        if sc > score:
            best, score = i, sc
    if score >= need:
        return 'supported', [best]
    return ('unknown' if anyfail else 'unsupported'), []


def main():
    s = open(PROV).read()
    provs = json.loads(s[s.index('['):s.rindex(']') + 1])
    out, report, tally = {}, [], Counter()
    try:
        forced = json.load(open(S + 'forced_cites.json'))
    except FileNotFoundError:
        forced = {}
    # Hand-checked citations for sentences reworded after verification.
    try:
        for slug, kinds in json.load(open(S + 'manual_cites.json')).items():
            for kind, m in kinds.items():
                forced.setdefault(slug, {}).setdefault(kind, {}).update(m)
    except FileNotFoundError:
        pass
    for p in provs:
        own = set(w.lower() for w in re.findall(r'[A-Za-z0-9]+', p['name'] + ' ' + (p.get('aka') or '')))
        srcs = [load(src['url']) for src in p['sources']]
        urls = [src['url'] for src in p['sources']]
        fz = forced.get(p['slug'], {})
        entry = {'fields': {}, 'facts': []}
        for f in FIELDS:
            cites = []
            for sent in split_sentences(p.get(f)):
                st, c = assess(sent, srcs, own)
                fu = fz.get('sentences', {}).get(sent)
                if fu in urls:
                    c = sorted(set((c if st == 'supported' else []) + [urls.index(fu)]))
                    st = 'supported'
                tally[st] += 1
                cites.append(c if st == 'supported' else [])
                if st in ('unsupported', 'unknown'):
                    report.append((p['slug'], f, st, sent))
            entry['fields'][f] = cites
        for fact in p.get('facts', []):
            st, c = assess(fact['label'] + ': ' + fact['value'], srcs, own, True)
            fu = fz.get('facts', {}).get(fact['label'])
            if fu in urls:
                c = sorted(set((c if st == 'supported' else []) + [urls.index(fu)]))
                st = 'supported'
            tally['fact-' + st] += 1
            entry['facts'].append(c if st == 'supported' else [])
            if st in ('unsupported', 'unknown'):
                report.append((p['slug'], 'fact', st, fact['label'] + ' = ' + fact['value']))
        entry['fetched'] = sum(ok for ok, _ in srcs)
        entry['total'] = len(srcs)
        out[p['slug']] = entry
    json.dump(out, open(CACHE + 'citations.json', 'w'))
    slim = {k: {'fields': v['fields'], 'facts': v['facts']} for k, v in out.items()}
    with open(CITES_OUT, 'w') as f:
        f.write('// Which source supports each profile sentence and key figure. Indexes point into each profile\'s sources.\n')
        f.write('window.NEOCLOUD_CITES = ' + json.dumps(slim, separators=(',', ':')) + ';\n')
    with open(CACHE + 'citation_report.txt', 'w') as f:
        for r in report:
            f.write('%-24s %-8s %-12s %s\n' % r)
    print(dict(tally))
    print(len(report), 'items to review, written to citation_report.txt')


if __name__ == '__main__':
    main()
