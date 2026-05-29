// Convert the draft Markdown produced by the AI into a Word (.docx) Buffer.
//
// This is intentionally a small, dependency-light Markdown subset — sufficient
// for the headings, paragraphs and bullets the agent emits. If we need richer
// formatting later (tables, code, links) we can swap for `marked` + custom mapping.

import { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } from 'docx';

const HEADING_MAP = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// Parse inline **bold**, *italic* and `code` into TextRuns.
function inlineRuns(text) {
  const out = [];
  // Regex captures bold, italic, code, or plain.
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun(text.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(new TextRun({ text: tok.slice(2, -2), bold: true }));
    } else if (tok.startsWith('`')) {
      out.push(new TextRun({ text: tok.slice(1, -1), font: 'Courier New' }));
    } else if (tok.startsWith('*')) {
      out.push(new TextRun({ text: tok.slice(1, -1), italics: true }));
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun(text.slice(last)));
  return out.length ? out : [new TextRun(text)];
}

function paragraphsFromMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let paragraphBuf = [];
  let seenHeading = false;

  const flushPara = () => {
    if (!paragraphBuf.length) return;
    out.push(new Paragraph({ children: inlineRuns(paragraphBuf.join(' ')) }));
    paragraphBuf = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Blank line → paragraph break
    if (!line.trim()) { flushPara(); continue; }

    // Headings — add a thin top border so each section is visually separated
    // by a hairline rule above the heading text. Skipped for the very first
    // heading in the document (no rule above the doc title).
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      const para = new Paragraph({
        heading: HEADING_MAP[level],
        children: inlineRuns(h[2]),
        border: seenHeading ? {
          top: { color: 'BFBFBF', space: 8, style: 'single', size: 8 },
        } : undefined,
      });
      out.push(para);
      seenHeading = true;
      continue;
    }

    // Bullets
    const b = line.match(/^[-*+]\s+(.*)$/);
    if (b) {
      flushPara();
      out.push(new Paragraph({
        children: inlineRuns(b[1]),
        bullet: { level: 0 },
      }));
      continue;
    }

    // Numbered list
    const n = line.match(/^\d+\.\s+(.*)$/);
    if (n) {
      flushPara();
      out.push(new Paragraph({
        children: inlineRuns(n[1]),
        numbering: { reference: 'numbered-list', level: 0 },
      }));
      continue;
    }

    // Horizontal rule
    if (/^[-=*_]{3,}$/.test(line)) {
      flushPara();
      out.push(new Paragraph({ children: [new TextRun('')], border: { bottom: { color: '999999', space: 1, style: 'single', size: 6 } } }));
      continue;
    }

    // Block-quote
    if (line.startsWith('>')) {
      flushPara();
      out.push(new Paragraph({
        children: inlineRuns(line.replace(/^>\s?/, '')),
        indent: { left: 360 },
        alignment: AlignmentType.LEFT,
      }));
      continue;
    }

    // Default — accumulate into current paragraph
    paragraphBuf.push(line);
  }
  flushPara();
  return out;
}

export async function markdownToDocxBuffer(markdown, { title } = {}) {
  const children = paragraphsFromMarkdown(markdown);
  const doc = new Document({
    creator: "Mary's House Grant Finder",
    title: title || 'Grant Application Draft',
    description: 'AI-generated draft application',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 22 }, // 11pt body
          paragraph: { spacing: { after: 160 } }, // ~8pt after every paragraph
        },
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal',
          run: { font: 'Arial', size: 32, bold: true, color: '000000' },
          paragraph: { spacing: { before: 320, after: 200 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal',
          run: { font: 'Arial', size: 26, bold: true, color: '000000' },
          paragraph: { spacing: { before: 280, after: 180 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal',
          run: { font: 'Arial', size: 22, bold: true, color: '000000' },
          paragraph: { spacing: { before: 240, after: 160 } } },
      ],
    },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
