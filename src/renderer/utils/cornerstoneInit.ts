import * as cornerstone from '@cornerstonejs/core'
import * as cornerstoneTools from '@cornerstonejs/tools'
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader'
import dicomParser from 'dicom-parser'

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

// imageId → [rowSpacing, colSpacing] in mm, populated by registerImageSpacing()
const spacingCache = new Map<string, [number, number]>()

/**
 * Call this after parsing a DICOM file so we know its pixel spacing before
 * Cornerstone tries to measure anything. imageId must match the wadouri: form.
 */
export function registerImageSpacing(imageId: string, rowMm: number, colMm: number) {
  spacingCache.set(imageId, [rowMm, colMm])
}

function registerMetadataProviders() {
  // Our provider at priority 200 — above WADO (100).
  // Returns imagePlaneModule with REAL pixel spacing from spacingCache
  // (populated by dicomLoader from the actual DICOM tag 0028,0030).
  cornerstone.metaData.addProvider((type: string, imageId: string) => {
    if (type !== 'imagePlaneModule') return undefined
    const spacing = spacingCache.get(imageId)
    if (!spacing) return undefined  // not our image, let other providers handle

    return {
      imagePositionPatient:    [0, 0, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      frameOfReferenceUID:     imageId,
      pixelSpacing:            spacing,
      rowPixelSpacing:         spacing[0],
      columnPixelSpacing:      spacing[1],
      rows:    512,
      columns: 512,
    }
  }, 200)

  // Safety net — priority 1, only fires if no other provider returned a result
  cornerstone.metaData.addProvider((type: string, imageId: string) => {
    if (type !== 'imagePlaneModule') return undefined
    return {
      imagePositionPatient:    [0, 0, 0],
      imageOrientationPatient: [1, 0, 0, 0, 1, 0],
      frameOfReferenceUID:     imageId,
      pixelSpacing:            [1, 1],
      rowPixelSpacing:         1,
      columnPixelSpacing:      1,
      rows: 512, columns: 512,
    }
  }, 1)
}

export async function initialiseCornerstonejs() {
  if (initialised) return
  initialised = true

  await cornerstone.init()
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

  // ArrowAnnotate: pass silent text callbacks via addTool configuration
  // so prompt() is never called (it's blocked in Electron)
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

  // Set default annotation colour to green (Cornerstone default is yellow)
  try {
    const GREEN = 'rgb(0, 255, 0)'
    cornerstoneTools.annotation.config.style.setToolGroupToolStyles(TOOL_GROUP_ID, {
      global: {
        color: GREEN,
        colorHighlighted: GREEN,
        colorSelected: GREEN,
        colorLocked: GREEN,
        textBoxColor: GREEN,
        textBoxColorHighlighted: GREEN,
        textBoxColorSelected: GREEN,
        textBoxColorLocked: GREEN,
      },
    })
  } catch {}
}

/**
 * Listen for annotation completion events and apply the current colour
 * using the correct Cornerstone Tools v1 API: setAnnotationStyles(uid, styles).
 */
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
    })
  } catch (e) {
    console.warn('Could not listen for annotation events', e)
  }
}

/** Convert #rrggbb or #rgb to rgb(r,g,b) string that Cornerstone expects */
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
