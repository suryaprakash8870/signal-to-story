# Signal-to-Story Engine

Implements Phase 1, steps 1–2 of `00-OVERVIEW.md`'s build order: the full
data model, and Stages 2–5 of the pipeline running against Ollama, behind a
minimal intake form and review queue. Connectors, Claude swap-in, and the
full frontend are not built yet - see `09-BUILD-PHASES-AND-TASKS.md`.

## Setup

1. `npm install`
2. Create a Supabase project. In the SQL editor, run
   `supabase/migrations/0001_init.sql`.
3. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (Supabase project settings → API)
   - `OLLAMA_BASE_URL` / `OLLAMA_MODEL` - leave `LLM_PROVIDER=ollama` for
     dev/test. Do not switch to `claude` until you've completed the
     grounding test below.
4. After creating a Supabase Auth user, give it a role (defaults to
   `submitter`) - run in the SQL editor:
   ```sql
   update public.user_profiles set role = 'reviewer' where id = '<user-uuid>';
   ```
   (A row is only created here automatically if you added an
   `on auth.users insert` trigger - otherwise insert it manually the first
   time: `insert into public.user_profiles (id, role) values ('<user-uuid>', 'reviewer');`)
5. `npm run dev`, sign in at `/login`, submit a signal at `/intake`.

## Manual end-to-end test (per `08-TEST-FIXTURES-AND-TESTING.md`)

1. **Plumbing test (Ollama).** Paste `fixtures/gong_sample.json`'s
   `raw_text` into `/intake` with source type `gong`. Watch `/signals/[id]`
   move through classified → interpreted → packaged. Confirm outputs
   appear in `/review`, and that Approve is disabled while any
   `unverified_claims` are present.
2. **Grounding test (Claude - do not skip).** Set `LLM_PROVIDER=claude` and
   `ANTHROPIC_API_KEY`, restart, resubmit the same fixture. Then submit a
   variant with an appended unsupported claim (see
   `fixtures/expected_pipeline_output_example.json` →
   `grounding_test_variant`) and confirm `unverified_claims` actually
   populates. If it doesn't, tighten the grounding prompt in
   `lib/pipeline/interpret.ts` / `lib/pipeline/package.ts` before trusting
   any real output.

Not yet built: Teams/Gmail/Salesforce/Gong/Crayon connectors, dashboard,
connectors/competitors settings pages, live talking-points routing beyond
what Stage 5 already includes for Sales. See `09-BUILD-PHASES-AND-TASKS.md`
for the rest of Phase 1.
