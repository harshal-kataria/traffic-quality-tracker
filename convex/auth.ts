import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      // Accounts are provisioned by the authenticated deployment owner, never by public sign-up.
      if (params.flow !== "signIn" || typeof params.email !== "string") throw new Error("Founder sign-in only");
      return { email: params.email.trim().toLowerCase() };
    },
  })],
});
