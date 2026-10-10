const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ConvexHttpClient } = require('convex/browser');
const { makeFunctionReference } = require('convex/server');
const client = new ConvexHttpClient('http://127.0.0.1:3210');
const order = makeFunctionReference('tracking:order');

test('concurrent reloads without an order ID save one order; changed products or value save separately', async () => {
  const sessionId = crypto.randomUUID();
  const input = { sessionId, orderValue: 1499, productNames: ['Backpack', 'Travel Pouch'], paymentMethod: 'COD', time: Date.now() };
  const ids = await Promise.all(Array.from({ length: 4 }, () => client.mutation(order, input, { skipQueue: true })));
  assert.equal(new Set(ids).size, 1);
  assert.equal(await client.mutation(order, { ...input, productNames: [...input.productNames].reverse(), paymentMethod: 'prepaid' }), ids[0]);
  assert.notEqual(await client.mutation(order, { ...input, orderValue: 1500 }), ids[0]);
  assert.notEqual(await client.mutation(order, { ...input, productNames: ['Another product'] }), ids[0]);
});

test('an order ID prevents duplicates even when the browser session changes', async () => {
  const input = { orderId: `test-${crypto.randomUUID()}`, sessionId: crypto.randomUUID(), orderValue: 1499, productNames: ['Traveler Backpack'], paymentMethod: 'COD', time: Date.now() };
  const first = await client.mutation(order, input);
  assert.equal(await client.mutation(order, { ...input, sessionId: crypto.randomUUID(), time: Date.now() + 11 * 60 * 1000 }), first);
  assert.notEqual(await client.mutation(order, { ...input, orderId: `other-${crypto.randomUUID()}` }), first);
});
