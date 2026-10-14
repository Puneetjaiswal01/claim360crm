BEGIN;SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='{"sub":"52866b48-cdc2-4dcf-9509-6a7a7a9ebb06","role":"authenticated"}';
DO $qa$
DECLARE snapshot jsonb;tablename text;restored_count bigint;
BEGIN
 snapshot=public.crm_export_backup();
 FOREACH tablename IN ARRAY ARRAY['leads','crm_team_members','crm_member_profiles','crm_visits','crm_lead_activity','crm_audit_events','crm_active_days','crm_merge_events'] LOOP
  EXECUTE format('CREATE TEMP TABLE %I (LIKE public.%I INCLUDING ALL) ON COMMIT DROP','qa_restore_'||tablename,tablename);
  EXECUTE format('INSERT INTO %I OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(NULL::public.%I,$1)','qa_restore_'||tablename,tablename) USING snapshot->'tables'->tablename;
  EXECUTE format('SELECT count(*) FROM %I','qa_restore_'||tablename) INTO restored_count;
  IF restored_count<>jsonb_array_length(snapshot->'tables'->tablename) THEN RAISE EXCEPTION 'Restore count mismatch: %',tablename;END IF;
 END LOOP;
END $qa$;
SELECT 'Isolated restore check passed for all business tables; permanent data was not changed' result;
ROLLBACK;