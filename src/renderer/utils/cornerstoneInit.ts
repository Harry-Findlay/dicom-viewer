import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'
import { cornerstoneStreamingImageVolumeLoader } from '@cornerstonejs/streaming-image-volume-loader'

const {
  ToolGroupManager, addTool, Enums: ToolEnums,
  PanTool, ZoomTool, WindowLevelTool,
  LengthTool, AngleTool,
  EllipticalROITool, RectangleROITool,
  ArrowAnnotateTool, MagnifyTool,
} = cornerstoneTools

export const RENDERING_ENGINE_ID = 'dicom-viewer-engine'
export const VIEWPORT_ID = 'main-viewport'
export const TOOL_GROUP_ID = 'main-tool-group'

let _engine: cornerstone.RenderingEngine | null = null
export const getEngine = () => _engine
export const storeEngine = (e: cornerstone.RenderingEngine) => { _engine = e }

let initialised = false

// Per-image spacing AND position cache
interface ImagePlane {
  rowMm: number
  colMm: number
  // imagePositionPatient as [x,y,z]
  position: [number, number, number]
  // imageOrientationPatient as 6 numbers
  orientation: [number,number,number,number,number,number]
  rows: number
  columns: number
  sliceThickness: number
}

const planeCache = new Map<string, ImagePlane>()

export function registerImageSpacing(imageId: string, rowMm: number, colMm: number) {
  const existing = planeCache.get(imageId)
  if (existing) {
    existing.rowMm = rowMm
    existing.colMm = colMm
  } else {
    planeCache.set(imageId, {
      rowMm, colMm,
      position: [0, 0, 0],
      orientation: [1,0,0,0,1,0],
      rows: 512, columns: 512,
      sliceThickness: 1,
    })
  }
}

/**
 * Register full plane metadata for a slice — called by dicomLoader for
 * multi-frame CBCT so the volume loader gets correct geometry.
 */
export function registerImagePlane(
  imageId: string,
  rowMm: number,
  colMm: number,
  position: [number,number,number],
  orientation: [number,number,number,number,number,number],
  rows: number,
  columns: number,
  sliceThickness: number,
) {
  planeCache.set(imageId, { rowMm, colMm, position, orientation, rows, columns, sliceThickness })
}

function registerMetadataProviders() {
  cornerstone.metaData.addProvider((type: string, imageId: string) => {
    if (type !== 'imagePlaneModule') return undefined
    const p = planeCache.get(imageId)
    if (!p) return undefined
    return {
      imagePositionPatient:    p.position,
      imageOrientationPatient: p.orientation,
      frameOfReferenceUID:     'FRAME_OF_REF',
      pixelSpacing:            [p.rowMm, p.colMm],
      rowPixelSpacing:         p.rowMm,
      columnPixelSpacing:      p.colMm,
      rows:                    p.rows,
      columns:                 p.columns,
      sliceThickness:          p.sliceThickness,
    }
  }, 200)

  // Fallback
  cornerstone.metaData.addProvider((type: string, imageId: string) => {
    if (type !== 'imagePlaneModule') return undefined
    return {
      imagePositionPatient:    [0, 0, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      frameOfReferenceUID:     'FRAME_OF_REF',
      pixelSpacing:            [1, 1],
      rowPixelSpacing:         1,
      columnPixelSpacing:      1,
      rows: 512, columns: 512,
      sliceThickness: 1,
    }
  }, 1)
}

export async function initialiseCornerstonejs() {
  if (initialised) return
  initialised = true

  await cornerstone.init()

  cornerstone.volumeLoader.registerVolumeLoader(
    'cornerstoneStreamingImageVolume',
    cornerstoneStreamingImageVolumeLoader,
  )

  registerMetadataProviders()

  cornerstoneDICOMImageLoader.external.cornerstone = cornerstone
  cornerstoneDICOMImageLoader.external.dicomParser = dicomParser
  cornerstoneDICOMImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: { convertFloatPixelDataToInt: false, use16BitDataType: true },
  })

  const maxWebWorkers = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2))
  cornerstoneDICOMImageLoader.webWorkerManager.initialize({
    maxWebWorkers,
    startWebWorkersOnDemand: true,
    taskConfiguration: {
      decodeTask: { loadCodecsOnStartup: true, initializeCodecsOnStartup: false },
    },
  })

  await cornerstoneTools.init()

  addTool(PanTool); addTool(ZoomTool); addTool(WindowLevelTool)
  addTool(LengthTool); addTool(AngleTool)
  addTool(EllipticalROITool); addTool(RectangleROITool)
  addTool(MagnifyTool)

  addTool(ArrowAnnotateTool, {
    getTextCallback: (cb: (text: string) => void) => cb(''),
    changeTextCallback: (_data: any, _evt: any, cb: (text: string) => void) => cb(''),
  })

  const toolGroup = ToolGroupManager.createToolGroup(TOOL_GROUP_ID)!
  ;[
    PanTool.toolName, ZoomTool.toolName, WindowLevelTool.toolName,
    LengthTool.toolName, AngleTool.toolName,
    EllipticalROITool.toolName, RectangleROITool.toolName,
    ArrowAnnotateTool.toolName, MagnifyTool.toolName,
  ].forEach(t => toolGroup.addTool(t))

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Primary }],
  })
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Auxiliary }],
  })
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: ToolEnums.MouseBindings.Secondary }],
  })

  try {
    const GREEN = 'rgb(0, 255, 0)'
    cornerstoneTools.annotation.config.style.setToolGroupToolStyles(TOOL_GROUP_ID, {
      global: {
        color: GREEN, colorHighlighted: GREEN, colorSelected: GREEN, colorLocked: GREEN,
        textBoxColor: GREEN, textBoxColorHighlighted: GREEN, textBoxColorSelected: GREEN, textBoxColorLocked: GREEN,
      },
    })
  } catch {}
}

export function listenForNewAnnotations(getCurrentColor: () => string) {
  try {
    const eventName = cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED
    document.addEventListener(eventName as any, (evt: any) => {
      try {
        const ann = evt.detail?.annotation
        if (!ann?.annotationUID) return
        const hex = getCurrentColor()
        const rgb = hexToRgb(hex)
        cornerstoneTools.annotation.config.style.setAnnotationStyles(ann.annotationUID, {
          color: rgb, colorHighlighted: rgb, colorSelected: rgb, colorLocked: rgb,
          textBoxColor: rgb, textBoxColorHighlighted: rgb, textBoxColorSelected: rgb, textBoxColorLocked: rgb,
        })
      } catch {}
    })
  } catch (e) {
    console.warn('Could not listen for annotation events', e)
  }
}

export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    const r = parseInt(h[0]+h[0], 16)
    const g = parseInt(h[1]+h[1], 16)
    const b = parseInt(h[2]+h[2], 16)
    return `rgb(${r},${g},${b})`
  }
  const r = parseInt(h.slice(0,2), 16)
  const g = parseInt(h.slice(2,4), 16)
  const b = parseInt(h.slice(4,6), 16)
  return `rgb(${r},${g},${b})`
}
