import {supabase} from "@/lib/supabase";
export type LeadListScope={ownerId?:string;status?:string;query?:string;sort?:string;countryGroup?:string};
export async function fetchLeadNavigation(scope:LeadListScope):Promise<string[]>{
 const ids:string[]=[];
 for(let offset=0;offset<100000;offset+=1000){
  let q=supabase.from("leads").select("id").is("archived_at",null);
  if(scope.ownerId)q=q.eq("owner_id",scope.ownerId);
  if(scope.status==="__RECENT__")q=q.gte("created_at",new Date(Date.now()-7*86400000).toISOString());
  else if(scope.status)q=q.eq("status",scope.status);
  if(scope.countryGroup==="unset")q=q.is("country_group",null);
  else if(scope.countryGroup)q=q.eq("country_group",scope.countryGroup);
  const search=scope.query?.trim().replace(/[%(),]/g,"");
  if(search)q=q.or("shareholder_name.ilike.%"+search+"%,ref_id.ilike.%"+search+"%,company.ilike.%"+search+"%,mobile_number.ilike.%"+search+"%,email.ilike.%"+search+"%");
  if(scope.sort==="updated")q=q.order("updated_at",{ascending:false});
  else if(scope.sort!=="created")q=q.order("followup_priority_date",{ascending:true,nullsFirst:false}).order("followup_time",{ascending:true,nullsFirst:false});
  q=q.order("created_at",{ascending:false}).order("id",{ascending:false});
  const r=await q.range(offset,offset+999);if(r.error)throw new Error(r.error.message);
  const batch=r.data||[];ids.push(...batch.map(row=>row.id));if(batch.length<1000)return ids;
 }
 throw new Error("This list is too large. Narrow its filters before opening leads.");
}
