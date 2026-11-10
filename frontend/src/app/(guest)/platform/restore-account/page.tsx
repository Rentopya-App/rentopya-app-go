import type { Metadata } from "next";

import { RestoreAccountPage } from "@/features/account/components/restore-account-page";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Restore link of the account deletion e-mail: `/platform/restore-account#<token>`. */
export default function Page() {
  return <RestoreAccountPage />;
}
