/**
 * What kind of rule each assertion is, and which profile runs which kind
 * (issue #1025, step 4c of #380).
 *
 * The table lives here rather than in `src/validate.ts` because two harnesses
 * read it now: `validate()`'s `check`, which runs an assertion over what
 * spine-core loaded, and the model side's (`./harness.ts`), which runs the
 * same body over the model document and the core. A profile has to exclude
 * the same rules on both sides, and two copies of the table is how one of
 * them would come to exclude a rule the other runs. This module links nothing
 * from the runtime, which is the condition for the model side to read it.
 */

/** The two rulebooks — `ValidateProfile` in `src/validate.ts`, where the choice between them is argued. */
export type AssertionProfile = 'spine' | 'rig-play';

/** Refuse an unknown profile before the kind rule can silently select validity alone. */
export function resolveProfile(profile: string, who: string): AssertionProfile {
  if (profile === 'spine' || profile === 'rig-play') return profile;
  throw new Error(`${who}: profile ${JSON.stringify(profile)} is not a profile; the profiles are "spine" and "rig-play"`);
}

/** The three kinds a rule can be; the table's own comment says what each means. */
export type AssertionKind = 'validity' | 'renderer' | 'archetype';

/**
 * What kind of rule each assertion is. Every assertion has an entry, and
 * `check()` throws on a name that has none — a new assertion must state its kind
 * rather than defaulting into one, because the default would decide, silently,
 * whether it runs on foreign data.
 *
 *   validity  — the file is wrong for any consumer. Runs under every profile.
 *   renderer  — valid Spine that this project's renderer or frame budget refuses.
 *   archetype — a structural rule about rigc's own formations, meaningless to a
 *               skeleton rigc did not compile.
 *
 * Two assertions are MIXED and are marked `validity` here because their
 * validity half must never stop running; their policy clauses are gated inside
 * the assertion body against `profile`, and each such clause says so where it
 * lives. They are A06 (size-vs-PNG and every region's rectangle inside the page
 * it names are validity; pma and rotation are policy — the rectangle moved
 * across that line in issue #694, and the reason is stated where it now sits;
 * the policy clause about two regions over the same texels left A06 for
 * `A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP` in issue #1099, a renderer rule of
 * its own) and A20 (weight coherence is validity; requiring
 * a mesh to be weighted at all is policy).
 *
 * A08 was the third until issue #574 retired its policy clause. It required a
 * skin entry's placeholder to be spelled like the region it resolves to, under
 * a renderer that resolves art by `path` and has never read a placeholder — so
 * restating it as the renderer's own join made it a tautology over the validity
 * half. The argument, with the renderer lines it is measured against, sits above
 * `check('A08_…')`.
 *
 * The numbering has gaps, and they are retirements, not reservations: A41
 * (issue #1202), and A11 and A27 (issue #1404) — two `renderer` rules stating
 * limits the player `rig-play` names does not have, since it draws a clipping
 * attachment and a region on a page named for something else in both of its
 * modes. A retired code is not reused, so a line that names one in an old
 * report still means what it meant.
 */
export const ASSERTION_KIND: Readonly<Record<string, AssertionKind>> = {
  A00_ROUNDTRIP_PARSE: 'validity',
  A01_NO_LEGACY_TOPLEVEL_CONSTRAINT_ARRAYS: 'validity',
  A02_NO_BONE_TRANSFORM_KEY: 'validity',
  A03_REGION_WIDTH_HEIGHT_FINITE: 'validity',
  A04_MESH_TRIANGLES_AND_ENCODING: 'validity',
  A05_CURVE_ARRAY_LENGTH: 'validity',
  A06_ATLAS_PAGE_SIZE_MATCHES_PNG: 'validity', // mixed — see above
  A07_ATLAS_TEXT_SHAPE: 'validity',
  A08_REGION_NAMES_MATCH_ATTACHMENTS: 'validity', // no longer mixed — see above (#574)
  A09_ANIMATION_DURATION_MATCHES_SPEC: 'validity',
  A10_NO_NAN_AFTER_STEPPING: 'validity',
  A12_NO_DARK_COLOR: 'renderer',
  A13_MESH_BUDGET: 'renderer',
  A14_NO_FULL_FRAME_MESH: 'renderer',
  A15_IDLE_NO_MESH_BONE_KEYS: 'renderer',
  A16_SKELETON_VERSION_4_3: 'validity',
  A17_ATLAS_PAGE_FILES_EXIST: 'validity',
  A18_DETERMINISTIC_EMIT: 'validity',
  A19_OVERLAY_PNGS_HAVE_ALPHA: 'renderer',
  A20_MESH_WEIGHTS_COHERENT: 'validity', // mixed — see above
  A21_MESH_RIM_PINNED: 'archetype',
  A22_MESH_UVS_IN_UNIT_RANGE: 'validity',
  A23_PHYSICS_CONSTRAINT_EFFECTIVE: 'validity',
  A24_AXIS_SPACE_STROKE: 'archetype',
  A25_DETACHED_BONE_PARENTAGE: 'archetype',
  A26_SLOT_DRAW_ORDER: 'archetype',
  A28_RIBBON_ROWS_SHARE_WEIGHTS: 'archetype',
  A29_STROKE_WITHIN_CONTACT_DEPTH: 'archetype',
  A30_STROKE_WITHIN_CAP_CONTAINMENT: 'archetype',
  A31_DRAW_ORDER_OFFSETS_RESOLVE: 'validity',
  A32_EVENT_KEYS_RESOLVE: 'validity',
  A33_VERTEX_ATTACHMENT_GEOMETRY: 'validity',
  A34_CONSTRAINT_TIMELINE_TARGETS: 'validity',
  A35_DEFORM_KEYS_FIT_THE_ATTACHMENT: 'validity',
  A36_PATH_CONSTRAINT_EFFECTIVE: 'validity',
  A37_SLIDER_CONSTRAINT_EFFECTIVE: 'validity',
  A38_SKIN_MEMBERS_ARE_SKIN_REQUIRED: 'validity',
  A39_DEFORM_KEEPS_TRIANGLE_WINDING: 'archetype',
  A40_SLIDERS_COMPOSE_ON_A_SHARED_TARGET: 'validity',
  A42_DRIVEN_CONSTRAINTS_UPDATE_AFTER_THEIR_DRIVER: 'validity',
  A43_TWO_COLOR_TINT_LOADS_AND_POSES_AS_WRITTEN: 'validity',
  A44_LINKED_MESH_STATES_NO_GEOMETRY_OF_ITS_OWN: 'validity',
  A45_SEPARABLE_COLOR_TIMELINES_OWN_THEIR_CHANNELS_AND_POSE_AS_WRITTEN: 'validity',
  A46_SEQUENCE_ATTACHMENTS_SHOW_THE_FRAME_THE_FILE_STATES: 'validity',
  A47_IK_CONSTRAINT_NOT_MUTED_THROUGHOUT: 'validity',
  A48_TRANSFORM_CONSTRAINT_NOT_MUTED_THROUGHOUT: 'validity',
  A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP: 'renderer',
  A50_STAGE_BOX_IS_THE_STAGE: 'validity',
  A51_BONES_LIE_ALONG_THEIR_DECLARED_AXIS: 'validity',
  A52_WEIGHTED_VERTICES_SHARE_ONE_BONE_ORDER: 'validity',
};

/** Whether `profile` runs a rule of `kind`: `spine` runs validity alone, `rig-play` every kind. */
export function kindRunsUnder(kind: AssertionKind, profile: AssertionProfile): boolean {
  return kind === 'validity' || profile === 'rig-play';
}
