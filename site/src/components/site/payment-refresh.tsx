"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const EVERY_MS = 3000;
const LIMIT = 100; // about five minutes

/**
 * While a returned payment is still being verified, re-renders the page
 * (the server asks the API again) every few seconds; after about five
 * minutes it stops and shows the "refresh later" text instead.
 */
export function PaymentRefresh({
  waiting,
  slow,
}: {
  waiting: string;
  slow: string;
}) {
  const router = useRouter();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count >= LIMIT) return;
    const id = window.setTimeout(() => {
      router.refresh();
      setCount((n) => n + 1);
    }, EVERY_MS);
    return () => window.clearTimeout(id);
  }, [count, router]);
  return <>{count >= LIMIT ? slow : waiting}</>;
}
