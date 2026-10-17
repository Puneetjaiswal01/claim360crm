"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";
import {download} from "@/lib/backup";
import {actionTotals,buildLeadActions,filterLeadActions,holdingAmount,istDay,reportCsv,ReportData,ReportRow} from "@/lib/leadReporting";

type Member={user_id:string;email:string;display_name?:string};
const today=()=>istDay(new Date().toISOString());
const money=(value:number)=>"₹"+value.toLocaleString("en-IN",{maximumFractionDigits:2});
const time=(value:string)=>new Date(value).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"});
async function allRows(table:string,order:string){
 const result:ReportRow[]=[];
 for(let offset=0;;offset+=500){
  let query=supabase.from(table).select("*").order(order).range(offset,offset+499);
  if(order!=="id")query=query.order(table==="crm_active_days"?"user_id":"id");
  const {data,error}=await query;if(error)throw new Error(table+": "+error.message);
  result.push(...(data||[]));if(!data||data.length<500)return result;
  if(result.length>=200000)throw new Error("The report exceeds 200,000 records in "+table+". No partial totals are displayed.");
 }
}
export default function LeadReports({view,members,refreshKey,onOpen}:{view:"Reports"|"Activity reports";members:Member[];refreshKey:number;onOpen:(lead:any,ids?:string[])=>void}){
 const [data,setData]=useState<ReportData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const [from,setFrom]=useState(today().slice(0,8)+"01"),[to,setTo]=useState(today()),[actor,setActor]=useState(""),[type,setType]=useState(""),[query,setQuery]=useState(""),[page,setPage]=useState(0);
 const name=(id:string|null)=>members.find(m=>m.user_id===id)?.display_name||members.find(m=>m.user_id===id)?.email||(id?"Former member ("+id.slice(0,8)+")":"Unattributed / system");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{const [leads,activity,visits,audit,assignments,merges,activeDays]=await Promise.all([allRows("leads","id"),allRows("crm_lead_activity","id"),allRows("crm_visits","id"),allRows("crm_audit_events","id"),allRows("crm_lead_assignments","id"),allRows("crm_merge_events","id"),allRows("crm_active_days","day")]);setData({leads,activity,visits,audit,assignments,merges,activeDays});}
  catch(e){setError(e instanceof Error?e.message:"Could not load reports");setData(null)}finally{setLoading(false)}
 },[]);
 useEffect(()=>{void load()},[load,refreshKey]);
 useEffect(()=>{setPage(0)},[from,to,actor,type,query]);
 const actions=useMemo(()=>data?buildLeadActions(data):[],[data]);
 const filtered=useMemo(()=>filterLeadActions(actions,{from,to,actorId:actor,type,search:query}),[actions,from,to,actor,type,query]);
 const totals=useMemo(()=>actionTotals(filtered),[filtered]);
 useEffect(()=>{setPage(p=>Math.min(p,Math.max(0,Math.ceil(filtered.length/50)-1)))},[filtered.length]);
 const current=(data?.leads||[]).filter(l=>!l.archived_at&&(!actor||l.owner_id===actor));
 const memberIds=Array.from(new Set([...members.map(m=>m.user_id),...actions.map(a=>a.actorId||"__unknown__")])).filter(id=>!actor||id===actor);
 const summary=memberIds.map(id=>{const work=filtered.filter(a=>(a.actorId||"__unknown__")===id),totals=actionTotals(work),count=(types:string[])=>work.filter(a=>types.includes(a.type)).length;
  return {id,totals,calls:count(["Call logged"]),emails:count(["Email logged"]),notes:count(["Note logged","Note added","Comment added"]),statuses:count(["Status changed"]),followups:work.filter(a=>a.type.startsWith("Follow-up")).length,visits:work.filter(a=>a.type.startsWith("Visit")).length,edits:count(["Lead details edited","Mining remarks updated","Sales remarks updated"]),rotations:count(["Lead rotated"]),transfers:count(["Lead transferred"]),merges:count(["Duplicates merged","Merge restored"]),created:count(["Lead created"]),deleted:count(["Lead deleted","Lead archived","Lead restored","Activity log deleted"]),active:(data?.activeDays||[]).filter(d=>d.user_id===id&&d.day>=from&&d.day<=to).reduce((n,d)=>n+Number(d.active_seconds||0),0)};
 });
 const exportActions=()=>download("claim360-lead-actions-"+from+"-"+to+".csv",reportCsv([["Time (IST)","Employee","Lead ID","Reference","Shareholder","Company","Action","Details","Holding value (INR)","Value source"],...filtered.map(a=>[time(a.at),name(a.actorId),a.leadId,a.reference,a.leadName,a.company,a.type,a.detail,a.holding??"",a.valueSource])]),"text/csv;charset=utf-8");
 const exportSummary=()=>download("claim360-team-actions-"+from+"-"+to+".csv",reportCsv([["Employee","Total actions","Distinct leads","Holding value of distinct leads (INR)","Leads without numeric value","Calls","Emails","Comments/notes","Status changes","Follow-up actions","Visit actions","Edits/remarks","Rotations","Transfers","Merges/restores","Leads created","Delete/archive/restore","Active hours"],...summary.map(r=>[name(r.id==="__unknown__"?null:r.id),r.totals.actions,r.totals.leads,r.totals.holding,r.totals.unvalued,r.calls,r.emails,r.notes,r.statuses,r.followups,r.visits,r.edits,r.rotations,r.transfers,r.merges,r.created,r.deleted,(r.active/3600).toFixed(2)])]),"text/csv;charset=utf-8");
 const open=async(id:string)=>{const result=await supabase.from("leads").select("*").eq("id",id).is("archived_at",null).maybeSingle();if(result.error||!result.data){setError(result.error?.message||"This lead was archived or deleted; its recorded actions remain in this report.");return}onOpen(result.data,[...new Set(filtered.map(a=>a.leadId))])};
 return <section className="tableCard opsCard leadReports">
  <div className="opsHead"><div><h2>{view==="Reports"?"Team performance & lead actions":"Lead activity reports"}</h2><p>Every recorded action, its employee, lead and holding value. Dates and times use IST.</p></div><button className="secondary" disabled={loading} onClick={()=>void load()}>{loading?"Loading…":"Refresh reports"}</button></div>
  {error&&<div className="alert" role="alert">{error}</div>}{loading&&<p role="status">Loading complete report data…</p>}
  <fieldset disabled={loading||!data} className="reportFilters"><legend>Report filters</legend><div className="formGrid"><label>From (IST)<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To (IST)<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><label>Employee who took the action<select value={actor} onChange={e=>setActor(e.target.value)}><option value="">All employees</option>{Array.from(new Set([...members.map(m=>m.user_id),...actions.map(a=>a.actorId||"__unknown__")])).map(id=><option key={id} value={id}>{name(id==="__unknown__"?null:id)}</option>)}</select></label><label>Action<select value={type} onChange={e=>setType(e.target.value)}><option value="">All actions</option>{Array.from(new Set(actions.map(a=>a.type))).sort().map(t=><option key={t}>{t}</option>)}</select></label><label className="full">Search lead or action<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Shareholder, reference, company or action details"/></label></div></fieldset>
  {data&&!loading&&<>
   <div className="reportStats"><div><strong>{totals.actions.toLocaleString("en-IN")}</strong><span>Recorded actions</span></div><div><strong>{totals.leads.toLocaleString("en-IN")}</strong><span>Distinct leads acted on</span></div><div><strong>{money(totals.holding)}</strong><span>Holding value · each lead counted once</span></div><div><strong>{totals.unvalued}</strong><span>Leads without a usable amount</span></div></div>
   <p className="metricHint">Counts follow the employee who performed the action, including previous owners. One save can contain several actions, such as a status change and a follow-up. Holding values use recorded snapshots when available, otherwise current lead values; they are not payments or collected fees. Shared leads can appear under multiple employees; the overall total counts each lead once. History begins where saved records exist. Unknown actors remain unattributed.</p>
   {view==="Reports"&&<><h3>Current pipeline</h3><p className="metricHint">Current active leads by owner. These totals are separate from the dated action filters below.</p><div className="tableScroll"><table><thead><tr><th>Owner</th><th>Assigned leads</th><th>Holding value</th><th>Untouched</th><th>Follow-up</th><th>Visit</th><th>Potential</th><th>Converted</th><th>Converted holding value</th><th>RNR / Cold</th><th>Follow-ups due</th></tr></thead><tbody>{Array.from(new Set(current.map(l=>l.owner_id))).map(id=>{const rows=current.filter(l=>l.owner_id===id),converted=rows.filter(l=>l.status==="CONVERTED");return <tr key={id||"__unassigned__"}><td>{id?name(id):"Unassigned \u00b7 Admin pool"}</td><td>{rows.length}</td><td>{money(rows.reduce((n,l)=>n+(holdingAmount(l.holding_value)??0),0))}</td><td>{rows.filter(l=>l.status==="UNTOUCHED").length}</td><td>{rows.filter(l=>l.status==="FOLLOW UP").length}</td><td>{rows.filter(l=>l.status==="VISIT").length}</td><td>{rows.filter(l=>l.status==="POTENTIAL").length}</td><td>{converted.length}</td><td>{money(converted.reduce((n,l)=>n+(holdingAmount(l.holding_value)??0),0))}</td><td>{rows.filter(l=>["RINGING NOT RESPONDING","COLD"].includes(l.status)).length}</td><td>{rows.filter(l=>l.followup_date&&l.followup_date<=today()&&!l.followup_completed_at).length}</td></tr>})}</tbody></table></div></>}
   <div className="opsHead"><h3>Employee action totals</h3><button className="secondary" onClick={exportSummary}>Export employee totals</button></div>
   <div className="tableScroll"><table><thead><tr><th>Employee</th><th>All actions</th><th>Distinct leads</th><th>Holding value</th><th>Calls</th><th>Emails</th><th>Comments / notes</th><th>Status</th><th>Follow-ups</th><th>Visits</th><th>Edits / remarks</th><th>Rotations</th><th>Transfers</th><th>Merges / restores</th><th>Created</th><th>Deleted / archived / restored</th><th>Active hours</th></tr></thead><tbody>{summary.map(r=><tr key={r.id}><td>{name(r.id==="__unknown__"?null:r.id)}</td><td>{r.totals.actions}</td><td>{r.totals.leads}</td><td>{money(r.totals.holding)}</td><td>{r.calls}</td><td>{r.emails}</td><td>{r.notes}</td><td>{r.statuses}</td><td>{r.followups}</td><td>{r.visits}</td><td>{r.edits}</td><td>{r.rotations}</td><td>{r.transfers}</td><td>{r.merges}</td><td>{r.created}</td><td>{r.deleted}</td><td>{(r.active/3600).toFixed(2)}</td></tr>)}</tbody></table></div>
   <div className="opsHead"><h3>Actions taken on leads</h3><button className="secondary" disabled={!filtered.length} onClick={exportActions}>Export all matching actions</button></div>
   <div className="tableScroll"><table><thead><tr><th>Time (IST)</th><th>Employee</th><th>Lead</th><th>Action</th><th>Details</th><th>Holding value</th></tr></thead><tbody>{filtered.slice(page*50,page*50+50).map(a=><tr key={a.id}><td>{time(a.at)}</td><td>{name(a.actorId)}</td><td><button className="quiet" onClick={()=>void open(a.leadId)}>{a.leadName}</button><small className="reportLeadRef">{a.reference} · {a.company}</small></td><td>{a.type}</td><td className="reportActionDetail">{a.detail}</td><td>{a.holding===null?"Not recorded":money(a.holding)}<small className="reportLeadRef">{a.valueSource}</small></td></tr>)}</tbody></table></div>
   {!filtered.length&&<p>No recorded actions match these filters.</p>}
   <div className="opsActions"><button className="secondary" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</button><span>{filtered.length} actions · Page {page+1} of {Math.max(1,Math.ceil(filtered.length/50))}</span><button className="secondary" disabled={(page+1)*50>=filtered.length} onClick={()=>setPage(p=>p+1)}>Next</button></div>
  </>}
 </section>;
}
