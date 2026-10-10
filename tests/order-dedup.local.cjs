const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConvexHttpClient } = require('convex/browser');
const { makeFunctionReference } = require('convex/server');
const client = new ConvexHttpClient('http://127.0.0.1:3210');
const order = makeFunctionReference('tracking:order');
const base = { storeId: "local-test-store", visitorId: crypto.randomUUID(), eventId: crypto.randomUUID(), source: "direct", utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, browser: "browser", userAgent: "Mozilla/5.0", currency: "INR", couponCode: null, isTest: true, isStaff: false };

test('concurrent reloads without an order ID save one order; changed products or value save separately', async () => {
  const sessionId = crypto.randomUUID();
  const input = { ...base, eventId: crypto.randomUUID(), sessionId, orderValue: 149900, items: [{ name: 'Backpack', quantity: 1, pricePaise: 100000 }, { name: 'Travel Pouch', quantity: 1, pricePaise: 49900 }], paymentMethod: 'COD' };
  const ids = await Promise.all(Array.from({ length: 4 }, () => client.mutation(order, { ...input, eventId: crypto.randomUUID() }, { skipQueue: true })));
  assert.equal(new Set(ids).size, 1);
  assert.equal(await client.mutation(order, { ...input, eventId: crypto.randomUUID(), items: [...input.items].reverse(), paymentMethod: 'prepaid' }), ids[0]);
  assert.notEqual(await client.mutation(order, { ...input, eventId: crypto.randomUUID(), orderValue: 150000, items: [{ name: 'Backpack', quantity: 1, pricePaise: 150000 }] }), ids[0]);
  assert.notEqual(await client.mutation(order, { ...input, eventId: crypto.randomUUID(), items: [{ name: 'Another product', quantity: 1, pricePaise: 149900 }] }), ids[0]);
});

test('an order ID prevents duplicates even when the browser session changes', async () => {
  const input = { ...base, eventId: crypto.randomUUID(), orderId: `test-${crypto.randomUUID()}`, sessionId: crypto.randomUUID(), orderValue: 149900, items: [{ name: 'Traveler Backpack', quantity: 1, pricePaise: 149900 }], paymentMethod: 'COD' };
  const first = await client.mutation(order, input);
  assert.equal(await client.mutation(order, { ...input, eventId: crypto.randomUUID(), sessionId: crypto.randomUUID() }), first);
  assert.notEqual(await client.mutation(order, { ...input, eventId: crypto.randomUUID(), orderId: `other-${crypto.randomUUID()}` }), first);
});
