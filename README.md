# PulseGrid Intelligence

Verified creator intelligence, event-organizer directory, and automated client-pitching platform.

## Tech stack

- Next.js 15 (App Router, strict TypeScript)
- Supabase PostgreSQL with Row-Level Security & `@supabase/ssr`
- Tailwind CSS & shadcn/ui
- Typesense (sub-15ms facet search)
- `@react-pdf/renderer`

## Status

This repo currently holds the domain layer and the programmatic-SEO surface; it has **not** been scaffolded as a runnable Next.js app yet (no `package.json`, `next.config`, or root `app/layout.tsx`). To make it runnable:

```bash
# from an empty scratch dir, then merge src/ and supabase/ from this repo in
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
npm install @supabase/supabase-js @supabase/ssr @react-pdf/renderer
npx shadcn@latest init
```

Required environment variables (see `src/lib/supabase/service.ts`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## What's built

- **`supabase/migrations/`** — `001_init.sql` (schema, RLS, `check_active_blackout`), `002_add_creator_follower_count.sql` (additive).
- **`src/types/creator.ts`** — enum unions + entity/composite types mirroring the schema.
- **`src/workers/ingest-worker.ts`** — `InstagramIngestWorker`: bio parsing, brand-disclosure detection, availability scoring, batched Supabase ingestion.
- **`src/lib/`** — Supabase service-role client, pSEO directory config (metro × niche launch-hub matrix), and the Supabase queries backing the public pages.
- **`src/components/pseo/`** — shared presentational pieces (avatar).
- **`src/app/directories/[slug]/page.tsx`**, **`src/app/verified/[handle]/page.tsx`**, **`src/app/sitemap.ts`** — the public programmatic-SEO routes.

All of the above has been type-checked under strict TypeScript and, for the App Router pages, verified with an actual `next build` in a scratch environment.

## Next steps

- Scaffold the app shell (`package.json`, `next.config`, root `layout.tsx`, Tailwind/shadcn config) around the existing `src/`.
- Wire up authentication (`@supabase/ssr`) for the `/sign-in` flow the gated pages link to.
- Build the contact-unlock API route backing `ContactUnlockPayload`.
- Typesense indexing for the full (non-teaser) discovery grid.
