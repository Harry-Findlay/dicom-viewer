/**
 * ctPresets.ts
 *
 * Transfer-function presets for dental / CBCT volume rendering.
 *
 * Hounsfield Unit (HU) reference:
 *   Air            : -1000
 *   Soft tissue    :  -100 → +100
 *   Cancellous bone:   200 →  400
 *   Cortical bone  :   600 → 1200
 *   Dentine        :   400 →  600
 *   Enamel         :  1500 → 2500
 *   Metal          :  2500+
 */

export interface CtPreset {
  id: string
  label: string
  windowCenter: number
  windowWidth: number
  /**
   * Transfer function control points: [HU, r, g, b, opacity]
   * Opacity strategy: ZERO until hard bone threshold, then steep ramp.
   * The "colour starts before opacity" trick avoids a black fringe on
   * the surface while keeping noise invisible.
   */
  transferFunction: Array<[number, number, number, number, number]>
  /**
   * scalarOpacityUnitDistance controls how quickly opacity accumulates
   * through volume depth. Larger = more transparent overall (good for
   * reducing surface noise on thin structures). Default Cornerstone is ~1.
   * Set higher (e.g. 2-4) to reduce grainy surface noise.
   */
  scalarOpacityUnitDistance?: number
}

export const CT_PRESETS: CtPreset[] = [
  {
    id: 'bone-teeth',
    label: 'Bone & Teeth',
    windowCenter: 700,
    windowWidth: 2800,
    scalarOpacityUnitDistance: 2.5,
    transferFunction: [
      [-1000, 0.08, 0.06, 0.04, 0.00],  // air — transparent
      [  -50, 0.08, 0.06, 0.04, 0.00],  // soft tissue — transparent
      [  300, 0.50, 0.42, 0.32, 0.00],  // pre-bone: colour hint, opacity zero
      [  450, 0.55, 0.47, 0.36, 0.00],  // still zero opacity — noise guard
      [  520, 0.60, 0.52, 0.40, 0.12],  // opacity ramp begins — cancellous
      [  700, 0.75, 0.67, 0.54, 0.48],  // cortical bone
      [ 1000, 0.88, 0.82, 0.72, 0.72],  // dense cortical
      [ 1500, 0.95, 0.91, 0.82, 0.86],  // enamel / dense bone
      [ 2000, 1.00, 0.97, 0.90, 0.93],  // bright enamel
      [ 2600, 1.00, 1.00, 1.00, 1.00],  // metal / implants
      [ 3071, 1.00, 1.00, 1.00, 1.00],
    ],
  },
  {
    id: 'tooth-detail',
    label: 'Tooth Detail',
    windowCenter: 1200,
    windowWidth: 2000,
    scalarOpacityUnitDistance: 2.0,
    transferFunction: [
      [-1000, 0.00, 0.00, 0.00, 0.00],
      [  300, 0.00, 0.00, 0.00, 0.00],
      [  500, 0.48, 0.42, 0.32, 0.00],  // colour start, opacity zero
      [  620, 0.58, 0.50, 0.38, 0.00],  // noise guard — still zero
      [  680, 0.64, 0.56, 0.44, 0.20],  // dentine ramp
      [  900, 0.78, 0.70, 0.56, 0.55],
      [ 1100, 0.90, 0.84, 0.70, 0.82],
      [ 1600, 1.00, 0.97, 0.88, 0.96],
      [ 2600, 1.00, 0.90, 0.70, 1.00],
      [ 3071, 1.00, 0.85, 0.60, 1.00],
    ],
  },
  {
    id: 'implant',
    label: 'Implants',
    windowCenter: 1500,
    windowWidth: 3000,
    scalarOpacityUnitDistance: 3.0,
    transferFunction: [
      [-1000, 0.00, 0.00, 0.00, 0.00],
      [  400, 0.00, 0.00, 0.00, 0.00],
      [  650, 0.30, 0.30, 0.30, 0.00],  // colour hint, opacity zero
      [  750, 0.32, 0.32, 0.32, 0.06],  // ghost bone starts
      [ 1200, 0.45, 0.45, 0.45, 0.14],
      [ 1900, 0.20, 0.55, 0.90, 0.60],  // implant — blue
      [ 2500, 0.10, 0.70, 1.00, 0.90],
      [ 3071, 0.05, 0.80, 1.00, 1.00],
    ],
  },
  {
    id: 'mip',
    label: 'MIP',
    windowCenter: 800,
    windowWidth: 2400,
    scalarOpacityUnitDistance: 1.0,
    transferFunction: [
      [-1000, 0.00, 0.00, 0.00, 0.00],
      [  400, 0.00, 0.00, 0.00, 0.00],
      [  500, 1.00, 1.00, 1.00, 1.00],
      [ 3071, 1.00, 1.00, 1.00, 1.00],
    ],
  },
]

export const DEFAULT_PRESET_ID = 'bone-teeth'

export function getPreset(id: string): CtPreset {
  return CT_PRESETS.find(p => p.id === id) ?? CT_PRESETS[0]
}
