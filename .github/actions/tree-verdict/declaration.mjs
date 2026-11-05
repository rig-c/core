import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Versioned consumer label + SHA256 of the EXACT replaced npm lifecycle chain.
// The old chain and its command inventory live together in ONE reviewed consumer file.
export function readDeclaration(path) {
  const d = JSON.parse(readFileSync(path, 'utf8'));
  if (d.schema !== 'tree-verdict-lifecycle/1' || !/^\.github\/workflows\/[\w-]+\.ya?ml$/.test(d.workflow) ||
    !/^[a-z][a-z0-9-]{0,19}\/[1-9][0-9]*$/.test(d.gate) || typeof d.chain !== 'string' || !d.chain.trim() || d.chain.length > 16384) throw new Error('invalid lifecycle declaration');
  const covered = Array.isArray(d.commands) && d.commands.length > 0 && d.commands.every(c => typeof c === 'string' && c.trim() === c && !!c) && d.commands.join(' && ') === d.chain;
  const gate = `${d.gate}/sha256-${createHash('sha256').update(d.chain).digest('hex')}`;
  return { ...d, gate, covered };
}
