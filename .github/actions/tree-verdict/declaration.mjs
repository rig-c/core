import { readFileSync } from 'node:fs';
import { canonicalCoverage, gateFor } from './coverage.mjs';
export function readDeclaration(path) {
  const d = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof d.chain !== 'string' || !d.chain.trim() || d.chain.length > 16384) throw new Error('COVER_SCHEMA: original chain missing');
  try {
    const coverage = canonicalCoverage(d);
    return { ...d, coverage, gate: gateFor(coverage), covered: true };
  } catch (error) { return { ...d, gate: 'unavailable/2', covered: false, refusal: error.message }; }
}
