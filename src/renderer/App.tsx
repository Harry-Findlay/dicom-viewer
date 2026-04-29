import React, { useEffect, useRef } from 'react'
import { useStore } from './store/appStore'
import { Toolbar } from './components/Toolbar'
import { MainViewport } from './components/MainViewport'
import { SliceStrip } from './components/SliceStrip'
import { SeriesPanel } from './components/SeriesPanel'
import { MetadataPanel } from './components/MetadataPanel'
import { AnnotationsPanel } from './components/AnnotationsPanel'
import { ExportDialog } from './components/ExportDialog'
import { WelcomeScreen } from './components/WelcomeScreen'
import { StatusBar } from './components/StatusBar'
import { initialiseCornerstonejs } from './utils/cornerstoneInit'
import { buildSeriesFromFiles, buildSeriesFromDicomdir } from './utils/dicomLoader'
import styles from './styles/App.module.css'
import { ViewportManager } from './components/ViewportManager'

export default function App() {
  const {
    activeSeries,
    series,
    setSeries,
    setActiveSeries,
    setIsLoading,
    setLoadError,
    showMetadata,
    showExportDialog,
    sliceStripVisible,
    showAnnotationsPanel,
    isLoading,
    loadError,
  } = useStore()

  const cornerstoneReady = useRef(false)

  // Initialise Cornerstone3D on mount
  useEffect(() => {
    initialiseCornerstonejs()
      .then(() => { cornerstoneReady.current = true })
      .catch((err) => console.error('Cornerstone init failed:', err))
  }, [])

  // Wire up menu events from Electron main process
  useEffect(() => {
    if (!window.electron) return

    const off1 = window.electron.onMenuEvent('menu:open-files', handleOpenFiles)
    const off2 = window.electron.onMenuEvent('menu:open-dicomdir', handleOpenDicomdir)

    return () => { off1(); off2() }
  }, [])

  async function handleOpenFiles() {
    const filePaths = await window.electron.openDicomFiles()
    if (!filePaths?.length) return
    await loadFiles(filePaths)
  }

  async function handleOpenDicomdir() {
    const dirPath = await window.electron.openDicomDir()
    if (!dirPath) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const loaded = await buildSeriesFromDicomdir(dirPath)
      setSeries(loaded)
      if (loaded.length > 0) setActiveSeries(loaded[0])
    } catch (err) {
      setLoadError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  async function loadFiles(filePaths: string[]) {
    setIsLoading(true)
    setLoadError(null)
    try {
      const loaded = await buildSeriesFromFiles(filePaths)
      setSeries(loaded)
      if (loaded.length > 0) setActiveSeries(loaded[0])
    } catch (err) {
      setLoadError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleOpenFolder() {
    const folderPath = await window.electron.openFolder()
    if (!folderPath) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const filePaths = await window.electron.listDicomFiles(folderPath)
      const loaded = await buildSeriesFromFiles(filePaths)
      setSeries(loaded)
      if (loaded.length > 0) setActiveSeries(loaded[0])
    } catch (err) {
      setLoadError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const hasContent = activeSeries !== null

  return (
    <div className={styles.app}>
      <Toolbar onOpenFiles={handleOpenFiles} onOpenDicomdir={handleOpenDicomdir} onOpenFolder={handleOpenFolder} />

      <div className={styles.body}>
        {/* Left series panel */}
        {series.length > 0 && (
          <SeriesPanel series={series} activeSeries={activeSeries} onSelect={setActiveSeries} />
        )}

        {/* Main content area */}
        <div className={styles.content} style={{ display: 'flex', flexDirection: 'column' }}>
          {!hasContent ? (
            <WelcomeScreen
              isLoading={isLoading}
              error={loadError}
              onOpenFiles={handleOpenFiles}
              onOpenDicomdir={handleOpenDicomdir}
              onOpenFolder={handleOpenFolder}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <ViewportManager />
              {sliceStripVisible && <SliceStrip />}
            </div>
          )}
        </div>

        {/* Right metadata panel */}
        {showMetadata && hasContent && <MetadataPanel />}
        {showAnnotationsPanel && hasContent && <AnnotationsPanel />}
      </div>

      <StatusBar />
      {showExportDialog && <ExportDialog />}
    </div>
  )
}
