"use client";
import {useCallback,useEffect,useState} from "react";
import {supabase} from "@/lib/supabase";
import {PhoneCall,CheckCircle2,Clock3,CalendarDays,RefreshCw} from "lucide-react";
type Task={id:string;shareholder_name:string;company:string|null;mobile_number:string|null;followup_date:string|null;followup_time:string|null;status:string;ref_id:string|null;followup_completed_at:string|null};
const localDay=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
export default function FollowupQueue({onOpen,onChanged,refreshKey}:{onOpen:(lead:any)=>void;onChanged:()=>Promise<void>;refreshKey:number}){
 const [tasks,setTasks]=useState<Task[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(""),[tab,setTab]=useState<"due"|"upcoming">("due");
 const today=localDay();
 const load=useCallback(async()=>{setLoading(true);setError("");let q=supabase.from("leads").select("id,shareholder_name,company,mobile_number,followup_date,followup_time,status,ref_id,followup_completed_at").not("followup_priority_date","is",null).order("followup_priority_date",{ascending:true}).order("followup_time",{ascending:true,nullsFirst:true}).limit(300);q=tab==="due"?q.lte("followup_priority_date",today):q.gt("followup_priority_date",today);const {data,error:e}=await q;if(e)setError(e.message);else setTasks((data||[]) as Task[]);setLoading(false)},[tab,today]);
 useEffect(()=>{load()},[load,refreshKey]);
 const complete=async(id:string)=>{setBusy(id);const {error:e}=await supabase.from("leads").update({followup_completed_at:new Date().toISOString()}).eq("id",id);setBusy("");if(e)setError(e.message);else{await load();await onChanged()}};
 const openFull=async(id:string)=>{const {data,error:e}=await supabase.from("leads").select("*").eq("id",id).single();if(e)setError(e.message);else if(data)onOpen(data)};
 const dial=(phone:string|null)=>{if(phone)window.location.href="tel:"+phone.replace(/[^\d+]/g,"")};
 return <section className="tableCard followupCard"><div className="tableHeading"><div><div className="eyebrow">PRIORITY CALL QUEUE</div><h2>Who needs a call?</h2><p>Due and overdue calls appear first. Complete a call or open a record to reschedule.</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
 <div className="queueTabs"><button className={tab==="due"?"queueTab active":"queueTab"} onClick={()=>setTab("due")}><PhoneCall size={15}/> Due & overdue</button><button className={tab==="upcoming"?"queueTab active":"queueTab"} onClick={()=>setTab("upcoming")}><CalendarDays size={15}/> Upcoming</button></div>
 {error&&<div className="alert">{error}</div>}
 {loading?<div className="tableEmpty">Loading scheduled calls…</div>:tasks.length===0?<div className="queueEmpty"><CheckCircle2 size={30}/><b>{tab==="due"?"No overdue or due calls":"No upcoming calls scheduled"}</b><span>Schedule a follow-up date on any lead to add it here automatically.</span></div>:<div className="queueList">{tasks.map(t=><div className="queueItem" key={t.id}><div className={"queueDot "+(t.followup_date===today?"today":"")}/><div className="queueInfo"><b>{t.shareholder_name}</b><span>{t.company||t.ref_id||"Shareholder"}</span><div className="queueMeta"><Clock3 size={13}/><strong>{t.followup_date===today?"TODAY":t.followup_date&&t.followup_date<today?"OVERDUE · "+t.followup_date:t.followup_date}</strong>{t.followup_time&&<span>at {t.followup_time}</span>}</div></div><div className="queueActions">{t.mobile_number&&<button className="secondary" onClick={()=>dial(t.mobile_number)}><PhoneCall size={14}/> Call</button>}<button className="secondary" onClick={()=>openFull(t.id)}>Open</button><button className="primary" disabled={busy===t.id} onClick={()=>complete(t.id)}><CheckCircle2 size={15}/> Done</button></div></div>)}</div>}
 {tasks.length===300&&<p className="metricHint" style={{padding:"0 24px 20px"}}>Showing first 300 scheduled calls. Use search to locate additional leads.</p>}
 </section>
}
