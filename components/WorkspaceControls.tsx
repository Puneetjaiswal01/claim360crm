"use client";
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import {Clock,X} from "lucide-react";
import SegmentedControl from "./arc/segmented-control/segmented-control";
import {supabase} from "@/lib/supabase";

type Usage={session_seconds:number;today_seconds:number;started_at:string;server_time:string};
type Entry={day:string;open_seconds:number;active_seconds:number};
const duration=(seconds:number)=>{const n=Math.max(0,Math.floor(seconds));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,"0")).join(":")};
export default function WorkspaceControls({userId}:{userId:string}){
 const [theme,setTheme]=useState("color");
 const [usage,setUsage]=useState<Usage|null>(null);
 const lastInteraction=useRef(Date.now());
 const [activeToday,setActiveToday]=useState(0),[activeSynced,setActiveSynced]=useState(0),[idle,setIdle]=useState(false);
 useEffect(()=>{const interact=()=>{lastInteraction.current=Date.now()};const visible=()=>{if(document.visibilityState==="visible")interact()};for(const event of ["pointerdown","pointermove","keydown","scroll"])window.addEventListener(event,interact,{passive:true});document.addEventListener("visibilitychange",visible);return()=>{for(const event of ["pointerdown","pointermove","keydown","scroll"])window.removeEventListener(event,interact);document.removeEventListener("visibilitychange",visible)};},[]);
 const [syncedAt,setSyncedAt]=useState(0);
 const [now,setNow]=useState(Date.now());
 const [status,setStatus]=useState("Connecting");
 const [historyOpen,setHistoryOpen]=useState(false);
 const [history,setHistory]=useState<Entry[]>([]);
 const [historyError,setHistoryError]=useState("");
 const [historyLoading,setHistoryLoading]=useState(false);
 const historyRef=useRef<HTMLElement>(null);
 const historyCloseRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!historyOpen)return;
  const previousFocus=document.activeElement as HTMLElement|null;
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow="hidden";
  historyCloseRef.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==="Escape"){event.preventDefault();setHistoryOpen(false);return;}
   if(event.key!=="Tab")return;
   const controls=historyRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]');
   if(!controls?.length)return;
   const first=controls[0],last=controls[controls.length-1];
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };
  document.addEventListener("keydown",keydown);
  return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener("keydown",keydown);if(previousFocus&&document.contains(previousFocus))previousFocus.focus();};
 },[historyOpen]);
 useEffect(()=>{
  const key="claim360-theme:"+userId;
  let preference="color";
  try{const saved=localStorage.getItem(key);if(saved){const mapped=saved==="mono"||saved==="light"?"color":saved==="mono-dark"?"dark":saved;if(["color","dark"].includes(mapped))preference=mapped}}catch{}
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
    const engaged=document.visibilityState==="visible"&&Date.now()-lastInteraction.current<300000;
    const [{data,error},activeResult]=await Promise.all([supabase.rpc("crm_usage_tick",{p_end:false}),supabase.rpc("crm_active_tick",{p_active:engaged})]);
    if(active){if(error||activeResult.error)setStatus("Sync failed");else{setUsage(data as Usage);setSyncedAt(Date.now());setActiveToday(Number(activeResult.data?.active_today_seconds)||0);setActiveSynced(Date.now());setIdle(!engaged);setStatus("Synced")}}
   }catch{if(active)setStatus("Sync failed")}finally{busy=false}
  };
  const offline=()=>setStatus("Offline");
  const visible=()=>{if(document.visibilityState==="visible")void heartbeat()};
  void heartbeat();
  const sync=setInterval(()=>void heartbeat(),30000);
  const clock=setInterval(()=>{setNow(Date.now());setIdle(document.visibilityState!=="visible"||Date.now()-lastInteraction.current>=300000)},1000);
  window.addEventListener("online",heartbeat);window.addEventListener("offline",offline);document.addEventListener("visibilitychange",visible);
  return()=>{active=false;clearInterval(sync);clearInterval(clock);window.removeEventListener("online",heartbeat);window.removeEventListener("offline",offline);document.removeEventListener("visibilitychange",visible)};
 },[userId]);
 const delta=status==="Synced"?Math.min(90,Math.max(0,(now-syncedAt)/1000)):0;
 const activeDelta=status==="Synced"&&!idle?Math.min(30,Math.max(0,(now-activeSynced)/1000)):0;
 useEffect(()=>{
  if(!historyOpen)return;let cancelled=false;
  const refresh=async()=>{setHistoryError("");setHistoryLoading(true);try{
   const {data,error}=await supabase.rpc("crm_daily_usage",{p_days:30});
   if(cancelled)return;if(error)setHistoryError("Could not load daily hours. Please close and reopen this window.");else setHistory((data||[]) as Entry[]);
  }catch{if(!cancelled)setHistoryError("Could not connect. Please try again.");}finally{if(!cancelled)setHistoryLoading(false)}};
  void refresh();const timer=setInterval(()=>void refresh(),30000);return()=>{cancelled=true;clearInterval(timer)};
 },[historyOpen,userId]);
 const openHistory=()=>{setHistory([]);setHistoryOpen(true);setHistoryError("");};
 return <div className="workspaceControls">
  <div className="appearanceSwitch"><SegmentedControl label="CRM appearance" value={theme} onValueChange={changeTheme} options={[{value:"color",label:"Light"},{value:"dark",label:"Dark"}]}/></div>
  <button type="button" className="usageControl" onClick={()=>void openHistory()} title="View your login hours" aria-label="View your login hours"><Clock size={16}/><span><b>Today {usage?duration(Number(usage.today_seconds)+delta):"—"}</b><small>Active {duration(activeToday+activeDelta)}{idle?" · Paused":""}</small><small>IST · {status}</small></span></button>
  {historyOpen&&createPortal(<div className="usageBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryOpen(false)}}><section ref={historyRef} className="usageHistory" role="dialog" aria-modal="true" aria-labelledby="usageHistoryTitle" aria-describedby="usageHistoryExplanation"><header><div><h2 id="usageHistoryTitle">Your login hours</h2><p>Daily totals · Asia/Kolkata · Last 30 days</p></div><button ref={historyCloseRef} type="button" className="iconButton" aria-label="Close login hours" onClick={()=>setHistoryOpen(false)}><X size={20}/></button></header><div className="usageHistoryContent" tabIndex={0} role="region" aria-label="Daily login hours"><p id="usageHistoryExplanation" className="usageExplanation">One total per date, updated every 30 seconds. Open hours combine all tabs without double-counting. Active hours pause after five minutes without interaction. Days use India Standard Time (IST).</p>{historyError?<p role="alert">{historyError}</p>:<div className="usageTable"><table><thead><tr><th>Date (IST)</th><th>Open hours</th><th>Active hours</th></tr></thead><tbody>{history.map(row=><tr key={row.day}><td>{new Date(row.day+"T12:00:00+05:30").toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"medium"})}</td><td>{duration(Number(row.open_seconds))}</td><td>{duration(Number(row.active_seconds))}</td></tr>)}</tbody></table>{historyLoading&&!history.length?<p role="status">Loading daily hours…</p>:!history.length&&<p>No daily usage records yet.</p>}</div>}</div></section></div>,document.body)}
 </div>;
}
