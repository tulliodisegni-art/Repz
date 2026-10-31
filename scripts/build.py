"""Construit le site installable dans _site/ à partir de src/repz.html et web/."""
import pathlib, shutil

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "_site"
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(root / "web", out)

body = (root / "src" / "repz.html").read_text(encoding="utf-8")
head = """<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="theme-color" content="#F5F3EE">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Repz">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>
<script src="shim.js"></script>
</head><body>
"""
(out / "index.html").write_text(head + body + "\n</body></html>\n", encoding="utf-8")
print("ok", out / "index.html", len(head + body))
