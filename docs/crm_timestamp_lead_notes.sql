CREATE OR REPLACE FUNCTION crm_private.timestamp_lead_notes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $body$
DECLARE
 stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 actor uuid := auth.uid();
 history jsonb := CASE WHEN jsonb_typeof(NEW.activities)='array' THEN NEW.activities ELSE '[]'::jsonb END;
 prior jsonb := '[]'::jsonb;
 prefix jsonb;
 item jsonb;
 pos integer;
 field text;
 old_text text;
 new_text text;
 label text;
BEGIN
 IF actor IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   prior := CASE WHEN jsonb_typeof(OLD.activities)='array' THEN OLD.activities ELSE '[]'::jsonb END;
 END IF;
 -- Stamp newly appended comments using server time; leave historical entries untouched.
 SELECT coalesce(jsonb_agg(e.value ORDER BY e.ordinality),'[]'::jsonb) INTO prefix
 FROM jsonb_array_elements(history) WITH ORDINALITY e WHERE e.ordinality<=jsonb_array_length(prior);
 IF prefix=prior THEN
   FOR pos IN jsonb_array_length(prior)..jsonb_array_length(history)-1 LOOP
     item := history->pos;
     IF jsonb_typeof(item)='object' THEN
       history := jsonb_set(history,ARRAY[pos::text],item||jsonb_build_object('at',stamp,'actor_id',actor));
     END IF;
   END LOOP;
 END IF;
 FOREACH field IN ARRAY ARRAY['input_remarks','sales_remarks'] LOOP
   old_text := CASE WHEN TG_OP='UPDATE' THEN coalesce(to_jsonb(OLD)->>field,'') ELSE '' END;
   new_text := coalesce(to_jsonb(NEW)->>field,'');
   IF old_text IS DISTINCT FROM new_text THEN
     label := CASE WHEN field='input_remarks' THEN 'Mining Remark' ELSE 'Sales remarks' END;
     history := history || jsonb_build_array(jsonb_build_object(
       'at',stamp,'actor_id',actor,'kind','remark_change','field',field,
       'note',label||CASE WHEN old_text='' THEN ' added' WHEN new_text='' THEN ' cleared' ELSE ' updated' END,
       'before',old_text,'after',new_text));
   END IF;
 END LOOP;
 NEW.activities := history;
 RETURN NEW;
END $body$;
DROP TRIGGER IF EXISTS crm_timestamp_lead_notes ON public.leads;
CREATE TRIGGER crm_timestamp_lead_notes BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION crm_private.timestamp_lead_notes();