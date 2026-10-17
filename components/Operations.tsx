"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {supabase} from "@/lib/supabase";
import DuplicateReview,{LeadComparison} from "./DuplicateReview";
import {InlineSpinner} from "./LoadingStates";
import {encryptBackup,decryptBackup,download,Envelope} from "@/lib/backup";
type Row=Record<string,any>;
type Member={user_id:string;email:string;display_name?:string;role:string};
type Props={view:string;userId:string;ownerId?:string;admin:boolean;members:Member[];refreshKey:number;onOpen:(lead:any,ids?:string[])=>void;onChanged:()=>Promise<void>};
export const OPS_VIEWS=["Visits","Calls & activity","Duplicates","Backups"];
const day=()=>new Date(Date.now()+19800000).toISOString().slice(0,10);
const ist=(value:string)=>new Date(value).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium",timeStyle:"short"});
const inputTime=(value:string)=>new Date(Date.parse(value)+19800000).toISOString().slice(0,16);
const utc=(value:string)=>new Date(value+"+05:30").toISOString();
async function rows(table:string,ownerId?:string):Promise<Row[]>{
 const all:Row[]=[];for(let offset=0;offset<100000;offset+=500){
 let q=supabase.from(table).select("*").order(table==="crm_active_days"?"user_id":"id").range(offset,offset+499);
 if(table==="leads")q=q.is("archived_at",null);if(table==="crm_active_days")q=q.order("day");
 if(ownerId)q=q.eq(table==="crm_visits"?"assigned_to":table==="crm_lead_activity"?"actor_id":table==="crm_active_days"?"user_id":"owner_id",ownerId);
 const {data,error}=await q;if(error)throw new Error(error.message);all.push(...(data||[]));if(!data||data.length<500)return all;
 }throw new Error("Too many records. Contact an administrator to narrow the report.");
}
export default function Operations({view,userId,ownerId,admin,members,refreshKey,onOpen,onChanged}:Props){
 const [leads,setLeads]=useState<Row[]>([]),[visits,setVisits]=useState<Row[]>([]),[activity,setActivity]=useState<Row[]>([]),[merges,setMerges]=useState<Row[]>([]);
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [search,setSearch]=useState(""),[leadId,setLeadId]=useState(""),[editVisit,setEditVisit]=useState<string|null>(null);
 const [date,setDate]=useState(""),[location,setLocation]=useState(""),[assignee,setAssignee]=useState(userId),[visitStatus,setVisitStatus]=useState("PLANNED"),[outcome,setOutcome]=useState(""),[nextAction,setNextAction]=useState(""),[notes,setNotes]=useState("");
 const [kind,setKind]=useState("CALL"),[callOutcome,setCallOutcome]=useState("Connected"),[activityNotes,setActivityNotes]=useState("");
 const [mergeDetail,setMergeDetail]=useState<Row|null>(null);
 const [target,setTarget]=useState(""),[source,setSource]=useState(""),[confirmed,setConfirmed]=useState(false),[phrase,setPhrase]=useState(""),[backupInfo,setBackupInfo]=useState<Row|null>(null);
 const fieldName=(value:string)=>(({shareholder_name:"Shareholder",owner_id:"Assigned employee",ref_id:"Reference",input_remarks:"Mining notes",sales_remarks:"Sales notes",holding_value:"Holding value",mobile_number:"Phone"} as Record<string,string>)[value]||value.replace(/_/g," "));
 const memberName=(id:string)=>members.find(m=>m.user_id===id)?.display_name||members.find(m=>m.user_id===id)?.email||"Former team member";
 const selected=leads.find(l=>l.id===leadId);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   if(view!=="Backups"){
    const [l,v,a]=await Promise.all([rows("leads",ownerId),view==="Visits"?rows("crm_visits",ownerId):Promise.resolve([]),view==="Calls & activity"?rows("crm_lead_activity",ownerId):Promise.resolve([])]);
    setLeads(l);setVisits(v);setActivity(a);
    if(view==="Duplicates"){const r=await supabase.from("crm_merge_events").select("*").order("merged_at",{ascending:false}).limit(30);if(r.error)throw new Error(r.error.message);setMerges(r.data||[]);}
   }
  }catch(e){setError(e instanceof Error?e.message:"Could not load records");}finally{setLoading(false);}
 },[view,ownerId]);
 useEffect(()=>{void load()},[load,refreshKey]);
 const choices=useMemo(()=>leads.filter(l=>!search||[l.shareholder_name,l.company,l.ref_id,l.mobile_number,l.email].some(v=>String(v||"").toLowerCase().includes(search.toLowerCase()))).slice(0,100),[leads,search]);
 const chooseLead=(id:string)=>{setLeadId(id);const l=leads.find(x=>x.id===id);if(l){setLocation(l.registered_address||"");setAssignee(l.owner_id);}};
 const resetVisit=()=>{setEditVisit(null);setLeadId("");setSearch("");setDate("");setLocation("");setAssignee(userId);setVisitStatus("PLANNED");setOutcome("");setNextAction("");setNotes("");};
 async function work(action:()=>Promise<void>){if(busy)return;setBusy(true);setError("");setMessage("");try{await action()}catch(e){setError(e instanceof Error?e.message:"Action failed");}finally{setBusy(false);}}
 const openLead=async(id:string)=>{const r=await supabase.from("leads").select("*").is("archived_at",null).eq("id",id).single();if(r.error){setError("This lead is not in your current workspace. Ask an administrator to review its assignment.");return;}onOpen(r.data,leads.filter(l=>!search||[l.shareholder_name,l.company,l.ref_id,l.mobile_number,l.email].some(v=>String(v||"").toLowerCase().includes(search.toLowerCase()))).map(l=>l.id))};
 async function saveVisit(e:React.FormEvent){e.preventDefault();await work(async()=>{
  if(!leadId||!date||!location.trim())throw new Error("Select a lead, visit time and location.");
  const data={lead_id:leadId,assigned_to:assignee,scheduled_at:utc(date),location:location.trim(),status:visitStatus,outcome:outcome.trim(),next_action:nextAction.trim(),notes:notes.trim()};
  const r=editVisit?await supabase.from("crm_visits").update(data).eq("id",editVisit).select("id").single():await supabase.from("crm_visits").insert(data).select("id").single();
  if(r.error)throw new Error(r.error.message);resetVisit();await load();await onChanged();setMessage("Visit saved.");
 });}
 async function logActivity(e:React.FormEvent){e.preventDefault();await work(async()=>{
  if(!leadId)throw new Error("Select a lead.");const r=await supabase.from("crm_lead_activity").insert({lead_id:leadId,kind,outcome:callOutcome.trim(),notes:activityNotes.trim()});
  if(r.error)throw new Error(r.error.message);setActivityNotes("");await load();setMessage("Activity logged.");
 });}
 const visibleVisits=visits.filter(v=>!search||[v.contact_name,v.company,v.location].some(x=>String(x||"").toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at));
 const leadChooser=<><label>Search leads<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, company, phone or reference"/></label><label>Shareholder<select required value={leadId} disabled={!!editVisit&&!admin} onChange={e=>chooseLead(e.target.value)}><option value="">Select a lead</option>{choices.map(l=><option key={l.id} value={l.id}>{l.shareholder_name} · {l.company||l.ref_id||"Shareholder"}</option>)}{editVisit&&!choices.some(l=>l.id===leadId)&&<option value={leadId}>Assigned visit shareholder</option>}</select></label></>;
 if(["Duplicates","Backups"].includes(view)&&!admin)return <section className="tableCard opsCard">Administrator access is required.</section>;
 return <section className="tableCard opsCard">
  <div className="opsHead"><div><h2>{view}</h2><p>{view==="Visits"?"Schedule visits, record outcomes and keep the next action clear. All times are IST.":view==="Calls & activity"?"Log calls, emails and notes against a shareholder record.":view==="Duplicates"?"Review potential duplicates. Different companies and relatives sharing a contact should remain separate.":"Create an encrypted CRM backup or verify a saved backup file."}</p></div>{view!=="Backups"&&<button className="secondary" onClick={()=>void load()} disabled={loading} aria-busy={loading}>{loading&&<InlineSpinner/>}{loading?"Refreshing...":"Refresh"}</button>}</div>
  {error&&<div className="alert" role="alert">{error}</div>}{message&&<p className="opsSuccess" role="status">{message}</p>}
  {loading&&<span className="srOnly" role="status">Loading workspace records</span>}
  {view==="Visits"&&<>
   <form onSubmit={saveVisit}><fieldset disabled={busy}><legend>{editVisit?"Update visit":"Plan a visit"}</legend><div className="formGrid">{leadChooser}
    <label>Date and time (IST)<input type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)}/></label>
    <label>Assigned employee<select value={assignee} disabled={!admin} onChange={e=>setAssignee(e.target.value)}>{members.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name||m.email}</option>)}</select></label>
    <label className="full">Visit address<input required maxLength={1000} value={location} onChange={e=>setLocation(e.target.value)}/></label>
    <label>Status<select value={visitStatus} onChange={e=>setVisitStatus(e.target.value)}><option value="PLANNED">Planned</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></label>
    <label>Outcome<input required={visitStatus==="COMPLETED"} maxLength={4000} value={outcome} onChange={e=>setOutcome(e.target.value)} placeholder="Required when completed"/></label>
    <label>Next action<textarea maxLength={4000} value={nextAction} onChange={e=>setNextAction(e.target.value)}/></label>
    <label>Notes<textarea maxLength={8000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   </div><div className="opsActions"><button className="primary" disabled={busy}>{busy?"Saving…":editVisit?"Save visit":"Schedule visit"}</button>{editVisit&&<button type="button" className="secondary" onClick={resetVisit}>Cancel editing</button>}</div></fieldset></form>
   <div className="opsList">{visibleVisits.map(v=><article key={v.id} className="opsItem"><div><b>{v.contact_name}</b><span>{v.company} · {memberName(v.assigned_to)}</span><span>{ist(v.scheduled_at)} · {v.status}{v.status==="PLANNED"&&Date.parse(v.scheduled_at)<Date.now()?" · Overdue":""}</span><span>{v.location}</span>{v.outcome&&<p>Outcome: {v.outcome}</p>}{v.next_action&&<p>Next: {v.next_action}</p>}</div><div className="opsActions"><button className="secondary" onClick={()=>{setEditVisit(v.id);setLeadId(v.lead_id);setDate(inputTime(v.scheduled_at));setLocation(v.location);setAssignee(v.assigned_to);setVisitStatus(v.status);setOutcome(v.outcome);setNextAction(v.next_action);setNotes(v.notes);window.scrollTo({top:0,behavior:"smooth"})}}>Update</button><button className="secondary" onClick={()=>void openLead(v.lead_id)}>Open lead</button></div></article>)}{!loading&&!visibleVisits.length&&<p>No visits scheduled yet.</p>}</div>
  </>}
  {view==="Calls & activity"&&<>
   <form onSubmit={logActivity}><fieldset disabled={busy}><legend>Log activity</legend><div className="formGrid">{leadChooser}<label>Activity type<select value={kind} onChange={e=>{setKind(e.target.value);setCallOutcome(e.target.value==="CALL"?"Connected":e.target.value==="EMAIL"?"Email sent":"Note added")}}><option value="CALL">Call</option><option value="EMAIL">Email</option><option value="NOTE">Note</option></select></label><label>Outcome<input required maxLength={200} list="activity-outcomes" value={callOutcome} onChange={e=>setCallOutcome(e.target.value)}/><datalist id="activity-outcomes"><option value="Connected"/><option value="No answer"/><option value="Not reachable"/><option value="Follow-up agreed"/><option value="Email sent"/><option value="Note added"/></datalist></label><label className="full">Notes<textarea maxLength={8000} value={activityNotes} onChange={e=>setActivityNotes(e.target.value)}/></label></div><div className="opsActions"><button className="primary" disabled={busy}>Log activity</button>{selected&&<button type="button" className="secondary" onClick={()=>void openLead(selected.id)}>Schedule follow-up in lead</button>}</div></fieldset></form>
   <div className="opsList">{[...activity].sort((a,b)=>Date.parse(b.occurred_at)-Date.parse(a.occurred_at)).slice(0,100).map(a=><article className="opsItem" key={a.id}><div><b>{leads.find(l=>l.id===a.lead_id)?.shareholder_name||"Archived or transferred record"}</b><span>{a.kind} · {a.outcome} · {memberName(a.actor_id)} · {ist(a.occurred_at)}</span><p>{a.notes}</p></div></article>)}</div>
  </>}
  {view==="Duplicates"&&<><DuplicateReview leads={leads} members={members} onOpen={id=>void openLead(id)} onReview={(left,right)=>{setTarget(left);setSource(right);setConfirmed(false)}}/>
   <p className="metricHint">Merges require manual confirmation of the same shareholder and company. The target owner, status and value are retained; originals and work history are preserved.</p>
   {target&&source&&<div className="opsDetail"><h3>Review before merging</h3><div className="formGrid"><label>Keep this record<select value={target} onChange={e=>{setTarget(e.target.value);setConfirmed(false)}}>{leads.map(l=><option key={l.id} value={l.id}>{l.ref_id} · {l.shareholder_name} · {l.company}</option>)}</select></label><label>Merge this source<select value={source} onChange={e=>{setSource(e.target.value);setConfirmed(false)}}>{leads.map(l=><option key={l.id} value={l.id}>{l.ref_id} · {l.shareholder_name} · {l.company}</option>)}</select></label></div><LeadComparison left={leads.find(l=>l.id===target)||{}} right={leads.find(l=>l.id===source)||{}}/><label className="opsConfirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm both records are the same shareholder in the same company.</label><div className="opsActions"><button className="primary" disabled={!confirmed||target===source||busy} onClick={()=>void work(async()=>{const r=await supabase.rpc("crm_merge_leads_reviewed",{p_target:target,p_source:source,p_expected_target_updated_at:leads.find(l=>l.id===target)?.updated_at,p_expected_source_updated_at:leads.find(l=>l.id===source)?.updated_at});if(r.error)throw new Error(r.error.message);setTarget("");setSource("");await load();await onChanged();setMessage("Records merged. The original source is preserved.");})}>Merge reviewed records</button><button className="secondary" onClick={()=>{setTarget("");setSource("")}}>Cancel</button></div></div>}
   <h3>Recent merge history</h3>{merges.map(m=><article className="opsItem" key={m.id}><div><b>{m.source_before.shareholder_name} → {m.target_before.shareholder_name}</b><span>{ist(m.merged_at)} · {m.restored_at?"Restored":"Merged"}</span><button className="quiet" onClick={()=>setMergeDetail(m)}>View preserved records</button></div>{!m.restored_at&&<button className="secondary" disabled={busy} onClick={()=>void work(async()=>{if(!confirm("Restore both original records? This is allowed only if the merged records have not changed."))return;const r=await supabase.rpc("crm_undo_merge",{p_event:m.id});if(r.error)throw new Error(r.error.message);await load();await onChanged();setMessage("Original records restored.");})}>Undo merge</button>}</article>)}{mergeDetail&&<div className="opsDetail"><button className="secondary" onClick={()=>setMergeDetail(null)}>Close preserved records</button><div className="tableScroll"><table><thead><tr><th>Field</th><th>Original target</th><th>Original source</th></tr></thead><tbody>{Object.keys(mergeDetail.source_before).map(k=><tr key={k}><td>{fieldName(k)}</td><td>{JSON.stringify(mergeDetail.target_before[k])}</td><td>{JSON.stringify(mergeDetail.source_before[k])}</td></tr>)}</tbody></table></div></div>}
  </>}
  {view==="Backups"&&<><p>Automatic encrypted backups are stored in your private <a href="https://drive.google.com/drive/folders/17rxkR-k_dPZai3epLkt6r2KS3RPxpiWB" target="_blank" rel="noopener noreferrer">Google Drive backup folder</a>. The scheduled task runs from your connected computer; keep it available.</p><div className="formGrid"><label className="full">Backup passphrase<input type="password" autoComplete="new-password" value={phrase} onChange={e=>setPhrase(e.target.value)} placeholder="Use at least 16 characters; save it separately"/></label></div><div className="opsActions"><button className="secondary" onClick={()=>{const p=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");setPhrase(p);download("Claim360-backup-recovery-key.txt",p+"\nSave this key separately from encrypted backups.","text/plain")}}>Generate recovery key</button><button className="primary" disabled={busy||phrase.length<16} onClick={()=>void work(async()=>{const r=await supabase.rpc("crm_export_backup");if(r.error)throw new Error(r.error.message);const encrypted=await encryptBackup(r.data,phrase);download("Claim360-"+day()+".crmbackup",JSON.stringify(encrypted));setMessage("Encrypted CRM backup downloaded. Keep its recovery key separately.");})}>Download encrypted backup</button></div><h3>Verify a saved backup</h3><p className="metricHint">Enter its passphrase above, then select the encrypted file. Verification does not change your database.</p><input type="file" accept=".crmbackup,.json" disabled={busy||!phrase} aria-label="Encrypted backup file" onChange={e=>{const file=e.target.files?.[0];if(file)void work(async()=>{const data=await decryptBackup(JSON.parse(await file.text()) as Envelope,phrase);setBackupInfo({exported_at:data.exported_at,counts:Object.fromEntries(Object.entries(data.tables).map(([k,v])=>[k,(v as unknown[]).length]))});setMessage("Backup decrypted and verified.");});}}/>{backupInfo&&<div className="opsDetail"><p>Backup created {ist(backupInfo.exported_at)}</p><pre>{JSON.stringify(backupInfo.counts,null,2)}</pre></div>}<p className="metricHint">Backups contain CRM data and history. Authentication accounts, API keys and deployed code are managed separately. Database restoration requires an administrator and a tested restore procedure.</p></>}
 </section>;
}
