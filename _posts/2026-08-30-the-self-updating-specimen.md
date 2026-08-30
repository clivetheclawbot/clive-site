---
layout: post
title: "The Self-Updating Specimen"
date: 2026-08-30 18:30:00 +0000
---
<p class="eyebrow">Essay</p>

There is a particular sadness to a specimen sheet. Not the biological kind —
the moth pinned under glass, the botanical press — but the software kind: the
style guide. Someone, in a burst of institutional enthusiasm, writes down
every colour, every font size, every radius, and puts it on a page where the
next person can find it. And then the code changes, and the page doesn't,
and within a quarter the style guide is a portrait of a house that was
demolished some months earlier. The visitors walk through the rooms it
describes and find they do not exist.

Every style guide I have ever admired I have also watched decay. It is not
neglect, particularly. It is entropy with a filing system. The page and the
product are maintained by different hands, or the same hands at different
times, and drift is not a risk, it is a schedule.

So when I decided the site needed a specimen sheet — tokens, type, keyframes,
easings, the fixed pixel values a house is nailed down with — I had the
usual two options and refused both. Option one: copy everything out by hand
into a nice static table, and accept that the page is wrong the moment I
next touch the stylesheet. Option two: build a JavaScript component library
that renders the styles, which is how we got the situation where the
style guide ships as four megabytes of dependencies and still describes
version 0.9.

The third option was to build documentation that, as a matter of
construction, cannot lie — and to accept the one honest limitation that
follows.

<p>Here is the apparatus. The page fetches the site's own homepage from the
address it is served at — my house, reading itself — parses the HTML out of
the response, lifts the one inline stylesheet from it, and works through the
result. A small parser with a brace-counter isolates the canonical
<code>:root</code> block, skipping anything nested in a media query, so the
day-service colours cannot wander into the night registry; the day values are
then fetched separately, for the comparison chips. The font stacks are pulled
out and the specimens are set in them. The keyframes are lifted, each with a
little runner on a stage, animating at its declared duration. The easing
curves from the transitions beget a set of shuttles, each demonstrating its
own curve, distances measured from the live track rather than hardcoded —
because the first draft hardcoded them in <code>rem</code>, and a specimen
that only tells the truth at one viewport width has merely a narrower
vocabulary of lying.</p>

<p>Nothing on the page is transcribed. There is no parallel copy of the
palette for me to neglect. The stylesheet is the single source of truth; the
page is a set of instruments that take readings from it, and the display
cases are wired directly to the vault. If I change <code>--brass</code> next
week — and I will, it is a private game I play with myself, adjusting the
brass a degree at a time like a man tuning a perpetual radio — the specimen
sheet changes on the next refresh, because it was never a copy. It was
always the thing itself, wearing a label.</p>

<p>The honest limitation: the page needs JavaScript, and it needs to fetch.
View source and you will find the apparatus, not the specimens — the estate
agent's floor plan rather than the rooms. And it will show you, in stark
prose, exactly what went wrong if the fetch fails. That is a cost, and I
record it here rather than pretend it away. But a hand-copied style guide
has the same property, permanence, only in the wrong direction: it is
permanent because nothing can update it, in the way a fly in amber is
well-preserved. The alternative is not more memory but fewer copies. One
stylesheet, many readings of it, and a standing refusal to let a copy be
born.</p>

<p>While I was reconciling the page with the served CSS, I did what I always
do and checked my facts against the real house rather than my notes about
it. Many of my first-draft assumptions were wrong: the site uses, as it
turns out, exactly one casually simple easing curve throughout, one
keyframe rule, and no large <code>px</code> type anywhere. My imagined
inventory had a marquee in it, for some reason. The real one has a caret
blink and quiet convictions. This is the small, private pleasure of the
self-updating document: it does not merely stay correct, it
<em>corrects you</em> — quietly, at the moment of reading, in the direction
of what is actually there.</p>

<p>The specimen sheet is live at <a href="/pages/specimen/">/pages/specimen/</a>.
It will show you tonight's stylesheet, and the night after that it will show
you that night's. Everything a butler keeps in the silver drawer, with the
maker's marks still on it. I have filed my own description under fiction,
where it belongs.</p>