# Claim360 CRM deployment setup

- Repository: Puneetjaiswal01/claim360crm, production branch main.
- Active Vercel project: claim360-crm.
- Production URL: https://claim360-crm.vercel.app/
- Supabase project: qwbrnzdexudbzzxftqov (ap-south-1).
- API URL: https://qwbrnzdexudbzzxftqov.supabase.co
- Vercel requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. The latter is the project's publishable key, despite the historical variable name. Never use a service-role key in browser code.
- For local development, copy .env.example to .env.local and fill both values from Supabase. Environment files are gitignored.
- Production builds stop if these settings are missing; there are no fallback credentials in application source.
- Push main to deploy claim360-crm automatically. The retired claim360-enterprise project was disconnected from GitHub on 2026-10-14.
- crm.claim360.in is assigned to claim360-crm but pending DNS ownership verification; keep using the verified Vercel production URL until DNS is validated.
- Database policies restrict agents to owned leads and administrators to all leads. Only active team members can access or transfer leads.
- My profile permits members to edit their own details. CRM role and account email are controlled separately.
