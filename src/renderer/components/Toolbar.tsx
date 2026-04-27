import React from 'react'
import {
  FolderOpen, FileStack,
  Move, ZoomIn, SunMedium, Ruler, Triangle,
  Circle, Square, ArrowUpRight,
  Search, RotateCw, Eye, EyeOff, Download,
  Info, Layers, Crosshair,
} from 'lucide-react'
import { useStore, type ToolName } from '../store/appStore'
import styles from '../styles/Toolbar.module.css'

interface ToolbarProps {
  onOpenFiles: () => void
  onOpenDicomdir: () => void
  onOpenFolder: () => void
}

const TOOLS: { name: ToolName; label: string; icon: React.ReactNode; group: string }[] = [
  { name: 'Pan',          label: 'Pan',       icon: <Move size={15} />,         group: 'nav' },
  { name: 'Zoom',         label: 'Zoom',       icon: <ZoomIn size={15} />,       group: 'nav' },
  { name: 'WindowLevel',  label: 'W/L',        icon: <SunMedium size={15} />,    group: 'nav' },
  { name: 'Length',       label: 'Length',     icon: <Ruler size={15} />,        group: 'measure' },
  { name: 'Angle',        label: 'Angle',      icon: <Triangle size={15} />,     group: 'measure' },
  { name: 'Ellipse',      label: 'Ellipse',    icon: <Circle size={15} />,       group: 'annotate' },
  { name: 'Rectangle',    label: 'Rectangle',  icon: <Square size={15} />,       group: 'annotate' },
  { name: 'ArrowAnnotate',label: 'Arrow',      icon: <ArrowUpRight size={15} />, group: 'annotate' },
  { name: 'Magnify',      label: 'Magnify',    icon: <Search size={15} />,       group: 'view' },
]

export function Toolbar({ onOpenFiles, onOpenDicomdir, onOpenFolder }: ToolbarProps) {
  const {
    activeTool, setActiveTool,
    showAnnotations, setShowAnnotations,
    showAnnotationsPanel, setShowAnnotationsPanel,
    showMetadata, setShowMetadata,
    setShowExportDialog,
    sliceStripVisible, setSliceStripVisible,
    activeSeries,
    resetViewport,
    viewportState,
  } = useStore()

  const groups = ['nav', 'measure', 'annotate', 'view']

  return (
    <div className={styles.toolbar}>
      {/* File actions */}
      <div className={styles.group}>
        <button className={styles.btn} onClick={onOpenFiles} title="Open DICOM files (Ctrl+O)">
          <FileStack size={15} />
          <span>Open Files</span>
        </button>
        <button className={styles.btn} onClick={onOpenDicomdir} title="Open DICOMDIR">
          <FolderOpen size={15} />
          <span>DICOMDIR</span>
        </button>
        <button className={styles.btn} onClick={onOpenFolder} title="Open folder">
          <FolderOpen size={15} />
          <span>Folder</span>
        </button>
      </div>

      <div className={styles.divider} />

      {/* Tool groups */}
      {groups.map((group) => {
        const groupTools = TOOLS.filter((t) => t.group === group)
        if (!groupTools.length) return null
        return (
          <React.Fragment key={group}>
            <div className={styles.group}>
              {groupTools.map((tool) => (
                <button
                  key={tool.name}
                  className={`${styles.toolBtn} ${activeTool === tool.name ? styles.active : ''}`}
                  onClick={() => setActiveTool(tool.name)}
                  title={tool.label}
                >
                  {tool.icon}
                  <span className={styles.toolLabel}>{tool.label}</span>
                </button>
              ))}
            </div>
            <div className={styles.divider} />
          </React.Fragment>
        )
      })}

      {/* W/L readout */}
      {activeSeries && (
        <>
          <div className={styles.wlDisplay}>
            <span className={styles.wlLabel}>WW</span>
            <span className={styles.wlValue}>{viewportState.windowWidth === 0 ? 'Auto' : Math.round(viewportState.windowWidth)}</span>
            <span className={styles.wlLabel}>WC</span>
            <span className={styles.wlValue}>{viewportState.windowCenter === 0 ? 'Auto' : Math.round(viewportState.windowCenter)}</span>
          </div>
          <div className={styles.divider} />
        </>
      )}

      {/* View toggles */}
      <div className={styles.group}>
        <button
          className={`${styles.toolBtn} ${showAnnotations ? styles.active : ''}`}
          onClick={() => setShowAnnotations(!showAnnotations)}
          title={showAnnotations ? 'Hide annotations' : 'Show annotations'}
        >
          {showAnnotations ? <Eye size={15} /> : <EyeOff size={15} />}
          <span className={styles.toolLabel}>Annot.</span>
        </button>
        <button
          className={`${styles.toolBtn} ${sliceStripVisible ? styles.active : ''}`}
          onClick={() => setSliceStripVisible(!sliceStripVisible)}
          title="Toggle slice strip"
        >
          <Layers size={15} />
          <span className={styles.toolLabel}>Slices</span>
        </button>
        <button
          className={`${styles.toolBtn} ${showAnnotationsPanel ? styles.active : ''}`}
          onClick={() => setShowAnnotationsPanel(!showAnnotationsPanel)}
          title="Annotation tools panel"
        >
          <Crosshair size={15} />
          <span className={styles.toolLabel}>Ann. Tools</span>
        </button>
        <button
          className={`${styles.toolBtn} ${showMetadata ? styles.active : ''}`}
          onClick={() => setShowMetadata(!showMetadata)}
          title="Toggle image info"
        >
          <Info size={15} />
          <span className={styles.toolLabel}>Info</span>
        </button>
        <button className={styles.toolBtn} onClick={resetViewport} title="Reset viewport">
          <RotateCw size={15} />
          <span className={styles.toolLabel}>Reset</span>
        </button>
      </div>

      <div className={styles.divider} />

      {/* Export */}
      <div className={styles.group}>
        <button
          className={`${styles.btn} ${styles.exportBtn}`}
          onClick={() => setShowExportDialog(true)}
          disabled={!activeSeries}
          title="Export current frame (Ctrl+E)"
        >
          <Download size={15} />
          <span>Export</span>
        </button>
      </div>
    </div>
  )
}
