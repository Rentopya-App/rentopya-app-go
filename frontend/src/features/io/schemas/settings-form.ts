import { z } from "zod";

export const PAPER_SIZES = ["A4", "A3", "Letter", "Legal"] as const;

export type PaperSize = (typeof PAPER_SIZES)[number];

/** The form schema; capMessage is the translated range error of the caps. */
export function createSettingsFormSchema(capMessage = "1 – 100000") {
  const cap = z.coerce
    .number(capMessage)
    .int(capMessage)
    .min(1, capMessage)
    .max(100000, capMessage);
  return z.object({
    company_name: z.string().trim().min(1),
    tagline: z.string().trim(),
    primary_color: z
      .string()
      .trim()
      .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color"),
    paper_size: z.enum(PAPER_SIZES),
    address: z.string().trim(),
    phone: z.string().trim(),
    email: z.string().trim(),
    website: z.string().trim(),
    footer_text: z.string().trim(),
    // TEC-1282: hourly caps per organization on public writes.
    public_reservations_per_hour: cap,
    public_leads_per_hour: cap,
  });
}

export const settingsFormSchema = createSettingsFormSchema();

export type SettingsFormValues = z.output<typeof settingsFormSchema>;

export function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed}`;
  return fallback;
}

export function toSettingsFormValues(
  data: {
    company_name: string;
    tagline: string;
    primary_color: string;
    paper_size: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    footer_text: string;
    public_reservations_per_hour: number;
    public_leads_per_hour: number;
  },
  fallbackColor: string,
): SettingsFormValues {
  const paperSize = PAPER_SIZES.includes(data.paper_size as PaperSize)
    ? (data.paper_size as PaperSize)
    : "A4";

  return {
    company_name: data.company_name,
    tagline: data.tagline,
    primary_color: normalizeHexColor(data.primary_color, fallbackColor),
    paper_size: paperSize,
    address: data.address,
    phone: data.phone,
    email: data.email,
    website: data.website,
    footer_text: data.footer_text,
    public_reservations_per_hour: data.public_reservations_per_hour,
    public_leads_per_hour: data.public_leads_per_hour,
  };
}

export function toPatchPayload(values: SettingsFormValues) {
  return {
    company_name: values.company_name,
    tagline: values.tagline,
    primary_color: values.primary_color,
    paper_size: values.paper_size,
    address: values.address,
    phone: values.phone,
    email: values.email,
    website: values.website,
    footer_text: values.footer_text,
    public_reservations_per_hour: values.public_reservations_per_hour,
    public_leads_per_hour: values.public_leads_per_hour,
  };
}
