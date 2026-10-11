import {query,internalQuery,internalMutation,type QueryCtx} from "./_generated/server";
import {getAuthUserId} from "@convex-dev/auth/server";
import {v} from "convex/values";
import {analyze} from "./insightMath";
async function report(ctx:QueryCtx,storeId:string){
  const until=Date.now(),from=until-30*86400000;
  const sessions=await ctx.db.query("sessions").withIndex("by_store_started",q=>q.eq("storeId",storeId).gte("startedAt",from)).take(10001);
  // Extra 30 minutes includes an order that flags a session close to the boundary.
  const visits=await ctx.db.query("visits").withIndex("by_store_time",q=>q.eq("storeId",storeId).gte("time",from-1800000)).take(10001);
  const orders=await ctx.db.query("orders").withIndex("by_store_time",q=>q.eq("storeId",storeId).gte("time",from-1800000)).take(10001);
  if(sessions.length>10000||visits.length>10000||orders.length>10000)throw new Error("Analysis exceeds the current data limit. No partial advice is shown.");
  return {storeId,from,until,...analyze(sessions,visits,orders)};
}
export const overview=query({args:{},returns:v.any(),handler:async ctx=>{
  const userId=await getAuthUserId(ctx);if(!userId)throw new Error("Sign in to view analysis");
  const access=await ctx.db.query("founderStores").withIndex("by_user",q=>q.eq("userId",userId)).unique();if(!access)throw new Error("This account has no store access");
  return report(ctx,access.storeId);
}});
export const preview=internalQuery({args:{storeId:v.string()},returns:v.any(),handler:(ctx,args)=>report(ctx,args.storeId)});
export const verify=internalMutation({args:{},returns:v.any(),handler:async ctx=>{
  if(process.env.CONVEX_SITE_URL!=="https://pleasant-bee-1.convex.site")throw new Error("Verification is development-only");
  const storeId=`insights-proof-${crypto.randomUUID()}`,now=Date.now();
  const ids:Array<import("./_generated/dataModel").Id<"sessions"|"visits"|"orders">>=[];
  try{
    for(let i=0;i<200;i++){
      const sessionId=`${storeId}-${i}`,source=i<100?"instagram":"google",time=now-100000;
      ids.push(await ctx.db.insert("sessions",{storeId,sessionId,source,startedAt:time,sessionDay:"2026-10-11",lastSeenAt:time+60000,visibleTimeMs:60000,lastHeartbeatAt:time+60000,attribution:null}));
      const base={storeId,sessionId,source,pageUrl:"https://store.test/product/sunset.html",utm_source:source,utm_medium:"paid",utm_campaign:"traveler",utm_content:null};
      ids.push(await ctx.db.insert("visits",{...base,time,eventName:"page_view"}));
      if(i<20){ids.push(await ctx.db.insert("visits",{...base,time:time+1000,eventName:"add_to_cart"}));ids.push(await ctx.db.insert("visits",{...base,time:time+2000,eventName:"begin_checkout"}));}
      if(i>=100&&i<110)ids.push(await ctx.db.insert("orders",{storeId,sessionId,source,time:time+3000,orderValue:10000,productNames:["Sunset"],currency:"INR",paymentMethod:"prepaid",status:"paid"}));
    }
    const result=await report(ctx,storeId);
    if(result.eligibleSessions!==200||!result.recommendations.some(x=>x.kind==="checkout")||!result.recommendations.some(x=>x.kind==="source"&&x.subject==="google"))throw new Error("Saved analysis or recommendation proof failed");
    const isolated=await report(ctx,storeId+"-other");if(isolated.eligibleSessions||isolated.recommendations.length)throw new Error("Analysis store isolation failed");
    return {eligibleSessions:result.eligibleSessions,sources:result.sources,recommendations:result.recommendations,storeIsolation:true,verificationRowsRemoved:true};
  }finally{for(const id of ids)await ctx.db.delete(id);}
}});
