"use client";
import {useEffect,useState} from "react";
import {Clock,Palette,X} from "lucide-react";
import {supabase} from "@/lib/supabase";

type Usage={session_seconds:number;today_seconds:number;started_at:string;server_time:string};
type Entry={id:string;started_at:string;last_seen_at:string;ended_at:string|null};
const duration=(seconds:number)=>{const n=Math.max(0,Math.floor(seconds));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,"0")).join(":")};
export default function WorkspaceControls({userId}:{userId:string}){
 const [theme,setTheme]=useState("color");
 const [usage,setUsage]=useState<Usage|null>(null);
 const [syncedAt,setSyncedAt]=useState(0);
 const [now,setNow]=useState(Date.now());
 const [status,setStatus]=useState("Connecting");
 const [historyOpen,setHistoryOpen]=useState(false);
 const [history,setHistory]=useState<Entry[]>([]);
 const [historyError,setHistoryError]=useState("");
 useEffect(()=>{
  const key="claim360-theme:"+userId;
  let preference="color";
  try{const saved=localStorage.getItem(key);if(saved&&["color","mono","mono-dark"].includes(saved))preference=saved}catch{}
  setTheme(preference);document.documentElement.dataset.crmTheme=preference;
  return()=>{delete document.documentElement.dataset.crmTheme};
 },[userId]);
 const changeTheme=(value:string)=>{setTheme(value);document.documentElement.dataset.crmTheme=value;try{localStorage.setItem("claim360-theme:"+userId,value)}catch{}};
 useEffect(()=>{
  let active=true,busy=false;
  const heartbeat=async()=>{
   if(busy||!active)return;
   if(!navigator.onLine){setStatus("Offline");return}
   busy=true;
   try{
    const {data,error}=await supabase.rpc("crm_usage_tick",{p_end:false});
    if(active){if(error)setStatus("Sync failed");else{setUsage(data as Usage);setSyncedAt(Date.now());setStatus("Synced")}}
   }catch{if(active)setStatus("Sync failed")}finally{busy=false}
  };
  const offline=()=>setStatus("Offline");
  const visible=()=>{if(document.visibilityState==="visible")void heartbeat()};
  void heartbeat();
  const sync=setInterval(()=>void heartbeat(),30000);
  const clock=setInterval(()=>setNow(Date.now()),1000);
  window.addEventListener("online",heartbeat);window.addEventListener("offline",offline);document.addEventListener("visibilitychange",visible);
  return()=>{active=false;clearInterval(sync);clearInterval(clock);window.removeEventListener("online",heartbeat);window.removeEventListener("offline",offline);document.removeEventListener("visibilitychange",visible)};
 },[userId]);
 const delta=status==="Synced"?Math.min(90,Math.max(0,(now-syncedAt)/1000)):0;
 const openHistory=async()=>{
  setHistoryOpen(true);setHistoryError("");
  const {data,error}=await supabase.from("crm_usage_sessions").select("id,started_at,last_seen_at,ended_at").eq("user_id",userId).order("started_at",{ascending:false}).limit(30);
  if(error)setHistoryError(error.message);else setHistory((data||[]) as Entry[]);
 };
 return <div className="workspaceControls">
  <label className="themeControl"><Palette size={15}/><span className="srOnly">CRM theme</span><select aria-label="CRM theme" value={theme} onChange={e=>changeTheme(e.target.value)}><option value="color">Original color</option><option value="mono">Black & white</option><option value="mono-dark">Black & white dark</option></select></label>
  <button type="button" className="usageControl" onClick={()=>void openHistory()} title="View your login hours"><Clock size={16}/><span><b>Session {usage?duration(Number(usage.session_seconds)+delta):"—"}</b><small>Today (IST) {usage?duration(Number(usage.today_seconds)+delta):"—"} · {status}</small></span></button>
  {historyOpen&&<div className="usageBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryOpen(false)}}><section className="usageHistory" role="dialog" aria-modal="true" aria-label="Your login hours"><header><div><h2>Your login hours</h2><p>CRM open time · Asia/Kolkata · Last 30 sessions</p></div><button type="button" className="iconButton" aria-label="Close login hours" onClick={()=>setHistoryOpen(false)}><X size={20}/></button></header><p className="usageExplanation">Updates every 30 seconds. Refreshes and multiple tabs share the same session. Time stops at sign-out or the last successful update if the browser closes or disconnects. These are usage records, not attendance certification.</p>{historyError?<p role="alert">{historyError}</p>:<div className="usageTable"><table><thead><tr><th>Started (IST)</th><th>Last update / logout</th><th>Hours</th></tr></thead><tbody>{history.map(row=><tr key={row.id}><td>{new Date(row.started_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</td><td>{new Date(row.ended_at||row.last_seen_at).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})}</td><td>{duration((Date.parse(row.ended_at||row.last_seen_at)-Date.parse(row.started_at))/1000)}</td></tr>)}</tbody></table>{!history.length&&<p>No usage records yet.</p>}</div>}</section></div>}
 </div>;
}
