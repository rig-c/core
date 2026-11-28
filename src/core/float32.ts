import { CompileError } from '../errors.ts';

/** Scratch for the two float32 helpers below: one float, and its bits. Written and read within one call. */
const FLOAT32_SCRATCH = new Float32Array(1);
const FLOAT32_BITS = new Uint32Array(FLOAT32_SCRATCH.buffer);

/**
 * Every emitted number: the double whose text is the **shortest decimal that
 * names the number's float32** — the precision the format carries and the text
 * the editor writes — and never `-0`.
 *
 * ## Why float32 and not a decimal grid
 *
 * `spine-core` keeps every number it samples per frame — key times, curve
 * points, vertices, uvs — in a `Float32Array` (`Utils.newFloatArray`), and the
 * editor that defines the format writes each number as the shortest decimal
 * that parses back to its float (`1.0185547`, `0.20835066`, `1.4333333`). Six
 * fixed decimals — this function's predecessor, `r6` — is neither. Below 16 it
 * keeps less than a float holds (`0.2897798` came back as `0.28978`), so a
 * rebuild of an editor export was not the export and `ingest → build → ingest`
 * did not have to be a fixed point: issue #716 measured 16,134 of the 61,645
 * numbers in the twelve example exports rewritten, by up to 7e-7 each, with no
 * `LOSS` line. Above 16 it keeps more than a float holds, text the parser
 * discards on read. Emitting the float's own name loses nothing the runtime can
 * see and states nothing it cannot.
 *
 * ## The text, and why this returns a number
 *
 * `JSON.stringify` prints a double as the shortest text naming THAT double, so
 * the job is to find the double whose text is the float's shortest name: the
 * fewest significant digits (1–9) whose decimal parses back through `JSON.parse`
 * and `Math.fround` — the runtime's own read — to the same float, and among the
 * candidates of that length the one closest to the float, a tie going to the
 * even last digit. That is `Float.toString`'s rule, and it is measured rather
 * than assumed: over the twelve example exports a rebuild reproduces the
 * editor's text on every number (`IG73` in `selftest.ts` holds it there), and
 * the two a round-half-up tie-break gets wrong (`-1897.4062`, `-1.6289062`,
 * both exactly half-way between two candidates) are why the tie clause is here. The distance is compared in exact
 * integer arithmetic, because two decimals equidistant from a float are not
 * reliably equidistant once each has been rounded to a double.
 *
 * ⚠️ **A computed value takes this too, not only a carried one.** `55 / 0.4` is
 * `137.49999999999997` in doubles and is emitted as the float it lands on,
 * `137.5`. What this does NOT do is snap a double's residue to zero: `r6`'s grid
 * was absolute and swallowed anything under 5e-7, a float's is relative, so a
 * residue of 1e-15 is a float in its own right and is emitted as one.
 *
 * 🔒 `MX01` in `selftest.ts` defines "on the float32
 * grid" as a fixed point of this function, `f32(x) === x`, and holds every
 * number the model document spells to it or to the six-decimal grid (issue
 * #942). `Math.fround(x) === x` is not that test: this writes `0.2`, whose
 * float is 0.20000000298023224, so it would refuse the emitter's own output.
 */
export function f32(n: number): number {
  const f = Math.fround(n);
  if (f === 0 || !Number.isFinite(f)) return f === 0 ? 0 : f;
  const magnitude = Math.abs(f);
  const sign = f < 0 ? '-' : '';
  for (let p = 1; p <= 9; p++) {
    const [mantissa, exponent] = magnitude.toExponential(p - 1).split('e');
    const nearest = BigInt(mantissa.replace('.', ''));
    const scale = Number(exponent) - (p - 1);
    // The nearest p-digit decimal and its two neighbours: a float's interval is
    // asymmetric at a power of two, so the nearest can miss where a neighbour
    // lands, and a neighbour can land beside it for a tie.
    const named = [nearest - 1n, nearest, nearest + 1n].filter(
      (digits) => digits > 0n && Math.fround(Number(`${digits}e${scale}`)) === magnitude,
    );
    if (named.length === 0) continue;
    const chosen = named.reduce((a, b) => closerDecimal(a, b, scale, magnitude));
    return Number(`${sign}${chosen}e${scale}`);
  }
  // Unreachable — nine significant digits name every float32. Stated rather than
  // assumed, because a fallback here would be a number nobody chose.
  throw new CompileError(`no decimal of at most 9 significant digits names the float32 of ${n}`, 'CE_COMPILE_FLOAT32_DECIMAL_UNREPRESENTABLE');
}

/**
 * Of the decimals `a·10^scale` and `b·10^scale` (`a < b`), the one closer to
 * the positive float `f`, compared exactly; a tie goes to the even digit.
 */
function closerDecimal(a: bigint, b: bigint, scale: number, f: number): bigint {
  FLOAT32_SCRATCH[0] = f;
  const bits = FLOAT32_BITS[0];
  const biased = (bits >>> 23) & 0xff;
  const fraction = BigInt(bits & 0x7fffff);
  const significand = biased === 0 ? fraction : fraction | 0x800000n;
  // f = significand·2^power, so the midpoint (a + b)·10^scale / 2 compares with
  // f exactly as (a + b)·10^scale compares with significand·2^(power + 1).
  const doubled = (biased === 0 ? -149 : biased - 150) + 1;
  let midpoint = a + b;
  let float = significand;
  if (scale >= 0) midpoint *= 10n ** BigInt(scale);
  else float *= 10n ** BigInt(-scale);
  if (doubled >= 0) float <<= BigInt(doubled);
  else midpoint <<= BigInt(-doubled);
  if (midpoint < float) return b;
  if (midpoint > float) return a;
  return a % 2n === 0n ? a : b;
}

/** The largest float32 below the float `f`. */
export function float32Below(f: number): number {
  FLOAT32_SCRATCH[0] = f;
  if (f > 0) FLOAT32_BITS[0] -= 1;
  else if (f < 0) FLOAT32_BITS[0] += 1;
  else FLOAT32_BITS[0] = 0x80000001;
  return FLOAT32_SCRATCH[0];
}
