# Voxa — PRD

As of 2026-11-06. Source of truth while editing: the [PRD doc](https://claude.ai/artifact/1SYAcyzh5D68B4ve6hMhjd).
Personal details (employer, projects, meeting contents) live in a local context file outside the repository.

## Problem and goal

Voxa is a personal voice-first app that gets its user speaking English in work meetings within 1 to 1.5 months.

- **User:** a software engineer between intermediate and advanced level: understands most of a meeting, but freezes when speaking because he has never practised it.
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

1. **Serious mistake** (it gets in the way of understanding, or it is already in the mistake bank): the tutor pauses the conversation and gives a hint so the user corrects himself. It does not just say the correct sentence.
2. **Small mistake** (does not get in the way): recorded silently and shown in the end-of-session summary, so fluency is not broken.
3. **Attempts:** up to 2 hints. After the second miss, the tutor gives the correct form and asks the user to repeat it, then the conversation resumes.

**Research basis:** prompts (hints that push self-correction) had larger effects than recasts in Lyster and Saito's 2010 meta-analysis; immediate correction was more effective than delayed in several studies, but two found no difference. The serious/small split and the number 2 are design choices, not research findings.

## Mistake bank and end-of-session summary

Every mistake the tutor detects, serious or small, becomes a record in the mistake bank, and every session ends with a summary of that session's mistakes.

- **Record:** language (BCP 47), what the user said, the correct form, category (grammar, vocabulary, pronunciation, ...), occurrences, first and last seen, the session it came from.
- **Repeat detection:** a mistake that matches an existing record increases its count instead of creating a new one; a mistake already in the bank counts as serious (see Correction rules).
- **Status:** Open, Improving or Mastered (approved in the prototype). Open: new, or made again. Improving: the correct form was used in a later session. Mastered: correct in 3 different sessions without the mistake again. Making it again sends it back to Open (confirmed on 2026-11-06).
- **"This isn't a mistake":** the user can dismiss a record, for example when the speech-to-text misheard him; it leaves the bank and does not count again.
- **Summary at the end of a session:** the mistakes of the session (serious and small) with their correct forms, plus the 4 fluency signals: self-correction rate, mistakes per 100 words, pause before answering, share of speaking time.
- **Confidence check:** before and after a session, the user rates how ready he feels for that meeting type (1 to 5), as in the approved prototype.

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
- [ ] A mistake already in the bank is treated as serious.
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
- [ ] The confidence check (1 to 5) is asked before and after a session and stored.

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
| D5 | Session summary | End-of-session summary, 4 fluency signals, confidence check before and after | D4 |
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
