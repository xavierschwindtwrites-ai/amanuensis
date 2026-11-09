# Amanuensis hackathon shortlist: quiet pull

Claude and Codex, 2026-11-09. Ideas only; no code changed. Codex signed off after the corrections below were applied. Sources: `claude-ideas.md`, `codex-ideas.md`, and both reviews.

**Shared rules.** Nothing nags. Nothing punishes a missed day. Nothing invents rewards. The microphone never starts without the author. The word guard and `lib/format.js` are untouched. Everything stays local. Anything decorative sits outside `#text`, because `serialize()` clones it. Every mechanism below is a design bet to try, not a guaranteed effect.

## The loop

**Leave with a scene you want to write → come back to it in seconds → land without effort → see what you made.**

---

### Tier 1: build first (the loop)

**A. The scene invitation** (Codex 1 + 2 + 16, Claude 1). Size: M.
- **Experience.** When you finish, ⌘-shortcut "Put the book away" saves everything and offers a small card with three optional lines: *the encounter* ("Leif corners Sable at the bridge"), *the question* ("What makes her hand over the sword?") and *the first move* ("Start with his accusation"). Next time the book opens, that card is waiting by the Record button. It clears the moment you start.
- **Optional prefill.** If you stopped mid-passage, the first move can be prefilled with your last half-sentence as a suggestion.
- **Why.** It gives curiosity a concrete object (Loewenstein). Ready-to-resume plans reduce lingering thoughts about the unfinished task (Leroy & Glomb); easier return is our hypothesis, not their finding. Interrupted tasks tend to get resumed (Ghibellini & Meier 2025), but there's no claimed memory boost.
- **Fit.** The note editor and `#breadcrumb` in `renderer/app.js`, `lib/habits.js`, `book.json`.

**B. Two-minute landing** (Codex 4, Claude 8). Size: S.
- **Experience.** In the Sprint menu, "Begin with two minutes". At two minutes it rolls quietly into overtime. Stopping there counts as a real session. Launch already reopens your exact place, so the path is: launch, see the scene card, choose "Begin with two minutes" (one keystroke), speak. ⌘D on its own records but doesn't start the sprint.
- **Why.** A tiny first goal makes a daunting task approachable (Bandura & Schunk; Fogg).
- **Fit.** `sprintMenu` and `start({plannedMin})` in `renderer/mastery.js`. These short sessions are kept out of the 10-minute calibration.

**C. Take me back in** (Codex 8 bold, Claude 9). Size: M.
- **Experience.** On request, the app plays 20–40 seconds of your own voice from where you left off, next to the read-only text. Then the cursor returns to your place. You can skip at any time, and it never autoplays.
- **Why.** Our extrapolation: re-creating context can aid recall (Smith & Vela), and immediate enjoyment supports persistence (Woolley & Fishbach). Neither study tested fiction or hearing your own voice, so the author judges whether it helps.
- **Fit.** `play()` plus passage selection in `renderer/app.js`. The audio is labelled "original dictation" when the text has since been edited.

**D. Numbers recede while you compose** (Codex 6, Claude 12 without its timed prompt). Size: S.
- **Experience.** Once you're writing, counts and the timer fade. Recording state, Stop and errors always stay visible. Moving to the bar brings them back.
- **Why.** Fewer prompts to check on yourself, which leaves room for absorption (flow research).
- **Fit.** `renderer/styles.css`, using the existing activity and recording state.

### Tier 2: the pleasures (evidence of what you made)

**E. Story receipts and journal** (Codex 14 bold). Size: M–L.
- **Experience.** At the end of a session, you can add a few words about what happened in the story ("Sable finally tells the truth"). Receipts become small cards in a book journal you open when you want, each paired with a favourite line or a voice clip. Revision earns receipts too, even when the count drops.
- **Why.** The progress principle: progress the author finds meaningful, not just word count.

**F. Favourite lines** (Codex 13). Size: M.
- **Experience.** Mark a sentence you love. One of your favourites appears beside the book on the shelf, rotating per visit. You can pin one or hide them all.

**G. A book with weight** (Codex 12, Claude 3). Size: M.
- **Experience.** On the shelf, the book's page edge thickens with its **historical peak** length, labelled as such and kept separate from the current manuscript size, so it never shrinks when you revise, plus a manuscript-page estimate labelled as an estimate. No gilt or other prizes.

**H. Your own finish line** (Codex 11, Claude 5 + 6). Size: S.
- **Experience.** At pauses only, the Today line shows "1,300 of your 2,000 · about one sprint left". Once you pass the goal, it says once, factually, "+340 beyond your goal". Nothing counts up live, and the goal never moves on its own.
- **Fit.** `showToday` and `estimateText`, using daily net growth as the goal measure.

### Tier 3: small and cheap

- **I. Your if-then plan** (both). Write one sentence, shown once on the day's first launch. It works best paired with a cue outside the app. Size: S.
- **J. Last line on the shelf** (Claude 10). Shown faintly under each cover, read from a cached field that's updated on save. Size: S.
- **K. A private dedication** (Codex 17). Your reason for this book, shown in the book details. Size: S.
- **L. A question for the walk** (Codex 18). Pick one of your questions when you start a break; it's shown once. Size: S.
- **M. A chapter-complete moment** (Claude 13, revised). Triggered only by an explicit "chapter done" after you stop recording, never mid-dictation. Respects reduced motion. Size: S.

### Still debated

**Rare true moments** (Claude 4).
- **Claude:** in Deci, Koestner & Ryan (1999), unexpected, informational feedback tended not to undermine intrinsic motivation. That isn't universal, and the paper didn't test this rare-fact treatment.
- **Codex:** it isn't a real variable-ratio schedule, and record-chasing invites padding.
- **Compromise if the author wants it:** only author-written milestones (from receipts) or book-scale facts ("longer than *Gatsby*"). Never passage records. At most one a day, at a pause.

### Dropped
- **Momentum glow.** Gradual cooling is still a loss signal.
- **The 8-second stall prompt.** Silence can be composition.
- **Choosing a work mode at the door.** It's one more decision before starting.
- **The spoken recap ritual as a step on the way in.** It could return as an optional recording mode.
- **Park the snag and beat cards.** Both are already planned for Apprenticeship Step 3.

## Build order
Build A + B + D first. That's the loop, at roughly one S + one M + one S. Use it for a week, then add C, E (receipts, Codex's pick for the strongest pull) and F.

How to judge it: was starting easier, did you want to come back, and could you still stop comfortably? Higher word totals alone don't prove a feature helped.
