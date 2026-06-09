// MANUAL.md を Word(.docx) に変換するスクリプト（配布用マニュアル生成）
// 使い方:
//   1) npm install --no-save docx   （docx を一時的に取得。package.json は汚さない）
//   2) node scripts/md-to-docx.mjs  （施設点数管理アプリ_マニュアル.docx を生成）
// 生成された .docx は .gitignore 済み（MANUAL.md から再生成できるため）。
import { readFileSync, writeFileSync } from 'fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType,
} from 'docx';

const md = readFileSync('MANUAL.md', 'utf8');
const lines = md.split(/\r?\n/);

const children = [];
let tableBuf = null;

function flushTable() {
  if (!tableBuf || tableBuf.length === 0) { tableBuf = null; return; }
  const rows = tableBuf.filter((r) => !/^[\s|:-]+$/.test(r)); // 区切り行を除く
  const trs = rows.map((line, ri) => {
    const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    return new TableRow({
      children: cells.map((c) =>
        new TableCell({
          width: { size: Math.floor(100 / cells.length), type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: parseInline(c, ri === 0) })],
        })
      ),
    });
  });
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: trs,
  }));
  children.push(new Paragraph({ text: '' }));
  tableBuf = null;
}

// **太字** を TextRun に変換（簡易）
function parseInline(text, bold = false) {
  const runs = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== '');
  if (parts.length === 0) return [new TextRun({ text: '', bold })];
  for (const p of parts) {
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      runs.push(new TextRun({ text: p.slice(2, -2), bold: true }));
    } else {
      runs.push(new TextRun({ text: p, bold }));
    }
  }
  return runs;
}

for (const raw of lines) {
  const line = raw;
  if (/^\s*\|/.test(line)) { (tableBuf ??= []).push(line.trim()); continue; }
  if (tableBuf) flushTable();

  if (line.trim() === '') { children.push(new Paragraph({ text: '' })); continue; }
  if (line.startsWith('# ')) {
    children.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.TITLE }));
  } else if (line.startsWith('## ')) {
    children.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_1 }));
  } else if (line.startsWith('### ')) {
    children.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_2 }));
  } else if (line.startsWith('> ')) {
    children.push(new Paragraph({
      children: parseInline(line.slice(2)),
      shading: { fill: 'FFF7E6' },
      spacing: { before: 60, after: 60 },
    }));
  } else if (/^[-*] /.test(line.trim())) {
    children.push(new Paragraph({ children: parseInline(line.trim().slice(2)), bullet: { level: 0 } }));
  } else if (/^\d+\. /.test(line.trim())) {
    children.push(new Paragraph({ children: parseInline(line.trim().replace(/^\d+\.\s/, '')), numbering: undefined, bullet: { level: 0 } }));
  } else if (/^---+$/.test(line.trim())) {
    children.push(new Paragraph({ border: { bottom: { color: 'CCCCCC', style: BorderStyle.SINGLE, size: 6 } }, text: '' }));
  } else {
    children.push(new Paragraph({ children: parseInline(line) }));
  }
}
if (tableBuf) flushTable();

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Yu Gothic', size: 21 } },
    },
  },
  sections: [{ properties: {}, children }],
});

const buf = await Packer.toBuffer(doc);
writeFileSync('施設点数管理アプリ_マニュアル.docx', buf);
console.log('生成しました: 施設点数管理アプリ_マニュアル.docx');
