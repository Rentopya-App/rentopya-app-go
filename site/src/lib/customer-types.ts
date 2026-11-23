/** Customer portal API shapes the site's customer area reads (TEC-1284). */

export type PortalInfo = {
  organization: { slug: string; name: string };
  channels: { sms: boolean; email: boolean };
};

export type StartResult = {
  status: string;
  channel: "sms" | "email";
  resend_after_seconds: number;
  code_ttl_seconds: number;
};

export type CustomerSession = {
  organization: { slug: string; name: string };
  role: "renter" | "driver";
  display_name: string;
  channel: string;
  contact_masked: string;
  expires_at: string;
  hard_expires_at: string;
};

export type SessionIssued = {
  session_token: string;
  session: CustomerSession;
};

export type CustomerPrice = {
  currency: string;
  total: string;
  prepayment: string;
  paid: string;
  prepayment_due: string;
  balance: string;
};

export type CustomerReservationSummary = {
  uuid: string;
  reference: string;
  status: string;
  payment_status: string;
  starts_at: string;
  ends_at: string;
  pickup_branch: string;
  return_branch: string;
  product: string;
  price: CustomerPrice;
};

export type CustomerDocument = {
  uuid: string;
  kind: string;
  status: string;
  version_number: number;
  pdf_available: boolean;
  download_path?: string;
  approval_url?: string;
  approval_due?: string;
  updated_at: string;
};

export type CustomerInvoice = {
  uuid: string;
  number: string;
  issue_date: string;
  payable_amount: string;
  currency: string;
  download_path: string;
};

export type CustomerRequest = {
  uuid: string;
  type: "change" | "cancel";
  status: "open" | "resolved" | "rejected";
  message: string;
  requested_starts_at: string | null;
  requested_ends_at: string | null;
  outcome: string;
  resolution_note: string;
  created_at: string;
};

export type CustomerReservation = CustomerReservationSummary & {
  pickup_point: string;
  return_point: string;
  vehicle: string;
  drivers: string[];
  extras: { name: string; quantity: number; amount: string }[];
  payment_deadline: string | null;
  policies: Record<string, string>;
  cancellation: {
    policy_text: string;
    fee: string | null;
    self_cancel: boolean;
  };
  actions: {
    pay: boolean;
    pay_amount: string | null;
    request_change: boolean;
    request_cancel: boolean;
  };
  documents: CustomerDocument[];
  invoices: CustomerInvoice[];
  requests: CustomerRequest[];
};

export type PayResult = {
  url: string;
  amount: string;
  currency: string;
  expires_at: string;
};
