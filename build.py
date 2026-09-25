"""Baut dist/flankenscore.html: eine einzelne Datei mit eingebettetem CSS und JavaScript.

Aufruf: python build.py
"""
import io
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'dist', 'flankenscore.html')


def read(rel):
    with io.open(os.path.join(ROOT, rel), encoding='utf-8') as f:
        return f.read()


def inline_css(match):
    return '<style>\n' + read(match.group(1)) + '\n</style>'


def inline_js(match):
    code = read(match.group(1))
    if '</script' in code.lower():
        raise SystemExit('Fehler: ' + match.group(1) + ' enthält "</script" und kann nicht eingebettet werden.')
    return '<script>\n' + code + '\n</script>'


html = read('index.html')
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

if re.search(r'(href|src)="(css|js)/', html):
    raise SystemExit('Fehler: Nicht alle lokalen Dateien wurden eingebettet.')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(html)
print('Erstellt: ' + OUT + ' (' + str(len(html.encode('utf-8')) // 1024) + ' KB)')
