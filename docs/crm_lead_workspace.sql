ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS country_group text GENERATED ALWAYS AS (
 CASE WHEN nullif(btrim(country),'') IS NULL THEN NULL
 WHEN lower(btrim(country)) IN ('india','in','ind') THEN 'India' ELSE 'Other Countries' END
) STORED;
CREATE OR REPLACE FUNCTION public.crm_add_lead_comment(p_lead_id uuid,p_comment text)
RETURNS SETOF public.leads LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
BEGIN
 IF auth.uid() IS NULL OR NOT public.crm_is_member() THEN RAISE EXCEPTION 'CRM membership required'; END IF;
 IF p_comment IS NULL OR length(btrim(p_comment))=0 THEN RAISE EXCEPTION 'Enter a comment before saving'; END IF;
 IF length(p_comment)>10000 THEN RAISE EXCEPTION 'Comments must be 10,000 characters or fewer'; END IF;
 RETURN QUERY UPDATE public.leads l SET activities=coalesce(l.activities,'[]'::jsonb)||
 jsonb_build_array(jsonb_build_object('at',clock_timestamp(),'actor_id',auth.uid(),'kind','comment','note',btrim(p_comment)))
 WHERE l.id=p_lead_id AND l.archived_at IS NULL RETURNING l.*;
 IF NOT FOUND THEN RAISE EXCEPTION 'This lead is unavailable or your access changed'; END IF;
END $body$;
REVOKE ALL ON FUNCTION public.crm_add_lead_comment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_add_lead_comment(uuid,text) TO authenticated;