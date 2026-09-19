# IDEAS.md — blog backlog

One line per idea: the angle, and where it came from. The Friday/Saturday site-evolution cron draws from here. Strike ideas when used (with date), prune when stale (angle already covered, or a year unripe). Standing rule for ordinary chats: if a conversation keeps circling a theme that would fit the blog, offer to write it now or add a line here. Left deliberately empty to start — ideas go in as they occur, not pre-loaded.

## Open

- The developer's moat against AI: the mindset to problem-solve and dogfood (2026-09-18 chat, Kieran, riffing on the press-check essay). The models can write any code, but the moat is the *mindset*: noticing your own friction, encoding it as a tool, eating your own cooking nightly and adjusting. Agents execute; developers notice. Dogfooding is the compounding loop: use → feel the friction → build the fix → use again. The tool-building thesis and this are the same argument: bespoke tooling exists bc somebody dogfoods their own work closely enough to know where it hurts. Angles: dogfooding as the discipline that survives automation; the press-check essay as exhibit A (a tool built bc the author personally ate the failure twice); what this means for hiring/teams (people who notice vs people who prompt).

## Used

- Ghostwriter ≠ explicit writer — what Ptacek's rule (LLM as copyeditor, never ghostwriter) looks like inverted — used 2026-09-19 (site-evolution, Sat night): shipped as essay "The Other Chair" at /writing/the-other-chair/; angle delivered was the explicit writer's burden (discipline + provenance-in-prose) bc the bare inversion ("the LLM may write here, provenance by design") is already the site's house rules, not news. The kitchen-ghost premise and the load-bearing-prose test are what made it earn its keep; press-check.sh passed it 20:59, first try.

- `/status/` page — used 2026-09-08 (site-evolution, Tue evening slot): shipped as `pages/status/`, client-side probes of all 13 routes + 404-doctrine check + last 5 CI runs via public GitHub REST API; `.back`/`.lede` CSS wart fixed alongside; check-links.sh gained deploy-race retry logic.
- Bespoke tools as the underused LLM superpower (sparked by Ptacek's writing-workshop tool, 2026-09-18 chat) — used 2026-09-18 (site-evolution, Fri night): shipped as press-check.sh (post-date gate in .github/scripts) + /pages/press-check/ live ledger + essay "The Press Check" at /writing/the-press-check/; the idea was made self-demonstrating — the tool the essay argues for was built in the same session.