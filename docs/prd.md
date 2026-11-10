# Voxa — PRD

As of 2026-11-09. Source of truth while editing: the [PRD doc](https://claude.ai/artifact/1SYAcyzh5D68B4ve6hMhjd).
Personal details (employer, projects, meeting contents) live in a local context file outside the repository.

## Problem and goal

Voxa is a personal voice-first app that gets its user speaking English in work meetings within 1 to 1.5 months.

- **User:** a software engineer who reads and listens to English well but has almost no speaking practice, so he freezes when speaking. His speaking level is measured, not assumed (see Speaking level and help).
- **Today:** in English meetings with sponsors (team reports, projects, what the apps do), dailies, plannings and reviews, he stays quiet and relies on others.
- **Short-term goal:** freeze less, and give project updates and daily updates fluently.
- **Time available:** 30 to 60 minutes a day, spread across the day.
- **Later:** other languages, and maybe a commercial product.

## Scope

The MVP is a voice conversation practice loop with hint-based correction and a mistake bank; everything else comes after it is in daily use.

| Phase | Features |
| --- | --- |
| MVP | 4 conversation modes, automatic turn detection, hint-based correction, mistake bank, end-of-session summary |
| 2 | Spaced-repetition flashcards fed by the mistake bank |
| 3 | Progress dashboard (strengths, weaknesses, timeline) |
| 4 | Micro-fluency drills (short phrases repeated aloud; 4/3/2 technique still to confirm in Nation's papers) |
| 5 | Short written exercises |
| 6 | Real-world examples of expressions (PlayPhrase/YouGlish, integration to verify) |
| 7 | Desktop writing monitor (Grammarly-style, shares the mistake bank) |
| 8 | Use from the phone away from home |

**Non-goals for the MVP:** multiple users and login, other languages in the UI (the data model supports them), cloud hosting of the voice models, commercial features.

## Learning method: the daily mission

The daily mission is the next priority (approved on 2026-11-09), ahead of the remaining phases: one situation a day, in 5 steps that cover the four strands of a balanced course (Nation), in order, with nothing for the learner to decide.

**Why:** the app was strong on speaking, hints and spaced review, but weak on listening input and fluency training (no task is ever repeated), so the learner could practise without improving. It also gave no starting point when he is stuck: steps 1 and 2 give him a model and phrases to start from.

| # | Step | Strand | Time at a 30-minute goal | What happens |
| --- | --- | --- | --- | --- |
| 1 | Listen | Meaning-focused input | about 4 min | The tutor does the task first, at the learner's level. Audio only; the text shows when tapped. |
| 2 | Take 3 expressions | Language-focused learning | about 3 min | 3 ready-made expressions from the model; the learner says each aloud in a sentence of his own. They join the spaced review. |
| 3 | Do the task | Meaning-focused output | about 10 min | The conversation with hints, as today. The tutor invites the 3 expressions and, when answers stay very simple, asks for a slightly fuller one (an invitation, never a correction). |
| 4 | Say it faster | Fluency development | about 5 min | The learner tells the same content 3 times, in 2, 1.5 and 1 minute (a shortened 4/3/2; half that at A1–A2, whose answers don't fill 2 minutes), with no correction. The app shows how the pace changed. |
| 5 | Review | Retrieval practice | about 3 min | The existing voice review. |

- **Benchmark task every 2 weeks:** always the same prompt (for example, present your project in 2 minutes), compared with earlier runs: pace, pauses, mistakes per 100 words, linking words per 100 words (because, but, although, if…; not "so" or "then", which are also fillers: answers that link ideas say more than a list of short sentences), and the old recording to listen to. Right after it, 1 minute on a topic never given before (last weekend, a problem solved, explaining something you know well, a change you'd like, a place you remember, someone you admire, next month's plans, a recommendation, a childhood memory, a hard decision; then the one whose last time is the oldest), so speech that was not rehearsed is measured too; it is compared only with the earlier topic tasks, and if skipped it waits for the next check-in (2026-11-10, Henok chose 1 minute). In the app, the check-in result offers "One more minute: a new topic" or "Not now"; opened later the same day, the check-in goes straight to the open topic task.
- **Other modes stay:** free talk and the other conversations remain available outside the mission.
- **Delivery order:** say it faster (4), benchmark task, listen and take expressions (1 and 2), fuller answers in the task (3), then the mission on Today joining them. Screens are designed in the prototype and approved before building.
- **Research basis:** Nation and Yamamoto 2012 (four strands); Arevart and Nation 1991 and Tran and Saito (4/3/2: faster speech and fewer pauses, carried over to a new topic, no accuracy gain); Boers et al. 2006 (formulaic sequences and perceived fluency); DeKeyser and Criado 2013 (skill acquisition stages).
- **Decided:** on 2026-11-09, the app picks the day's situation (rotation) and the benchmark keeps its audio (no audio is stored today, only transcripts); step times scale with the daily goal.

## Conversation modes

Project presentation and free talk are the priority; daily and review are also in the MVP.

| Mode | The tutor plays | What the user practises |
| --- | --- | --- |
| Project presentation | A sponsor or stakeholder who asks follow-up questions | Explaining a project, its decisions and its status |
| Free talk | A colleague chatting about general topics | Speaking without a script |
| Daily | A teammate running the standup | Yesterday, today, blockers |
| Review | A sponsor or product person in a sprint review | Showing what was delivered and answering questions |

In the work modes the tutor uses the user's professional context (role, organization, projects, domain vocabulary). That context lives in a local, git-ignored file outside the repository, because it is personal data.

## Correction rules

The tutor corrects with hints, at once, only when a mistake matters; the user confirmed these rules on 2026-11-06.

1. **Serious mistake** (it gets in the way of understanding): the tutor pauses the conversation and gives a hint so the user corrects himself. It does not just say the correct sentence. A small mistake also pauses when its pattern is in focus (due for review, or behind one of the session's practice targets), only the first time that pattern is broken in the session; a small mistake that merely repeats one in the bank no longer pauses (changed on 2026-11-10, so a growing bank does not fill every conversation with hints).
2. **Small mistake** (does not get in the way): recorded silently and shown in the end-of-session summary, so fluency is not broken.
3. **Attempts:** up to 2 hints. After the second miss, the tutor gives the correct form and asks the user to repeat it, then the conversation resumes.

4. **Keeping the conversation going:** asking to repeat, checking a word, buying time or saying something another way is a success, never a mistake or being stuck; the tutor answers it as a good partner would, and when the user is stuck the written help may offer one such phrase (2026-11-10; communication strategies, Dörnyei and Scott 1997).

**Research basis:** prompts (hints that push self-correction) had larger effects than recasts in Lyster and Saito's 2010 meta-analysis; immediate correction was more effective than delayed in several studies, but two found no difference. The serious/small split and the number 2 are design choices, not research findings.

## Mistake bank and end-of-session summary

Every mistake the tutor detects, serious or small, becomes a record in the mistake bank, and every session ends with a summary of that session's mistakes.

- **Record:** language (BCP 47), what the user said, the correct form, category (grammar, vocabulary, pronunciation, ...), occurrences, first and last seen, the session it came from.
- **Repeat detection:** a mistake that matches an existing record increases its count instead of creating a new one; it counts as serious only when its pattern is in focus (see Correction rules).
- **Slow recall:** a right review answer the learner started more than 6 s after the cue showed keeps the item at its step instead of moving it forward, since in a conversation the words have to come fast (2026-11-10; the 6 s bar is a design choice to tune).
- **Review queue:** a review asks for the learner's own mistakes and new words before the expressions taken from models, so the 3 expressions that join every day never crowd out real mistakes; a due expression the learner uses in a conversation counts as its review (2026-11-10).
- **Practice targets:** each session practices 2 mistakes from the bank: patterns due for review first, then mistakes not mastered yet; within each, the ones that got in the way of understanding come before more frequent small slips (2026-11-10).
- **Status:** Open, Improving or Mastered (approved in the prototype). Open: new, or made again. Improving: the correct form was used in a later session. Mastered: correct in 3 different sessions without the mistake again. Making it again sends it back to Open (confirmed on 2026-11-06).
- **"This isn't a mistake":** the user can dismiss a record, for example when the speech-to-text misheard him; it leaves the bank and does not count again.
- **Summary at the end of a session:** the mistakes of the session (serious and small) with their correct forms, plus the fluency signals: self-correction rate (now labelled "fixed with a hint"), mistakes per 100 words, pause before answering, pace (words a minute of the learner's own speech, with long pauses of 1 s or more inside an answer). Pace replaced the share of speaking time on 2026-11-07, which mostly measured how much the tutor talked. Words per answer was added on 2026-11-10 as a complexity signal, so the others can't improve just by saying less (Skehan 1998: complexity, accuracy and fluency trade off).
- **Inferred confidence:** the user is not asked how ready he feels. Each practice session's signals (including the share of answers without help) are stored, and the summary says what went better than in his last 3 sessions, only when there is data. What went worse is not listed. Replaced the 1–5 check before and after a session on 2026-11-07.

## Speaking level and help

Approved on 2026-11-07 (leveling and guided track design).

- **Placement interview:** a short OPI-style conversation that only observes and never corrects; it estimates a CEFR level with the user's own lines as evidence. A new one is suggested every 4 weeks.
- **Level:** shown in the Progress tab, where the user can also set it by hand.
- **Support step by level,** inside the existing modes: A1 a full guided track (repeat a model sentence, with the sentence hidden until tapped; say it with his own information; add a piece; answer alone; say the answer again); A2 the model only when he is stuck; B1 free talk plus the start of a sentence when stuck; B2 conversation as before; C1–C2 more demanding. From B1 up the tutor talks as people really do (usually two to four sentences, sometimes its own view or a short story) and about one turn in four asks an unexpected but natural question (a new angle, a "what if", a different opinion), so the learner practices following real speech and answering what they did not prepare; below B1 its lines stay short (one to three sentences).
- **Step changes in a session:** two goals answered without help skip the model; stuck twice brings it back.

## Voice loop

A session is a hands-free voice conversation: the user speaks, the app detects when he stops, and the tutor answers aloud.

1. The browser captures the microphone and detects the end of a turn automatically (voice activity detection), with no push-to-talk.
2. The audio of the turn goes to the API over a persistent connection (WebSocket).
3. The API sends it to the local voice service: faster-whisper transcribes it.
4. The API sends the transcript, the history and the mode prompt to Claude, which returns the tutor's line and any mistakes found.
5. The voice service turns the tutor's line into speech with Kokoro, and the browser plays it.
6. The transcript of both sides is shown as captions; a hint is shown on a hint card while it is spoken.

**Latency:** the loop must feel like a conversation. No target number is set yet; it will be measured on the user's PC (open question).

**Known risk:** Whisper may "clean up" grammar while transcribing and hide the mistakes the tutor should catch. To be tested early.

## Acceptance criteria (MVP)

Each criterion below becomes at least one automated test; voice criteria are also checked by the user on his PC.

**Conversation modes**

- [ ] The user can start a session in each of the 4 modes: project presentation, free talk, daily, review.
- [ ] In the work modes the tutor's prompt includes the professional context file when it exists, and works without it.
- [ ] Every session and turn is stored with its mode and language.

**Correction**

- [ ] A serious mistake makes the tutor reply with a hint, never with the corrected sentence.
- [ ] A small mistake pauses for a hint only when its pattern is due or behind a practice target, once per pattern per session.
- [ ] After 2 failed hints the tutor gives the correct form and asks the user to repeat it, then resumes.
- [ ] A small mistake gets no interruption and is stored for the summary.

**Mistake bank**

- [ ] Every detected mistake is stored with language, original, correction and category.
- [ ] A repeated mistake increases the count of the existing record.
- [ ] The user can list mistakes, see their status (Open, Improving, Mastered) and mark one as "This isn't a mistake".

**Voice loop**

- [ ] The end of the user's turn is detected without pressing a button.
- [ ] Speech is transcribed by the local STT and the tutor's line is spoken by the local TTS.
- [ ] Captions show both sides; a hint is shown on a hint card.
- [ ] If the voice service or Claude is unavailable, the app shows a clear error state instead of hanging.

**Summary**

- [ ] Ending a session shows its mistakes with correct forms and the 4 fluency signals.
- [ ] The summary compares the session with the last 3 sessions when there is data, without asking the user to rate himself.

**App**

- [ ] The web app installs as a PWA on the PC and on the phone, with the approved design system and 3 tabs: Today, Mistakes, Progress.
- [ ] All UI text is in plain English.

## Architecture and constraints

A pnpm monorepo with three parts; the API core depends only on ports, so the database, the AI and the voice engine can be swapped by writing a new adapter.

| Part | Tech | Role |
| --- | --- | --- |
| `apps/web` | React + Vite PWA, shadcn/ui with the approved Voxa design system | Screens, microphone, turn detection, audio playback |
| `apps/api` | NestJS (TypeScript 6), ports and adapters, Postgres + Drizzle | Sessions, tutor logic, correction rules, mistake bank, WebSocket |
| `services/voice` | FastAPI (Python), faster-whisper + Kokoro, local | Speech-to-text and text-to-speech |

- **Ports:** `LlmPort`, `SpeechToTextPort`, `TextToSpeechPort`, `MistakeRepository` (plus new repositories as needed). No vendor SDK outside `apps/api/src/infra`.
- **Database:** plain Postgres via Drizzle; local Docker at first, Supabase or Neon free tier only as a hosted Postgres later. No Supabase Auth or SDK.
- **Languages:** every learning record carries `language` (BCP 47).
- **Cost:** Claude API within about US$100 a month; usage is tracked. Voice runs locally at no cost.
- **Privacy:** the professional context file and the API key stay out of the repository (`.env` and a git-ignored local file).
- **Hosting:** runs on the user's PC first; phone use away from home is phase 8.
- **Design:** [design system](https://claude.ai/artifact/S2ddUkiZrwZjySsuKFy8CD) and [approved screens and flows](https://claude.ai/artifact/XKuj4GYBY9919apZZvLswB).

## Delivery plan

The MVP splits into 6 deliveries; each one ships as small PRs (about 300 lines), written test-first, reviewed by an independent reviewer, then tested and merged by the user. D1, D2 and D3 can run in parallel.

| # | Delivery | Contents | Depends on |
| --- | --- | --- | --- |
| D1 | Tutor engine | Mode prompts (4 modes + professional context), structured Claude output (reply + mistakes), correction policy (serious/small, 2 hints, then repeat), mistake recording and repeat detection, schema update for the 4 modes, text-only session endpoint | none |
| D2 | Voice service | faster-whisper STT and Kokoro TTS endpoints, API adapters, test of the Whisper clean-up risk, latency measurement on the user's PC | none |
| D3 | Web foundation | shadcn/ui with the Voxa tokens, PWA install, 3 tabs (Today, Mistakes, Progress), API client, error states | none |
| D4 | Live voice session | WebSocket, automatic turn detection (VAD) in the browser, audio playback, captions, hint card, mode picker on Today | D1, D2, D3 |
| D5 | Session summary | End-of-session summary, 4 fluency signals, comparison with the last sessions (inferred confidence) | D4 |
| D6 | Mistakes screen | List, status (Open, Improving, Mastered), "This isn't a mistake" | D1, D3 |

After the MVP is in daily use, each later phase (2 to 8 in Scope) becomes its own delivery, in the order of the Scope table.

## Open questions and risks

- [ ] Latency target for the voice loop (to set after measuring on the user's PC).
- [ ] Does Whisper hide grammar mistakes by cleaning up the transcript? If so, how to work around it.
- [ ] How the tutor tells serious from small mistakes in practice (Claude's judgment with the rule above, to tune with real sessions).
- [ ] Voice ball: face or plain circle (pending in the design).
- [ ] Claude API cost against about US$100 a month.
- [ ] CI is blocked by GitHub billing; choosing between a public repo and fixing billing.
- [ ] Phone use away from home: expose the PC or move voice to the cloud (phase 8).
