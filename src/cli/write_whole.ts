/**
 * `writeWhole(fd, text)`: every byte of `text`, UTF-8, onto `fd`, or a named
 * refusal — the writer a command uses for a document too large to trust to
 * `console.log` (issue #1487).
 *
 * ⚖️ Why not `console.log`: on Bun 1.2.0 (then the declared minimum), one ~322 KB
 * line with non-ASCII in it came out 330,634 bytes for 330,632, a stray
 * `\xe2\x00` at a 64 KiB chunk boundary — to a file, a pipe and a slow pipe
 * alike. And on a stdout whose pipe is non-blocking (a parent set `O_NONBLOCK`
 * on it), it stopped near 64 KiB on 1.2.0 *and* 1.4.2 with exit 0.
 *
 * ⚖️ Why a loop and not one `writeSync(fd, text)`: on that non-blocking pipe
 * `writeSync` returns a short count — 65,536 of 330,632 — and throws nothing,
 * so a single call drops the rest in silence on both Buns. Each call here
 * writes from where the last one stopped.
 *
 * ⚖️ Why not `process.stdout.write` and a wait for `drain`: whole on 1.4.2,
 * but on 1.2.0 over the non-blocking pipe it wrote more bytes than it was
 * given (397,312 and climbing, diverging at byte 69,633) and never exited.
 *
 * A pipe that is full answers `EAGAIN` (or a zero count): the loop waits —
 * 1 ms, doubling to {@link STALL_WAIT_CAP_MS} — and tries again, and after
 * {@link MAX_STALLS} answers in a row with no byte taken it refuses with
 * {@link StdoutWriteError}. `EPIPE` — the reader closed its end, as `| head`
 * does — stops the write quietly, which is what `console.log` did there (exit 0
 * on both Buns, measured): the reader has what it asked for. Any other error
 * (`EBADF`, `EIO`) refuses at once.
 * The wait is `Atomics.wait` on a cell nothing notifies: a delay, not a reading
 * of the clock — no value written depends on how long it lasted, and the bound
 * is a count of attempts, so whether it refuses depends on the reader alone.
 */
import { writeSync } from 'node:fs';

/** The answers in a row with no byte taken before the writer refuses — about a minute of waits at the cap. */
export const MAX_STALLS = 1000;
/** The longest single wait between two attempts on a full pipe, in milliseconds. */
export const STALL_WAIT_CAP_MS = 64;

/** A write the reader never took: what was written, of how many bytes, and why it stopped. */
export class StdoutWriteError extends Error {
  override name = 'StdoutWriteError';
}

/** `fs.writeSync`'s buffer form: bytes written, or a throw carrying `code`. */
export type WriteFn = (fd: number, buffer: Uint8Array, offset: number, length: number) => number;

/**
 * The selftest's plants (issue #1487): `write` stands in for `fs.writeSync` so a
 * short count or an `EAGAIN` can be forced, and `wait` for the delay so a plant
 * runs without sleeping. Nothing outside the selftest passes either.
 */
export interface WriteWholePlants {
  write?: WriteFn;
  wait?: (ms: number) => void;
}

const STALL_CODES = new Set(['EAGAIN', 'EWOULDBLOCK', 'EINTR']);

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function writeWhole(fd: number, text: string, plants: WriteWholePlants = {}): void {
  const write = plants.write ?? ((f: number, b: Uint8Array, o: number, l: number) => writeSync(f, b, o, l));
  const wait = plants.wait ?? sleep;
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  let stalls = 0;
  while (offset < bytes.length) {
    let taken = 0;
    try {
      taken = write(fd, bytes, offset, bytes.length - offset);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // The reader closed its end (`| head`): it has what it asked for, and nobody is left to read the rest.
      if (code === 'EPIPE') return;
      if (code === undefined || !STALL_CODES.has(code)) {
        throw new StdoutWriteError(`${offset} of ${bytes.length} byte(s) confirmed written to fd ${fd} before it stopped: ${code ?? String(err)} — the descriptor is not writable`);
      }
    }
    if (taken > 0) {
      offset += taken;
      stalls = 0;
      continue;
    }
    stalls += 1;
    if (stalls > MAX_STALLS) {
      throw new StdoutWriteError(`${offset} of ${bytes.length} byte(s) confirmed written to fd ${fd}, and the reader took nothing for ${MAX_STALLS} attempt(s) in a row — it stopped reading`);
    }
    wait(Math.min(2 ** (stalls - 1), STALL_WAIT_CAP_MS));
  }
}

/**
 * The CLI's one stdout policy (issue #1493): `console.log` of this process,
 * every call, through {@link writeWhole} on fd 1 — so the ~250 lines the
 * commands print are written the way the guide's document is, and a
 * non-blocking pipe gets all of them instead of the first ~64 KiB with exit 0.
 * `runCli` installs it before anything prints, for both entries; calling it
 * again changes nothing.
 *
 * ⚖️ One `writeWhole` per call, not a buffer flushed at exit or at a size:
 * Bun's own `console.log` is synchronous per call on a blocking stdout — a
 * line printed between two `console.error` lines lands between them under
 * `2>&1`, to a file and to a pipe, on 1.2.0 and 1.4.2 (measured) — and a
 * write per call keeps that order, keeps a long `render` or `check` printing
 * as it goes, and leaves nothing behind for a `process.exit` to drop, or for a
 * delegate's child, which writes to the same fd, to overtake. A buffer would
 * have to answer all three and still reorders `2>&1`.
 *
 * The text is what Bun's `console.log` prints: the arguments joined by one
 * space, a string as it is and anything else as `Bun.inspect` shows it, and a
 * newline. Format directives (`%s` with a second argument) are not applied —
 * every call in the CLI passes one string, so none has one to apply.
 */
let consoleLogRouted = false;

export function routeConsoleLogThroughWriteWhole(): void {
  if (consoleLogRouted) return;
  consoleLogRouted = true;
  console.log = (...args: unknown[]): void => {
    writeWhole(1, `${args.map((arg) => (typeof arg === 'string' ? arg : Bun.inspect(arg))).join(' ')}\n`);
  };
}
