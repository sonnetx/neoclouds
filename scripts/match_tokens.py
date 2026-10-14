"""Unit-aware evidence tokens, shared by the source matcher."""
import re

UNIT_PATTERNS = [
    (r'(?:B|bn|billion)\b', r'\s?(?:B|bn|billion)\b'),
    (r'(?:M|mn|million)\b', r'\s?(?:M|mn|million)\b'),
    (r'(?:GW|gigawatts?)\b', r'\s?(?:GW|gigawatts?)\b'),
    (r'(?:MW|megawatts?)\b', r'\s?(?:MW|megawatts?)\b'),
    (r'(?:%|percent\b)', r'\s?(?:%|percent\b|per cent\b)'),
    (r'(?:x)\b', r'\s?(?:x|times)\b'),
    (r'(?:trillion)\b', r'\s?(?:trillion|T)\b'),
]
NUM = re.compile(r'(?<![\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)')


def tokens(s):
    """Return (tokens, year_tokens). Each token is (label, compiled regex)."""
    out, years = [], []
    for m in NUM.finditer(s):
        raw = m.group(1)
        num = raw.replace(',', '').rstrip('.')
        after = s[m.end():m.end() + 14]
        unit_rx = None
        for u, rx in UNIT_PATTERNS:
            if re.match(r'\s?' + u, after, re.I):
                unit_rx = rx
                break
        if re.fullmatch(r'(19|20)\d\d', num) and not unit_rx:
            years.append((num, re.compile(r'(?<![\d.])' + num + r'(?![\d])')))
            continue
        small = re.fullmatch(r'\d', num) or num in ('10', '11', '12')
        if unit_rx:
            body = re.escape(num)
            rx = re.compile(r'(?<![\d.])' + body + unit_rx, re.I)
            out.append((num + after.split(' ')[0][:3], rx))
        elif not small:
            out.append((num, re.compile(r'(?<![\d.])' + re.escape(num) + r'(?![\d])')))
    return out, years
