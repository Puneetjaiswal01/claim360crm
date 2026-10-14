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

## Setup

Copy .env.example to .env.local and fill the Supabase API URL and publishable key. Never put a service-role key in browser code. See [deployment setup](docs/deployment-setup.md) for the active project and environment configuration.

Production changes are deployed from main through the connected Vercel project.
