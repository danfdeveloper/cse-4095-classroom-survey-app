# AI Development History

A summary of how the AI coding agent (Claude Code, the model Claude Opus 5.5) was guided through building this project. Each phase lists what was asked, what the agent did, any problems found, and the design decisions made where the specs were silent or disagreed.

---

## Specification review

**Prompt:** I shared the five spec documents and asked the agent to describe the project back to me, to confirm we understood it the same way.

**Agent output:** It gave a summary of the architecture: a React SPA, Supabase for auth, Postgres, RLS and RPC functions, Cloudflare Pages for hosting, and a single instructor with anonymous students. It also flagged these issues:

- TODO.md used `/s/:surveyId` while UI.md and API.md used `/s/:slug`.
- The security policies give full access to _any_ authenticated user, so public sign-ups must be disabled.
- The overall spec's schema is older than DATABASE.md and is missing `public_slug` and `updated_at`.
- A single global Active survey would block supporting multiple instructors later.

**My direction:** Reset TODO.md so nothing is checked, and treat **DATABASE.md as the source of truth**.

Later I shared the assignment guidelines and asked the agent to compare them with the plan. It found deliverables the plan didn't cover: the spec docs in the repo, a grader login, this history file, the summary report and screenshots. It also found one conflict, about which surveys can be edited (see Phase 5 below).

---

## Phase 1 — Project setup

**Prompt:** "Work on phase 1."

**Agent output:**

- Scaffolded the app with Vite, React and TypeScript.
- Added Tailwind CSS v4, React Router, `@supabase/supabase-js`, Recharts and `qrcode`.
- Set up ESLint and Prettier.
- Created the folders `src/components`, `src/pages`, `src/lib` and `supabase/migrations`.
- Added `.env.example`, the home page, a 404 page and a README.
- Verified that lint and the build pass and that the dev server serves the page.

**Problems:**

- The current Vite template ships `oxlint` instead of ESLint, so the agent replaced it to match TODO.md.
- `typescript-eslint` does not support TypeScript 7 yet. The `npm install` failed with a peer-dependency error, so the agent pinned TypeScript to 6.0.

**Decisions:**

- Added a `VITE_PUBLIC_SITE_URL` env variable so QR codes can point at the production domain instead of whichever host the page was opened on.
- Turned on strict TypeScript mode, added a Prettier plugin that sorts Tailwind classes, and added a 404 page.
- Put the app at the repo root rather than in a `classroom-survey/` subfolder.

Later, at my request, the agent extended `.gitignore` to cover Supabase CLI state, Wrangler (Cloudflare) local files, and all `.env*` files except `.env.example`.

---

## Supabase configuration

**Problem I hit:**

- I put my real Supabase values in `.env.example`, a file that gets committed, instead of `.env.local`.
- I copied the URL with `/rest/v1/` on the end.

The agent spotted both, moved the values into the gitignored `.env.local`, removed the URL suffix, and restored placeholders in `.env.example`. It then confirmed the connection with a health-check request, which returned HTTP 200. Nothing had been committed, so the key never entered git history.

**Configuration in Supabase:**

- Public sign-ups are disabled.
- The instructor account was created manually under Authentication → Users.

---

## Phase 2 — Database

**Prompt:** "Start next phase, and check the boxes in todo when completed."

**Agent output:**

- `supabase/migrations/20261104000000_initial_schema.sql`, which follows DATABASE.md. It contains:
  - the five tables, foreign keys with cascades, and the indexes;
  - the status check, the `updated_at` trigger, the one-active-survey partial unique index, and the duplicate-token unique index;
  - the RLS policies;
  - the `submit_survey_response` RPC.
- `scripts/verify-db.ts` (run with `npm run verify:db`). It creates a temporary survey, runs about 30 checks as an anonymous student and as the instructor, then deletes the survey.

I applied the migration by pasting it into the Supabase SQL Editor.

**Problem:** On the first run, the verify script reported a failure on the "close survey" step. The database was fine. The bug was in the script: the update didn't request the updated row back, so the helper saw no data and treated it as an error. After adding `.select()`, all checks passed.

**Decisions:**

- **Submission RPC written early.** `submit_survey_response` was moved up from Phases 7–8, because verifying that "anonymous students can submit" needs it.
- **No direct anonymous inserts.** Students have no INSERT policy, and every submission goes through the `security definer` RPC, which validates everything in one transaction. DATABASE.md §9 recommends this.
- **Explicit grants.** `anon` can only SELECT `surveys`, `questions` and `choices`. This is defense in depth on top of RLS.
- **Extra error code `INVALID_PAYLOAD`** for malformed input. API.md's list doesn't include it.
- **Every question is required.** The specs don't define optional questions.
- **Submissions lock the survey row** (`FOR SHARE`), so a survey cannot be closed in the middle of a submission.
- **`activate_survey` and `close_survey` are deferred to Phase 6.** For now the verify script changes the status directly.
- **Known issue for Phase 7:** anonymous users cannot see closed surveys, so the student page can't tell "closed" apart from "not found". This will need a small status-lookup RPC.

---

## Phase 3 — Instructor authentication

**Prompt:** "Continue to next phase."

**Agent output:**

- The auth state is split into three files: `src/auth/context.ts`, `AuthProvider.tsx` and `useAuth.ts`. `AuthProvider` restores the session with `getSession` and stays in sync through `onAuthStateChange`.
- `src/components/ProtectedRoute.tsx` sends signed-out users to `/login` and remembers the page they were trying to reach.
- `src/pages/LoginPage.tsx` has labelled email and password fields and a "Logging in..." state that disables the button. It shows friendly error messages instead of raw Supabase errors.
- `src/components/AppHeader.tsx` shows "Signed in as <email>" and a Logout button.
- `src/pages/DashboardPage.tsx` is a placeholder. The real dashboard is Phase 4.
- `src/lib/styles.ts` holds the shared button and input styles. They have 44px touch targets and visible focus outlines.

**Testing:** The agent drove headless Chrome with Playwright against the live Supabase project and checked 11 things:

- The redirect when signed out.
- The message for a wrong password.
- A successful login.
- The email shown in the header.
- The session surviving a page refresh.
- The redirect from `/login` when already signed in.
- Logout.
- `/dashboard` being protected again after logout.
- The 404 page.
- No uncaught errors.

Playwright was installed outside the project, so it is not a project dependency.

**Problem:** On the first run, the "shows signed-in instructor" check failed. The agent checked what the header actually contained, and the email was there. The test had checked visibility once, without waiting, and ran before React finished rendering the header. After changing it to wait for the element, everything passed on two consecutive runs.

**Decisions:**

- **Friendly login errors:** "Incorrect email or password." and "Could not reach the server..." replace the raw error text (API.md §13).
- **Redirect after login:** you return to the page you originally asked for, or `/dashboard` by default.
- **Logout destination:** logout returns you to `/login`.

---

## Phase 4 — Instructor dashboard

**Prompt:** "Continue to next phase."

**Agent output:**

- **Migration `20261105000000_survey_actions.sql`** with three RPCs:
  - `activate_survey` closes any other Active survey, generates a slug and sets the survey to Active.
  - `close_survey` sets an Active survey to Closed.
  - `duplicate_survey` copies the survey into a new Draft called "Copy of ...", with its questions and choices but no responses.
  - All three are `security invoker`, so RLS applies and `anon` cannot call them.
- **`src/lib/surveys.ts`:** the survey types and data functions, plus mapping of database error codes to friendly messages.
- **Dashboard:** survey cards with a text status badge, the creation date and the response count. Each status gets its own set of actions. There is a title search, a status filter, loading, error and empty states, and a New Survey button.
- **`ConfirmDialog`:** built on the native `<dialog>` element, so focus trapping and Escape to cancel come from the browser. It is used for close, archive, delete, and activating a survey when another one is already Active.
- **Placeholder pages** for `/surveys/new`, `/surveys/:id/edit`, `/present` and `/results`.

I applied the migration in the Supabase SQL Editor.

**Testing:**

- `npm run verify:db` was extended to 42 checks. The new checks cover all three RPCs, the activation rules, anon being unable to call them, and archiving.
- A Playwright browser test at phone width (390px) runs 22 checks using the real buttons:
  - activate, then activate a second survey (confirm dialog, the first one closes);
  - Escape cancels a dialog; close, archive and delete;
  - the stronger delete warning when responses exist, and the cascade to responses;
  - duplicate (redirects to the copy's editor);
  - search, the status filter and the no-match state;
  - no horizontal scroll, visible keyboard focus and no console errors.
- The empty "You have not created any surveys yet." state was checked separately.
- The test data was deleted afterwards.

**Problem:** The first draft of the migration revoked the slug generator from `authenticated`. Because `activate_survey` runs with the caller's permissions, activation would have failed with "permission denied". The agent caught this while reviewing its own SQL, before it was applied.

**Decisions:**

- **RPCs written early:** activation, close and duplicate were built now, although the plan puts them in Phases 6 and 12, because the dashboard buttons need them. As a result, the matching Phase 6 and Phase 12 TODO items are checked off.
- **Only Draft surveys can be activated.** Closed surveys are not reopened, which follows UI.md's closed-survey card (Results, Duplicate, Archive). Activating an already Active survey does nothing.
- **Activation validation:** the survey needs at least one question, and every question needs at least two choices (`SURVEY_HAS_NO_QUESTIONS`, `QUESTION_NEEDS_CHOICES`). The specs do not cover this.
- **Slug format:** 6 characters from an alphabet without look-alike characters (no 0, o, 1, l or i), drawn from `gen_random_uuid()` randomness. A slug is created on first activation and kept afterwards.
- **Actions per status:**

  | Status   | Actions                                    |
  | -------- | ------------------------------------------ |
  | Draft    | Edit, Activate, Duplicate, Archive, Delete |
  | Active   | Present, Results, Close, Duplicate         |
  | Closed   | Results, Duplicate, Archive, Delete        |
  | Archived | Results, Duplicate, Delete                 |

  Active surveys must be closed before they can be archived or deleted, and there is no "unarchive".

- **Confirmation only when needed:** activation asks for confirmation only when it will close another survey (UI.md: "avoid excessive modal dialogs").
- **Response count on cards:** each card shows its response count, which UI.md's card mockup does not include. The count is also used for the stronger delete warning UI.md asks for.
- **After duplicating**, the instructor is redirected to the copy's editor (the Phase 12 behaviour).

---

## Phase 5 — Survey editor

**Prompt:** "Go to next phase."

**Agent output:**

- **Migration `20261105010000_save_survey.sql`:** a `save_survey` RPC that creates a new Draft or replaces an existing Draft's title, description, questions and choices in one transaction. Positions come from array order. Anything other than a Draft is refused (`SURVEY_NOT_EDITABLE`).
- **`src/lib/editorModel.ts`:** pure editor logic, with no React. It holds the draft types, factories, validation, reordering, and conversion to and from the database shape.
- **`src/components/QuestionEditor.tsx`:** one question card. It has the question text, a type selector, choices you can add, delete and reorder, and fixed True / False choices.
- **`src/pages/SurveyEditorPage.tsx`:** used for both `/surveys/new` and `/surveys/:id/edit`. It has:
  - the title and optional description;
  - add, delete and reorder for questions;
  - inline validation, Save Draft and Activate;
  - a read-only notice for non-draft surveys, with "Duplicate to Edit";
  - "Saved" and "Unsaved changes" indicators, and a browser warning when leaving with unsaved changes.

I applied the migration in the Supabase SQL Editor.

**Testing:**

- `npm run verify:db` now runs 49 checks. The new ones check that:
  - anon cannot call `save_survey`;
  - text is trimmed and a blank description becomes null;
  - questions and choices are stored in order, and an update replaces and reorders them;
  - a failed save rolls back completely;
  - a title is required, and non-draft surveys are refused.
- A Playwright editor test at phone width (29 checks) covers:
  - validation messages next to each field, with focus moved to the first invalid one;
  - focus moving to newly added questions and choices;
  - switching to True / False and back without losing typed choices;
  - reordering questions and choices, with focus following the moved item;
  - deleting a choice, and deleting a question with a confirmation;
  - rejecting duplicate choices;
  - saving and checking the database rows, and the data surviving a page refresh;
  - Activate from the editor, which saves, activates and opens Present;
  - the locked view for an active survey, Duplicate to Edit, and "Survey not found".
- The dashboard and login tests still pass.

**Problems:**

- **While reviewing its own draft, before running anything**, the agent found two bugs:
  - The page defined its `LoadMessage` and `LockedNotice` components inside the page component. React would recreate them on every render and reset their state.
  - After the first save, the URL changes from `/surveys/new` to `/surveys/:id/edit`. That would have reloaded the survey from the server and caused a "Loading..." flash.

  The fix was to move the components to module level and to track which survey id is already loaded.

- **In the test:** one check failed because `getByText('Question 1')` also matched the hidden choice labels ("Question 1, choice 1"). The test now selects the question group by its accessible name. The app was not at fault.

**Decisions:**

- **Atomic save by replacement.** Each save deletes and re-inserts the draft's questions and choices inside one transaction. This is safe only because Drafts have never been active, so they have no answers that point at those rows.
- **Validation:**
  - A title and at least one question are required.
  - Every question needs text.
  - Multiple-choice questions need at least two non-empty choices, and duplicate choices (ignoring letter case) are not allowed.
  - Errors appear only after the first Save or Activate attempt, then update as you type.
  - Incomplete drafts cannot be saved.
- **True / False choices are fixed** as "True" and "False" and cannot be edited. Switching a question to True / False and back restores the multiple-choice options typed earlier.
- **New multiple-choice questions start with two empty choices.** A new survey starts with one question.
- **Reordering uses ↑ / ↓ buttons, not drag-and-drop,** so it works with the keyboard and on touch screens.
- **Confirmation for deletes:**
  - Deleting a question asks for confirmation only if the question has content (UI.md: "destructive actions require confirmation").
  - Deleting a single choice does not ask, to avoid excessive dialogs.
- **Activate in the editor** (UI.md's bottom controls) saves first, asks for confirmation if another survey is active, then opens the Present page.
- **Unsaved-changes warning:** only the browser's "leave site?" prompt on reload or tab close. React Router's in-app navigation blocker needs a data router, which this app does not use.

---

## Phase 6 — Survey activation and Present page

**Prompt:** "Continue to next phase."

The activation logic, the one-active rule, auto-closing and slug generation were already done in Phase 4. This phase added the student URL, the QR code and the Present page.

**Agent output:**

- **`src/lib/publicUrl.ts`:** builds `<VITE_PUBLIC_SITE_URL>/s/<slug>`, falling back to the current origin, and a display form without `https://`.
- **`src/pages/PresentPage.tsx`:** a projector page. It shows:
  - a large title and a QR code sized to fit the screen, rendered as SVG so it stays sharp at any size;
  - the URL in large monospace text and the response count;
  - View Results, Download QR Code (1024px PNG), Full Screen, Close Survey (with confirmation) and Dashboard buttons.

  It has no app header or navigation bar (UI.md: "avoid unnecessary navigation elements").

- **New data helpers:** `countResponses` and `getSurveyStatus`.

**Testing:** A Playwright test (21 checks) at 1280×800 and at phone width checks that:

- the on-screen QR code and the downloaded PNG both decode (using `jsQR`) to exactly the public URL;
- the QR code is at least 450px wide and the whole page fits on one 1280×800 screen without scrolling;
- the slug in the QR code resolves to the survey for an anonymous student;
- the response count goes from 0 to 1 within about 5 seconds after a student submits;
- after Close Survey, the QR code is hidden, the database says `closed`, and a student submission made right afterwards is rejected;
- a survey closed from somewhere else disappears from the projector within about 5 seconds;
- draft and unknown surveys show the right messages;
- there is no horizontal scroll on a phone.

The earlier tests (verify-db, login, dashboard and editor) all still pass.

**Problems:**

- None in testing. All checks passed on the first run.
- While writing the page, the agent noticed that a survey closed from the dashboard, or from another tab, would leave a dead QR code on the projector. It added a status check to the 5-second poll.
- **Long titles overflowed the projector view.** While testing the titled PNG with a deliberately long title, the "fits on one 1280×800 screen" check failed, because the page was 848px tall. A two-line title had pushed the buttons off-screen. The fix: on larger screens the page is exactly one screen tall, the QR code takes whatever height remains, and the title is limited to two lines (the full title appears on hover). All 21 checks then passed, and the agent viewed the generated PNG to confirm the layout.
- `vite build` now warns that the JavaScript bundle is over 500 kB. Supabase and `qrcode` account for most of it. This is deferred to Phase 7, where load time matters most because students open the page on phones.

**Decisions:**

- **The response count updates by polling every 5 seconds,** and only while the tab is visible. Supabase Realtime is a Phase 16 enhancement.
- **The QR code always uses `VITE_PUBLIC_SITE_URL` when it is set,** so codes point at the production domain even when the app is opened from a different address. It must be set correctly in Cloudflare (Phase 15).
- **Extra buttons:** Full Screen and Dashboard were added, along with UI.md's View Results and Close Survey.
- **Non-active surveys:** the page shows a status message and the response count instead of a QR code.
- **The QR PNG** is named `survey-<slug>-qr.png`. At my request it was changed from a bare 1024px QR code to a 1200px-wide printable image (`src/lib/qrImage.ts`). It has the survey title at the top (wrapped to at most 3 lines, with "…" if longer), the QR code, and the readable URL underneath.
- **Phase 13's "Improve QR-code presentation for classroom projection"** is checked off now, because this page was designed and tested for projection.

---

## Decisions made ahead of later phases

- **Phase 5, editing:** only **Draft** surveys can be edited. The assignment says "edit existing draft surveys". TODO.md implied that closed surveys could be edited too, but deleting a question from a closed survey would also delete stored student answers. To reuse a closed survey, duplicate it instead.
- **Grader access:** a separate Supabase user is created for the grader. Its credentials go only in the HuskyCT submission, never in the repo.
