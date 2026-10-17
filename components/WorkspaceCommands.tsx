"use client";
import {useEffect,useRef,useState} from "react";
import {Search} from "lucide-react";
import {CommandPalette,type CommandItem} from "@/components/arc/command-palette/command-palette";

export default function WorkspaceCommands({items,onSelect,disabled=false}:{items:CommandItem[];onSelect:(item:CommandItem)=>void;disabled?:boolean}){
 const [open,setOpen]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const previous=useRef<HTMLElement|null>(null);
 const show=()=>{if(disabled)return;previous.current=document.activeElement as HTMLElement|null;setOpen(true)};
 const close=()=>{dialog.current?.close();setOpen(false)};
 useEffect(()=>{
  const shortcut=(event:KeyboardEvent)=>{
   if(disabled||event.repeat||!(event.ctrlKey||event.metaKey)||event.key.toLowerCase()!=="k")return;
   if(document.querySelector('[aria-modal="true"],dialog[open]')&&!dialog.current?.open)return;
   event.preventDefault();if(!dialog.current?.open){previous.current=document.activeElement as HTMLElement|null;setOpen(true)}
  };
  document.addEventListener("keydown",shortcut);return()=>document.removeEventListener("keydown",shortcut);
 },[disabled]);
 useEffect(()=>{const node=dialog.current;if(!node)return;if(open&&!disabled&&!node.open)node.showModal();else if((!open||disabled)&&node.open){node.close();setOpen(false)}},[open,disabled]);
 useEffect(()=>()=>{dialog.current?.close()},[]);
 return <>
  <button ref={trigger} type="button" className="commandTrigger" aria-label="Open quick navigation" aria-haspopup="dialog" title="Quick navigation (Ctrl+K)" disabled={disabled} onClick={show}><Search size={16}/><span>Jump to a page…</span><kbd>Ctrl K</kbd></button>
  <dialog ref={dialog} className="commandDialog" aria-label="Workspace quick navigation" onCancel={event=>{event.preventDefault();close()}} onClose={()=>{setOpen(false);if(document.querySelector('[aria-modal="true"],dialog[open]'))return;const target=previous.current?.isConnected?previous.current:trigger.current;target?.focus()}} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close()}}}>
   {open&&<CommandPalette items={items} label="Find a workspace page or action" placeholder="Search pages and actions…" autoFocus onClose={close} onSelect={item=>{close();onSelect(item)}}/>}
   <div className="commandFooter"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
  </dialog>
 </>;
}
