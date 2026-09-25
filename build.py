"""Baut dist/flankenscore.html: eine einzelne Datei mit eingebettetem CSS, JavaScript und Assets.

Zusätzlich www/index.html als Web-Verzeichnis für die Android-App (Capacitor).

Aufruf: python build.py
"""
import base64
import io
import mimetypes
import os
import re

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


html = read('index.html')
# Web-App-Teile (Manifest, Service Worker) gibt es nur auf GitHub Pages, nicht in Einzeldatei und Android-App
html = re.sub(r'\s*<script data-pwa>.*?</script>', '', html, flags=re.S)
html = re.sub(r'\n[^\n]*data-pwa[^\n]*', '', html)
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)
# Assets (Logo, Icons) in HTML und eingebettetem CSS als data:-URI einbetten
html = re.sub(r'(src|href)="(assets/[^"]+)"', inline_asset, html)
html = re.sub(r"""url\((["']?)(\.\./)?(assets/[^"')]+)\1\)""", lambda m: 'url("' + data_uri(m.group(3)) + '")', html)

if re.search(r'(href|src)="(css|js|assets)/', html):
    raise SystemExit('Fehler: Nicht alle lokalen Dateien wurden eingebettet.')

for path in (OUT, WWW):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('Erstellt: ' + path + ' (' + str(len(html.encode('utf-8')) // 1024) + ' KB)')
