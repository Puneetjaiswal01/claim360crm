# Lead rotation and work history

Admins can select leads in **All leads** and choose **Rotate selected RNR / Cold**. Up to 500 selected leads are processed per batch. Other statuses, archived records, stale records and records with no eligible recipient are skipped with a reason. Successfully rotated leads are removed from the selection.

For a single RNR or Cold lead, open **Administrator actions → Rotate lead**. Save any draft first. Recipients are team members with the `agent` role; the current owner is always excluded. The batch distributes leads across eligible employees, breaking ties by their active lead count. Status, comments, remarks, follow-ups and recorded work are preserved.

Admins can open **Comments → Ownership & work history** to see assignment changes, the administrator who reassigned each lead, and work attributed to each person. Work comes from calls, emails, notes, completed visits and audited lead edits/comments. Assignment is listed separately and does not count as work. Existing audit/activity records remain visible. Assignment tracking starts with the owner present when this migration is applied; earlier ownership changes are not reconstructed.

## Database setup

Apply [crm_lead_rotation.sql](crm_lead_rotation.sql) to Supabase after the CRM operations, member profiles, realtime status, lead workspace and admin-only transfer migrations. It creates an admin-readable assignment journal, captures all new owner changes, adds the admin-only rotation RPC, accepts the Cold status, and includes the journal in encrypted exports. Applying it again does not duplicate the starting assignments.

The local development backend supports the same rotation RPC and persists assignments and work audits in the ignored `.local-dev/crm.json`. It requires another employee profile to rotate to. The existing single-admin local login does not create additional employee accounts, and rotation does not create them automatically.

## Verification

- `npx tsc --noEmit`
- `node --test tests/lead-rotation-local.test.mjs` — isolated temporary local database; does not touch workspace data or credentials.
- `psql -X -v ON_ERROR_STOP=1 -f tests/lead-rotation.sql <connection options>` — only against an empty disposable PostgreSQL database. Covers admin permissions, current-owner exclusion, batch distribution, stale versions, status/notes preservation, missing recipients, Cold status and assignment journal protection.
- `npm run build`
