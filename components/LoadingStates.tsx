"use client";
import {LoaderCircle} from "lucide-react";
import {Skeleton} from "@/components/arc/skeleton/skeleton";
import {AnimatedCounter} from "@/components/arc/animated-counter/animated-counter";

export function InlineSpinner(){return <LoaderCircle size={17} className="inlineSpinner" aria-hidden="true"/>;}

export function MetricValue({value,ready=true}:{value:number;ready?:boolean}){
 return <span className="metricValue" aria-busy={!ready}>{ready?<AnimatedCounter value={value} locale="en-IN"/>:<span className="metricPlaceholder"><Skeleton lines={1} label="Loading metric"/></span>}</span>;
}

export function ListSkeleton({label="Loading records",rows=3}:{label?:string;rows?:number}){
 return <div className="listSkeleton" role="status" aria-label={label} aria-busy="true"><div aria-hidden="true">{Array.from({length:rows},(_,index)=><div className="listSkeletonRow" key={index}><Skeleton lines={2} avatar/><span className="skeletonColumn"><Skeleton lines={1}/></span><span className="skeletonColumn"><Skeleton lines={1}/></span></div>)}</div></div>;
}

export function WorkspaceLoading(){
 return <main className="workspaceLoading" role="status" aria-label="Preparing your workspace" aria-busy="true"><aside aria-hidden="true"><img src="/claim360-logo.svg" alt=""/><div className="loadingNavItems">{Array.from({length:7},(_,index)=><Skeleton lines={1} key={index}/>)}</div></aside><section><header><span>Claim 360</span><InlineSpinner/></header><div className="loadingCanvas" aria-hidden="true"><Skeleton lines={2}/><div className="loadingMetricGrid">{Array.from({length:4},(_,index)=><div key={index}><Skeleton lines={3}/></div>)}</div><div className="loadingTable"><Skeleton lines={5}/></div></div><span className="srOnly">Preparing your workspace</span></section></main>;
}
