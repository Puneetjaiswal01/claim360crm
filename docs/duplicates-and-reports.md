# Duplicate review and lead action reports

## Duplicate detection

Open **Duplicates** as an administrator. The scanner considers active leads across all owners and generates candidate pairs from reference IDs, normalized names, similar names, company/name combinations, phone numbers, email addresses and addresses. It supports reordered names, honorifics, company suffix abbreviations, Indian phone prefixes, and multiple contacts in a field. Placeholder and blank values do not count as identity evidence.

Each candidate is compared across every stored field, including custom fields, holdings, owner, status, dates, remarks, location and complete activity entries. **Compare all parameters** shows matches, differences and missing values. Holding values are normalized numerically when their currency/units are recognized. Shared ownership, common status, matching amounts or generic remarks alone never make two leads duplicates.

Scores rank evidence; they are not probabilities. Conflicting shareholder names or companies keep a candidate in **Review needed**, even with a shared family contact. No records are merged automatically. Fuzzy candidates can be opened and corrected before review; the existing server rule still requires confirmed shareholder/company identities before merging.

The browser compares at most 200,000 candidate pairs. Broad surname-only blocks above 100 records are skipped. If either limit applies, a warning explicitly says that the scan is incomplete. Use the employee portfolio filter to reduce scope; use all employees to detect duplicates across owners. Candidate lists are paginated rather than silently stopping at the first 100 groups.

The reviewed merge checks both records' `updated_at` versions under database row locks. Changed records require a fresh comparison. The local backend preserves original source/target snapshots, comments, differing source details and linked visits, and supports undo while the records and visits are unchanged. Supabase continues using its existing merge-preservation procedure.

## Reports and Activity reports

Both pages use the same action ledger and support IST date ranges, actor, action type, lead/detail search, employee summaries and full filtered CSV downloads. Reports also shows the current active pipeline by owner, status and holding value. Pipeline totals are current and separate from the dated action filters.

Recorded actions cover lead creation, deletion/archive/restore, field edits, mining/sales remarks, status changes, follow-up scheduling/completion/clearing, comments/notes, logged calls/emails, visits, transfers, rotations, merges and undo. A save that changes status and schedules a follow-up represents two distinct actions. One recorded call is counted once even when its insertion also appears in database history. Copied merge comments are not credited as new work to the merging administrator.

Actions are attributed to the saved actor, including previous owners. The report does not assume the current owner performed earlier work. Older events with no saved actor remain unattributed. Historical coverage depends on retained activity and database change records; actions that were never recorded cannot be reconstructed.

Holding values use an available historical snapshot, with current lead values as a labeled fallback. Overall holding totals count each lead record once, using its latest matching action. Employee subtotals may share leads and must not be added to produce the overall holding total. Missing, ambiguous and non-INR amounts are excluded and counted separately. Holdings are not payments, revenue or received fees. Calls and emails are employee-entered logs; preparing an email does not prove it was sent.

No Audit trail page or navigation item is added. The existing internal change records supply the reports. Local visit changes, activity deletion, lead deletion, assignments, merges and restores now retain report evidence as well.

## Supabase setup and checks

Apply [crm_duplicate_review.sql](crm_duplicate_review.sql) after `crm_operations.sql`, `crm_merge_preservation.sql` and `crm_lead_rotation.sql`. It adds stale-review protection and preserves assignment journal changes in internal report evidence. The local backend is ready without this migration.

Validation:

- `node --test tests/lead-intelligence.test.mjs tests/lead-rotation-local.test.mjs`
- `npx tsc --noEmit`
- `npm run build`
- `psql -X -v ON_ERROR_STOP=1 -f tests/duplicate-review.sql <connection options>` only against an empty disposable database. It includes the rotation fixture and checks permissions, stale merge rejection, archived record rejection and assignment evidence capture. The fixture uses a stub merge primitive to isolate the new review guard; the local integration test covers preservation and undo end to end.
