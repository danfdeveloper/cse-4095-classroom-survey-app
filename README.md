# Classroom Survey

Quick in-class understanding checks. Instructors activate a survey and project a QR code; students answer anonymously from their phones.

Stack: React + TypeScript + Vite, Tailwind CSS, React Router, Supabase, Recharts, `qrcode`. Hosted on Cloudflare Pages.

## Getting started

```sh
npm install
cp .env.example .env.local   # then fill in Supabase values
npm run dev
```

## Scripts

| Command                | Purpose                       |
| ---------------------- | ----------------------------- |
| `npm run dev`          | Start the dev server          |
| `npm run build`        | Type-check and build to dist/ |
| `npm run lint`         | Run ESLint                    |
| `npm run format`       | Format with Prettier          |
| `npm run format:check` | Check formatting              |

## Layout

```text
src/components/   shared UI components
src/pages/        route-level pages
src/lib/          Supabase client and helpers
supabase/         SQL migrations
```

See `TODO.md` for the roadmap. `DATABASE.md` is the source of truth for the schema.
