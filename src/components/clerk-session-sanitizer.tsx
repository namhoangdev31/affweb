"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export function ClerkSessionSanitizer() {
  const { loaded, session, signOut } = useClerk();

  useEffect(() => {
    if (!loaded || !session) return;

    let mounted = true;
    session
      .getToken()
      .then((token) => {
        if (!token && mounted) {
          signOut({ redirectUrl: "/sign-in" });
        }
      })
      .catch(() => {
        if (mounted) {
          signOut({ redirectUrl: "/sign-in" });
        }
      });

    return () => {
      mounted = false;
    };
  }, [loaded, session, signOut]);

  return null;
}
