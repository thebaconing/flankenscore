"""Baut dist/flankenscore.html: eine einzelne Datei mit eingebettetem CSS, JavaScript und Assets.

Zusätzlich www/index.html als Web-Verzeichnis für die Android-App (Capacitor).

Bei jedem Build wird die Version erhöht (versionName +0.1, versionCode +1, Service-Worker-Cache +1)
und in package.json, README.md und DESIGN.md eingetragen.

Aufruf: python build.py            (mit Versionserhöhung)
        python build.py --no-bump  (ohne Versionserhöhung)
"""
import base64
import io
import mimetypes
import os
import re
import sys
from decimal import Decimal

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'dist', 'flankenscore.html')
WWW = os.path.join(ROOT, 'www', 'index.html')


def read(rel):
    with io.open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


MIME_TYPES = {'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon'}


def data_uri(rel):
    path = os.path.join(ROOT, rel)
    if not os.path.isfile(path):
        raise SystemExit('Fehler: Asset nicht gefunden: ' + rel)
    ext = os.path.splitext(rel)[1].lower()
    mime = MIME_TYPES.get(ext) or mimetypes.guess_type(rel)[0] or 'application/octet-stream'
    with open(path, 'rb') as f:
        return 'data:' + mime + ';base64,' + base64.b64encode(f.read()).decode('ascii')


def inline_asset(match):
    return match.group(1) + '="' + data_uri(match.group(2)) + '"'


def inline_css(match):
    return '<style>\n' + read(match.group(1)) + '\n</style>'


def inline_js(match):
    code = read(match.group(1))
    if '</script' in code.lower():
        raise SystemExit('Fehler: ' + match.group(1) + ' enthält "</script" und kann nicht eingebettet werden.')
    return '<script>\n' + code + '\n</script>'


def sub_file(rel, pattern, repl, count=1):
    text = read(rel)
    new, n = re.subn(pattern, repl, text, count=count)
    if not n:
        raise SystemExit('Fehler: Versionsangabe nicht gefunden in ' + rel + ': ' + pattern)
    with io.open(os.path.join(ROOT, rel), 'w', encoding='utf-8', newline='\n') as f:
        f.write(new)


def bump_version():
    gradle = read('android/app/build.gradle')
    code = int(re.search(r'versionCode (\d+)', gradle).group(1)) + 1
    name = str(Decimal(re.search(r'versionName "([\d.]+)"', gradle).group(1)) + Decimal('0.1'))
    sw = int(re.search(r"flankenscore-v(\d+)", read('sw.js')).group(1)) + 1

    sub_file('android/app/build.gradle', r'versionCode \d+', 'versionCode ' + str(code))
    sub_file('android/app/build.gradle', r'versionName "[\d.]+"', 'versionName "' + name + '"')
    sub_file('sw.js', r"flankenscore-v\d+", 'flankenscore-v' + str(sw))
    sub_file('package.json', r'"version": "[\d.]+"', '"version": "' + name + '.0"')
    sub_file('README.md', r'(App-Version \(`versionName`\) \| \*\*)[\d.]+', r'\g<1>' + name)
    sub_file('README.md', r'(Android `versionCode` \| \*\*)\d+', r'\g<1>' + str(code))
    sub_file('README.md', r'(npm-Version \| )[\d.]+', r'\g<1>' + name + '.0')
    sub_file('README.md', r'(Service-Worker-Cache \| `flankenscore-v)\d+', r'\g<1>' + str(sw))
    sub_file('README.md', r'(Aktuell: \*\*)[\d.]+ \(versionCode \d+\)', r'\g<1>' + name + ' (versionCode ' + str(code) + ')')
    sub_file('DESIGN.md', r'(\*\*App-Version:\*\* )[\d.]+ \(Android `versionCode` \d+\)',
             r'\g<1>' + name + ' (Android `versionCode` ' + str(code) + ')')
    print('Version: ' + name + ' (versionCode ' + str(code) + ', Cache flankenscore-v' + str(sw) + ')')


if '--no-bump' not in sys.argv:
    bump_version()

html = read('index.html')
# Web-App-Teile (Manifest, Service Worker) gibt es nur auf GitHub Pages, nicht in Einzeldatei und Android-App
html = re.sub(r'\s*<script data-pwa>.*?</script>', '', html, flags=re.S)
html = re.sub(r'\n[^\n]*data-pwa[^\n]*', '', html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
# Assets (Logo, Icons) in HTML und eingebettetem CSS als data:-URI einbetten
html = re.sub(r'(src|href)="(assets/[^"]+)"', inline_asset, html)
html = re.sub(r"""url\((["']?)(\.\./)?(assets/[^"')]+)\1\)""", lambda m: 'url("' + data_uri(m.group(3)) + '")', html)

# Regelwerk als data:-URI einbetten (Anker-Links funktionieren darin, anders als bei srcdoc)
rules = read('regelwerk.html')
rules = re.sub(r'\s*<link rel="icon"[^>]*>', '', rules)
rules_uri = 'data:text/html;charset=utf-8;base64,' + base64.b64encode(rules.encode('utf-8')).decode('ascii')
html, n = re.subn(r'data-src="regelwerk.html"', 'data-src="' + rules_uri + '"', html)
if not n:
    raise SystemExit('Fehler: Regelwerk-Platzhalter nicht gefunden in index.html.')

if re.search(r'(href|src)="(css|js|assets)/', html):
    raise SystemExit('Fehler: Nicht alle lokalen Dateien wurden eingebettet.')

for path in (OUT, WWW):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('Erstellt: ' + path + ' (' + str(len(html.encode('utf-8')) // 1024) + ' KB)')
