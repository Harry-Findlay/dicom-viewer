import React from 'react'
import { useStore } from '../store/appStore'
import styles from '../styles/ViewportOverlay.module.css'

export function ViewportOverlay() {
  const { activeSeries, activeSliceIndex, viewportState, activeTool } = useStore()
  if (!activeSeries) return null

  const totalSlices = activeSeries.imageIds.length
  const slice = activeSliceIndex + 1

  const pixStr = activeSeries.pixelSpacing
    ? `${activeSeries.pixelSpacing[0].toFixed(3)} × ${activeSeries.pixelSpacing[1].toFixed(3)} mm`
    : ''

  return (
    <div className={styles.overlay}>
      {/* Top-left: patient / study info */}
      <div className={styles.topLeft}>
        <div className={styles.line}>{activeSeries.patientName || 'Anonymous'}</div>
        <div className={styles.line}>{activeSeries.patientID}</div>
        <div className={styles.line}>{activeSeries.studyDate}</div>
        <div className={styles.line}>{activeSeries.studyDescription}</div>
      </div>

      {/* Top-right: series / modality */}
      <div className={styles.topRight}>
        <div className={styles.modality}>{activeSeries.modality}</div>
        <div className={styles.line}>{activeSeries.seriesDescription}</div>
        <div className={styles.line}>Series {activeSeries.seriesNumber}</div>
      </div>

      {/* Bottom-left: W/L */}
      <div className={styles.bottomLeft}>
        <div className={styles.line}>WW: {viewportState.windowWidth === 0 ? 'Auto' : Math.round(viewportState.windowWidth)}</div>
        <div className={styles.line}>WC: {viewportState.windowCenter === 0 ? 'Auto' : Math.round(viewportState.windowCenter)}</div>
        <div className={styles.line}>Zoom: {(viewportState.zoom * 100).toFixed(0)}%</div>
        {pixStr && <div className={styles.line}>{pixStr}</div>}
      </div>

      {/* Bottom-right: slice position */}
      <div className={styles.bottomRight}>
        <div className={styles.sliceCount}>
          {slice} / {totalSlices}
        </div>
        <div className={styles.line}>{activeTool}</div>
      </div>
    </div>
  )
}
