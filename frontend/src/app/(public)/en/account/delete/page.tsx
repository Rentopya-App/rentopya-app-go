import { LegalRoute, legalMetadata } from "@/features/legal/server";

export function generateMetadata() {
  return legalMetadata("account-deletion", "en");
}

export default function AccountDeletePageEn() {
  return <LegalRoute slug="account-deletion" locale="en" />;
}
