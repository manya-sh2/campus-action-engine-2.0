# Campus Action Engine 2.0

A full-stack application that turns recent Gmail and Google Classroom communications into a personalized academic and recruitment task feed.

Gemini extracts structured facts from messages. Backend rules check relevance and eligibility, calculate priority, and keep expired items out of the dashboard. Google Drive integration and an authenticated MCP endpoint provide file and task actions.

## Features

- **Google sign-in:** session-based access to the student's own profile, tasks, and Google connection.
- **Gmail and Classroom sync:** processes source items from a rolling **30-day window**, based on the original received or published timestamp.
- **Focused task feed:** jobs, internships, placement-process updates, semester exam notices, and assignments with known future deadlines.
- **Structured AI extraction:** category, summary, organization, eligibility criteria, skills, deadline, and action link.
- **Personalized ranking:** branch, CGPA, graduation year, preferred roles, skill overlap, and deadline urgency.
- **Dashboard:** high-priority tasks, upcoming deadlines, filters, pagination, task details, and Complete/Dismiss actions.
- **Real-time notifications:** Socket.IO events for new important tasks, priority changes, and completion.
- **Deadline automation:** scheduled urgency and priority recalculation with node-cron.
- **Google Drive:** file search, metadata lookup, and upload.
- **MCP integration:** eight authenticated tools for profile, task, and Drive operations.
- **Quota-aware processing:** batched Gemini requests, request pacing, persistent local budget tracking, duplicate detection, and cached ignored source IDs.
- **Terminal logs:** HTTP status/timing, sync progress, AI request outcomes, batch results, and remaining local request budget.

## What appears in the dashboard?

| Content | Behaviour |
| --- | --- |
| Job and internship opportunities | Included when extraction and eligibility checks pass |
| Placement shortlists, interviews, recruitment tests, and required recruitment steps | Classified as job or internship updates |
| Semester exam schedules, seating plans, admit cards, and exam forms | Classified as exam information |
| Assignments and submissions | Included only with a known future due date |
| Events, festivals, hackathons, workshops, club activities, and preparation sessions | Excluded |
| Scholarships, promotions, newsletters, and generic announcements | Excluded from the current feed |
| Items older than 30 days or with passed deadlines | Hidden |
| Completed or dismissed tasks | Excluded from High Priority and Upcoming Deadlines; available through status filters while still within the visibility window |

A placement-cell sender alone does not make a message relevant. Jobs and important notices without a stated deadline can appear as **Deadline not specified**; this does not verify that an application is still open.

Filtering applies to saved records as well as newly processed items. Hidden records are not deleted. Loaded task cards and the open detail drawer also expire locally while the dashboard remains open.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, Vite, CSS, Socket.IO client |
| Backend | Node.js, Express |
| Database | MongoDB, Mongoose |
| AI extraction | Gemini through Google's OpenAI-compatible endpoint; optional OpenAI or mock mode |
| Google integration | OAuth 2.0, Gmail API, Classroom API, Drive API |
| Realtime and scheduling | Socket.IO, node-cron |
| Tool access | Model Context Protocol SDK, Zod |
| Tests | Node.js built-in test runner |

## How it works

1. The authenticated user starts a sync.
2. Google services fetch Gmail messages and Classroom announcements/coursework.
3. The normalizer produces a common source format. Age checks, duplicate checks, credential-notice filtering, and known Classroom deadline checks run before AI processing.
4. Gemini classifies messages and extracts structured facts in batches. Responses are validated before use.
5. Backend rules reject excluded categories, known ineligible opportunities, expired items, and undated assignments.
6. Deterministic engines calculate importance, urgency, and priority.
7. Accepted tasks are stored in MongoDB. Important new tasks generate Socket.IO notifications.
8. The deadline cron updates urgency and priority as deadlines approach.

The LLM **extracts facts and classifies content**. It does not calculate the final numeric priority.

### Priority calculation

```text
priorityScore = round(importanceScore × 0.6 + urgencyScore × 0.4)
```

Importance combines eligibility (up to 35), category relevance (up to 25), preferred-role matching (up to 20), and skill overlap (up to 20). Hard eligibility checks use branch, CGPA, and graduation year; skills contribute to importance.

Urgency depends on time remaining: within 24 hours scores 95, within 3 days 80, within a week 60, within two weeks 40, within 30 days 25, and beyond 30 days 12. Missing deadlines receive a baseline of 15. Expired tasks are filtered out.

Priority levels are **critical ≥80**, **high ≥60**, **medium ≥35**, and **low <35**. The formula and contributing reasons remain visible in task details.

Date-only deadlines resolve to the end of the day in the student's timezone. Classroom due dates/times take precedence over inferred deadlines. The extraction prompt uses the original message timestamp for relative phrases such as “tomorrow.”

## Run locally

### Requirements

- Node.js satisfying the frontend's declared requirement: **20.19+ on Node 20, or 22.12+**.
- npm and Git.
- A running MongoDB instance or MongoDB Atlas connection.
- A Google Cloud project configured for OAuth and the Gmail, Classroom, and Drive APIs.
- A Gemini API key and a model available to that API project.

### 1. Clone and install

```bash
git clone https://github.com/manya-sh2/campus-action-engine-2.0.git
cd campus-action-engine-2.0
cd backend
npm install
cd ../frontend
npm install
cd ..
```

### 2. Configure Google OAuth

Enable the Gmail, Google Classroom, and Google Drive APIs in your Google Cloud project. Configure the OAuth consent screen for your intended users and create a **Web application** OAuth client.

Register this local callback URI exactly:

```text
http://localhost:5000/api/auth/google/callback
```

For a consent screen in testing mode, add the accounts that will test the app. The application requests identity scopes, Gmail read-only access, Classroom read-only access, and `drive.file`. The exact scope list lives in [googleScopes.js](backend/src/config/googleScopes.js).

The `drive.file` scope limits file access to files available to this app; Drive search does not search the user's entire Drive.

### 3. Configure the backend

Create `backend/.env`. If it already exists, edit it rather than overwriting your credentials.

The checked-in `backend/.env.example` still contains older OpenAI-oriented settings. Use the Gemini block below in your actual `backend/.env`:

```dotenv
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/campus-action-engine
CLIENT_URL=http://localhost:3000

GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
TOKEN_ENCRYPTION_KEY=your_64_character_hex_key

GOOGLE_MOCK_MODE=false
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=your_available_gemini_model
AI_MOCK_MODE=false
OPENAI_MOCK_MODE=false

GEMINI_MIN_REQUEST_INTERVAL_MS=16000
GEMINI_MAX_REQUESTS_PER_MINUTE=4
GEMINI_DAILY_REQUEST_BUDGET=12
GEMINI_BATCH_SIZE=4
GEMINI_MAX_ITEMS_PER_SYNC=24

SESSION_COOKIE_NAME=cae_session
SESSION_TTL_DAYS=7
ENABLE_DEADLINE_CRON=true
DEADLINE_CRON_SCHEDULE=*/15 * * * *
```

Replace the placeholders. Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep this key stable once Google tokens have been stored. Keep all credentials in the backend; do not commit `.env` or put keys in frontend variables.

The backend loads `backend/.env` regardless of the terminal's working directory. Check configuration without printing the keys:

```bash
cd backend
npm run check:config
```

Restart the backend after changing environment variables.

### 4. Configure and start the frontend

Create `frontend/.env` with:

```dotenv
VITE_API_URL=http://localhost:5000
```

Start the backend and frontend in separate terminals:

| Terminal | Directory | Command |
| --- | --- | --- |
| Backend | `backend` | `npm run dev` |
| Frontend | `frontend` | `npm run dev` |

Open **http://localhost:3000**. The backend listens on **http://localhost:5000** and waits for MongoDB before accepting requests.

Sign in with Google, fill in your profile and timezone, then select **Sync Gmail & Classroom**. Use the Profile and Drive tabs for profile edits and file operations.

Additional Windows troubleshooting is available in [WINDOWS_SETUP.md](WINDOWS_SETUP.md).

## Gemini request limits

These are **application-side settings**, not a statement of the quota granted to your Google project.

| Setting | Default | Purpose |
| --- | --- | --- |
| `GEMINI_MIN_REQUEST_INTERVAL_MS` | 16000 | Minimum gap between requests |
| `GEMINI_MAX_REQUESTS_PER_MINUTE` | 4 | Local per-model request cap |
| `GEMINI_DAILY_REQUEST_BUDGET` | 12 | Local per-model daily attempt budget |
| `GEMINI_BATCH_SIZE` | 4 | Source items per extraction request |
| `GEMINI_MAX_ITEMS_PER_SYNC` | 24 | New items selected for one sync |

A full 24-item sync uses six four-item requests before retries. Failed requests and retries also count toward the local budget. The configured provider may apply additional limits.

The usage ledger is stored in `backend/.runtime/gemini-usage.json`, so restarting the backend does not reset it. The local day boundary uses the America/Los_Angeles timezone. Preserve this file when updating an existing installation.

HTTP 429 responses pause processing and trigger quota/cooldown handling. Temporary server errors receive one bounded retry. Tasks already saved remain available; unprocessed items may be picked up on a later sync while still inside the source fetch limits and 30-day window.

`AI_MOCK_MODE=true` selects the local rule-based extractor. `GOOGLE_MOCK_MODE=true` selects canned Google data, but does not create a mock browser login. Mock data can age out of the 30-day window. For optional OpenAI extraction, set `AI_PROVIDER=openai`, `OPENAI_API_KEY`, and `OPENAI_MODEL`.

## Terminal logs

Keep the backend terminal open during sync.

| Event | Meaning |
| --- | --- |
| `sync.started` | A sync began; `syncId` groups its progress |
| `sync.fetched` / `sync.selected` | Source counts and items selected for AI processing |
| `sync.batch_started` | A batch is queued; request pacing may delay its request |
| `ai.request_started` | A provider request was issued |
| `ai.response_received` | The provider responded; extraction validation still follows |
| `sync.batch_completed` | Cumulative processed, created, ignored, expired, and failed counts |
| `ai.request_failed` | Provider status and attempt number |
| `sync.paused` / `sync.finished` | Final counts and remaining local quota |
| `http.finished` | HTTP method, route template, status, and duration |

The structured logger uses an operational-field allowlist and excludes email subjects/bodies, request headers, credentials, and raw provider errors. The dashboard displays processing errors and deferred-item counts.

## API overview

Google-data and task endpoints require the application session cookie created by Google sign-in.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API health |
| GET | `/api/auth/google` | Start Google sign-in |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | End the current application session |
| POST | `/api/tasks/sync` | Fetch, extract, filter, score, and save tasks |
| GET | `/api/tasks` | Filtered, paginated tasks |
| GET | `/api/tasks/priority/high` | Active critical/high-priority tasks |
| GET | `/api/tasks/:taskId` | Task details |
| PATCH | `/api/tasks/:taskId/status` | Change task status |
| GET / PATCH | `/api/users/:id` | Read/update the signed-in user's profile |
| GET / POST | `/api/drive/files` | Search/upload files |
| GET | `/api/drive/files/:fileId` | File metadata |
| POST | `/mcp` | Authenticated MCP requests |

Task-list filters include `status`, `category`, `priorityLevel`, `minPriority`, `hasDeadline=true`, `sortBy`, `sortOrder`, `page`, and `limit`. The query value `status=active` selects pending and in-progress tasks. Actual task statuses are `pending`, `in_progress`, `completed`, and `dismissed`.

Optional sync request body:

```json
{
  "includeGmail": true,
  "includeClassroom": true,
  "classroomCourseIds": ["your_course_id"],
  "gmailMaxResults": 100
}
```

`gmailQuery` can further narrow Gmail searches; the 30-day restriction still applies. Sync summaries include `created`, `duplicates`, `ignored`, `expired`, `processed`, `deferred`, `failed`, `errors`, `stoppedReason`, and `quota`.

## Realtime, scheduling, and MCP

Socket.IO shares the backend HTTP server and authenticates the session cookie. Per-user rooms receive `task:created`, `task:priority_updated`, and `task:completed`. New-task notifications are emitted for critical/high-priority tasks. Clients can request completion through `task:mark_complete`.

The deadline cron runs every 15 minutes by default. It recalculates urgency and priority for active, visible tasks with approaching deadlines, and sends priority notifications on qualifying level changes. **It does not fetch new emails.** Disable it with `ENABLE_DEADLINE_CRON=false`.

The MCP server uses stateless HTTP at `POST /mcp`. Clients must send the application's session cookie; an endpoint URL alone is insufficient.

| MCP tool | Operation |
| --- | --- |
| `get_my_profile` | Read the authenticated profile |
| `get_urgent_tasks` | Read active high/critical tasks |
| `get_upcoming_deadlines` | Read upcoming deadlines; default horizon 14 days |
| `get_relevant_opportunities` | Read opportunities subject to current visibility rules |
| `get_task_details` | Read an owned, visible task |
| `search_drive_files` | Search files accessible to the app |
| `upload_file_to_drive` | Upload base64 file content; requires `confirm: true` |
| `mark_task_complete` | Complete a task; requires `confirm: true` |

The upload limit is 15 MiB decoded. REST, Socket.IO, and MCP reuse backend services for task status changes and ownership checks. MCP does not provide a built-in chat interface.

## Tests and checks

```bash
cd backend
npm test
```

The repository includes 37 offline tests across configuration/sync, date-window handling, and dashboard policy. They cover batching, quota handling, duplicate skips, category filtering, expiration, timezone resolution, deadline pagination, and log-field filtering.

Tests use stubs for external services. Passing them does not verify a live Google account, Gemini key, database connection, or browser flow.

Frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

For a manual check, sign in, sync, inspect the terminal logs, complete or dismiss an important task, and verify that it leaves High Priority and Upcoming Deadlines.

## Project layout

| Location | Responsibility |
| --- | --- |
| `backend/src/config` | Environment, database, Google scopes |
| `backend/src/controllers` and `routes` | HTTP API |
| `backend/src/models` | Users, sessions, encrypted connections, tasks, processed source IDs |
| `backend/src/services/google` | Google API adapters and token refresh |
| `backend/src/services/ingestion` | Source normalization |
| `backend/src/services/ai` | Extraction, response validation, mock mode, Gemini quota ledger |
| `backend/src/services/decision` | Eligibility, importance, urgency, priority |
| `backend/src/services/realtime` and `cron` | Notifications and deadline recalculation |
| `backend/src/mcp` | MCP tool definitions |
| `backend/tests` | Offline regression tests |
| `frontend/src` | Dashboard, profile, Drive, API client, and React hooks |

## Current limitations

- Sync is manually triggered. Automatic Classroom selection takes up to five courses, and the default Gmail fetch limit is 100 messages per sync (configurable up to 200). The UI does not yet expose course selection or a persistent Gmail pagination cursor.
- Duplicate checks and cached ignored IDs avoid repeat AI calls. Previously processed items are not automatically re-extracted when a source, profile, or prompt changes.
- Classification and deadlines depend on the extracted text. Batch bodies are truncated to 3,500 characters; attachments and linked pages are not parsed. Missing deadlines do not establish that an opportunity is open.
- The 30-day rule also hides older sources whose deadlines are still in the future. Completed/dismissed history is subject to the same age and deadline filters.
- Missing eligibility profile fields cannot be verified; the current Boolean eligibility result is not proof that every criterion was checked.
- Quota reservations, sync locks, and cron scheduling target a single backend process. They are not distributed coordination mechanisms.
- Drive access is limited by `drive.file`. There is no unrestricted Drive search or built-in conversational assistant.
- Google tokens are encrypted at rest with AES-256-GCM; session tokens are hashed in MongoDB, and cookies are HTTP-only. The legacy `POST /api/users` profile-creation route remains unauthenticated. Review this and the broader authentication/deployment requirements before a public production deployment.

For applying the dashboard update to an existing installation, see [APPLY_DASHBOARD_FIXES.md](APPLY_DASHBOARD_FIXES.md).
