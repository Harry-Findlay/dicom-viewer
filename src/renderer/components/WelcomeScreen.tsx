import React, { useCallback } from 'react'
import { FolderOpen, FileStack, Upload } from 'lucide-react'
import styles from '../styles/WelcomeScreen.module.css'

interface WelcomeScreenProps {
  isLoading: boolean
  error: string | null
  onOpenFiles: () => void
  onOpenDicomdir: () => void
  onOpenFolder: () => void
}

export function WelcomeScreen({ isLoading, error, onOpenFiles, onOpenDicomdir, onOpenFolder }: WelcomeScreenProps) {
  // Drag-and-drop support
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      if (!files.length) return

      // Get file paths via the Electron path trick
      // In Electron, File.path is the actual filesystem path
      const paths = files.map((f: any) => f.path).filter(Boolean)
      if (!paths.length) return

      // If single DICOMDIR file
      if (paths.length === 1 && paths[0].toUpperCase().endsWith('DICOMDIR')) {
        onOpenDicomdir()
        return
      }

      // Otherwise treat as DCM files — trigger the open files dialog isn't possible,
      // so we message the electron to handle drag paths
      // For now show the dialog since Electron drag paths are accessible
      onOpenFiles()
    },
    [onOpenFiles, onOpenDicomdir]
  )

  return (
    <div
      className={styles.screen}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isLoading ? (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <div className={styles.loadingText}>Loading DICOM files…</div>
        </div>
      ) : (
        <div className={styles.center}>
          <div className={styles.icon}>
            <Upload size={40} strokeWidth={1.5} />
          </div>
          <h1 className={styles.title}>DICOM Viewer</h1>
          <p className={styles.subtitle}>
            Open DICOM files, DICOMDIR, or a folder to begin
          </p>

          {error && (
            <div className={styles.error}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className={styles.actions}>
            <button className={styles.action} onClick={onOpenFiles}>
              <FileStack size={20} strokeWidth={1.5} />
              <span className={styles.actionTitle}>Open Files</span>
              <span className={styles.actionSub}>Select one or more .dcm files</span>
            </button>
            <button className={styles.action} onClick={onOpenDicomdir}>
              <FolderOpen size={20} strokeWidth={1.5} />
              <span className={styles.actionTitle}>Open DICOMDIR</span>
              <span className={styles.actionSub}>Load a DICOMDIR index file</span>
            </button>
            <button className={styles.action} onClick={onOpenFolder}>
              <FolderOpen size={20} strokeWidth={1.5} />
              <span className={styles.actionTitle}>Open Folder</span>
              <span className={styles.actionSub}>Scan a folder for DICOM files</span>
            </button>
          </div>

          <p className={styles.hint}>or drag and drop files here</p>
        </div>
      )}
    </div>
  )
}
