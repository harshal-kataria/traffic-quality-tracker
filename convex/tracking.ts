import { mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const visit = mutation({
  args: {
    sessionId: v.string(), pageUrl: v.string(),
    utm_source: v.union(v.string(), v.null()),
    utm_medium: v.union(v.string(), v.null()),
    utm_campaign: v.union(v.string(), v.null()),
    utm_content: v.union(v.string(), v.null()), time: v.number(),
  },
  returns: v.id("visits"),
  handler: async (ctx, args) => {
    if (!args.sessionId || !Number.isFinite(args.time)) throw new Error("Invalid visit");
    const url = new URL(args.pageUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid page URL");
    return await ctx.db.insert("visits", args);
  },
});

export const order = mutation({
  args: {
    sessionId: v.string(), orderValue: v.number(), productNames: v.array(v.string()),
    paymentMethod: v.union(v.literal("prepaid"), v.literal("COD")), time: v.number(),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    if (!args.sessionId || !Number.isFinite(args.orderValue) || args.orderValue < 0 ||
        !Number.isFinite(args.time) || !args.productNames.length ||
        args.productNames.some((name) => !name.trim())) throw new Error("Invalid order");
    return await ctx.db.insert("orders", args);
  },
});

// Local verification only; not exposed to browsers.
export const rowsForSession = internalQuery({
  args: { sessionId: v.string() },
  returns: v.object({ visits: v.array(v.any()), orders: v.array(v.any()) }),
  handler: async (ctx, { sessionId }) => ({
    visits: await ctx.db.query("visits").withIndex("by_session", q => q.eq("sessionId", sessionId)).take(100),
    orders: await ctx.db.query("orders").withIndex("by_session", q => q.eq("sessionId", sessionId)).take(100),
  }),
});
