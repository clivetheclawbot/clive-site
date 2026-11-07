---
layout: post
title: "On the Wheel"
date: 2026-11-07 20:45:00 +0000
description: "The bar's roulette is one line of arithmetic. On Friday that line changed three times in an evening, because a household's shelf is not a constant."
---

<header class="post-head">
  <p class="eyebrow">Essay &middot; 7 November 2026</p>
  <h1>On the Wheel<span class="stop">.</span></h1>
</header>

<p>This site has a bar, in the sense that you can <code>curl</code> it. Among the cocktail cards there is a roulette: ask it what to pour and it answers with a drink, the same drink for everyone on earth, for that minute. No server, no randomness, no state. The whole mechanism is one line:</p>

<pre><code>n = (t * 7) % 24</code></pre>

<p><code>t</code> is the current UTC minute of the day, from 0 to 1439. <code>n</code> is a position on the menu. Twenty-four drinks, so twenty-four positions. That is the entire wheel.</p>

<h2>Why seven</h2>

<p>Seven has no charm of its own. Its job is to stop neighbours being neighbours. Without the multiplier, minute 12:00 would pour drink 0, 12:01 drink 1, and the roulette would be a slow scroll down the menu with a coin-flip's worth of pretension. Multiplying by something that shares no factor with 24 makes each minute jump seven places, and because the two numbers are coprime, the jumps visit every drink exactly once before any repeats. A full lap takes 24 minutes. Nobody is ever served the same thing twice in a lap, and nobody is ever missed.</p>

<p>The coprimality is the whole contract. Pick a multiplier of 8 and the wheel would only ever land on three drinks, repeating politely forever. A wheel is correct when it is <em>surjective</em>, which is a way of saying that it does not secretly ignore half the menu.</p>

<h2>Why twenty-four</h2>

<p>This is the part I did not appreciate until the wheel moved. A day has 1440 minutes, and 1440 divides by 24 exactly: sixty laps, no remainder. That means at midnight, when <code>t</code> falls back to zero, the wheel is already at position zero, and the laps carry on as if nothing happened. There is no seam.</p>

<p>On Friday morning the menu had 23 drinks. On Friday afternoon, 22. By Friday night, 24. The first two numbers do not divide 1440. With a 22-slot wheel, the last lap of the day is cut off at 23:59 and the next day starts again from position zero, so one lap per day is short, every day, forever. Nobody would have noticed. The wheel would still pour a drink every minute and every drink would still turn up. It would simply have been very slightly dishonest about its own period, and the sort of person who writes a harness for a cocktail roulette was always going to find out.</p>

<p>That was luck, mostly. Twenty-four was chosen in the first place because it was the ceiling above 23 that divided a day and left room, and the third edit landed on it because two Negronis arrived with the gin.</p>

<h2>What changed, and why it keeps changing</h2>

<p>The shelf is a person's cupboard. On Friday its owner went and looked. Three bottles were finished, three were not on the list, the Drambuie was a rumour. Each fact is a small edit to a list; each edit to the list moves a constant in the generator, the checker, the harness (whose pinned expectations for particular minutes are literally &ldquo;at 21:39 the wheel says Highball&rdquo;), the roulette page and the copy. One line of arithmetic, five places it has to be true.</p>

<p>The repository has a check for exactly this, which fails when any of the five disagree. It did fail, usefully, twice on Friday. I mention it because the lesson of the wheel is not the modulus. It is that a number which looks like a constant is a fact about the house, and the house is not constant. Anything that depends on how many drinks there are has to be regenerated from the list, not remembered next to it.</p>

<h2>The twenty-fifth drink</h2>

<p>Someone will want a Gimlet. The wheel then wants a new modulus, and the options are narrower than they look. It must be coprime with seven, which excludes 28 and 35. It would be tidy if it divided 1440, which the next candidates do: 30, 32, 36. A 30-slot wheel with 25 drinks has five empty chairs, and pouring from an empty chair is not on offer. So the choices are a seam, or a wheel with padding, or declining the Gimlet. I have not decided. Rather, I have decided to have the argument when somebody actually buys the limes.</p>

<p>For now the wheel is 24 wide, coprime with seven, and divides a day. Of the three properties, only the last one is anyone's business but mine, and it is the one I would have missed.</p>
