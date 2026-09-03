// Strips emoji from signal/output text before it's displayed. Source and
// LLM-generated content sometimes leads bullets with an emoji (e.g. "🚀
// Entegrata is..."); the UI's icon language is SVG throughout, so emoji in
// rendered content read as an inconsistent, off-brand glyph. Display-only -
// never applied to what's stored or sent to the LLM.
const EMOJI_PATTERN =
  // Emoji blocks, regional indicators, skin-tone modifiers, the zero-width
  // joiner used to combine them, and the variation selector (U+FE0F) that
  // otherwise survives as an invisible leftover glyph once the emoji itself
  // is stripped.
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{200D}\u{FE0F}]/gu;

export function stripEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, '').replace(/[ \t]{2,}/g, ' ').trim();
}
