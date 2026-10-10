import { mutation, internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

const nullable = v.union(v.string(), v.null());
const context = { storeId: v.string(), sessionId: v.string(), visitorId: v.string(),
  source: v.string(), utm_source: nullable, utm_medium: nullable, utm_campaign: nullable, utm_content: nullable,
  browser: v.string(), userAgent: v.string() };
const status = v.union(v.literal("unconfirmed"), v.literal("paid"), v.literal("delivered"), v.literal("cancelled"), v.literal("refunded"));
const windowMs = 30 * 24 * 60 * 60 * 1000;
const bot = /bot\b|crawler|spider|headless|lighthouse|facebookexternalhit|preview|slurp/i;
const gateway = /razorpay|phonepe|paytm|paypal|stripe|cashfree|payu|juspay/i;
function clean(value: string | null) {
  if (!value) return null;
  const text = value.trim().toLowerCase().slice(0, 200);
  return /[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d ().-]{6,}\d/.test(text) ? null : text || null;
}
function safeUrl(value: string) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid page URL");
  url.username = ""; url.password = ""; url.hash = "";
  const path = decodeURIComponent(url.pathname).replace(/[^/\s@]+@[^/\s@]+\.[^/\s@]+|\+?\d[\d ().-]{6,}\d/g, "redacted");
  url.pathname = path;
  const params = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) {
    const val = clean(url.searchParams.get(key)); if (val) params.set(key, val);
  }
  url.search = params.toString();
  return url.href;
}
async function getSession(ctx: MutationCtx, args: { storeId: string; sessionId: string; visitorId: string; source: string; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null }) {
  if (!args.storeId.trim() || !args.sessionId || !args.visitorId) throw new Error("Missing store or session");
  const now = Date.now();
  const visitor = await ctx.db.query("visitors").withIndex("by_store_visitor", q => q.eq("storeId", args.storeId).eq("visitorId", args.visitorId)).unique();
  const existing = await ctx.db.query("sessions").withIndex("by_store_session", q => q.eq("storeId", args.storeId).eq("sessionId", args.sessionId)).unique();
  let attribution = visitor?.attribution ?? existing?.attribution ?? null;
  if (attribution && now - attribution.time > windowMs) attribution = null;
  const source = clean(args.source) || "direct";
  if (!existing && source !== "direct" && !gateway.test(source)) {
    attribution = { source, medium: clean(args.utm_medium), campaign: clean(args.utm_campaign), content: clean(args.utm_content), time: now };
  }
  if (visitor) await ctx.db.patch(visitor._id, { attribution });
  else await ctx.db.insert("visitors", { storeId: args.storeId, visitorId: args.visitorId, attribution });
  if (existing) {
    await ctx.db.patch(existing._id, { lastSeenAt: now, attribution });
    return { ...existing, attribution };
  }
  // UTC storage; the session's reporting day is the IST day it started.
  const sessionDay = new Date(now + 330 * 60 * 1000).toISOString().slice(0, 10);
  const fields = { storeId: args.storeId, sessionId: args.sessionId, startedAt: now, sessionDay,
    lastSeenAt: now, visibleTimeMs: 0, lastHeartbeatAt: now,
    source: gateway.test(source) ? "direct" : source, attribution };
  const id = await ctx.db.insert("sessions", fields);
  return { ...fields, _id: id };
}

export const visit = mutation({
  args: { ...context, eventId: v.string(), pageUrl: v.string(), eventName: v.union(v.literal("page_view"), v.literal("add_to_cart"), v.literal("begin_checkout")) },
  returns: v.union(v.id("visits"), v.null()),
  handler: async (ctx, args) => {
    if (bot.test(args.userAgent)) return null;
    const existing = await ctx.db.query("visits").withIndex("by_store_event", q => q.eq("storeId", args.storeId).eq("eventId", args.eventId)).unique();
    if (existing) return existing._id;
    const session = await getSession(ctx, args);
    return await ctx.db.insert("visits", { storeId: args.storeId, sessionId: args.sessionId,
      eventId: args.eventId, eventName: args.eventName, pageUrl: safeUrl(args.pageUrl), time: Date.now(),
      utm_source: clean(args.utm_source), utm_medium: clean(args.utm_medium), utm_campaign: clean(args.utm_campaign), utm_content: clean(args.utm_content),
      source: session.source, browser: args.browser, sessionStartedAt: session.startedAt, sessionDay: session.sessionDay });
  },
});

export const heartbeat = mutation({
  args: { ...context, eventId: v.string(), elapsedMs: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    if (bot.test(args.userAgent)) return null;
    if (!Number.isFinite(args.elapsedMs) || args.elapsedMs < 0) return null;
    const receipt = await ctx.db.query("heartbeatReceipts").withIndex("by_store_event", q => q.eq("storeId", args.storeId).eq("eventId", args.eventId)).unique();
    if (receipt) return null;
    const session = await getSession(ctx, args);
    const now = Date.now();
    await ctx.db.insert("heartbeatReceipts", { storeId: args.storeId, eventId: args.eventId, time: now });
    // Shared server clock bounds overlapping visible tabs to one time interval.
    const elapsed = Math.max(0, Math.min(args.elapsedMs, 15000, now - session.lastHeartbeatAt));
    await ctx.db.patch(session._id, { visibleTimeMs: session.visibleTimeMs + elapsed, lastHeartbeatAt: now });
    return null;
  },
});

export const order = mutation({
  args: { ...context, eventId: v.string(), orderId: v.optional(v.string()), orderValue: v.number(),
    currency: v.string(), items: v.array(v.object({ name: v.string(), quantity: v.number(), pricePaise: v.number() })),
    paymentMethod: v.union(v.literal("prepaid"), v.literal("COD")), couponCode: nullable,
    isTest: v.boolean(), isStaff: v.boolean() },
  returns: v.union(v.id("orders"), v.null()),
  handler: async (ctx, args) => {
    if (bot.test(args.userAgent)) return null;
    if (!Number.isSafeInteger(args.orderValue) || args.orderValue < 0 || !/^[A-Z]{3}$/.test(args.currency) ||
      !args.items.length || args.items.some(item => !item.name.trim() || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
        !Number.isSafeInteger(item.pricePaise) || item.pricePaise < 0) ||
      args.items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0) !== args.orderValue) throw new Error("Items must add up to the paid merchandise value in whole paise");
    const session = await getSession(ctx, args);
    const replay = await ctx.db.query("orders").withIndex("by_store_event", q => q.eq("storeId", args.storeId).eq("eventId", args.eventId)).first();
    if (replay) return replay._id;
    const orderId = args.orderId?.trim();
    if (orderId) {
      const existing = await ctx.db.query("orders").withIndex("by_store_order", q => q.eq("storeId", args.storeId).eq("orderId", orderId)).first();
      if (existing) return existing._id;
    } else {
      const products = JSON.stringify(args.items.map(item => item.name).sort());
      const recent = ctx.db.query("orders").withIndex("by_store_session_value", q => q.eq("storeId", args.storeId)
        .eq("sessionId", args.sessionId).eq("orderValue", args.orderValue).eq("currency", args.currency).gte("_creationTime", Date.now() - 600000));
      for await (const existing of recent) if (JSON.stringify([...existing.productNames].sort()) === products) return existing._id;
    }
    const { userAgent: _ua, visitorId: _visitor, browser: _browser, source: _source, utm_source: _us, utm_medium: _um, utm_campaign: _uc, utm_content: _ut, orderId: _oid, ...fields } = args;
    return await ctx.db.insert("orders", { ...fields, ...(orderId ? { orderId } : {}),
      productNames: args.items.map(item => item.name), eventName: "purchase", time: Date.now(),
      couponCode: args.couponCode?.trim().slice(0, 200) || null,
      status: args.paymentMethod === "COD" ? "unconfirmed" : "paid",
      excludedFromMetrics: args.isTest || args.isStaff,
      attribution: session.attribution, source: session.attribution?.source ?? "direct",
      sessionStartedAt: session.startedAt, sessionDay: session.sessionDay });
  },
});

// Trusted store backend only: a browser cannot mark another customer's order refunded.
export const updateOrderStatus = internalMutation({
  args: { storeId: v.string(), orderId: v.string(), status }, returns: v.union(v.id("orders"), v.null()),
  handler: async (ctx, args) => {
    const order = await ctx.db.query("orders").withIndex("by_store_order", q => q.eq("storeId", args.storeId).eq("orderId", args.orderId)).unique();
    if (!order) return null;
    await ctx.db.patch(order._id, { status: args.status, statusUpdatedAt: Date.now() }); return order._id;
  },
});

export const rowsForSession = internalQuery({
  args: { storeId: v.string(), sessionId: v.string() },
  returns: v.object({ visits: v.array(v.any()), orders: v.array(v.any()), sessions: v.array(v.any()) }),
  handler: async (ctx, args) => ({
    visits: await ctx.db.query("visits").withIndex("by_store_session", q => q.eq("storeId", args.storeId).eq("sessionId", args.sessionId)).take(100),
    orders: await ctx.db.query("orders").withIndex("by_store_session", q => q.eq("storeId", args.storeId).eq("sessionId", args.sessionId)).take(100),
    sessions: await ctx.db.query("sessions").withIndex("by_store_session", q => q.eq("storeId", args.storeId).eq("sessionId", args.sessionId)).take(1),
  }),
});

export const expireVisits = internalMutation({
  args: {}, returns: v.number(),
  handler: async ctx => {
    const rows = await ctx.db.query("visits").withIndex("by_time", q => q.lt("time", Date.now() - 90 * 86400000)).take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    const receipts = await ctx.db.query("heartbeatReceipts").withIndex("by_time", q => q.lt("time", Date.now() - 90 * 86400000)).take(500);
    for (const row of receipts) await ctx.db.delete(row._id);
    if (rows.length === 500 || receipts.length === 500) await ctx.scheduler.runAfter(0, internal.tracking.expireVisits, {});
    return rows.length + receipts.length;
  },
});
