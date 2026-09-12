# Daily Routine

Daily Routine is a local-first desktop academic dashboard for courses, deadlines, exams, syllabus knowledge, personal notes, and imported notifications. Version 0.1 is designed for hands-on product testing: it is intentionally compact, editable, and easy to extend.

## Current MVP

- Chronological Dashboard grouped into overdue, today, tomorrow, next 7 days, and later
- Today's classes, course-filtered upcoming exams, and hide-completed control
- Course create/edit/delete, consistent course colors, and timezone settings
- Freely editable course notes with local autosave
- Unified event create/edit/delete and three-state status control
- Course Deadlines and Syllabus tabs, including percentage/points grading and score planning
- Weekly timetable with manual editing and local image recognition
- PDF syllabus attachment plus editable summary, policies, office hours, and grading breakdown
- Month calendar with course-specific event markers
- Local deterministic parser for pasted Brightspace activity-summary emails
- Read-only Brightspace sync for active courses, assignment folders, and quizzes
- Interactive Brightspace/SSO login in a dedicated persistent Electron session; MFA remains user-controlled
- Exact Brightspace API deadlines enter the schedule directly, with stable source IDs preventing duplicate re-imports; pasted email interpretations still enter Inbox for review
- Brightspace syllabus discovery through course overview and content topics, with local PDF text extraction into the existing syllabus fields
- Gradescope login through a separate persistent browser session, with current student assignment deadlines merged directly into the same course schedule
- Basic duplicate warning based on course, normalized title, and nearby due time
- Source labels and original raw source text in event details
- Real SQLite storage powered by `sql.js`, persisted as a local `.sqlite` file
- Realistic Fall 2026 demo data and one-click reset
- Isolated Gmail and Outlook adapter extension points
- Windows application, window, and system-tray icon using the supplied custom artwork
- Closing the main window hides it to the tray; click the tray icon to restore it or use its menu to exit

Daily Routine never asks for or stores a Brightspace password. Brightspace sign-in happens on the provider's real page; Electron keeps only that dedicated browser session in the local app profile so later syncs can usually renew silently.

## Stack

Electron, React 18, TypeScript, Vite, SQLite (`sql.js`), Luxon, Vitest, and plain maintainable CSS.

## Setup

Node.js 20 or newer is recommended. pnpm is preferred:

```bash
pnpm install
pnpm dev
```

The `dev` command starts Vite and then opens the Electron desktop window.

On this Windows workspace, a **Daily Routine** shortcut is also created on the desktop. It launches without leaving a PowerShell window open.

## Quality and build commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Run `pnpm build` before `pnpm start`. The production renderer is written to `dist/` and Electron code to `dist-electron/`.

## Local database

The database is named `daily-routine.sqlite` inside Electron's platform-specific user-data directory:

- Windows: `%APPDATA%/Daily Routine/daily-routine.sqlite`
- macOS: `~/Library/Application Support/Daily Routine/daily-routine.sqlite`

The exact active path appears under **Settings → Data** in the app.

## Brightspace sync

Open **Settings → Brightspace**, confirm the institution URL, and choose **Connect / re-login**. Complete the institution login and MFA in the separate window. After authentication, Daily Routine reads active course enrollments and the available assignment and quiz due dates, then adds exact API deadlines directly to each course's **Deadlines** tab.

After a successful connection, later app launches start the same sync in the background when the saved session is still usable. This never opens an MFA window automatically; an expired session is logged and waits for a manual **Connect / re-login**.

The connector uses the same Brightspace API flow as Brightspace Bar: a persistent browser session obtains D2L cookies and an XSRF token, exchanges them for a short-lived bearer token, and performs read-only API calls. Cookies and tokens are never written into the Daily Routine SQLite database or exposed to the renderer. **Disconnect** deletes the dedicated Electron browser session but keeps already imported academic data.

The sync applies Brightspace Bar's “current course” rule: active enrollment, already started (or undated), and not ended. It also derives a conservative semester window from explicit names such as `Spring 2026`, because some Purdue courses remain API-readable after their semester ends. Only entries with a recognizable academic subject and course number are retained, so training and Civics shells are excluded. At least one of the assignment or quiz routes must be readable before importing a course. If both routes fail—commonly HTTP 403 for an ended course—the course is excluded.

For each retained course, sync reads the Brightspace course overview and `content/toc`, finds File topics whose title or module path mentions `syllabus`, downloads the file through the authenticated API, and extracts PDF text locally. The existing Course summary, Office hours, Attendance policy, Late policy, Grade breakdown, and syllabus exam dates are populated when recognized. Manually edited syllabus data is not overwritten by later automatic syncs.

Each connection and sync writes a rotating diagnostic log available through **Settings → Brightspace → Open log**. It records timestamps, course IDs/names, filtering decisions, HTTP outcomes, and import counts. It deliberately never records cookies, CSRF tokens, bearer tokens, passwords, or MFA answers.

## Gradescope sync

Open **Settings → Gradescope** and choose **Login / re-login**. Sign in on Gradescope's own page; Daily Routine never reads or stores the entered password. It keeps the dedicated browser session locally, reads the student assignment table, and sends exact due dates directly to **Deadlines**. Current-term courses are included, and a course whose Gradescope term is wrong is still included when its academic course code or name matches an existing Daily Routine course. Submitted assignments enter as completed, stable source IDs update changed dates without duplication, and an assignment already imported from Brightspace is de-duplicated by course, title, and nearby due time.

Gradescope does not offer a generally available student REST API, so the connector reads the authenticated, server-rendered dashboard rather than calling a private API. After the first successful sync it refreshes in the background on later launches. A separate rotating log is available under **Settings → Gradescope → Open log** and never contains credentials or cookies.

## Demo data and reset

A new installation starts empty so that a missing or moved database can never be mistaken for a successful reset. **Settings → Data → Reset demo data** remains an explicit, confirmed action for product testing and replaces all current app data.

## Architecture

- `electron/` — secure desktop host, IPC boundary, and SQLite persistence
- `src/domain/` — shared course/event data model and date logic
- `src/services/` — isolated matching and future parser services
- `src/integrations/` — email parser and connector adapter boundaries
- `src/components/` — reusable interface pieces and edit dialogs
- `src/pages/` — product screens

The renderer never accesses the filesystem or database directly; a narrow context-isolated preload API mediates operations. Imported values carry source metadata and a `userEdited` marker so future re-import logic can preserve manual corrections.

## Known limitations

- A manually attached PDF remains editable but is not parsed automatically; Brightspace-discovered syllabus PDFs are extracted automatically.
- Gmail and Outlook OAuth are not implemented. Email import is paste-based.
- Gradescope's student dashboard markup is not a public API and may require a connector update if Gradescope changes its HTML structure.
- Brightspace API versions and institution SSO pages can change; use **Connect / re-login** if a saved session no longer renews.
- `.eml` import, notifications, cloud sync, and sharing UI are out of scope.
- The app is runnable from source but is not yet packaged into signed installers.

## Future integrations

`EmailAdapter`, `GmailAdapter`, `OutlookAdapter`, `GradescopeAdapter`, and the deterministic `SourceParser` boundary allow authenticated connectors or richer parsers to be added without changing the core academic-event model.
