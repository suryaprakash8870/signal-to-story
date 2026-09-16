/**
 * Turns GETTING-STARTED.md into a Word document people can read without opening
 * GitHub. Handles only the constructs that document actually uses, so it stays
 * short enough to check by eye rather than being a general Markdown engine.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  BorderStyle, WidthType, ShadingType, ExternalHyperlink, convertInchesToTwip,
} = require('docx');
const fs = require('fs');

// Litera's accents, matching the product theme and the earlier one-pager.
const INK = '10202B';
const INK2 = '55666F';
const INK3 = '8B9AA2';
const TEAL = '0E8C89';
const AMBER = '8F6300';
const RULE = 'DFDCD5';
const CODEBG = 'F4F2ED';

const DISPLAY = 'Archivo';
const BODY = 'Source Serif Pro';
const MONO = 'Consolas';

/** Splits inline markup into runs. Handles `code`, **bold** and [text](url). */
function runs(text, opts = {}) {
  const base = { font: opts.font || BODY, size: opts.size || 21, color: opts.color || INK };
  const out = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const tok = m[0];
    if (tok.startsWith('`')) {
      out.push(new TextRun({ ...base, text: tok.slice(1, -1), font: MONO, size: base.size - 2, color: AMBER }));
    } else if (tok.startsWith('**')) {
      out.push(new TextRun({ ...base, text: tok.slice(2, -2), font: DISPLAY, bold: true }));
    } else {
      const label = tok.slice(1, tok.indexOf(']'));
      const url = tok.slice(tok.indexOf('(') + 1, -1);
      // Links between the repo's own files mean nothing in Word, so they are
      // shown as plain emphasis rather than a link that goes nowhere.
      if (/^https?:/.test(url)) {
        out.push(new ExternalHyperlink({
          link: url,
          children: [new TextRun({ ...base, text: label, color: TEAL, underline: {} })],
        }));
      } else {
        out.push(new TextRun({ ...base, text: label, font: DISPLAY, bold: true }));
      }
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out.length ? out : [new TextRun({ ...base, text: '' })];
}

function heading(text, level) {
  const spec = {
    1: { size: 34, color: INK, before: 0, after: 140, rule: true },
    2: { size: 24, color: TEAL, before: 340, after: 130, rule: true },
    3: { size: 20, color: INK, before: 240, after: 90, rule: false },
  }[level];
  return new Paragraph({
    spacing: { before: spec.before, after: spec.after },
    keepNext: true,
    border: spec.rule ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } } : undefined,
    children: [new TextRun({ text, font: DISPLAY, bold: true, size: spec.size, color: spec.color })],
  });
}

function body(text) {
  return new Paragraph({ spacing: { before: 90, after: 90 }, children: runs(text) });
}

function listItem(text, marker, indentLevel = 0) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: {
      left: convertInchesToTwip(0.32 + indentLevel * 0.28),
      hanging: convertInchesToTwip(0.32),
    },
    children: [
      new TextRun({ text: marker + '\t', font: DISPLAY, bold: true, size: 21, color: TEAL }),
      ...runs(text),
    ],
  });
}

function codeBlock(lines) {
  return new Paragraph({
    spacing: { before: 120, after: 120 },
    shading: { type: ShadingType.CLEAR, fill: CODEBG },
    indent: { left: convertInchesToTwip(0.18), right: convertInchesToTwip(0.18) },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: TEAL, space: 8 } },
    children: lines.flatMap((l, i) => [
      ...(i ? [new TextRun({ break: 1 })] : []),
      new TextRun({ text: l || ' ', font: MONO, size: 18, color: INK }),
    ]),
  });
}

function cell(text, isHeader, width) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    shading: isHeader ? { type: ShadingType.CLEAR, fill: CODEBG } : undefined,
    children: [
      new Paragraph({
        children: isHeader
          ? [new TextRun({ text: text.replace(/[*`]/g, ''), font: DISPLAY, bold: true, size: 18, color: INK })]
          : runs(text, { size: 19, color: INK2 }),
      }),
    ],
  });
}

function table(rows) {
  const cols = rows[0].length;
  const width = Math.floor(100 / cols);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: RULE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: rows.map((cells, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: cells.map((c) => cell(c, i === 0, width)),
      })
    ),
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
    children: [new TextRun({ text: '' })],
  });
}

// ------------------------------------------------------------------ parsing
const md = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const children = [];
let i = 0;

// Masthead, in place of the first heading.
children.push(
  new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({
      text: 'LITERA  ·  COMPETE AGENT', font: DISPLAY, bold: true,
      size: 16, color: INK3, characterSpacing: 40,
    })],
  })
);

while (i < md.length) {
  const line = md[i];

  if (/^\s*$/.test(line)) { i++; continue; }

  if (/^---+\s*$/.test(line)) { children.push(divider()); i++; continue; }

  if (/^```/.test(line)) {
    const buf = [];
    i++;
    while (i < md.length && !/^```/.test(md[i])) buf.push(md[i++]);
    i++;
    children.push(codeBlock(buf));
    continue;
  }

  const h = line.match(/^(#{1,3})\s+(.*)$/);
  if (h) { children.push(heading(h[2], h[1].length)); i++; continue; }

  // A table is a header row, a separator row, then body rows.
  if (/^\s*\|/.test(line) && i + 1 < md.length && /^\s*\|[\s:|-]+\|\s*$/.test(md[i + 1])) {
    const rows = [];
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    rows.push(cells(md[i]));
    i += 2;
    while (i < md.length && /^\s*\|/.test(md[i])) rows.push(cells(md[i++]));
    children.push(table(rows));
    children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun('')] }));
    continue;
  }

  const ol = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (ol) {
    const level = Math.floor(ol[1].length / 3);
    let text = ol[3];
    i++;
    // Continuation lines are indented further and are not a new construct.
    while (i < md.length && /^\s{3,}\S/.test(md[i]) && !/^\s*[-*]\s/.test(md[i])
           && !/^\s*\|/.test(md[i]) && !/^\s*\d+\.\s/.test(md[i]) && !/^\s*```/.test(md[i])) {
      text += ' ' + md[i].trim();
      i++;
    }
    children.push(listItem(text, ol[2] + '.', level));
    continue;
  }

  const ul = line.match(/^(\s*)[-*]\s+(.*)$/);
  if (ul) {
    const level = Math.floor(ul[1].length / 3);
    let text = ul[2];
    i++;
    while (i < md.length && /^\s{3,}\S/.test(md[i]) && !/^\s*[-*]\s/.test(md[i])
           && !/^\s*\d+\.\s/.test(md[i]) && !/^\s*```/.test(md[i])) {
      text += ' ' + md[i].trim();
      i++;
    }
    children.push(listItem(text, '•', level));
    continue;
  }

  // Ordinary paragraph: gather until a blank line or a new construct.
  let text = line.trim();
  i++;
  while (i < md.length && !/^\s*$/.test(md[i]) && !/^#{1,3}\s/.test(md[i])
         && !/^\s*\|/.test(md[i]) && !/^\s*[-*]\s/.test(md[i])
         && !/^\s*\d+\.\s/.test(md[i]) && !/^```/.test(md[i]) && !/^---+\s*$/.test(md[i])) {
    text += ' ' + md[i].trim();
    i++;
  }
  children.push(body(text));
}

const doc = new Document({
  creator: 'Compete Agent',
  title: 'Compete Agent, getting started',
  styles: { default: { document: { run: { font: BODY, size: 21, color: INK } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: {
          top: convertInchesToTwip(0.85), bottom: convertInchesToTwip(0.75),
          left: convertInchesToTwip(0.9), right: convertInchesToTwip(0.9),
        },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(process.argv[3], buf);
  console.log('written:', process.argv[3], Math.round(buf.length / 1024) + 'kb');
});
