import { defineApp } from "convex/server";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// Convex Auth requires root discovery routes. The app router serves those
// exact routes and delegates static files to the existing hosting component.
const app = defineApp();
app.use(staticHosting);

export default app;
