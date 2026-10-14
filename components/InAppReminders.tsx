"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Bell,X} from "lucide-react";
import {supabase} from "@/lib/supabase";
type Reminder={key:string;leadId:string;title:string;when:string;kind:"CALL"|"VISIT";late:boolean};
export default function InAppReminders({userId,ownerId,onOpen,onVisits}:{userId:string;ownerId?:string;onOpen:(lead:any)=>void;onVisits:()=>void}){
 const [items,setItems]=useState<Reminder[]>([]),[open,setOpen]=useState(false),[error,setError]=useState(""),[dismissed,setDismissed]=useState<string[]>([]);
 const closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{try{setDismissed(JSON.parse(localStorage.getItem("crm-reminders:"+userId)||"[]"))}catch{}},[userId]);
 const load=useCallback(async()=>{const now=Date.now(),today=new Date(now+19800000).toISOString().slice(0,10);
 let calls=supabase.from("leads").select("id,shareholder_name,followup_date,followup_time,followup_priority_date").is("archived_at",null).not("followup_priority_date","is",null).lte("followup_priority_date",today).order("followup_priority_date").limit(300);
 let visits=supabase.from("crm_visits").select("id,lead_id,contact_name,scheduled_at").eq("status","PLANNED").lte("scheduled_at",new Date(now+15*60000).toISOString()).order("scheduled_at").limit(300);
 if(ownerId){calls=calls.eq("owner_id",ownerId);visits=visits.eq("assigned_to",ownerId);}
 const [c,v]=await Promise.all([calls,visits]);if(c.error||v.error){setError("Could not refresh reminders.");return;}
 const list:Reminder[]=[];
 for(const l of c.data||[]){const d=l.followup_priority_date||l.followup_date;if(!/^\d{4}-\d{2}-\d{2}$/.test(d||""))continue;const time=/^\d{2}:\d{2}/.test(l.followup_time||"")?l.followup_time.slice(0,5):"00:00";const at=Date.parse(d+"T"+time+":00+05:30");if(at<=now+15*60000)list.push({key:"call:"+l.id+":"+d+":"+time,leadId:l.id,title:l.shareholder_name,when:l.followup_time?d+" at "+time+" IST":d,kind:"CALL",late:d<today});}
 for(const visit of v.data||[])list.push({key:"visit:"+visit.id+":"+visit.scheduled_at,leadId:visit.lead_id,title:visit.contact_name,when:new Date(visit.scheduled_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"}),kind:"VISIT",late:Date.parse(visit.scheduled_at)<now});
 setItems(list);setError("");
 },[ownerId]);
 useEffect(()=>{void load();const timer=setInterval(()=>void load(),30000);return()=>clearInterval(timer)},[load]);
 useEffect(()=>{if(!open)return;closeRef.current?.focus();const handler=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false)};document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler)},[open]);
 const visible=items.filter(i=>!dismissed.includes(i.key));
 const dismiss=(key:string)=>{const next=[...dismissed,key].slice(-500);setDismissed(next);try{localStorage.setItem("crm-reminders:"+userId,JSON.stringify(next))}catch{}};
 async function openLead(id:string){const r=await supabase.from("leads").select("*").is("archived_at",null).eq("id",id).single();if(r.error){setError("This lead is not assigned to your workspace. Open Visits for your visit details.");return;}setOpen(false);onOpen(r.data);}
 return <><button type="button" className="secondary reminderButton" aria-label={"Reminders, "+visible.length+" due or upcoming"} onClick={()=>{setOpen(!open);void load()}}><Bell size={17}/>{visible.length>0&&<b>{visible.length}</b>}</button>{open&&createPortal(<div className="reminderBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="reminderPanel" role="dialog" aria-label="CRM reminders"><header><div><h2>Reminders</h2><p>Due calls and visits starting within 15 minutes.</p></div><button ref={closeRef} className="iconButton" aria-label="Close reminders" onClick={()=>setOpen(false)}><X size={19}/></button></header><div className="reminderContent">{error&&<p role="alert">{error}</p>}{!visible.length&&<p>No pending reminders.</p>}{visible.map(i=><article key={i.key} className="opsItem"><div><b>{i.title}</b><span>{i.kind==="CALL"?"Follow-up call":"Visit"} · {i.late?"Overdue":"Due / upcoming"} · {i.when}</span><div className="opsActions"><button className="secondary" onClick={()=>{if(i.kind==="VISIT"){setOpen(false);onVisits()}else void openLead(i.leadId)}}>Open {i.kind==="VISIT"?"visits":"lead"}</button><button className="quiet" onClick={()=>dismiss(i.key)}>Dismiss reminder</button></div></div></article>)}<p className="metricHint">Refreshes every 30 seconds while the CRM is open. Dismissing hides this reminder in this browser; the task stays scheduled.</p></div></section></div>,document.body)}</>;
}
