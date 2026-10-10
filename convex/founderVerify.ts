import { internalAction, internalMutation } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

function developmentOnly() {
  if (process.env.CONVEX_SITE_URL !== "https://pleasant-bee-1.convex.site") throw new Error("Verification is allowed only in the development database");
}
export const cleanup = internalMutation({
  args: { sessionId: v.string(), visitorId: v.string() }, returns: v.null(),
  handler: async (ctx,args) => {
    developmentOnly();
    if (!args.sessionId.startsWith("founder-proof-") || !args.visitorId.startsWith("founder-proof-")) throw new Error("Only verification rows can be removed");
    for (const table of ["visits", "orders", "sessions"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_store_session",q => q.eq("storeId","chasma-kart").eq("sessionId",args.sessionId)).take(10);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const visitor = await ctx.db.query("visitors").withIndex("by_store_visitor",q => q.eq("storeId","chasma-kart").eq("visitorId",args.visitorId)).unique();
    if (visitor) await ctx.db.delete(visitor._id);
    return null;
  },
});
export const run = internalAction({ args: {}, returns: v.any(), handler: async (ctx): Promise<any> => {
  developmentOnly();
  const unique = `founder-proof-${crypto.randomUUID()}`;
  const context = {storeId:"chasma-kart",sessionId:unique,visitorId:unique,source:"instagram",utm_source:"instagram",utm_medium:"paid_social",utm_campaign:"founder-verification",utm_content:null,browser:"browser",userAgent:"Mozilla/5.0"};
  const select = (rows: any[]) => rows.find(row => row.product === "Sunset Club" && row.source === "instagram" && row.currency === "INR") ?? {product:"Sunset Club",source:"instagram",currency:"INR",visits:0,orders:0,orderValuePaise:0};
  const before = select((await ctx.runQuery(internal.founder.preview,{storeId:"chasma-kart"})).rows);
  let after;
  let savedOrder;
  try {
    await ctx.runMutation(api.tracking.visit,{...context,eventId:crypto.randomUUID(),eventName:"page_view",pageUrl:"https://store.test/chasma-kart/product/sunset-club.html"});
    const args = {...context,eventId:crypto.randomUUID(),orderId:unique,orderValue:149900,currency:"INR",items:[{name:"Sunset Club",quantity:1,pricePaise:149900}],paymentMethod:"prepaid" as const,couponCode:null,isTest:false,isStaff:false};
    const id = await ctx.runMutation(api.tracking.order,args);
    const replay = await ctx.runMutation(api.tracking.order,{...args,eventId:crypto.randomUUID()});
    if (!id || id !== replay) throw new Error("Duplicate-order protection failed");
    after = select((await ctx.runQuery(internal.founder.preview,{storeId:"chasma-kart"})).rows);
    const raw = await ctx.runQuery(internal.tracking.rowsForSession,{storeId:"chasma-kart",sessionId:unique});
    savedOrder = raw.orders[0];
    if (raw.orders.length !== 1 || savedOrder.isTest || savedOrder.excludedFromMetrics || after.visits !== before.visits+1 || after.orders !== before.orders+1 || after.orderValuePaise !== before.orderValuePaise+149900) throw new Error("Non-test order totals did not increase correctly");
  } finally {
    await ctx.runMutation(internal.founderVerify.cleanup,{sessionId:unique,visitorId:unique});
  }
  const cleaned = select((await ctx.runQuery(internal.founder.preview,{storeId:"chasma-kart"})).rows);
  const remaining = await ctx.runQuery(internal.tracking.rowsForSession,{storeId:"chasma-kart",sessionId:unique});
  if (remaining.orders.length || remaining.visits.length || remaining.sessions.length || JSON.stringify(cleaned) !== JSON.stringify(before)) throw new Error("Verification cleanup failed");
  return {before,after,cleaned,savedOrder,duplicateSavedOnce:true,verificationRowsRemoved:true};
}});
