import { query, internalQuery, internalAction, internalMutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { createAccount, getAuthUserId } from "@convex-dev/auth/server";
import { summarize, summarizeSessions } from "./founderMath";

const result = v.object({ storeId: v.string(), from: v.number(), until: v.number(), excludedOrders: v.number(), rows: v.array(v.object({ product: v.string(), source: v.string(), visits: v.number(), orders: v.number(), orderValuePaise: v.number(), currency: v.string() })),
  sourceRows: v.array(v.object({ source: v.string(), sessions: v.number(), visibleTimeMs: v.number(), cartSessions: v.number(), checkoutSessions: v.number(), purchasingSessions: v.number(), cartPurchasingSessions: v.number(), averageTimeMs: v.number(), addToCartRate: v.number(), purchaseRate: v.number(), cartToPurchaseRate: v.union(v.number(), v.null()) })),
  sessionRows: v.array(v.object({ sessionId: v.string(), source: v.string(), startedAt: v.number(), visibleTimeMs: v.number(), purchased: v.boolean(), addedToCart: v.boolean(), beganCheckout: v.boolean() })),
});
async function report(ctx: QueryCtx, storeId: string) {
  const until = Date.now();
  const from = until - 30 * 86400000;
  // Bound reads to this store and the reporting window.
  // No upper timestamp bound: a cached query must include newly inserted rows
  // in its index dependency, otherwise live visits and orders cannot invalidate it.
  const visits = await ctx.db.query("visits").withIndex("by_store_time", q => q.eq("storeId", storeId).gte("time", from)).take(10001);
  const orders = await ctx.db.query("orders").withIndex("by_store_time", q => q.eq("storeId", storeId).gte("time", from)).take(10001);
  const sessions = await ctx.db.query("sessions").withIndex("by_store_started", q => q.eq("storeId", storeId).gte("startedAt", from)).take(10001);
  if (visits.length > 10000 || orders.length > 10000 || sessions.length > 10000) throw new Error("This store exceeds the current report limit. No partial totals are shown.");
  return { storeId, from, until, ...summarize(visits, orders), ...summarizeSessions(sessions, visits, orders) };
}
export const productsBySource = query({ args: {}, returns: result,
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to view your store");
    const access = await ctx.db.query("founderStores").withIndex("by_user", q => q.eq("userId", userId)).unique();
    if (!access) throw new Error("This account has no store access");
    return report(ctx, access.storeId);
  },
});
// CLI-only proof uses exactly the same calculation as the founder screen.
export const preview = internalQuery({ args: { storeId: v.string() }, returns: result, handler: (ctx,args) => report(ctx,args.storeId) });
export const grant = internalMutation({ args: { userId: v.id("users"), storeId: v.string() }, returns: v.null(), handler: async (ctx,args) => {
  const existing = await ctx.db.query("founderStores").withIndex("by_user", q => q.eq("userId",args.userId)).unique();
  if (existing) await ctx.db.patch(existing._id,{storeId:args.storeId}); else await ctx.db.insert("founderStores",args);
  return null;
}});
export const provision = internalAction({ args: {}, returns: v.null(), handler: async ctx => {
  const email = process.env.FOUNDER_EMAIL?.trim().toLowerCase();
  const password = process.env.FOUNDER_INITIAL_PASSWORD;
  if (!email || !password || password.length < 16) throw new Error("Founder credentials have not been configured");
  const account = await createAccount(ctx,{provider:"password",account:{id:email,secret:password},profile:{email}});
  await ctx.runMutation(internal.founder.grant,{userId:account.user._id,storeId:"chasma-kart"});
  return null;
}});
