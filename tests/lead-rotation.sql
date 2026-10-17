-- Run only in an empty disposable PostgreSQL database:
-- psql -X -v ON_ERROR_STOP=1 -f tests/lead-rotation.sql <connection options>
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE SCHEMA crm_private;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE TABLE public.crm_team_members(user_id uuid PRIMARY KEY,role text);
CREATE TABLE public.crm_member_profiles(user_id uuid PRIMARY KEY,display_name text);
CREATE TABLE public.leads(id uuid PRIMARY KEY,owner_id uuid,status text,updated_at timestamptz DEFAULT clock_timestamp(),archived_at timestamptz,activities jsonb DEFAULT '[]',sales_remarks text);
CREATE TABLE public.crm_visits(id uuid);
CREATE TABLE public.crm_lead_activity(id uuid);
CREATE TABLE public.crm_audit_events(id uuid);
CREATE TABLE public.crm_active_days(id uuid);
CREATE TABLE public.crm_usage_sessions(id uuid);
CREATE TABLE public.crm_merge_events(id uuid);
CREATE FUNCTION public.crm_team_profiles() RETURNS SETOF public.crm_team_members LANGUAGE sql AS $$ SELECT * FROM public.crm_team_members $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.test_user',true),'')::uuid $$;
CREATE FUNCTION public.crm_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.crm_team_members WHERE user_id=auth.uid() AND role='admin') $$;
CREATE FUNCTION public.crm_is_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.crm_team_members WHERE user_id=auth.uid()) $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT,UPDATE ON public.leads TO authenticated;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_access ON public.leads TO authenticated USING(owner_id=auth.uid() OR public.crm_is_admin()) WITH CHECK(owner_id=auth.uid() OR public.crm_is_admin());
INSERT INTO auth.users VALUES
 ('00000000-0000-4000-8000-000000000001','admin@test.invalid'),
 ('00000000-0000-4000-8000-000000000002','a@test.invalid'),
 ('00000000-0000-4000-8000-000000000003','b@test.invalid'),
 ('00000000-0000-4000-8000-000000000004','c@test.invalid');
INSERT INTO public.crm_team_members SELECT id,CASE WHEN email LIKE 'admin%' THEN 'admin' ELSE 'agent' END FROM auth.users;
INSERT INTO public.crm_member_profiles SELECT id,email FROM auth.users;
INSERT INTO public.leads(id,owner_id,status,sales_remarks) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','RINGING NOT RESPONDING','Keep these notes'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','COLD','Keep cold notes'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','POTENTIAL','Keep potential'),
 ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','COLD','Archived');
UPDATE public.leads SET archived_at=now() WHERE sales_remarks='Archived';
\ir ../docs/crm_lead_rotation.sql
\ir ../docs/crm_lead_rotation.sql
CREATE FUNCTION pg_temp.check_result(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF NOT coalesce(ok,false) THEN RAISE EXCEPTION 'FAILED: %',label; END IF; END $$;
SELECT pg_temp.check_result((SELECT count(*)=4 FROM public.crm_lead_assignments),'idempotent assignment backfill');
SELECT set_config('request.test_user','00000000-0000-4000-8000-000000000001',false);
SELECT pg_temp.check_result(jsonb_array_length(public.crm_export_backup()->'tables'->'crm_lead_assignments')=4,'assignment history included in backups');
CREATE TEMP TABLE versions AS SELECT jsonb_object_agg(id,updated_at) AS value FROM public.leads;
SET ROLE authenticated;
CREATE TEMP TABLE rotated AS SELECT * FROM public.crm_rotate_leads(
 ARRAY['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004']::uuid[],
 (SELECT jsonb_object_agg(id,updated_at) FROM public.leads));
SELECT pg_temp.check_result((SELECT count(*)=4 FROM rotated),'duplicate IDs processed once');
SELECT pg_temp.check_result((SELECT count(*)=2 FROM rotated WHERE rotated),'only active RNR and Cold rotate');
SELECT pg_temp.check_result(NOT EXISTS(SELECT 1 FROM rotated WHERE rotated AND new_owner=previous_owner),'current owner excluded');
SELECT pg_temp.check_result((SELECT count(DISTINCT new_owner)=2 FROM rotated WHERE rotated),'batch distributed across other employees');
SELECT pg_temp.check_result((SELECT sales_remarks='Keep these notes' AND status='RINGING NOT RESPONDING' FROM public.leads WHERE id='10000000-0000-4000-8000-000000000001'),'status and notes preserved');
SELECT pg_temp.check_result((SELECT count(*)=2 FROM public.crm_lead_assignments WHERE reason='Rotation'),'rotation events recorded');
RESET ROLE;
GRANT SELECT ON versions TO authenticated;
SET ROLE authenticated;
SELECT pg_temp.check_result((SELECT NOT rotated FROM public.crm_rotate_leads(ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],(SELECT value FROM versions))),'stale version cannot rotate twice');
SELECT pg_temp.check_result((SELECT NOT rotated FROM public.crm_rotate_leads(ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],'{}')),'missing version cannot rotate');
SELECT pg_temp.check_result((SELECT status='COLD' FROM public.crm_set_lead_status('10000000-0000-4000-8000-000000000003','COLD',(SELECT updated_at FROM public.leads WHERE id='10000000-0000-4000-8000-000000000003'))),'Cold status accepted');
UPDATE public.leads SET owner_id='00000000-0000-4000-8000-000000000004' WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.crm_lead_assignments WHERE reason='Transfer'),'manual transfers tracked');
UPDATE public.leads SET owner_id=owner_id WHERE id='10000000-0000-4000-8000-000000000001';
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.crm_lead_assignments WHERE reason='Transfer'),'same owner creates no event');
RESET ROLE;
UPDATE public.crm_team_members SET role='admin' WHERE user_id IN ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
SET ROLE authenticated;
SELECT pg_temp.check_result((SELECT NOT rotated AND message='No other employee is available' FROM public.crm_rotate_leads(ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],(SELECT jsonb_object_agg(id,updated_at) FROM public.leads))),'no alternative leaves ownership unchanged');
RESET ROLE;
SELECT set_config('request.test_user','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
SELECT pg_temp.check_result((SELECT count(*)=0 FROM public.crm_lead_assignments),'assignment history admin only');
DO $$ BEGIN
 BEGIN PERFORM public.crm_rotate_leads(ARRAY['10000000-0000-4000-8000-000000000001']::uuid[],'{}'); RAISE EXCEPTION 'FAILED: non-admin rotation allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Admin access required' THEN RAISE; END IF; END;
 BEGIN UPDATE public.leads SET owner_id='00000000-0000-4000-8000-000000000002' WHERE id='10000000-0000-4000-8000-000000000001'; RAISE EXCEPTION 'FAILED: direct member transfer allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Only administrators can reassign leads' THEN RAISE; END IF; END;
 BEGIN DELETE FROM public.crm_lead_assignments; RAISE EXCEPTION 'FAILED: history deletion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
\echo Lead rotation PostgreSQL checks passed.
