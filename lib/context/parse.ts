// Turns an uploaded context document into (a) plain text and (b) sections split
// along the document's own headings.
//
// Sectioning matters: the relevance note is grounded against a single section,
// not a whole document, so the model only ever sees the part that is actually
// relevant, and the note can cite which section it came from.

export interface ParsedSection {
  heading: string;
  content: string;
  position: number;
  wordCount: number;
}

export interface ParsedDocument {
  fullText: string;
  wordCount: number;
  sections: ParsedSection[];
}

function countWords(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

/**
 * Cleans markdown artifacts out of a heading so it reads as a plain title.
 * mammoth escapes punctuation (`1\.`) and carries bold markers (`__`) across
 * from Word; both would otherwise show up in the UI and in the citation the
 * relevance note gives back to the reader.
 */
function cleanHeading(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/^#+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts text from a .docx buffer. mammoth converts Word headings to
 * markdown-style `#` lines, which is what splitIntoSections keys off.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  // Imported lazily so this module stays usable in contexts that never parse
  // a .docx (and so the dependency is not pulled into the client bundle).
  // convertToMarkdown is present at runtime but missing from mammoth's exported
  // types, hence the cast. Markdown output preserves Word headings as `#` lines,
  // which is what splitIntoSections keys off.
  const mammoth = (await import('mammoth')) as unknown as {
    convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.convertToMarkdown({ buffer });
  return result.value;
}

/**
 * Splits document text into sections at its headings.
 *
 * Handles both markdown headings (`## Title`) and the common Word pattern of a
 * short standalone line acting as a heading. Content before the first heading
 * is kept under an "Overview" section so nothing is silently dropped.
 *
 * Very short sections are merged into the previous one — a lone heading with
 * one line under it is not useful to ground against on its own.
 */
export function splitIntoSections(text: string): ParsedSection[] {
  const lines = text.split('\n');
  const raw: { heading: string; body: string[] }[] = [];
  let current: { heading: string; body: string[] } = { heading: 'Overview', body: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      current.body.push('');
      continue;
    }

    const md = trimmed.match(/^#{1,6}\s+(.*)$/);
    // A short, punctuation-free standalone line reads as a heading in Word
    // documents that lost their heading styles during conversion.
    const looksLikeHeading =
      !md &&
      trimmed.length <= 80 &&
      !/[.!?,;]$/.test(trimmed) &&
      countWords(trimmed) <= 10 &&
      !trimmed.startsWith('-') &&
      !trimmed.startsWith('*') &&
      !/^\d+\./.test(trimmed) &&
      !/^\|/.test(trimmed);

    if (md || looksLikeHeading) {
      if (current.body.some((l) => l.trim())) raw.push(current);
      current = { heading: cleanHeading(md ? md[1] : trimmed), body: [] };
    } else {
      current.body.push(line);
    }
  }
  if (current.body.some((l) => l.trim())) raw.push(current);

  // Merge sections too small to stand alone into the previous section.
  const MIN_WORDS = 15;
  const merged: { heading: string; body: string[] }[] = [];
  for (const sec of raw) {
    const words = countWords(sec.body.join(' '));
    if (words < MIN_WORDS && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.body.push('', sec.heading, ...sec.body);
    } else {
      merged.push(sec);
    }
  }

  return merged.map((sec, i) => {
    const content = sec.body.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return {
      // A heading can clean down to nothing (e.g. a line that was only bold
      // markers); fall back so every section stays identifiable.
      heading: sec.heading || `Section ${i + 1}`,
      content,
      position: i,
      wordCount: countWords(content),
    };
  });
}

/** Parses a .docx buffer into full text plus sections. */
export async function parseDocx(buffer: Buffer): Promise<ParsedDocument> {
  const fullText = await extractDocxText(buffer);
  const sections = splitIntoSections(fullText);
  return { fullText, wordCount: countWords(fullText), sections };
}

/** Parses plain text (e.g. a .txt or .md upload) into full text plus sections. */
export function parsePlainText(text: string): ParsedDocument {
  return {
    fullText: text,
    wordCount: countWords(text),
    sections: splitIntoSections(text),
  };
}
