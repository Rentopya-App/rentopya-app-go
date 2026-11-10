import { LegalRoute, legalMetadata } from "@/features/legal/server";

export function generateMetadata() {
  return legalMetadata("account-deletion", "tr");
}

export default function AccountDeletePage() {
  return <LegalRoute slug="account-deletion" locale="tr" />;
}
