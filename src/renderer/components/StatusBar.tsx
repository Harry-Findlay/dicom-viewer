import React from 'react'
import { useStore } from '../store/appStore'
import styles from '../styles/StatusBar.module.css'

export function StatusBar() {
  const { activeSeries, activeSliceIndex, isLoading } = useStore()

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {isLoading && <span className={styles.loading}>Loading…</span>}
        {activeSeries && (
          <>
            <span>{activeSeries.patientName || 'Anonymous'}</span>
            <span className={styles.sep}>·</span>
            <span>{activeSeries.modality}</span>
            <span className={styles.sep}>·</span>
            <span>
              Slice {activeSliceIndex + 1}/{activeSeries.imageIds.length}
            </span>
            {activeSeries.sliceThickness && (
              <>
                <span className={styles.sep}>·</span>
                <span>{activeSeries.sliceThickness.toFixed(1)} mm thick</span>
              </>
            )}
          </>
        )}
      </div>
      <div className={styles.right}>
        <span className={styles.hint}>Scroll to navigate slices · Right-click drag to zoom · Middle-click drag to pan</span>
      </div>
    </div>
  )
}
