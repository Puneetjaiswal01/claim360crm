CREATE OR REPLACE FUNCTION public.crm_followup_schedule_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 IF NEW.followup_date IS NOT NULL AND btrim(NEW.followup_date)<>'' THEN
  IF TG_OP='INSERT' THEN
   NEW.followup_completed_at:=null;
  ELSIF NEW.followup_date IS DISTINCT FROM OLD.followup_date OR NEW.followup_time IS DISTINCT FROM OLD.followup_time THEN
   NEW.followup_completed_at:=null;
  END IF;
 END IF;
 NEW.followup_priority_date:=CASE WHEN NEW.followup_completed_at IS NULL AND NEW.followup_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN NEW.followup_date ELSE NULL END;
 RETURN NEW;
END $body$;
CREATE OR REPLACE FUNCTION public.crm_set_lead_status(p_lead_id uuid,p_status text,p_expected_updated_at timestamptz)
RETURNS SETOF public.leads LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
BEGIN
 IF auth.uid() IS NULL OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'CRM membership required'; END IF;
 IF p_status IS NULL OR NOT(p_status=ANY(ARRAY['NEW','UNTOUCHED','RINGING NOT RESPONDING','NOT REACHABLE','FOLLOW UP','VISIT','POTENTIAL','CLOSED','CONVERTED','INTERNATIONAL','LOSS','REMINING'])) THEN RAISE EXCEPTION 'Invalid lead status'; END IF;
 RETURN QUERY UPDATE public.leads l SET status=p_status,
 activities=coalesce(l.activities,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor_id',auth.uid(),'note','Status changed: '||coalesce(l.status,'')||' → '||p_status))
 WHERE l.id=p_lead_id AND l.archived_at IS NULL AND l.updated_at=p_expected_updated_at RETURNING l.*;
 IF NOT FOUND THEN RAISE EXCEPTION 'This lead changed or your access changed. Reopen it before trying again.'; END IF;
END $body$;
REVOKE ALL ON FUNCTION public.crm_set_lead_status(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_set_lead_status(uuid,text,timestamptz) TO authenticated;
DO $body$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='leads') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.leads; END IF;
END $body$;