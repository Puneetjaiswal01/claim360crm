
CREATE SCHEMA IF NOT EXISTS crm_private;
REVOKE ALL ON SCHEMA crm_private FROM PUBLIC,anon,authenticated;
ALTER TABLE public.leads ADD COLUMN archived_at timestamptz, ADD COLUMN archived_reason text;
CREATE INDEX leads_active_owner_idx ON public.leads(owner_id) WHERE archived_at IS NULL;

CREATE TABLE public.crm_visits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
 assigned_to uuid NOT NULL REFERENCES public.crm_team_members(user_id),
 contact_name text NOT NULL DEFAULT '', company text NOT NULL DEFAULT '', location text NOT NULL CHECK(char_length(btrim(location)) BETWEEN 1 AND 1000),
 scheduled_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','COMPLETED','CANCELLED')),
 outcome text NOT NULL DEFAULT '' CHECK(char_length(outcome)<=4000), next_action text NOT NULL DEFAULT '' CHECK(char_length(next_action)<=4000),
 notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=8000), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK(status<>'COMPLETED' OR char_length(btrim(outcome))>0)
);
CREATE INDEX crm_visits_assigned_date_idx ON public.crm_visits(assigned_to,scheduled_at);
ALTER TABLE public.crm_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_visits FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.crm_visits TO authenticated;
GRANT ALL ON public.crm_visits TO service_role;
CREATE POLICY visits_read ON public.crm_visits FOR SELECT TO authenticated USING((SELECT public.crm_is_admin()) OR assigned_to=(SELECT auth.uid()));
CREATE POLICY visits_insert ON public.crm_visits FOR INSERT TO authenticated WITH CHECK(
 (SELECT public.crm_is_member()) AND created_by=(SELECT auth.uid()) AND ((SELECT public.crm_is_admin()) OR assigned_to=(SELECT auth.uid()))
 AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.archived_at IS NULL AND (l.owner_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()))));
CREATE POLICY visits_update ON public.crm_visits FOR UPDATE TO authenticated USING((SELECT public.crm_is_member()) AND ((SELECT public.crm_is_admin()) OR assigned_to=(SELECT auth.uid())))
 WITH CHECK((SELECT public.crm_is_member()) AND ((SELECT public.crm_is_admin()) OR assigned_to=(SELECT auth.uid())));
CREATE FUNCTION crm_private.visit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.leads%rowtype;
BEGIN
 IF (SELECT auth.uid()) IS NULL OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'CRM membership required'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NOT public.crm_is_admin() AND (NEW.assigned_to<>OLD.assigned_to OR NEW.lead_id<>OLD.lead_id) THEN RAISE EXCEPTION 'Only administrators can reassign visits'; END IF;
  NEW.created_by=OLD.created_by; NEW.created_at=OLD.created_at;
 ELSE NEW.created_by=auth.uid(); NEW.created_at=now(); END IF;
 SELECT * INTO l FROM public.leads WHERE id=NEW.lead_id AND archived_at IS NULL;
 IF l.id IS NULL THEN
  IF TG_OP='INSERT' OR NEW.lead_id<>OLD.lead_id THEN RAISE EXCEPTION 'Active lead access required'; END IF;
  NEW.contact_name=OLD.contact_name; NEW.company=OLD.company;
 ELSE NEW.contact_name=l.shareholder_name; NEW.company=COALESCE(l.company,''); END IF;
 NEW.updated_at=now();
 IF NEW.status='COMPLETED' THEN
  IF TG_OP='UPDATE' AND OLD.status='COMPLETED' THEN NEW.completed_at=OLD.completed_at; ELSE NEW.completed_at=now(); END IF;
 ELSE NEW.completed_at=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER visits_guard BEFORE INSERT OR UPDATE ON public.crm_visits FOR EACH ROW EXECUTE FUNCTION crm_private.visit_guard();

CREATE TABLE public.crm_lead_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
 actor_id uuid NOT NULL DEFAULT auth.uid(),kind text NOT NULL CHECK(kind IN ('CALL','EMAIL','NOTE')),
 outcome text NOT NULL CHECK(char_length(btrim(outcome)) BETWEEN 1 AND 200),
 notes text NOT NULL DEFAULT '' CHECK(char_length(notes)<=8000),occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(occurred_at<=created_at+interval '5 minutes')
);
CREATE INDEX crm_activity_actor_date_idx ON public.crm_lead_activity(actor_id,occurred_at);
CREATE INDEX crm_activity_lead_idx ON public.crm_lead_activity(lead_id);
ALTER TABLE public.crm_lead_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lead_activity FROM anon,authenticated;
GRANT SELECT,INSERT ON public.crm_lead_activity TO authenticated;
GRANT ALL ON public.crm_lead_activity TO service_role;
CREATE POLICY activity_read ON public.crm_lead_activity FOR SELECT TO authenticated USING((SELECT public.crm_is_admin()) OR actor_id=(SELECT auth.uid()));
CREATE POLICY activity_insert ON public.crm_lead_activity FOR INSERT TO authenticated WITH CHECK(
 actor_id=(SELECT auth.uid()) AND (SELECT public.crm_is_member()) AND EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id AND l.archived_at IS NULL AND (l.owner_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()))));

CREATE TABLE public.crm_audit_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,at timestamptz NOT NULL DEFAULT now(),
 actor_id uuid,entity text NOT NULL,record_id text NOT NULL,action text NOT NULL,before_data jsonb,after_data jsonb
);
ALTER TABLE public.crm_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_audit_events FROM anon,authenticated;
GRANT SELECT ON public.crm_audit_events TO authenticated;
GRANT ALL ON public.crm_audit_events TO service_role;
CREATE POLICY audit_admin_read ON public.crm_audit_events FOR SELECT TO authenticated USING((SELECT public.crm_is_admin()));
CREATE INDEX audit_at_idx ON public.crm_audit_events(at DESC);
CREATE INDEX audit_record_idx ON public.crm_audit_events(entity,record_id);
-- Runs only as a trigger in a non-exposed schema; API users cannot insert/alter audit events.
CREATE FUNCTION crm_private.audit_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_data jsonb;new_data jsonb;
BEGIN
 IF TG_OP<>'INSERT' THEN old_data=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_data=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND (old_data-'updated_at')=(new_data-'updated_at') THEN RETURN NEW; END IF;
 INSERT INTO public.crm_audit_events(actor_id,entity,record_id,action,before_data,after_data)
 VALUES(auth.uid(),TG_TABLE_NAME,COALESCE(new_data->>'id',new_data->>'user_id',old_data->>'id',old_data->>'user_id'),TG_OP,old_data,new_data);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION crm_private.audit_row() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();
CREATE TRIGGER audit_profiles AFTER INSERT OR UPDATE OR DELETE ON public.crm_member_profiles FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();
CREATE TRIGGER audit_members AFTER INSERT OR UPDATE OR DELETE ON public.crm_team_members FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();
CREATE TRIGGER audit_visits AFTER INSERT OR UPDATE OR DELETE ON public.crm_visits FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();
CREATE TRIGGER audit_activity AFTER INSERT OR UPDATE OR DELETE ON public.crm_lead_activity FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();

CREATE TABLE public.crm_active_days (
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL,
 active_seconds bigint NOT NULL DEFAULT 0 CHECK(active_seconds BETWEEN 0 AND 86400),
 last_tick_at timestamptz NOT NULL DEFAULT now(),tick boolean NOT NULL DEFAULT true,PRIMARY KEY(user_id,day)
);
ALTER TABLE public.crm_active_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_active_days FROM anon,authenticated;
GRANT SELECT ON public.crm_active_days TO authenticated;
GRANT INSERT(user_id,day,tick),UPDATE(tick) ON public.crm_active_days TO authenticated;
GRANT ALL ON public.crm_active_days TO service_role;
CREATE POLICY active_read ON public.crm_active_days FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()));
CREATE POLICY active_insert ON public.crm_active_days FOR INSERT TO authenticated WITH CHECK(user_id=(SELECT auth.uid()) AND (SELECT public.crm_is_member()));
CREATE POLICY active_update ON public.crm_active_days FOR UPDATE TO authenticated USING(user_id=(SELECT auth.uid()) AND (SELECT public.crm_is_member())) WITH CHECK(user_id=(SELECT auth.uid()) AND (SELECT public.crm_is_member()));
CREATE FUNCTION crm_private.active_tick_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE elapsed bigint;
BEGIN
 IF NEW.user_id IS DISTINCT FROM auth.uid() OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'Own active usage only'; END IF;
 IF NEW.day<>(now() AT TIME ZONE 'Asia/Kolkata')::date THEN RAISE EXCEPTION 'Current day only'; END IF;
 IF TG_OP='INSERT' THEN NEW.active_seconds=0;
 ELSE
  elapsed=GREATEST(0,FLOOR(EXTRACT(EPOCH FROM now()-OLD.last_tick_at)))::bigint;
  NEW.active_seconds=LEAST(86400,OLD.active_seconds+CASE WHEN elapsed<=45 THEN LEAST(30,elapsed) ELSE 0 END);
 END IF;
 NEW.last_tick_at=now();RETURN NEW;
END $$;
CREATE TRIGGER active_tick_guard BEFORE INSERT OR UPDATE ON public.crm_active_days FOR EACH ROW EXECUTE FUNCTION crm_private.active_tick_guard();
CREATE FUNCTION public.crm_active_tick(p_active boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE u uuid=auth.uid();d date=(now() AT TIME ZONE 'Asia/Kolkata')::date;v bigint;
BEGIN
 IF u IS NULL OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'CRM membership required'; END IF;
 IF p_active THEN INSERT INTO public.crm_active_days(user_id,day,tick) VALUES(u,d,true) ON CONFLICT(user_id,day) DO UPDATE SET tick=true; END IF;
 SELECT active_seconds INTO v FROM public.crm_active_days WHERE user_id=u AND day=d;
 RETURN jsonb_build_object('active_today_seconds',COALESCE(v,0),'server_time',now());
END $$;
REVOKE ALL ON FUNCTION public.crm_active_tick(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_active_tick(boolean) TO authenticated;
DROP POLICY usage_read_own ON public.crm_usage_sessions;
CREATE POLICY usage_read_own_or_admin ON public.crm_usage_sessions FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()) OR (SELECT public.crm_is_admin()));

CREATE TABLE public.crm_merge_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),target_id uuid NOT NULL,source_id uuid NOT NULL,
 target_before jsonb NOT NULL,source_before jsonb NOT NULL,target_after_updated_at timestamptz NOT NULL,visit_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
 merged_at timestamptz NOT NULL DEFAULT now(),merged_by uuid NOT NULL DEFAULT auth.uid(),restored_at timestamptz
);
ALTER TABLE public.crm_merge_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_merge_events FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.crm_merge_events TO authenticated;
GRANT ALL ON public.crm_merge_events TO service_role;
CREATE POLICY merge_admin ON public.crm_merge_events FOR ALL TO authenticated USING((SELECT public.crm_is_admin())) WITH CHECK((SELECT public.crm_is_admin()));
CREATE FUNCTION crm_private.archive_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.archived_at IS NOT NULL AND NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin archive access required'; END IF;
 ELSIF NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.archived_reason IS DISTINCT FROM OLD.archived_reason THEN
  IF NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin archive access required'; END IF;
 END IF;NEW.updated_at=now();RETURN NEW;
END $$;
CREATE TRIGGER archive_guard BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION crm_private.archive_guard();
CREATE FUNCTION public.crm_merge_leads(p_target uuid,p_source uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.leads%rowtype;s public.leads%rowtype;event_id uuid;original_target jsonb;linked_visits uuid[];
BEGIN
 IF NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF p_target=p_source THEN RAISE EXCEPTION 'Select two different records'; END IF;
 PERFORM id FROM public.leads WHERE id IN(p_target,p_source) ORDER BY id FOR UPDATE;
 SELECT * INTO t FROM public.leads WHERE id=p_target AND archived_at IS NULL;
 SELECT * INTO s FROM public.leads WHERE id=p_source AND archived_at IS NULL;
 IF t.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'Active records required'; END IF;
 original_target=to_jsonb(t); SELECT COALESCE(array_agg(id),ARRAY[]::uuid[]) INTO linked_visits FROM public.crm_visits WHERE lead_id=s.id;
 IF lower(regexp_replace(t.shareholder_name,'\s+','','g'))<>lower(regexp_replace(s.shareholder_name,'\s+','','g'))
 OR lower(regexp_replace(COALESCE(t.company,''),'\s+','','g'))<>lower(regexp_replace(COALESCE(s.company,''),'\s+','','g')) THEN
 RAISE EXCEPTION 'Confirm and correct shareholder/company names before merging; shared contacts alone are not enough'; END IF;
 UPDATE public.leads SET
 registered_address=COALESCE(NULLIF(t.registered_address,''),s.registered_address),
 mobile_number=COALESCE(NULLIF(t.mobile_number,''),s.mobile_number),
 email=COALESCE(NULLIF(t.email,''),s.email),
 input_remarks=concat_ws(E'\n\n',NULLIF(t.input_remarks,''),'Merged source ['||COALESCE(s.ref_id,s.id::text)||']: '||COALESCE(s.input_remarks,'')),
 sales_remarks=concat_ws(E'\n\n',NULLIF(t.sales_remarks,''),NULLIF(s.sales_remarks,'')),
 activities=COALESCE(t.activities,'[]'::jsonb)||COALESCE(s.activities,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'note','Source record merged; original preserved in merge history')),
 updated_at=now() WHERE id=t.id RETURNING updated_at INTO t.updated_at;
 UPDATE public.crm_visits SET lead_id=t.id WHERE lead_id=s.id;
 INSERT INTO public.crm_merge_events(target_id,source_id,target_before,source_before,target_after_updated_at,visit_ids)
 VALUES(t.id,s.id,original_target,to_jsonb(s),t.updated_at,linked_visits) RETURNING id INTO event_id;
 UPDATE public.leads SET archived_at=now(),archived_reason='Merged into '||t.id::text,updated_at=now() WHERE id=s.id;
 RETURN event_id;
END $$;
REVOKE ALL ON FUNCTION public.crm_merge_leads(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_merge_leads(uuid,uuid) TO authenticated;
CREATE TRIGGER audit_merges AFTER INSERT OR UPDATE OR DELETE ON public.crm_merge_events FOR EACH ROW EXECUTE FUNCTION crm_private.audit_row();


CREATE FUNCTION public.crm_undo_merge(p_event uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e public.crm_merge_events%rowtype;t public.leads%rowtype;s public.leads%rowtype;
BEGIN
 IF NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 SELECT * INTO e FROM public.crm_merge_events WHERE id=p_event AND restored_at IS NULL FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Merge is already restored or missing'; END IF;
 PERFORM id FROM public.leads WHERE id IN(e.target_id,e.source_id) ORDER BY id FOR UPDATE;
 SELECT * INTO t FROM public.leads WHERE id=e.target_id; SELECT * INTO s FROM public.leads WHERE id=e.source_id;
 IF t.id IS NULL OR s.id IS NULL OR t.archived_at IS NOT NULL OR t.updated_at<>e.target_after_updated_at OR s.updated_at<>e.merged_at
 OR s.archived_reason IS DISTINCT FROM 'Merged into '||e.target_id::text THEN RAISE EXCEPTION 'Records changed after merging; an administrator must review before restoring'; END IF;
 SELECT * INTO t FROM jsonb_populate_record(NULL::public.leads,e.target_before);
 UPDATE public.leads SET owner_id=t.owner_id,ref_id=t.ref_id,shareholder_name=t.shareholder_name,registered_address=t.registered_address,
 company=t.company,holding_value=t.holding_value,mobile_number=t.mobile_number,mobile_number_type=t.mobile_number_type,email=t.email,
 input_remarks=t.input_remarks,sales_remarks=t.sales_remarks,status=t.status,lead_date=t.lead_date,followup_date=t.followup_date,
 followup_time=t.followup_time,followup_completed_at=t.followup_completed_at,fee_percent=t.fee_percent,activities=t.activities,updated_at=now()
 WHERE id=e.target_id;
 UPDATE public.leads SET archived_at=NULL,archived_reason=NULL,updated_at=now() WHERE id=e.source_id;
 UPDATE public.crm_visits SET lead_id=e.source_id WHERE id=ANY(e.visit_ids);
 UPDATE public.crm_merge_events SET restored_at=now() WHERE id=e.id;
END $$;
REVOKE ALL ON FUNCTION public.crm_undo_merge(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_undo_merge(uuid) TO authenticated;

CREATE FUNCTION public.crm_export_backup() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT public.crm_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 RETURN jsonb_build_object('version',1,'project','Claim360 CRM','exported_at',now(),
 'tables',jsonb_build_object(
 'leads',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.leads t),
 'crm_team_members',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_team_members t),
 'crm_member_profiles',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_member_profiles t),
 'crm_visits',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_visits t),
 'crm_lead_activity',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_lead_activity t),
 'crm_audit_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_audit_events t),
 'crm_active_days',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_active_days t),
 'crm_usage_sessions',(SELECT COALESCE(jsonb_agg(to_jsonb(t)-'auth_session_id'),'[]'::jsonb) FROM public.crm_usage_sessions t),
 'crm_merge_events',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_merge_events t)
 ),'directory',(SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM public.crm_team_profiles() t));
END $$;
REVOKE ALL ON FUNCTION public.crm_export_backup() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_export_backup() TO authenticated;

CREATE FUNCTION crm_private.activity_timestamp() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN NEW.created_at=now();RETURN NEW; END $$;
CREATE TRIGGER activity_timestamp BEFORE INSERT ON public.crm_lead_activity FOR EACH ROW EXECUTE FUNCTION crm_private.activity_timestamp();

CREATE INDEX crm_visits_lead_idx ON public.crm_visits(lead_id);
REVOKE ALL ON FUNCTION crm_private.visit_guard(),crm_private.active_tick_guard(),crm_private.archive_guard(),crm_private.activity_timestamp() FROM PUBLIC,anon,authenticated;