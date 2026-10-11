/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alertEmail from "../alertEmail.js";
import type * as alertMath from "../alertMath.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as emailMath from "../emailMath.js";
import type * as founder from "../founder.js";
import type * as founderMath from "../founderMath.js";
import type * as founderVerify from "../founderVerify.js";
import type * as http from "../http.js";
import type * as insightMath from "../insightMath.js";
import type * as insights from "../insights.js";
import type * as tracking from "../tracking.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alertEmail: typeof alertEmail;
  alertMath: typeof alertMath;
  alerts: typeof alerts;
  auth: typeof auth;
  crons: typeof crons;
  emailMath: typeof emailMath;
  founder: typeof founder;
  founderMath: typeof founderMath;
  founderVerify: typeof founderVerify;
  http: typeof http;
  insightMath: typeof insightMath;
  insights: typeof insights;
  tracking: typeof tracking;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
