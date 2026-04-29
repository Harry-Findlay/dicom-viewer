import React, { useEffect, useRef, useCallback, useState } from 'react'
import {
  RenderingEngine,
  Enums as csEnums,
  setVolumesForViewports,
  cache,
} from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import { CT_PRESETS, DEFAULT_PRESET_ID, getPreset } from '../utils/ctPresets'
import type { CtPreset } from '../utils/ctPresets'
import styles from '../styles/VolumeViewport.module.css'

const {
  ToolGroupManager,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  TrackballRotateTool,
  StackScrollMouseWheelTool,
  Enums: toolsEnums,
} = cornerstoneTools

const { MouseBindings } = toolsEnums
const { ViewportType, BlendModes } = csEnums

const RENDERING_ENGINE_ID = 'volume-rendering-engine'
const TOOL_GROUP_MPR_ID   = 'volume-mpr-tool-group'
const TOOL_GROUP_3D_ID    = 'volume-3d-tool-group'

const VIEWPORT_IDS = {
  AXIAL:    'volume-axial',
  CORONAL:  'volume-coronal',
  SAGITTAL: 'volume-sagittal',
  VR3D:     'volume-3d',
}

type PaneKey = 'axial' | 'coronal' | 'sagittal' | '3d'

const PANES: { key: PaneKey; label: string }[] = [
  { key: 'axial',    label: 'Axial'    },
  { key: 'coronal',  label: 'Coronal'  },
  { key: 'sagittal', label: 'Sagittal' },
  { key: '3d',       label: '3D'       },
]

interface Props { volumeId: string }

// ---------------------------------------------------------------------------
// Transfer function helpers
// ---------------------------------------------------------------------------

function applyVtkTransferFunction(vrViewport: any, preset: CtPreset, isMip: boolean) {
  try {
    const actors = vrViewport.getActors()
    if (!actors?.length) return
    const volumeActor = actors[0]?.actor
    if (!volumeActor) return
    const property = volumeActor.getProperty?.()
    if (!property) return

    if (isMip) {
      vrViewport.setBlendMode(BlendModes.MAXIMUM_INTENSITY_BLEND)
      vrViewport.render()
      return
    }

    vrViewport.setBlendMode(BlendModes.COMPOSITE)

    // Opacity transfer function
    const ofn = property.getScalarOpacity(0)
    ofn.removeAllPoints()
    preset.transferFunction.forEach(([hu,,,, opacity]) => ofn.addPoint(hu, opacity))
    property.setScalarOpacity(0, ofn)

    // Colour transfer function
    const cfn = property.getRGBTransferFunction(0)
    cfn.removeAllPoints()
    preset.transferFunction.forEach(([hu, r, g, b]) => cfn.addRGBPoint(hu, r, g, b))
    property.setRGBTransferFunction(0, cfn)

    // Scalar opacity unit distance — controls how quickly opacity accumulates
    // with depth. Larger value = each voxel contributes less opacity = less
    // surface noise on thin/grainy structures.
    const unitDist = preset.scalarOpacityUnitDistance ?? 2.0
    property.setScalarOpacityUnitDistance(0, unitDist)

    property.setInterpolationTypeToLinear()
    property.setShade(true)
    property.setAmbient(0.15)
    property.setDiffuse(0.85)
    property.setSpecular(0.15)
    property.setSpecularPower(8)

    vrViewport.render()
  } catch (e) {
    console.warn('[VolumeViewport] VTK transfer function error:', e)
  }
}

function applyMprVOI(engine: any, volumeId: string) {
  try {
    const vol = cache.getVolume(volumeId) as any
    let lower = -1000, upper = 3000
    const scalars = vol?.vtkImageData?.getPointData?.()?.getScalars?.()
    if (scalars) {
      const r = scalars.getRange()
      lower = r[0]; upper = r[1]
    }
    for (const vpId of [VIEWPORT_IDS.AXIAL, VIEWPORT_IDS.CORONAL, VIEWPORT_IDS.SAGITTAL]) {
      const vp = engine.getViewport(vpId) as any
      if (!vp) continue
      try { vp.setProperties({ voiRange: { lower, upper } }); vp.render() } catch {}
    }
  } catch (e) {
    console.warn('[VolumeViewport] MPR VOI error:', e)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VolumeViewport({ volumeId }: Props) {
  const axialRef    = useRef<HTMLDivElement>(null)
  const coronalRef  = useRef<HTMLDivElement>(null)
  const sagittalRef = useRef<HTMLDivElement>(null)
  const vrRef       = useRef<HTMLDivElement>(null)
  const engineRef   = useRef<any>(null)
  const activePresetRef = useRef<string>(DEFAULT_PRESET_ID)

  const [activePreset, setActivePreset] = useState<string>(DEFAULT_PRESET_ID)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [visiblePanes, setVisiblePanes] = useState<Record<PaneKey, boolean>>({
    axial: true, coronal: true, sagittal: true, '3d': true,
  })
  const prev3dVisible = useRef<boolean>(true)

  // ---------------------------------------------------------------------------
  // Preset
  // ---------------------------------------------------------------------------
  const applyPreset = useCallback((presetId: string, eng?: any) => {
    const engine = eng ?? engineRef.current
    if (!engine) return
    const preset = getPreset(presetId)
    const isMip  = presetId === 'mip'
    applyMprVOI(engine, volumeId)
    const vrViewport = engine.getViewport(VIEWPORT_IDS.VR3D) as any
    if (vrViewport) applyVtkTransferFunction(vrViewport, preset, isMip)
    activePresetRef.current = presetId
    setActivePreset(presetId)
  }, [volumeId])

  // ---------------------------------------------------------------------------
  // Pane toggles — re-render 3D when it becomes visible again
  // ---------------------------------------------------------------------------
  const togglePane = useCallback((key: PaneKey) => {
    setVisiblePanes(prev => {
      const next = { ...prev, [key]: !prev[key] }
      if (!Object.values(next).some(Boolean)) return prev
      return next
    })
  }, [])

  useEffect(() => {
    const is3dNowVisible = visiblePanes['3d']
    const was3dVisible   = prev3dVisible.current
    prev3dVisible.current = is3dNowVisible

    if (is3dNowVisible && !was3dVisible) {
      // Re-attach and re-render the 3D viewport after DOM is visible again
      const t = setTimeout(() => {
        try {
          engineRef.current?.resize(true, true)
          applyPreset(activePresetRef.current)
        } catch {}
      }, 80)
      return () => clearTimeout(t)
    }

    const t = setTimeout(() => {
      try { engineRef.current?.resize(true, true) } catch {}
    }, 60)
    return () => clearTimeout(t)
  }, [visiblePanes, applyPreset])

  // ---------------------------------------------------------------------------
  // Engine setup
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    async function setup() {
      try {
        setLoading(true); setError(null)

        try { (window as any).__volumeEngine?.destroy() } catch {}
        try { ToolGroupManager.destroyToolGroup(TOOL_GROUP_MPR_ID) } catch {}
        try { ToolGroupManager.destroyToolGroup(TOOL_GROUP_3D_ID)  } catch {}
        engineRef.current = null

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
        if (cancelled) return

        for (const [name, ref] of [
          ['axial', axialRef], ['coronal', coronalRef],
          ['sagittal', sagittalRef], ['3d', vrRef],
        ] as const) {
          const el = (ref as React.RefObject<HTMLDivElement>).current
          if (!el) throw new Error(`${name} ref not mounted`)
          const { width, height } = el.getBoundingClientRect()
          if (width === 0 || height === 0)
            throw new Error(`${name} viewport has zero size`)
        }

        const engine = new (RenderingEngine as any)(RENDERING_ENGINE_ID)
        engineRef.current = engine
        ;(window as any).__volumeEngine = engine

        engine.setViewports([
          { viewportId: VIEWPORT_IDS.AXIAL,    type: ViewportType.ORTHOGRAPHIC, element: axialRef.current!,    defaultOptions: { orientation: csEnums.OrientationAxis.AXIAL,    background: [0,0,0] as [number,number,number] } },
          { viewportId: VIEWPORT_IDS.CORONAL,  type: ViewportType.ORTHOGRAPHIC, element: coronalRef.current!,  defaultOptions: { orientation: csEnums.OrientationAxis.CORONAL,  background: [0,0,0] as [number,number,number] } },
          { viewportId: VIEWPORT_IDS.SAGITTAL, type: ViewportType.ORTHOGRAPHIC, element: sagittalRef.current!, defaultOptions: { orientation: csEnums.OrientationAxis.SAGITTAL, background: [0,0,0] as [number,number,number] } },
          { viewportId: VIEWPORT_IDS.VR3D,     type: ViewportType.VOLUME_3D,    element: vrRef.current!,       defaultOptions: { background: [0.04, 0.04, 0.04] as [number,number,number] } },
        ])

        await setVolumesForViewports(engine, [{ volumeId }],
          [VIEWPORT_IDS.AXIAL, VIEWPORT_IDS.CORONAL, VIEWPORT_IDS.SAGITTAL, VIEWPORT_IDS.VR3D])

        if (cancelled) return

        const safeAdd = (tool: any) => { try { cornerstoneTools.addTool(tool) } catch {} }
        safeAdd(WindowLevelTool); safeAdd(PanTool); safeAdd(ZoomTool)
        safeAdd(StackScrollMouseWheelTool); safeAdd(TrackballRotateTool)

        const mprGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_MPR_ID)!
        mprGroup.addTool(WindowLevelTool.toolName)
        mprGroup.addTool(PanTool.toolName)
        mprGroup.addTool(ZoomTool.toolName)
        mprGroup.addTool(StackScrollMouseWheelTool.toolName)
        mprGroup.setToolActive(WindowLevelTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] })
        mprGroup.setToolActive(PanTool.toolName,         { bindings: [{ mouseButton: MouseBindings.Auxiliary }] })
        mprGroup.setToolActive(ZoomTool.toolName,        { bindings: [{ mouseButton: MouseBindings.Secondary }] })
        mprGroup.setToolActive(StackScrollMouseWheelTool.toolName)
        mprGroup.addViewport(VIEWPORT_IDS.AXIAL,    RENDERING_ENGINE_ID)
        mprGroup.addViewport(VIEWPORT_IDS.CORONAL,  RENDERING_ENGINE_ID)
        mprGroup.addViewport(VIEWPORT_IDS.SAGITTAL, RENDERING_ENGINE_ID)

        const vrGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_3D_ID)!
        vrGroup.addTool(TrackballRotateTool.toolName)
        vrGroup.addTool(ZoomTool.toolName)
        vrGroup.setToolActive(TrackballRotateTool.toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] })
        vrGroup.setToolActive(ZoomTool.toolName,            { bindings: [{ mouseButton: MouseBindings.Secondary }] })
        vrGroup.addViewport(VIEWPORT_IDS.VR3D, RENDERING_ENGINE_ID)

        engine.renderViewports([VIEWPORT_IDS.AXIAL, VIEWPORT_IDS.CORONAL, VIEWPORT_IDS.SAGITTAL, VIEWPORT_IDS.VR3D])
        setLoading(false)

        setTimeout(() => {
          if (!cancelled) applyPreset(DEFAULT_PRESET_ID, engine)
        }, 300)

      } catch (err: any) {
        if (!cancelled) {
          console.error('[VolumeViewport] setup error:', err)
          setError(err?.message ?? 'Volume rendering failed')
          setLoading(false)
        }
      }
    }

    setup()

    return () => {
      cancelled = true
      try { engineRef.current?.destroy() } catch {}
      engineRef.current = null
      try { ToolGroupManager.destroyToolGroup(TOOL_GROUP_MPR_ID) } catch {}
      try { ToolGroupManager.destroyToolGroup(TOOL_GROUP_3D_ID)  } catch {}
    }
  }, [volumeId, applyPreset])

  useEffect(() => {
    const handler = () => { try { engineRef.current?.resize(true, true) } catch {} }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const refMap: Record<PaneKey, React.RefObject<HTMLDivElement>> = {
    axial: axialRef, coronal: coronalRef, sagittal: sagittalRef, '3d': vrRef,
  }

  const visibleCount = Object.values(visiblePanes).filter(Boolean).length
  const gridStyle: React.CSSProperties =
    visibleCount === 1 ? { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' } :
    visibleCount === 2 ? { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' } :
                         { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <span className={styles.title}>3D — MPR</span>

        <div className={styles.paneToggles}>
          <span className={styles.toggleLabel}>Panes</span>
          {PANES.map(pane => (
            <button
              key={pane.key}
              type="button"
              className={`${styles.paneToggleBtn} ${visiblePanes[pane.key] ? styles.paneToggleActive : ''}`}
              onClick={() => togglePane(pane.key)}
            >
              {pane.label}
            </button>
          ))}
        </div>

        <div className={styles.divider} />

        <div className={styles.presets}>
          {CT_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              className={`${styles.presetBtn} ${activePreset === preset.id ? styles.presetActive : ''}`}
              onClick={() => applyPreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.grid} style={gridStyle}>
        {PANES.map(pane => (
          <div
            key={pane.key}
            className={styles.cell}
            style={{ display: visiblePanes[pane.key] ? 'flex' : 'none' }}
          >
            <div className={styles.cellLabel}>{pane.label}</div>
            <div ref={refMap[pane.key]} className={styles.viewport} />
          </div>
        ))}
      </div>

      {loading && (
        <div className={styles.overlay}>
          <div className={styles.spinner} />
          <p>Building volume…</p>
        </div>
      )}
      {error && (
        <div className={styles.overlay}>
          <p className={styles.errorText}>⚠ {error}</p>
        </div>
      )}
    </div>
  )
}
