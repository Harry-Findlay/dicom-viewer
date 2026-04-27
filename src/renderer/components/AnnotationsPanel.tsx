import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { Trash2, Edit2, Check, X, Ruler } from 'lucide-react'
import { getEngine, VIEWPORT_ID, hexToRgb } from '../utils/cornerstoneInit'
import styles from '../styles/AnnotationsPanel.module.css'

const PRESET_COLORS = ['#00ff00', '#ffff00', '#ff4444', '#4488ff', '#ff8800', '#ff44ff', '#ffffff']

interface AnnotationEntry {
  uid: string
  toolName: string
  label: string
  measurement: string
  color: string
}

function getLabel(ann: any): string {
  const map: Record<string,string> = { Length:'Length', Angle:'Angle', EllipticalROI:'Ellipse', RectangleROI:'Rectangle', ArrowAnnotate:'Arrow' }
  return map[ann.metadata?.toolName ?? ''] ?? (ann.metadata?.toolName ?? '')
}

function getMeasurement(ann: any): string {
  const stats = ann.data?.cachedStats
  if (stats) {
    const vals = Object.values(stats) as any[]
    if (vals[0]?.length !== undefined) return `${Number(vals[0].length).toFixed(2)} mm`
    if (vals[0]?.angle !== undefined) return `${Number(vals[0].angle).toFixed(1)}°`
    if (vals[0]?.area !== undefined) return `${Number(vals[0].area).toFixed(2)} mm²`
  }
  if (ann.data?.text) return ann.data.text
  return ''
}

/** Get colour from the Cornerstone style API for this annotation UID */
function getAnnColor(ann: any): string {
  try {
    const styles = cornerstoneTools.annotation.config.style.getAnnotationToolStyles(ann.annotationUID)
    if (styles?.color) {
      // Convert rgb(r,g,b) back to hex for the colour input
      const m = styles.color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
      if (m) return '#' + [m[1],m[2],m[3]].map(n => parseInt(n).toString(16).padStart(2,'0')).join('')
    }
  } catch {}
  return '#00ff00'
}

/** Apply colour to an annotation using the correct Cornerstone v1 API */
function applyColor(uid: string, hex: string) {
  const rgb = hexToRgb(hex)
  try {
    cornerstoneTools.annotation.config.style.setAnnotationStyles(uid, {
      color: rgb,
      colorHighlighted: rgb,
      colorSelected: rgb,
      colorLocked: rgb,
      textBoxColor: rgb,
      textBoxColorHighlighted: rgb,
      textBoxColorSelected: rgb,
      textBoxColorLocked: rgb,
    })
  } catch {}
}

function triggerRender() {
  const vp = getEngine()?.getViewport(VIEWPORT_ID) as any
  if (vp?.element) {
    try { cornerstoneTools.utilities.triggerAnnotationRender(vp.element) } catch {}
  }
}

export function AnnotationsPanel() {
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([])
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [calibratingUid, setCalibratingUid] = useState<string | null>(null)
  const [calibrateKnown, setCalibrateKnown] = useState('')

  const refresh = useCallback(() => {
    try {
      const all = cornerstoneTools.annotation.state.getAllAnnotations()
      setAnnotations(all.map((ann: any) => ({
        uid: ann.annotationUID,
        toolName: ann.metadata?.toolName ?? '',
        label: getLabel(ann),
        measurement: getMeasurement(ann),
        color: getAnnColor(ann),
      })))
    } catch { setAnnotations([]) }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 800)
    return () => clearInterval(t)
  }, [refresh])

  function setIndividualColor(uid: string, color: string) {
    applyColor(uid, color)
    triggerRender()
    setTimeout(refresh, 60)
  }

  function deleteAnnotation(uid: string) {
    try { cornerstoneTools.annotation.state.removeAnnotation(uid) } catch {}
    triggerRender()
    setTimeout(refresh, 50)
  }

  function saveEdit(uid: string) {
    try {
      const ann = cornerstoneTools.annotation.state.getAnnotation(uid) as any
      if (ann) {
        if (!ann.data) ann.data = {}
        ann.data.label = editText
        if (ann.metadata?.toolName === 'ArrowAnnotate') ann.data.text = editText
      }
    } catch {}
    setEditingUid(null)
    triggerRender()
    setTimeout(refresh, 60)
  }

  function applyCalibration(uid: string) {
    const knownMm = parseFloat(calibrateKnown)
    if (isNaN(knownMm) || knownMm <= 0) { setCalibratingUid(null); return }
    try {
      const ann = cornerstoneTools.annotation.state.getAnnotation(uid) as any
      const vals = Object.values(ann?.data?.cachedStats ?? {}) as any[]
      const measuredMm = vals[0]?.length
      if (measuredMm && measuredMm > 0) {
        const scale = knownMm / measuredMm
        cornerstoneTools.annotation.state.getAllAnnotations().forEach((a: any) => {
          Object.values(a.data?.cachedStats ?? {}).forEach((v: any) => {
            if (v.length !== undefined) v.length *= scale
            if (v.area !== undefined) v.area *= scale * scale
          })
        })
      }
    } catch (e) { console.error(e) }
    setCalibratingUid(null)
    triggerRender()
    setTimeout(refresh, 60)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Annotations</div>

      <div className={styles.listSection}>
        <div className={styles.sectionTitle}>Measurements ({annotations.length})</div>
        {annotations.length === 0 && <div className={styles.empty}>No annotations yet</div>}
        <div className={styles.list}>
          {annotations.map(ann => (
            <div key={ann.uid} className={styles.annItem}>
              {editingUid === ann.uid ? (
                <div className={styles.editRow}>
                  <input className={styles.editInput} value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(ann.uid)} autoFocus />
                  <button className={styles.iconBtn} onClick={() => saveEdit(ann.uid)}><Check size={12}/></button>
                  <button className={styles.iconBtn} onClick={() => setEditingUid(null)}><X size={12}/></button>
                </div>
              ) : calibratingUid === ann.uid ? (
                <div className={styles.editRow}>
                  <input className={styles.editInput} type="number" min="0.001" step="0.1"
                    value={calibrateKnown} onChange={e => setCalibrateKnown(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyCalibration(ann.uid)}
                    placeholder="Known mm" autoFocus />
                  <button className={styles.iconBtn} onClick={() => applyCalibration(ann.uid)}><Check size={12}/></button>
                  <button className={styles.iconBtn} onClick={() => setCalibratingUid(null)}><X size={12}/></button>
                </div>
              ) : (
                <>
                  {/* Per-annotation colour row */}
                  <div className={styles.annColorRow}>
                    {PRESET_COLORS.map(c => (
                      <button key={c}
                        className={styles.miniSwatch}
                        style={{ background: c, outline: ann.color === c ? `2px solid white` : 'none', outlineOffset: '1px' }}
                        onClick={() => setIndividualColor(ann.uid, c)}
                        title={`Set colour to ${c}`}
                      />
                    ))}
                    <input type="color" value={ann.color}
                      onChange={e => setIndividualColor(ann.uid, e.target.value)}
                      className={styles.miniColorInput} title="Custom colour" />
                  </div>
                  <div className={styles.annRow}>
                    <div className={styles.annInfo}>
                      <span className={styles.annType}>{ann.label}</span>
                      {ann.measurement && <span className={styles.annValue}>{ann.measurement}</span>}
                    </div>
                    <div className={styles.annActions}>
                      <button className={styles.iconBtn} title="Edit label"
                        onClick={() => { setEditingUid(ann.uid); setEditText(ann.measurement) }}>
                        <Edit2 size={11}/>
                      </button>
                      {ann.toolName === 'Length' && (
                        <button className={styles.iconBtn} title="Calibrate"
                          onClick={() => { setCalibratingUid(ann.uid); setCalibrateKnown('') }}>
                          <Ruler size={11}/>
                        </button>
                      )}
                      <button className={`${styles.iconBtn} ${styles.deleteBtn}`}
                        title="Delete" onClick={() => deleteAnnotation(ann.uid)}>
                        <Trash2 size={11}/>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
