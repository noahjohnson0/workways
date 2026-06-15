#!/usr/bin/env node
// prose-scan — flag the mechanical "AI voice" tells in Markdown/MDX prose.
// Usage: node scripts/prose-scan.mjs <file...>
// Exits 1 if any tell is found, 0 if clean. No dependencies.
//
// It only catches regex-able tells (dashes, antithesis, aphorisms, hype words,
// fence-sitting). Rule-of-three triads and reveal-narration stay a human read.
// A clean scan is necessary, not sufficient. See docs/methods/writing-voice.md.

import { readFileSync } from 'node:fs';

const HYPE = String.raw`\b(revolutioniz\w*|game-?chang\w*|powerful|robust|comprehensive|seamless\w*|cutting-edge|unleash\w*|effortless\w*|supercharg\w*|delve\w*|elevate|streamlin\w*|empower\w*|leverage)\b`;

const RULES = [
  ['em/en-dash', /[—–]/g],
  ['" - " aside (em-dash substitute)', /[a-z,)] - [a-z(]/g],
  ['antithesis (not X, it\'s Y)', /\bis(?:n't| not)\b[^.\n]{0,45}?\bit'?s\b/gi],
  ['antithesis (not X, but Y)', /\bnot\s+[^.,\n]{1,35},?\s+but\b/gi],
  ['"the real X is" reveal', /\bthe real (?:question|answer|cost|lesson|point|story|issue|problem)\b/gi],
  ['aphorism ("the only/whole/real ... is")', /\bthe (?:only|whole|entire|real|point|truth|secret|catch) [^.\n]{0,28}\bis\b/gi],
  ['rhetorical question then answer', /\?\s+(?:Because|That'?s|This is|It'?s|No[.,]|Yes[.,]|Turns out|Here'?s)\b/g],
  ['hype word', new RegExp(HYPE, 'gi')],
  ['fence-sitting / filler', /\b(both are (?:great|good|excellent)|pick what fits|depends on your needs|your mileage|at the end of the day|it'?s worth noting|in conclusion|happy coding)\b/gi],
];

// Strip fenced code blocks and inline code so subtraction (a - b) etc. is ignored.
function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

function stripFrontmatter(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? text.slice(m[0].length) : text;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write('usage: node prose-scan.mjs <file...>\n');
  process.exit(2);
}

let total = 0;
for (const file of files) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (e) {
    process.stderr.write(`skip ${file}: ${e.message}\n`);
    continue;
  }
  const body = stripCode(stripFrontmatter(raw));
  const lines = body.split('\n');
  const hits = [];
  lines.forEach((line, i) => {
    for (const [label, re] of RULES) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (m) hits.push({ line: i + 1, label, text: m[0].trim() });
    }
  });
  if (hits.length) {
    total += hits.length;
    process.stdout.write(`\n${file}\n`);
    for (const h of hits) {
      process.stdout.write(`  ${String(h.line).padStart(4)}  ${h.label.padEnd(34)} ${JSON.stringify(h.text)}\n`);
    }
  }
}

if (total) {
  process.stdout.write(`\n${total} possible AI-voice tell(s) found.\n`);
  process.exit(1);
}
process.stdout.write('clean: no mechanical AI-voice tells found.\n');
process.exit(0);
