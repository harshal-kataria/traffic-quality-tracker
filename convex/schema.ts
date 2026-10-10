import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  visits: defineTable({
    sessionId: v.string(),
    pageUrl: v.string(),
    utm_source: v.union(v.string(), v.null()),
    utm_medium: v.union(v.string(), v.null()),
    utm_campaign: v.union(v.string(), v.null()),
    utm_content: v.union(v.string(), v.null()),
    time: v.number(),
  }).index("by_session", ["sessionId"]),
  orders: defineTable({
    sessionId: v.string(),
    orderValue: v.number(),
    productNames: v.array(v.string()),
    paymentMethod: v.union(v.literal("prepaid"), v.literal("COD")),
    time: v.number(),
  }).index("by_session", ["sessionId"]),
});
