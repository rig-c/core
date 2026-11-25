import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * How a path is spelled before a relative path that is written to disk is computed from it — one rule per platform,
 * because the platforms read `..` differently (issue #1775, measured on native Windows and on macOS, Bun 1.4.4):
 *
 * - `through-links` (every platform but Windows): `..` climbs out of a linked directory physically, beside the link's
 *   target, and a process whose working directory was reached through a link reports its real path. So both ends are
 *   resolved through their links (`realDir`, `realKeepingName`), and one directory under two spellings writes one set
 *   of bytes (issues #1770, #1773).
 * - `as-spelled` (Windows): `..` is removed from the text before the filesystem is asked, so it climbs out of a
 *   junction beside the junction, and a process started in a directory spelled through one reports that spelling. A
 *   relative path computed between link-resolved ends climbed one level too many there: a `build --out` given through
 *   a junction wrote an `images` and page names that resolved only from the real spelling, and the replay of a
 *   `render` record from the `--out` it was given exited 2. So both ends are taken as given (absolute, nothing
 *   resolved), and each spelling of one directory writes the bytes that resolve from that spelling.
 *
 * Written relative paths use the same directory spelling when read back. Whether two paths name one directory —
 * `--report` inside `--out`, `--boundary-from` equal to it — is a question about the filesystem, and `realDir`
 * answers it on every platform.
 */
export type LinkRule = 'through-links' | 'as-spelled';
export function linkRuleFor(platform: string): LinkRule {
  return platform === 'win32' ? 'as-spelled' : 'through-links';
}
/** The rule this process spells by: its own platform's. */
export const LINK_RULE: LinkRule = linkRuleFor(process.platform);

/** A directory as written paths are computed from it, under `LINK_RULE`: through its links, or as given. */
export function spelledDir(path: string): string {
  return LINK_RULE === 'as-spelled' ? resolve(path) : realDir(path);
}

/** Read a relative path from the same directory spelling it was written against. */
export function resolveWrittenPath(directory: string, path: string): string {
  return resolve(isAbsolute(path) ? directory : spelledDir(directory), path);
}

/** A file or directory as written paths are computed to it, under `LINK_RULE`; a file keeps its own name either way. */
export function spelledKeepingName(path: string): string {
  return LINK_RULE === 'as-spelled' ? resolve(path) : realKeepingName(path);
}

/**
 * A path through every link whether or not it exists yet: the real path of its nearest existing ancestor with the rest
 * appended, so a rerun whose working directory the process reports by its real path agrees, and an output directory a
 * command is about to create is spelled from where it will really be. On a platform whose rule is `through-links`, a
 * relative path is only true when it is computed between two paths spelled this way: climbing `..` out of a linked
 * directory lands beside the link's target, not beside the link (issues #1770, #1773). Written paths go through
 * `spelledDir`, which applies this only under that rule.
 */
export function realDir(path: string): string {
  const rest: string[] = [];
  let at = resolve(path);
  while (!existsSync(at)) {
    const up = dirname(at);
    if (up === at) break;
    rest.unshift(basename(at));
    at = up;
  }
  return join(realpathSync(at), ...rest);
}

/**
 * A directory through every link; a file through the links of its directory only, keeping its own name. Measured
 * (issue #1770, review): a `--candidate` naming a linked `skeleton.json` was followed to its target, and the rerun
 * looked for the atlas and model beside the target rather than beside the link.
 */
export function realKeepingName(path: string): string {
  const absolute = resolve(path);
  if (!existsSync(absolute) || statSync(absolute).isDirectory()) return realDir(absolute);
  return join(realDir(dirname(absolute)), basename(absolute));
}
