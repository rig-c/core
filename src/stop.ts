/**
 * `stops` — a swinging chain held off a leg (issue #1413).
 *
 * Spine has no collider and no angle limit — a physics constraint's `limit` is
 * a velocity cap — so a skirt chain driven by physics swings its hem straight
 * through the thigh it hangs in front of. The working stand-in, tuned by hand on
 * a dancer's pleated skirt, is a small network per chain: a point on the leg, a
 * frame that aims at it from the chain's root, the swinging link's rotation
 * copied onto that frame, and the DRAWN link — the one the mesh is weighted to —
 * held by a transform clamp, so it may swing away from the leg and not past its
 * rest angle toward it. One declaration here expands to exactly that network,
 * and to nothing else: what it writes is what an author would write by hand,
 * bone for bone and constraint for constraint, which `LG01` holds byte for byte.
 *
 * ⭐ **The expansion happens before anything else reads the rig.** `parseRigSpec`
 * calls `expandStops` ahead of its own name resolution, so every reader after it
 * — the parse's own checks, `compile`, the gate — sees ordinary bones and
 * constraints and nothing that knows a stop was there. A stop therefore cannot
 * buy an exemption, a default or a code path of its own: it is spelling.
 *
 * Every position and angle is the declaration's, or derived from it and the
 * setup pose the rig spec states — no value is measured off the art and none is
 * defaulted. What is derived, and from what:
 *
 *   - the point bone's `x`/`y` are `at`, in `against`'s local space, as written;
 *   - the frame hangs where the first link hangs — its parent, `x`, `y` and
 *     `length` are the link's — and its `rotation` points it at the point;
 *   - the drawn link's rest rotation in the frame is the angle from the aim line
 *     to the link, so at rest the drawn link lies on the link;
 *   - which way is **inward** is the way from the link toward the aim line: the
 *     point is on the leg, so turning toward it is turning into the leg;
 *   - the clamp's two bounds are that rest angle moved by `inward` and `outward`.
 *
 * The angles are read in the exact frame (`computeExactFrameTransforms`): they
 * are statements about the rig as authored, the rule `src/transform.ts` states
 * for what is measured rather than bound.
 */
import { CompileError } from './errors.ts';
import type { RigBone, RigConstraint, RigIkConstraint, RigSpec, RigStop, RigTransformConstraint } from './rig.ts';
import {
  computeExactFrameTransforms,
  directionDegrees,
  localDirectionDegrees,
  toWorld,
  type BoneTransform,
} from './transform.ts';

/**
 * A planted wrong expansion, for the selftest's mutants (`LG` controls) — each
 * a mistake a hand-built network could carry and still build green.
 *
 *   - `swapRange` — inward taken the other way round, so the clamp holds the
 *     link off the side it should swing to and lets it into the leg;
 *   - `aimAtAgainst` — the frame aimed at the `against` bone's origin rather
 *     than at the point on it;
 *   - `appendConstraints` — every generated constraint at the end of the
 *     array, after the physics of the links below, which then swing from a
 *     drawn link not yet clamped.
 *
 * @internal
 */
export interface StopPlant {
  swapRange?: boolean;
  aimAtAgainst?: boolean;
  appendConstraints?: boolean;
}

/** The names one stop generates, all derived from its `chain` and its links' names. */
export interface StopNames {
  /** `<chain>_touch` — the point, a child of `against`. */
  point: string;
  /** `<chain>_stop` — the frame, aimed at the point. */
  frame: string;
  /** `<chain>_stop_aim` — the ik constraint that aims it. */
  aim: string;
  /** `<first link>_rel` — the first link's rotation, copied onto the frame. */
  rel: string;
  /** `<first link>_rel_copy` — the transform constraint that copies it. */
  copy: string;
  /** `<link>_d` per link — the drawn link. */
  drawn: string[];
  /** `<link>_clamp` per link — the transform constraint that holds it. */
  clamp: string[];
}

/** The generated names of a stop, in one place so the refusals and the expansion cannot spell them apart. */
export function stopNames(chain: string, links: readonly string[]): StopNames {
  return {
    point: `${chain}_touch`,
    frame: `${chain}_stop`,
    aim: `${chain}_stop_aim`,
    rel: `${links[0]}_rel`,
    copy: `${links[0]}_rel_copy`,
    drawn: links.map((l) => `${l}_d`),
    clamp: links.map((l) => `${l}_clamp`),
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One stop, read and checked: every field present, every name resolved. */
interface ReadStop {
  who: string;
  chain: string;
  links: string[];
  against: string;
  at: [number, number];
  inward: number;
  outward: number;
  lower: { inward: number; outward: number } | null;
  names: StopNames;
}

/** The transform fields a drawn link copies from its link (the frame copies `x`, `y` and `length` only). */
const TWIN_FIELDS = ['length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inherit'] as const;

/** A degree bound a clamp can reach: a local rotation read off a world copy is in (-180, 180]. */
const BOUND = 180;

/** What the first link's bound refusal names: the link's hang and root, and the point — world, at the setup pose. */
interface FirstLink {
  hang: number;
  root: readonly [number, number];
  point: readonly [number, number];
}

/** An angle in (-540, 540) brought into (-180, 180] by at most one whole turn. */
function halfTurn(deg: number): number {
  if (deg > 180) return deg - 360;
  if (deg <= -180) return deg + 360;
  return deg;
}

/**
 * The rig spec with every `stops` entry expanded into the bones and constraints
 * it stands for, or the spec itself when it declares no `stops`.
 *
 * Bones: the frame immediately before the first link; the first link's `_rel`
 * and `_d` immediately after it; each lower link's `_d` immediately after that
 * link; the point after every other bone. Constraints: the aim immediately
 * before the last constraint that writes the first link, the copy and the first
 * clamp immediately after it, and each lower clamp immediately after the last
 * constraint that writes its link — so the frame is aimed before the link
 * swings, and every swing is copied and clamped before anything below it reads
 * the drawn link.
 *
 * The returned spec keeps `stops` as written, so `compile` can refuse a link a
 * motion-spec physics table also drives (that table is emitted after every rig
 * constraint, past the clamps); nothing emits it.
 */
export function expandStops(spec: RigSpec, where: string, plant: StopPlant = {}): RigSpec {
  const declared: unknown = spec.stops;
  if (declared === undefined) return spec;
  if (!Array.isArray(declared)) {
    throw new CompileError(`${where}: "stops" is ${JSON.stringify(declared)}; it is an array of { "chain", "links", "against", "at", "inward", "outward", "lower"? }`, 'CE_STOP_DECLARATIONS_ARRAY');
  }
  const authored = new Map<string, RigBone>();
  for (const bone of spec.bones) if (isObj(bone) && typeof bone.name === 'string') authored.set(bone.name, bone);
  const constraints = spec.constraints ?? [];

  // -- 1. every field, every name ----------------------------------------------
  const stops: ReadStop[] = [];
  const stoppedBy = new Map<string, string>();
  for (const [i, entry] of declared.entries()) {
    if (!isObj(entry)) throw new CompileError(`${where}: stops[${i}] is ${JSON.stringify(entry)}; a stop is an object`, 'CE_STOP_DECLARATION_OBJECT');
    const chain = entry.chain;
    if (typeof chain !== 'string' || chain.length === 0) {
      throw new CompileError(`${where}: stops[${i}] needs a "chain" — the name its point, frame and aim are called after ("<chain>_touch", "<chain>_stop", "<chain>_stop_aim")`, 'CE_STOP_CHAIN_NAME_REQUIRED');
    }
    const who = `${where}: stop "${chain}"`;
    const links: unknown = entry.links;
    if (!Array.isArray(links) || links.length === 0 || !links.every((l): l is string => typeof l === 'string')) {
      throw new CompileError(`${who} states "links" ${JSON.stringify(links) ?? 'absent'}; it is the chain's swinging links, root first — a non-empty array of bone names`, 'CE_STOP_LINKS_ARRAY');
    }
    for (const [k, link] of links.entries()) {
      const bone = authored.get(link);
      if (bone === undefined) throw new CompileError(`${who}: links[${k}] names bone "${link}", which this rig does not declare`, 'CE_STOP_LINK_UNKNOWN');
      const other = stoppedBy.get(link);
      if (other !== undefined) {
        throw new CompileError(
          `${who}: links[${k}] "${link}" is already stopped by stop "${other}" — one drawn link "${link}_d" and one clamp "${link}_clamp" per link, so a link is stopped once`, 'CE_STOP_LINK_ALREADY_STOPPED',
        );
      }
      stoppedBy.set(link, chain);
      if (bone.from !== undefined) {
        throw new CompileError(`${who}: links[${k}] "${link}" takes its place from the manifest ("from"), and a stop copies the link's stated x, y and rotation onto its drawn link — state them`, 'CE_STOP_LINK_MANIFEST_POSITION');
      }
      if (bone.parent === undefined) {
        throw new CompileError(`${who}: links[${k}] "${link}" is the skeleton's root, and a stop hangs its frame and its drawn link where the link hangs — a link has a parent`, 'CE_STOP_LINK_ROOT');
      }
    }
    const against = entry.against;
    if (typeof against !== 'string' || against.length === 0) {
      throw new CompileError(`${who} needs "against" — the bone the point rides on, the leg the chain is held off`, 'CE_STOP_AGAINST_REQUIRED');
    }
    if (!authored.has(against)) throw new CompileError(`${who}: "against" names bone "${against}", which this rig does not declare`, 'CE_STOP_AGAINST_UNKNOWN');
    const at: unknown = entry.at;
    if (at === undefined) {
      throw new CompileError(`${who} states no "at" — the point on "${against}" the frame aims at, [x, y] in "${against}"'s local space; the compiler places no point of its own`, 'CE_STOP_AT_REQUIRED');
    }
    if (!Array.isArray(at) || at.length !== 2 || !at.every((v): v is number => typeof v === 'number')) {
      throw new CompileError(`${who} states "at" ${JSON.stringify(at)}; it is [x, y], two numbers in "${against}"'s local space`, 'CE_STOP_AT_PAIR');
    }
    const range = (node: Record<string, unknown>, field: string): { inward: number; outward: number } => {
      const out: Record<'inward' | 'outward', number> = { inward: 0, outward: 0 };
      for (const end of ['inward', 'outward'] as const) {
        const v = node[end];
        if (typeof v !== 'number') {
          throw new CompileError(
            `${who} states no "${field}${end}" — degrees from the link's rest angle, counted positive away from "${against}"; the range is [inward, outward], and the compiler states neither end for you`, 'CE_STOP_RANGE_END_REQUIRED',
          );
        }
        out[end] = v;
      }
      if (out.inward > out.outward) {
        throw new CompileError(
          `${who}: "${field}inward" ${out.inward} is greater than "${field}outward" ${out.outward} — the range is [inward, outward] in degrees counted positive away from "${against}", and this one holds no angle`, 'CE_STOP_RANGE_REVERSED',
        );
      }
      return out;
    };
    const first = range(entry, '');
    const lowerRaw = entry.lower;
    let lower: { inward: number; outward: number } | null = null;
    if (links.length > 1) {
      if (!isObj(lowerRaw)) {
        throw new CompileError(`${who} states no "lower" — the range [inward, outward] each link below the first may turn through off its own rest bend; the chain has ${links.length - 1} of them`, 'CE_STOP_LOWER_REQUIRED');
      }
      lower = range(lowerRaw, 'lower.');
    } else if (lowerRaw !== undefined) {
      throw new CompileError(`${who} states "lower" and its chain has one link — there is no link below the first for it to hold`, 'CE_STOP_LOWER_WITH_ONE_LINK');
    }
    stops.push({ who, chain, links, against, at: [at[0], at[1]], inward: first.inward, outward: first.outward, lower, names: stopNames(chain, links) });
  }

  // -- 2. the generated names are new -------------------------------------------
  const generatedBones = new Map<string, string>();
  const generatedConstraints = new Map<string, string>();
  const authoredConstraints = new Set(constraints.filter(isObj).map((c) => `${String(c.type)} ${String(c.name)}`));
  for (const stop of stops) {
    const { names } = stop;
    const lowerDrawn = names.drawn.slice(1);
    for (const name of [names.frame, names.rel, names.drawn[0], ...lowerDrawn, names.point]) {
      if (authored.has(name)) throw new CompileError(`${stop.who} generates bone "${name}", which this rig already declares — rename the bone, or the stop's "chain"`, 'CE_STOP_GENERATED_BONE_DECLARED');
      const by = generatedBones.get(name);
      if (by !== undefined) throw new CompileError(`${stop.who} generates bone "${name}", which stop "${by}" generates too — rename one "chain"`, 'CE_STOP_GENERATED_BONE_COLLISION');
      generatedBones.set(name, stop.chain);
    }
    for (const [type, name] of [['ik', names.aim], ['transform', names.copy], ...names.clamp.map((c) => ['transform', c] as const)] as const) {
      const key = `${type} ${name}`;
      if (authoredConstraints.has(key)) throw new CompileError(`${stop.who} generates ${type} constraint "${name}", which this rig already declares — rename the constraint, or the stop's "chain"`, 'CE_STOP_GENERATED_CONSTRAINT_DECLARED');
      const by = generatedConstraints.get(key);
      if (by !== undefined) throw new CompileError(`${stop.who} generates ${type} constraint "${name}", which stop "${by}" generates too — rename one "chain"`, 'CE_STOP_GENERATED_CONSTRAINT_COLLISION');
      generatedConstraints.set(key, stop.chain);
    }
  }

  // -- 3. what swings each link ---------------------------------------------------
  const writes = (c: unknown, bone: string): boolean => {
    if (!isObj(c)) return false;
    if (c.type === 'physics') return c.bone === bone;
    if (c.type === 'ik' || c.type === 'transform' || c.type === 'path') return Array.isArray(c.bones) && c.bones.includes(bone);
    return false;
  };
  const lastWriter = (stop: ReadStop, k: number): number => {
    const link = stop.links[k];
    let at = -1;
    constraints.forEach((c, i) => {
      if (writes(c, link)) at = i;
    });
    if (at < 0) {
      throw new CompileError(
        `${stop.who}: links[${k}] "${link}" is written by no constraint of this rig spec — a stop holds a link something swings (a physics, ik, transform or path constraint in "constraints"), and its copy and clamp run right after that. A physics constraint in the motion spec's table is emitted after every rig constraint, past the clamp; declare it here`, 'CE_STOP_LINK_UNDRIVEN',
      );
    }
    return at;
  };

  // -- 4. the tree the expansion makes, by name ----------------------------------
  const parentOf = new Map<string, string | undefined>();
  for (const [name, bone] of authored) parentOf.set(name, bone.parent);
  for (const stop of stops) {
    const { names, links } = stop;
    parentOf.set(names.frame, authored.get(links[0])?.parent);
    parentOf.set(names.rel, names.frame);
    parentOf.set(names.drawn[0], names.frame);
    for (let k = 1; k < links.length; k++) parentOf.set(names.drawn[k], authored.get(links[k])?.parent);
    parentOf.set(names.point, stop.against);
  }
  const ancestry = (name: string): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (let at = parentOf.get(name); at !== undefined && !seen.has(at); at = parentOf.get(at)) {
      seen.add(at);
      out.push(at);
    }
    return out;
  };
  for (const stop of stops) {
    const { names, links } = stop;
    for (let k = 1; k < links.length; k++) {
      if (!ancestry(links[k]).includes(names.drawn[k - 1])) {
        throw new CompileError(
          `${stop.who}: links[${k}] "${links[k]}" does not hang below "${names.drawn[k - 1]}", the drawn link of links[${k - 1}] — a chain's next link hangs from the drawn link above it, so the clamp that holds that one carries this one; parent it there`, 'CE_STOP_LINK_PARENT_CHAIN',
        );
      }
    }
    const held = new Set([names.frame, names.rel, ...names.drawn, ...links]);
    const under = [stop.against, ...ancestry(stop.against)].find((b) => held.has(b));
    if (under !== undefined) {
      throw new CompileError(`${stop.who}: "against" "${stop.against}" hangs below "${under}", which the stop moves — the point would swing with the chain it holds off; name the leg`, 'CE_STOP_AGAINST_MOVES_WITH_STOP');
    }
  }

  // -- 5. the angles, off the setup pose as stated -------------------------------
  const generated = new Map<string, RigBone>();
  const known = (name: string): RigBone | undefined => authored.get(name) ?? generated.get(name);
  const before = new Map<number, RigConstraint[]>();
  const after = new Map<number, RigConstraint[]>();
  const appended: RigConstraint[] = [];
  const queue = (map: Map<number, RigConstraint[]>, at: number, c: RigConstraint): void => {
    if (plant.appendConstraints) appended.push(c);
    else map.set(at, [...(map.get(at) ?? []), c]);
  };
  const conformal = (m: BoneTransform): boolean => {
    const scale = Math.max(Math.abs(m.a), Math.abs(m.b), Math.abs(m.c), Math.abs(m.d));
    return m.a * m.d - m.b * m.c > 0 && Math.abs(m.a - m.d) <= 1e-9 * scale && Math.abs(m.b + m.c) <= 1e-9 * scale;
  };
  const clampOf = (name: string, source: string, target: string, lo: number, hi: number): RigTransformConstraint => ({
    name,
    type: 'transform',
    source,
    bones: [target],
    localSource: true,
    localTarget: true,
    clamp: true,
    properties: { rotate: { offset: lo, to: { rotate: { offset: lo, max: hi, scale: 1 } } } },
    mixRotate: 1,
  });
  /**
   * The first link's half of a bound refusal (issue #1455): where its rest
   * angle came from, and what to move. Every figure is one the expansion
   * already read — the link's root and hang and the point, in the exact frame's
   * world (Spine world, y up) at the setup pose — and the bound is
   * `|rest| + end`, since inward's sign is the opposite of rest's.
   */
  const aimed = (stop: ReadStop, rest: number, end: 'inward' | 'outward', at: FirstLink): string => {
    const e = stop[end];
    const off = Math.abs(rest);
    const sum = off + e;
    const geometry =
      `. "${stop.links[0]}" hangs at ${at.hang}° from its root at [${at.root.join(', ')}], and "${stop.names.point}" ("at" [${stop.at.join(', ')}] on "${stop.against}") ` +
      `sits at [${at.point.join(', ')}] — Spine world, y up, at the setup pose — so the aim from that root to the point lies ${off}° off the hang (rest ${rest}°): ` +
      `|rest| ${off}° + "${end}" ${e}° is ${sum}°`;
    if (sum < -BOUND) return `${geometry}, below -${BOUND}°. State "${end}" at least ${-BOUND - off}°`;
    if (e >= BOUND) return `${geometry}, above ${BOUND}°, and no point lowers it: |rest| is above 0° for every point a stop accepts. State "${end}" below ${BOUND}°`;
    return (
      `${geometry}, above ${BOUND}°. Move "${stop.names.point}" to within ${BOUND - e}° (${BOUND}° − "${end}") of the direction "${stop.links[0]}" hangs in from its root, ${at.hang}°, ` +
      `or state "${end}" at most ${BOUND - off}°`
    );
  };
  const bounds = (stop: ReadStop, rest: number, sign: number, range: { inward: number; outward: number }, field: string, what: string, first?: FirstLink): [number, number] => {
    const a = rest - sign * range.outward;
    const b = rest - sign * range.inward;
    for (const [end, value] of [['outward', a], ['inward', b]] as const) {
      if (Math.abs(value) > BOUND) {
        const why = first === undefined ? '' : aimed(stop, rest, end, first);
        throw new CompileError(
          `${stop.who}: "${field}${end}" ${range[end]} puts ${what}'s bound at ${value}°, past ±${BOUND}° — the clamp reads a local rotation in (-180, 180], so a bound past it is never reached and the range it states is not the one that holds${why}`, 'CE_STOP_LOCAL_BOUND_RANGE',
        );
      }
    }
    return [Math.min(a, b), Math.max(a, b)];
  };

  for (const stop of stops) {
    const { names, links, who } = stop;
    const link = authored.get(links[0]) as RigBone;
    const parent = link.parent as string;
    // The bones the angles are read through, root first: the first link's
    // ancestry and the leg's, each parent before its child.
    const chain: RigBone[] = [];
    const listed = new Set<string>();
    for (const tip of [links[0], stop.against]) {
      for (const name of [...ancestry(tip).reverse(), tip]) {
        if (listed.has(name)) continue;
        const bone = known(name);
        if (bone === undefined) {
          throw new CompileError(`${who}: "${tip}" hangs below "${name}", which a later stop generates — declare that stop first, so its angles are known when this one is read`, 'CE_STOP_DEPENDENCY_ORDER');
        }
        if (bone.from !== undefined) {
          throw new CompileError(`${who}: "${name}" takes its place from the manifest ("from"), and a stop's angles are read off the setup pose this rig spec states — state its x, y and rotation`, 'CE_STOP_ANCESTOR_MANIFEST_POSITION');
        }
        listed.add(name);
        chain.push(bone);
      }
    }
    const frames = computeExactFrameTransforms(chain);
    const parentFrame = frames.get(parent) as BoneTransform;
    if (!conformal(parentFrame)) {
      throw new CompileError(
        `${who}: "${parent}", where the frame hangs, is scaled unevenly, sheared or reflected at the setup pose — the frame's angles add to its parent's only through a rotation and an even scale, and inward is a turn's sense`, 'CE_STOP_FRAME_PARENT_TRANSFORM',
      );
    }
    for (let k = 1; k < links.length; k++) {
      for (let at = authored.get(links[k])?.parent; at !== undefined && at !== names.drawn[k - 1]; at = parentOf.get(at)) {
        const bone = authored.get(at);
        if (bone === undefined) break;
        const plain = (bone.scaleX ?? 1) === (bone.scaleY ?? 1) && (bone.scaleX ?? 1) > 0 && (bone.shearX ?? 0) === 0 && (bone.shearY ?? 0) === 0 && (bone.inherit ?? 'normal') === 'normal';
        if (!plain) {
          throw new CompileError(
            `${who}: "${at}", between links[${k}] "${links[k]}" and the drawn link above it, is scaled unevenly, sheared, reflected or inherits other than normally — a lower clamp reads the link's turn in its parent, and inward is a turn's sense`, 'CE_STOP_LOWER_PARENT_TRANSFORM',
          );
        }
      }
    }
    const linkFrame = frames.get(links[0]) as BoneTransform;
    const point = toWorld(frames.get(stop.against) as BoneTransform, stop.at[0], stop.at[1]);
    const target = plant.aimAtAgainst ? [(frames.get(stop.against) as BoneTransform).worldX, (frames.get(stop.against) as BoneTransform).worldY] : point;
    const dx = target[0] - linkFrame.worldX;
    const dy = target[1] - linkFrame.worldY;
    if (dx === 0 && dy === 0) {
      throw new CompileError(`${who}: "at" [${stop.at.join(', ')}] on "${stop.against}" sits on the root of "${links[0]}" at the setup pose — the frame aims from the root at the point, and there is no direction to a point it stands on`, 'CE_STOP_POINT_AT_ROOT');
    }
    const aim = directionDegrees(dx, dy);
    // Each angle is brought into (-180, 180] by one whole turn at most, so a
    // link and an aim already in range subtract with no turn added and taken
    // away again — the rest angle is the plain difference an author computes.
    const rest = halfTurn(halfTurn(linkFrame.worldRotation) - aim);
    if (rest === 0) {
      throw new CompileError(
        `${who}: "at" [${stop.at.join(', ')}] on "${stop.against}" lies on "${links[0]}"'s own line at the setup pose — inward is the turn from the link toward the point, and a point on the link's line has no side`, 'CE_STOP_POINT_ON_LINK_LINE',
      );
    }
    // Inward turns the link toward the aim line: counter-clockwise when the link
    // lies clockwise of it (a negative rest angle), clockwise otherwise.
    const sign = (rest < 0 ? 1 : -1) * (plant.swapRange ? -1 : 1);
    const [lo, hi] = bounds(stop, rest, sign, stop, '', `"${names.drawn[0]}"`, { hang: halfTurn(linkFrame.worldRotation), root: [linkFrame.worldX, linkFrame.worldY], point });

    const frame: RigBone = { name: names.frame, parent };
    if (link.x !== undefined) frame.x = link.x;
    if (link.y !== undefined) frame.y = link.y;
    if (link.length !== undefined) frame.length = link.length;
    frame.rotation = localDirectionDegrees(parentFrame, dx, dy);
    const onFrame = (name: string): RigBone => {
      const bone: RigBone = { name, parent: names.frame };
      if (link.length !== undefined) bone.length = link.length;
      bone.rotation = rest;
      return bone;
    };
    generated.set(names.frame, frame);
    generated.set(names.rel, onFrame(names.rel));
    generated.set(names.drawn[0], onFrame(names.drawn[0]));
    for (let k = 1; k < links.length; k++) {
      const source = authored.get(links[k]) as RigBone;
      const twin: RigBone = { name: names.drawn[k], parent: source.parent };
      for (const field of TWIN_FIELDS) {
        if (source[field] !== undefined) Object.assign(twin, { [field]: source[field] });
      }
      generated.set(names.drawn[k], twin);
    }
    generated.set(names.point, { name: names.point, parent: stop.against, x: stop.at[0], y: stop.at[1] });

    const firstWriter = lastWriter(stop, 0);
    const aimAt: RigIkConstraint = { name: names.aim, type: 'ik', bones: [names.frame], target: plant.aimAtAgainst ? stop.against : names.point, mix: 1 };
    queue(before, firstWriter, aimAt);
    queue(after, firstWriter, { name: names.copy, type: 'transform', source: links[0], bones: [names.rel], properties: { rotate: { to: { rotate: {} } } }, mixRotate: 1 });
    queue(after, firstWriter, clampOf(names.clamp[0], names.rel, names.drawn[0], lo, hi));
    for (let k = 1; k < links.length; k++) {
      const source = authored.get(links[k]) as RigBone;
      const [l, h] = bounds(stop, source.rotation ?? 0, sign, stop.lower as { inward: number; outward: number }, 'lower.', `"${names.drawn[k]}"`);
      queue(after, lastWriter(stop, k), clampOf(names.clamp[k], links[k], names.drawn[k], l, h));
    }
  }

  // -- 6. spliced in -------------------------------------------------------------
  const bones: RigBone[] = [];
  const firstOf = new Map<string, ReadStop>();
  const lowerOf = new Map<string, { stop: ReadStop; k: number }>();
  for (const stop of stops) {
    firstOf.set(stop.links[0], stop);
    for (let k = 1; k < stop.links.length; k++) lowerOf.set(stop.links[k], { stop, k });
  }
  const take = (name: string): RigBone => generated.get(name) as RigBone;
  for (const bone of spec.bones) {
    const first = isObj(bone) ? firstOf.get(bone.name) : undefined;
    if (first !== undefined) bones.push(take(first.names.frame));
    bones.push(bone);
    if (first !== undefined) bones.push(take(first.names.rel), take(first.names.drawn[0]));
    const lower = isObj(bone) ? lowerOf.get(bone.name) : undefined;
    if (lower !== undefined) bones.push(take(lower.stop.names.drawn[lower.k]));
  }
  for (const stop of stops) bones.push(take(stop.names.point));
  const out: RigConstraint[] = [];
  constraints.forEach((c, i) => {
    out.push(...(before.get(i) ?? []), c, ...(after.get(i) ?? []));
  });
  out.push(...appended);
  return { ...spec, bones, constraints: out };
}
