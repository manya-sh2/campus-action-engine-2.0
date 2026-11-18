# Dashboard fixes — 18 November 2026

This update is based on campus-action-engine-gemini-rate-limit-fixed.zip.
The priority formula, weights, Gemini provider, batching and quota settings are unchanged.

## Apply on the laptop running the app

1. Stop the backend and frontend with Ctrl+C. Keep a backup of your current project.
2. Extract this ZIP. Copy its backend/src, backend/tests, and frontend/src folders
   into the corresponding folders in your existing project, merging folders and
   replacing matching source files. Copy this guide too if useful.
3. Keep your existing backend/.env, frontend/.env (if used), backend/.runtime,
   node_modules, and database. In particular, keep .runtime/gemini-usage.json:
   it records the local Gemini request budget. No database reset is needed.
4. No dependencies were added. In the backend terminal run:

   ```powershell
   npm test
   npm run dev
   ```

   In a second terminal, in frontend, run:

   ```powershell
   npm run dev
   ```

5. Reload localhost:3000. Already-saved event records are hidden automatically.
   Sync once to process new items under the updated Gemini instructions.

## What changed

- Only job/internship recruitment, placement-process updates, semester exams,
  and assignments are accepted. Gemini is instructed to categorize placement
  updates as job/internship and exam-related notices as exam.
- Events, clubs, hackathons, workshops, scholarships and generic announcements
  are excluded by the backend, including previously saved records in those categories.
  A placement-cell sender alone does not make an event relevant.
- Original source timestamps still enforce a rolling 30-day window.
- Passed deadlines are rejected before task creation and hidden from saved-task
  queries, including MCP and cron. Assignments require a known future due date.
- Jobs and important notices without a stated deadline can appear; they are labeled
  "Deadline not specified". Their open status cannot be verified from a missing date.
- Relative dates are interpreted against the original message timestamp, with the
  student timezone supplied. Gemini is told not to shift past dates into the future.
- Completed/dismissed tasks no longer appear in the high-priority or upcoming views.
  Relevant completed/dismissed records remain accessible through the status filter.
- Upcoming deadlines are filtered in the database before pagination. Undated jobs
  cannot occupy all ten slots and hide actual deadlines. In-progress tasks are included.
- Loaded cards and the open detail drawer disappear after expiry even if a refresh
  fails. Out-of-order requests cannot overwrite newer dashboard filter results.
- Failed Complete/Dismiss actions now show an error instead of an unhandled promise.
- Terminal logs show timestamps, HTTP route/status/duration, sync progress, AI request
  attempts and responses, batch outcomes, skip counts, and remaining local quota.
  The new logger excludes email subjects/bodies, credentials, and raw provider errors.

## Reading terminal logs

Leave the backend terminal open while clicking Sync in the browser.

- `sync.started`: a sync has begun; syncId groups its progress lines.
- `sync.fetched` / `sync.selected`: source count and items selected for processing.
- `sync.batch_started`: next batch queued (quota spacing can cause a pause here).
- `ai.request_started`: a real model request was issued after reserving local quota.
- `ai.response_received`: the provider returned a response; validation still follows.
- `sync.batch_completed`: cumulative processed/created/ignored/expired/failed counts.
- `ai.request_failed`: provider HTTP status and attempt number; check the browser
  sync error for the explanation. No raw provider response is printed.
- `sync.paused`: quota/provider interruption; remaining items are deferred.
- `sync.finished`: summary counts and remaining local budget.
- `http.finished`: HTTP status and duration, using the route pattern, not query strings.

With AI_MOCK_MODE=true no real model requests occur. Startup reports mock mode.
Keep AI_MOCK_MODE=false for real Gemini use. No key is bundled in this ZIP.

## Validation and limits

37 offline automated tests passed, including the original quota/sync tests and new
pipeline, saved-record filtering, pagination, timezone, frontend expiry and log tests.
66 JavaScript files passed Node syntax checks. Formula generation and the detail
drawer's formula display were preserved.

The frontend production build could not be run here because its dependencies were
unavailable and dependency installation was blocked by the environment. The friend's
live Gmail, Gemini connection, MongoDB and browser session were not accessed.

The existing five-course auto-selection and default 100-message Gmail fetch cap
remain unchanged in this focused update. Already processed source IDs are not
automatically sent to Gemini again; this update does not rewrite earlier extractions.
Model classification and dates should still be checked against the original message
when uncertain, especially when a deadline exists only in an attachment or linked page.

## Quick check on the running app

1. Existing event cards should disappear immediately after restart/reload.
2. Mark an important task completed or dismissed: it should leave High Priority.
3. Upcoming Deadlines should contain only active, dated tasks, soonest first.
4. A task whose deadline passes should disappear while the page remains open.
5. Sync and watch backend logs. The formula should still appear on retained tasks.

No changes to the existing database are required to apply these filters.
