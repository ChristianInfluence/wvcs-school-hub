"use client";
import {createContext,useContext} from "react";
import type {Account,CashEvent,ForecastDocument,Scenario} from "../../../../supabase/functions/_shared/financeForecast/model.ts";
export type View="overview"|"forecast"|"expenses"|"income"|"board"|"imports"|"connections"|"settings";
export interface WorkspaceContextValue {
  request:ForecastApi;doc:ForecastDocument;revision:number;demo:boolean;saving:boolean;signedIn:boolean;scenario:Scenario;
  setScenario:(s:Scenario)=>void;notify:(s:string)=>void;go:(v:View)=>void;
  persist:(next:ForecastDocument)=>Promise<void>;
  imported:(data:any)=>void;editAccount:(a:Account)=>void;editEvent:(e:CashEvent)=>void;
  overrideMonth:(accountId:string,month:string)=>void;
}
export const WorkspaceContext=createContext<WorkspaceContextValue|null>(null);
export function useWorkspace(){const ctx=useContext(WorkspaceContext);if(!ctx)throw new Error("Forecast workspace is missing");return ctx;}
export type ForecastApi=(url:string,options?:RequestInit)=>Promise<any>;
export function download(filename:string,text:string,type="text/plain"){
  const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const scenarioNames:Record<Scenario,string>={expected:"Expected",cautious:"Cautious",optimistic:"Optimistic",secured:"Unconfirmed excluded"};
export const modeNames:Record<Account["mode"],string>={seasonal:"Matching historical month",average:"Two-year seasonal average",fixed:"Fixed monthly amount",schedule:"Scheduled items",off:"Excluded"};
export function newId(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export const newAccount=(kind:"income"|"expense"):Account=>({id:newId(),name:"",kind,mode:kind==="income"?"schedule":"seasonal",percentBps:0,deltaCents:0,fixedCents:0,paymentDay:15,fund:"operating",note:""});
