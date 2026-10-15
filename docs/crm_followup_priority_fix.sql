CREATE OR REPLACE FUNCTION public.crm_followup_schedule_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
 if new.followup_date is not null and btrim(new.followup_date) <> '' then
   if tg_op='INSERT' or new.followup_date is distinct from old.followup_date or new.followup_time is distinct from old.followup_time then
     new.followup_completed_at:=null;
     if new.status<>'VISIT' then new.status:='FOLLOW UP'; end if;
   end if;
 end if;
 new.followup_priority_date:=case when new.followup_completed_at is null and new.followup_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then new.followup_date else null end;
 return new;
end $function$
