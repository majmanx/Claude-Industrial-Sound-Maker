#!/usr/bin/env python3
"""
Bundle the app into one self-contained HTML file (dist/industrial-sound-maker.html):
fonts, styles and scripts inlined. Handy for hosting anywhere that serves a single page.
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda rel: open(os.path.join(ROOT, rel), encoding='utf-8').read()

html = read('index.html')
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', '', body)
js = '\n'.join(read(f'js/{f}') for f in ('i18n.js', 'synth.js', 'pixel.js', 'app.js'))
css = read('css/fonts.css') + '\n' + read('css/style.css')

out = f"""<title>工业声音生成器</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;600&display=swap" rel="stylesheet">
<style>
{css}
html, body {{ background: var(--bg); }}
</style>
{body}
<script>
{js}
</script>
"""
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
path = os.path.join(ROOT, 'dist', 'industrial-sound-maker.html')
with open(path, 'w', encoding='utf-8') as f:
    f.write(out)
print(f'wrote {path} ({len(out.encode()) // 1024} KB)')
