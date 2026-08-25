// Splits a Crayon Spark into the individual competitor updates it bundles.
//
// Path B (see the Phase One plan): Crayon's Insights API is not enabled on the
// account, so the feed is built from Sparks. Each Spark is a briefing containing
// roughly five separate updates, each prefixed with a category emoji and ending
// in a footnote marker that points at the underlying source.
//
// Example line:
//   🚀 **AvePoint's Confidence Platform update** adds AI governance ... [^1]
//
// This module turns that into one update per bullet, with a derived type and its
// own source link, which is what the per-competitor feed and the type filter
// need. If Crayon later enables the Insights API, the feed reads real typed
// items instead and this derivation is no longer needed.

export type UpdateType = 'release' | 'pricing' | 'win' | 'expansion' | 'risk' | 'other';

export interface ParsedUpdate {
  /** Stable within a Spark: used to build a deterministic id. */
  index: number;
  type: UpdateType;
  text: string;
  /** The underlying Crayon insight this bullet cited, when it had a footnote. */
  sourceUrl: string | null;
}

// Crayon's own Spark prompt asks for these emoji, so they are a reliable signal
// rather than a guess. Anything unrecognised falls through to 'other'.
const EMOJI_TYPE: { emoji: string; type: UpdateType }[] = [
  { emoji: '🚀', type: 'release' },
  { emoji: '💸', type: 'pricing' },
  { emoji: '🏆', type: 'win' },
  { emoji: '🌍', type: 'expansion' },
  { emoji: '⚠️', type: 'risk' },
  { emoji: '⚠', type: 'risk' },
];

export const TYPE_LABELS: Record<UpdateType, string> = {
  release: 'Release',
  pricing: 'Pricing',
  win: 'Customer win',
  expansion: 'Expansion',
  risk: 'Risk',
  other: 'Other',
};

/** Collects the `[^n]: url` footnote definitions at the end of a Spark. */
function collectFootnotes(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /^\s*\[\^([^\]]+)\]:\s*(\S+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    map.set(m[1], m[2].replace(/[).,]+$/, ''));
  }
  return map;
}

/** Strips markdown emphasis and the trailing footnote marker from a bullet. */
function cleanText(s: string): string {
  return s
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Derives a type from the wording, for Sparks written without category emoji.
 * Deliberately conservative: anything unclear stays 'other' rather than being
 * forced into a category the text does not support.
 */
function typeFromText(text: string): UpdateType {
  const t = text.toLowerCase();
  if (/\bpricing\b|\bprice\b|\bper[- ]seat\b|\bsubscription cost\b|\bdiscount\b/.test(t)) return 'pricing';
  if (/\blaunch|\breleas|\bgenerally available\b|\bga\b|\bunveil|\bintroduc|\bnew (product|feature|module|capability)\b|\bannounced .*(product|feature|platform)\b/.test(t)) return 'release';
  if (/\bcustomer win\b|\bselected\b|\bchose\b|\badopt(ed|ion)\b|\bcase study\b|\bcustomer story\b/.test(t)) return 'win';
  if (/\bhiring\b|\brecruit|\bappointed\b|\bnew office\b|\bexpand|\bregion|\bmarket entry\b/.test(t)) return 'expansion';
  if (/\brisk\b|\bbreach\b|\bincident\b|\bconcern\b|\bpressure\b|\bchallenge\b|\blimitation/.test(t)) return 'risk';
  return 'other';
}

/**
 * Splits one Spark's content into its individual updates.
 *
 * Two Spark formats are handled. Most use a category emoji per bullet, which is
 * the reliable signal. Some (typically the "news summary" style) use bold-headed
 * bullets with no emoji; those are still real updates, so they are captured with
 * a type derived from the wording rather than dropped.
 *
 * Returns an empty array only when nothing bullet-like is found, in which case
 * the caller should treat the whole Spark as a single update.
 */
export function parseSparkUpdates(content: string): ParsedUpdate[] {
  if (!content) return [];
  const footnotes = collectFootnotes(content);

  // Drop the footnote definition block so it is not mistaken for a bullet.
  const body = content.replace(/^\s*\[\^[^\]]+\]:.*$/gm, '');

  const updates: ParsedUpdate[] = [];
  for (const rawLine of body.split('\n')) {
    const isBullet = /^\s*[-*]\s+/.test(rawLine);
    const line = rawLine.replace(/^\s*[-*]\s*/, '').trim();
    if (!line) continue;

    // Some Sparks are written as markdown tables rather than bullets. A table
    // row is a fragment, not a standalone update, and renders as unreadable
    // pipe-delimited text in the feed, so those lines are skipped.
    if (line.startsWith('|') || /\|\s*---/.test(line)) continue;

    const emojiMatch = EMOJI_TYPE.find((e) => line.startsWith(e.emoji));

    // Emoji bullets are the common case. Otherwise accept a markdown bullet and
    // derive the type from the wording, so emoji-less Sparks are not dropped.
    let type: UpdateType;
    let rest: string;
    if (emojiMatch) {
      type = emojiMatch.type;
      rest = line.slice(emojiMatch.emoji.length);
    } else if (isBullet) {
      rest = line;
      type = typeFromText(rest);
    } else {
      continue;
    }

    const text = cleanText(rest);
    // Skip fragments too short to be a real update.
    if (text.split(/\s+/).length < 8) continue;
    // Skip anything that never forms a sentence (stray headers, label rows).
    if (!/[.!?]/.test(text)) continue;

    // First footnote referenced by this bullet is its source.
    const refMatch = line.match(/\[\^([^\]]+)\]/);
    const sourceUrl = refMatch ? footnotes.get(refMatch[1]) ?? null : null;

    updates.push({ index: updates.length, type, text, sourceUrl });
  }

  return updates;
}
