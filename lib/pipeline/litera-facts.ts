// The ONLY confirmed facts the pipeline is allowed to state about Litera (the
// company we represent).
//
// It is intentionally EMPTY. We currently have NO verified data about Litera's
// certifications, products, features, or security posture. Empty means the AI
// must assume NOTHING about Litera: any Litera capability it would need to make
// a point is instead reported as plain information (what the customer asked for)
// so the rep can decide - never stated as a Litera fact, never invented.
//
// When a fact about Litera is actually confirmed by the business, add it here as
// a short string (e.g. 'Holds SOC 2 Type II certification'). From then on the
// pipeline may state it directly.
export const LITERA_FACTS: string[] = [];

/** Renders the Litera facts for a prompt - or a hard "assume nothing" notice. */
export function literaFactsBlock(): string {
  if (LITERA_FACTS.length === 0) {
    return (
      'NONE - there is NO confirmed information about Litera available. Do NOT ' +
      'claim, imply, or invent ANY Litera capability, certification, product, ' +
      'feature, pricing, or security posture. If a point would need such a fact, ' +
      'do NOT state it - instead just report, as plain information, what the ' +
      'customer asked for or raised, so the rep can decide.'
    );
  }
  return LITERA_FACTS.map((f) => `- ${f}`).join('\n');
}
