# Claude's ideas: making Amanuensis quietly compelling

For one author who asked for it. "Secret" means ambient: the app pulls, it never pushes. No guilt, no streak loss, no nagging. The word guard is untouched, and everything stays local.

What already exists: re-entry to your last place, notes for next time, the breadcrumb, sprints, a quiet Today line, Progress, Training, and the cover shelf.

## The core loop

The aim is a loop: **cue → easy start → small win → unfinished thread → cue**. Most of the ideas below strengthen one link in it.

---

### 1. Stop mid-sentence (Hemingway's bridge)
- **Experience.** When you end a session, the app quietly keeps the last half-sentence you dictated as tomorrow's opening line. It shows it in grey at the caret, and you start by speaking the rest of it.
- **Mechanism.** The Zeigarnik effect: unfinished tasks stay active in memory and pull you back. Hemingway's habit of stopping while he knew what came next. It also lowers the cost of starting to almost nothing.
- **Fit.** `lib/habits.js` (`noteToShow`) and the re-entry code in `renderer/app.js`. It uses the last passage's text only, read-only.
- **Effort.** S.
- **Backfire risk.** It becomes annoying if it always fires. It should appear only when you stopped mid-flow, not when you finished a scene.

### 2. A ten-second spoken starting ritual
- **Experience.** Opening a book shows one line, "Where are we?". Holding the record button and saying a sentence or two of recap (who, where, what's at stake) starts the session. That recap is saved as a note, never into the manuscript.
- **Mechanism.** Ritual as a cue (Wood & Neal: context-dependent habits). Reactivating the scene removes the warm-up friction that makes people avoid starting.
- **Fit.** Reuses the note-for-next-time path (⌘J) and the recorder.
- **Effort.** M.
- **Backfire risk.** It becomes a chore if it's compulsory. Make it skippable with Space.

### 3. The book grows on the shelf
- **Experience.** The covers subtly change as a book grows: a thicker spine, a richer finish, a faint gilt edge at 50k words. Nothing is labelled; you just notice your book becoming more like a book.
- **Mechanism.** Endowed progress and the IKEA effect: we value what we visibly built. Identity reinforcement ("I'm someone who makes books").
- **Fit.** `renderer/covers.js` via `dressCover`, keyed on word count. Pure CSS layers.
- **Effort.** S–M.
- **Backfire risk.** Low.

### 4. Variable, rare, earned moments
- **Experience.** Very occasionally, and unpredictably, the app marks something real: "That was your longest unbroken passage this month", "You passed the length of *The Great Gatsby*", "Chapter 12 is now longer than Chapter 1". These appear once, in the Today line, and fade.
- **Mechanism.** Variable-ratio reinforcement is the strongest schedule for persistence. It stays honest because every moment is true and drawn from your own data. Milestones also act as "fresh starts" (Dai, Milkman & Riis).
- **Fit.** `lib/mastery.js` already has the data (`sprintStats`, `dayStats`), shown through the `#today` line.
- **Effort.** M.
- **Backfire risk.** Overuse cheapens it. Cap it at about one a day, and never praise effort that didn't happen.

### 5. The goal-gradient finish line
- **Experience.** When you're within about 10% of your session or chapter goal, the sprint ring warms slightly and the remaining words appear ("212 to go"). It shows only near the end, never at the start.
- **Mechanism.** The goal-gradient effect (Hull; Kivetz et al.): effort accelerates as the goal nears. Hiding the gap early avoids the discouragement of a big number.
- **Fit.** `renderer/mastery.js` sprint line and `estimate`.
- **Effort.** S.
- **Backfire risk.** Low, since it applies only when you set a goal.

### 6. Overshoot bonus framing
- **Experience.** Once you pass your goal, the count switches to "+340 bonus" in a softer colour.
- **Mechanism.** Gain framing after goal completion keeps going without raising the bar. Goals are never moved automatically.
- **Fit.** The sprint "overtime" state already exists.
- **Effort.** S.
- **Backfire risk.** Low.

### 7. If-then plans written into the app
- **Experience.** In Settings, write one sentence: "After my morning coffee, I open Amanuensis and dictate for 20 minutes." On launch, the app shows your own sentence back to you once, as a quiet reminder of your plan.
- **Mechanism.** Implementation intentions (Gollwitzer): one of the best-supported habit interventions, with a medium-to-large effect.
- **Fit.** The mastery profile, plus a line on the library screen.
- **Effort.** S.
- **Backfire risk.** Low.

### 8. Start with zero friction: a book opens already listening
- **Experience.** An optional "open ready" setting: launching the app goes straight to your last chapter with the mic armed, so pressing Space once starts dictation. Typical time from launch to speaking is under 2 seconds.
- **Mechanism.** BJ Fogg's B = MAP: lowering ability cost beats raising motivation. Fewer steps means more sessions.
- **Fit.** The boot path in `renderer/app.js` plus the existing re-entry.
- **Effort.** S.
- **Backfire risk.** Accidental recording. Arm the mic, but don't start recording.

### 9. Hear your story back
- **Experience.** After a session, the app offers "Listen to today's pages": your own voice, stitched from today's passages in manuscript order.
- **Mechanism.** The progress principle (Amabile): seeing meaningful progress is the strongest daily motivator. Hearing your own story is vivid evidence and fun, and listening tends to spark the next scene.
- **Fit.** `audio/*.wav` plus segment timings already exist (`play()` in `app.js`).
- **Effort.** M.
- **Backfire risk.** Some people dislike their own voice. Make it opt-in.

### 10. A "story so far" ticker on the shelf
- **Experience.** Under each cover, faintly: the last line you wrote in that book.
- **Mechanism.** The open loop is visible from the front door, so the Zeigarnik pull starts before you even open a book.
- **Fit.** `lib:list` already augments books, and `bookTile` renders them.
- **Effort.** S.
- **Backfire risk.** Could spoil the calm of the shelf. Make it fade in on hover.

### 11. Momentum instead of streaks
- **Experience.** A soft "momentum" glow on the record button that builds over days you write and cools slowly, over about a week, when you don't. It never resets to zero and never shows a broken chain.
- **Mechanism.** Habit-strength feedback without the "what-the-hell effect": streak loss is known to trigger quitting (Polivy & Herman, abstinence violation).
- **Fit.** `lib/mastery.js` `dayStats`, shown through the halo on `#rec`.
- **Effort.** S.
- **Backfire risk.** Low, as long as it decays rather than snapping off.

### 12. Flow protection
- **Experience.** While you're dictating, everything except the text fades. If you pause for more than about 8 seconds, a single faint prompt appears from your breadcrumb ("What happens next?" or your own note).
- **Mechanism.** Flow (Csikszentmihalyi) needs clear goals and no interruptions. A gentle cue at the stall point keeps the loop going.
- **Fit.** The recording state on `body` plus the `#crumbbar` breadcrumb.
- **Effort.** S.
- **Backfire risk.** The prompt could break concentration. Keep it very faint and make it optional.

### 13. A chapter-end ceremony
- **Experience.** Ending a chapter with "new chapter" plays a small, beautiful moment: the chapter title sets in large serif type, with its word count and time spent, then dissolves. It lasts about 1.5 seconds and respects reduced-motion.
- **Mechanism.** Peak-end rule (Kahneman): how an experience is remembered depends on its peak and its ending, so ending on a high point makes you want to come back.
- **Fit.** Chapter creation in `renderer/app.js`.
- **Effort.** S.
- **Backfire risk.** Low.

### 14. Writing identity line
- **Experience.** The library header shows "Ada · novelist · 214,000 words spoken into being". It's factual and cumulative, and it only ever goes up.
- **Mechanism.** Identity-based habits (Clear; Oyserman's identity-based motivation): behaviour follows self-concept.
- **Fit.** The library header plus a lifetime total from the ledger.
- **Effort.** S.
- **Backfire risk.** Low.

## What I would not do
- Push notifications, red badges, or "you haven't written in 3 days".
- Streak loss, leaderboards, or guilt copy.
- Rewards that are fake, unearned, or generated by the AI.
- Anything that rewards word count by encouraging padding, because quantity can never outrank the guard.

## My top five for impact versus effort
1 (Stop mid-sentence), 8 (Open ready), 5 + 6 (Finish line and bonus), 4 (Rare true moments), 3 (The book grows).
