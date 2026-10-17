-- Uses the disposable database fixture and checks from the rotation test.
\ir lead-rotation.sql
CREATE TABLE public.merge_test_calls(target_id uuid,source_id uuid);
CREATE OR REPLACE FUNCTION public.crm_merge_leads(p_target uuid,p_source uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN INSERT INTO public.merge_test_calls VALUES(p_target,p_source);RETURN p_target;END $$;
GRANT INSERT,SELECT ON public.merge_test_calls TO authenticated;
CREATE OR REPLACE FUNCTION crm_private.audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN INSERT INTO public.crm_audit_events(id) VALUES(gen_random_uuid());IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;END $$;
\ir ../docs/crm_duplicate_review.sql
SELECT set_config('request.test_user','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT public.crm_merge_leads_reviewed('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',
 (SELECT updated_at FROM public.leads WHERE id='10000000-0000-4000-8000-000000000001'),
 (SELECT updated_at FROM public.leads WHERE id='10000000-0000-4000-8000-000000000002'));
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.merge_test_calls),'reviewed merge delegates once after checks');
DO $$ BEGIN
 BEGIN PERFORM public.crm_merge_leads_reviewed('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','2000-01-01','2000-01-01');RAISE EXCEPTION 'FAILED: stale merge allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A record changed%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.crm_merge_leads_reviewed('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',NULL,NULL);RAISE EXCEPTION 'FAILED: versionless merge allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'A record changed%' THEN RAISE;END IF;END;
 BEGIN PERFORM public.crm_merge_leads_reviewed('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',now(),now());RAISE EXCEPTION 'FAILED: archived merge allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Active records required' THEN RAISE;END IF;END;
END $$;
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.merge_test_calls),'stale and archived requests never reach merge');
RESET ROLE;
SELECT set_config('request.test_user','00000000-0000-4000-8000-000000000004',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.crm_merge_leads_reviewed('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',now(),now());RAISE EXCEPTION 'FAILED: member merge allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Admin access required' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
INSERT INTO public.crm_lead_assignments(lead_id,to_owner_id,reason) VALUES('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000004','Transfer');
SELECT pg_temp.check_result((SELECT count(*)=1 FROM public.crm_audit_events),'assignment journal changes retained in report evidence');
\echo Reviewed duplicate merge PostgreSQL checks passed.
