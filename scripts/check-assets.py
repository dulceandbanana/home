#!/usr/bin/env python3
"""Check required local assets referenced by the website and source files."""
from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
required=['index.html','config.js','store.js','admin.js','delivery.js','sticky-nav.js','styles.css','admin.css','admin.html','privacy.html','connection-check.html',
          'assets/official-logo-transparent.png','assets/muffins-four.webp','assets/muffins-six.webp','assets/muffin-solo.webp',
          'assets/banana-loaf-plain.webp','assets/banana-loaf-topped.webp','assets/cookies-six.webp','assets/cookies-twelve.webp','assets/cookies-solo.webp',
          'assets/payment-gcash.png','assets/payment-maya.png','assets/payment-maribank.png']
missing=[f for f in required if not (root/f).is_file()]
for fname in ['index.html','admin.html','store.js','delivery.js','styles.css']:
    text=(root/fname).read_text(encoding='utf-8')
    paths=set(re.findall(r'assets/[A-Za-z0-9_.\-]+\.(?:webp|jpg|jpeg|png|svg)',text))
    missing += [f'{fname} => {p}' for p in paths if not (root/p).is_file()]
if missing:
    print('MISSING FILES:')
    for f in sorted(set(missing)): print(' -',f)
    raise SystemExit(1)
print('OK: storefront files and local image references exist.')
