"use client";
import {ArrowRight,ArrowUpRight,CalendarClock,Plus,Users} from "lucide-react";
import type {CSSProperties} from "react";

type Props={total:number;converted:number;followups:number;counts:Record<string,number>;ready:boolean;admin:boolean;teamSize:number;onCreate:()=>void;onBrowse:(status:string)=>void;onTeam:()=>void};
const palette=["#5278b8","#d59b48","#3e9d97","#255d58","#dce3e9"];
export default function DashboardInsights({total,converted,followups,counts,ready,admin,teamSize,onCreate,onBrowse,onTeam}:Props){
 const known=["UNTOUCHED","FOLLOW UP","POTENTIAL","CONVERTED"];
 const categories=[...known.map((status,index)=>({status,label:["Untouched","Follow-ups","Potential","Converted"][index],count:counts[status]||0,color:palette[index]})),{status:"",label:"Other stages",count:Math.max(0,total-known.reduce((sum,status)=>sum+(counts[status]||0),0)),color:palette[4]}];
 let end=0;
 const gradient=categories.map(category=>{const start=end;end+=total?category.count/total*100:0;return `${category.color} ${start}% ${end}%`;}).join(",");
 const rate=total?Math.round(converted/total*100):0;
 return <div className="overviewInsights">
  <section className="pipelineCard" aria-labelledby="pipeline-title">
   <header className="insightHeading"><div><span className="sectionEyebrow">RECOVERY OVERVIEW</span><h2 id="pipeline-title">Shareholder recovery distribution</h2></div><button className="insightLink" onClick={()=>onBrowse("")} aria-label="View all pipeline leads"><ArrowUpRight size={19}/></button></header>
   <div className="pipelineBody">
    <div className="pipelineRing" style={{"--pipeline-fill":ready&&total?`conic-gradient(${gradient})`:"#e9edf1"} as CSSProperties} role="img" aria-label={ready?(total?`${rate}% of ${total} leads converted`:"No leads in the pipeline yet"):"Loading pipeline totals"}>
     <div><strong>{ready?(total?`${rate}%`:"—"):"…"}</strong><span>{total?"conversion rate":"Awaiting first lead"}</span></div>
    </div>
    <div className="pipelineLegend">{categories.map(category=><button key={category.label} disabled={!category.status} onClick={()=>onBrowse(category.status)}><span className="pipelineSwatch" style={{background:category.color}}/><span>{category.label}</span><strong>{ready?category.count.toLocaleString("en-IN"):"…"}</strong>{category.status&&<ArrowUpRight size={12}/>}</button>)}</div>
   </div>
  </section>
  <section className="nextStepsCard" aria-labelledby="next-steps-title">
   <header className="insightHeading"><div><span className="sectionEyebrow">YOUR NEXT MOVE</span><h2 id="next-steps-title">Operational actions</h2></div><span className="nextStepsMark"><ArrowUpRight size={22}/></span></header>
   <p>Direct access to your records, follow-ups, and team.</p>
   <div className="nextStepActions">
    <button onClick={()=>onBrowse("FOLLOW UP")}><span className="nextStepIcon"><CalendarClock size={17}/></span><span><strong>Review follow-ups</strong><small>{ready?`${followups.toLocaleString("en-IN")} leads in the follow-up stage`:"Loading your pipeline…"}</small></span><ArrowRight size={17}/></button>
    <button onClick={onCreate}><span className="nextStepIcon"><Plus size={18}/></span><span><strong>Add a shareholder</strong><small>Start the next recovery opportunity</small></span><ArrowRight size={17}/></button>
    <button onClick={admin?onTeam:()=>onBrowse("")}><span className="nextStepIcon"><Users size={17}/></span><span><strong>{admin?"Open team workspace":"Explore your leads"}</strong><small>{admin?`${teamSize} active team ${teamSize===1?"member":"members"}`:"All your assigned records, together"}</small></span><ArrowRight size={17}/></button>
   </div>
  </section>
 </div>;
}
