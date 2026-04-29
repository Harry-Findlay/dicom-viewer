import React, { useEffect, useState, useRef } from 'react'
import { useStore } from '../store/appStore'
import { MainViewport } from './MainViewport'
import VolumeViewport from './VolumeViewport'
import { createVolume, destroyCurrentVolume } from '../utils/volumeLoader'
import { detectVolume } from '../utils/volumeDetection'

type Mode = 'stack-2d' | 'building' | 'volume-3d'

export function ViewportManager() {
  const { activeSeries } = useStore()
  const [mode, setMode]             = useState<Mode>('stack-2d')
  const [volumeId, setVolumeId]     = useState<string | null>(null)
  const [buildError, setBuildError] = useState<string | null>(null)
  const evaluatedUID = useRef<string | null>(null)

  useEffect(() => {
    if (!activeSeries) {
      // No series loaded — tear everything down
      destroyCurrentVolume()
      setVolumeId(null)
      setMode('stack-2d')
      evaluatedUID.current = null
      return
    }

    // If we're switching AWAY from the current 3D series (volumeId is set but
    // we're evaluating a different UID), always destroy and reset so that
    // returning to the same 3D series later triggers a fresh build.
    if (evaluatedUID.current && evaluatedUID.current !== activeSeries.seriesUID) {
      destroyCurrentVolume()
      setVolumeId(null)
      evaluatedUID.current = null
    }

    // Skip if we've already successfully built this series
    if (evaluatedUID.current === activeSeries.seriesUID) return
    evaluatedUID.current = activeSeries.seriesUID

    setBuildError(null)

    const thickness = activeSeries.sliceThickness ?? 1
    const metaList = activeSeries.imageIds.map((_: string, i: number) => ({
      Modality: activeSeries.modality ?? 'CT',
      SliceThickness: String(thickness),
      ImagePositionPatient: `0\\0\\${(i * thickness).toFixed(4)}`,
    }))

    const info = detectVolume(metaList)
    console.info('[ViewportManager]', info.reason)

    if (!info.isVolume) {
      setMode('stack-2d')
      return
    }

    setMode('building')

    createVolume(activeSeries.imageIds, activeSeries.seriesUID)
      .then(id => { setVolumeId(id); setMode('volume-3d') })
      .catch(err => {
        console.error('[ViewportManager] Volume creation failed:', err)
        setBuildError(err?.message ?? 'Volume creation failed')
        // Reset so a retry is possible
        evaluatedUID.current = null
        setMode('stack-2d')
      })
  }, [activeSeries])

  // ── 3D mode: only render VolumeViewport, no MainViewport ──────────────────
  if (mode === 'volume-3d' && volumeId) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <VolumeViewport volumeId={volumeId} />
      </div>
    )
  }

  // ── Building spinner ──────────────────────────────────────────────────────
  if (mode === 'building') {
    return (
      <div style={{
        flex: 1, minHeight: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', gap: 16, color: '#bbb',
      }}>
        <div style={{
          width: 40, height: 40, border: '3px solid #333',
          borderTopColor: '#4a90d9', borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ margin: 0, fontSize: 14 }}>Building 3D volume…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── 2D stack mode ─────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <MainViewport />
      {buildError && (
        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: '#3a1010', color: '#f08080', padding: '6px 14px',
          borderRadius: 6, fontSize: 12, zIndex: 20, whiteSpace: 'nowrap',
        }}>
          ⚠ 3D build failed — showing 2D. {buildError}
        </div>
      )}
    </div>
  )
}
