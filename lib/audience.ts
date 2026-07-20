// Display labels for the four audiences. The underlying data values stay
// 'sales' | 'product' | 'marketing' | 'leadership' (DB enum + API); these are
// only what the UI shows.
export const AUDIENCE_LABELS: Record<string, string> = {
  sales: 'Sales & Customer Success',
  product: 'Product Management',
  marketing: 'Marketing',
  leadership: 'Executive Leadership Team',
};

export function audienceLabel(a: string): string {
  return AUDIENCE_LABELS[(a ?? '').toLowerCase()] ?? a;
}
