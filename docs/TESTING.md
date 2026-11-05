# Testing

How the Classroom Survey app is tested, and how to run the tests. Phase 14 of `TODO.md` maps onto the sections below.

## Automated tests

| Command                   | What it covers                                                                                                                  | Needs                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run test:csv`        | Unit tests for CSV escaping, formula neutralizing and file layout (`scripts/test-csv.ts`)                                       | nothing                                                          |
| `npm run verify:db`       | The live database: RLS, grants, every RPC, triggers that protect history, cascades (`scripts/verify-db.ts`)                     | `.env.local` with the 4 values below                             |
| `npm run test:e2e`        | End-to-end browser tests in **Chrome, Firefox and an emulated Pixel 7 phone** (`tests/e2e/`). Also runs the two commands above. | `.env.local`, Chrome installed, `npx playwright install firefox` |
| `npm run test:e2e:report` | Opens the HTML report of the last end-to-end run (screenshots and traces of any failure)                                        | a previous run                                                   |

`.env.local` must contain:

```sh
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
INSTRUCTOR_EMAIL=...       # the instructor test account
INSTRUCTOR_PASSWORD=...
```

**Before running the database or end-to-end tests, close any Active survey.** The tests activate their own temporary surveys, and only one survey can be active at a time. The suite refuses to start rather than close a real one. Test surveys are titled `[e2e] …` (or `[verify-db] …`) and are deleted after each test. Leftovers from an interrupted run are deleted automatically on the next run.

### Phase 14 checklist → automated test

| TODO item                            | Where it is tested                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test instructor login                | `auth.spec.ts`: wrong password, login, survives reload, logout, return to the requested page                                                      |
| Test survey creation                 | `editor.spec.ts`: validation, both question types, reordering, rows checked in the database, survives refresh                                     |
| Test survey editing                  | `editor.spec.ts`: edit a draft, duplicate-choice check, delete choice and question; non-drafts locked in the UI and the database                  |
| Test activation                      | `lifecycle.spec.ts`: slug generated, only one active, previous one closes after confirming                                                        |
| Test closing surveys                 | `lifecycle.spec.ts`, `present.spec.ts`: confirm and Escape, students refused right after, QR hidden                                               |
| Test QR-code links                   | `present.spec.ts`: on-screen QR and downloaded PNG decoded, decoded URL opened signed out, submission counted                                     |
| Test student submissions             | `student.spec.ts`: required answers, confirmation, response and token stored                                                                      |
| Test duplicate-submission prevention | `student.spec.ts`: reload shows "already submitted"; database refuses the same token; another browser can submit                                  |
| Test results calculations            | `results.spec.ts`: 5 seeded responses; chart, table and database agree; Refresh recalculates                                                      |
| Test CSV export                      | `csv.spec.ts`: hostile content round-trips, formulas neutralized, opened in LibreOffice Calc when installed; `npm run test:csv`                   |
| Test mobile layout                   | `layout.spec.ts` and `student.spec.ts` on the Pixel 7 project: no horizontal scroll, ≥ 44px touch targets                                         |
| Test with at least two browsers      | every suite runs in Chrome (Blink) **and** Firefox (Gecko)                                                                                        |
| Test unauthorized access attempts    | `auth.spec.ts`: protected pages redirect to login; sign-up refused; the public key cannot read results, write tables or call instructor functions |
| Test database Row Level Security     | `database.spec.ts`, which runs `verify:db`: RLS, grants, RPC permissions, history triggers                                                        |

Accessibility is also checked automatically. `layout.spec.ts` runs axe-core (WCAG 2.2 A/AA) on every page in all three projects, and checks keyboard focus.

## Manual tests (real devices)

Automated tests use emulated devices on one computer. These checks need **real hardware** and are best done **after deployment (Phase 15)**, using the production URL.

Fill in the Result column (✅ / ❌ plus a note) and keep a screenshot or two for the report.

| #   | Step                                                                                                    | Expected                                                                                                    | Result |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------ |
| M1  | On a computer, log in, create a 2-question survey, activate it, open **Present**                        | Large QR code and readable URL; Responses: 0                                                                |        |
| M2  | Scan the projected or on-screen QR code with a **phone camera** (on mobile data, not Wi-Fi)             | The survey opens in the phone's browser; no login                                                           |        |
| M3  | Answer both questions on the phone and tap **Submit**                                                   | "Thank you!"; the Present page shows Responses: 1 within ~5 s                                               |        |
| M4  | On the phone, reopen the same link                                                                      | "You have already submitted a response to this survey."                                                     |        |
| M5  | Scan with a **second phone** (ideally the other OS: iPhone or Android) and submit                       | Accepted; count goes to 2                                                                                   |        |
| M6  | Open the dashboard in a **second desktop browser** (for example Firefox or Safari) and view **Results** | Same counts and percentages; charts render                                                                  |        |
| M7  | Click **Close Survey**, then submit from a phone that still has the form open                           | "This survey is no longer accepting responses."                                                             |        |
| M8  | **Export CSV** and open it in Excel, Google Sheets or Numbers                                           | Survey details at the top; one row per response; dates are real dates; text with accents displays correctly |        |
| M9  | In the Supabase **Table Editor**, open `surveys`, `questions`, `responses` and `answers`                | Rows for the survey and the 2 responses (screenshot this for the report)                                    |        |
| M10 | Rotate the phone to landscape on the survey page                                                        | Still readable, no sideways scrolling                                                                       |        |
