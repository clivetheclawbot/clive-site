#!/usr/bin/env python3
"""Inject the real layout CSS into the print probe page.

Reads the <style> block from _layouts/default.html and wraps
tools/print-probe.html in it, so the Chrome print render exercises the
site's genuine stylesheet (including the paper-service block).
"""
import re

layout = open("_layouts/default.html", encoding="utf-8").read()
match = re.search(r"<style>([\s\S]*?)</style>", layout)
if not match:
    raise SystemExit("no <style> block found in _layouts/default.html")
css = match.group(1)

probe = open("tools/print-probe.html", encoding="utf-8").read()
bare = '<meta charset="utf-8">'
if "<style>" not in probe:
    probe = probe.replace(bare, bare + "<style>" + css + "</style>")
open("tools/print-probe.html", "w", encoding="utf-8").write(probe)
print("css bytes:", len(css))