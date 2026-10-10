# ChasmaKart test store

Open `/chasma-kart/index.html?utm_source=test&utm_campaign=traveler` on the local server.

Six sample sunglasses, product pages, a browser-persisted bag, quantities, coupon CHASMA10, simulated prepaid/COD checkout and an order receipt are available. No card details, money or delivery are involved. Every order is marked `isTest: true` and excluded from metrics. Receipt reloads reuse the order ID so the existing Convex duplicate protection saves one order.

The existing tracker records page views, add-to-cart, begin-checkout and purchases using store ID `chasma-kart`. Product views are page views with a product URL. The homepage has source links; custom UTM parameters can also be added to the address. A new private browser window creates a fresh visitor. Source parameters persist across the shopping journey using the existing tracker rules.

## Local use

`TRACKING_CONVEX_URL=https://pleasant-bee-1.convex.cloud PORT=8081 npm run dev`

View local test data in the **development** deployment: https://dashboard.convex.dev/t/harshalkatariahd/build-sprint-app/pleasant-bee-1

Select **Data**, then filter `storeId` to `chasma-kart` in:

- `visits`: page views, add-to-cart and begin-checkout, with source parameters.
- `orders`: product items, amounts in paise (100 paise = ₹1), coupon, prepaid/COD and source.
- `sessions`: connect the journey using the same session ID.

The footer points to the deployment corresponding to the build. Published builds use the production deployment; local development uses the development deployment. No new dashboard has been built.

## Publishing later

`npm run deploy` builds static copies of every store route and publishes them using the existing Convex hosting setup. A Git push alone does not deploy. The store URL after publishing will end in `/chasma-kart/index.html`.
