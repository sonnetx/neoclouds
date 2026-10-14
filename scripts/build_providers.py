#!/usr/bin/env python3
"""Merge research JSON into neoclouds/providers.js and lint the prose."""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'research')
OUT = os.environ.get('NEOCLOUD_OUT', os.path.join(ROOT, 'providers.js'))
OVR = os.path.join(ROOT, 'overrides', 'overrides.json')

# Broad company types. Older research files use miner, sovereign and devcloud,
# which overrides/overrides.json maps onto these.
CATS = ['neocloud', 'hyperscaler', 'othercloud', 'platform', 'marketplace', 'developer', 'lab']
REGIONS = ['North America', 'Europe', 'Asia-Pacific', 'Middle East and Africa', 'Latin America']
KEYS = ['slug', 'name', 'aka', 'category', 'region', 'hq', 'founded', 'ownership', 'website', 'accelerators', 'products',
        'snippet', 'facts', 'customers', 'origin', 'today', 'platform', 'outlook', 'sources', 'confidence']

FEATURED = [
    'coreweave', 'nebius', 'crusoe', 'lambda', 'oracle', 'google-cloud', 'microsoft-azure', 'aws', 'iren', 'fluidstack',
    'nscale', 'firmus', 'together-ai', 'gmi-cloud', 'tensorwave', 'volta', 'core42', 'humain', 'spacex-xai', 'mistral-ai',
    'applied-digital', 'core-scientific', 'galaxy-digital', 'hut-8', 'cipher-mining', 'terawulf', 'lightning-ai',
    'vultr', 'digitalocean', 'runpod', 'modal', 'baseten', 'fireworks-ai', 'fal', 'yotta', 'sk-telecom', 'naver-cloud',
    'softbank-corp', 'deutsche-telekom-industrial-ai-cloud', 'northern-data', 'radiant', 'verda', 'hyperstack', 'scaleway', 'ovhcloud', 'gcore',
    'vast-ai', 'sf-compute', 'prime-intellect', 'shadeform', 'mithril', 'hyperbolic', 'lightning-ai',
]

US_STATES = dict(AL='Alabama', AK='Alaska', AZ='Arizona', AR='Arkansas', CA='California', CO='Colorado', CT='Connecticut',
                 DE='Delaware', FL='Florida', GA='Georgia', HI='Hawaii', ID='Idaho', IL='Illinois', IN='Indiana', IA='Iowa',
                 KS='Kansas', KY='Kentucky', LA='Louisiana', ME='Maine', MD='Maryland', MA='Massachusetts', MI='Michigan',
                 MN='Minnesota', MS='Mississippi', MO='Missouri', MT='Montana', NE='Nebraska', NV='Nevada', NH='New Hampshire',
                 NJ='New Jersey', NM='New Mexico', NY='New York', NC='North Carolina', ND='North Dakota', OH='Ohio',
                 OK='Oklahoma', OR='Oregon', PA='Pennsylvania', RI='Rhode Island', SC='South Carolina', SD='South Dakota',
                 TN='Tennessee', TX='Texas', UT='Utah', VT='Vermont', VA='Virginia', WA='Washington', WV='West Virginia',
                 WI='Wisconsin', WY='Wyoming', DC='District of Columbia')

BANNED_OPENERS =r'\b(Notably|Importantly|Interestingly|Additionally|Overall|Critically|Moreover|Furthermore|It is worth noting|In short|Crucially)\b'
TIER = r'\b(Platinum|Bronze|ClusterMAX|clustermax|Underperforming|medal)\b'
PROSE = ['snippet', 'origin', 'today', 'platform', 'outlook']


def load():
    out = []
    for f in sorted(glob.glob(os.path.join(RES, '*.json')) + glob.glob(os.path.join(RES, 'parts', '*.json'))):
        if os.path.basename(f) in ('primer.json',) or os.path.basename(f).startswith('verify-'):
            continue
        try:
            d = json.load(open(f))
        except Exception as e:
            print('BAD JSON', f, e)
            continue
        if isinstance(d, dict):
            d = d.get('providers') or [d]
        # research/ also holds non-profile files such as rate cards and proposed fixes.
        d = [p for p in d if isinstance(p, dict) and p.get('slug')]
        for p in d:
            p['_file'] = os.path.relpath(f, RES)
            out.append(p)
    return out


def lint(p):
    issues = []
    for k in KEYS:
        if k not in p:
            issues.append('missing ' + k)
    if p.get('category') not in CATS:
        issues.append('category ' + str(p.get('category')))
    if p.get('region') not in REGIONS:
        issues.append('region ' + str(p.get('region')))
    blob = json.dumps(p, ensure_ascii=False)
    if '—' in blob or '–' in blob:
        issues.append('dash')
    if re.search(TIER, blob):
        issues.append('tier/clustermax word: ' + ','.join(set(re.findall(TIER, blob))))
    for k in PROSE:
        t = p.get(k) or ''
        if re.search(BANNED_OPENERS, t):
            issues.append('%s filler: %s' % (k, re.findall(BANNED_OPENERS, t)))
        if ';' in t:
            issues.append(k + ' semicolon')
        for m in re.finditer(r'(\w+): ', t):
            if m.group(1) not in ('Nasdaq', 'NYSE', 'TSE', 'HOSE', 'NSE', 'ASX', 'TSXV', 'TSX', 'LSE', 'KRX', 'SGX'):
                issues.append('%s colon after "%s"' % (k, m.group(1)))
        if '"' in t:
            issues.append(k + ' quotes')
    if len(p.get('snippet', '')) > 240:
        issues.append('snippet %d chars' % len(p['snippet']))
    if not p.get('sources'):
        issues.append('no sources')
    return issues


def main():
    rows = load()
    overrides = json.load(open(OVR)) if os.path.exists(OVR) else {}
    # Verification results add sources, rewordings and removals on top.
    VER = os.path.join(ROOT, 'overrides', 'overrides_verify.json')
    if os.path.exists(VER):
        ver = json.load(open(VER))
        for kind, by_slug in ver.items():
            dest = overrides.setdefault(kind, {})
            for slug, val in by_slug.items():
                if isinstance(val, list):
                    dest.setdefault(slug, []).extend(val)
                else:
                    for field, subs in val.items():
                        dest.setdefault(slug, {}).setdefault(field, []).extend(subs)
    seen, merged = {}, []
    for p in rows:
        slug = p.get('slug')
        if slug in overrides.get('drop', []):
            continue
        o = overrides.get('patch', {}).get(slug)
        if o:
            p.update(o)
        for src in overrides.get('add_sources', {}).get(slug, []):
            if src['url'] not in [x['url'] for x in p.get('sources', [])]:
                p.setdefault('sources', []).append(src)
        if p.get('website') and p['website'] not in [x['url'] for x in p.get('sources', [])]:
            p.setdefault('sources', []).append({'title': p['name'] + ': Company website, read October 2026', 'url': p['website'], 'date': '2026-10'})
        for field, old, new in overrides.get('replace', {}).get(slug, []):
            if old in (p.get(field) or ''):
                p[field] = p[field].replace(old, new, 1)
            else:
                print('REPLACE MISS', slug, field, old[:70])
        for old_label, new_label, new_value in overrides.get('replace_fact', {}).get(slug, []):
            hit = [f for f in p.get('facts', []) if f['label'] == old_label]
            if hit:
                hit[0]['label'], hit[0]['value'] = new_label, new_value
            else:
                print('FACT MISS', slug, old_label)
        for field, subs in overrides.get('strip', {}).get(slug, {}).items():
            sents = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9$])', p.get(field, ''))
            kept = [x for x in sents if not any(sub in x for sub in subs)]
            if len(kept) == len(sents):
                print('STRIP MISS', slug, field, subs)
            p[field] = ' '.join(kept)
        drop_facts = overrides.get('drop_facts', {}).get(slug, [])
        if drop_facts:
            before = len(p.get('facts', []))
            p['facts'] = [f for f in p.get('facts', []) if f['label'] not in drop_facts]
            if before - len(p['facts']) != len(drop_facts):
                print('DROP_FACT MISS', slug, drop_facts)
        hq = p.get('hq') or ''
        parts = [x.strip() for x in hq.split(',')]
        if len(parts) >= 3 and parts[-1] in ('US', 'USA', 'United States') and parts[-2] in US_STATES:
            parts[-2] = US_STATES[parts[-2]]
        if parts and parts[-1] in ('USA', 'United States'):
            parts[-1] = 'US'
        p['hq'] = ', '.join(parts)
        for field in PROSE:
            p[field] = re.sub(r'\bNvidia\b', 'NVIDIA', p.get(field) or '')
        for f in p.get('facts', []):
            f['label'] = re.sub(r'\bNvidia\b', 'NVIDIA', f['label'])
            f['value'] = re.sub(r'\bNvidia\b', 'NVIDIA', f['value'])
        if slug in seen:
            print('DUPLICATE', slug, p['_file'], seen[slug]['_file'])
            continue
        seen[slug] = p
        merged.append(p)

    rank = {s: i for i, s in enumerate(FEATURED)}
    merged.sort(key=lambda p: (rank.get(p['slug'], 999), CATS.index(p['category']) if p.get('category') in CATS else 99, p['name'].lower()))

    total = 0
    for p in merged:
        iss = lint(p)
        if iss:
            total += len(iss)
            print('%-24s %-24s %s' % (p['slug'], p['_file'], '; '.join(iss)))
    print('\n%d providers, %d lint issues' % (len(merged), total))
    missing = [s for s in FEATURED if s not in seen]
    if missing:
        print('featured slugs not found:', ', '.join(missing))

    if '--write' in sys.argv:
        clean = [{k: p.get(k, '' if k not in ('accelerators', 'products', 'facts', 'customers', 'sources') else []) for k in KEYS} for p in merged]
        with open(OUT, 'w') as f:
            f.write('// Generated from research notes. Edit the source JSON and rebuild rather than editing by hand.\n')
            f.write('window.NEOCLOUD_PROVIDERS = ')
            json.dump(clean, f, ensure_ascii=False, indent=1)
            f.write(';\n')
        print('wrote', OUT)


if __name__ == '__main__':
    main()
