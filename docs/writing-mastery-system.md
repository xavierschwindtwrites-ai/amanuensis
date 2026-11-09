# Writing Mastery System: design

Status: **revision 4.** Phase 2 is implemented and stabilised (§7.5). The Dictation Apprenticeship design is approved with the decisions in §16.11. **Steps 1 and 2 are implemented** (§16.12, §16.13). Step 3 is not started. Changes from the revision-1 review are marked ▲; additions in revision 3 are marked ◆.
Date: 2026-11-04

## 1. Summary

**Objective ▲.** Amanuensis is meant to *train* authors, not just count their words. The goal is for the author to progressively develop the writing habits, dictation fluency, focus and drafting capacity that prolific authors such as Seth Ring describe. Measurement exists to serve that training. The system should eventually adapt to the individual and develop real abilities, rather than simply pushing word counts up.

It is built around five engines: Habit, Focus, Dictation Training, Adaptive Progression and Craft Development. All five sit outside the manuscript pipeline: they observe it and never change it. The word guard (`lib/format.js` → `checkWords`) is untouched. Writing Mastery is **off by default**, and with it off Amanuensis behaves exactly as before.

**Phase 2 (implemented):**
- optional sprints with explicit start, pause, resume and finish rules
- a session ledger that keeps each kind of time and each kind of word separate
- baseline drafting speed
- goals the author controls
- quiet feedback after each sprint

**Phase 3, in priority order ▲:**
1. **The Dictation Apprenticeship.** This is the next build.
2. Adaptive progression.
3. Habit recommendations.
4. Craft development.
5. Long-term analysis.

## 2. What Seth Ring has actually said

The brief lists nine claims. Each was checked against his own writing. These are one author's self-reports about his own practice. They are not validated prescriptions, and the system never presents them as targets.

| Claim in the brief | What his public writing says | Source |
|---|---|---|
| Began with a 500-word daily goal | Yes. He chose 500 words because he had about one hour a day. With only half an hour, he says, he'd have aimed for about 200. Early sessions often produced "less than 200" words. | [27 Books in 5 Years](https://sethring.com/blog/27-books-in-5-years-heres-how-i-did-it-deliberate-practice/), [Goals](https://sethring.com/blog/goals-the-cornerstone-of-progress-deliberate-practice/) |
| Progressively increased targets | Yes. "I didn't just leave it there." Within that hour he went from 500 to 1,000 words. His current goal is "a minimum of 10,000 words a day." | [Goals](https://sethring.com/blog/goals-the-cornerstone-of-progress-deliberate-practice/) |
| Six 30-minute sprints with 10-minute breaks | Yes. These are livestreamed, Monday to Friday, from 9:00 to about 1:00 p.m., "or at least as many days during the week as I can manage." He reports 8,500–10,000 words across the six sprints. | [Daily Writing Sprints](https://sethring.com/blog/come-join-my-daily-writing-sprints/) |
| About 1,300–1,700 words per dictation sprint | Yes. That's about 3,000 words an hour, "close to 4,000" in the zone. Typing, he managed 2,000–2,200 an hour on a really good day. | [Dictation: 4 Books in 3 Months](https://sethring.com/blog/dictation-how-to-write-4-books-in-3-months/) |
| About 20 hours learning dictation | Yes. "20 hours just focusing on understanding the process of dictation and getting familiar with its rhythm." He "didn't like it" at first. | same |
| Consistent writing-start routines | **Not found as a stated method.** The fixed livestream start (8:30 go-live, 9:00 first sprint) works as a routine in practice. He also describes removing distractions before his 500-word goal became reliable. | [Daily Writing Sprints](https://sethring.com/blog/come-join-my-daily-writing-sprints/), [27 Books](https://sethring.com/blog/27-books-in-5-years-heres-how-i-did-it-deliberate-practice/) |
| Four elements of deliberate practice | Yes, in his words: "a clear goal, absolute focus, immediate feedback, desired difficulty." | [27 Books](https://sethring.com/blog/27-books-in-5-years-heres-how-i-did-it-deliberate-practice/) |
| Reader feedback for craft | Yes. He fixed any issue that "appeared in more than one comment" by the next day. He now gets per-chapter feedback from an advance reader team, and estimates about 80% of feedback won't help. | [The Best Sort of Feedback](https://sethring.com/blog/the-best-sort-of-feedback-deliberate-practice/) |
| Creative recovery and downtime | **Not found in his public writing.** The only related facts are weekday-only sprints and an announced vacation. Recovery is in this design as a sound principle in its own right, not as something attributed to him. | — |

Two details matter for the design:
- **Composing before speaking:** he "pre-edits in his head" and lets the software's errors stand until a later editing pass. Part of his speed is not interrupting himself.
- **Attention, not volume:** he warns against "vomiting words onto the page". Fluency comes from attention, not raw word count.

**The capabilities behind the numbers.** Ring's output rests on six things. The system aims to develop these, not his schedule:

1. **Speaking speed:** dictation outpaces his typing by about 40–50%.
2. **Composing ahead:** forming the next sentence before saying it.
3. **Not stopping to fix:** errors are left for revision.
4. **A protected, repeatable time and place to write.**
5. **Removing distractions.**
6. **A short loop from writing to useful feedback.**

## 3. The evidence base

Each mechanism is labelled with how much evidence supports it. "Proposed" means it's a reasonable training method without direct evidence for this use.

| Mechanism | What the evidence says | How strong | Where it's used |
|---|---|---|---|
| Specific, challenging goals | Specific, difficult goals produce more effort and performance than "do your best". The effect depends on ability, commitment and feedback. Locke & Latham (2002), *American Psychologist* 57(9), [doi:10.1037/0003-066X.57.9.705](https://doi.org/10.1037/0003-066X.57.9.705) | Strong | Daily goals; milestones as optional challenges |
| If-then plans ("implementation intentions") | Plans of the form "when X, I will Y" improve goal attainment, d ≈ 0.65 over 94 tests. Gollwitzer & Sheeran (2006), *Adv. Exp. Soc. Psych.* 38. A 2024 update over 642 tests found d = 0.27–0.66 depending on the outcome. | Strong, depends on context | Writing windows ("Weekdays at 9:00, I dictate") |
| Habit formation | Automaticity grew over a median of 66 days, with a range of 18–254. One missed day didn't materially set people back. Lally et al. (2010), *Eur. J. Soc. Psych.* 40. Small sample, not yet replicated. | Moderate | No punishment for missed days; patient expectations |
| Visible streaks | A broken streak shown in a log lowers later engagement, more so when people blame themselves. Silverman & Barasch (2023), *J. Consumer Research* 49(6) | Moderate | **No streaks anywhere** |
| Tangible rewards and intrinsic motivation | Expected tangible rewards undermine intrinsic motivation; 128 experiments. Deci, Koestner & Ryan (1999), *Psych. Bulletin* 125(6) | Strong | No XP, badges or points |
| Progress on meaningful work | Making progress on meaningful work is the strongest daily driver of positive motivation, and setbacks weigh more than progress. Amabile & Kramer, *The Progress Principle* (2011); diary study of about 12,000 entries | Moderate (field diaries) | Quiet, factual feedback on progress; nothing framed as failure |
| Deliberate practice | Practice correlates with performance at r ≈ .35 overall: 26% of variance in games, 21% in music, 18% in sports, **<1% in professions**. Macnamara, Hambrick & Oswald (2014), *Psych. Science* 25(8). This is disputed by Ericsson. | Moderate; weak for professional skills | Dictation drills and craft focus, framed as practice, never as guaranteed improvement |
| Scheduled vs self-chosen breaks | Students using scheduled breaks reported less fatigue and better concentration than those choosing their own breaks, with equal effort and output. Biwer et al. (2023), *Br. J. Educ. Psych.* A 2025 study found the opposite on mood. | Mixed | Suggested breaks the author can always ignore |
| Brief, regular writing sessions | Academics writing in brief daily sessions produced more pages and ideas than those who waited for inspiration. Boice (1983, 1990), reanalysed by Krashen (2002). Boice's punishment condition raised output but lowered ideas per page. | Moderate, older | Encourage regular sessions; **no penalties**, ever |
| 20 hours to learn dictation | One author's report | Proposed | A 20-hour track, labelled illustrative |
| 500 → 10,000 word ladder | One author's path | Proposed | Optional milestones, offered only when the author's own data support them |
| Fluency feedback from transcripts | Speech-rate and disfluency measures are standard in speech research. Applying them to fiction dictation is new. | Proposed | Phase 3 dictation feedback |

**What the design takes from this:**
- Goals and if-then plans have the strongest evidence, so they come first.
- Streaks, rewards and penalties carry known harms, so they are excluded.
- Practice is offered as practice. The app never claims it will make anyone better.

## 4. What already exists

The repository was audited on 2026-11-04.

| Existing piece | Where | What the system can reuse |
|---|---|---|
| Per-chapter word counts, updated on every edit | `renderer/app.js` `updateCounts`, `book.json chapters[].words` | Net manuscript growth, the most reliable measure |
| One record per dictated passage: id, session, raw transcript, versions, status, time | `dictation/<chapter>.json`, `newRecord` | Telling raw transcribed words from applied words; spotting duplicates |
| Session ids: `take-…` for live, `import-…` for imported | `main.js startRecording` | Telling live dictation from imported recordings |
| Retry, Re-run AI and version switching replace text in place rather than adding it | `retrySeg`, `reformat`, `switchVersion` | Counting these as revision, never as new drafting |
| Guard removals and preprocessing notes per passage | `rec.ai.removed`, `rec.notes`, `F.preprocess` | Phase 3 fluency feedback: restarts, fillers, repeated words |
| Session tracker with idle detection and a quiet end-of-session line | `lib/habits.js`, `endSession`, `#ack` | The base for sprints and day-end feedback |
| Re-entry and notes for next time | Phase 1 | The pre-session moment |
| `book.json sessions[]` (start, end, net words) | Phase 1 | Imported once into the new ledger (§7.4) |

**Gaps:**
- Nothing yet attributes a word change to its cause: dictation, typing, import or revision.
- There is no timer, no author-level store across books, and no idea of a writing day.
- Imported audio currently adds to `sessionWords` and to the session line.

That last gap is fixed in Phase 2: imported words are shown separately and kept out of speed figures.

## 5. Design principles

1. **The manuscript comes first.** Mastery never writes into chapters or transcripts, never changes cleanup or formatting, and never interrupts recording.
2. **Show up only at natural pauses:** before a session, during a break the author asked for, after a sprint, at the end of the day, and in a review the author opens. Never while words are being produced.
3. **Facts, not judgements.** "Sprint 3 added 1,240 words." Never "Great job!" and never "You missed yesterday."
4. **Offer, never impose.** Goals change only when the author agrees. Schedules are never enforced. Timers never stop anything.
5. **No streaks, XP, badges, levels, leaderboards, guilt or push notifications.**
6. **Rest is part of the plan.** Rest days are planned, honoured and invisible in the statistics.
7. **No guessing about the person.** Fatigue is something the author reports, and it's used only to hold back challenges. The app never infers mood, health or psychology.
8. **Local and portable.** Data is plain files in the library folder: no accounts, no telemetry, safe to sync.
9. **Craft is not word count.** No measure of quantity, and no AI rating, is ever presented as evidence of craft.

## 6. Architecture

```
renderer/app.js (manuscript code)
   │  calls window.Mastery.* hooks after it acts; each returns at once when Mastery is off
   ▼
renderer/mastery.js ── sprint lifecycle and timer, typing batches, quiet lines, Progress sheet
   │
   ├── lib/mastery.js   pure: ledger parsing and deduplication, profile merge, writing days,
   │                    sprint derivation and recovery, sprint and day measures, baseline, estimates
   │
   ▼  IPC: mastery:read, mastery:append, mastery:setProfile, mastery:legacy, mastery:delete (main.js)
<Library>/.amanuensis/mastery/   profile-<device>.json · ledger-<device>.jsonl
```

- **One-way flow:** the manuscript code calls `masteryEmit(event)` after it acts. With Mastery off, `masteryEmit` does nothing and no Mastery file is created. Mastery reads word counts but never calls code that changes text.
- **Pure logic:** everything in `lib/mastery/` is a pure function with no DOM, like `lib/format.js`, so it can be unit-tested.
- **Storage:** data lives in the library folder, not the app's settings folder, so it travels with the books between Macs. Each Mac writes its own append-only file (`ledger-<deviceId>.jsonl`), so sync services never see two devices editing one file. This follows NEO's rule about libraries synced with iCloud.
- **Hidden from the library:** the folder starts with a dot and has no `book.json`, so `listBooks` ignores it.

## 7. Data models and data integrity

All Mastery data lives in `<Library>/.amanuensis/mastery/`. It is never written into chapters, transcripts or `book.json`.

### 7.1 Profile: one file per Mac, merged field by field ▲

- **One file per Mac.** Each Mac writes only its own `profile-<deviceId>.json`, and no Mac ever writes another's file. That rules out file-level sync conflicts.
- **Each setting is stamped.** Every setting is stored as `{ "v": value, "t": milliseconds }`.
- **Merging.** The effective profile takes, for each setting, the value with the newest stamp across all profile files. Ties go to the higher device id, so every Mac merges to the same answer.
- **The one known edge.** Two Macs changing the *same* setting while offline keep the later change. Rest dates are stored as one list, so two offline edits to that list keep the later one.

| Setting | Default | Meaning |
|---|---|---|
| `enabled` | false | Writing Mastery on or off. Off on any Mac turns it off everywhere. |
| `sprintMin` / `breakMin` | 30 / 10 | Planned sprint and suggested break, 5–90 and 0–60 minutes |
| `dayStartHour` | 4 | A writing day runs from 4 a.m. to 4 a.m., so late-night work counts for the evening it belongs to |
| `goalWords` | 0 | Daily goal in net words; 0 means no goal |
| `writingDays` | Mon–Fri | Days the author plans to write |
| `windowStart` / `windowMin` | 09:00 / 120 | Planned writing window |
| `restDates` | [] | One-off rest days |

### 7.2 Ledger events

- **Format.** One file per Mac, `ledger-<deviceId>.jsonl`, append-only, one JSON object per line.
- **Fields.** Every event has `id`, `t` (milliseconds) and `type`. An event that concerns a book has `book`. Events written during a sprint carry `sprint`.
- **Duplicates.** Readers merge every Mac's ledger and keep one event per `id`.

| `type` | Fields | Notes |
|---|---|---|
| `count` | `book`, `total` | Snapshot of the book's word count. Taken at the day's first activity, at sprint start, pause, resume and end, every minute while a sprint runs, at session end, on leaving a book, and on quit. Net growth comes only from these. |
| `typing` | `book`, `added`, `removed`, `from`, `to`, `paste?` | Typed word changes, batched every 30 s and at pauses. Pasted or cut text is flagged, and never counts as composed. |
| `dict` | `book`, `seg`, `src: live\|import`, `session`, `spokenAt`, `speechSec`, `raw`, `words` | One per passage. `id = dict:<book>:<seg>`, so a retried, reformatted or re-emitted passage can never count twice. `spokenAt` = recording start (parsed from the session id) + offset in the recording. |
| `revise` | `book`, `seg`, `kind: switch\|retry\|reformat`, `delta` | Version switches and re-runs. Never counted as produced words. |
| `structure` | `book`, `kind`, `delta` | Chapter deleted or an earlier version restored. Excluded from drafting statistics. |
| `rec` | `op: start\|stop`, `session` | Recording boundaries |
| `sprint` | `sprint`, `op: start\|pause\|resume\|tick\|end\|discard`, `plannedMin`, `reason` | The sprint lifecycle (§8.2) |
| `goal` | `words` | Goal history, kept for progression |
| `legacy` | `book`, `start`, `end`, `added` | A Phase 1 session. `id = legacy:<book>:<start>`. |

### 7.3 What gets measured ▲

| Measure | Definition |
|---|---|
| **Total elapsed time** | Wall-clock time from sprint start to finish, pauses included |
| **Running time** | Elapsed time minus pauses; this is what the timer counts |
| **Speaking time** | Total `speechSec` of live passages spoken during running time |
| **Active composition time (estimated)** | Typing windows and speech intervals joined into one timeline, bridging any gap of 2 minutes or less as thinking time, then clipped to running time. Labelled as an estimate. |
| **Gross words produced** | Words in live dictated passages when first applied, plus typed words added. Excludes pasted text, imports and revisions. |
| **Net manuscript growth** | For each book, the last `count` minus the first `count` in the period: what the manuscript actually did. Daily goals use this. |
| **Composed growth** ◆ | Net growth corrected to what was composed in the period. Imports, pastes and cuts, version switches, restores and chapter deletions inside the period are removed. Passages spoken in another period are removed, and passages spoken in this period that landed after its last count are added. Every productivity figure uses this: sprint lines, typical sprint, estimates. |
| **Imported words** | Words from passages transcribed from imported recordings. Reported on their own and excluded from gross words and speed. |
| **Words removed in revision** | Typed deletions, plus word losses from version switches, re-runs and chapter deletions |
| Raw transcribed words | Words in the raw transcripts of live passages, before cleanup |
| Drafting speed | Gross words ÷ active composition minutes. The sprint's mode is dictation when live words exceed typed words, otherwise typing. |

**Attributing delayed results ▲.** A transcription can finish long after the words were spoken: after the sprint ended, after midnight, or after a retry days later. Each passage is placed by when it was *spoken*, not when its text arrived. That decides its writing day and its sprint. Imported recordings have no meaningful spoken time, so they are placed by when they were imported.

**Retries and version switches ▲.** Each passage is identified by its segment id, so a passage is counted once at most. Retrying a failed passage produces its first and only `dict` event. Switches and re-runs only ever produce `revise` events.

### 7.4 Integrity rules ▲

- **Incomplete writes.** Each event is one line, written in a single append. If a crash leaves a partial line, the reader skips any line that doesn't parse. The next append starts on a fresh line.
- **Interrupted sprints.** When the app starts, a sprint with no `end` is closed at its last recorded activity if it belongs to an earlier writing day. If it's from today, it is paused at that moment and the author can resume or finish it. A tick written every minute while a sprint runs keeps the loss from a crash under a minute.
- **Delayed transcription.** Handled by `spokenAt` as above. When a sprint finishes while passages are still being transcribed, its closing word count waits up to 60 seconds for them to land.
- **Legacy import is idempotent.** Phase 1 sessions are imported with fixed ids (`legacy:<book>:<start>`). Importing twice, on any number of Macs, yields one event per session after deduplication. Already-present ids are never re-appended.
- **Off means off.** With Writing Mastery off, every hook returns at once. Nothing is recorded, no timer runs, and no file or folder is created. Turning it off writes only the `enabled: false` setting.
- **Deleting.** Settings → Writing Mastery → **Delete Writing Mastery data…**, after a confirmation, permanently removes `.amanuensis/mastery/` (every Mac's ledger and profile in this library). Writing Mastery is then off. Manuscripts, transcripts and audio are untouched.


### 7.5 Stabilisation after Phase 2 ◆

**The reported bug.** A passage that finished transcribing more than 60 seconds after its sprint closed was missing from that sprint's net growth.

**Five related distortions found while investigating it.** Each could quietly bend the numbers:
1. A passage spoken in sprint A but landing during sprint B inflated B.
2. Imported recordings inflated net growth, and through it the "typical sprint" baseline. The old rule only excluded sprints where imports outweighed composed words.
3. Pastes did the same.
4. Version switches, restores and chapter deletions moved net growth in either direction.
5. A retry made days later was credited to the retry day instead of the day the words were spoken.

**The fix.** `growth()` in `lib/mastery.js` keeps raw net growth as an honest record of what the manuscript did. Next to it, it computes composed growth (§7.3), which places every passage by when it was spoken and neutralises everything that wasn't composed in the period. The baseline, estimates and sprint lines now use composed growth. Daily goals still use manuscript growth, and the Progress sheet shows both whenever they differ.

**Regression tests** in `test/mastery.test.js` cover:
- late arrival
- cross-sprint arrival
- imports, pastes, switches, restores and deletions
- a neutral cut-and-paste move
- a retry days later
- a baseline that resists an import-heavy sprint

`test/e2e-mastery.js` also checks a late passage in the running app. The word-verification pipeline was not touched; its files are byte-identical by SHA-256.
## 8. How the author experiences it

**Turning it on.** Settings → Writing Mastery, one switch. Then three optional fields: a daily goal (blank by default), writing days and window, and sprint length. There is no onboarding sequence.

**Before a session.** This only appears if a goal or window is set and today isn't a rest day. A single quiet line sits under the Phase 1 note: "Today: 2,000 words · about 2 sprints." It fades when writing starts. On a rest day, nothing appears.

**Sprints.** These follow the lifecycle below (§8.2). A sprint is a stretch of writing time. Any number of recordings, typing, thinking pauses and short interruptions can happen inside it.

- **While it runs:** the bar shows "Sprint 2 · 18:40" in the same grey as the word count. Click it for Pause, Resume, Finish or Discard. ⌥⌘S starts a sprint, or finishes the one that's running.
- **When the planned time passes:** nothing is interrupted, and recording continues untouched. The timer counts on as overtime ("Sprint 2 · +3:10").
- **After a sprint:** a single line, e.g. "Sprint 2 · 1,240 words in 31 minutes." It notes imported words if there were any.
- **Breaks:** the suggested break counts down in the same spot. It is never enforced, and nothing starts by itself.

### 8.2 Sprint lifecycle ▲

| State | How it's entered | What happens |
|---|---|---|
| Running | The author presses Sprint or ⌥⌘S; Resume; any activity after an "away" pause; starting a recording during a pause | The timer counts. Recording, typing and silence don't change the state. |
| Paused (author) | The author presses Pause | The timer holds. It stays paused until Resume or a new recording. Typing during a pause is editing and doesn't resume it. |
| Paused (away) | No typing, no speech, and no recording in progress for 15 minutes | The pause is backdated to the last activity, so the away time is never counted. Any activity resumes the sprint automatically. |
| Overtime | The planned time passes while running | Nothing changes except the label. **Stopping and restarting dictation never ends a sprint.** |
| Finished | The author presses Finish or ⌥⌘S; or 5 minutes pass with no activity while in overtime and nothing is being recorded or transcribed (ending at the last activity); or the next launch on a later writing day finds the sprint still open | The closing word count waits up to 60 s for in-flight transcription. Then one quiet line appears and the suggested break starts. |
| Discarded | The author chooses Discard | The sprint is left out of every statistic. Its words still count toward the day. |

An expiring timer never stops a recording, takes focus, or opens anything.

**End of the day.** This extends Phase 1's line. When the day ends, through idle time, leaving the book, or a manual "Done for today", the line reads "2,140 words today, across 3 sprints." If a goal was set and met, it adds "· goal reached." If the goal wasn't met, it says nothing about the goal.

**Progress review.** View → Progress. This is a single sheet, not a dashboard:
- **This week:** days written, net words, sprints.
- **Your usual pace:** median words per sprint and per active minute, dictation vs typing, with calibration status.
- **Over time:** one small chart of median sprint yield by week.
- **Goal:** current goal, and how many recent writing days reached it.
- **Offer:** an increase or adjustment, if one is warranted (§9).

## 9. Progression rules ▲

Goals change only with the author's agreement, and Phase 2 never proposes a change. This section is the design for Phase 3.

1. **Long-term milestones.** The ladder stays 500 · 1,000 · 2,000 · 3,000 · 5,000 · 7,500 · 10,000 words a day. These are horizons shown in the review, not steps the author must climb.
2. **Intermediate challenges.** Between milestones, the next challenge is the current goal raised by **5–10%**, rounded to the nearest 50 words. That's 5% after a recent miss or a high fatigue rating, 10% otherwise. A 2,000-word goal leads to 2,100 or 2,200, not 3,000. The percentages are starting values, to be tuned with real use.
3. **What can prompt an offer: shown ability, never time served.** All of these must hold:
    - **Sustained:** the goal was reached on at least 7 of the author's last 10 *writing* days, with at least 10 writing days at the current goal. Days without writing are never counted at all.
    - **Within capacity:** the author's median day over those 10 writing days is already at or above the proposed goal, or within 5% of it.
    - **Fits the time:** the proposed goal, divided by conservative sprint yield (25th percentile), fits the author's planned window, breaks included.
    - **Not tiring:** if fatigue check-ins are on, no rating of 4 or 5 in the last 3 rated sprints.
    - **Not recently declined:** no offer declined in the last 14 days.

   The number of sessions or days alone **never** prompts an offer.
4. **Consent.** The offer appears only in the review, or as one line at a day's end. The choices are Yes, Not now, or Keep my goal. "Keep my goal" switches off offers for that goal for good, until the author changes it. Every answer is logged.
5. **Keeping a goal.** A setting, "Keep my current goal", turns off all offers indefinitely.
6. **Lowering a goal.** If the goal was reached on 2 or fewer of the last 10 writing days, the review alone offers the author's own recent median, without comment.
7. **Missed days** have no effect, are never displayed as gaps, and never reset anything.

## 10. Phase 3 designs (not built)

**Build order ▲:** the Dictation Apprenticeship (10.2) comes first, because it develops ability directly. Progression (10.1), habits (10.3), craft (10.4) and long-term analysis (10.5) follow.

### 10.1 Personalized progression
Phase 3 extends §9 with each author's own trends. For example, offers can be timed to the sprint position where the author is most productive, using the per-sprint yield curve. That's checked against Ring's remark that his later sprints yield less, an unverified podcast summary. It also adds a "maintenance" state for authors who are happy where they are: no offers at all.

### 10.2 Dictation Apprenticeship (next to build) ▲

Superseded by the detailed design in §16.

### 10.3 Writing-habit recommendations
- **If-then plan:** offered once in Settings: "When ___, I will open Amanuensis and ___."
- **Window suggestions:** shown in the review, based on when sprints actually happened. Only a suggestion; the calendar is never edited.
- **No notifications.** If the author asks for one, it's a single local reminder at the start of their window, off by default.

### 10.4 Craft development
- **Focus skill:** the author picks one (dialogue, description, characterization, pacing, scene structure, clarity) for a week or a sprint.
- **Reflection:** an optional one-line prompt after a sprint: "What did you try with dialogue?" It's stored with the practice, not the manuscript.
- **Reader feedback:** the author pastes comments from beta readers, an ARC team or Royal Road, tagged by chapter and skill. Following Ring's rule, an issue the author tags in two or more comments is marked as recurring. The author marks it addressed when they choose.
- **What's tracked:** practice sessions per skill, and feedback items per skill over time. Never word counts, and never AI ratings of quality. AI may later help group comments, but never score writing.

### 10.5 Long-term analysis
- **Month and year summaries in the review:** pace by mode, days written, comfortable sprint length, fluency trends, and goal history.
- **Export:** all of it as CSV, the author's own data.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Quantity crowds out quality (Goodhart's law) | Net growth only, no craft claims from counts, craft engine kept separate, a "maintenance" state, no comparisons |
| Ring's numbers discourage new writers | His figures appear only in this document, never in the app. Milestones start at 500 and only appear when the author's own data support them. |
| Voice strain from long dictation | Breaks suggested by default. Endurance drills build up gradually. The fatigue check-in can only hold back challenges. No health claims. |
| Guilt from missed days or goals | No streaks, no gaps shown, no "missed" language. Lowering a goal is offered only in the review, neutrally. |
| Inflated statistics | Deduplicated by passage id; imports separated; revisions and structural changes excluded; net growth measured from the manuscript itself |
| Sync conflicts | One append-only file per Mac; ids deduplicated on merge; no file shared between Macs at all: profiles and ledgers are one file per Mac, merged on read |
| Interrupting the writer | Timers never stop recording or take focus; all messages appear at pauses in the existing quiet style |
| Scope creep into a dashboard | One review sheet, one chart; everything else is a single line |
| Overstating the evidence | Section 3 labels every mechanism; the app doesn't promise any increase in output |
| Privacy | Everything local; no telemetry; practice audio kept with the library and deletable |

## 12. Success metrics

There's no telemetry, so success is judged three ways: by the author locally, in usability sessions with consenting authors, and by tests.

- **For the author** (visible in the review, all trends of their own):
    - Writing days per week, consistent over months
    - Median sprint yield and words per active minute
    - Comfortable sprint length
    - Dictation fluency (Phase 3)
    - Goals the author chose to raise
- **Guardrails, for evaluating the feature:**
    - Fatigue check-ins don't trend upward.
    - Increase offers are accepted at least as often as declined; if most are declined, the rules are too eager.
    - Turning Mastery off leaves the manuscript and the app unchanged.
    - Authors in usability sessions describe it as quiet.
- **Never a goal:** time in app, number of sessions opened, or any engagement-for-its-own-sake measure.

## 13. Testing strategy

**Unit tests** (`test/mastery.*.test.js`, pure functions):
- **Ledger:** a retried or switched passage is never counted twice. Imported words stay out of drafting speed. Removed typed words count as revision. Merging two devices' logs counts each id once.
- **Estimates:** medians and percentiles, the 1,250 → 5,000 → 4-sprint example, the window comparison, provisional labelling under 10 sprints.
- **Progression:** every condition in §9.5 checked one at a time. A declined offer is quiet for 14 days. Rest and missed days never enter the counts. No function ever returns a changed goal without an `accepted` event.
- **Schedule:** the 4 a.m. day rollover, rest dates, writing days.

**End-to-end tests** (extending `test/e2e.js`, which already runs real speech through the app):
- **Sprints never interrupt recording:** a 3-second sprint expires mid-dictation, recording continues, and every passage lands.
- **Dictated vs net growth:** dictate, then delete a sentence. Dictated words exceed net growth, and the review reports both correctly.
- **Imports:** import a recording. Imported words show separately, and drafting speed doesn't change.
- **Retries:** fail a passage, then retry it. Its words are counted once.
- **Rest days:** on a rest day, there's no pre-session line and no goal mention. Writing anyway doesn't change goal success rates.
- **Recommendations:** forcing offer conditions shows an offer, but the goal stays unchanged until Yes.
- **Manuscripts unchanged:** chapter and dictation files are hashed before and after turning Mastery on, running sprints and turning it off. The hashes match, apart from the writing the test itself did.
- **Mastery off:** no `.amanuensis/mastery/` folder is created, no Mastery UI appears, and all 37 existing end-to-end checks pass.
- **Existing tests:** all 26 existing unit tests pass, including the word guard and format tests, with `lib/format.js` byte-identical.

## 14. Phase 2: as implemented ▲

1. **Optional writing sprints**: the lifecycle in §8.2. Lengths are adjustable, there's a suggested break, overtime never interrupts, and an interrupted sprint is recovered.
2. **Session history**: the ledger (§7.2) with every measure in §7.3, per-device files, idempotent legacy import, and crash-tolerant reading.
3. **Baseline writing speed**: calibration over 10 qualifying sprints, labelled provisional from 3. A qualifying sprint runs at least 10 minutes and is mostly not imported. Medians are taken over the last 10 sprints of similar planned length (±25%).
4. **Goals the author controls**: daily goal, writing days, window and rest dates, set in the Progress sheet. Estimates show sprints and minutes against the window. The app never changes a goal.
5. **Quiet feedback**: the after-sprint line, a "Today" line before writing (on writing days with a goal), and "· today's goal reached" added to the end-of-session line. Nothing appears on rest days, and an unmet goal is never mentioned.
6. **Progress sheet** (⌥⌘P): the only new screen.
7. **Off switch and deletion**: §7.4.

## 15. Decisions taken in revision 2 ▲

| Question | Decision |
|---|---|
| Default state | Off. Turned on in Settings. |
| Storage | The library folder, per-device files, merged on read |
| Day rollover | 4 a.m. by default; can be set from 0 to 12 |
| Sprint chime | Not built. There is no sound at all, so nothing can startle the author or bleed into dictation audio. |
| Fatigue check-ins | Deferred to Phase 3, with progression, which is the only thing that would use them |
| Practice audio | Decided with the Dictation Apprenticeship |
| Ring's name in the app | No. Credited in this document only. |


## 16. Dictation Apprenticeship: detailed design ◆ (for review, not built)

### 16.1 Purpose and stance

The Apprenticeship develops the capabilities that let an author produce a lot of coherent fiction by voice:
- composing in the mind
- drafting without stopping to fix
- dictating dialogue
- building scenes
- sustained, comfortable sessions

It is inspired by Seth Ring's account: about 20 hours to learn dictation, composing ahead in his head, letting errors stand until editing, and fixed sprint sessions. It assumes none of his results transfer to anyone else.

Four commitments shape everything below:

1. **Train inside real work where possible.** Most exercises are ways of running an ordinary sprint on the author's own manuscript. The words produced are the author's real prose and stay in the book. The separate Practice space is optional, for drills the author wants to keep out of the manuscript.
2. **Train composition, not speed.** Gould's studies of dictation found that output modality is "not the limiting factor in composition"; planning took about two-thirds of composition time. Speed is never a target. It's at most a weak sign that composing has become easier.
3. **Ask the author.** The most reliable signal of appropriate difficulty is the author's own two-tap rating after an exercise. The transcript measures in §16.4 only guard against advancing too fast; they never push.
4. **Silent while composing.** Exercises set up before a session and give feedback after it. Nothing appears, counts, scores or suggests while words are being produced.

### 16.2 What the evidence supports

| Mechanism | Evidence | Status for this use |
|---|---|---|
| Planning before composing improves text | Outlining, mental or written, reduced attentional overload in adult writers (Kellogg 1988, *JEP: LMC* 14). Advance planning produced more fully developed stories, while speech recognition alone did not raise quality (Quinlan 2004, *J. Educ. Psych.* 96, ages 11–14). | **Direct experimental support** for planning in general. Applying it to fiction dictation is an extrapolation. |
| Composition, not modality, is the bottleneck in dictation | Experienced dictators were 20–65% faster than they wrote, not the theoretical 500%. Planning was about ⅔ of composition time. Novices reached writing-level speed and quality within a few hours but did not believe they had (Gould 1978, IBM). | **Direct**, but old, business letters, small samples |
| Rough-drafting (not polishing while drafting) | No quality benefit compared with polished drafting (Kellogg 1987/1988). | **No support for quality.** Whether it helps momentum or speed is a **hypothesis**, matching Ring's report. Offered as a preference, never as a quality claim. |
| Deliberate practice: specific sub-skill, feedback, challenge | It works in structured domains, but explains little of the variance in professional performance (Macnamara et al. 2014). Writing development as a long cognitive apprenticeship (Kellogg 2008, *J. Writing Research* 1). | **Moderate.** The structure is sound; the size of any gain is unknown. |
| Task-focused feedback | Feedback helps on average (d = .41) but lowered performance in over a third of cases, especially when it drew attention to the self (Kluger & DeNisi 1996, *Psych. Bull.* 119). | **Direct.** Feedback here is about the task ("4 of 4 beats"), never about the person ("you're improving"). |
| Self-efficacy through mastery experience | Writing self-efficacy predicts performance beyond prior achievement (Pajares 2003). Mastery experience is the strongest source (Pajares, Johnson & Usher 2007, n = 1,256). | **Direct (correlational and field).** Exercises are sized so success is likely, and progress is shown with the author's own evidence. |
| Goals and if-then plans | §3 (Locke & Latham 2002; Gollwitzer & Sheeran 2006) | **Direct** |
| Autonomy and choice | Rewards and control undermine intrinsic motivation (Deci, Koestner & Ryan 1999) | **Direct** for avoiding control. Free choice of exercises follows from it. |
| Spacing practice | Spaced practice beats massed practice for verbal memory (Cepeda et al. 2006, *Psych. Bull.* 132; 839 assessments) | **Indirect** (memory, not composing skill). The rule that limits step-ups to one per two writing days is a **hypothesis**. |
| Voice load and rest | Two hours of loud reading raised phonation effort, which fell after 15 minutes of silence (Solomon et al. 2003). A 20-minute reading task raised discomfort and fatigue (Gerosa). Evidence on water is inconclusive. | **Direct but small studies.** Endurance training builds in silent breaks. The app makes no hydration or health claims. |
| 20 hours to learn dictation | One author's report (Ring) | **Hypothesis.** The track length is a guide only. |
| Fewer pauses, fillers or restarts mean better writing | No evidence. These are partly artifacts of the transcriber and its settings. | **Explicitly not assumed** (§16.4) |

### 16.3 The five training areas and their exercises

Each exercise has a purpose, a manuscript form (the default) and, where useful, a Practice form. Levels change one parameter at a time. The author can always repeat, skip, choose any level, or customise the parameters.

#### A. Mental composition: forming the sentence before speaking

*Purpose:* move planning ahead of speech, so that speaking becomes reading out a sentence already formed. That's the "pre-editing in his head" Ring describes, and the planning that Gould and Kellogg found central.

| Exercise | How it runs | Levels |
|---|---|---|
| **Sentence in mind** | Before each sentence, pause, form it whole, then say it once. The page shows nothing different. | 1 sentence → 2 sentences → a short paragraph held in mind before speaking |
| **Beat preview** | Before a sprint, jot 2–5 beats for the next stretch of the scene on a card (typed or spoken). The card shows before the sprint, then folds away. Cards are stored like Phase 1 notes, never in chapter text. | 5 beats → 3 → 1 → beats kept in mind only |
| **Read-ahead** (Practice) | Read a paragraph you wrote earlier, look away, and retell its next paragraph aloud in your own words | 1 → 3 paragraphs |

*After:* "Beat preview · 4 of 4 beats." The author ticks the beats off; nothing is scored automatically. Then the optional rating.

#### B. Continuous drafting: drafting now, editing later

*Purpose:* protect momentum by deferring fixes. Kellogg found rough drafting doesn't improve quality, so this is offered only for momentum, as Ring uses it, and the author decides whether it helps.

| Exercise | How it runs | Levels |
|---|---|---|
| **Eyes forward** | During the sprint the page dims everything except the last paragraph, so earlier text doesn't invite fixing. Nothing is hidden from saving; it's purely visual. | Last paragraph visible → last sentence → page fully dimmed until the sprint ends |
| **Flag, don't fix** | Saying "flag that" (or ⌥F) marks the last passage for later revision instead of fixing it. Flags appear in the Transcript after the sprint. | No change in levels. The measure is how many fixes waited until after the sprint. |
| **Fix pass** | Right after the sprint, a short pass works through the flags | — |

*Measured:* revisions *during* the drafting sprint against revisions after it. Fewer revisions overall is **not** treated as better; only the moving of fixes to the end is the point. "Flag that" uses a structural command like "new paragraph", handled before formatting, so the word guard is untouched (§16.6).

#### C. Dialogue fluency: composing character exchanges aloud

*Purpose:* make spoken dialogue as easy as narration, which is where dictation formatting matters most.

| Exercise | How it runs | Levels |
|---|---|---|
| **Two voices** | A dialogue-led sprint: "new paragraph" at each speaker change, spoken tags | 6 exchanges → 12 → a full scene |
| **Beats, not tags** | Lines carried by action beats instead of "said" | — |
| **Distinct voices** (Practice) | Two characters with chosen differences (formal and blunt, for example), alternating lines | — |

*After:* "Dialogue sprint · 14 exchanges." Exchanges are counted from paragraph changes. Formatting quality is never judged.

#### D. Scene development: coherent scenes through extended dictation

*Purpose:* sustain one scene from start to finish by voice. This builds on planning, the best-supported mechanism.

| Exercise | How it runs | Levels |
|---|---|---|
| **Beat-to-scene** | Beats on a card, then dictate the scene. Afterwards, tick which beats landed and add any that emerged. | Short scene (3 beats, 10 min) → standard (5 beats, 20 min) → long (7+ beats, 30 min) |
| **One take** | A whole scene without stopping the recording (thinking pauses are fine) | 10 → 20 → 30 minutes |
| **Scene card review** | Afterwards, one optional sentence: "What changed from the plan?" Stored with the training data. | — |

Coherence is judged **only by the author**, using their own beat checklist. No AI rating, ever.

#### E. Writing endurance: comfortable, sustainable sessions

*Purpose:* grow the length of a comfortable session gradually, with voice rest built in.

| Exercise | How it runs | Levels |
|---|---|---|
| **Sprint ladder** | Sprint length steps up only when the current length felt comfortable | 10 → 15 → 20 → 25 → 30 minutes |
| **Session ladder** | Number of sprints in a session, each followed by a *silent* break | 1 → 2 → 3 → 4 → 6, with breaks of at least 10 minutes |
| **Voice check** (optional) | After a session: voice OK / tired | Used only to hold back step-ups. Never interpreted medically. |

*After:* "Session · 3 sprints · 1,940 words composed." Composed growth for each sprint is shown to the author as information. A falling yield in later sprints is never presented as failure; Ring himself reports it.

### 16.4 Signals, and how to keep them honest

| Signal | Source | What it can't tell us | Rules |
|---|---|---|---|
| Composed growth per sprint and per active minute | Ledger (§7.3) | Quality; whether the words will survive revision | Compared only with the author's own history |
| Session and sprint duration completed | Ledger | Whether the author stopped for a good reason | Stopping early is never a failure; 2 early stops suggest stepping back |
| Speaking time and passage length | `dict` events | Passage length depends on the pause setting | Compared only within the same pause setting |
| Revisions during drafting | `typing.removed`, `revise` during sprints | Whether revising was right | Used only by Continuous drafting, as during vs after |
| Restarts and doubled words | Raw transcript, using the same patterns the guard allows removing | Transcribers differ: Whisper often drops repeats that Deepgram keeps | Compared only within the same transcription setup; never used to advance on its own |
| Fillers per 100 words | Raw transcript | Depends heavily on the transcriber's filler settings | Shown only on request; never used to advance |
| Beats landed | The author's own ticks | — | The author's word is final |
| Felt difficulty: easy, about right, or hard | Optional two-tap rating after an exercise | — | **The main signal for progression** |

**Comparability.** Every measure carries a setup key: transcription service, model, language, pause length, cleanup level and whether AI formatting is on. Trends are computed within one key. Changing settings starts a fresh comparison window, so a change of transcriber can't look like a change in ability.

**Artifacts are excluded.** The following never enter training measures:
- passages where preprocessing collapsed a decoder loop or dropped boilerplate
- passages that failed and were retried
- imported recordings
- voice notes
- practice passages, when measuring the manuscript, and the reverse

**Never inferred:** talent, quality, mood, health, or comparisons with other people or with Ring.

### 16.5 Personalised progression

The rules are transparent, conservative and always overridable. Each exercise has a level. The engine **offers** a change before a session and never applies one itself.

- **Offer a step up** only when all of these hold. Ratings alone are never enough (decision 1):
    - The last 3 attempts at this exercise were completed and rated *easy* or *about right* (at least 2 rated easy, or all 3 about right).
    - **Task evidence agrees.** Each exercise defines its own evidence:
        - Beat preview: beats landed in at least 2 of 3 attempts.
        - Continuous drafting: most fixes moved to after the sprint.
        - Two voices: the planned exchanges were reached.
        - Endurance: the planned duration was completed without an early stop.
    - **Consistency:** the attempts are spread over at least 2 writing days.
    - **No sign of rushing:** composed growth per active minute hasn't dropped more than 20% below the author's median for this setup, and revisions after drafting haven't risen more than 50%.
    - The voice check, if used, wasn't "tired" in the last 2 sessions.
    - The last step-up for this exercise was at least 2 writing days ago.
    - Speed or filler counts alone are **never** sufficient.
- **Offer a step down** after 2 *hard* ratings in a row, or 2 early stops. It's phrased neutrally: "Try the shorter version next time?"
- **Stay** in every other case. The author can stay at any level indefinitely.
- **Recommendations before a session** pick one exercise, in this order:
    1. the author's chosen focus area
    2. an exercise not practised in the last 7 writing days, for variety
    3. the gentlest level awaiting a step up, if one is pending

  Each recommendation carries a "Why this?" line, e.g. "You chose dialogue; last three felt about right." There is one recommendation, not a menu, plus "Another" and "Not today".
- **Track length:** the "20-hour" figure is shown only as an optional orientation in the Training sheet ("about 6 hours of practice so far"). It is never a gate or a completion badge.

### 16.5a Progressive disappearance (decision)

Guidance fades as the author becomes independent, measured per ability:

| Stage | Entered when | What Amanuensis does |
|---|---|---|
| Learning | Default for a new ability | Offers one exercise before sessions where the author chose that ability |
| Practising | The exercise has reached its middle level and been held there with task evidence over a week of writing days | Suggests it only occasionally: at most once every 3 writing days |
| Independent | Top level held over 2 weeks of writing days, or the author says "I've got this" | No suggestions for that ability. Its history stays in the Training sheet, and the author can bring suggestions back at any time. |

An author who reaches Independent in all five abilities sees nothing from the Apprenticeship unless they open the Training sheet. The aim is independence, not reliance on coaching. There is no graduation, completion or 20-hour target (decision 5). Practice can continue indefinitely.

### 16.6 Integration with the editor

| Moment | What appears | Where |
|---|---|---|
| Before a session | One line: "Suggested: Beat preview · 3 beats · 20 minutes" with Start, Another, Not today | The existing "Today" line slot |
| Starting an exercise | Its card or setup (beats, level), then the ordinary sprint begins | A small sheet, closed before writing starts |
| During | Nothing new. Only the scaffold the author chose (Eyes-forward dimming, the folded beat card) and the usual sprint timer. | — |
| After | One task-level line, then an optional "How did that feel? Easy · About right · Hard" | The existing quiet-line slot |
| Any time | The **Training** sheet (⌥⌘D): focus areas, each exercise's level, history, "Why this?", and the setting to turn suggestions off | A sheet like Progress |
| Practice space | Opened from the Training sheet. A separate notebook with the same editor and pipeline, marked "Practice". "Copy to manuscript…" asks for a chapter and inserts at its end, with undo. | Its own view |

**Command handling.** "Flag that", like "note to self", is matched on the raw transcript *before* any formatting. It is a routing decision, not formatting, and adds no logic to `lib/format.js`. Practice dictation uses the same transcription and formatting pipeline as the manuscript, unmodified, so the word guard protects practice text too.

### 16.7 Data model and architecture

```
lib/apprentice.js      pure: exercise catalogue, setup keys, per-passage signals (from raw
                       transcripts, read-only use of FILLERS), progression and recommendation
renderer/apprentice.js Training sheet, exercise setup, scaffolds (eyes-forward, beat card),
                       after-exercise rating, Practice view
main.js                IPC for the practice store (practice:read/write/copy) and deletion
<Library>/.amanuensis/
  mastery/ledger-<device>.jsonl   + new event types below (same file, same integrity rules, §7.4)
  practice/notebook.json, pages/<id>.html, dictation/<id>.json, audio/*.wav
```

New ledger events. All of them are append-only, carry ids, and are deduplicated (§7.4):

| `type` | Fields |
|---|---|
| `drill` | `op: start\|end`, `drill` (id), `exercise`, `level`, `params`, `space: manuscript\|practice`, `sprint?`, `setup` (key) |
| `drill.rating` | `drill`, `felt: easy\|right\|hard`, `voice?: ok\|tired`, `beatsPlanned?`, `beatsLanded?`, `note?` (the author's sentence) |
| `level` | `exercise`, `from`, `to`, `by: author\|accepted-offer` |
| `flag` | `book`, `seg` (a passage flagged for later) |
| `copy` | `from: practice/<page>`, `to: <book>/<chapter>`, `words` (the explicit Copy action) |

The existing `dict` event gains `setup` (key), `restarts`, `fillers` and `artifact` (bool). These are computed in `renderer/apprentice.js` from the raw transcript, without changing how text is processed. The profile gains `trainingEnabled` (off), `focusAreas`, `suggestions` (on/off), `eyesForwardDefault` and `practiceAudioDays` (30).

### 16.8 Safety and privacy

- **Off by default.** The Apprenticeship can be on only while Writing Mastery is on. With it off, nothing is computed, suggested or stored.
- **Local only.** No AI calls are added for training, nothing is rated by a model, and there are no accounts or telemetry. Training adds no network traffic beyond the transcription the author already uses.
- **Manuscript integrity.**
    - Practice text never enters a book except through Copy to manuscript, which logs a `copy` event and can be undone.
    - Exercises never edit text. Eyes-forward is CSS only.
    - Flags and beat cards live outside chapter files.
    - `lib/format.js` and the guard are unchanged; tests confirm their checksums.
- **Practice data.** Kept apart from books. Practice audio is deleted after 30 days by default, and that's adjustable. "Delete Writing Mastery data" also deletes all practice data.
- **Voice.** Endurance always includes silent breaks. The app gives no medical advice. The voice check only holds back step-ups.
- **No evaluation during composing**, and no comparison with others.

### 16.9 Acceptance tests

Unit tests (`test/apprentice.test.js`):
- A step up is offered only after 3 qualifying completed attempts. It is blocked by a rushing signal, a recent step-up (under 2 writing days), or a "tired" voice check. Speed or filler improvements alone never produce an offer.
- A step down is offered after 2 hard ratings, or 2 early stops.
- No function changes a level without an author or accepted-offer event.
- Setup keys separate measures across transcriber or pause changes. A transcriber switch does not shift a trend.
- Passages flagged as artifacts, retries, imports, voice notes and practice passages are excluded from manuscript training measures.
- Restart and filler counts come only from raw transcripts, and the formatter's output is never used as their input.
- The recommendation follows the focus area first, then variety, and always has a "Why this?" reason.

End-to-end tests (`test/e2e-apprentice.js`, real speech):
- An exercise sprint shows nothing new during recording: no counters or suggestions appear in the DOM between record start and stop.
- Eyes-forward dims the page but saves identical chapter HTML.
- "Flag that" flags the passage without entering the manuscript.
- Practice text is absent from every chapter file until Copy to manuscript. After Copy, it is present once, and undo removes it.
- Training off: no training events, and no suggestion line.
- Deleting Writing Mastery data removes practice data too.
- All existing suites pass, and the pipeline files keep their checksums.

### 16.10 Implementation sequence

Each step ships behind the Training setting with its own tests:

1. **Signals and setup keys.** Per-passage restart, filler and artifact measures and setup keys on `dict` events; no UI. Verified against recorded transcripts from more than one transcriber.
2. **The after-exercise rating and the Training sheet**, with manuscript-mode exercises that need no new editor features: Beat preview, Sentence in mind, Two voices, Sprint ladder. The author chooses manually; nothing is recommended yet.
3. **Scaffolds:** Eyes-forward dimming, beat cards, "flag that" and the Fix pass.
4. **Practice space and Copy to manuscript.**
5. **Progression offers and the one-line recommendation**, turned on only after steps 1–4 have produced real data and the thresholds in §16.5 have been checked against it.
6. **Review integration:** a Training section in Progress, hours practised, and history per exercise.

### 16.11 Decisions (reviewed 2026-11-05)

| Question | Decision |
|---|---|
| 1. Felt difficulty as the main signal | **Approved.** Optional, a single click, never blocking. A step up also needs completion, task evidence and consistency (§16.5). These are training suggestions, not assessments of ability. |
| 2. Eyes forward | **Progressive dimming only** in the first release. Earlier text can always be revealed at once (a key or mouse movement). Fully hidden may come later as an optional advanced exercise. |
| 3. "Flag that" | **The author chooses the phrase**, with a sensible default (proposed: "flag that passage") and ⌥F as a keyboard alternative. It is recognised conservatively: the whole passage must consist of the phrase, or end with it after a pause, so it can't fire in mid-dialogue. The original audio and raw transcript are always kept. |
| 4. Practice audio | **Deleted after 30 days by default**, with options to keep it indefinitely, delete now, or delete by hand. Stated clearly when Practice is turned on. Applies only to separate Practice recordings; manuscript dictation keeps its current preservation. |
| 5. Twenty-hour orientation | **Not shown.** Five abilities, each tracked on its own, practised indefinitely, with no graduation. |

**Further requirements adopted:**
- **Train through real writing.** The manuscript forms of exercises are the default and must not feel like homework. Practice is entirely optional.
- **Progressive disappearance** (§16.5a).
- **Never optimise the wrong measures.** Speed, fillers and passage length are never targets. The aim is sustainable production of usable manuscript text.
- **Consent.** Even the invisible Step 1 signals exist only while Writing Mastery is on, stay local, and are removed by "Delete Writing Mastery data".

### 16.12 Step 1 as implemented: signals and setup keys

- **`lib/apprentice.js`** (new, pure). It provides:
    - `setupKey()`
    - `passageSignals()`: fillers and doubled words measured by running the raw transcript through the pipeline's own `cleanup()` at Light and Moderate, read-only; false starts by a conservative break-mark rule; artifacts from the preprocessing notes
    - `exclusion()`
    - `summarize()`: per setup key, silent below 10 passages
    - `trend()`: two windows of 20 passages within one key, differences only
    - `draftingRevision()`: during against after
- **Ledger changes:**
    - `dict` events gain `setup`, `fillers`, `doubled`, `falseStarts`, `artifact`, `retried` and `space`. Counts only, never transcript text.
    - `rec` start and `sprint` start events carry `setup`.
    - `revise` events carry the sprint they happened in.
- **Hook changes:** retried passages are marked `retried: true`. All signals are computed inside the existing Writing Mastery hook, so nothing happens while it is off.
- **No UI.** `lib/format.js` is unchanged; a test asserts its checksum.


### 16.13 Step 2 as implemented: the Training sheet, manual exercises, optional ratings

**Training sheet** (Dictation → Training…, ⌥⌘D):
- One screen, organised by the five abilities.
- Each exercise shows a one-line "how", an expandable "Why" that states honestly how much evidence stands behind it, its options as plain choices, and **Start**.
- Each ability shows factual counts (practised, days, completed), an author-set stage (Learning, Practising, Independent), and a History table: date, options, status, felt, active minutes, composed words, and words revised during and after drafting.
- History compares sessions only with the same exercise, options and setup, and only once there are 3 sessions in each half. It shows earlier against recent figures, with no judgement words.
- No XP, badges, levels or scores.

**Exercises (9).** All run inside an ordinary sprint in the author's current chapter, and the writing stays in the book.

| Ability | Exercises |
|---|---|
| Composition | Sentence in mind; Three moments ahead (asks afterwards how many of the three landed) |
| Drafting | Draft now, fix later |
| Dialogue | Two voices; Beats, not tags |
| Scene | One scene, start to finish (asks whether the scene reached its end); One take |
| Endurance | Sprint length; Session length (several sprints in one exercise, with silent breaks between) |

Eyes forward, beat cards, voice commands and the Practice space are not built (steps 3–4).

**How an exercise runs:**
- **Start** closes the sheet, starts a sprint at the exercise's length (or joins a sprint already running), and returns the caret to the writing. The bar shows the exercise name in place of "Sprint N". Nothing else changes while writing.
- **Status** follows from the sprint: *completed* at 80% or more of the planned time, *ended early*, *interrupted* (recovered after a crash), or *abandoned* (discarded or turned off).
- "End Exercise" is in the sprint menu and in the sheet.

**After an exercise:**
- One small panel offers "How did that feel? Easy · About right · Hard", plus the exercise's own question if it has one, with × to dismiss.
- It never appears while recording, and waits until dictation stops. It moves away when the author types or records, and never pops up at launch.
- It is optional: a dismissed or unanswered attempt keeps its status, and can be rated later from History.

**Ledger events** (same file and integrity rules as §7.4; counts and choices only, filtered through a whitelist so no text can be stored):

| `type` | Fields |
|---|---|
| `ex` (`op: start`) | `attempt`, `exercise`, `ability`, `params`, `sprint`, `sprintsPlanned`, `setup`, `space`, `stage`, `paraStart` |
| `ex` (`op: sprint`) | Each further sprint of a session exercise |
| `ex` (`op: end`) | `status`, `paraDelta` (paragraphs added in the same chapter). Id `exend:<attempt>`, so a second end is impossible. |
| `ex.rating` | `felt`, `sprint`, `setup`. Id `rating:<attempt>`; the first rating stands. |
| `ex.evidence` | `key`, `value` (a short choice) |
| `stage` | `ability`, `stage`, `by: author` |

**Prepared for adaptive training (not active).** `trainingProfile()` returns, per ability: stage and when it was set, attempted, completed, ended early, felt counts (with unrated counted separately), days practised, last practised, and attempts per exercise. With `attemptCharacteristics()` and `comparable()`, this is the input the §16.5 progression rules and §16.5a stage transitions will read. Nothing recommends, advances or changes a stage automatically.

**Fixed along the way:**
- **Settings after creating a book.** Creating a book replaced the window's settings with a copy missing the provider list. That would have tagged setup keys with "default" instead of the model, and could break the status label. Settings are now merged, and the setup key falls back to a cached provider list.
- **Panel placement.** The after-exercise panel sat on top of the sprint's quiet line; it now sits above it.
- **Grammar.** The sprint line now says "1 minute".

## Sources

Seth Ring (primary, his own blog):
- [27 Books In 5 Years — Here's How I Did It](https://sethring.com/blog/27-books-in-5-years-heres-how-i-did-it-deliberate-practice/) (2024-01-22)
- [Goals: The Cornerstone of Progress](https://sethring.com/blog/goals-the-cornerstone-of-progress-deliberate-practice/)
- [The Best Sort of Feedback](https://sethring.com/blog/the-best-sort-of-feedback-deliberate-practice/)
- [Dictation — How To Write 4 Books In 3 Months](https://sethring.com/blog/dictation-how-to-write-4-books-in-3-months/)
- [Come Join My Daily Writing Sprints](https://sethring.com/blog/come-join-my-daily-writing-sprints/)
- Interviews not used for numbers: [The Novel Writing Podcast](https://podcasts.apple.com/ga/podcast/seth-ring-on-dictating-your-books/id1675069953?i=1000729233340&l=en-GB), [The Margins](https://themarginswriting.substack.com/p/hacking-your-writing-output-with)

Research. Bibliographic details were confirmed by search; full texts were not all read, and figures from secondary summaries are marked as such above.
- Locke & Latham (2002). [Building a practically useful theory of goal setting and task motivation](https://doi.org/10.1037/0003-066X.57.9.705). *American Psychologist*, 57(9), 705–717.
- Gollwitzer & Sheeran (2006). [Implementation intentions and goal achievement: a meta-analysis](https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f). *Advances in Experimental Social Psychology*, 38, 69–119.
- Lally, van Jaarsveld, Potts & Wardle (2010). How are habits formed. *European Journal of Social Psychology*, 40, 998–1009. [UCL summary](https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit)
- Silverman & Barasch (2023). [On or Off Track: How (Broken) Streaks Affect Consumer Decisions](https://udspace.udel.edu/items/42ce576b-8e1f-429a-8541-e29e48dbcfbb). *Journal of Consumer Research*, 49(6), 1095–1117.
- Deci, Koestner & Ryan (1999). [A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation](https://depts.washington.edu/techdocs/papers/deciExtrinsicRewardsAndIntrinsicMotivation99.pdf). *Psychological Bulletin*, 125(6), 627–668.
- Amabile & Kramer (2011). *The Progress Principle*. [AMA interview](https://www.amanet.org/articles/the-worth-of-small-wins-teresa-amabile-and-steven-kramer-on-the-progress-principle/)
- Macnamara, Hambrick & Oswald (2014). [Deliberate practice and performance in music, games, sports, education, and professions](https://pubmed.ncbi.nlm.nih.gov/24986855/). *Psychological Science*, 25(8), 1608–1618.
- Biwer et al. (2023). [Understanding effort regulation: Comparing "Pomodoro" breaks and self-regulated breaks](https://cris.maastrichtuniversity.nl/en/publications/understanding-effort-regulation-comparing-pomodoro-breaks-and-sel). *British Journal of Educational Psychology*.
- Boice (1990). *Professors as Writers*; Krashen (2002) reanalysis, via [Writing Commons](https://writingcommons.org/article/the-writing-log/).

Added in revision 3:
- Gould (1978). How experts dictate; and Gould & Boies (1978), Writing, dictating, and speaking letters. IBM Research ([abstracts](https://researcher.watson.ibm.com/publications/how-experts-dictate), [letters](https://research.ibm.com/publications/writing-dictating-and-speaking-letters)).
- Kellogg (1988). [Attentional overload and writing performance: effects of rough draft and outline strategies](https://scholarsmine.mst.edu/psysci_facwork/284). *JEP: Learning, Memory, and Cognition*, 14, 355–365.
- Kellogg (2008). [Training writing skills: a cognitive developmental perspective](https://www.jowr.org/jowr/article/view/759). *Journal of Writing Research*, 1(1), 1–26.
- Quinlan (2004). Speech recognition technology and students with writing difficulties. *Journal of Educational Psychology*, 96, 337–346 (abstract via [secondary source](https://swaaac.squarespace.com/s/EBP_Speech-To-Text_PaigeV2.pdf)).
- Kluger & DeNisi (1996). [The effects of feedback interventions on performance](https://pluto.huji.ac.il/%7Emskluger/files/Download/Kluger%20&%20%20DeNisi%20abstract.doc). *Psychological Bulletin*, 119, 254–284.
- Pajares (2003). Self-efficacy beliefs, motivation, and achievement in writing. *Reading & Writing Quarterly*, 19; Pajares, Johnson & Usher (2007), via [Springer review](https://link.springer.com/10.1007/s10648-023-09798-2).
- Cepeda, Pashler, Vul, Wixted & Rohrer (2006). [Distributed practice in verbal recall tasks](https://pubmed.ncbi.nlm.nih.gov/16719566/). *Psychological Bulletin*, 132(3), 354–380.
- Solomon et al. (2003). [Effects of a vocally fatiguing task and systemic hydration on men's voices](https://digitalcommons.memphis.edu/facpubs/15576); Gerosa, [vocal loading thesis](https://edepositireland.ie/handle/2262/98140).
