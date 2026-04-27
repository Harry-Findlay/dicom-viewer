import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToolName =
  | 'Pan'
  | 'Zoom'
  | 'WindowLevel'
  | 'Length'
  | 'Angle'
  | 'Ellipse'
  | 'Rectangle'
  | 'ArrowAnnotate'
  | 'Magnify'

export interface DicomSeries {
  seriesUID: string
  seriesDescription: string
  seriesNumber: number
  modality: string
  imageIds: string[]
  patientName: string
  patientID: string
  studyDate: string
  studyDescription: string
  rows: number
  columns: number
  sliceThickness: number | null
  pixelSpacing: [number, number] | null
}

export interface ViewportState {
  windowWidth: number
  windowCenter: number
  zoom: number
  invert: boolean
  colormap: string
}

interface AppStore {
  // ── Series / slices ──────────────────────────────────────────────────────
  series: DicomSeries[]
  activeSeries: DicomSeries | null
  activeSliceIndex: number
  isLoading: boolean
  loadError: string | null

  // ── Viewport ─────────────────────────────────────────────────────────────
  viewportState: ViewportState

  // ── Tool ─────────────────────────────────────────────────────────────────
  activeTool: ToolName
  showAnnotations: boolean
  annotationColor: string

  // ── UI ───────────────────────────────────────────────────────────────────
  showMetadata: boolean
  showExportDialog: boolean
  sliceStripVisible: boolean
  showAnnotationsPanel: boolean
  _resetToken: number

  // ── Actions ──────────────────────────────────────────────────────────────
  setSeries: (series: DicomSeries[]) => void
  setActiveSeries: (series: DicomSeries | null) => void
  setActiveSliceIndex: (index: number) => void
  setIsLoading: (v: boolean) => void
  setLoadError: (err: string | null) => void

  setWindowWidth: (v: number) => void
  setWindowCenter: (v: number) => void
  setZoom: (v: number) => void
  setInvert: (v: boolean) => void
  setColormap: (v: string) => void
  resetViewport: () => void

  setActiveTool: (tool: ToolName) => void
  setShowAnnotations: (v: boolean) => void
  setAnnotationColor: (color: string) => void

  setShowMetadata: (v: boolean) => void
  setShowExportDialog: (v: boolean) => void
  setSliceStripVisible: (v: boolean) => void
  setShowAnnotationsPanel: (v: boolean) => void
}

const DEFAULT_VIEWPORT: ViewportState = {
  windowWidth: 0,    // 0 = "read from image" sentinel
  windowCenter: 0,
  zoom: 1,
  invert: false,
  colormap: 'Grayscale',
}

export const useStore = create<AppStore>((set) => ({
  series: [],
  activeSeries: null,
  activeSliceIndex: 0,
  isLoading: false,
  loadError: null,

  viewportState: DEFAULT_VIEWPORT,

  activeTool: 'WindowLevel',
  showAnnotations: true,
  annotationColor: '#00ff00',

  showMetadata: true,
  showExportDialog: false,
  sliceStripVisible: true,
  showAnnotationsPanel: false,
  _resetToken: 0,

  setSeries: (series) => set({ series }),
  setActiveSeries: (activeSeries) => set({ activeSeries, activeSliceIndex: 0 }),
  setActiveSliceIndex: (activeSliceIndex) => set({ activeSliceIndex }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setLoadError: (loadError) => set({ loadError }),

  setWindowWidth: (windowWidth) =>
    set((s) => ({ viewportState: { ...s.viewportState, windowWidth } })),
  setWindowCenter: (windowCenter) =>
    set((s) => ({ viewportState: { ...s.viewportState, windowCenter } })),
  setZoom: (zoom) => set((s) => ({ viewportState: { ...s.viewportState, zoom } })),
  setInvert: (invert) => set((s) => ({ viewportState: { ...s.viewportState, invert } })),
  setColormap: (colormap) => set((s) => ({ viewportState: { ...s.viewportState, colormap } })),
  resetViewport: () => set((s) => ({ viewportState: DEFAULT_VIEWPORT, _resetToken: s._resetToken + 1 })),

  setActiveTool: (activeTool) => set({ activeTool }),
  setShowAnnotations: (showAnnotations) => set({ showAnnotations }),
  setAnnotationColor: (annotationColor) => set({ annotationColor }),

  setShowMetadata: (showMetadata) => set({ showMetadata }),
  setShowExportDialog: (showExportDialog) => set({ showExportDialog }),
  setSliceStripVisible: (sliceStripVisible) => set({ sliceStripVisible }),
  setShowAnnotationsPanel: (showAnnotationsPanel) => set({ showAnnotationsPanel }),
}))
