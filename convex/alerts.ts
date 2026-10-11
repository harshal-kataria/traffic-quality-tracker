import { query, mutation, internalMutation, internalQuery, type QueryCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { dayWindow, trafficDrops } from "./alertMath";

async function ownedStore(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to view alerts");
  const access = await ctx.db.query("founderStores").withIndex("by_user",q => q.eq("userId",userId)).unique();
  if (!access) throw new Error("This account has no store access");
  return access.storeId;
}
async function inbox(ctx: QueryCtx, storeId: string) {
  return {
    alerts: await ctx.db.query("trafficAlerts").withIndex("by_store_created",q => q.eq("storeId",storeId)).order("desc").take(50),
    check: await ctx.db.query("alertChecks").withIndex("by_store",q => q.eq("storeId",storeId)).unique(),
  };
}
export const list = query({args:{},returns:v.any(),handler: async ctx => inbox(ctx,await ownedStore(ctx))});
export const preview = internalQuery({args:{storeId:v.string()},returns:v.any(),handler: (ctx,args) => inbox(ctx,args.storeId)});

async function evaluate(ctx: MutationCtx, storeId: string) {
  const now = Date.now();
  const window = dayWindow(now);
  const first = await ctx.db.query("visits").withIndex("by_store_time",q => q.eq("storeId",storeId)).first();
  const visits = await ctx.db.query("visits").withIndex("by_store_time",q => q.eq("storeId",storeId).gte("time",window.baselineStart).lt("time",window.end)).take(10001);
  const orders = await ctx.db.query("orders").withIndex("by_store_time",q => q.eq("storeId",storeId).gte("time",window.baselineStart-1800000)).take(10001);
  const status: "over_limit" | "warming_up" | "ready" = visits.length > 10000 || orders.length > 10000 ? "over_limit" : !first || first.time > window.baselineStart ? "warming_up" : "ready";
  const drops = status === "ready" ? trafficDrops(visits,orders,now) : [];
  for (const drop of drops) {
    const key = JSON.stringify([window.day,drop.page,drop.source]);
    const existing = await ctx.db.query("trafficAlerts").withIndex("by_store_key",q => q.eq("storeId",storeId).eq("key",key)).unique();
    if (!existing) await ctx.db.insert("trafficAlerts",{storeId,key,day:window.day,createdAt:now,...drop});
  }
  const fields = {storeId,checkedAt:now,day:window.day,status,count:drops.length};
  const check = await ctx.db.query("alertChecks").withIndex("by_store",q => q.eq("storeId",storeId)).unique();
  if (check) await ctx.db.patch(check._id,fields); else await ctx.db.insert("alertChecks",fields);
  return fields;
}
export const checkNow = mutation({args:{},returns:v.any(),handler: async ctx => evaluate(ctx,await ownedStore(ctx))});
export const checkStore = internalMutation({args:{storeId:v.string()},returns:v.any(),handler: (ctx,args) => evaluate(ctx,args.storeId)});
// Each store check is an independent atomic database job. Page through founder accounts.
export const daily = internalMutation({args:{cursor:v.optional(v.string())},returns:v.null(),handler: async (ctx,args) => {
  const page = await ctx.db.query("founderStores").withIndex("by_store").paginate({numItems:100,cursor:args.cursor ?? null});
  for (const storeId of new Set(page.page.map(access => access.storeId))) await ctx.scheduler.runAfter(0,internal.alerts.checkStore,{storeId});
  if (!page.isDone) await ctx.scheduler.runAfter(0,internal.alerts.daily,{cursor:page.continueCursor});
  return null;
}});

export const verify = internalMutation({args:{},returns:v.any(),handler: async ctx => {
  if (process.env.CONVEX_SITE_URL !== "https://pleasant-bee-1.convex.site") throw new Error("Verification is development-only");
  const storeId = `alerts-proof-${crypto.randomUUID()}`;
  const window = dayWindow(Date.now());
  const visit = {storeId,sessionId:storeId,pageUrl:"https://store.test/product/sunset.html",utm_source:"instagram",utm_medium:null,utm_campaign:null,utm_content:null,source:"instagram",eventName:"page_view" as const};
  try {
    for (let day=0;day<7;day++) for (let i=0;i<20;i++) await ctx.db.insert("visits",{...visit,time:window.baselineStart+day*86400000+i});
    for (let i=0;i<10;i++) await ctx.db.insert("visits",{...visit,time:window.start+i});
    await evaluate(ctx,storeId);
    await evaluate(ctx,storeId);
    const result = await inbox(ctx,storeId);
    if (result.alerts.length !== 1 || result.alerts[0].dropPercent !== 50 || result.alerts[0].previousAverage !== 20 || result.alerts[0].currentVisits !== 10 || result.check?.status !== "ready") throw new Error("Traffic-drop persistence or duplicate protection failed");
    if ((await inbox(ctx,storeId+"-other")).alerts.length) throw new Error("Store isolation failed");
    return {alert:result.alerts[0],duplicateChecksSavedOnce:true,storeIsolation:true,verificationRowsRemoved:true};
  } finally {
    for (const row of await ctx.db.query("visits").withIndex("by_store_time",q=>q.eq("storeId",storeId)).take(200)) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("trafficAlerts").withIndex("by_store_created",q=>q.eq("storeId",storeId)).take(10)) await ctx.db.delete(row._id);
    const check = await ctx.db.query("alertChecks").withIndex("by_store",q=>q.eq("storeId",storeId)).unique();
    if (check) await ctx.db.delete(check._id);
  }
}});
