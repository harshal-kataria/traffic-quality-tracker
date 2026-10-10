Interface:
Agent: A snippet in the ecommerce website, to track the entire user behaviour.
An email to send them daily alerts in the morning.
User: A dashboard where they can see the entire user behaviour, channel performance, campaign performance, landing page/product performance along with all the metrics.
Third Parties: that particular ecommerce website. Facebook Ads Manager, Google ads manager.
Backend: Database
Databse to store: every click on every thing on the website, every session, add to cart, initiate checkout, purchase, page view, scroll, time spent on website, user source, user medium, UTM parameters, last visit (if repeat user), user journey - on which pages are visited in sequency, memory of the user, type of order - prepaid or cash on delivery
"phone and email stored hashed, never plain".
Business Logic:
Higher than average order value purchase - good quality user
Session - one session is of 30 minutes, than its second session
Time spent more than 2 minutes is good quality user
Prepaid order is of higher quality
Each session should have a session ID
Time spent: we want to record this for each and every session, so I can track which session spent how much time, and that way I can calculate average. for example a user from Snapchat ads spent 30mins and 6 purchases, vs from Instagram which spent 5 minutes and 0 purchases, vs email with 3 minutes and 2 purchases.
	1	Time spent: the snippet never sees anyone leave, so time on the last page is lost. Fix: send a ping every 15 seconds while the tab is open.
	2	Attribution: UTMs only appear on the first page. Fix: save the source on the session.
	3	Safari: it wipes browser storage after about 7 days, which breaks your 30-day window. Fix: note that Safari repeat users are undercounted.
	4	COD returns: many COD orders never get paid. Fix: mark COD orders "unconfirmed" until they're delivered.
	•	Known customer (same phone or email from an earlier order): always a repeat user, with no time limit.
	•	Unknown visitor (browser only): a repeat user if they come back within 30 days of their first visit. From day 31 they count as new.
One edge case to write down too: a customer's first order isn't a repeat. They become one from their next visit.
edge cases:
Tracking edge cases
	1	Store isolation: every row carries a store ID; a founder can only ever see their own store's data.
	2	Checkout on another domain (Shopify checkout, payment page): carry the session ID through so the order joins the right visit.
	3	Payment gateway return (Razorpay, PhonePe, Paytm): never count the gateway as a traffic source.
	4	Self-referral: the store's own domain as referrer is never a new source or session.
	5	Instagram/Facebook in-app browsers: detect them from the user agent and tag the source as instagram_app or facebook_app.
	6	Multiple tabs: one session; count time only while a tab is visible.
	7	Back/forward button: log the page view even when the browser restores the page from cache.
	8	Theme pages that change without a full reload: track URL changes as page views.
	9	Cancelled or refunded orders: keep an order status field and update it; don't delete the row.
	10	Test and staff orders: flag them and exclude from all numbers.
	11	UTM values: lowercase and trim them, so "Instagram" and "instagram " are one source.
	12	Personal data in URLs (emails, phone numbers in query strings): strip it before saving.
	13	Device clock wrong: use server time for every event.
	14	Failed sends (bad network, tab closed): retry, and send the last event as the page closes.
	15	Privacy: don't store raw IP addresses; show a one-line tracking notice founders can add to their privacy policy.
	16	Sessions don't split at midnight; a session belongs to the day it started.
	17	A new UTM source arriving mid-session starts a new session.
	18	Attribution: give an order to the last non-direct source within 30 days.
	19	Funnel events use fixed names: page_view, add_to_cart, begin_checkout, purchase.
	20	Money is stored as whole paise with a currency field, never as decimals.
	21	Orders store each item's quantity and price; the items must add up to the order value.
	22	Record the coupon code on every order, so influencer codes show up as a source.
	23	The snippet loads in the background, never slows the store page, and fails silently.
	24	Set a retention period for raw visit rows, and delete them after it.
	25	Snippet health: alert the founder if no events arrive for 24 hours.
	26	Missing UTMs: fall back to fbclid / gclid, then the referrer (instagram.com, google.com), and only then "direct".
	27	Bots: they inflate visits, so drop known bot user agents.
	28	Your own testing: it pollutes founder data, so ?notrack=1 turns tracking off in that browser.
	29	Order value: the amount paid after discount, excluding shipping.
	30	Timezone: store times in UTC and show them in IST, so "yesterday" means the same to everyone.
	31	Ad blockers: some visits will never be tracked. Show a daily count of tracked orders vs Shopify orders.
	32	
Third Parties: the store's website, Facebook Ads Manager, Google Ads Manager. Their keys live in Convex environment variables, never in the code.
