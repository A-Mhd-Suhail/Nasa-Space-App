"use client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = new URLSearchParams(window.location.search).get("next") ?? "/app";
        // Runs outside React (auth client hook), so a full navigation is intended here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login/two-factor?next=${encodeURIComponent(next)}`);
      },
    }),
  ],
});
