import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexReactClient, useConvexAuth, useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
const client = new ConvexReactClient(process.env.FOUNDER_CONVEX_URL);
const reference = makeFunctionReference('founder:productsBySource');
const amount = (paise, currency) => new Intl.NumberFormat('en-IN', { style:'currency', currency }).format(paise / 100);
const duration = ms => `${Math.floor(ms / 60000)}m ${Math.floor(ms / 1000) % 60}s`;
const rate = value => value === null ? '—' : `${(value * 100).toFixed(1)}%`;
const started = ms => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'}).format(ms);
const date = ms => new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}).format(ms);

function SignIn() {
  const { signIn } = useAuthActions();
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  return <section className="login"><div className="brand">ChasmaKart<span/></div><h1>Your store, by source.</h1><p>Sign in to see which sources bring visits and orders to each product.</p><form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); form.set('flow','signIn');
    try { await signIn('password',form); } catch { setError('Sign-in failed. Check your founder email and password.'); setBusy(false); }
  }}><label htmlFor="email">Founder email<input id="email" name="email" type="email" autoComplete="username" required/></label><label htmlFor="password">Password<input id="password" name="password" type="password" autoComplete="current-password" required/></label><button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{error && <p role="alert" className="error">{error}</p>}</form><small>Private founder access. Public account creation is disabled.</small></section>;
}
function Report() {
  const data = useQuery(reference,{});
  if (!data) return <p className="state" role="status">Loading your store’s numbers…</p>;
  return <><div className="title"><div><h1>Traffic and product performance</h1><p>ChasmaKart · {date(data.from)} – {date(data.until)} · IST</p></div><span className="period">Last 30 days</span></div><p className="notice">Test and staff orders are excluded. Cancelled and refunded orders are excluded. COD orders count while unconfirmed.</p><section className="report-section"><h2>Sessions by traffic source</h2><p className="section-note">Sessions started in the last 30 days. Time counts only while a store tab is visible.</p><div className="table-wrap"><table><caption className="sr-only">Session time and conversion rates by traffic source</caption><thead><tr><th scope="col">Traffic source</th>{['Sessions','Average time','Added to cart','Began checkout','Purchased','Add-to-cart rate','Cart-to-purchase rate','Purchase rate'].map(label => <th key={label} scope="col" className="number">{label}</th>)}</tr></thead><tbody>{data.sourceRows.map(row => <tr key={row.source}><th scope="row"><span className="source">{row.source}</span></th><td className="number">{row.sessions}</td><td className="number">{duration(row.averageTimeMs)}</td><td className="number">{row.cartSessions}</td><td className="number">{row.checkoutSessions}</td><td className="number">{row.purchasingSessions}</td><td className="number">{rate(row.addToCartRate)}</td><td className="number">{rate(row.cartToPurchaseRate)}</td><td className="number">{rate(row.purchaseRate)}</td></tr>)}{!data.sourceRows.length && <tr><td colSpan="9" className="state">No tracked sessions in this period.</td></tr>}</tbody></table></div><p className="section-note">Rates count sessions, not clicks. Cart-to-purchase counts sessions that both added to cart and purchased; — means no cart sessions. Test visits remain visible, but test purchases do not count. Session source is the source at session start; order attribution below can differ.</p></section><section className="report-section"><h2>Products by traffic source</h2><div className="table-wrap"><table><caption className="sr-only">Product page visits and eligible orders by traffic source</caption><thead><tr><th scope="col">Product</th><th scope="col">Traffic source</th><th scope="col" className="number">Visits</th><th scope="col" className="number">Orders</th><th scope="col" className="number">Order value</th></tr></thead><tbody>{data.rows.map(row => <tr key={JSON.stringify([row.product,row.source,row.currency])}><th scope="row">{row.product}</th><td><span className="source">{row.source}</span></td><td className="number">{row.visits.toLocaleString('en-IN')}</td><td className="number">{row.orders.toLocaleString('en-IN')}</td><td className="number value">{amount(row.orderValuePaise,row.currency)}</td></tr>)}{!data.rows.length && <tr><td colSpan="5" className="state">No tracked visits or eligible orders in this period.</td></tr>}</tbody></table></div></section><div className="definitions"><p><strong>Visits</strong> counts page views, including repeat views. Product URLs identify the product; other pages appear together.</p><p><strong>Orders</strong> counts eligible orders containing that product. One order can appear under several products. Value is the discounted item total, excluding shipping.</p><p>Order source uses the saved last non-direct source. The tables update when saved data changes. Time updates about every 15 seconds while a store tab is visible.</p></div><section className="report-section"><h2>Individual session times</h2><p className="section-note">Most recent 50 sessions · Start times shown in IST. Older sessions still count in the source totals above.</p><div className="table-wrap"><table><caption className="sr-only">Individual tracked session times</caption><thead><tr><th scope="col">Session ID</th><th scope="col">Source</th><th scope="col">Started · IST</th><th scope="col" className="number">Time spent</th><th scope="col">Purchased</th></tr></thead><tbody>{data.sessionRows.slice(0,50).map(row => <tr key={row.sessionId}><th scope="row" className="session-id">{row.sessionId}</th><td>{row.source}</td><td>{started(row.startedAt)}</td><td className="number">{duration(row.visibleTimeMs)}</td><td>{row.purchased ? 'Yes' : 'No'}</td></tr>)}{!data.sessionRows.length && <tr><td colSpan="5" className="state">No tracked sessions in this period.</td></tr>}</tbody></table></div></section></>;
}
class ReadError extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed:true }; }
  render() { return this.state.failed ? <div className="state" role="alert"><h1>Numbers are unavailable</h1><p>Your account may not have store access, or the report could not load. No partial totals are shown.</p><button onClick={() => location.reload()}>Try again</button></div> : this.props.children; }
}
function App() {
  const { isLoading,isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  if (isLoading) return <p className="state" role="status">Checking founder access…</p>;
  if (!isAuthenticated) return <SignIn/>;
  return <div className="shell"><header><a className="brand" href="/founder/index.html">ChasmaKart<span/></a><span>Founder view</span><button className="quiet" onClick={() => signOut()}>Sign out</button></header><main><ReadError><Report/></ReadError></main><footer>Store: chasma-kart · Private reporting</footer></div>;
}
createRoot(document.querySelector('#root')).render(<ConvexAuthProvider client={client}><App/></ConvexAuthProvider>);
