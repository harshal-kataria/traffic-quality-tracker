import type { Doc } from "./_generated/dataModel";
import { excluded } from "./founderMath";
type Group = {subject:string;source:string;campaign:string;medium:string;sessions:number;visibleTimeMs:number;cartSessions:number;checkoutSessions:number;cartCheckoutSessions:number;purchasingSessions:number;confirmedSessions:number;cartPurchasingSessions:number;checkoutPurchasingSessions:number;singlePageSessions:number;values:Map<string,number>};
type Advice = {kind:string;subject:string;title:string;evidence:string;action:string;followUp:string};
const norm=(value:string|null|undefined,fallback="direct")=>value?.trim().toLowerCase()||fallback;
const pageOf=(url:string)=>{try {const p=new URL(url);return p.origin+p.pathname;}catch{return "Unknown landing page";}};

// All new analysis is based on session-start source and the first observed page.
// An order source can differ due to last-non-direct attribution in the existing report.
export function analyze(sessions:Doc<"sessions">[],visits:Doc<"visits">[],orders:Doc<"orders">[]) {
  const excludedIds=new Set(orders.filter(excluded).map(x=>x.sessionId));
  const events=new Map<string,Doc<"visits">[]>();
  for(const visit of visits){const list=events.get(visit.sessionId)||[];list.push(visit);events.set(visit.sessionId,list);}
  const purchases=new Map<string,Doc<"orders">[]>();
  for(const order of orders){if(excluded(order)||order.status==="cancelled"||order.status==="refunded")continue;const list=purchases.get(order.sessionId)||[];list.push(order);purchases.set(order.sessionId,list);}
  const sourceGroups=new Map<string,Group>(),campaignGroups=new Map<string,Group>(),landingGroups=new Map<string,Group>(),productGroups=new Map<string,Group>();
  const eligible=sessions.filter(x=>!excludedIds.has(x.sessionId));
  const journeys:Array<{sessionId:string;source:string;startedAt:number;steps:Array<{time:number;event:string;page:string}>;truncated:boolean}>=[];
  let missingPages=0;
  for(const session of eligible){
    const list=(events.get(session.sessionId)||[]).sort((a,b)=>a.time-b.time||a._creationTime-b._creationTime);
    const pages=list.filter(x=>!x.eventName||x.eventName==="page_view");
    const first=pages[0]; if(!first)missingPages++;
    const source=norm(session.source),campaign=norm(first?.utm_campaign,"(not tagged)"),medium=norm(first?.utm_medium,"(not tagged)");
    const purchased=purchases.get(session.sessionId)||[];
    const cart=list.some(x=>x.eventName==="add_to_cart"),checkout=list.some(x=>x.eventName==="begin_checkout");
    const confirmed=purchased.some(x=>x.status==="paid"||x.status==="delivered");
    const landing=first?pageOf(first.pageUrl):"Unknown landing page";
    const productPages=[...new Set(pages.map(x=>pageOf(x.pageUrl)).filter(x=>/\/products?\/[^/]+/.test(x)))];
    const targets:Array<[Map<string,Group>,string,string]>=[[sourceGroups,source,source],[campaignGroups,JSON.stringify([source,medium,campaign]),campaign],[landingGroups,JSON.stringify([landing,source]),landing],...productPages.map(x=>[productGroups,JSON.stringify([x,source]),x] as [Map<string,Group>,string,string])];
    for(const [map,key,subject] of targets){
      let row=map.get(key);if(!row){row={subject,source,campaign,medium,sessions:0,visibleTimeMs:0,cartSessions:0,checkoutSessions:0,cartCheckoutSessions:0,purchasingSessions:0,confirmedSessions:0,cartPurchasingSessions:0,checkoutPurchasingSessions:0,singlePageSessions:0,values:new Map()};map.set(key,row);}
      row.sessions++;row.visibleTimeMs+=Math.max(0,session.visibleTimeMs);row.cartSessions+=Number(cart);row.checkoutSessions+=Number(checkout);row.cartCheckoutSessions+=Number(cart&&checkout);row.purchasingSessions+=Number(purchased.length>0);row.confirmedSessions+=Number(confirmed);row.cartPurchasingSessions+=Number(cart&&purchased.length>0);row.checkoutPurchasingSessions+=Number(checkout&&purchased.length>0);row.singlePageSessions+=Number(pages.length===1);
      for(const order of purchased){const currency=order.currency||"INR";row.values.set(currency,(row.values.get(currency)||0)+order.orderValue);}
    }
    const steps=[...list.map(x=>({time:x.time,event:x.eventName||"page_view",page:pageOf(x.pageUrl)})),...purchased.map(x=>({time:x.time,event:"purchase",page:"Order recorded"}))].sort((a,b)=>a.time-b.time);
    journeys.push({sessionId:session.sessionId,source,startedAt:session.startedAt,steps:steps.slice(0,100),truncated:steps.length>100});
  }
  const finish=(map:Map<string,Group>)=>[...map.values()].map(({values,...row})=>({...row,averageTimeMs:row.visibleTimeMs/row.sessions,addToCartRate:row.cartSessions/row.sessions,purchaseRate:row.purchasingSessions/row.sessions,confirmedRate:row.confirmedSessions/row.sessions,cartToPurchaseRate:row.cartSessions?row.cartPurchasingSessions/row.cartSessions:null,checkoutToPurchaseRate:row.checkoutSessions?row.checkoutPurchasingSessions/row.checkoutSessions:null,values:[...values].sort(([a],[b])=>a.localeCompare(b)).map(([currency,valuePaise])=>({currency,valuePaise}))})).sort((a,b)=>b.sessions-a.sessions||a.subject.localeCompare(b.subject));
  const sources=finish(sourceGroups),campaigns=finish(campaignGroups).map(x=>({...x,campaign:x.subject})),landings=finish(landingGroups).map(x=>({...x,page:x.subject})),products=finish(productGroups).map(x=>({...x,page:x.subject}));
  const recommendations:Advice[]=[];
  for(const row of landings){
    if(row.sessions>=100&&row.addToCartRate<.02&&row.subject!=="Unknown landing page")recommendations.push({kind:"landing",subject:row.subject,title:`Check the landing page for ${row.source}`,evidence:`${row.cartSessions} of ${row.sessions} landing sessions added to cart (${(row.addToCartRate*100).toFixed(1)}%).`,action:"Check that the ad promise matches this page, and that price, delivery details and the add-to-cart button are clear. Test one change at a time.",followUp:"Compare add-to-cart rate after the next 100 eligible landing sessions. This pattern does not prove why shoppers left."});
  }
  for(const row of sources){
    if(row.cartSessions>=20&&row.cartCheckoutSessions/row.cartSessions<.5)recommendations.push({kind:"cart",subject:row.source,title:`Check the cart flow for ${row.source}`,evidence:`${row.cartCheckoutSessions} of ${row.cartSessions} cart sessions also began checkout. These counts are observed actions, not proof of their order.`,action:"Walk through cart to checkout on a phone. Check delivery charges, coupon errors and the checkout button.",followUp:"Watch checkout starts among the next 20 cart sessions before deciding whether the change helped."});
    if(row.checkoutSessions>=20&&row.checkoutToPurchaseRate!==null&&row.checkoutToPurchaseRate<.3)recommendations.push({kind:"checkout",subject:row.source,title:`Check checkout for ${row.source}`,evidence:`${row.checkoutPurchasingSessions} of ${row.checkoutSessions} checkout sessions also purchased (${(row.checkoutToPurchaseRate*100).toFixed(1)}%).`,action:"Test the payment options and order confirmation on a phone. Check failures and unexpected charges before changing traffic spend.",followUp:"Compare checkout-to-purchase rate after the next 20 checkout sessions. Missing checkout tracking can also affect this number."});
  }
  const enough=sources.filter(x=>x.sessions>=100);
  const total=enough.reduce((a,x)=>a+x.sessions,0),buyers=enough.reduce((a,x)=>a+x.confirmedSessions,0),average=total?buyers/total:0;
  for(const row of enough){const others=total-row.sessions,otherBuyers=buyers-row.confirmedSessions;const otherRate=others?otherBuyers/others:0;
    if(others>=100&&row.confirmedSessions>=5&&row.confirmedRate>=otherRate*1.5&&row.confirmedRate-otherRate>=.02)recommendations.push({kind:"source",subject:row.source,title:`Consider a small traffic test for ${row.source}`,evidence:`${row.confirmedSessions} of ${row.sessions} sessions have paid or delivered orders (${(row.confirmedRate*100).toFixed(1)}%), versus ${(otherRate*100).toFixed(1)}% across other sources with at least 100 sessions.`,action:"Check ad cost and profit margin first. If those support it, try a small, capped traffic increase and watch conversion.",followUp:"Review after the next 100 sessions. Higher conversion alone does not prove profitable ads; unconfirmed COD orders are excluded from this comparison."});
    else if(others>=100&&otherRate>0&&row.confirmedRate<otherRate*.5)recommendations.push({kind:"source-low",subject:row.source,title:`Review traffic quality from ${row.source}`,evidence:`${row.confirmedSessions} of ${row.sessions} sessions have paid or delivered orders (${(row.confirmedRate*100).toFixed(1)}%), versus ${(otherRate*100).toFixed(1)}% across other sufficiently sampled sources.`,action:"Check targeting and the ad-to-page match. Check whether COD delivery is still pending before cutting spend.",followUp:"Compare another 100 sessions and paid or delivered orders. This is an investigation prompt, not a proven cause."});
  }
  return {sources,campaigns,landings,products,journeys:journeys.sort((a,b)=>b.startedAt-a.startedAt).slice(0,20),recommendations:recommendations.slice(0,20),excludedSessions:sessions.length-eligible.length,eligibleSessions:eligible.length,missingPages,confirmedRate:average};
}
