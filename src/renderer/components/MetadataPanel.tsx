import React from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store/appStore'
import styles from '../styles/MetadataPanel.module.css'

export function MetadataPanel() {
  const { activeSeries, setShowMetadata } = useStore()
  if (!activeSeries) return null

  const rows: [string, string][] = [
    ['Patient',         activeSeries.patientName || '—'],
    ['Patient ID',      activeSeries.patientID || '—'],
    ['Study Date',      activeSeries.studyDate || '—'],
    ['Description',     activeSeries.studyDescription || '—'],
    ['Modality',        activeSeries.modality],
    ['Series',          activeSeries.seriesDescription],
    ['Images',          String(activeSeries.imageIds.length)],
    ['Dimensions',      activeSeries.rows && activeSeries.columns
                          ? `${activeSeries.columns} × ${activeSeries.rows} px` : '—'],
    ['Slice thickness', activeSeries.sliceThickness != null
                          ? `${activeSeries.sliceThickness} mm` : '—'],
    ['Pixel spacing',   activeSeries.pixelSpacing
                          ? `${activeSeries.pixelSpacing[0].toFixed(3)} × ${activeSeries.pixelSpacing[1].toFixed(3)} mm`
                          : '—'],
  ]

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Image Info</span>
        <button className={styles.close} onClick={() => setShowMetadata(false)}>
          <X size={14} />
        </button>
      </div>
      <div className={styles.scroll}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>DICOM Tags</div>
          <table className={styles.table}>
            <tbody>
              {rows.map(([label, value]) => (
                <tr key={label}>
                  <td className={styles.tdLabel}>{label}</td>
                  <td className={styles.tdValue}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
