import type { Doc } from "./_generated/dataModel";

export type ProductSourceRow = { product: string; source: string; visits: number; orders: number; orderValuePaise: number; currency: string };
export function excluded(order: Pick<Doc<"orders">, "isTest" | "isStaff" | "excludedFromMetrics">) {
  return order.isTest === true || order.isStaff === true || order.excludedFromMetrics === true;
}
// Rates count distinct sessions, so repeated page views and purchases cannot inflate them.
export function summarizeSessions(sessions: Doc<"sessions">[], visits: Doc<"visits">[], orders: Doc<"orders">[]) {
  const activity = new Map(sessions.map(session => [session.sessionId, {
    sessionId: session.sessionId, source: session.source.trim().toLowerCase() || "direct",
    startedAt: session.startedAt, visibleTimeMs: Math.max(0, session.visibleTimeMs),
    cart: false, checkout: false, purchased: false,
  }]));
  for (const visit of visits) {
    const session = activity.get(visit.sessionId);
    if (!session) continue;
    if (visit.eventName === "add_to_cart") session.cart = true;
    if (visit.eventName === "begin_checkout") session.checkout = true;
  }
  for (const order of orders) {
    if (excluded(order) || order.status === "cancelled" || order.status === "refunded") continue;
    const session = activity.get(order.sessionId);
    if (session) session.purchased = true;
  }
  const sources = new Map<string, { source: string; sessions: number; visibleTimeMs: number; cartSessions: number; checkoutSessions: number; purchasingSessions: number; cartPurchasingSessions: number }>();
  for (const session of activity.values()) {
    let row = sources.get(session.source);
    if (!row) { row = { source: session.source, sessions: 0, visibleTimeMs: 0, cartSessions: 0, checkoutSessions: 0, purchasingSessions: 0, cartPurchasingSessions: 0 }; sources.set(session.source, row); }
    row.sessions++; row.visibleTimeMs += session.visibleTimeMs;
    row.cartSessions += Number(session.cart); row.checkoutSessions += Number(session.checkout);
    row.purchasingSessions += Number(session.purchased); row.cartPurchasingSessions += Number(session.cart && session.purchased);
  }
  return {
    sourceRows: [...sources.values()].sort((a,b) => a.source.localeCompare(b.source)).map(row => ({
      ...row, averageTimeMs: row.visibleTimeMs / row.sessions,
      addToCartRate: row.cartSessions / row.sessions,
      purchaseRate: row.purchasingSessions / row.sessions,
      cartToPurchaseRate: row.cartSessions ? row.cartPurchasingSessions / row.cartSessions : null,
    })),
    sessionRows: [...activity.values()].sort((a,b) => b.startedAt - a.startedAt).map(({ cart, checkout, ...session }) => ({ ...session, addedToCart: cart, beganCheckout: checkout })),
  };
}
const normalized = (value: string) => value.trim().toLowerCase();
const slug = (value: string) => normalized(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export function summarize(visits: Doc<"visits">[], orders: Doc<"orders">[]) {
  const names = new Map<string, string>();
  for (const order of orders) for (const name of order.productNames) names.set(slug(name), name);
  const rows = new Map<string, ProductSourceRow>();
  function row(product: string, source: string, currency = "INR") {
    const key = JSON.stringify([product, source, currency]);
    if (!rows.has(key)) rows.set(key, { product, source, currency, visits: 0, orders: 0, orderValuePaise: 0 });
    return rows.get(key)!;
  }
  for (const visit of visits) {
    if (visit.eventName && visit.eventName !== "page_view") continue;
    let product = "Other store pages";
    try {
      const match = new URL(visit.pageUrl).pathname.match(/\/products?\/([^/]+?)(?:\.html)?\/?$/);
      if (match) { const key = decodeURIComponent(match[1]); product = names.get(slug(key)) ?? key.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
    } catch { /* Legacy malformed URLs are grouped as other pages. */ }
    row(product, normalized(visit.source || visit.utm_source || "direct")).visits++;
  }
  let excludedOrders = 0;
  for (const order of orders) {
    if (excluded(order)) { excludedOrders++; continue; }
    if (order.status === "cancelled" || order.status === "refunded") continue;
    const source = normalized(order.attribution?.source || order.source || "direct");
    const currency = order.currency || "INR";
    // Legacy rows lack item prices, so avoid inventing a per-product split.
    const items = order.items ?? [{ name: order.productNames.length === 1 ? order.productNames[0] : "Legacy order (product split unavailable)", quantity: 1, pricePaise: order.orderValue }];
    const products = new Map<string, number>();
    for (const item of items) products.set(item.name, (products.get(item.name) || 0) + item.pricePaise * item.quantity);
    for (const [product, value] of products) { const result = row(product, source, currency); result.orders++; result.orderValuePaise += value; }
  }
  return { rows: [...rows.values()].sort((a,b) => a.product.localeCompare(b.product) || a.source.localeCompare(b.source) || a.currency.localeCompare(b.currency)), excludedOrders };
}
