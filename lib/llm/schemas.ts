import { z } from 'zod';

export const urgencyEnum = z.enum(['low', 'medium', 'high']);

/**
 * A text field that tolerates the shape variations small local models emit:
 * an array of strings (joined into paragraphs), or a number/boolean (coerced
 * to text). Keeps a single off-shape response from failing the whole signal.
 * Output type stays `string`.
 */
const asText = (x: unknown): string => (typeof x === 'string' ? x : JSON.stringify(x));

export const flexibleString: z.ZodType<string, z.ZodTypeDef, unknown> = z
  .union([z.string(), z.array(z.any()), z.number(), z.boolean(), z.record(z.any())])
  .transform((v): string => {
    if (Array.isArray(v)) return v.map(asText).join('\n\n');
    if (v && typeof v === 'object') {
      // Object shape (e.g. an { objection, response } battlecard) → readable
      // "Objection: … Response: …" text.
      return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => `${k.charAt(0).toUpperCase()}${k.slice(1).replace(/_/g, ' ')}: ${asText(val)}`)
        .join(' ');
    }
    return String(v);
  });

/** Urgency that tolerates casing/whitespace (e.g. "High " → "high"). */
const flexibleUrgency: z.ZodType<'low' | 'medium' | 'high', z.ZodTypeDef, unknown> = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(urgencyEnum);

/** A string array that tolerates non-string elements. */
const flexibleStringArray: z.ZodType<string[], z.ZodTypeDef, unknown> = z
  .array(z.any())
  .transform((a) => a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));

export const classificationSchema = z.object({
  competitor: flexibleString,
  signal_type: flexibleString,
  business_area: flexibleString,
  urgency: flexibleUrgency,
  audience_relevance: z.object({
    sales: flexibleUrgency,
    product: flexibleUrgency,
    marketing: flexibleUrgency,
    leadership: flexibleUrgency,
  }),
});
export type Classification = z.infer<typeof classificationSchema>;

export const interpretationSchema = z.object({
  signal_summary: flexibleString,
  why_it_matters: flexibleString,
  // A specific, actionable recommendation grounded in the signal + Litera
  // context — the "what to do next" beyond what-changed/why-it-matters. Tolerant
  // like the other strings; a reviewer can edit it before approval.
  what_to_do_next: flexibleString,
  unverified_claims: flexibleStringArray,
  // The specific customer/prospect/account named in the signal, if any (e.g. a
  // firm in a sales call). Empty for general market news. Tolerant: never fails
  // validation — a missing/odd value just becomes ''. Used to keep the customer
  // name out of Marketing outputs.
  subject_account: z.any().transform((v) => (typeof v === 'string' ? v.trim() : '')),
});
export type Interpretation = z.infer<typeof interpretationSchema>;

export const salesPackagingSchema = z.object({
  talk_track: flexibleString,
  battlecard_snippet: flexibleString,
  live_talking_points: flexibleString,
});

export const productPackagingSchema = z.object({
  watchout: flexibleString,
});

export const marketingPackagingSchema = z.object({
  marketing_angle: flexibleString,
});

export const leadershipPackagingSchema = z.object({
  leadership_summary: flexibleString,
});

export const packagingSchemaByAudience = {
  sales: salesPackagingSchema,
  product: productPackagingSchema,
  marketing: marketingPackagingSchema,
  leadership: leadershipPackagingSchema,
} as const;
