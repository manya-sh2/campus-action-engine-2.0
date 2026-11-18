# Windows setup — Gemini API free-tier version

This project can use **Gemini**, **OpenAI**, or a local mock extractor. The
recommended configuration is **Gemini**, using a Gemini API key issued by
Google AI Studio. Gemini keys are **not OpenAI keys**. The backend uses the
`openai` *JavaScript library* only as a compatible client for Gemini's API.

## 1. Create `backend/.env`

From the project root in **PowerShell**:

```powershell
cd backend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
```

**Do not overwrite** an existing `.env`: it may already contain your Google
OAuth keys, encryption key, and MongoDB connection information.

Set or replace these entries inside **`backend/.env`**:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=PASTE_YOUR_GOOGLE_AI_STUDIO_KEY_HERE
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MIN_REQUEST_INTERVAL_MS=16000
GEMINI_MAX_REQUESTS_PER_MINUTE=4
GEMINI_DAILY_REQUEST_BUDGET=12
GEMINI_MAX_ITEMS_PER_SYNC=24
GEMINI_BATCH_SIZE=4
AI_MOCK_MODE=false
```

Keep the other entries (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `MONGODB_URI`, etc.) as before.
The **Gemini key** is distinct from the Google OAuth client ID/secret; the
latter allow Gmail/Classroom access, while the Gemini key runs AI extraction.

* If you use a model not available on your project, visit Google AI Studio's
  model/rate-limits page and change `GEMINI_MODEL` accordingly. Newly created
  projects may lack access to some older Gemini 2.5 models.
* Avoid extra spaces, quotes, or comments on the `GEMINI_API_KEY` line.
* Confirm the file is exactly named `.env`, **not** `.env.txt` (Windows
  File Explorer → View → Show → File name extensions).
* Put this file in `backend`, not `frontend` or the project root.

## 2. Check safely (never prints the API key)

```powershell
npm install
npm run check:config
```

The output should report:

```text
backend/.env exists: YES
AI_PROVIDER: gemini
GEMINI_API_KEY loaded: YES (value hidden)
AI_MOCK_MODE: OFF
```

**This does not verify** that the key is valid, that the model is accessible,
or that your free quota remains. Those require a real call from your machine.

## 3. Restart the backend and frontend

Run the backend in the first PowerShell window:

```powershell
npm run dev
```

In a **second** window from the project root:

```powershell
cd frontend
npm install
npm run dev
```

A backend restart is required after `.env` changes. Sign in, then choose
**Sync Gmail & Classroom**. Free-tier throttling can make large syncs take
several minutes; the UI will show the sync in progress.

## 4. How to interpret failures

* **Missing GEMINI_API_KEY**: incorrect file, variable name, or process
  environment. Check `npm run check:config`. A separately set Windows
  environment variable takes precedence over `.env`.
* **401**: API key rejected. Check the Gemini key and restart the backend.
* **403**: key/model or project permission issue.
* **404**: model not found/allowed for your project. Select a model shown
  as available in Google AI Studio and update `GEMINI_MODEL`.
* **429 / RESOURCE_EXHAUSTED**: free-tier RPM/daily quota exhausted. Check
  current limits in Google AI Studio; slower requests can help RPM limits,
  but cannot restore exhausted daily quota. Adjust
  `GEMINI_MIN_REQUEST_INTERVAL_MS` if the limit is too low.
* **400**: the model/endpoint rejected the extraction request, often because
  of model or structured-output compatibility. Check the error details.

A single provider-wide error now stops the sync rather than appearing once
for every email. If some items were saved before the error, they remain
saved and are skipped on later syncs.

## 5. Offline testing (no Gemini key required)

```dotenv
AI_MOCK_MODE=true
```

Restart the backend. The project uses its existing rule-based extractor
instead of the Gemini API. This checks the UI, sync pipeline, and database
flow, **not** Gemini response quality. `OPENAI_MOCK_MODE=true` is kept as a
legacy alias, but `AI_MOCK_MODE` is preferred.

## 6. Optional OpenAI instead of Gemini

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-4o-mini
AI_MOCK_MODE=false
```

Do **not** put a Gemini key in `OPENAI_API_KEY` while using OpenAI mode.

## Privacy and key safety

Never add `backend/.env` to GitHub, paste your key into a screenshot, or
put it in a Vite/React environment variable. The app sends the text of
synced Gmail/Classroom items to whichever AI provider you configure.
Google's **Gemini free tier may use submitted content to improve its
products**, according to its published terms/pricing information. Only use
real personal emails if you are comfortable with those provider data terms.


## Sync window and deadline visibility (new)

- Gmail and Google Classroom sync only original messages/posts from the last **30 rolling days**.
- Old or already-expired deadlines are skipped. Classroom coursework deadlines
  come from Google's exact UTC due date/time; email deadlines rely on the AI
  extraction and can be unknown when no trustworthy deadline is mentioned.
- Dashboard, priority, upcoming-deadline and MCP task lists automatically hide
  expired items. Items with **no known deadline** remain visible if recent.
- Existing MongoDB task documents are **not deleted**. Old-version records
  without original source timestamps are hidden until a new sync backfills
  timestamps for matching current-month source items. Press Sync once after
  updating. No database reset is necessary.
- Gmail fetch defaults to at most 100 messages per sync (max 200). Classroom
  fetch caps each item type at 200 per course, with up to 5 active courses
  by default. This keeps Gemini free-tier usage bounded.


## 7. Gemini free-tier HTTP 503 and 429 protection (updated)

The earlier log showed a Gemini model (`gemini-3.8-flash`) with **5 requests/minute**
and **20 requests/day** on that particular Google AI Studio project. These numbers
vary by model and project: the limit shown in your own AI Studio is authoritative.

This version deliberately defaults to **4 requests/minute** and a **local safety
budget of 12 requests/day**. A single request processes up to **4** Gmail or
Classroom items, and a sync checks up to **24** new items. Ignored items are
remembered in MongoDB by source ID only, so the same promotional email does not
consume more Gemini requests on the next sync. Already-saved tasks are never
re-sent to Gemini. Later syncs pick up unprocessed items. The latest 30 days
and passed-deadline visibility rules still apply.

If Gemini returns a temporary **503**, the app makes **one** delayed retry and
then pauses, preserving anything already saved. If it returns **429**, the app
identifies a per-minute limit versus daily quota where possible, records the
cooldown, and stops making further attempts until it is safe to try again.
Google's daily free-tier quotas reset at midnight **Pacific** time, not midnight
in India. Local quota state persists across backend restarts under
`backend/.runtime/gemini-usage.json`; **do not delete this file to bypass your
quota budget**. This is a local protection for one Node backend process, not a
replacement for Google AI Studio's true project-wide quota. Other apps using
the same Google AI project share its quota.

**Windows commands** (inside the extracted `backend` folder):

```powershell
npm install
npm run check:config
npm test
npm run dev
```

If you previously used `GEMINI_MODEL=gemini-3.8-flash` and encounter 503 due to
high demand, check whether another **free-tier** model is available in Google
AI Studio for your project, and update `GEMINI_MODEL` yourself if desired.
The example default remains `gemini-3.1-flash-lite` and should be checked
against current availability in AI Studio. Do not share the API key.

If Gemini rejects batched JSON schema requests with **400**, set
`GEMINI_BATCH_SIZE=1` to use single-message extraction while you inspect
model compatibility. The app can still hit provider outages or true daily limits;
no retry or pacing setting guarantees that an overloaded external service works.

The sync summary shows how many items were processed, how many remain deferred,
and how much of the local daily request budget is left. A stopped sync does not
erase tasks; press Sync again after the cooldown or daily reset.
