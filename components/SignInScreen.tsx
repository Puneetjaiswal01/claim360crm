"use client";
import {useState} from "react";
import {InlineSpinner} from "./LoadingStates";
import {ArrowRight,ArrowUpRight,Check,Eye,EyeOff,Layers3,LockKeyhole,Mail,ShieldCheck} from "lucide-react";

type Props={
 email:string;password:string;error:string;busy:boolean;local:boolean;
 onEmail:(value:string)=>void;onPassword:(value:string)=>void;onLogin:(signup:boolean)=>Promise<void>;
};

export default function SignInScreen({email,password,error,busy,local,onEmail,onPassword,onLogin}:Props){
 const [showPassword,setShowPassword]=useState(false);
 return <main className="signinPage">
  <section className="signinStory" aria-label="About Claim 360">
   <a className="signinBrand" href="/" aria-label="Claim 360 home"><img src="/claim360-logo.svg" alt=""/><span>claim<span className="brandNumber">360</span><small>SHAREHOLDER RECOVERY CRM</small></span></a>
   <div className="signinStoryContent">
    <div className="signinKicker"><span/> BUILT AROUND YOUR NEXT MOVE</div>
    <h1>Every claim.<br/>A clearer way<br/><span>forward.</span></h1>
    <p>Bring your shareholders, conversations, and recovery pipeline into one focused workspace.</p>
    <div className="signinJourney" aria-label="Recovery workflow">
     <div><span>01</span><Layers3 size={21}/><strong>Organize</strong><small>Every record in place</small></div>
     <ArrowRight className="journeyArrow" size={18} aria-hidden="true"/>
     <div><span>02</span><Mail size={21}/><strong>Connect</strong><small>Keep the next step clear</small></div>
     <ArrowRight className="journeyArrow" size={18} aria-hidden="true"/>
     <div><span>03</span><ShieldCheck size={21}/><strong>Recover</strong><small>Move every case ahead</small></div>
    </div>
   </div>
   <div className="signinStoryFooter"><span><span className="storyFooterMark"/> CLAIM 360 ENTERPRISE</span><span>One team. One workspace.</span></div>
   <div className="signinOrbit orbitOne" aria-hidden="true"/><div className="signinOrbit orbitTwo" aria-hidden="true"/>
  </section>
  <section className="signinFormPanel" aria-label="Sign in">
   <div className="signinPanelMeta"><span>OPERATIONS WORKSPACE</span><span><ShieldCheck size={14}/> {local?"Local development":"Team access"}</span></div>
   <div className="signinFormWrap">
    <div className="signinFormIcon"><ArrowUpRight size={27}/></div>
    <p className="signinEyebrow">WELCOME TO CLAIM 360</p>
    <h2>Good to have you back.</h2>
    <p className="signinIntro">Sign in to pick up where you left off.</p>
    {local&&<div className="signinLocalNote"><span/><span>Local workspace<small>Your development data stays on this computer.</small></span></div>}
    <form onSubmit={event=>{event.preventDefault();void onLogin(false)}} aria-busy={busy}>
     <label htmlFor="signin-email">Work email</label>
     <div className="signinInput"><Mail size={17} aria-hidden="true"/><input id="signin-email" type="email" required autoComplete="username" value={email} onChange={event=>onEmail(event.target.value)} placeholder="you@company.com" aria-invalid={!!error} aria-describedby={error?"auth-error":undefined}/></div>
     <label htmlFor="signin-password">Password</label>
     <div className="signinInput"><LockKeyhole size={17} aria-hidden="true"/><input id="signin-password" type={showPassword?"text":"password"} required autoComplete="current-password" value={password} onChange={event=>onPassword(event.target.value)} placeholder="Enter your password" aria-invalid={!!error} aria-describedby={error?"auth-error":undefined}/><button type="button" aria-label={showPassword?"Hide password":"Show password"} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></div>
     {error&&<div id="auth-error" className="signinError" role="alert">{error}</div>}
     <button type="submit" className="signinSubmit" disabled={busy}><span>{busy?"Signing you in…":"Sign in to workspace"}</span>{busy?<InlineSpinner/>:<ArrowRight size={18}/>}</button>
     {!local&&<div className="signinSignup">New to the team?<button type="button" disabled={busy} onClick={event=>{if(event.currentTarget.form?.reportValidity())void onLogin(true)}}>Create an account <ArrowUpRight size={14}/></button></div>}
    </form>
    <div className="signinTrust"><Check size={14}/><span>{local?"Development admin access":"Your account permissions follow you into the workspace."}</span></div>
   </div>
   <footer className="signinPanelFooter"><span>© {new Date().getFullYear()} Claim 360</span><span>Clarity at every stage.</span></footer>
  </section>
 </main>;
}
