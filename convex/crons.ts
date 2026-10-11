import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("expire raw visits after 90 days", { minutes: 10 }, internal.tracking.expireVisits, {});
// 03:30 UTC is 09:00 IST; compare only complete local days.
crons.daily("check traffic drops at 9am IST", { hourUTC: 3, minuteUTC: 30 }, internal.alerts.daily, {});
export default crons;
