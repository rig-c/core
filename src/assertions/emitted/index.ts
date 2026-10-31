/**
 * The round trip's rules, restated over the text rigc emitted (issue #1060,
 * step 4e of #380) — the half of the gate the entry that links none of
 * spine-core runs beside the model side (`../model/index.ts`).
 *
 * ⭐ **Every assertion in the registry is accounted for, by name.** The model side runs
 * the moved assertions (`MOVED_ASSERTIONS`) over the document. What is left —
 * the complement, read off `ASSERTION_KIND` rather than listed — is the
 * round trip's own: A00, A01, A02, A05, A07, A16, A18, A31, A35, A52 at the time of
 * writing. Each of those but one reads the raw text, not what spine-core
 * loaded: the atlas's line layout (A07), the skeleton JSON's draw-order
 * offsets, deform runs, weighted runs' bone order, version label, legacy arrays,
 * legacy bone key and curve arrays (A31, A35, A52, A16, A01, A02, A05), and A18's
 * second compile. So
 * each is restated here over the same text, by a body under `../bodies/` that
 * is the round trip's clause word for word, and prints the round trip's line
 * (`RC28` holds the two on every recipe and on each assertion's mutants).
 * The one that cannot be is **A00**: it is spine-core's parser loading the
 * pair, and there is no second reader of the format to stand in for it. It
 * SKIPs, naming spine-core and where the round trip does run — never a PASS
 * on nothing. A code the complement grows by that this file does not know is
 * an internal error, so a new round-trip rule cannot go unrun here in silence.
 *
 * Links nothing from the runtime.
 */
import { ASSERTION_KIND, resolveProfile, type AssertionProfile } from '../kinds.ts';
import { verdictHarness, type VerdictLists } from '../harness.ts';
import { MOVED_ASSERTIONS } from '../model/index.ts';
import type { Verdicts } from '../harness.ts';
import { isObj, type Json } from '../values.ts';
import { a01NoLegacyToplevelConstraintArrays } from '../bodies/a01.ts';
import { a02NoBoneTransformKey } from '../bodies/a02.ts';
import { a05CurveArrayLength } from '../bodies/a05.ts';
import { a07AtlasTextShape } from '../bodies/a07.ts';
import { a16SkeletonVersion43 } from '../bodies/a16.ts';
import { a18DeterministicEmit } from '../bodies/a18.ts';
import { a31DrawOrderOffsetsResolve } from '../bodies/a31.ts';
import { a35DeformKeysFitTheAttachment } from '../bodies/a35.ts';
import { a52WeightedVerticesShareOneBoneOrder } from '../bodies/a52.ts';
import { parseAtlasText } from '../../atlas.ts';

/** What the restated rules read: the emitted texts, the document written beside them, and a second compile's three. */
export interface EmittedTextInput {
  skeletonText: string;
  atlasText: string;
  /** The document `build` writes — A18 compares it with the second compile's. */
  modelText: string;
  /** A second, independent compile's texts; absent, A18 SKIPs as the round trip's does on a re-gate. */
  reEmit?: { skeletonText: string; atlasText: string; modelText: string };
  profile: AssertionProfile;
}

/** The emitted texts as the bodies read them: the skeleton JSON parsed, or `null` where it does not parse. */
interface EmittedTexts {
  raw: Json | null;
  input: EmittedTextInput;
}

/** A00's SKIP here: what did not run, and where it does. */
export const SKIP_NO_ROUND_TRIP =
  "spine-core's parser is the subject of this rule and this entry links none of it — the entry that links it runs the round trip on build and validate " +
  '(installed, the same `rigc` once @esotericsoftware/spine-core is installed beside the package; from a source checkout, `bun cli.ts`), ' +
  'and the selftest and CI run it on every corpus build';

/** The code this file SKIPs rather than restates. */
const A00 = 'A00_ROUNDTRIP_PARSE';

/**
 * The restated rules, in `validate()`'s report order — A00's place among them
 * (after A35, before A16) is the round trip's, so the report reads in the order
 * the round trip's does.
 */
export const EMITTED_TEXT_RULES: ReadonlyArray<{ code: string; run: (v: Verdicts, texts: EmittedTexts) => void }> = [
  { code: 'A07_ATLAS_TEXT_SHAPE', run: (v, t) => a07AtlasTextShape(v, t.input.atlasText) },
  { code: 'A31_DRAW_ORDER_OFFSETS_RESOLVE', run: (v, t) => a31DrawOrderOffsetsResolve(v, t.raw) },
  { code: 'A35_DEFORM_KEYS_FIT_THE_ATTACHMENT', run: (v, t) => a35DeformKeysFitTheAttachment(v, t.raw) },
  { code: 'A52_WEIGHTED_VERTICES_SHARE_ONE_BONE_ORDER', run: (v, t) => a52WeightedVerticesShareOneBoneOrder(v, t.raw) },
  { code: A00, run: (v) => v.skip(A00, SKIP_NO_ROUND_TRIP) },
  { code: 'A16_SKELETON_VERSION_4_3', run: (v, t) => a16SkeletonVersion43(v, t.raw) },
  { code: 'A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS', run: (v, t) => a01NoLegacyToplevelConstraintArrays(v, t.raw) },
  { code: 'A02_NO_BONE_TRANSFORM_KEY', run: (v, t) => a02NoBoneTransformKey(v, t.raw) },
  { code: 'A05_CURVE_ARRAY_LENGTH', run: (v, t) => a05CurveArrayLength(v, t.raw) },
  {
    code: 'A18_DETERMINISTIC_EMIT',
    run: (v, { input }) => {
      const again = input.reEmit;
      const encoding =
        again === undefined
          ? []
          : [
              ...(again.skeletonText !== input.skeletonText ? ['recompiling produced a different skeleton.json'] : []),
              ...(again.atlasText !== input.atlasText ? ['recompiling produced a different skeleton.atlas'] : []),
            ];
      a18DeterministicEmit(v, { again: again !== undefined, encoding, first: input.modelText, second: again?.modelText ?? '' });
    },
  },
];

/**
 * The figures `validate()` reads off the pair it loaded, read off the same two
 * texts here (issue #1114), into `stats` first — the order the round trip's
 * report holds them in: `pages` and `regions` from the atlas text by rigc's own
 * reader (`parseAtlasText`, whose pages and regions are the runtime atlas's in
 * file order), then `bones`, `slots`, `animations` and `version` from the
 * skeleton JSON — the arrays and the animation map the runtime loads them
 * from, and `skeleton.spine` as it states it, `(none)` where it states none.
 * The skeleton's four are left out where its JSON does not parse, as the round
 * trip leaves them out where it loaded nothing; nothing here is a value the
 * texts do not state.
 */
function pairFigures(stats: Record<string, number | string>, raw: Json | null, atlasText: string): void {
  const atlas = parseAtlasText(atlasText);
  stats.pages = atlas.pages.length;
  stats.regions = atlas.regions.length;
  if (!isObj(raw)) return;
  const listed = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  stats.bones = listed(raw.bones);
  stats.slots = listed(raw.slots);
  stats.animations = isObj(raw.animations) ? Object.keys(raw.animations).length : 0;
  const declared = isObj(raw.skeleton) ? raw.skeleton.spine : undefined;
  stats.version = declared === undefined || declared === null ? '(none)' : typeof declared === 'string' ? declared : JSON.stringify(declared);
}

/** Every code the model side does not run, read off the registry — what this file must account for. */
export function roundTripOnlyCodes(): string[] {
  const moved = new Set(MOVED_ASSERTIONS.map((m) => m.code));
  return Object.keys(ASSERTION_KIND).filter((code) => !moved.has(code));
}

/** The restated rules over one build's emitted texts, in `validate()`'s report shape. */
export function validateEmittedText(given: EmittedTextInput): VerdictLists & { profile: AssertionProfile } {
  // Refuse unknown and removed profiles before choosing policy or writing a report (issue #1668).
  const input: EmittedTextInput = { ...given, profile: resolveProfile(given.profile, 'the emitted text') };
  const known = new Set(EMITTED_TEXT_RULES.map((r) => r.code));
  const unrun = roundTripOnlyCodes().filter((code) => !known.has(code));
  if (unrun.length > 0) {
    throw new Error(`internal: ${unrun.join(', ')} runs on neither side here — the model side does not run it and src/assertions/emitted/index.ts neither restates nor SKIPs it`);
  }
  const h = verdictHarness(input.profile, ASSERTION_KIND, 'the emitted text');
  let raw: Json | null = null;
  try {
    raw = JSON.parse(input.skeletonText) as Json;
  } catch (err) {
    h.fail(A00, `skeleton JSON is not parseable: ${(err as Error).message}`);
  }
  pairFigures(h.stats, raw, input.atlasText);
  for (const rule of EMITTED_TEXT_RULES) {
    if (rule.code === A00 && raw === null) continue;
    h.check(rule.code, () => rule.run(h.verdicts, { raw, input }));
  }
  const { failures, passed, skipped, profileSkipped, stats } = h;
  return { failures, passed, skipped, profileSkipped, stats, profile: input.profile };
}
