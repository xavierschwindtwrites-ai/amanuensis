# Amanuensis: reasons to return to the story

Ideas only, 2026-11-09. No application code changed.

The opportunity is to help the author anticipate a scene, begin with less effort, enjoy composing, and leave with evidence that the book moved forward. More time inside the app is not the outcome. Sustainable work the author wants to return to is.

## Starting point

I read `README.md` and `docs/writing-mastery-system.md`, skimmed `renderer/app.js` and `renderer/mastery.js`, and checked their supporting habits, Training, cover, storage and serialization code.

Already present:

- Exact book/chapter/caret/scroll re-entry, including an anchor that survives changes above the cursor.
- A note for next time in `book.json`, with optional existing voice-note routing; a quiet session acknowledgement.
- Optional Mastery: sprints, overtime, breaks, Today, author-set goals, rest days, and a local ledger that distinguishes composition from imports and revision.
- Nine manual Training exercises across five abilities, optional difficulty ratings, comparable history, and author-set stages.
- Seeded local cover art with title and author. Changing a cover is already an explicit author action.

The roadmap already includes if-then plans, beat cards, Eyes forward, flags, recommendations and progressive disappearance. Entries below identify those overlaps. They are refinements or possible priorities, not claims that these features are absent from the design.

## Shared boundaries

“Secret” means ambient after the author chooses the behavior. It does not mean concealing how the app works. Use existing surfaces and natural pauses; do not add a daily checklist, surprise dialog, notification or extra launch ceremony. The ideas are alternatives, not eighteen things to display together.

Exclude guilt, shame, streaks, streak loss, punishment, expiring rewards and attendance debt. A missed day resets nothing. Keep rest days quiet and goals under the author's control.

All computation and storage stay local. Add no model calls, telemetry, accounts or background analysis of mood. Preserve Mastery's off switch and deletion semantics. Store author-written prompts and references as book metadata or a dedicated local sidecar; keep prose out of the Training event whitelist. New Mastery preferences require explicit additions to `lib/mastery.js` defaults, merge and sanitization rules.

Every idea leaves manuscript words and the transcription/formatting pipeline alone. Keep `lib/format.js`, including `checkWords`, untouched. Put display elements outside `#text`: `serialize()` clones that element, so injecting decorative content into the editor is unsafe even if it looks like an overlay. Author-invoked writing continues through the existing editor. Never start the microphone automatically.

Effort: **S** = a narrow change to an existing surface or metadata field; **M** = coordinated UI, state and persistence work; **L** = a new subsystem. These are relative estimates, not delivery promises.

Each mechanism has research behind it; each particular Amanuensis treatment remains a hypothesis. Studies of shopping, learning or office work do not establish an effect on adult fiction dictation.

## 1. The next physical move

**The author experiences:** In the existing Note editor, an optional “First move” field holds something executable: “Say Sable's first reply.” On return, that short line occupies the existing breadcrumb position. The author can start without reconstructing the entire scene. Ordinary free-form notes still work.

**Mechanism:** Implementation intentions translate an intention into a cue and response. A concrete first move also resembles a ready-to-resume plan. Evidence supports planning and task transitions; increased writing frequency here is an extrapolation. [Gollwitzer & Sheeran, 2006][implementation]; [Leroy & Glomb, 2018][resume].

**Codebase fit:** Refine `openNoteEditor`, `showBreadcrumb` and `addNote` in `renderer/app.js`; extend note selection in `lib/habits.js`. Store the extra field with the note in `book.json`, using the existing metadata save path. No new manuscript command.

**Effort:** S.

**Backfire risk:** Preparing tomorrow becomes homework, or a stale instruction constrains discovery. Keep the field optional, editable and dismissible; save an ordinary note with one action.

## 2. A question waiting in the scene

**The author experiences:** They leave a question they want to discover through writing: “What would make Leif admit he is afraid?” It waits as their next-time note. No generated answer, countdown or forced cliffhanger. They can finish today's scene before leaving the question.

**Mechanism:** Curiosity's information-gap account suggests that a specific unknown can draw attention. Task resumption is also relevant, but the familiar Zeigarnik memory claim is unreliable: a 2025 meta-analysis found no overall unfinished-task recall advantage, while finding a tendency to resume. A question may invite return; deliberate interruption is not a prescription. [Loewenstein, 1994][curiosity]; [Ghibellini & Meier, 2025][resumption].

**Codebase fit:** A “Question for next time” option or example in the existing `renderer/app.js` note editor. Reuse `lib/habits.js` and `book.json`; no semantic analysis of the manuscript.

**Effort:** S.

**Backfire risk:** The question encourages rumination or creates another problem to solve. Let the author replace it with a concrete first move, or remove it. Never ask them to stop mid-sentence.

## 3. The same doorway

**The author experiences:** Once in Settings they choose a cue: “After coffee, I open this book and read my note.” Amanuensis remembers the book's preferred text size and quiet display setup. Opening it brings them to the same familiar working place, without an animation or intervening screen.

**Mechanism:** Repeating an action in a stable context can build cue-dependent automaticity. If-then planning supplies the intended response. Research does not identify a guaranteed habit-formation deadline. [Lally et al., 2010][habits]; [Gollwitzer & Sheeran, 2006][implementation].

**Codebase fit:** An implementation of roadmap §10.3, plus per-book view preferences. Use `renderer/app.js` Settings, `openBook`, `restorePosition` and `applyTextSize`; `lib/habits.js`; `renderer/styles.css`. Save the author-written cue with book metadata. It need not appear on each launch.

**Effort:** M.

**Backfire risk:** A ritual becomes a prerequisite, making travel or a different schedule feel impossible. Keep normal opening behavior available and preserve the cue across missed days without comment.

## 4. A two-minute landing

**The author experiences:** The Sprint menu includes “Begin with two minutes.” They can read, think, type or dictate. At two minutes the session continues into ordinary overtime. There is no success test, conversion prompt or demand to extend it. Stopping there is a valid session.

**Mechanism:** A small proximal goal can make an intimidating distant task approachable and provide a mastery experience. The supporting classic experiment concerns children's arithmetic, not novel writing; two minutes is a design choice to try, not a researched optimum. [Bandura & Schunk, 1981][proximal].

**Codebase fit:** `renderer/mastery.js` `sprintMenu` and `start({plannedMin})` already provide the relevant seam. Keep this separate from the author's usual `sprintMin`. Preserve `lib/mastery.js`'s ten-minute calibration threshold, so tiny sessions do not distort typical sprint estimates. Use existing explicit Record controls.

**Effort:** S.

**Backfire risk:** The author treats two minutes as another obligation or always abandons sessions when time expires. Avoid a conspicuous deadline signal and any completion grade.

## 5. Choose the work, keep the goal

**The author experiences:** An optional menu lets them choose Draft, Revise or Plan for this visit. In Revise or Plan, the pre-session slot shows their own intention rather than words remaining. They can trim a chapter or solve a scene without a shrinking word count dominating the visit. Their numerical goal stays unchanged.

**Mechanism:** Self-determination theory emphasizes autonomy and competence. Choosing an appropriate task and feedback frame may reduce pressure from a mismatched measure. This specific mode switch has not been tested as a writing intervention. [Ryan & Deci, 2000][autonomy].

**Codebase fit:** `renderer/mastery.js` `showToday`, Progress and session feedback; `renderer/app.js` session hooks and notes. If persisted, add a declared mode field through `lib/mastery.js`. Preserve every existing count and attribution rule. A mode is author-supplied context, not a new productivity score.

**Effort:** M.

**Backfire risk:** Choosing a mode becomes one more decision, or the app starts judging how well a revision went. Default to the existing experience, remember only if requested, and make no automatic quality claims.

## 6. Numbers disappear when the story starts

**The author experiences:** With “Quiet while composing” enabled, word counts and the sprint countdown recede after they start writing. Record/Stop, recording state and errors remain clear. Moving to the bar reveals the figures. At a natural pause the normal controls return.

**Mechanism:** Flow research concerns absorption and the relationship between challenge and skill. Reducing invitations to self-monitor is a plausible design implication, not proof that hiding a timer causes flow. [Engeser & Rheinberg, 2008][flow].

**Codebase fit:** Extend the existing hidden-chrome approach in `renderer/styles.css`; use activity and recording state in `renderer/app.js` and `renderer/mastery.js`. Keep statistics updating underneath. This is separate from the roadmap's Eyes forward treatment of manuscript paragraphs.

**Effort:** S.

**Backfire risk:** The author loses time awareness or cannot see recording status. Offer instant reveal, keep microphone state visible, respect reduced motion, and never conceal an error or Stop control.

## 7. Park the snag

**The author experiences:** During a self-chosen drafting session they can mark a passage “look at this later” without leaving the scene. At a later pause they can open a short list and jump to each passage. Nothing replaces a word, and they remain free to edit immediately.

**Mechanism:** Externalizing a concern with a return plan may reduce the need to keep rehearsing it. This draws on plan-making and attention-residue research. Deferring revisions is a workflow hypothesis: rough drafting did not itself improve text quality in Kellogg's experiments. [Masicampo & Baumeister, 2011][plans]; [Kellogg, 1988][planning].

**Codebase fit:** Prioritize the already-designed §16 “flag that”/Fix pass work. `renderer/app.js` supplies passage IDs and anchors; `renderer/apprentice.js` supplies exercise boundaries; metadata stores references. Start with a keyboard or menu action. Any later voice phrase must follow the approved conservative routing design without touching `lib/format.js`.

**Effort:** M for keyboard parking; L with the complete voice-command and Fix pass workflow.

**Backfire risk:** An accumulating queue feels like debt. Keep it out of the launch view, show no overdue count, and allow deletion of a flag without requiring a fix.

## 8. Read into the voice

**The author experiences:** A small “Read in” action near the breadcrumb shows the few paragraphs preceding their saved cursor in a noneditable reading view. One action returns to the exact caret. Where saved audio maps to that passage, “Listen” can replay it on request. Nothing plays at launch.

**Mechanism:** Reinstating context can aid retrieval. Applying context-dependent memory findings to a local passage or the author's own recorded voice is indirect; the practical hypothesis is that a short read-in restores scene context with less hunting. [Smith & Vela, 2001][context].

**Codebase fit:** Reuse `chapterPlain`, `restorePosition` and the existing Listen/player path in `renderer/app.js`; `lib/habits.js` resolves anchors. Place the reading view outside `#text` in `renderer/index.html`. Read existing chapter/audio data locally; add no summary generation.

**Effort:** M.

**Backfire risk:** Reading turns into polishing, or hearing their own voice makes the author self-conscious. Keep it brief, optional and one action away from the caret; support text alone.

## 9. One beat in sight

**The author experiences:** Before a scene sprint, they can jot three moments. The card folds away when writing begins. If they reach for it, it shows the next moment they selected, rather than a full outline. Only the author advances or changes it.

**Mechanism:** Advance planning can reduce demands during translation into prose. Kellogg found benefits for mental as well as written outlines, so a visible checklist is not essential. This card and its fiction use remain hypotheses. [Kellogg, 1988][planning].

**Codebase fit:** A refinement of planned beat cards in §16, extending today's “Three moments ahead” exercise. Use `renderer/apprentice.js`, `lib/apprentice.js`, `renderer/index.html` and `renderer/styles.css`. Store free text in book metadata or a separate sidecar; the existing exercise ledger intentionally rejects prose. Keep the card outside the serialized editor.

**Effort:** M.

**Backfire risk:** Ticking beats competes with composing or makes discovery feel wrong. No automatic detection, missed-beat labels or percentage score; author-written departures from the plan are welcome.

## 10. An honest head start

**The author experiences:** If they left a note and selected a scene, the pre-session area can say “Next scene chosen · first move ready.” They see the preparation they already did. It disappears when writing starts. No extra tasks appear when there is nothing prepared.

**Mechanism:** Endowed progress studies found greater persistence when people perceived a task as already underway. Those experiments often used artificial advancement. This proposal recognizes actual preparation; whether that produces the same effect is untested. [Nunes & Drèze, 2006][endowed].

**Codebase fit:** Derive the line from existing notes and chapter selection in `renderer/app.js`; coordinate with `renderer/mastery.js`'s `showToday` slot and `lib/habits.js`. No progress event or invented credit is necessary.

**Effort:** S.

**Backfire risk:** It feels like a disguised checklist or overstates what a note accomplishes. Use factual text only when relevant metadata exists. Never describe opening the app as a percentage of the writing goal.

## 11. Your own finish line

**The author experiences:** Before a later session, Today can show “1,300 of your 2,000 words · about one sprint left” instead of only the remaining deficit. An alternative is an author-set scene endpoint. Once reached, the line settles; it never supplies a larger target.

**Mechanism:** Goal-gradient research finds increased effort as a goal approaches. Its loyalty-program evidence does not establish a writing effect. Use a goal the author chose and truthful remaining work, with the uncertainty of sprint estimates intact. [Kivetz, Urminsky & Zheng, 2006][gradient].

**Codebase fit:** Refine `showToday` and `estimateText` in `renderer/mastery.js`, using `dayStats` and `estimate` in `lib/mastery.js`. Preserve net-growth goal semantics, rest-day suppression, disappearance during activity, and author control. Scene endpoints require manual confirmation, not inference from word counts.

**Effort:** S for the word-goal framing; M for scene endpoints.

**Backfire risk:** A nearby number invites padding, rushing or working past a comfortable stop. Keep it off the live composing surface and never add “just a little more” messaging.

## 12. A book with weight

**The author experiences:** On the shelf, a restrained page edge gives the manuscript a sense of physical volume. The cover and author name stay familiar. An optional detail can translate the current word count into approximate manuscript pages using a stated assumption. No percentage appears unless the author supplies an intended length.

**Mechanism:** The progress principle suggests value in noticing concrete movement on meaningful work. Making an abstract word total tangible is a design extrapolation, not a validated motivational treatment. [Amabile & Kramer, 2011][progress].

**Codebase fit:** Extend `bookTile` in `renderer/app.js`, the local cover presentation in `renderer/covers.js`, and `renderer/styles.css`. Use current manuscript word counts, without reading text or regenerating the cover seed. Keep the shelf optional in the flow; instant re-entry should still open the book directly.

**Effort:** M.

**Backfire risk:** Volume becomes the measure of value, and revision makes the book look worse. Prefer a neutral page-count detail over animated growth or shrinkage; label estimates and offer the original cover view.

## 13. A line worth coming back to

**The author experiences:** They mark a sentence they like as a private favorite. On a shelf visit, one chosen excerpt appears beside the book. With several favorites, a local rotation can offer variety once per visit. They can pin one, browse all, or hide them. No quantity threshold unlocks anything.

**Mechanism:** Enjoyment during goal pursuit can support persistence. Returning to a passage the author likes may supply immediate pleasure from the work itself. Research supports immediate enjoyment, not this particular excerpt treatment or a claim about dopamine. [Woolley & Fishbach, 2017][enjoyment].

**Codebase fit:** Add an explicit selection/context-menu action and read-only shelf excerpt in `renderer/app.js`; use `lib/habits.js` anchors and `book.json` metadata. If the source changes, show the saved favorite as a labeled snapshot or remove its reference; never restore it into the chapter.

**Effort:** M.

**Backfire risk:** The author compares a rough draft with their best sentence, or browses favorites instead of writing. Keep excerpts author-selected and small. Any variety is noncontingent: no rarity, refresh reward loop or missing-out message.

## 14. Story receipts

**The author experiences:** After a meaningful session they may add a few words beside its existing acknowledgement: “Sable finally tells the truth.” Later, Progress can show a handful of these receipts across recent writing visits. Revision can earn a receipt such as “Found the ending,” even when word count falls.

**Mechanism:** The progress principle concerns meaningful progress, which a word count only approximates. Self-authored descriptions can preserve evidence of narrative work without asking software to judge craft. This extension is untested. [Amabile & Kramer, 2011][progress].

**Codebase fit:** `renderer/app.js` `endSession`/`showAck` provide the natural pause; `renderer/mastery.js` provides the author-opened review. Also provide a manual action for revision/planning visits: today's acknowledgement requires positive growth and may not appear. Store optional prose in book metadata, separate from Mastery counts. Keep it distinct from a next-time note so it cannot supersede the active breadcrumb.

**Effort:** M.

**Backfire risk:** Reflection becomes a report the author owes the app. Offer a small action on the acknowledgement, never an automatically focused question, and require no receipt for a session to count.

## 15. Training from the scene's need

**The author experiences:** Inside Training, they can start from “I want to write this conversation” or “I want to find the next moment.” Amanuensis maps that choice to an existing exercise, with the author's preferred comfortable duration. It starts only when they choose Start. The regular ability-based catalogue remains available.

**Mechanism:** Autonomy and an appropriate challenge can support engagement. This reframes practice as useful work in the book, while keeping difficulty with the author. It does not establish that a drill improves fiction. [Ryan & Deci, 2000][autonomy]; [Engeser & Rheinberg, 2008][flow].

**Codebase fit:** A new entry path in `renderer/apprentice.js` over the catalogue in `lib/apprentice.js`, reusing current sprint and optional-rating hooks in `renderer/mastery.js`. This complements existing exercises; it does not activate the unbuilt adaptive recommendation engine or automatic stage changes.

**Effort:** S.

**Backfire risk:** Training starts feeling like an assessment or adds more choices. Show at most a few task intents, retain direct repeat of a favorite exercise, and preserve “I've got this” independence.

## 16. Leave with runway

**The author experiences:** An optional “Put the book away” action flushes saves and lets them leave a next move in the same small surface. If they already left one, it can read “Saved · next move ready.” They can close or quit normally without answering anything. On return, exact re-entry does the rest.

**Mechanism:** A ready-to-resume plan can reduce attention residue during a transition; specific plans have also reduced intrusive thoughts about unfinished goals in experiments. This supports a clean stopping ritual, not a proven increase in next-day writing. [Leroy & Glomb, 2018][resume]; [Masicampo & Baumeister, 2011][plans].

**Codebase fit:** Compose existing `flushSave`, position capture, note editor and `endSession` in `renderer/app.js`; coordinate flushing with `renderer/mastery.js`. Add a menu action through `main.js` only if needed. Show “Saved” only after persistence succeeds and in-flight dictation settles; never stop a recording to complete the ritual.

**Effort:** M.

**Backfire risk:** A pleasant ending becomes a compulsory exit form. Do not intercept window close or quit, block departure on a note, or invite another sprint after the author chooses to stop.

## 17. A private dedication

**The author experiences:** In book details, they can write why this particular novel matters: “For the reader who needs an unlikely friendship.” If they choose, it appears inside the shelf's book-detail view alongside their author name. They encounter their own reason, without motivational copy from the app.

**Mechanism:** Identity-based motivation research examines how salient identities influence action and interpretations of difficulty. A self-authored dedication may reconnect the project with a valued identity. A book-detail cue for an adult novelist is a substantial extrapolation from that literature. [Oyserman & Destin, 2010][identity].

**Codebase fit:** `renderer/app.js` book details/modal and cover metadata; `renderer/index.html` and `renderer/styles.css` for presentation; an optional `book.json` field. Treat this as private project metadata, not an automatic export dedication or title-page addition.

**Effort:** S.

**Backfire risk:** “I am a writer” turns into a standard the author fears failing. Prefer their own project-specific purpose, allow no dedication, and never tie identity language to output or attendance.

## 18. A question for the walk

**The author experiences:** When choosing a break, they can carry one of their own unresolved scene questions with them: “What does Sable stand to lose?” The break view shows it once, then stays quiet. There is no response deadline. A next-time note can hold any idea they return with.

**Mechanism:** Creative incubation research found benefits for previously encountered divergent-thinking problems after an undemanding intervening task. Applying this to a walk and fiction plotting is indirect. A break may help; the app should not promise an answer or assign thinking during rest. [Baird et al., 2012][incubation].

**Codebase fit:** Add an author-invoked action to `renderer/mastery.js`'s existing break menu, drawing from notes in `renderer/app.js`/`lib/habits.js`. Preserve the silent break, optional timer and existing recording controls. No sensors, background microphone or activity tracking.

**Effort:** S.

**Backfire risk:** Rest becomes another writing assignment. Keep an ordinary question-free break as the default, and let a question wait until another day.

## A small first experiment

Start with **1 (next physical move), 4 (two-minute landing), and 16 (leave with runway)** as a coherent arrival/departure loop. Try **6 (numbers disappear)** separately if visible counting pulls attention out of the scene. **14 (story receipts)** is the strongest candidate for recognizing revision and planning without making more words the only accomplishment.

The author can try one change for several chosen writing visits and judge: Was starting easier? Did the session feel absorbing? Was stopping comfortable? Did they want to return to the story? Optional local notes are enough. App-open counts, longer sessions and higher word totals cannot establish that a feature helped. Remove or hide a treatment that feels like work, even if output rises.

Do not build an intermittent reward system merely because “variable rewards” sound compelling. Excerpts and covers can be pleasurable without becoming prizes. Expected tangible rewards can undermine intrinsic motivation under some conditions; that does not mean all feedback is harmful. The existing factual, task-focused stance is a good constraint. [Deci, Koestner & Ryan, 1999][rewards].

## Research references and limits

The links beside each mechanism point to research papers, author copies, institutional records or the researchers' account of their work. I checked publication details and accessible abstracts/text. I have not reproduced their analyses. None tests this proposed Amanuensis feature set.

| Reference | Why it matters here |
|---|---|
| Gollwitzer & Sheeran (2006), *Implementation intentions and goal achievement*. | Meta-analysis of if-then plans across contexts; no fiction-specific effect assumed. |
| Leroy & Glomb (2018), *Tasks Interrupted*. | Four studies of attention residue and ready-to-resume plans; principally about performance on the intervening task. |
| Loewenstein (1994), *The psychology of curiosity*. | Information-gap theory and review; a mechanism account, not a test of author prompts. |
| Ghibellini & Meier (2025), *Interruption, recall and resumption*. | Separates the Zeigarnik recall claim from the Ovsiankina resumption tendency. |
| Lally et al. (2010), *How are habits formed?* | Context repetition and variable growth in automaticity; everyday health behaviors, not writing. |
| Bandura & Schunk (1981), *Cultivating competence, self-efficacy, and intrinsic interest through proximal self-motivation*. | Experimental proximal-goal evidence in children's arithmetic. |
| Ryan & Deci (2000), *Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being*. | Autonomy and competence as conditions supporting motivation. |
| Engeser & Rheinberg (2008), *Flow, performance and moderators of challenge-skill balance*. | Nuanced relationships among flow, perceived difficulty, skill and performance. |
| Masicampo & Baumeister (2011), *Consider it done!* | Experiments on plans and cognitive interference from unfinished goals. |
| Smith & Vela (2001), *Environmental context-dependent memory*. | Review and meta-analysis; semantic scene read-in and own-voice replay are indirect applications. |
| Kellogg (1988), *Attentional overload and writing performance*. | Experimental outline benefits; no quality benefit from rough versus polished drafting. |
| Nunes & Drèze (2006), *The endowed progress effect*. | Artificial advancement in consumer tasks; honest preparation cues need their own validation. |
| Kivetz, Urminsky & Zheng (2006), *The goal-gradient hypothesis resurrected*. | Goal proximity in consumer behavior, not evidence for raising an author's target. |
| Amabile & Kramer (2011), *The Progress Principle*. | Diary-based research on meaningful work; does not show that a progress widget causes motivation. |
| Woolley & Fishbach (2017), *Immediate rewards predict adherence to long-term goals*. | Immediate enjoyment and persistence across goal activities. |
| Oyserman & Destin (2010), *Identity-based motivation: Implications for intervention*. | Identity/action account and intervention evidence in other populations. |
| Baird et al. (2012), *Inspired by distraction*. | Incubation on previously encountered divergent-thinking tasks; not a fiction-writing trial. |
| Deci, Koestner & Ryan (1999), *A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation*. | Effects depend on reward type and contingency; supports caution about controlling prizes. |

[implementation]: https://www.sciencedirect.com/science/article/pii/S0065260106380021
[resume]: https://pubsonline.informs.org/doi/10.1287/orsc.2017.1184
[curiosity]: https://www.cmu.edu/dietrich/sds/docs/loewenstein/PsychofCuriosity.pdf
[resumption]: https://www.nature.com/articles/s41599-025-05000-w
[habits]: https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674
[proximal]: https://doi.org/10.1037/0022-3514.41.3.586
[autonomy]: https://www.selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf
[flow]: https://www.uni-trier.de/fileadmin/fb1/prof/PSY/PGA/bilder/Engeser___Rheinberg_2008.pdf
[plans]: https://doi.org/10.1037/a0024192
[context]: https://people.tamu.edu/~stevesmith/SmithMemory/Smith%26Vela2001.pdf
[planning]: https://scholarsmine.mst.edu/psysci_facwork/284/
[endowed]: https://academic.oup.com/jcr/article-abstract/32/4/504/1787425
[gradient]: https://journals.sagepub.com/doi/10.1509/jmkr.43.1.39
[progress]: https://progressprinciple.com/portfolio-items/the-progress-principle-and-the-psychology-of-everyday-work-life/
[enjoyment]: https://kaitlinwoolley.com/wp-content/uploads/2017/08/woolleyfishbachpspb.pdf
[identity]: https://pmc.ncbi.nlm.nih.gov/articles/PMC3079278/
[incubation]: https://labs.psych.ucsb.edu/schooler/jonathan/sites/labs.psych.ucsb.edu.schooler.jonathan/files/pubs/inspired_by_distraction.pdf
[rewards]: https://selfdeterminationtheory.org/wp-content/uploads/2014/04/1999_DeciKoestnerRyan_Meta.pdf
