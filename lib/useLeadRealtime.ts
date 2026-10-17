"use client";
import {useEffect,useRef,useState} from "react";
import {supabase,localDevelopment} from "@/lib/supabase";
export default function useLeadRealtime(userId:string|undefined,onRefresh:()=>void){
 const refresh=useRef(onRefresh);refresh.current=onRefresh;
 const [state,setState]=useState<"connecting"|"live"|"reconnecting">("connecting");
 useEffect(()=>{
  if(!userId)return;
  if(localDevelopment){setState("live");return;}
  let closed=false,connected=false,pending:ReturnType<typeof setTimeout>|undefined;
  const schedule=()=>{if(closed||pending)return;pending=setTimeout(()=>{pending=undefined;if(!closed)refresh.current()},250)};
  const channel=supabase.channel("crm-leads-"+userId).on("postgres_changes",{event:"*",schema:"public",table:"leads"},schedule).subscribe(status=>{
   if(closed)return;connected=status==="SUBSCRIBED";setState(connected?"live":"reconnecting");if(connected)schedule();
  });
  const recover=()=>{if(document.visibilityState==="visible")schedule()};
  window.addEventListener("focus",recover);window.addEventListener("online",recover);document.addEventListener("visibilitychange",recover);
  const fallback=setInterval(()=>{if(!connected&&document.visibilityState==="visible")schedule()},15000);
  return()=>{closed=true;if(pending)clearTimeout(pending);clearInterval(fallback);window.removeEventListener("focus",recover);window.removeEventListener("online",recover);document.removeEventListener("visibilitychange",recover);void supabase.removeChannel(channel)};
 },[userId]);
 return state;
}
