import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const attribution = v.object({ source: v.string(), medium: v.union(v.string(), v.null()), campaign: v.union(v.string(), v.null()), content: v.union(v.string(), v.null()), time: v.number() });
const status = v.union(v.literal("unconfirmed"), v.literal("paid"), v.literal("delivered"), v.literal("cancelled"), v.literal("refunded"));
export default defineSchema({
  ...authTables,
  founderStores: defineTable({ userId: v.id("users"), storeId: v.string() }).index("by_user", ["userId"]).index("by_store", ["storeId"]),
  trafficAlerts: defineTable({ storeId: v.string(), key: v.string(), day: v.string(), createdAt: v.number(),
    page: v.string(), source: v.string(), previousAverage: v.number(), currentVisits: v.number(), dropPercent: v.number(),
    dayBeforeVisits:v.optional(v.number()),dayBeforeDropPercent:v.optional(v.union(v.number(),v.null())),averageDropPercent:v.optional(v.union(v.number(),v.null())),
    dayBeforeReady:v.optional(v.boolean()),sevenDayReady:v.optional(v.boolean()),
  }).index("by_store_key", ["storeId", "key"]).index("by_store_created", ["storeId", "createdAt"]).index("by_store_day",["storeId","day"]),
  alertChecks: defineTable({ storeId: v.string(), checkedAt: v.number(), day: v.string(),
    status: v.union(v.literal("warming_up"), v.literal("ready"), v.literal("over_limit")),
    count: v.number(),
    dayBeforeReady:v.optional(v.boolean()),sevenDayReady:v.optional(v.boolean()),
  }).index("by_store", ["storeId"]),
  alertEmails:defineTable({storeId:v.string(),day:v.string(),createdAt:v.number(),updatedAt:v.number(),status:v.union(v.literal("pending"),v.literal("sent"),v.literal("failed")),payload:v.string(),providerId:v.optional(v.string()),error:v.optional(v.string())}).index("by_store_day",["storeId","day"]),
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
  }).index("by_store_session", ["storeId", "sessionId"]).index("by_store_started", ["storeId", "startedAt"]),
  heartbeatReceipts: defineTable({ storeId: v.string(), eventId: v.string(), time: v.number() })
    .index("by_store_event", ["storeId", "eventId"]).index("by_time", ["time"]),
  visitors: defineTable({ storeId: v.string(), visitorId: v.string(), attribution: v.union(attribution, v.null()) })
    .index("by_store_visitor", ["storeId", "visitorId"]),
});
