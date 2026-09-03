import type { Classification } from '../llm/schemas';

export type Audience = 'sales' | 'product' | 'marketing' | 'leadership';
export type RoutingDecision = 'auto' | 'reviewer_discretion' | 'skip';

/**
 * Stage 4 - Audience Routing. Deterministic rule layer, not an LLM call -
 * see 02-PIPELINE-STAGES.md. Keep it cheap and predictable.
 */
export function routeAudiences(
  audienceRelevance: Classification['audience_relevance']
): Record<Audience, RoutingDecision> {
  const decision = (level: 'low' | 'medium' | 'high'): RoutingDecision => {
    if (level === 'high') return 'auto';
    if (level === 'medium') return 'reviewer_discretion';
    return 'skip';
  };

  return {
    sales: decision(audienceRelevance.sales),
    product: decision(audienceRelevance.product),
    marketing: decision(audienceRelevance.marketing),
    leadership: decision(audienceRelevance.leadership),
  };
}
