import {internalAction,internalMutation,internalQuery,type MutationCtx} from "./_generated/server";
import {internal} from "./_generated/api";
import {v} from "convex/values";
import {digest,retryAllowed} from "./emailMath";

async function prepareDigest(ctx:MutationCtx,args:{storeId:string;day:string}){
  const now=Date.now();
  const existing=await ctx.db.query("alertEmails").withIndex("by_store_day",q=>q.eq("storeId",args.storeId).eq("day",args.day)).unique();
  if(existing){if(!retryAllowed(existing,now))return null;await ctx.db.patch(existing._id,{status:"pending",updatedAt:now});return {id:existing._id,payload:existing.payload};}
  const check=await ctx.db.query("alertChecks").withIndex("by_store",q=>q.eq("storeId",args.storeId)).unique();
  if(!check||check.day!==args.day)return null;
  const alerts=await ctx.db.query("trafficAlerts").withIndex("by_store_day",q=>q.eq("storeId",args.storeId).eq("day",args.day)).take(1001);
  // Never silently truncate an email's alert list.
  if(alerts.length>1000)throw new Error("Too many alerts for the email digest");
  const payload=digest(check,alerts);
  const id=await ctx.db.insert("alertEmails",{...args,createdAt:now,updatedAt:now,status:"pending",payload});return {id,payload};
}
export const prepare=internalMutation({args:{storeId:v.string(),day:v.string()},returns:v.any(),handler:prepareDigest});
export const finish=internalMutation({args:{id:v.id("alertEmails"),providerId:v.optional(v.string()),error:v.optional(v.string())},returns:v.null(),handler:async(ctx,args)=>{
  const row=await ctx.db.get(args.id);if(!row||row.status==="sent")return null;
  await ctx.db.patch(args.id,{status:args.error?"failed":"sent",updatedAt:Date.now(),...(args.error?{error:args.error}:{providerId:args.providerId,error:undefined})});return null;
}});
export const status=internalQuery({args:{storeId:v.string(),day:v.string()},returns:v.any(),handler:async(ctx,args)=>{
  const row=await ctx.db.query("alertEmails").withIndex("by_store_day",q=>q.eq("storeId",args.storeId).eq("day",args.day)).unique();
  return {configured:Boolean(process.env.RESEND_API_KEY&&process.env.ALERT_EMAIL_FROM&&process.env.ALERT_EMAIL_TO),delivery:row?{status:row.status,providerId:row.providerId??null,error:row.error??null}:null};
}});
export const send=internalAction({args:{storeId:v.string(),day:v.string(),attempt:v.optional(v.number())},returns:v.null(),handler:async(ctx,args)=>{
  const key=process.env.RESEND_API_KEY,from=process.env.ALERT_EMAIL_FROM,to=process.env.ALERT_EMAIL_TO;
  // Until multi-store email settings exist, these private settings belong only to ChasmaKart.
  if(args.storeId!=="chasma-kart"||!key||!from||!to)return null;
  const prepared=await ctx.runMutation(internal.alertEmail.prepare,{storeId:args.storeId,day:args.day});if(!prepared)return null;
  try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`traffic-digest/${args.storeId}/${args.day}`},body:JSON.stringify({from,to:[to],subject:`ChasmaKart traffic · ${args.day}`,text:prepared.payload}),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw new Error(`Email service returned HTTP ${response.status}`);
    const data=await response.json();if(typeof data.id!=="string")throw new Error("Email service did not return a message ID");
    await ctx.runMutation(internal.alertEmail.finish,{id:prepared.id,providerId:data.id});
  }catch{
    await ctx.runMutation(internal.alertEmail.finish,{id:prepared.id,error:"Email send failed. Check the sender domain, service key and sending limit in Convex settings."});
    if((args.attempt??0)<2)await ctx.scheduler.runAfter(600000,internal.alertEmail.send,{...args,attempt:(args.attempt??0)+1});
  }
  return null;
}});

export const verify=internalMutation({args:{},returns:v.any(),handler:async ctx=>{
  if(process.env.CONVEX_SITE_URL!=="https://pleasant-bee-1.convex.site")throw new Error("Verification is development-only");
  const storeId=`email-proof-${crypto.randomUUID()}`,day="2026-10-10";
  const checkId=await ctx.db.insert("alertChecks",{storeId,day,checkedAt:Date.now(),status:"warming_up",count:0});
  try{
    const first=await prepareDigest(ctx,{storeId,day}),duplicate=await prepareDigest(ctx,{storeId,day});
    if(!first||duplicate!==null)throw new Error("Email claim duplicate protection failed");
    await ctx.db.patch(first.id,{status:"sent",providerId:"development-proof-only"});
    if(await prepareDigest(ctx,{storeId,day})!==null)throw new Error("Accepted email was prepared twice");
    return {oneDigestSaved:true,repeatedClaimSkipped:true,sentDigestSkipped:true,noEmailSent:true,verificationRowsRemoved:true};
  }finally{
    const row=await ctx.db.query("alertEmails").withIndex("by_store_day",q=>q.eq("storeId",storeId).eq("day",day)).unique();
    if(row)await ctx.db.delete(row._id);await ctx.db.delete(checkId);
  }
}});
