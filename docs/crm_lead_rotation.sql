-- Apply after crm_operations.sql, crm_member_profiles.sql, crm_realtime_status.sql,
-- crm_lead_workspace.sql and crm_admin_only_transfer.sql. Safe to reapply.
BEGIN;
CREATE TABLE IF NOT EXISTS public.crm_lead_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 from_owner_id uuid, to_owner_id uuid, actor_id uuid,
 from_owner_name text, to_owner_name text, actor_name text,
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text, reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_assignment_lead_date_idx ON public.crm_lead_assignments(lead_id,assigned_at DESC);
-- Unassigned leads belong to the admin pool and legitimately have no owner.
ALTER TABLE public.crm_lead_assignments ALTER COLUMN to_owner_id DROP NOT NULL;
ALTER TABLE public.crm_lead_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.crm_lead_assignments TO authenticated;
GRANT ALL ON public.crm_lead_assignments TO service_role;
DROP POLICY IF EXISTS assignment_admin_read ON public.crm_lead_assignments;
CREATE POLICY assignment_admin_read ON public.crm_lead_assignments FOR SELECT TO authenticated USING((SELECT public.crm_is_admin()));

CREATE OR REPLACE FUNCTION crm_private.rotation_member_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(nullif(p.display_name,''),u.email::text,p_user::text)
 FROM auth.users u LEFT JOIN public.crm_member_profiles p ON p.user_id=u.id WHERE u.id=p_user;
$$;
REVOKE ALL ON FUNCTION crm_private.rotation_member_name(uuid) FROM PUBLIC,anon,authenticated;

-- Capture transfers from every path, including direct admin edits. Members cannot
-- change ownership by bypassing the admin RPCs.
CREATE OR REPLACE FUNCTION crm_private.lead_assignment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.owner_id IS DISTINCT FROM OLD.owner_id AND auth.uid() IS NOT NULL AND NOT public.crm_is_admin() THEN
  RAISE EXCEPTION 'Only administrators can reassign leads';
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION crm_private.record_lead_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_owner uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  previous_owner:=OLD.owner_id;
 END IF;
 INSERT INTO public.crm_lead_assignments(lead_id,from_owner_id,to_owner_id,actor_id,from_owner_name,to_owner_name,actor_name,status,reason)
 VALUES(NEW.id,previous_owner,NEW.owner_id,auth.uid(),crm_private.rotation_member_name(previous_owner),crm_private.rotation_member_name(NEW.owner_id),crm_private.rotation_member_name(auth.uid()),NEW.status,
  CASE WHEN TG_OP='INSERT' THEN 'Created' WHEN current_setting('crm.rotation',true)='on' THEN 'Rotation' ELSE 'Transfer' END);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION crm_private.lead_assignment_guard(),crm_private.record_lead_assignment() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS crm_lead_assignment_guard ON public.leads;
CREATE TRIGGER crm_lead_assignment_guard BEFORE UPDATE OF owner_id ON public.leads FOR EACH ROW EXECUTE FUNCTION crm_private.lead_assignment_guard();
DROP TRIGGER IF EXISTS crm_record_lead_assignment ON public.leads;
CREATE TRIGGER crm_record_lead_assignment AFTER INSERT OR UPDATE OF owner_id ON public.leads FOR EACH ROW EXECUTE FUNCTION crm_private.record_lead_assignment();
INSERT INTO public.crm_lead_assignments(lead_id,to_owner_id,to_owner_name,status,reason)
 SELECT l.id,l.owner_id,crm_private.rotation_member_name(l.owner_id),l.status,'Tracking started'
 FROM public.leads l WHERE NOT EXISTS(SELECT 1 FROM public.crm_lead_assignments a WHERE a.lead_id=l.id);

CREATE OR REPLACE FUNCTION public.crm_rotate_leads(p_lead_ids uuid[],p_expected_versions jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(lead_id uuid,previous_owner uuid,new_owner uuid,rotated boolean,message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lead public.leads%rowtype; requested uuid; recipient uuid; previous_setting text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF coalesce(cardinality(p_lead_ids),0)=0 OR cardinality(p_lead_ids)>500 THEN RAISE EXCEPTION 'Select between 1 and 500 leads'; END IF;
 IF p_expected_versions IS NULL OR jsonb_typeof(p_expected_versions)<>'object' THEN RAISE EXCEPTION 'Lead versions are required'; END IF;
 -- Serialize rotation batches to keep recipient counts balanced and lock each
 -- lead before checking its current status, owner and version.
 PERFORM pg_advisory_xact_lock(360,20261017);
 previous_setting:=coalesce(current_setting('crm.rotation',true),'');
 PERFORM set_config('crm.rotation','on',true);
 FOR requested IN SELECT DISTINCT unnest(p_lead_ids) ORDER BY 1 LOOP
  lead_id:=requested; previous_owner:=NULL; new_owner:=NULL; rotated:=false;
  SELECT * INTO lead FROM public.leads l WHERE l.id=requested FOR UPDATE;
  IF NOT FOUND OR lead.archived_at IS NOT NULL THEN message:='Lead unavailable or archived'; RETURN NEXT; CONTINUE; END IF;
  previous_owner:=lead.owner_id;
  IF NOT (p_expected_versions ? requested::text) OR (p_expected_versions->>requested::text)::timestamptz IS DISTINCT FROM lead.updated_at THEN
   message:='Lead changed; refresh before rotating'; RETURN NEXT; CONTINUE;
  END IF;
  IF lead.status NOT IN ('RINGING NOT RESPONDING','COLD') THEN message:='Only RNR and Cold leads are eligible'; RETURN NEXT; CONTINUE; END IF;
  recipient:=NULL;
  -- Choose the agent with the fewest assignments in this batch, then the
  -- lightest active portfolio. The current owner is always excluded.
  SELECT m.user_id INTO recipient FROM public.crm_team_members m
  WHERE m.role='agent' AND m.user_id IS DISTINCT FROM lead.owner_id
  ORDER BY (SELECT count(*) FROM public.crm_lead_assignments a WHERE a.to_owner_id=m.user_id AND a.reason='Rotation' AND a.assigned_at>=transaction_timestamp()),
   (SELECT count(*) FROM public.leads l WHERE l.owner_id=m.user_id AND l.archived_at IS NULL),m.user_id LIMIT 1;
  IF recipient IS NULL THEN message:='No other employee is available'; RETURN NEXT; CONTINUE; END IF;
  UPDATE public.leads l SET owner_id=recipient,updated_at=clock_timestamp() WHERE l.id=requested;
  new_owner:=recipient; rotated:=true; message:='Rotated'; RETURN NEXT;
 END LOOP;
 PERFORM set_config('crm.rotation',previous_setting,true);
END $$;
REVOKE ALL ON FUNCTION public.crm_rotate_leads(uuid[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_rotate_leads(uuid[],jsonb) TO authenticated;

-- Include Cold in the server-side status validation as well as the UI.
CREATE OR REPLACE FUNCTION public.crm_set_lead_status(p_lead_id uuid,p_status text,p_expected_updated_at timestamptz)
RETURNS SETOF public.leads LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'CRM membership required'; END IF;
 IF p_status IS NULL OR NOT(p_status=ANY(ARRAY['NEW','UNTOUCHED','RINGING NOT RESPONDING','COLD','NOT REACHABLE','FOLLOW UP','VISIT','POTENTIAL','CLOSED','CONVERTED','INTERNATIONAL','LOSS','REMINING'])) THEN RAISE EXCEPTION 'Invalid lead status'; END IF;
 RETURN QUERY UPDATE public.leads l SET status=p_status,
 activities=coalesce(l.activities,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor_id',auth.uid(),'note','Status changed: '||coalesce(l.status,'')||' → '||p_status))
 WHERE l.id=p_lead_id AND l.archived_at IS NULL AND l.updated_at=p_expected_updated_at RETURNING l.*;
 IF NOT FOUND THEN RAISE EXCEPTION 'This lead changed or your access changed. Reopen it before trying again.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.crm_set_lead_status(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_set_lead_status(uuid,text,timestamptz) TO authenticated;

-- Preserve assignment history in encrypted exports as well.
CREATE OR REPLACE FUNCTION public.crm_export_backup() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 RETURN jsonb_build_object('version',1,'project','Claim360 CRM','exported_at',now(),
 'tables',jsonb_build_object(
 'leads',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.leads t),
 'crm_team_members',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_team_members t),
 'crm_member_profiles',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_member_profiles t),
 'crm_visits',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_visits t),
 'crm_lead_assignments',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_lead_assignments t),
 'crm_lead_activity',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_lead_activity t),
 'crm_audit_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_audit_events t),
 'crm_active_days',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_active_days t),
 'crm_usage_sessions',(SELECT COALESCE(jsonb_agg(to_jsonb(t)-'auth_session_id'),'[]'::jsonb) FROM public.crm_usage_sessions t),
 'crm_merge_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_merge_events t)
 ),'directory',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_team_profiles() t));
END $$;
REVOKE ALL ON FUNCTION public.crm_export_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_export_backup() TO authenticated;

COMMIT;
