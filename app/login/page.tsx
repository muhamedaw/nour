"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The login gate now lives in AuthGate (components/auth/AuthGate.tsx),
 * wrapping the whole app at the root layout — there's no server left to
 * redirect unauthenticated requests to a separate /login route. Anything
 * that still links here just bounces back to "/", where AuthGate shows the
 * same password form inline if the device isn't unlocked yet.
 */
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
