import type { Doc } from "./_generated/dataModel";

export type ProductSourceRow = { product: string; source: string; visits: number; orders: number; orderValuePaise: number; currency: string };
export function excluded(order: Pick<Doc<"orders">, "isTest" | "isStaff" | "excludedFromMetrics">) {
  return order.isTest === true || order.isStaff === true || order.excludedFromMetrics === true;
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
