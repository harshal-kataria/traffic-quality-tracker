# Milestone 1: store tracking

No hosting deployment is needed. No API keys are in the snippet or source.

Run `npm run dev:backend` in one terminal and `npm run dev` in another.
The backend command uses an isolated local Convex project in `.local-convex/`,
leaving the existing root `.env.local` alone. Convex may download its local
backend on the first run. Pages are at http://127.0.0.1:8080/test.html and
http://127.0.0.1:8080/thank-you.html. Pick prepaid or COD using the form.

Open http://127.0.0.1:8080/test.html?utm_source=test&utm_campaign=traveler,
choose COD, then open the fake thank-you page. Both pages record a visit;
the thank-you page also records an order. Reloading a thank-you page records
another order: this milestone tracks page loads, not unique store order IDs.

## Store installation

Serve `public/tracker.js` from your store and load it on each page:

```html
<script src="/tracker.js" data-convex-url="YOUR_CONVEX_CLIENT_URL"></script>
```

On a real thank-you page, provide the actual completed order before loading
the script (never put this example on ordinary store pages):

```html
<script>
window.storeTrackerOrder = {
  orderValue: 1499,
  productNames: ['Traveler Backpack'],
  paymentMethod: 'COD' // exactly 'prepaid' or 'COD'
};
</script>
<script src="/tracker.js" data-convex-url="YOUR_CONVEX_CLIENT_URL"></script>
```

Use the Convex client URL, not the `.convex.site` HTTP actions URL. It is a
public address, not an API key. The snippet uses browser storage for a session
that expires after 30 minutes without a tracked event. If browser storage is
blocked, it can only retain the session for the current page. UTM values are
read from each page URL; missing values are saved as null. `time` is browser
time in milliseconds since 1970. Order values use the store's currency.

This browser-submitted data is suitable for testing attribution; customers
can modify it. It is not a verified payment record.

Run `npm test` to check session expiry and tagged visit/order payloads.
To read raw rows locally, run from `.local-convex/`:

```sh
../node_modules/.bin/convex run tracking:rowsForSession '{"sessionId":"SESSION_FROM_PAGE"}'
```

No dashboard, alerts, time-on-page, scroll tracking, or recommendations are included.
