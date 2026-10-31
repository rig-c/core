/**
 * The harness an assertion body runs in, and the report it fills (issue
 * #1025, step 4c of #380).
 *
 * One harness for both sides. `validate()` runs a body over the facts it reads
 * off what spine-core loaded; the model side (`./model/index.ts`) runs the same
 * body over the facts it reads off the model document and the core. What makes
 * a line the same line on both sides is that the body is one function and the
 * harness deciding PASS, SKIP, FAIL and PROF around it is one function too — a
 * second copy of `check` would be a second place a verdict could be decided
 * differently.
 *
 * Moved here from `validate()`, the rule unchanged: an assertion is recorded
 * as passed only when its body neither failed nor skipped, a body that throws
 * is a FAIL whose detail is `threw: <message>`, and a rule the profile does not
 * carry is not run at all and is recorded as out of profile.
 *
 * This module links nothing from the runtime, directly or through what it
 * imports — the condition for the model side to use it, held by the selftest.
 */
import { kindRunsUnder, resolveProfile, type AssertionKind, type AssertionProfile } from './kinds.ts';

/** One failure: the assertion's code and the sentence naming the object, the value found and the value required. */
export interface Failure {
  assertion: string;
  detail: string;
}

/** What a body is handed: how to fail, how to declare it had nothing to measure, and the stats line it may add to. */
export interface Verdicts {
  fail: (assertion: string, detail: string) => void;
  skip: (assertion: string, reason: string) => void;
  stats: Record<string, number | string>;
}

/** The four lists and the stats a run of bodies leaves — the shape `validate()` returns, less the profile. */
export interface VerdictLists {
  failures: Failure[];
  /** Assertions that ran and passed, in order. */
  passed: string[];
  /** Assertions that had nothing to run against, with the reason. */
  skipped: Array<{ assertion: string; reason: string }>;
  /** Assertions the profile does not apply, with their kind. */
  profileSkipped: Array<{ assertion: string; kind: 'renderer' | 'archetype' }>;
  stats: Record<string, number | string>;
}

/** A harness: the lists it fills, the two calls a body makes, and `check`, which runs a body. */
export interface VerdictHarness extends VerdictLists {
  fail: Verdicts['fail'];
  skip: Verdicts['skip'];
  /**
   * Run one assertion; record it as passed only if it neither failed nor skipped,
   * and do not run it at all when the profile does not carry that kind of rule.
   *
   * The unknown-assertion throw is deliberate: an assertion with no entry in
   * the kind table would otherwise pick a profile by accident, and picking
   * wrong means either a rule that never runs or a rule that fires on
   * everybody's data.
   *
   * The body's return value is handed back — `undefined` when the assertion did
   * not run or threw. `validate()`'s A00 uses it so that the loaded atlas and
   * skeleton can be `const`: assigning them from inside this callback leaves
   * the type checker unable to see that they were ever set, and every later read
   * of `atlas.pages` or `data.bones` becomes a property of `never`.
   */
  check: <T>(assertion: string, body: () => T) => T | undefined;
  /** `fail`, `skip` and `stats`, as one value to hand a body. */
  verdicts: Verdicts;
}

/**
 * A fresh harness for one run under `profile`. `kinds` is the kind table the
 * run's codes are looked up in, and `who` names the run in the throw for a code
 * the table lacks — `validate` for the gate, so its message is the one it was.
 */
export function verdictHarness(profile: AssertionProfile, kinds: Readonly<Record<string, AssertionKind>>, who: string): VerdictHarness {
  // Anything outside the two profiles is refused by name. Entries check before
  // they get here too; this is the floor for a caller of the harness itself.
  profile = resolveProfile(profile, who);
  const failures: Failure[] = [];
  const passed: string[] = [];
  const skipped: VerdictLists['skipped'] = [];
  const profileSkipped: VerdictLists['profileSkipped'] = [];
  const stats: Record<string, number | string> = {};
  const fail = (assertion: string, detail: string): void => {
    failures.push({ assertion, detail });
  };
  /** Declare that an assertion had nothing to check, and why. */
  const skip = (assertion: string, reason: string): void => {
    skipped.push({ assertion, reason });
  };
  const check = <T>(assertion: string, body: () => T): T | undefined => {
    const kind = kinds[assertion];
    if (!kind) throw new Error(`${who}: assertion "${assertion}" has no ASSERTION_KIND entry`);
    if (!kindRunsUnder(kind, profile)) {
      profileSkipped.push({ assertion, kind: kind === 'renderer' ? 'renderer' : 'archetype' });
      return undefined;
    }
    const before = failures.length;
    const skippedBefore = skipped.length;
    let result: T | undefined;
    try {
      result = body();
    } catch (err) {
      fail(assertion, `threw: ${(err as Error).message}`);
    }
    if (failures.length === before && skipped.length === skippedBefore) passed.push(assertion);
    return result;
  };
  return { failures, passed, skipped, profileSkipped, stats, fail, skip, check, verdicts: { fail, skip, stats } };
}
