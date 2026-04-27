import React, { useState } from 'react'
import { X, Download } from 'lucide-react'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { useStore } from '../store/appStore'
import { getEngine, VIEWPORT_ID } from '../utils/cornerstoneInit'
import styles from '../styles/ExportDialog.module.css'

type ExportFormat = 'png' | 'jpeg' | 'tiff'

/**
 * Capture the viewport with or without annotations.
 * Cornerstone renders image pixels to one canvas; the annotation tools render
 * to a separate SVG/canvas overlay on the same element. We composite both
 * onto an offscreen canvas so exports include annotations.
 */
async function captureViewport(viewport: any, includeAnnotations: boolean): Promise<string> {
  // The Cornerstone element contains:
  //  - a <canvas> with image pixels (getCanvas())
  //  - zero or more <canvas> overlays drawn by cornerstoneTools
  const element = viewport.element as HTMLElement
  const imageCanvas = viewport.getCanvas() as HTMLCanvasElement
  const w = imageCanvas.width
  const h = imageCanvas.height

  const offscreen = document.createElement('canvas')
  offscreen.width = w
  offscreen.height = h
  const ctx = offscreen.getContext('2d')!

  // 1. Draw the image
  ctx.drawImage(imageCanvas, 0, 0)

  // 2. If annotations requested, composite every other canvas inside the element
  if (includeAnnotations) {
    const allCanvases = element.querySelectorAll('canvas')
    allCanvases.forEach(c => {
      if (c === imageCanvas) return // already drawn
      if (c.width === 0 || c.height === 0) return
      try {
        // Scale if canvas has different physical size
        ctx.save()
        ctx.scale(w / c.width, h / c.height)
        ctx.drawImage(c, 0, 0)
        ctx.restore()
      } catch {}
    })

    // Also capture SVG overlays (some CS versions use SVG for annotations)
    const svgs = element.querySelectorAll('svg')
    if (svgs.length) {
      const svgBlobs = await Promise.all(Array.from(svgs).map(svg => {
        const clone = svg.cloneNode(true) as SVGElement
        // Ensure proper dimensions
        clone.setAttribute('width', String(w))
        clone.setAttribute('height', String(h))
        const xml = new XMLSerializer().serializeToString(clone)
        return new Promise<HTMLImageElement | null>(resolve => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
        })
      }))
      svgBlobs.forEach(img => { if (img) ctx.drawImage(img, 0, 0, w, h) })
    }
  }

  return offscreen.toDataURL('image/png')
}

export function ExportDialog() {
  const { setShowExportDialog, activeSeries, activeSliceIndex, showAnnotations } = useStore()
  const [format, setFormat] = useState<ExportFormat>('png')
  const [quality, setQuality] = useState(95)
  const [withAnnotations, setWithAnnotations] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    if (!activeSeries) return
    setExporting(true)
    setError(null)

    try {
      const engine = getEngine()
      if (!engine) throw new Error('Rendering engine not ready')
      const viewport = engine.getViewport(VIEWPORT_ID) as any
      if (!viewport?.getCanvas) throw new Error('Could not access viewport canvas')

      // Get composite PNG (image + annotations if requested)
      let dataUrl = await captureViewport(viewport, withAnnotations)

      // Convert to JPEG if needed
      if (format === 'jpeg') {
        const img = await new Promise<HTMLImageElement>(resolve => {
          const i = new Image(); i.onload = () => resolve(i); i.src = dataUrl
        })
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        c.getContext('2d')!.drawImage(img, 0, 0)
        dataUrl = c.toDataURL('image/jpeg', quality / 100)
      }

      const seriesDesc = (activeSeries.seriesDescription || 'dicom').replace(/[^a-zA-Z0-9_-]/g, '_')
      const patientPart = (activeSeries.patientName || 'patient').replace(/[^a-zA-Z0-9_-]/g, '_')
      const ext = format === 'jpeg' ? 'jpg' : format
      const defaultName = `${patientPart}_${seriesDesc}_slice${activeSliceIndex + 1}.${ext}`

      const result = await window.electron.saveImage({ dataUrl, format, defaultName })

      if (result.success) {
        setShowExportDialog(false)
      } else if (!result.canceled) {
        setError(result.error || 'Export failed')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.backdrop} onClick={() => setShowExportDialog(false)}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <span>Export Image</span>
          <button className={styles.close} onClick={() => setShowExportDialog(false)}><X size={16} /></button>
        </div>

        <div className={styles.body}>
          <div className={styles.field}>
            <label className={styles.label}>Format</label>
            <div className={styles.formatButtons}>
              {(['png', 'jpeg', 'tiff'] as ExportFormat[]).map(f => (
                <button key={f} className={`${styles.formatBtn} ${format === f ? styles.active : ''}`}
                  onClick={() => setFormat(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {format === 'jpeg' && (
            <div className={styles.field}>
              <label className={styles.label}>Quality: {quality}%</label>
              <input type="range" min={10} max={100} value={quality}
                onChange={e => setQuality(Number(e.target.value))} className={styles.slider} />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.toggleLabel}>
              <input type="checkbox" checked={withAnnotations}
                onChange={e => setWithAnnotations(e.target.checked)} />
              Include annotations &amp; measurements
            </label>
          </div>

          <div className={styles.info}>
            <div className={styles.infoRow}><span>Patient</span><span>{activeSeries.patientName || '—'}</span></div>
            <div className={styles.infoRow}><span>Series</span><span>{activeSeries.seriesDescription || '—'}</span></div>
            <div className={styles.infoRow}><span>Slice</span><span>{activeSliceIndex + 1} of {activeSeries.imageIds.length}</span></div>
            <div className={styles.infoRow}><span>Dimensions</span><span>{activeSeries.columns} × {activeSeries.rows} px</span></div>
          </div>

          <p className={styles.hint}>A Save dialog will open so you can choose the filename and location.</p>
          {error && <div className={styles.error}>{error}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancel} onClick={() => setShowExportDialog(false)}>Cancel</button>
          <button className={styles.exportBtn} onClick={handleExport} disabled={exporting}>
            <Download size={14} />
            {exporting ? 'Compositing…' : 'Choose location & save'}
          </button>
        </div>
      </div>
    </div>
  )
}
