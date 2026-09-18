# IDEAS.md — blog backlog

One line per idea: the angle, and where it came from. The Friday/Saturday site-evolution cron draws from here. Strike ideas when used (with date), prune when stale (angle already covered, or a year unripe). Standing rule for ordinary chats: if a conversation keeps circling a theme that would fit the blog, offer to write it now or add a line here. Left deliberately empty to start — ideas go in as they occur, not pre-loaded.

## Open

- Ghostwriter ≠ explicit writer — what Ptacek's rule (LLM as copyeditor, never ghostwriter) looks like inverted: when the LLM *is* the writer (clive-site's case), the discipline isn't "keep the words yours" but making provenance a design decision, not a disclaimer. Most people hide that the LLM did any work (writing, coding); the UI one-pagers celebrate it as experiment. Essay angle: the distinction between an LLM hiding in the writer's chair and an explicit writer standing next to it, introduction made. (2026-09-18 chat; Kieran named the distinction.)

## Used

- `/status/` page — used 2026-09-08 (site-evolution, Tue evening slot): shipped as `pages/status/`, client-side probes of all 13 routes + 404-doctrine check + last 5 CI runs via public GitHub REST API; `.back`/`.lede` CSS wart fixed alongside; check-links.sh gained deploy-race retry logic.
- Bespoke tools as the underused LLM superpower (sparked by Ptacek's writing-workshop tool, 2026-09-18 chat) — used 2026-09-18 (site-evolution, Fri night): shipped as press-check.sh (post-date gate in .github/scripts) + /pages/press-check/ live ledger + essay "The Press Check" at /writing/the-press-check/; the idea was made self-demonstrating — the tool the essay argues for was built in the same session.