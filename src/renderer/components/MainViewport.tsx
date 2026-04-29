import React, { useEffect, useRef } from 'react'
import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { useStore } from '../store/appStore'
import { RENDERING_ENGINE_ID, VIEWPORT_ID, TOOL_GROUP_ID, storeEngine, listenForNewAnnotations } from '../utils/cornerstoneInit'
import { ViewportOverlay } from './ViewportOverlay'
import styles from '../styles/MainViewport.module.css'

const { RenderingEngine, Enums: CoreEnums } = cornerstone
const { ToolGroupManager, Enums: ToolEnums, annotation } = cornerstoneTools

const TOOL_MAP: Record<string, string> = {
  Pan: 'Pan', Zoom: 'Zoom', WindowLevel: 'WindowLevel',
  Length: 'Length', Angle: 'Angle', Ellipse: 'EllipticalROI',
  Rectangle: 'RectangleROI', ArrowAnnotate: 'ArrowAnnotate', Magnify: 'Magnify',
}

export function MainViewport() {
  const containerRef    = useRef<HTMLDivElement>(null)
  const engineRef       = useRef<any>(null)
  const initialised     = useRef(false)
  const loadedSeriesUID = useRef<string | null>(null)
  const suppressWLSync  = useRef(false)

  const { activeSeries, activeSliceIndex, activeTool, viewportState, _resetToken, showAnnotations } = useStore()

  // ── Init once, but only after the container has real pixel dimensions ────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver((entries) => {
      if (initialised.current) return
      const { width, height } = entries[0].contentRect
      if (width === 0 || height === 0) return

      // Container now has size — safe to init Cornerstone
      initialised.current = true
      ro.disconnect()

      const engine = new RenderingEngine(RENDERING_ENGINE_ID)
      engineRef.current = engine
      storeEngine(engine)

      engine.enableElement({
        viewportId: VIEWPORT_ID,
        type: CoreEnums.ViewportType.STACK,
        element: container,
        defaultOptions: { background: [0, 0, 0] as [number, number, number] },
      })

      const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
      toolGroup?.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID)

      listenForNewAnnotations(() => useStore.getState().annotationColor)

      // Load series if already set
      const { activeSeries } = useStore.getState()
      if (activeSeries) {
        const vp = engine.getViewport(VIEWPORT_ID) as any
        if (vp) {
          loadedSeriesUID.current = activeSeries.seriesUID
          vp.setStack(activeSeries.imageIds, 0)
            .then(() => { vp.resetCamera(); vp.render(); syncVOIFromViewport(vp) })
            .catch(console.error)
        }
      }
    })

    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // ── Wheel ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const { activeSeries, activeSliceIndex, setActiveSliceIndex } = useStore.getState()
      if (!activeSeries) return
      const delta = e.deltaY > 0 ? 1 : -1
      const next = Math.max(0, Math.min(activeSeries.imageIds.length - 1, activeSliceIndex + delta))
      if (next !== activeSliceIndex) setActiveSliceIndex(next)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Load series ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeSeries || !engineRef.current) return
    if (loadedSeriesUID.current === activeSeries.seriesUID) return
    loadedSeriesUID.current = activeSeries.seriesUID
    const vp = engineRef.current.getViewport(VIEWPORT_ID) as any
    if (!vp) return
    vp.setStack(activeSeries.imageIds, 0)
      .then(() => { vp.resetCamera(); vp.render(); syncVOIFromViewport(vp) })
      .catch(console.error)
  }, [activeSeries])

  // ── Slice navigation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current || !activeSeries) return
    const vp = engineRef.current.getViewport(VIEWPORT_ID) as any
    if (!vp) return
    const current = vp.getCurrentImageIdIndex?.() ?? 0
    if (current !== activeSliceIndex) { vp.setImageIdIndex(activeSliceIndex); vp.render() }
  }, [activeSliceIndex, activeSeries])

  // ── W/L ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (suppressWLSync.current || !engineRef.current || !activeSeries || viewportState.windowWidth === 0) return
    const vp = engineRef.current.getViewport(VIEWPORT_ID) as any
    if (!vp) return
    try {
      vp.setProperties({ voiRange: { lower: viewportState.windowCenter - viewportState.windowWidth / 2, upper: viewportState.windowCenter + viewportState.windowWidth / 2 } })
      vp.render()
    } catch {}
  }, [viewportState.windowWidth, viewportState.windowCenter])

  // ── Invert ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!engineRef.current || !activeSeries) return
    const vp = engineRef.current.getViewport(VIEWPORT_ID) as any
    if (!vp) return
    try { vp.setProperties({ invert: viewportState.invert }); vp.render() } catch {}
  }, [viewportState.invert])

  // ── Reset ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (_resetToken === 0 || !engineRef.current || !activeSeries) return
    const vp = engineRef.current.getViewport(VIEWPORT_ID) as any
    if (!vp) return
    try {
      vp.resetCamera()
      cornerstone.imageLoader.loadAndCacheImage(activeSeries.imageIds[activeSliceIndex])
        .then((image: any) => {
          const min = image.minPixelValue ?? 0
          const max = image.maxPixelValue ?? 65535
          vp.setProperties({ voiRange: { lower: min, upper: max } })
          vp.render()
          suppressWLSync.current = true
          useStore.getState().setWindowWidth(Math.round(max - min))
          useStore.getState().setWindowCenter(Math.round(min + (max - min) / 2))
          setTimeout(() => { suppressWLSync.current = false }, 100)
        }).catch(() => { vp.render(); syncVOIFromViewport(vp) })
    } catch {}
  }, [_resetToken])

  // ── Tool switching ───────────────────────────────────────────────────────────
  useEffect(() => {
    const toolGroup = ToolGroupManager.getToolGroup(TOOL_GROUP_ID)
    if (!toolGroup) return
    const csName = TOOL_MAP[activeTool] ?? activeTool
    Object.values(TOOL_MAP).forEach(t => { try { toolGroup.setToolPassive(t) } catch {} })
    try {
      toolGroup.setToolActive('Pan',  { bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }] })
      toolGroup.setToolActive('Zoom', { bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }] })
    } catch {}
    try { toolGroup.setToolActive(csName, { bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }] }) } catch {}
  }, [activeTool])

  // ── Annotation visibility ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const allAnnotations = annotation.state.getAllAnnotations()
      allAnnotations.forEach((ann: any) => {
        annotation.visibility.setAnnotationVisibility(ann.annotationUID, showAnnotations)
      })
      const vp = engineRef.current?.getViewport(VIEWPORT_ID) as any
      if (vp) cornerstoneTools.utilities.triggerAnnotationRender(vp.element)
    } catch {}
  }, [showAnnotations])

  function syncVOIFromViewport(vp: any) {
    try {
      const props = vp.getProperties()
      if (!props?.voiRange) return
      suppressWLSync.current = true
      useStore.getState().setWindowWidth(Math.round(props.voiRange.upper - props.voiRange.lower))
      useStore.getState().setWindowCenter(Math.round((props.voiRange.upper + props.voiRange.lower) / 2))
      setTimeout(() => { suppressWLSync.current = false }, 100)
    } catch {}
  }

  return (
    <div className={styles.viewportWrapper}>
      <div ref={containerRef} className={styles.viewport} />
      {activeSeries && <ViewportOverlay />}
    </div>
  )
}
