/** Synthetic material-contact controls; bounds are chosen, not measured art. */
import { Plate } from '../tools/plate.ts';
import { type Piece, type AttachmentRest } from '../src/render_shared.ts';
import { seamsOf, seamLine, type SeamPairReading, type SeamPlant } from '../src/seam.ts';

export const contactRect = (slot: string, x: number, y: number, w: number, h: number): Piece => ({
  kind: 'region', slot, page: slot, world: [x, y, x, y + h, x + w, y + h, x + w, y],
  uvs: [0, 1, 0, 0, 1, 0, 1, 1], tint: [1, 1, 1, 1],
});
export function contactSources(defect = false): { setup: Piece[]; pages: Map<string, Plate> } {
  const parent = new Plate(6, 12); parent.rect(0, 0, 6, 12, [40, 140, 220, 255]);
  const limb = new Plate(4, 16); limb.rect(0, defect ? 6 : 0, 4, defect ? 10 : 16, [240, 120, 40, 255]);
  return { setup: [contactRect('parent', -6, -4, 6, 12), contactRect('limb', -2, -12, 4, 16)], pages: new Map([['parent', parent], ['limb', limb]]) };
}
/** Exactly +90 degrees about the origin, without trigonometric rounding. */
export const quarterTurn = (p: Piece): Piece => ({ ...p, world: p.world.flatMap((v, i, a) => i % 2 ? [] : [-a[i + 1], v]) });
export function contactReading(defect = false, transform: (p: Piece) => Piece = quarterTurn, plant: SeamPlant = {}): SeamPairReading {
  const { setup, pages } = contactSources(defect);
  return contactRead(setup, [setup[0], transform(setup[1])], pages, plant);
}
export function contactRead(setup: Piece[], pieces: Piece[], pages: Map<string, Plate>, plant: SeamPlant = {}, reverse = false): SeamPairReading {
  const rest: AttachmentRest[] = setup.map(p => ({ slot: p.slot, attachment: p.slot, kind: 'region', vertices: p.world, triangles: [0, 1, 2, 2, 3, 0] }));
  return seamsOf([reverse ? { a: 'limb', b: 'parent' } : { a: 'parent', b: 'limb' }], rest,
    [{ index: 0, time: 0, pieces, attachments: pieces.map(p => ({ slot: p.slot, attachment: p.slot, vertices: p.world, color: p.tint })) }], pages, plant)[0];
}
// This deliberately tolerates the absent additive field on the original reader:
// the RED run must name the missing observation rather than fail to import.
export function contactStatus(p: SeamPairReading): string | undefined {
  return (p as unknown as { jointContact?: { frames: { status: string }[] } }).jointContact?.frames[0]?.status;
}
export function seamContactControls(): { name: string; faults: string[]; detail: string }[] {
  const rows: { name: string; faults: string[]; detail: string }[] = [];
  const check = (name: string, reads: [string, SeamPairReading, string][], extra: string[] = []) => rows.push({ name,
    faults: [...extra, ...reads.filter(([, p, want]) => contactStatus(p) !== want).map(([label, p, want]) => `${label}: ${contactStatus(p) ?? 'missing jointContact'}, required ${want}`)],
    detail: reads.map(([label, p]) => `${label}=${contactStatus(p) ?? 'missing'} rawGap=${p.gap.worst?.px ?? 0}`).join('; ') });
  // Independent set oracle: at +90 normal limb is [-4,12] x [-2,2],
  // intersecting parent [-6,0] x [-4,8]. Removing six proximal art rows
  // leaves [2,12] x [-2,2], an exact two-unit horizontal separation.
  const normal = contactReading(), defect = contactReading(true);
  check('SE43_ROTATIONAL_BACKGROUND_IS_NOT_MATERIAL_SEPARATION', [['intact90', normal, 'joined']],
    (normal.gap.worst?.px ?? 0) > 0 ? [] : ['control has no external swept background']);
  check('SE44_REMOVED_JOINT_MATERIAL_PARTS_UNDER_THE_SAME_MAP', [['removed90', defect, 'separated'], ['removedRest', contactReading(true, p => p), 'joined']],
    (defect.gap.worst?.px ?? 0) > 0 ? [] : ['control has no raw gap']);
  const { setup, pages } = contactSources();
  const posed = [setup[0], quarterTurn(setup[1])];
  check('SE45_CONTACT_IS_SYMMETRIC_AND_FOLLOWS_SHARED_TRANSFORMS', [
    ['reverse', contactRead(setup, posed, pages, {}, true), 'joined'],
    ['whole90', contactRead(setup.map(quarterTurn), posed.map(quarterTurn), pages), 'joined'],
  ]);
  const islands = new Map(pages); const split = new Plate(4, 16);
  split.rect(0, 0, 4, 6, [255, 255, 255, 255]); split.rect(0, 8, 4, 8, [255, 255, 255, 255]); islands.set('limb', split);
  const faint = { ...posed[1], tint: [1, 1, 1, 127 / 255] as [number, number, number, number] };
  check('SE46_UNAVAILABLE_CONTACT_IS_NOT_JOINED_OR_ZERO', [
    ['absent', contactRead(setup, [setup[0]], pages), 'unavailable'],
    ['posedAsSetup', contactRead(posed, posed, pages), 'joined'],
    ['islands', contactRead(setup, posed, islands), 'unavailable'],
    ['faint', contactRead(setup, [posed[0], faint], pages), 'unavailable'],
    ['noOverlap', contactRead([setup[0], contactRect('limb', 2, -12, 4, 16)], posed, pages), 'unavailable'],
  ]);
  const touching = contactRect('limb', 0, -2, 4, 16), diagonal = contactRect('limb', 0, 8, 4, 16);
  check('SE47_EDGE_CONTACT_DIFFERS_FROM_DIAGONAL_CONTACT', [
    ['sharedEdge', contactRead(setup, [setup[0], touching], pages), 'joined'],
    ['cornerOnly', contactRead(setup, [setup[0], diagonal], pages), 'separated'],
  ]);
  const forcedJoined = contactReading(true, quarterTurn, { contact: 'joined' });
  const forcedSeparated = contactReading(false, quarterTurn, { contact: 'separated' });
  check('SE48_CONSTANT_CONTACT_MUTANTS_FAIL_THE_INDEPENDENT_ORACLE', [],
    contactStatus(forcedJoined) !== 'separated' && contactStatus(forcedSeparated) !== 'joined' &&
    contactStatus(normal) === 'joined' && contactStatus(defect) === 'separated' ? [] : ['constant contact mutant was not distinguished']);
  const fragmented = contactRead(setup, [...posed, { ...posed[1] }], pages);
  check('SE49_MULTI_FRAGMENT_CONTACT_IS_EXPLICITLY_UNAVAILABLE', [['fragments', fragmented, 'unavailable']]);
  // Project ONLY the new field away; every old field (including exposures,
  // owners, coverage, sparse summaries, status, opens/maxPx) must stay exact.
  const legacy = ({ jointContact, ...old }: SeamPairReading): string => JSON.stringify(old);
  const invariant: string[] = [];
  for (const removed of [false, true]) {
    const natural = contactReading(removed);
    for (const forced of ['joined', 'separated'] as const) {
      if (legacy(natural) !== legacy(contactReading(removed, quarterTurn, { contact: forced }))) invariant.push(`${removed}/${forced}: old-field projection differs`);
    }
  }
  check('SE52_CONTACT_MUTANTS_PRESERVE_EVERY_LEGACY_PAIR_FIELD', [], invariant);
  const rest: AttachmentRest[] = setup.map(p => ({ slot: p.slot, attachment: p.slot, kind: 'region', vertices: p.world, triangles: [0, 1, 2, 2, 3, 0] }));
  const indices = [0, 2, 3, 5];
  const sparse = seamsOf([{ a: 'parent', b: 'limb' }], rest, indices.map(index => ({ index, time: index / 12, pieces: posed,
    attachments: posed.map(p => ({ slot: p.slot, attachment: p.slot, vertices: p.world, color: p.tint })) })), pages)[0];
  const empty = seamsOf([{ a: 'parent', b: 'limb' }], rest, [], pages)[0];
  check('SE53_CONTACT_PRESERVES_SPARSE_FRAMES_AND_EMPTY_MEASUREMENT', [], [
    ...(JSON.stringify(sparse.jointContact.frames.map(({ index, time }) => [index, time])) === JSON.stringify(indices.map(i => [i, i / 12])) ? [] : ['sparse index/time changed']),
    ...(seamLine('swing', 12, sparse).includes('joined on 4 frame(s) [0, 2-3, 5]') ? [] : ['sparse contact line lost spans']),
    ...(empty.jointContact.frames.length === 0 && seamLine(null, 12, empty).includes('no sampled frames') ? [] : ['no observation read as measured zeros']),
  ]);
  return rows;
}
if (import.meta.main) {
  const rows = seamContactControls();
  for (const r of rows) console.log(`${r.faults.length ? 'FAIL' : 'PASS'} ${r.name}: ${r.detail}${r.faults.length ? ` — ${r.faults.join('; ')}` : ''}`);
  console.log(`SEAM_CONTACT_CONTROLS cases=${rows.length} pass=${rows.filter(r => !r.faults.length).length} fail=${rows.filter(r => r.faults.length).length}`);
  process.exitCode = rows.some(r => r.faults.length) ? 1 : 0;
}
