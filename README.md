# Store tracking

Run `npm run dev:backend` and `npm run dev` in separate terminals. This uses
an isolated local Convex project in `.local-convex/`; the existing cloud
`.env.local` is untouched. No deployment is needed.

Local pages: http://127.0.0.1:8080/test.html and
http://127.0.0.1:8080/thank-you.html?payment=COD. Localhost orders are flagged
as tests automatically. Add `&orderId=YOUR_ORDER_ID` to test order-ID protection.

## Store installation

Use a stable store ID on every store and checkout domain. The Convex URL is a
public client address, not an API key. Load the script in the background:

```html
<script async src="/tracker.js"
  data-convex-url="YOUR_CONVEX_CLIENT_URL"
  data-store-id="YOUR_STORE_ID"
  data-store-hosts="shop.example.com,www.shop.example.com"
  data-checkout-hosts="checkout.example.com"></script>
```

Links and forms to configured checkout hosts receive the session, visitor and
attribution. The same tracker configuration must be installed on the checkout
thank-you page. For checkout navigation initiated in JavaScript, use
`StoreTracker.decorateCheckoutUrl(checkoutUrl)` before navigating. A payment
page where the store cannot install code must preserve these parameters when
returning; the snippet cannot change a third party's payment pages.

Set the completed order before the async script loads on a thank-you page:

```html
<script>
window.storeTrackerOrder = {
  orderId: 'STORE_ORDER_ID',
  orderValuePaise: 149900,
  currency: 'INR',
  items: [{ name: 'Traveler Backpack', quantity: 1, pricePaise: 149900 }],
  paymentMethod: 'COD', // exactly 'prepaid' or 'COD'
  couponCode: 'TRAVELER',
  isTest: false,
  isStaff: false
};
</script>
```

`orderValuePaise` is the amount actually paid for merchandise after discounts,
excluding shipping. Item prices must also be after discounts and exclude
shipping; quantity × price across all items must equal that amount. The backend
rejects fractional amounts, invalid quantities and mismatched totals. Legacy
`orderValue` in rupees is converted to paise (and `shippingValue` is subtracted
when supplied). A single legacy product name can supply one item; multiple
products require actual item quantities and prices. Never infer a discount
from the coupon code: supply the store's final paid amounts.

An order ID is unique within its store, including across sessions. Without an
ID, the same session, currency, order value and product names within ten minutes
of the original database write count as one order. Product-name order and
payment method do not split this fallback match. Retries reuse an event ID.

COD starts `unconfirmed`; prepaid starts `paid`. A trusted Convex store backend
can call the internal `tracking:updateOrderStatus` with the store ID, order ID
and `delivered`, `cancelled`, `refunded`, `paid` or `unconfirmed`. Status changes
keep the original row and time; `statusUpdatedAt` records the update. Browser
code cannot invoke that internal function. Test and staff orders have
`excludedFromMetrics: true`; future reporting must respect it. Use the order
flags or `data-test-mode="true"` / `data-staff-mode="true"` for store integration.

When the store confirms an add-to-cart or checkout action, call
`StoreTracker.trackEvent('add_to_cart')` or
`StoreTracker.trackEvent('begin_checkout')`. Page views and purchases are
automatic. Arbitrary event names are ignored. Invoke these methods after the
async script loads, or from the store's later event handlers.

## Collection rules

- Store ID scopes browser state and every new database row. All database reads
  are internal and require a store ID. Founder login and dashboard access are
  outside this milestone; never expose these internal reads as public queries.
- Session state is shared between tabs on the same origin and survives midnight.
  It expires after 30 minutes of inactivity. A newly arriving UTM source starts
  another session. The reporting day stays the IST day the session started.
- Session attribution survives pages without UTMs. Orders use the last non-direct
  source seen for that store/browser visitor within 30 days. UTMs are lowercase
  and trimmed. Missing sources use click IDs, in-app browser tags, external
  referrers, then direct; self, configured checkout and gateway referrals are
  ignored. Instagram/Facebook app browsers are also explicitly tagged.
- SPA URL changes and restored back/forward pages emit page views. Visible tabs
  ping every 15 seconds; shared server timing prevents double-counting overlapping
  tabs. Heartbeat retries are also protected from duplicates.
- All stored event times come from the server, in UTC milliseconds. Local device
  time is used only for browser storage expiry. Session days use IST (UTC+05:30).
- URLs retain only normalized UTM query parameters. Other query parameters,
  fragments, credentials, and email/phone patterns in paths or UTMs are removed.
  This intentionally favors privacy over collecting arbitrary URL details.
  Raw visitor IP addresses and raw user-agent strings are not stored in Convex.
- Known bots send no events. `?notrack=1` persistently disables that store's
  tracking in the browser on the current origin. Clear the store's browser
  storage to enable tracking again.
- Failed sends persist and retry, including on reconnection; page close and tab
  hiding attempt a beacon. The queue is bounded to 100 events and 24 hours.
  Permanent invalid payloads are discarded without blocking later events.
  Requests time out after eight seconds where the browser supports it.
  Tracking failures are silent and do not stop store navigation. Browsers can
  still prevent delivery, especially when closing abruptly or blocking storage.
- Raw visit/funnel rows and heartbeat retry receipts expire after 90 days. The
  Convex cleanup runs every ten minutes in batches. Orders are retained.

Privacy-policy notice founders can add:

> We use first-party analytics to understand visits and purchases, including
> traffic source, pages viewed, visible browsing time and order details, without
> storing raw IP addresses or personal contact information in tracked URLs.

Safari storage clearing can undercount returning browser visitors and break
longer attribution history. No repeat-customer classification is added here.
No dashboard, alerts, ad integration, scroll tracking or recommendations exist.

## Checks

`npm run check` checks Convex types; `npm test` checks browser collection rules.
With local Convex running:

```sh
node --test tests/tracking.local.cjs tests/order-dedup.local.cjs
```

These run the actual snippet in a browser test harness (not a real browser)
and submit events to the real local Convex database. The test output includes
raw saved visit and order rows, with test orders flagged.

To read rows locally, run from `.local-convex/`:

```sh
../node_modules/.bin/convex run tracking:rowsForSession '{"storeId":"STORE_ID","sessionId":"SESSION_ID"}'
```

No API keys are in the snippet or repository. Browser-submitted telemetry is
not an independently verified payment record.
