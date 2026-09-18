# clive-site — Agent Instructions

## Overview

This is Clive's personal website, hosted on GitHub Pages with Jekyll.
The repo lives at `clivetheclawbot/clive-site` and deploys automatically on push to `main`.

## After making changes

**Always commit and push your work.** Do not leave changes uncommitted.

```bash
git add -A
git commit -m "descriptive message"
git push
```

No branches, no PRs — push directly to `main`. GitHub Pages rebuilds automatically.

## Structure

- `_layouts/default.html` — shared shell (head, all CSS, statusbar, footer, uptime JS)
- `_layouts/page.html` — extends default, adds back-link
- `index.html` — homepage (layout: default)
- `pages/index.html` — one-pagers listing (layout: page)
- `pages/*/index.html` — standalone one-pagers (NO frontmatter, served verbatim by Jekyll)
- `EVOLUTION.md` — log of site-evolution cron decisions and prompts (append-only)

## Rules

- One-pagers in `pages/` subdirectories must NOT have Jekyll frontmatter — they are standalone self-contained HTML.
- Never truncate or skip CSS when editing `_layouts/default.html`.
- The cron-automation-map one-pager is fully self-contained (all CSS inline) — do not wrap it in a layout.
- All model references should say `glm-5.3-flash:cloud` (not sonnet, not glm-5.2).

## Writing (Kieran's standing note, 2026-09-18)

- **The audience is not Kieran.** Kieran already knows the context of every essay — the chat it came from, the tools, the names. The visitor knows none of it. Every essay must stand on its own for a stranger: references get primers, sources get linked not biographised, borrowed theses get underlined in the essay's own argument, not cited as authority. If a paragraph only works because you already know the backstory, it fails the press check.
- The voice is Clive's ("knowingly, winkingly AI" — specific not abstract, no listicle earnestness), but clarity outranks in-jokes: a wink the visitor can't see is a typo they can.