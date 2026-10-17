"use client";
import {motion,useReducedMotion} from "motion/react";
import type {ReactNode} from "react";
import {motionTokens} from "@/components/arc/lib/motion-tokens";

export function PageTransition({view,className,children}:{view:string;className?:string;children:ReactNode}){
 const reduced=useReducedMotion();
 return <motion.div key={view} className={className} initial={reduced?false:{opacity:0,y:7}} animate={{opacity:1,y:0}} transition={{duration:reduced?0:.22,ease:[...motionTokens.ease.enter]}}>{children}</motion.div>;
}

export function NavigationHighlight(){
 const reduced=useReducedMotion();
 return <motion.span className="navigationHighlight" layoutId="workspace-navigation" transition={reduced?{duration:0}:motionTokens.spring.morph} aria-hidden="true"/>;
}
