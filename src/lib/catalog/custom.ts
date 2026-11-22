import type { Target } from '../types'
import { EMISSION } from './build'
import { estimateSurfBr } from './surfaceBrightness'

export interface CustomTargetInput {
  id: string; name: string; ra: number; dec: number; majArcmin: number; minArcmin: number; type: string; mag: number | null
}

/** A user-entered target, with surface brightness estimated by the same rules as the catalog build. */
export function customTarget(i: CustomTargetInput): Target {
  return {
    id: i.id, names: [i.name], ra: i.ra, dec: i.dec, type: i.type,
    majArcmin: i.majArcmin, minArcmin: i.minArcmin, posAngle: null, mag: i.mag,
    surfBr: estimateSurfBr(i.type, i.mag, i.majArcmin, i.minArcmin),
    emission: EMISSION[i.type] ?? 'mixed',
  }
}
