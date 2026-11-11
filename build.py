"""Construiește un singur fișier HTML (totul inclus, funcționează și fără internet).
   python3 build.py  ->  dist/simulator-miscari-aparat.html  (+ dist/artifact.html pentru previzualizare)"""
import re, pathlib

root = pathlib.Path(__file__).parent
html = (root / 'index.html').read_text(encoding='utf-8')

def inline_css(m):
    return '<style>\n' + (root / m.group(1)).read_text(encoding='utf-8') + '\n</style>'

def inline_js(m):
    src = (root / m.group(1)).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>\n' + src + '\n</script>'

html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)
html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

out = root / 'dist'
out.mkdir(exist_ok=True)
(out / 'simulator-miscari-aparat.html').write_text(html, encoding='utf-8')

# varianta pentru previzualizare: fără <!doctype>/<html>/<head>/<body> (le adaugă găzduirea)
art = re.sub(r'<!doctype html>\s*<html[^>]*>\s*<head>', '', html, flags=re.I)
art = art.replace('</head>\n<body>', '').replace('</body>\n</html>', '')
art = re.sub(r'<meta (charset|name="viewport")[^>]*>\n', '', art)
(out / 'artifact.html').write_text(art, encoding='utf-8')
print('ok', len(html) // 1024, 'KB')
