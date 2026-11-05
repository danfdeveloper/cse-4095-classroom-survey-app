# Classroom Survey Web App — TODO

## Purpose

This roadmap breaks the implementation into small, testable phases ordered from foundational work to advanced features.

`DATABASE.md` is the source of truth for the schema, RLS, slugs, and RPCs.

---

# Phase 1 — Project Setup

- [x] Create a new React + TypeScript project with Vite.
- [x] Add Tailwind CSS.
- [x] Add React Router.
- [x] Add Supabase JavaScript client.
- [x] Add Recharts.
- [x] Add QR code generation package.
- [x] Create the initial project folder structure.
- [x] Add `.env.example` with Supabase environment variable names.
- [x] Configure ESLint and formatting.
- [x] Create a basic home page.
- [x] Verify the project builds successfully.

---

# Phase 2 — Supabase Project and Database

- [x] Create a Supabase project.
- [x] Create the `surveys` table.
- [x] Create the `questions` table.
- [x] Create the `choices` table.
- [x] Create the `responses` table.
- [x] Create the `answers` table.
- [x] Add foreign-key constraints.
- [x] Add database indexes.
- [x] Add timestamps.
- [x] Add survey-status validation.
- [x] Create Row Level Security policies.
- [x] Verify students cannot read survey results.
- [x] Verify anonymous students can read active surveys.
- [x] Verify anonymous students can submit responses.
- [x] Verify authenticated instructors have full access.

---

# Phase 3 — Instructor Authentication

- [x] Create the instructor login page.
- [x] Connect login to Supabase Auth.
- [x] Add logout.
- [x] Create an authentication context/provider.
- [x] Create a protected-route component.
- [x] Redirect unauthenticated users to login.
- [x] Show the logged-in instructor in the dashboard.

---

# Phase 4 — Instructor Dashboard

- [x] Create the dashboard layout.
- [x] Load surveys from Supabase.
- [x] Display survey title, status, and creation date.
- [x] Add status badges for Draft, Active, Closed, and Archived.
- [x] Add a New Survey button.
- [x] Add Edit action.
- [x] Add Duplicate action.
- [x] Add Delete action.
- [x] Add Archive action.
- [x] Add View Results action.
- [x] Add Activate action.
- [x] Add Close action.
- [x] Add search by survey title.
- [x] Add filtering by status.

---

# Phase 5 — Survey Editor

- [ ] Create a survey editor page.
- [ ] Add survey title field.
- [ ] Add optional description field.
- [ ] Add questions dynamically.
- [ ] Support Multiple Choice questions.
- [ ] Support True / False questions.
- [ ] Add answer choices dynamically.
- [ ] Reorder questions.
- [ ] Reorder choices.
- [ ] Delete questions.
- [ ] Delete choices.
- [ ] Validate required fields.
- [ ] Save a survey as Draft.
- [ ] Load an existing survey for editing.
- [ ] Allow editing only Draft surveys (Active, Closed and Archived are read-only; use Duplicate to reuse one).

---

# Phase 6 — Survey Activation

- [x] Add activation logic.
- [x] Ensure at most one survey is Active.
- [x] Automatically close the previously active survey.
- [x] Generate a public survey slug.
- [ ] Generate the public survey URL.
- [ ] Generate a QR code from the public URL.
- [ ] Create a Present Survey page.
- [ ] Display survey title and QR code.
- [ ] Display a readable fallback URL.
- [ ] Add a Close Survey button.
- [ ] Add a Download QR Code button.

---

# Phase 7 — Student Survey Page

- [ ] Create the public route `/s/:slug`.
- [ ] Load the requested active survey.
- [ ] Show an error if the survey does not exist.
- [ ] Show a message if the survey is closed.
- [ ] Render survey title and description.
- [ ] Render Multiple Choice questions.
- [ ] Render True / False questions.
- [ ] Validate required answers.
- [ ] Add Submit button.
- [ ] Store response and answers in Supabase.
- [ ] Show a submission confirmation page.
- [ ] Make the entire experience mobile friendly.

---

# Phase 8 — Duplicate Submission Protection

- [ ] Generate an anonymous browser token.
- [ ] Store the token in local storage.
- [ ] Save the token with each response.
- [ ] Prevent the same token from submitting twice to the same survey.
- [ ] Show a friendly message if a duplicate submission is attempted.
- [ ] Add a database uniqueness constraint if appropriate.

---

# Phase 9 — Results Dashboard

- [ ] Create a results page for each survey.
- [ ] Show total response count.
- [ ] Aggregate answers by question.
- [ ] Show counts for each choice.
- [ ] Show percentages for each choice.
- [ ] Add bar charts using Recharts.
- [ ] Clearly label unanswered questions.
- [ ] Add Refresh Results button.
- [ ] Add link back to the main dashboard.

---

# Phase 10 — Historical Results

- [ ] Allow viewing results for Closed surveys.
- [ ] Allow viewing results for Archived surveys.
- [ ] Add filtering by date.
- [ ] Add filtering by survey title.
- [ ] Preserve all historical response data.

---

# Phase 11 — CSV Export

- [ ] Add Export CSV button.
- [ ] Export survey metadata.
- [ ] Export one row per response.
- [ ] Include submission timestamp.
- [ ] Include each question and answer.
- [ ] Create safe CSV escaping.
- [ ] Test export with spreadsheet applications.

---

# Phase 12 — Survey Duplication

- [x] Duplicate survey title and description.
- [x] Duplicate questions.
- [x] Duplicate answer choices.
- [x] Create the copy in Draft state.
- [x] Add "Copy of ..." naming.
- [x] Redirect to the editor after duplication.

---

# Phase 13 — UI Polish

- [ ] Add consistent page layouts.
- [ ] Improve mobile responsiveness.
- [ ] Add loading states.
- [ ] Add empty states.
- [ ] Add error messages.
- [x] Add confirmation dialogs for destructive actions.
- [ ] Improve QR-code presentation for classroom projection.
- [ ] Test accessibility and keyboard navigation.
- [ ] Improve color contrast.

---

# Phase 14 — Testing

- [ ] Test instructor login.
- [ ] Test survey creation.
- [ ] Test survey editing.
- [ ] Test activation.
- [ ] Test closing surveys.
- [ ] Test QR-code links.
- [ ] Test student submissions.
- [ ] Test duplicate-submission prevention.
- [ ] Test results calculations.
- [ ] Test CSV export.
- [ ] Test mobile layout.
- [ ] Test with at least two browsers.
- [ ] Test unauthorized access attempts.
- [ ] Test database Row Level Security.

---

# Phase 15 — Deployment

- [ ] Push the project to GitHub.
- [ ] Create the Cloudflare Pages site.
- [ ] Connect Cloudflare Pages to the GitHub repository.
- [ ] Configure production environment variables.
- [ ] Deploy the application.
- [ ] Configure SPA routing.
- [ ] Verify production login.
- [ ] Verify QR codes point to the production URL.
- [ ] Test student submissions in production.
- [ ] Test instructor results in production.

---

# Phase 16 — Post-MVP Enhancements

- [ ] Add live updating results with Supabase Realtime.
- [ ] Add question bank.
- [ ] Add survey import/export as JSON.
- [ ] Add Markdown import.
- [ ] Add short-answer questions.
- [ ] Add checkbox questions.
- [ ] Add rating-scale questions.
- [ ] Add numeric questions.
- [ ] Add AI-assisted question generation.
- [ ] Add LMS integration.
- [ ] Add multiple instructors.
- [ ] Add course and semester organization.
- [ ] Add analytics across multiple surveys.
