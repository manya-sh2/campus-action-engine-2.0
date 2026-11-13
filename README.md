# Campus Action Engine 2.0

Campus Action Engine turns fragmented student information (Gmail, Google
Classroom, Google Drive) into a personalized, prioritized action feed.

This project is being built **phase by phase**. This README documents only
what has actually been implemented so far.

---

## Current Status: Phase 5 — Frontend + End-to-End Integration (Complete)

Phase 5 adds a React + Vite frontend that demonstrates the full backend
built in Phases 1-4: Google sign-in, a prioritized task dashboard with
real-time updates, task completion, Gmail/Classroom sync, and Drive
search/upload - all talking to the existing backend through its
existing REST/Socket.IO APIs. No new backend architecture, no second
authentication system, no new database.

```
Gmail/Classroom → Normalizer → LLM Extraction → Validation →
Eligibility → Importance → Urgency → Priority → MongoDB Task
  → Socket.IO real-time push -----------------------┐
  → Cron deadline re-check --------------------------┤
  → MCP / REST access --------------------------------┤--> React frontend
  → Drive action when explicitly requested -----------┘
```

This is the final planned phase. It intentionally does **not** include:

- An AI chat assistant / conversational interface
- Redis, queues, Kafka, RabbitMQ, or any other new infrastructure
- Redux or a routing library (plain React state/hooks + tabs are enough
  at this scope)

### Architecture (Phase 1 + 2 + 3 + 4 + 5 scope)

```
backend/
└── src/
    ├── config/
    │   ├── db.js            # MongoDB connection (Mongoose)
    │   ├── env.js            # Centralized environment variable access
    │   └── googleScopes.js   # Centralized, least-privilege OAuth scopes
    ├── models/
    │   ├── User.js             # Student profile schema
    │   ├── GoogleConnection.js # Encrypted Google OAuth tokens (per user, per provider)
    │   ├── Session.js          # Application login sessions (hashed token, TTL)
    │   └── Task.js              # Processed, scored opportunities/tasks (Phase 3)
    ├── routes/
    │   ├── user.routes.js
    │   ├── auth.routes.js       # Google OAuth start/callback, /me, /logout
    │   ├── gmail.routes.js      # authenticated
    │   ├── classroom.routes.js  # authenticated
    │   ├── drive.routes.js      # authenticated
    │   ├── task.routes.js       # authenticated - sync + task queries + status updates
    │   └── mcp.routes.js        # authenticated - stateless MCP endpoint (Phase 4)
    ├── controllers/
    │   ├── user.controller.js
    │   ├── auth.controller.js
    │   ├── gmail.controller.js
    │   ├── classroom.controller.js
    │   ├── drive.controller.js
    │   └── task.controller.js
    ├── mcp/
    │   └── server.js         # registers all 8 MCP tools, each a thin wrapper over
    │                         # an existing service, bound to one authenticated user
    ├── services/
    │   ├── user.service.js
    │   ├── auth.service.js      # sessions + find-or-create user from Google profile
    │   ├── task.service.js      # Task CRUD/querying, status updates, urgency
    │   │                        # recalculation, duplicate prevention, ownership
    │   ├── sync.service.js      # orchestrates fetch -> normalize -> pipeline -> persist
    │   ├── realtime/
    │   │   └── socket.service.js # Socket.IO server: session-cookie auth, per-user
    │   │                          # rooms, task:created/priority_updated/completed
    │   ├── cron/
    │   │   └── deadline.cron.js  # scheduled urgency/priority re-check (node-cron)
    │   ├── google/
    │   │   ├── oauth.service.js      # THE shared credential mechanism (auth URL, token
    │   │   │                         # exchange, connection persistence, token refresh)
    │   │   ├── gmail.service.js      # reads + normalizes Gmail messages
    │   │   ├── classroom.service.js  # reads courses/announcements/courseWork
    │   │   ├── drive.service.js      # search, metadata, upload
    │   │   └── mock.data.js          # canned data, used only when GOOGLE_MOCK_MODE=true
    │   ├── ingestion/
    │   │   └── normalizer.js         # Gmail/Classroom -> one common shape
    │   ├── ai/
    │   │   ├── llm.service.js        # the only module that talks to OpenAI
    │   │   ├── extractionSchema.js   # shared JSON Schema for structured outputs
    │   │   ├── validateExtraction.js # defense-in-depth validation of LLM output
    │   │   └── mock.extraction.js    # rule-based extractor, used only when OPENAI_MOCK_MODE=true
    │   └── decision/
    │       ├── eligibility.service.js # deterministic branch/CGPA/gradYear check
    │       ├── importance.service.js  # deterministic 0-100 relevance score
    │       ├── urgency.service.js     # deterministic 0-100 deadline-based score
    │       ├── priority.service.js    # combines importance+urgency -> level + reasons
    │       └── pipeline.service.js    # glues extraction->validation->the 3 engines together
    ├── middlewares/
    │   ├── error.middleware.js
    │   ├── notFound.middleware.js
    │   └── auth.middleware.js   # requireAuth - establishes req.user from the session cookie
    ├── utils/
    │   ├── asyncHandler.js
    │   ├── ApiError.js
    │   ├── apiResponse.js
    │   ├── validateUserInput.js
    │   ├── crypto.js               # AES-256-GCM encrypt/decrypt for stored tokens
    │   ├── translateGoogleError.js # maps Google API errors to ApiErrors
    │   └── timezone.js             # timezone-aware deadline resolution for urgency scoring
    ├── app.js              # Express app (no listen())
    └── server.js           # Creates the HTTP server, attaches Socket.IO, starts the
                             # deadline cron, connects DB, warns on incomplete config, listens
```

The server intentionally refuses to start accepting requests until the
MongoDB connection succeeds.

Architecture flow for every Google-backed request:

```
Route → requireAuth (session cookie → req.user) → Controller → Google Service
      → oauth.service.getAuthorizedClient(req.user.id) → Google API
```

Architecture flow for a task sync:

```
POST /api/tasks/sync → requireAuth → sync.service
  → gmail.service / classroom.service (fetch)
  → ingestion/normalizer (common shape)
  → decision/pipeline.service, per item:
      ai/llm.service (extract) → ai/validateExtraction (validate)
      → decision/eligibility.service → decision/importance.service
      → decision/urgency.service → decision/priority.service
  → task.service.createTaskIfNotExists (dedup + persist)
  → realtime/socket.service.notifyTaskCreated (only if newly created AND important)
```

Architecture flow for the deadline cron:

```
node-cron tick → deadline.cron.runDeadlineCheck
  → task.service.findPendingTasksWithDeadlines (bounded, populates the owner)
  → task.service.recalculateUrgency, per task:
      decision/urgency.service (reused, not reimplemented)
      → decision/priority.service (reused, not reimplemented)
      → only writes + notifies if the recomputed values actually changed
  → realtime/socket.service.notifyTaskPriorityUpdated (only on a meaningful level change)
```

Architecture flow for MCP:

```
AI client → POST /mcp (session cookie) → requireAuth → mcp/server.js
  (a fresh McpServer bound to req.user via closure, per request)
  → tool call → EXISTING service (task.service / user.service / driveService)
  → MongoDB / Google API
```

Controllers never call Google or OpenAI APIs directly, no Google service
re-implements token refresh (it's all in `oauth.service.js`), the LLM
never makes eligibility/importance/urgency/priority decisions (those are
deterministic backend calculations in `services/decision/*`), and MCP
tools never touch MongoDB or Google APIs directly - every tool is a thin
wrapper over the same service functions the REST API and Socket.IO
handlers already use.

### Frontend (Phase 5)

```
frontend/
├── index.html
├── vite.config.js       # dev server pinned to port 3000 (matches backend's
│                         # default CLIENT_URL/CORS origin)
├── .env.example          # only VITE_API_URL - no secrets ever live here
└── src/
    ├── main.jsx           # mounts <App/> inside <AuthProvider/>
    ├── App.jsx             # tab-based shell: Dashboard / Profile / Drive
    ├── index.css           # the entire design system (no UI library)
    ├── api/
    │   ├── client.js        # fetch wrapper - always credentials:'include',
    │   │                     # never reads/stores any token itself
    │   └── endpoints.js      # one function per existing backend route
    ├── context/
    │   └── AuthContext.jsx   # the ONLY source of identity - calls the
    │                         # existing GET /api/auth/me, nothing else
    ├── hooks/
    │   ├── useTaskSocket.js  # Socket.IO client - same session cookie,
    │   │                     # surfaces events as notifications + a refetch signal
    │   └── useTasks.js       # fetches/filters tasks via the existing REST endpoints
    └── components/
        ├── LoginScreen.jsx        # "Sign in with Google" -> full-page redirect
        ├── DashboardPage.jsx       # Critical/High + Upcoming Deadlines + All Tasks
        ├── TaskCard.jsx / TaskList.jsx / TaskFilters.jsx
        ├── TaskDetailDrawer.jsx    # full explainability: reasons, skills, eligibility
        ├── SyncPanel.jsx           # triggers POST /api/tasks/sync, shows the summary
        ├── ProfilePanel.jsx        # view/edit profile fields the engines use
        ├── DrivePanel.jsx          # search + upload
        ├── NotificationFeed.jsx    # renders Socket.IO events
        └── Badges.jsx / Feedback.jsx  # small presentational primitives
```

Architecture flow for the frontend:

```
Browser → LoginScreen → GET /api/auth/google (full-page redirect, real OAuth)
        → backend OAuth callback → redirect back to the frontend origin
        → AuthContext calls GET /api/auth/me → session confirmed
        → DashboardPage: useTasks() calls GET /api/tasks, /priority/high
        → SyncPanel: POST /api/tasks/sync (existing pipeline runs)
        → useTaskSocket(): Socket.IO connects with the same session cookie
            → task:created / task:priority_updated / task:completed
            → surfaced as notifications + trigger a plain refetch
        → TaskDetailDrawer: PATCH /api/tasks/:id/status (completed/dismissed)
        → DrivePanel: GET/POST /api/drive/files
```

The frontend never re-implements eligibility/importance/urgency/priority
logic, never stores a Google or session token itself (identity lives
only in the backend's httpOnly cookie), and never talks to Google or
OpenAI directly - every screen reads from or writes to the existing
REST/Socket.IO surface described above.

---

## Installation

Backend:

```bash
cd backend
npm install
```

Frontend:

```bash
cd frontend
npm install
```

## Configuration

Copy the example environment file and fill in your own values:

```bash
cp .env.example .env
```

`.env` variables:

| Variable                | Description                                                                 | Example                                                |
|-------------------------|-------------------------------------------------------------------------------|---------------------------------------------------------|
| `PORT`                  | Port the API listens on                                                       | `5000`                                                   |
| `NODE_ENV`               | `development` or `production`                                                 | `development`                                            |
| `MONGODB_URI`            | Mongoose connection string                                                    | `mongodb://localhost:27017/campus-action-engine`        |
| `CLIENT_URL`             | Frontend origin - used for CORS and post-login redirects                     | `http://localhost:3000`                                  |
| `GOOGLE_CLIENT_ID`       | OAuth client ID from Google Cloud Console                                     | `123-abc.apps.googleusercontent.com`                     |
| `GOOGLE_CLIENT_SECRET`   | OAuth client secret from Google Cloud Console                                 | `GOCSPX-xxxxxxxx`                                        |
| `GOOGLE_REDIRECT_URI`    | Must exactly match a redirect URI registered in Google Cloud Console          | `http://localhost:5000/api/auth/google/callback`         |
| `TOKEN_ENCRYPTION_KEY`   | 64-char hex (32-byte) key used to encrypt stored Google tokens                | see "Generating `TOKEN_ENCRYPTION_KEY`" below            |
| `SESSION_COOKIE_NAME`    | Name of the application session cookie                                        | `cae_session`                                             |
| `SESSION_TTL_DAYS`       | How many days a login session stays valid                                     | `7`                                                       |
| `GOOGLE_MOCK_MODE`       | `"true"` to use canned Gmail/Classroom/Drive data instead of real Google APIs | `false`                                                   |
| `OPENAI_API_KEY`         | API key from platform.openai.com                                              | `sk-...`                                                  |
| `OPENAI_MODEL`           | Any current model supporting Structured Outputs (`response_format: json_schema`) | `gpt-4o-mini`                                          |
| `OPENAI_MOCK_MODE`       | `"true"` to use a rule-based mock extractor instead of calling OpenAI         | `false`                                                   |

`.env` is git-ignored — never commit real credentials.

### Generating `TOKEN_ENCRYPTION_KEY`

Google access/refresh tokens are encrypted (AES-256-GCM) before being
stored in MongoDB. Generate a key once per environment and keep it
stable — rotating it invalidates every stored Google connection (users
would need to reconnect):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste the output into `TOKEN_ENCRYPTION_KEY` in `.env`.

## MongoDB

You need a MongoDB instance reachable at `MONGODB_URI`. Options:

- **Local install**: run `mongod` locally (default URI works out of the box).
- **MongoDB Atlas**: create a free cluster and paste the connection string
  into `MONGODB_URI`.
- **Docker**: `docker run -d -p 27017:27017 --name cae-mongo mongo:7`

If MongoDB is unreachable, the server logs the error and exits — it will
not silently start without a database connection.

## Google Cloud Setup

You need a Google Cloud project with OAuth credentials before Google
sign-in will work. If you don't have real credentials yet, skip to
**Mock Mode** below to test everything else first.

### 1. Create/select a project

Go to [Google Cloud Console](https://console.cloud.google.com/) and
create a project (or pick an existing one).

### 2. Enable the required APIs

Under **APIs & Services → Library**, enable each of these individually:

- **Gmail API**
- **Google Classroom API**
- **Google Drive API**

### 3. Configure the OAuth consent screen

Under **APIs & Services → OAuth consent screen**:

- User type: **External** (or **Internal** if you're on a Google
  Workspace org and only your org's students will use this).
- Fill in app name, support email, developer contact.
- Add yourself (and any other testers) under **Test users** while the
  app is in "Testing" publishing status — required for Gmail/Classroom
  scopes to work at all until the app passes Google's verification.
- Under **Scopes**, add the same scopes listed below (Google will ask
  you to justify sensitive/restricted scopes — Gmail read and Classroom
  scopes fall into this category).

### 4. Create OAuth 2.0 credentials

Under **APIs & Services → Credentials → Create Credentials → OAuth
client ID**:

- Application type: **Web application**
- Authorized redirect URIs: add exactly what you'll put in
  `GOOGLE_REDIRECT_URI`, e.g. `http://localhost:5000/api/auth/google/callback`
- Copy the generated **Client ID** and **Client Secret** into
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.

### Required OAuth scopes

Centralized in `src/config/googleScopes.js` — least-privilege, read-only
wherever possible:

| Scope | Why |
|---|---|
| `openid`, `email`, `profile` | Identify who signed in (id, email, name) |
| `https://www.googleapis.com/auth/gmail.readonly` | Read Gmail messages; this app never sends or modifies email |
| `https://www.googleapis.com/auth/classroom.courses.readonly` | List courses |
| `https://www.googleapis.com/auth/classroom.announcements.readonly` | Read announcements |
| `https://www.googleapis.com/auth/classroom.coursework.me.readonly` | Read the signed-in student's own coursework |
| `https://www.googleapis.com/auth/drive.file` | Search/read/upload only files this app creates or the user explicitly opens with it — **not** the whole Drive |

**Drive scope tradeoff:** `drive.file` is intentionally the narrowest
practical scope, but it means `GET /api/drive/files?q=...` will only
find files the app itself created or that the user picked via a Google
Picker (not implemented in this phase) — it will **not** find
pre-existing files like an old resume already sitting in the user's
Drive. If your use case needs to search the user's entire existing
Drive, swap `DRIVE` in `src/config/googleScopes.js` for
`https://www.googleapis.com/auth/drive.readonly` (read-only, broader) and
re-consent. This is a deliberate least-privilege default, not an
oversight.

## Mock Mode

Don't have Google Cloud credentials set up yet, or want to test the rest
of the app without hitting real Google APIs? Set:

```
GOOGLE_MOCK_MODE=true
```

With this on, `GET /api/gmail/messages`, the Classroom endpoints, and
`GET /api/drive/files` all return small, clearly-fake canned datasets
from `src/services/google/mock.data.js` instead of calling Google.
Uploading a file (`POST /api/drive/files`) returns a fake Drive file id
without actually contacting Drive.

Important: **the OAuth login flow itself still runs for real** even in
mock mode — you still need `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
`GOOGLE_REDIRECT_URI` configured and a real Google sign-in to get a
session, because mock mode only swaps out the Gmail/Classroom/Drive
*data*, not authentication. This lets you test the whole
auth → session → protected-route pipeline with real Google identity
while still faking the Workspace data underneath. Never enable
`GOOGLE_MOCK_MODE` in production.

### OpenAI mock mode

Similarly, don't have an OpenAI API key set up yet? Set:

```
OPENAI_MOCK_MODE=true
```

With this on, `POST /api/tasks/sync` uses a small deterministic
rule-based extractor (`src/services/ai/mock.extraction.js`) instead of
calling OpenAI - it looks for known branch codes, a `"CGPA <n>"`
pattern, graduation-year mentions, known skill names, and date-like
phrases in the text. It's not an LLM and won't understand phrasing an
LLM would, but it's enough to exercise the full eligibility → importance
→ urgency → priority pipeline end-to-end offline. Never enable
`OPENAI_MOCK_MODE` in production. The two mock flags are independent -
you can mix real Google + mock OpenAI, mock Google + real OpenAI, or
any other combination while developing.

## Running the server

```bash
npm run dev     # nodemon, auto-restarts on file changes
# or
npm start       # plain node
```

On success you'll see:

```
[db] Connected to MongoDB: campus-action-engine
[server] Campus Action Engine API listening on port 5000 (development)
[server] Socket.IO and MCP (/mcp) are attached to the same server.
```

## Running the frontend

Copy the frontend env file - it holds nothing but the backend's URL:

```bash
cd frontend
cp .env.example .env
```

```bash
npm run dev      # Vite dev server on http://localhost:3000 (pinned - see vite.config.js)
```

Open `http://localhost:3000`. The dev server is pinned to port 3000
because the backend's default `CLIENT_URL` (used for CORS and the OAuth
redirect target) is `http://localhost:3000` - if you change one, change
the other to match, or the session cookie won't be sent/accepted.

For a production-style build:

```bash
npm run build     # outputs to frontend/dist
npm run preview   # serves the build on port 3000
```

## Running the full stack

1. Start MongoDB (see above).
2. Terminal 1: `cd backend && npm run dev`
3. Terminal 2: `cd frontend && npm run dev`
4. Open `http://localhost:3000`, click **Sign in with Google**, grant
   access, and you'll land back on the dashboard - click **Sync Gmail &
   Classroom** to pull in real data and watch it get scored and
   prioritized in real time.

Don't have Google/OpenAI credentials yet? Set `GOOGLE_MOCK_MODE=true`
and `OPENAI_MOCK_MODE=true` in `backend/.env` first (see Mock Mode
below) - the OAuth login flow still runs for real, but Gmail/Classroom/
Drive/LLM data is canned, so the whole flow (including the frontend) is
demoable without any external credentials at all.

## Testing the health endpoint

```bash
curl http://localhost:5000/api/health
```

Expected:

```json
{ "success": true, "message": "Campus Action Engine API is running" }
```

## Testing the user endpoints

`POST /api/users` remains an **unauthenticated, development-only**
endpoint for creating a profile before someone has signed in with
Google (there's no session to authenticate against at that point).
`GET /api/users/:id` and `PATCH /api/users/:id` require the session
cookie (`requireAuth`) **and** are ownership-checked: they only succeed
when `:id` matches the signed-in session's own user id — any other id
returns `403 Forbidden`, never another user's data.

**Create a user** (no auth required)

```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rohit Sharma",
    "email": "rohit@example.com",
    "branch": "CSE",
    "year": 3,
    "graduationYear": 2027,
    "cgpa": 8.4,
    "skills": ["Node.js", "MongoDB", "C++"],
    "preferredRoles": ["Backend Developer", "Software Engineer"]
  }'
```

**Fetch or update your own profile** (requires the session cookie - see
"Connecting Google" below for how to get one)

```bash
curl -b cookies.txt http://localhost:5000/api/users/<your-own-id>

curl -b cookies.txt -X PATCH http://localhost:5000/api/users/<your-own-id> \
  -H "Content-Type: application/json" \
  -d '{ "cgpa": 9.1 }'
```

Using any id other than your own signed-in user's id returns `403`.

**Validation errors** (e.g. invalid email, out-of-range CGPA) return `400`
with a list of human-readable messages. A nonexistent user id returns `404`
(only reachable for your own id, since a mismatched id is rejected with
`403` before the lookup even happens). A duplicate email on creation
returns `409`.

Note: if you later sign in with Google using the same email as a
dev-created user, that existing profile is reused (its `googleId` gets
attached) — you will not end up with two separate users for the same
person.

## Connecting Google

1. Open `http://localhost:5000/api/auth/google` in a **browser** (not
   curl — this is a redirect-based flow and you need to interactively
   grant consent).
2. Sign in and approve the requested permissions.
3. Google redirects back to the backend, which creates/finds your
   `User`, stores an encrypted `GoogleConnection`, starts a session, and
   redirects you to `CLIENT_URL` with `?googleConnected=true`. Your
   browser now holds an httpOnly session cookie.
4. The frontend (see "Running the frontend" above) handles this whole
   flow automatically. For manual REST testing instead, use a client
   that persists cookies (Postman, Insomnia, or
   `curl -c cookies.txt -b cookies.txt`) against the same cookie jar.

**Check who you're logged in as**

```bash
curl -b cookies.txt http://localhost:5000/api/auth/me
```

**Log out**

```bash
curl -b cookies.txt -X POST http://localhost:5000/api/auth/logout
```

All of the endpoints below require this session cookie — calling them
unauthenticated returns `401`.

## Gmail endpoints

**List recent messages** (optionally filtered with Gmail's search syntax)

```bash
curl -b cookies.txt "http://localhost:5000/api/gmail/messages?maxResults=10&q=internship"
```

**Get a single message**

```bash
curl -b cookies.txt http://localhost:5000/api/gmail/messages/<messageId>
```

Each message is normalized to `{ id, threadId, from, to, subject, snippet,
body: { text, html }, attachments, receivedAt, labelIds }`.

## Classroom endpoints

**List active courses**

```bash
curl -b cookies.txt http://localhost:5000/api/classroom/courses
```

**List announcements for a course**

```bash
curl -b cookies.txt "http://localhost:5000/api/classroom/announcements?courseId=<courseId>"
```

**List coursework for a course**

```bash
curl -b cookies.txt "http://localhost:5000/api/classroom/coursework?courseId=<courseId>"
```

**Get a single courseWork item's details**

```bash
curl -b cookies.txt http://localhost:5000/api/classroom/courses/<courseId>/coursework/<courseWorkId>
```

## Drive endpoints

**Search files by name**

```bash
curl -b cookies.txt "http://localhost:5000/api/drive/files?q=resume"
```

**Get file metadata**

```bash
curl -b cookies.txt http://localhost:5000/api/drive/files/<fileId>
```

**Upload a file**

```bash
curl -b cookies.txt -X POST http://localhost:5000/api/drive/files \
  -F "file=@/path/to/resume.pdf"
```

Remember: with the `drive.file` scope, search only returns files this
app created or that were explicitly opened with it — see the scope
tradeoff note above.

## Task sync & endpoints (Phase 3)

### Sync: fetch, extract, score, and store

```bash
curl -b cookies.txt -X POST http://localhost:5000/api/tasks/sync
```

This fetches recent Gmail messages and announcements/coursework from
your active Classroom courses (via the existing Phase 2 services),
normalizes them, runs each one through the LLM extraction → validation
→ eligibility → importance → urgency → priority pipeline, and stores
new tasks — skipping any that already exist. It returns a processing
summary rather than the tasks themselves:

```json
{
  "success": true,
  "message": "Sync complete",
  "data": {
    "fetched": 12,
    "created": 9,
    "duplicates": 2,
    "failed": 1,
    "errors": [
      { "source": "gmail", "sourceId": "18d...", "title": "...", "reason": "Malformed extraction output: ..." }
    ]
  }
}
```

A failure processing one item (bad LLM output, an OpenAI error, etc.)
never aborts the batch — it's recorded in `errors` and the rest of the
sync continues.

Optional body to override defaults:

```bash
curl -b cookies.txt -X POST http://localhost:5000/api/tasks/sync \
  -H "Content-Type: application/json" \
  -d '{
    "includeGmail": true,
    "includeClassroom": true,
    "classroomCourseIds": ["<courseId>"],
    "gmailQuery": "internship OR deadline",
    "gmailMaxResults": 20
  }'
```

`classroomCourseIds` defaults to your active courses (capped at 5) if
omitted. `userId` is never read from the request — the sync always runs
against the authenticated session user.

### Reading your tasks

**List with filtering, sorting, and pagination**

```bash
curl -b cookies.txt "http://localhost:5000/api/tasks?status=pending&priorityLevel=critical,high&minPriority=50&sortBy=priorityScore&sortOrder=desc&page=1&limit=20"
```

Supported query params: `status`, `category`, `priorityLevel` (comma-
separated for multiple), `minPriority`, `sortBy` (`priorityScore` |
`urgencyScore` | `importanceScore` | `deadline` | `createdAt`),
`sortOrder` (`asc`|`desc`), `page`, `limit` (capped at 100).

**Critical/high priority tasks only**

```bash
curl -b cookies.txt http://localhost:5000/api/tasks/priority/high
```

**A single task**

```bash
curl -b cookies.txt http://localhost:5000/api/tasks/<taskId>
```

Returns `404` for a nonexistent task **or** a task belonging to another
user — ownership is enforced by querying `{ _id, userId }` together, so
one user can never distinguish "not found" from "not yours."

### Marking a task's status

```bash
curl -b cookies.txt -X PATCH http://localhost:5000/api/tasks/<taskId>/status \
  -H "Content-Type: application/json" \
  -d '{ "status": "completed" }'
```

`status` must be one of `pending`, `in_progress`, `completed`,
`dismissed`. This single operation (`task.service.updateTaskStatus`) is
reused identically by this REST endpoint, the Socket.IO
`task:mark_complete` event, and the MCP `mark_task_complete` tool -
status logic exists in exactly one place. Marking a task `completed`
(from any of those three entry points) emits a `task:completed`
Socket.IO event to the owning user.

### Scoring formula

- **Eligibility** (deterministic, backend-only): only branch, CGPA, and
  graduation year are treated as hard requirements — matches the
  worked example in the original product spec, where "Node.js/Java
  preferred" is a skill signal, not a gate. Missing profile fields are
  treated as *unverifiable*, not automatic failures.
- **Importance** (0-100): eligibility match (≤35) + category relevance
  (≤25) + preferred role match (≤20) + skill overlap (≤20).
- **Urgency** (0-100): bucketed by time remaining until the deadline -
  overdue = 100, <24h = 95, ≤3 days = 80, ≤1 week = 60, ≤2 weeks = 40,
  ≤1 month = 25, beyond that = 12, no deadline detected = 15 baseline.
  Date-only deadlines (e.g. `"2026-09-20"`) are resolved as end-of-day
  in the student's own `timezone` field, not UTC.
- **Priority**: `priorityScore = round(importance * 0.6 + urgency * 0.4)`,
  mapped to a level (`critical` ≥80, `high` ≥60, `medium` ≥35, else
  `low`). `priorityReasons` includes the formula plus every contributing
  reason from both sub-engines, so every score is explainable.

## Real-time updates (Socket.IO)

Connect a Socket.IO client to the same host/port as the REST API,
sending the **same session cookie** you got from the Google OAuth
callback:

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  withCredentials: true, // sends the cae_session cookie
});

socket.on('task:created', ({ task }) => { /* a new important task arrived */ });
socket.on('task:priority_updated', ({ task, previousLevel }) => { /* deadline pressure changed its level */ });
socket.on('task:completed', ({ task }) => { /* marked done from REST, socket, or MCP */ });
```

A connection without a valid session cookie is rejected at handshake
time (`connect_error`). Each authenticated socket joins a private room
scoped to that user's id — events are only ever emitted to that room, so
one user's browser tab can never receive another user's events, even if
both are connected simultaneously.

`task:created` fires only for **newly-created** tasks that are already
`critical` or `high` priority (not every task from a sync — that would
be noisy). `task:priority_updated` fires only when the deadline cron
job's recomputation actually changes a task's priority level. Both
thresholds match the same "important" definition used by
`GET /api/tasks/priority/high`.

**Client → server**: the only inbound event is `task:mark_complete`:

```js
socket.emit('task:mark_complete', { taskId }, (ack) => {
  // ack: { success: true, data: {...} } or { success: false, message: "..." }
});
```

This calls the exact same `task.service.updateTaskStatus` the REST
endpoint uses — ownership is enforced identically (a taskId belonging to
another user fails with `success: false`, never a crash or a silent
no-op).

## Deadline automation (cron)

A `node-cron` job (schedule set by `DEADLINE_CRON_SCHEDULE`, default
every 15 minutes) periodically re-checks pending tasks whose deadline is
approaching or has passed, and recomputes their urgency/priority by
reusing the exact same `decision/urgency.service.js` and
`decision/priority.service.js` engines the original pipeline used - no
scoring logic is duplicated for the recompute path. A task's stored
`importanceScore` never changes (it doesn't depend on time), so only
`urgencyScore`, `priorityScore`, and `priorityLevel` are updated.

To avoid duplicate notifications and unnecessary writes, a task is only
saved and only triggers a `task:priority_updated` event when the
recomputed values **actually differ** from what's stored. Since time
only moves forward, a given task can cross into a more urgent bucket at
most once per bucket boundary — it won't re-notify on every cron tick
just because it's still, say, "within a week."

Set `ENABLE_DEADLINE_CRON=false` to disable the job entirely (e.g. for
tests, or if you're running multiple instances and only want one of them
scheduling it — this project intentionally has no distributed lock/queue
for that, consistent with the "no new infrastructure" constraint).

## MCP server

An MCP (Model Context Protocol) endpoint is mounted at `POST /mcp`,
authenticated with the **same session cookie** as the REST API — there
is no separate MCP auth scheme. It runs in the SDK's stateless mode: a
fresh `McpServer` is created per HTTP request, bound to that one
authenticated user via closure (not a parameter), so there is no field
an AI client could set to act on a different user's data.

Connect an MCP client (e.g. `@modelcontextprotocol/sdk`'s
`StreamableHTTPClientTransport`) to `http://localhost:5000/mcp`, sending
the session cookie in request headers.

**Available tools** — every tool is a thin wrapper over an existing
service; none re-implements scoring, dedup, or ownership checks:

| Tool | Reuses | Notes |
|---|---|---|
| `get_my_profile` | `user.service.findUserById` | read-only |
| `get_urgent_tasks` | `task.service.getHighPriorityTasks` | read-only |
| `get_upcoming_deadlines` | `task.service.getUpcomingDeadlines` | read-only, `withinDays` optional (default 14) |
| `get_relevant_opportunities` | `task.service.listTasks` | read-only, filters to job/internship/scholarship |
| `get_task_details` | `task.service.getTaskById` | read-only, 404-shaped error for another user's task |
| `search_drive_files` | `driveService.listFiles` | read-only |
| `upload_file_to_drive` | `driveService.uploadFile` | **write** - requires `confirm: true`; takes `fileContentBase64` (max 15MB decoded) |
| `mark_task_complete` | `task.service.updateTaskStatus` | **write** - requires `confirm: true`; emits `task:completed` |

The two write tools require an explicit `confirm: true` argument in
addition to the MCP protocol's own `readOnlyHint`/`destructiveHint`
annotations — calling them with `confirm` omitted or `false` returns an
error result explaining that the caller must re-invoke with
`confirm: true`, rather than silently performing the action. This is a
deliberate, protocol-independent confirmation gate that doesn't rely on
any particular MCP client's UI behavior.

No tool ever returns a Google access/refresh token, an OpenAI API key,
or a session token — profile and task payloads are built from explicit
field whitelists (the same ones Socket.IO events use), not by
serializing whole documents.

## Frontend

A single-page React app with three tabs, no router library needed at
this scope:

- **Dashboard** — the main screen:
  - **Critical / High Priority**: tasks needing immediate attention
    (`GET /api/tasks/priority/high`).
  - **Upcoming Deadlines**: pending tasks with a deadline, soonest first.
  - **All Tasks**: filterable (status/category/priority) and sortable,
    with pagination.
  - A **Sync Gmail & Classroom** button that calls `POST /api/tasks/sync`
    and shows the resulting summary (created/duplicates/failed, with
    per-item error detail if anything failed).
  - Each task card shows title, category, organization, deadline,
    priority level, importance/urgency/priority scores, eligibility, the
    top reasons behind its priority, and its current status, with
    "Mark complete" / "Dismiss" actions inline.
  - Clicking a task opens a detail drawer with the full picture:
    description, skills mentioned, every eligibility reason, every
    priority reason, and an "Open"/apply link when `actionUrl` exists.
- **Profile** — view and edit the fields the eligibility/importance
  engines actually read (branch, year, graduation year, CGPA, skills,
  preferred roles, timezone).
- **Drive** — search existing Drive files by name and upload a new one,
  using the exact same Phase 2/4 endpoints.

A live notification feed (top-right) shows real-time Socket.IO events
as they arrive (`task:created`, `task:priority_updated`,
`task:completed`), and a small header indicator shows whether the
socket is currently connected.

**States handled explicitly**: initial session check (spinner), signed
out (login screen, with a success/error banner if redirected back from
a failed/successful Google login), API errors on any panel (inline
banners, not silent failures), empty task lists (per-section empty
states with a hint), sync failures (error banner + per-item failure
list), and Drive search/upload failures (inline banners on that panel
only, not a global crash).

## Security & Token Storage Notes

- Google access/refresh tokens are **never** sent to the frontend and
  never appear in any normal API response (`GoogleConnection` excludes
  them by default via `select: false`, and strips them again defensively
  in `toJSON` as a second layer of protection).
- Tokens are encrypted (AES-256-GCM) before being written to MongoDB, so
  a database dump alone isn't enough to use someone's Google account.
- The application session cookie is `httpOnly`, `sameSite: lax`, and
  `secure` in production — JavaScript in the browser can't read it.
  Only the session token's **hash** is stored in MongoDB (`Session`
  model), not the raw token.
- Every Gmail/Classroom/Drive/Drive-upload request resolves the target
  user from the verified session (`req.user.id`) — a `userId` in the
  request body/query/params is never trusted for authorization, so User
  A cannot read or act on User B's Google connection.
- The same applies to tasks: sync always runs against `req.user`, and
  every task lookup/list query is scoped by `{ userId: req.user.id }` -
  a `userId` field anywhere in a request body is ignored, and a task
  belonging to another user returns `404`, not `403` (so its existence
  isn't leaked either).
- `GET /api/users/:id` and `PATCH /api/users/:id` require the session
  cookie and compare the `:id` path param against `req.user._id` -
  a mismatch returns `403 Forbidden` before any lookup or update
  happens, so one signed-in user can never read or modify another
  user's profile by changing the id in the URL. Only `POST /api/users`
  (creating a profile before a first Google sign-in) remains open.
- Socket.IO connections are authenticated with the identical session
  cookie mechanism as the REST API (`authService.verifySession`) - there
  is no separate, weaker auth path for sockets. Each socket joins a
  private per-user room; events are only ever emitted to that room, so
  cross-user delivery is structurally impossible, not just filtered.
- MCP (`/mcp`) sits behind the same `requireAuth` middleware as every
  other protected route, and each request's `McpServer` is bound to that
  request's authenticated user via closure - no tool has a `userId`
  parameter an AI client could override, so cross-user access isn't
  policy-enforced, it's structurally unavailable.
- Access tokens, refresh tokens, and the `OPENAI_API_KEY` are never
  logged.
- The frontend never sees a Google or OpenAI token or the raw session
  token - it only ever holds the httpOnly session cookie the browser
  attaches automatically, and its own `.env` contains nothing but the
  backend's URL.
- `.env` (backend and frontend, containing real secrets/config) is
  git-ignored.

---

## Phase 1 + 2 + 3 + 4 + 5 Limitations

- The Phase 1 `POST /api/users` endpoint (dev-only profile creation,
  used before a person has ever signed in with Google) remains
  **unauthenticated** by necessity — there's no session to check against
  yet at that point. `GET /api/users/:id` and `PATCH /api/users/:id` are
  now authenticated (`requireAuth`) **and** ownership-checked: the
  backend rejects any request where the `:id` in the URL doesn't match
  the signed-in session's own user id (`403 Forbidden`), regardless of
  what a client sends. The frontend's Profile tab was already only ever
  calling these with the signed-in user's own id, so no frontend
  behavior changed - the enforcement is now real on the server, not just
  incidental.
- There's no AI chat assistant / conversational UI - MCP gives an AI
  *client* (like Claude Desktop) a way to read/act on the backend, and
  the frontend gives a human a dashboard, but there's no chat interface
  bridging the two, and none was in scope.
- Sync is still triggered manually (the frontend's "Sync Gmail &
  Classroom" button, or `POST /api/tasks/sync` directly) - there's no
  scheduled *ingestion* job (only the deadline-recompute cron exists).
  A student needs to click sync (or a future scheduler phase would need
  to call it on their behalf) to pick up brand-new Gmail/Classroom items.
- Drive search is scoped to `drive.file` (app-created/opened files only)
  by design — see the scope tradeoff note above. The frontend's Drive
  tab reflects this as-is (no explanation beyond the on-screen hint).
- Classroom sync auto-selects up to 5 active courses if
  `classroomCourseIds` isn't specified - the frontend doesn't expose a
  way to pick specific courses (only the REST/MCP layer's optional
  parameter does). The raw Phase 2 `GET /api/classroom/announcements`
  and `.../coursework` endpoints still require an explicit `courseId`
  query parameter (except in mock mode) — unchanged from Phase 2.
- The Google OAuth consent screen must stay in Google's "Testing" mode
  (or be verified by Google) for the Gmail/Classroom scopes to keep
  working reliably outside of a fully published, verified app.
- Session cookies are opaque, hashed, and revocable, but there's no
  "view/revoke other active sessions" endpoint or UI yet - Socket.IO/MCP
  share that same session, so signing out in the frontend also cuts off
  any open socket connection and MCP access for that session.
- LLM extraction quality depends entirely on the configured
  `OPENAI_MODEL` and the source text; the deterministic scoring engines
  are unit-tested and reliable, but they can only score what the LLM
  correctly extracted. `OPENAI_MOCK_MODE`'s rule-based extractor is
  intentionally simple and not a substitute for evaluating real LLM
  extraction quality - the frontend will faithfully display whatever
  either one produces.
- The deadline cron runs in-process on a single instance with no
  distributed lock or queue (by design - no new infrastructure was
  added for this project). Running multiple instances of this server
  would run the job redundantly on each one unless `ENABLE_DEADLINE_CRON`
  is set to `false` on all but one.
- MCP runs in the SDK's stateless HTTP mode (one request, one response,
  no persistent MCP session) - Socket.IO (which the frontend uses) is
  the real-time channel; MCP itself has no server-initiated stream.
- The frontend has no client-side routing library and no build-time
  code-splitting beyond Vite's defaults - reasonable at this scope
  (three tabs, no deep-linkable sub-pages), but worth knowing if the UI
  grows significantly.
- No automated test suite (frontend or backend) is checked into the
  repo - verification at each phase was done via temporary smoke-test
  harnesses, deleted after each phase.
