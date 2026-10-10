import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
const crons = cronJobs();
crons.interval("expire raw visits after 90 days", { minutes: 10 }, internal.tracking.expireVisits, {});
export default crons;
