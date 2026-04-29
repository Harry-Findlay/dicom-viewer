/**
 * volumeLoader.ts
 *
 * Creates a Cornerstone3D Volume from a set of wadouri image IDs,
 * caches it, and provides a helper to destroy it when no longer needed.
 *
 * Cornerstone3D's volumeLoader.createAndCacheVolume() handles:
 *  - GPU memory allocation via SharedArrayBuffer
 *  - Progressive slice loading in web workers
 *  - Metadata derivation (spacing, direction cosines, origin)
 */

import {
  volumeLoader,
  cache,
  Enums as csEnums,
} from '@cornerstonejs/core'

let currentVolumeId: string | null = null

/**
 * Build a stable, deterministic volume ID from the series instance UID
 * (or fall back to a hash of the first imageId).
 */
export function makeVolumeId(seriesUID: string): string {
  return `cornerstoneStreamingImageVolume:${seriesUID}`
}

/**
 * Create and pre-cache a streaming volume. Returns the volumeId.
 * Safe to call multiple times — destroys the old volume first.
 */
export async function createVolume(
  imageIds: string[],
  seriesUID: string,
): Promise<string> {
  const volumeId = makeVolumeId(seriesUID)

  // Tear down the previous volume if it exists
  if (currentVolumeId && currentVolumeId !== volumeId) {
    try {
      cache.removeVolumeLoadObject(currentVolumeId)
    } catch {
      // ignore — may already be gone
    }
  }

  currentVolumeId = volumeId

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  })

  // CRITICAL: createAndCacheVolume only registers the volume — you must
  // explicitly call load() to start streaming pixel data into the GPU buffer.
  volume.load()

  return volumeId
}

/** Destroy the current cached volume (call on series close / unmount). */
export function destroyCurrentVolume(): void {
  if (currentVolumeId) {
    try {
      cache.removeVolumeLoadObject(currentVolumeId)
    } catch {
      // ignore
    }
    currentVolumeId = null
  }
}

export function getCurrentVolumeId(): string | null {
  return currentVolumeId
}
