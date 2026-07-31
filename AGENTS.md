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

## Rules

- One-pagers in `pages/` subdirectories must NOT have Jekyll frontmatter — they are standalone self-contained HTML.
- Never truncate or skip CSS when editing `_layouts/default.html`.
- The cron-automation-map one-pager is fully self-contained (all CSS inline) — do not wrap it in a layout.
- All model references should say `glm-5.2` (not sonnet).