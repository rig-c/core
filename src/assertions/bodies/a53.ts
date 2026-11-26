import type { CombinedDeformSurvey } from '../../deformsurvey.ts';
import type { DeformSliderCombination, RigInfo } from '../../types.ts';
import type { Verdicts } from '../harness.ts';

export const A53 = 'A53_DECLARED_SLIDER_COMBINATIONS_KEEP_WINDING';

export type SupplyDeformCombinations = (combinations: readonly DeformSliderCombination[], exempt: ReadonlySet<string>) => CombinedDeformSurvey;

export function a53DeclaredSliderCombinationsKeepWinding({ fail, skip, stats }: Verdicts, supply: SupplyDeformCombinations, rig: RigInfo | undefined): void {
  if (rig === undefined) return skip(A53, 'no rig info (validating a bare directory), so no slider combinations were declared here');
  const combinations = rig.deformSliderCombinations;
  if (combinations === undefined || combinations.length === 0) return skip(A53, 'rig declares no invariants.deformSliderCombinations');

  const survey = supply(combinations, new Set(rig.deformMayFold));
  const unmeasured = survey.unmeasured.join(',');
  stats.deformSliderCombinationsMeasured = survey.measured;
  stats.deformSliderCombinationsUnmeasured = survey.unmeasured.length;
  if (survey.unmeasured.length > 0) stats.deformSliderCombinationsNoVisibleWinding = unmeasured;
  if (survey.measured === 0) {
    return skip(A53, `combination(s) ${unmeasured} have no visible, non-exempt mesh triangle with a winding to keep at an applied deform key`);
  }

  for (const row of survey.reversals) {
    const inputs = row.samples.map(({ slider, value, animation, time, keys }) => {
      const keyText = keys.map((key) => `key ${key.index} at ${key.time.toFixed(6)}s`).join(' to ');
      const when = time === undefined ? 'slider inactive at this pose' : `t=${time.toFixed(6)}s, ${keyText || 'no deform key applied on this mesh'}`;
      return `"${slider}"=${value} ("${animation}", ${when})`;
    });
    const shown = row.reversed.slice(0, 4).map((r) => `triangle ${r.triangle} [${r.ids.join(',')}] ${r.before.toFixed(3)} -> ${r.after.toFixed(3)}px²`);
    const more = row.reversed.length > shown.length ? `, and ${row.reversed.length - shown.length} more` : '';
    fail(A53,
      `combination ${row.combination} [${inputs.join(', ')}], skin ${JSON.stringify(row.skin)}, ${row.slot}/${row.attachment}: ` +
      `${row.reversed.length} of ${row.triangles} triangle(s) reverse winding — ${shown.join(', ')}${more}. ` +
      'Fix the named deform keys or the inputs this rig declares together.');
  }
}
