/** The landing page's growth budget (core#1648), independent of runtime code. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Fixed after the mechanical cut: ceil(words * 1.10 / 50) * 50.
// 6812 words after the cut; no earlier core cap was found.
export const README_WORD_CAP = 7500;
export const README_HEADINGS = [
  'What you get',
  'What rigc is, and what it is not',
  'Install',
  'First rig in ten minutes',
  'See what you built, and let someone choose',
  'The gallery — seven complete rigs over art that ships with them',
  'Commands',
  'Documentation',
  'Why you can trust the output',
  'Contributing',
  'Licence',
] as const;

export function readmeWords(text: string): number {
  return text.match(/\S+/gu)?.length ?? 0;
}

/** Named faults over text; mutants use this same reader without editing the tree. */
export function readmeFaults(text: string, cap = README_WORD_CAP): string[] {
  const faults: string[] = [];
  const words = readmeWords(text);
  if (words === 0) faults.push('README_EMPTY: README.md contains no words');
  if (words > cap) faults.push(`README_WORD_CAP: README.md has ${words} words; maximum ${cap}`);
  const prose: string[] = [];
  let fence: { char: string; size: number } | undefined;
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence !== undefined) {
      if (marker !== null && marker[1][0] === fence.char && marker[1].length >= fence.size && marker[2].trim() === '') fence = undefined;
      continue;
    }
    if (marker !== null) {
      fence = { char: marker[1][0], size: marker[1].length };
      continue;
    }
    const heading = /^ {0,3}##(?:[\t ]+(.+?)|[\t ]*)$/u.exec(line);
    if (heading !== null) {
      const name = (heading[1] ?? '').replace(/[\t ]+#+[\t ]*$/u, '').trim();
      if (!(README_HEADINGS as readonly string[]).includes(name)) faults.push(`README_HEADING: README.md:${index + 1} has unlisted ## heading ${JSON.stringify(name)}`);
    }
    if (line.includes('|') && /(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/u.test(line)) faults.push(`README_TABLE_DATE: README.md:${index + 1} has a YYYY-MM-DD inside a table cell`);
    prose.push(line);
  }
  for (const match of prose.join('\n').matchAll(/\b(?:measured|read)\s+on\s+20\d*/giu)) {
    faults.push(`README_DATED_MEASUREMENT: README.md contains ${JSON.stringify(match[0])}`);
  }
  return faults;
}

if (import.meta.main) {
  const path = resolve(import.meta.dir, '../README.md');
  const text = readFileSync(path, 'utf8');
  const faults = readmeFaults(text);
  for (const fault of faults) console.error(fault);
  if (faults.length > 0) process.exit(1);
  console.log(`README_BUDGET: ${readmeWords(text)}/${README_WORD_CAP} words; headings and measurement checks PASS`);
}
