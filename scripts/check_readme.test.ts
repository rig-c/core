import { expect, test } from 'bun:test';
import { readmeFaults, readmeWords, README_HEADINGS, README_WORD_CAP } from './check_readme.ts';

test('normal landing page and every allowed heading are accepted', () => {
  expect(readmeFaults(README_HEADINGS.map((heading) => `## ${heading}\nA first result.`).join('\n'))).toEqual([]);
});

test('word counter includes all source text and accepts exactly the fixed cap', () => {
  expect(readmeWords(' one\t two\nthree\r\n')).toBe(3);
  expect(readmeFaults('word '.repeat(README_WORD_CAP))).toEqual([]);
});

const plants: Array<[string, string, string]> = [
  ['word overflow', 'word '.repeat(README_WORD_CAP + 1), 'README_WORD_CAP'],
  ['new heading', '## Every flag\nDetails.', 'README_HEADING'],
  ['empty heading', '##\nDetails.', 'README_HEADING'],
  ['measurement', 'Measured on 2026-10-30.', 'README_DATED_MEASUREMENT'],
  ['read date', 'Figures READ\non\t2026.', 'README_DATED_MEASUREMENT'],
  ['table date', '| Result | 2026-10-30 |', 'README_TABLE_DATE'],
  ['table link date', '| [survey](docs/SURVEY_2026-10-30.md) | record |', 'README_TABLE_DATE'],
  ['empty document', '\n\t', 'README_EMPTY'],
];
for (const [name, text, code] of plants) {
  test(`plant ${name} is refused by ${code}`, () => {
    const faults = readmeFaults(text);
    expect(faults.some((fault) => fault.startsWith(`${code}:`))).toBe(true);
    console.log(`PLANT ${name}: ${faults.join('; ')}`);
  });
}

test('CRLF, Markdown closing hashes and level-three headings are accepted', () => {
  expect(readmeFaults('  ## Commands ###\r\n### Flag details\r\nText.')).toEqual([]);
});

test('dates outside tables and fenced example headings are not landing-page claims', () => {
  for (const marker of ['```', '~~~~']) {
    expect(readmeFaults(`## Commands\nDate: 2026-10-30.\n${marker}text\n## Example\n| x | 2026-10-30 |\nMeasured on 2026\n${marker}\n`)).toEqual([]);
  }
});

test('a shorter embedded fence does not close a longer fence', () => {
  expect(readmeFaults('````md\n```\n## Example\n````\n## Commands\n')).toEqual([]);
});
