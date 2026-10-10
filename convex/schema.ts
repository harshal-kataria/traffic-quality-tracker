import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const attribution = v.object({ source: v.string(), medium: v.union(v.string(), v.null()), campaign: v.union(v.string(), v.null()), content: v.union(v.string(), v.null()), time: v.number() });
const status = v.union(v.literal("unconfirmed"), v.literal("paid"), v.literal("delivered"), v.literal("cancelled"), v.literal("refunded"));
export default defineSchema({
  ...authTables,
  founderStores: defineTable({ userId: v.id("users"), storeId: v.string() }).index("by_user", ["userId"]),
  visits: defineTable({
    sessionId: v.string(), pageUrl: v.string(),
    utm_source: v.union(v.string(), v.null()), utm_medium: v.union(v.string(), v.null()),
    utm_campaign: v.union(v.string(), v.null()), utm_content: v.union(v.string(), v.null()), time: v.number(),
    storeId: v.optional(v.string()), eventId: v.optional(v.string()),
    eventName: v.optional(v.union(v.literal("page_view"), v.literal("add_to_cart"), v.literal("begin_checkout"))),
    source: v.optional(v.string()), sessionStartedAt: v.optional(v.number()), sessionDay: v.optional(v.string()),
    browser: v.optional(v.string()),
  }).index("by_store_time", ["storeId", "time"]).index("by_session", ["sessionId"]).index("by_store_session", ["storeId", "sessionId"])
    .index("by_store_event", ["storeId", "eventId"]).index("by_time", ["time"]),
  orders: defineTable({
    orderId: v.optional(v.string()), sessionId: v.string(), orderValue: v.number(), productNames: v.array(v.string()),
    paymentMethod: v.union(v.literal("prepaid"), v.literal("COD")), time: v.number(),
    storeId: v.optional(v.string()), eventId: v.optional(v.string()), eventName: v.optional(v.literal("purchase")),
    currency: v.optional(v.string()), items: v.optional(v.array(v.object({ name: v.string(), quantity: v.number(), pricePaise: v.number() }))),
    couponCode: v.optional(v.union(v.string(), v.null())), status: v.optional(status),
    isTest: v.optional(v.boolean()), isStaff: v.optional(v.boolean()), excludedFromMetrics: v.optional(v.boolean()),
    source: v.optional(v.string()), attribution: v.optional(v.union(attribution, v.null())),
    sessionStartedAt: v.optional(v.number()), sessionDay: v.optional(v.string()), statusUpdatedAt: v.optional(v.number()),
  }).index("by_store_time", ["storeId", "time"]).index("by_session", ["sessionId"]).index("by_store_session", ["storeId", "sessionId"])
    .index("by_store_order", ["storeId", "orderId"]).index("by_store_event", ["storeId", "eventId"])
    .index("by_store_session_value", ["storeId", "sessionId", "orderValue", "currency"]),
  sessions: defineTable({ storeId: v.string(), sessionId: v.string(), startedAt: v.number(), sessionDay: v.string(),
    lastSeenAt: v.number(), visibleTimeMs: v.number(), lastHeartbeatAt: v.number(), source: v.string(),
    attribution: v.union(attribution, v.null()),
  }).index("by_store_session", ["storeId", "sessionId"]),
  heartbeatReceipts: defineTable({ storeId: v.string(), eventId: v.string(), time: v.number() })
    .index("by_store_event", ["storeId", "eventId"]).index("by_time", ["time"]),
  visitors: defineTable({ storeId: v.string(), visitorId: v.string(), attribution: v.union(attribution, v.null()) })
    .index("by_store_visitor", ["storeId", "visitorId"]),
});
