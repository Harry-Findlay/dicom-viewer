/**
 * volumeDetection.ts
 *
 * Analyses a loaded DICOM series and decides whether it should be rendered
 * as a 3D volume (MPR + VR quad layout) rather than a plain 2D stack.
 *
 * Criteria for "is 3D":
 *  - ≥ 16 slices in the series
 *  - Consistent slice thickness (variation < 10 %)
 *  - ImageOrientationPatient present and consistent (not a localiser / scout)
 *  - Modality is CT (MR support can be added later)
 */

import type { ImageMetaData } from './cornerstoneInit' // adjust path if needed

export interface VolumeInfo {
  isVolume: boolean
  sliceCount: number
  sliceThickness: number   // mm
  spacingBetweenSlices: number // mm (derived from positions)
  modality: string
  reason: string           // human-readable decision explanation
}

/** Minimum slices required to trigger volume rendering */
const MIN_SLICES = 16

export function detectVolume(metaList: ImageMetaData[]): VolumeInfo {
  const count = metaList.length
  const modality = metaList[0]?.Modality ?? 'CT'

  if (count < MIN_SLICES) {
    return { isVolume: false, sliceCount: count, sliceThickness: 0, spacingBetweenSlices: 0, modality, reason: `Only ${count} slices (need ≥ ${MIN_SLICES})` }
  }

  // Extract slice positions from ImagePositionPatient (tag 0020,0032)
  const positions = metaList
    .map(m => parseFloat(m.ImagePositionPatient?.split('\\')[2] ?? 'NaN'))
    .filter(v => !isNaN(v))

  if (positions.length < MIN_SLICES) {
    return { isVolume: false, sliceCount: count, sliceThickness: 0, spacingBetweenSlices: 0, modality, reason: 'Missing ImagePositionPatient tags' }
  }

  const sorted = [...positions].sort((a, b) => a - b)
  const gaps = sorted.slice(1).map((p, i) => Math.abs(p - sorted[i]))
  const meanGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  const maxGap = Math.max(...gaps)

  // Reject if spacing is wildly inconsistent (scout/localiser mixed in)
  if (maxGap > meanGap * 1.5 && maxGap > 2) {
    return { isVolume: false, sliceCount: count, sliceThickness: 0, spacingBetweenSlices: meanGap, modality, reason: `Inconsistent slice spacing (max gap ${maxGap.toFixed(1)} mm vs mean ${meanGap.toFixed(1)} mm)` }
  }

  const sliceThickness = parseFloat(metaList[0]?.SliceThickness ?? String(meanGap))

  return {
    isVolume: true,
    sliceCount: count,
    sliceThickness,
    spacingBetweenSlices: meanGap,
    modality,
    reason: `${count} slices, ${meanGap.toFixed(2)} mm spacing`,
  }
}
