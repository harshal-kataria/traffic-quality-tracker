# Store tracking

Run `npm run dev:backend` and `npm run dev` in separate terminals. This uses
an isolated local Convex project in `.local-convex/`; the existing cloud
`.env.local` is untouched. No deployment is needed.

## Publish with Convex

Run `npm run deploy` to build the pages, deploy the Convex backend, and upload
the static files to the production `.convex.site` address. Git pushes do not
deploy. The build command receives the public production Convex client URL;
credentials remain in your local environment and are never included in the site.
Hosted example orders are flagged as tests under `demo-store`.

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
A private founder screen at `/founder/index.html` shows products and sessions by
traffic source, session time, and conversion rates. Ad integrations, scroll
tracking and forecasting are not implemented. Rule-based recommendations are now available.

### Traffic-drop alerts

The private founder screen checks daily at 9am IST, or through **Check now**.
Yesterday's complete IST day is compared separately with the day before yesterday
and the average of the seven complete days before yesterday (yesterday is excluded).
Either comparison can trigger one alert per store/day/page/source. Each baseline
must have at least 20 page views, with a drop of at least 30% and five lost page views.
The two-day comparison works after two complete days of history; the seven-day
comparison waits for eight complete days. No incomplete baseline is presented as zero.
Queries and fragments are ignored when grouping pages. Both counts and percentage
changes appear in the alert row. Negative drop percentages mean growth. A zero
baseline has no percentage. The latest 50 saved alerts appear on screen.

Sessions linked to test or staff orders are excluded. Untagged test browsing cannot
be identified. Each check has a 10,000-row limit; it refuses partial comparisons.
Development-only proof: `npx convex run alerts:verify '{}'` seeds isolated temporary
rows, checks both comparison windows and duplicate protection, then removes its rows
inside the same transaction. No production tracking rows are created by this proof.

### Behaviour analysis and recommendations (milestones 2 and 3)

On `/founder/index.html`, **Behaviour analysis** uses the existing sessions, visits
and orders from the last 30 days. Group by source, campaign, landing page or product
page. Counts and rates use distinct sessions; money stays separated by currency.
Campaign and landing-page attribution use the first observed page. Product rows
count sessions that viewed that product page, with whole-session funnel actions
and order value, not per-item conversion. Multi-product sessions appear more than
once. The original products-by-source table still gives per-product item value.
The latest 20 eligible journeys show up to 100 time-ordered events each.

Known test/staff sessions are excluded from all new analysis. Cancelled/refunded
purchases are excluded. Unconfirmed COD is recorded as a purchase; only paid or
delivered orders qualify as confirmed. No ad costs or margins are available.

Recommendations are explicit rules, not generated AI or predictions:
- Landing page: at least 100 sessions, under 2% added to cart.
- Cart: at least 20 cart sessions, fewer than half also began checkout.
- Checkout: at least 20 checkout sessions, fewer than 30% also purchased.
- Source test: at least 100 sessions per compared source, five confirmed purchasing
  sessions in the stronger source, conversion at least 1.5 times the other sources
  and two percentage points higher. Advice asks to check costs and margin first.
- Low source conversion: at least 100 sessions on both sides, confirmed purchase
  rate below half that of other sufficiently sampled sources.

Every recommendation shows evidence, a check to try, and how to check its result.
Weak samples show no advice. Rates describe co-occurring session actions, not proof
of ordered funnel progression. They do not establish causes or profitable budgets.
At most 20 recommendations are shown. Read limits reject partial analysis.
Development-only saved-data proof: `npx convex run insights:verify '{}'`.

### Morning email delivery (Resend)

Email delivery has been approved, but is **not active until account/sender setup**.
Create the Resend account, verify the sending domain for your sender address, then
set these private variables in the production Convex dashboard:

- `RESEND_API_KEY`: a Resend sending key.
- `ALERT_EMAIL_FROM`: the verified sender address.
- `ALERT_EMAIL_TO`: the founder's chosen recipient address.

Never paste a key into source code or commit it. The current settings apply only
 to `chasma-kart`; another store cannot use that founder recipient. Daily checks
schedule one digest per day, including collecting-history/no-drop states. Manual
**Check now** does not send an email. Failed sends retry twice, ten minutes apart.
The saved payload and Resend idempotency key prevent duplicate sends; retries stop
before the service's 24-hour duplicate-protection window expires. Sent means the
provider accepted the message, not proof that it reached the inbox. Failed delivery
status is visible on the founder screen. CLI-only status (does not expose secrets):
`npx convex run --prod alertEmail:status '{"storeId":"chasma-kart","day":"YYYY-MM-DD"}'`.
Once configured, `npx convex run --prod alerts:daily '{}'` runs the real daily flow.
