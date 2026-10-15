CREATE OR REPLACE FUNCTION public.crm_merge_leads(p_target uuid, p_source uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 OR regexp_replace(lower(regexp_replace(COALESCE(t.company,''),'[^a-zA-Z0-9]','','g')),'(limited|ltd)$','')<>regexp_replace(lower(regexp_replace(COALESCE(s.company,''),'[^a-zA-Z0-9]','','g')),'(limited|ltd)$','') THEN
 RAISE EXCEPTION 'Confirm and correct shareholder/company names before merging; shared contacts alone are not enough'; END IF;
 UPDATE public.leads SET
 registered_address=COALESCE(NULLIF(t.registered_address,''),s.registered_address),
 mobile_number=CASE WHEN COALESCE(t.mobile_number,'') ~* '(^$|n/?a|e[+][0-9])' AND COALESCE(s.mobile_number,'') !~* '(^$|n/?a|e[+][0-9])' THEN s.mobile_number ELSE COALESCE(NULLIF(t.mobile_number,''),s.mobile_number) END,
 email=CASE WHEN COALESCE(t.email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' AND COALESCE(s.email,'') ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN s.email ELSE COALESCE(NULLIF(t.email,''),s.email) END,
 input_remarks=concat_ws(E'\n\n',NULLIF(t.input_remarks,''),'Merged source ['||COALESCE(s.ref_id,s.id::text)||']: '||COALESCE(s.input_remarks,'')),
 sales_remarks=concat_ws(E'\n\n',NULLIF(t.sales_remarks,''),NULLIF(s.sales_remarks,''),
 CASE WHEN COALESCE(t.ref_id,'')<>COALESCE(s.ref_id,'') THEN 'Additional source reference: '||COALESCE(s.ref_id,'Not recorded') END,
 CASE WHEN COALESCE(t.mobile_number,'')<>COALESCE(s.mobile_number,'') AND COALESCE(s.mobile_number,'') NOT IN ('','N/A','NA') THEN 'Additional source phone: '||s.mobile_number END,
 CASE WHEN COALESCE(t.email,'')<>COALESCE(s.email,'') AND COALESCE(s.email,'') NOT IN ('','N/A','NA') THEN 'Additional source email: '||s.email END,
 CASE WHEN regexp_replace(COALESCE(t.holding_value,''),'[[:space:]]','','g')<>regexp_replace(COALESCE(s.holding_value,''),'[[:space:]]','','g') THEN 'Source recorded holding value: '||COALESCE(s.holding_value,'Not recorded')||'. Retained primary value: '||COALESCE(t.holding_value,'Not recorded')||'. Verify against source documents.' END,
 CASE WHEN lower(regexp_replace(COALESCE(t.registered_address,''),'[[:space:]]','','g'))<>lower(regexp_replace(COALESCE(s.registered_address,''),'[[:space:]]','','g')) AND COALESCE(s.registered_address,'')<>'' THEN 'Additional source address: '||s.registered_address END),
 activities=COALESCE(t.activities,'[]'::jsonb)||COALESCE(s.activities,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('at',now(),'note','Source record merged; original preserved in merge history')),
 updated_at=now() WHERE id=t.id RETURNING updated_at INTO t.updated_at;
 UPDATE public.crm_visits SET lead_id=t.id WHERE lead_id=s.id;
 INSERT INTO public.crm_merge_events(target_id,source_id,target_before,source_before,target_after_updated_at,visit_ids)
 VALUES(t.id,s.id,original_target,to_jsonb(s),t.updated_at,linked_visits) RETURNING id INTO event_id;
 UPDATE public.leads SET archived_at=now(),archived_reason='Merged into '||t.id::text,updated_at=now() WHERE id=s.id;
 RETURN event_id;
END $function$
