# Claim360 CRM

A shareholder recovery and team operations CRM maintained by **Puneet Jaiswal**.

**Live CRM:** https://claim360-crm.vercel.app/

## Connected project

- GitHub repository: Puneetjaiswal01/claim360crm
- Vercel production project: claim360-crm
- Supabase database and authentication: qwbrnzdexudbzzxftqov, Mumbai
- Cloudflare: account workspace labelled Claim360 CRM; custom domain setup requires access to the account that hosts claim360.in.

## Features

Lead ownership, team dashboards, CSV imports, follow-ups, Visit status, email templates, employee profiles, Original/Dark themes and CRM usage sessions.

Administrators can rotate selected RNR/Cold leads to other employees and review ownership and recorded work on each lead. See [lead rotation setup and usage](docs/lead-rotation.md).

Duplicate review compares complete lead details and flags identity conflicts. Reports and Activity reports show employee action counts, per-lead action details and holding values with filtered CSV exports. See [duplicate detection and reporting](docs/duplicates-and-reports.md).

## Setup

Copy .env.example to .env.local and fill the Supabase API URL and publishable key. Never put a service-role key in browser code. See [deployment setup](docs/deployment-setup.md) for the active project and environment configuration.

Production changes are deployed from main through the connected Vercel project.

## Temporary local workspace

Run `npm install`, then `npm run dev -- --hostname 127.0.0.1` and open http://localhost:3000.

For an isolated development account, enable `NEXT_PUBLIC_LOCAL_DEV=true` and
`LOCAL_DEV_AUTH=true` in the ignored `.env.local`. Configure `LOCAL_DEV_ADMIN_EMAIL`,
`LOCAL_DEV_ADMIN_PASSWORD_HASH` (`salt:scryptHex`, using a 64-byte scrypt hash), and
a random `LOCAL_DEV_SESSION_SECRET` on the server. Restart the dev server after changing settings.
The password itself must stay out of source files and public environment variables.

This mode provides a local admin login, an empty dashboard, and basic local record
creation, editing, comments, CSV imports and exports. Records persist in the ignored
`.local-dev/crm.json`. Team account creation and cloud realtime
are not implemented in this temporary backend; unsupported operations return an error.
All client database requests go to the local development route while enabled.
The local route requires signed sessions, accepts only same-origin localhost requests,
and returns 404 outside development. Production continues to use Supabase.
Turn both local flags off and restart to return to Supabase authentication and data.

## UI design and Stitch

The interface foundation is documented in [DESIGN.md](DESIGN.md). The
[Stitch workflow](docs/stitch-design.md) connects the local design tooling to a
Stitch account and generates reference screens from the checked-in briefs.
Set `STITCH_API_KEY` in `.env.local` and run `npm run design:check` to connect.
Use `npm run design:brief -- dashboard` to preview the prompt without a key.

Inter Variable and Manrope Variable are served locally through `next/font/local`.
Shared controls and all workspaces use the type scale in `DESIGN.md`, including
the shareholder editor, team directory, imports, reports and dark mode.

The [frontend interaction system](docs/frontend-polish.md) adds editable Arc UI
components for counters, skeletons, appearance controls and Ctrl+K quick navigation.
Source attribution and the MIT license are included under `components/arc`.
