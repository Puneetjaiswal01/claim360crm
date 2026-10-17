"use client";
import {useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";

type Row=Record<string,any>;
type Member={user_id:string;display_name?:string;email:string};
const date=(value:string)=>new Date(value).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"});
async function history(table:string,field:string,id:string,order:string){
 const result:Row[]=[];
 for(let offset=0;;offset+=500){
  let query=supabase.from(table).select("*").eq(field,id).order(order,{ascending:false}).order("id").range(offset,offset+499);
  if(table==="crm_audit_events")query=query.eq("entity","leads");
  const {data,error}=await query;if(error)throw new Error(error.message);
  result.push(...(data||[]));if(!data||data.length<500)return result;
 }
}
export default function LeadHistory({leadId,members,refreshKey}:{leadId:string;members:Member[];refreshKey:string}){
 const [data,setData]=useState<{assignments:Row[];work:Row[]}|null>(null),[error,setError]=useState("");
 const [retry,setRetry]=useState(0);
 const name=(id:string)=>members.find(m=>m.user_id===id)?.display_name||members.find(m=>m.user_id===id)?.email||(id?"Former member ("+id.slice(0,8)+")":"System");
 useEffect(()=>{let cancelled=false;setData(null);setError("");
  Promise.all([history("crm_lead_assignments","lead_id",leadId,"assigned_at"),history("crm_lead_activity","lead_id",leadId,"occurred_at"),history("crm_visits","lead_id",leadId,"scheduled_at"),history("crm_audit_events","record_id",leadId,"at")]).then(([assignments,activity,visits,edits])=>{
   if(cancelled)return;
   const work=[...activity.map(a=>({id:"activity-"+a.id,actor:a.actor_id,at:a.occurred_at,kind:a.kind,description:[a.outcome,a.notes].filter(Boolean).join(" · ")})),...visits.filter(v=>v.status==="COMPLETED").map(v=>({id:"visit-"+v.id,actor:v.assigned_to,at:v.completed_at||v.scheduled_at,kind:"Visit completed",description:[v.outcome,v.notes].filter(Boolean).join(" · ")})),...edits.filter(e=>e.action==="UPDATE").map(e=>{
    const before=e.before_data||{},after=e.after_data||{};
    const fields=Object.keys(after).filter(k=>!["updated_at","owner_id","activities","followup_priority_date","country_group"].includes(k)&&JSON.stringify(before[k])!==JSON.stringify(after[k]));
    const added=(after.activities||[]).slice((before.activities||[]).length);
    return {id:"edit-"+e.id,actor:e.actor_id,at:e.at,kind:fields.length?"Record updated":"Comment / activity",description:[fields.map(k=>k.replace(/_/g," ")).join(", "),...added.map((a:Row)=>a.note)].filter(Boolean).join(" · ")};
   }).filter(e=>e.description)].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
   setData({assignments,work});
  }).catch(e=>{if(!cancelled)setError("Could not load lead history: "+e.message)});
  return()=>{cancelled=true};
 },[leadId,refreshKey,retry]);
 return <section className="leadSection leadHistory"><div className="eyebrow">ADMINISTRATOR VIEW</div><h2>Ownership & work history</h2>
  <p className="workspaceHelp">See previous owners separately from recorded calls, emails, comments, edits and completed visits. Earlier work appears where activity or audit records exist.</p>
  {error&&<div className="alert" role="alert">{error}<button type="button" className="secondary" onClick={()=>setRetry(r=>r+1)}>Retry</button></div>}
  {!data&&!error&&<p role="status">Loading lead history…</p>}
  {data&&<><h3>Who worked on this lead</h3>{data.work.length?<div className="tableScroll"><table><thead><tr><th>Team member</th><th>Recorded actions</th><th>Latest work (IST)</th></tr></thead><tbody>{Array.from(new Set(data.work.map(w=>w.actor))).map(id=>{const work=data.work.filter(w=>w.actor===id);return <tr key={id||"system"}><td>{name(id)}</td><td>{work.length}</td><td>{date(work[0].at)}</td></tr>})}</tbody></table></div>:<p>No work has been recorded yet.</p>}
   <h3>Assignment history</h3>{data.assignments.length?data.assignments.map(a=><article className="workspaceTimelineEntry" key={a.id}><div className="workspaceTimelineMeta"><b>{a.from_owner_id?(a.from_owner_name||name(a.from_owner_id))+" → ":""}{a.to_owner_name||(a.to_owner_id?name(a.to_owner_id):"Unassigned \u00b7 Admin pool")}</b><time>{date(a.assigned_at)} IST</time><span>{a.reason}</span></div><p>{a.reason==="Tracking started"?"Owner when assignment tracking began.":"Assigned by "+(a.actor_name||name(a.actor_id))}{a.status?" · "+a.status:""}</p></article>):<p>No assignment history available.</p>}
   <h3>Recorded work</h3>{data.work.map(w=><article className="workspaceTimelineEntry" key={w.id}><div className="workspaceTimelineMeta"><b>{name(w.actor)}</b><time>{date(w.at)} IST</time><span>{w.kind}</span></div><p>{w.description}</p></article>)}
  </>}
 </section>;
}
