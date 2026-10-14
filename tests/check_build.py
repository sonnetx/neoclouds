"""Fail when providers.js is stale or the research data breaks the house rules.

providers.js is checked in because GitHub Pages serves it directly, so research
or override edits that were never built would deploy nothing. This rebuilds it
into a temporary file, compares the result and reports any lint issues.
"""
import os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with tempfile.TemporaryDirectory() as tmp:
    out = os.path.join(tmp, 'providers.js')
    run = subprocess.run([sys.executable, os.path.join(ROOT, 'scripts', 'build_providers.py'), '--write'],
                         env=dict(os.environ, NEOCLOUD_OUT=out), capture_output=True, text=True)
    print(run.stdout.strip())
    if run.returncode:
        print(run.stderr)
        sys.exit('build_providers.py failed')
    summary = [line for line in run.stdout.splitlines() if 'lint issues' in line]
    if not summary or not summary[0].endswith(' 0 lint issues'):
        sys.exit('The research data has lint issues. Fix them in research/ or overrides/.')
    built = open(out, encoding='utf-8').read()
    if built != open(os.path.join(ROOT, 'providers.js'), encoding='utf-8').read():
        sys.exit("providers.js is stale. Run 'python3 scripts/build_providers.py --write' and commit the result.")

print('providers.js is up to date')

# The page shows the provider count before JavaScript runs, and in its search and share
# descriptions, so every hard-coded count must match the data.
count = built.count('"slug": ')
page = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
stated = re.findall(r'data-count>(\d+)<', page) + re.findall(r'profiles of (\d+) providers', page)
wrong = sorted(set(n for n in stated if int(n) != count))
if wrong:
    sys.exit('index.html states %s providers but the data has %d. Update the counts.' % (', '.join(wrong), count))
print('index.html counts match %d providers' % count)

# Prices come from providers' own rate cards, never from price aggregators.
AGGREGATORS = ('getdeploying.com', 'vantage.sh', 'uvik.net', 'intuitionlabs.ai', 'computeprices.com')
for name in ('index.html', 'guide.js', 'background.js', 'providers.js'):
    text = open(os.path.join(ROOT, name), encoding='utf-8').read().lower()
    found = [a for a in AGGREGATORS if a in text]
    if found:
        sys.exit('%s cites a price aggregator (%s). Use the provider\'s own rate card instead.' % (name, ', '.join(found)))
print('no price aggregators cited')
