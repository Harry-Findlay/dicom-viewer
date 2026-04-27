import React from 'react'
import type { DicomSeries } from '../store/appStore'
import styles from '../styles/SeriesPanel.module.css'

interface SeriesPanelProps {
  series: DicomSeries[]
  activeSeries: DicomSeries | null
  onSelect: (s: DicomSeries) => void
}

export function SeriesPanel({ series, activeSeries, onSelect }: SeriesPanelProps) {
  // Group by patient
  const patients = new Map<string, DicomSeries[]>()
  for (const s of series) {
    const key = s.patientName || s.patientID || 'Unknown Patient'
    if (!patients.has(key)) patients.set(key, [])
    patients.get(key)!.push(s)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Studies</span>
        <span className={styles.count}>{series.length}</span>
      </div>
      <div className={styles.list}>
        {Array.from(patients.entries()).map(([patient, patSeries]) => (
          <div key={patient} className={styles.patientGroup}>
            <div className={styles.patientName}>{patient}</div>
            {patSeries.map((s) => (
              <button
                key={s.seriesUID}
                className={`${styles.item} ${s.seriesUID === activeSeries?.seriesUID ? styles.active : ''}`}
                onClick={() => onSelect(s)}
              >
                <div className={styles.modality}>{s.modality}</div>
                <div className={styles.info}>
                  <div className={styles.desc}>
                    {s.seriesDescription || `Series ${s.seriesNumber}`}
                  </div>
                  <div className={styles.meta}>
                    {s.imageIds.length} image{s.imageIds.length !== 1 ? 's' : ''}
                    {s.studyDate ? ` · ${s.studyDate}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
