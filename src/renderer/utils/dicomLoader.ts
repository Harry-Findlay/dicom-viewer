import dicomParser from 'dicom-parser'
import type { DicomSeries } from '../store/appStore'
import { registerImageSpacing, registerImagePlane } from './cornerstoneInit'

export interface DicomMeta {
  seriesUID: string
  seriesDescription: string
  seriesNumber: number
  modality: string
  patientName: string
  patientID: string
  studyDate: string
  studyDescription: string
  studyUID: string
  instanceNumber: number
  rows: number
  columns: number
  sliceThickness: number | null
  pixelSpacing: [number, number] | null
  sliceLocation: number | null
  numberOfFrames: number
  // Multi-frame geometry
  imagePositionPatient: [number,number,number] | null
  imageOrientationPatient: [number,number,number,number,number,number] | null
  // Per-frame positions for multi-frame DICOM
  framePositions: Array<[number,number,number]> | null
}

function safeStr(ds: dicomParser.DataSet, tag: string): string {
  try { return (ds.string(tag) ?? '').trim() } catch { return '' }
}

function safeNum(ds: dicomParser.DataSet, tag: string): number | null {
  try { const v = ds.floatString(tag); return v ?? null } catch { return null }
}

function formatDate(raw: string): string {
  if (!raw || raw.length < 8) return raw || ''
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function parseVec3(s: string): [number,number,number] | null {
  const parts = s.split('\\').map(Number)
  if (parts.length < 3 || parts.some(isNaN)) return null
  return [parts[0], parts[1], parts[2]]
}

function parseVec6(s: string): [number,number,number,number,number,number] | null {
  const parts = s.split('\\').map(Number)
  if (parts.length < 6 || parts.some(isNaN)) return null
  return [parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]]
}

function pathToImageId(filePath: string, frame?: number): string {
  const normalised = filePath.replace(/\\/g, '/')
  const fileUrl = normalised.startsWith('/')
    ? `file://${normalised}`
    : `file:///${normalised}`
  const base = `wadouri:${fileUrl}`
  return frame !== undefined ? `${base}?frame=${frame}` : base
}

function ipcBufferToArrayBuffer(buf: any): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf
  if (buf?.buffer instanceof ArrayBuffer) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }
  const len = Object.keys(buf).length
  const arr = new Uint8Array(len)
  for (let i = 0; i < len; i++) arr[i] = buf[i]
  return arr.buffer
}

export function parseDicomMeta(buffer: ArrayBuffer): DicomMeta | null {
  try {
    const byteArray = new Uint8Array(buffer)
    const ds = dicomParser.parseDicom(byteArray, { untilTag: '7FE00010' })

    const seriesUID = safeStr(ds, 'x0020000e')
    if (!seriesUID) return null

    const pixelSpacingStr = safeStr(ds, 'x00280030') || safeStr(ds, 'x00181164')
    let pixelSpacing: [number, number] | null = null
    if (pixelSpacingStr) {
      const parts = pixelSpacingStr.split('\\').map(Number)
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
        pixelSpacing = [parts[0], parts[1]]
    }

    const numberOfFrames = parseInt(safeStr(ds, 'x00280008') || '1', 10) || 1

    let sliceThickness = safeNum(ds, 'x00180050') || safeNum(ds, 'x00180088')

    const ippStr = safeStr(ds, 'x00200032')
    const imagePositionPatient = ippStr ? parseVec3(ippStr) : null

    const iopStr = safeStr(ds, 'x00200037')
    const imageOrientationPatient = iopStr ? parseVec6(iopStr) : null

    // For multi-frame: try to extract per-frame positions from
    // PerFrameFunctionalGroupsSequence (5200,9230) > PlanePositionSequence > ImagePositionPatient
    let framePositions: Array<[number,number,number]> | null = null
    if (numberOfFrames > 1) {
      try {
        const perFrameSeq = ds.elements['x52009230']
        if (perFrameSeq?.items?.length) {
          const positions: Array<[number,number,number]> = []
          for (const item of perFrameSeq.items) {
            const planePosSeq = item.dataSet?.elements['x00209113']
            if (planePosSeq?.items?.[0]) {
              const ipp = planePosSeq.items[0].dataSet?.string('x00200032')
              const pos = ipp ? parseVec3(ipp) : null
              positions.push(pos ?? [0, 0, positions.length * (sliceThickness ?? 1)])
            } else {
              positions.push([0, 0, positions.length * (sliceThickness ?? 1)])
            }
          }
          if (positions.length === numberOfFrames) framePositions = positions
        }
      } catch {}

      // Fallback: if no per-frame sequence, synthesise z positions from slice thickness
      if (!framePositions && sliceThickness) {
        framePositions = Array.from({ length: numberOfFrames }, (_, i) =>
          [0, 0, i * sliceThickness!] as [number,number,number]
        )
      }
    }

    return {
      seriesUID,
      seriesDescription: safeStr(ds, 'x0008103e') || `Series ${safeStr(ds, 'x00200011')}` || 'Unknown',
      seriesNumber: parseInt(safeStr(ds, 'x00200011') || '0', 10),
      modality: safeStr(ds, 'x00080060') || 'OT',
      patientName: safeStr(ds, 'x00100010').replace(/\^/g, ' ').trim(),
      patientID: safeStr(ds, 'x00100020'),
      studyDate: formatDate(safeStr(ds, 'x00080020')),
      studyDescription: safeStr(ds, 'x00081030'),
      studyUID: safeStr(ds, 'x0020000d'),
      instanceNumber: parseInt(safeStr(ds, 'x00200013') || '1', 10),
      rows: ds.uint16('x00280010') ?? 0,
      columns: ds.uint16('x00280011') ?? 0,
      sliceThickness,
      pixelSpacing,
      sliceLocation: safeNum(ds, 'x00201041'),
      numberOfFrames,
      imagePositionPatient,
      imageOrientationPatient,
      framePositions,
    }
  } catch {
    return null
  }
}

async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

export async function buildSeriesFromFiles(filePaths: string[]): Promise<DicomSeries[]> {
  const seriesMap = new Map<string, { meta: DicomMeta; filePath: string }[]>()

  const tasks = filePaths.map((filePath) => async () => {
    try {
      const raw = await window.electron.readFile(filePath)
      const ab = ipcBufferToArrayBuffer(raw)
      const meta = parseDicomMeta(ab)
      if (!meta) return
      const uid = meta.seriesUID
      if (!seriesMap.has(uid)) seriesMap.set(uid, [])
      seriesMap.get(uid)!.push({ meta, filePath })
    } catch {}
  })

  await pLimit(tasks, 8)

  const result: DicomSeries[] = []

  for (const [seriesUID, entries] of seriesMap) {
    entries.sort((a, b) => {
      const di = a.meta.instanceNumber - b.meta.instanceNumber
      if (di !== 0) return di
      if (a.meta.sliceLocation !== null && b.meta.sliceLocation !== null)
        return a.meta.sliceLocation - b.meta.sliceLocation
      return 0
    })

    const first = entries[0].meta
    let imageIds: string[]

    // Default orientation (axial)
    const orientation: [number,number,number,number,number,number] =
      first.imageOrientationPatient ?? [1,0,0,0,1,0]

    if (first.numberOfFrames > 1) {
      // Multi-frame CBCT — one file, N frames
      const filePath = entries[0].filePath
      const thickness = first.sliceThickness ?? 1
      const spacing = first.pixelSpacing ?? [1, 1]

      imageIds = Array.from({ length: first.numberOfFrames }, (_, i) =>
        pathToImageId(filePath, i)
      )

      // Register per-frame plane metadata so the volume loader
      // gets correct geometry for each slice
      imageIds.forEach((id, i) => {
        const pos: [number,number,number] = first.framePositions?.[i] ?? [0, 0, i * thickness]
        registerImagePlane(
          id,
          spacing[0], spacing[1],
          pos,
          orientation,
          first.rows, first.columns,
          thickness,
        )
      })

      console.info(`[dicomLoader] Multi-frame CBCT: ${first.numberOfFrames} frames in ${filePath}`)
    } else {
      // Classic series — one file per slice
      imageIds = entries.map((e) => pathToImageId(e.filePath))

      if (first.pixelSpacing) {
        const [rowMm, colMm] = first.pixelSpacing
        entries.forEach((e, i) => {
          const id = imageIds[i]
          const pos: [number,number,number] = e.meta.imagePositionPatient ?? [0, 0, i * (first.sliceThickness ?? 1)]
          registerImagePlane(
            id, rowMm, colMm, pos, orientation,
            e.meta.rows, e.meta.columns, first.sliceThickness ?? 1,
          )
        })
      }
    }

    result.push({
      seriesUID,
      seriesDescription: first.seriesDescription,
      seriesNumber: first.seriesNumber,
      modality: first.modality,
      imageIds,
      patientName: first.patientName,
      patientID: first.patientID,
      studyDate: first.studyDate,
      studyDescription: first.studyDescription,
      rows: first.rows,
      columns: first.columns,
      sliceThickness: first.sliceThickness,
      pixelSpacing: first.pixelSpacing,
    })
  }

  return result.sort((a, b) => a.seriesNumber - b.seriesNumber)
}

export async function buildSeriesFromDicomdir(dicomdirPath: string): Promise<DicomSeries[]> {
  const sep = dicomdirPath.includes('\\') ? '\\' : '/'
  const dir = dicomdirPath.substring(0, dicomdirPath.lastIndexOf(sep))

  try {
    const raw = await window.electron.readFile(dicomdirPath)
    const ab = ipcBufferToArrayBuffer(raw)
    const ds = dicomParser.parseDicom(new Uint8Array(ab))

    const filePaths: string[] = []
    const seq = ds.elements['x00041220']

    if (seq?.items) {
      for (const item of seq.items) {
        const recordType = item.dataSet?.string('x00041430')
        if (recordType === 'IMAGE') {
          const refFileId = item.dataSet?.string('x00041500')
          if (refFileId) {
            const relative = refFileId.replace(/[\\/]/g, sep)
            filePaths.push(`${dir}${sep}${relative}`)
          }
        }
      }
    }

    if (filePaths.length > 0) return buildSeriesFromFiles(filePaths)
  } catch (err) {
    console.warn('DICOMDIR parse failed, falling back to folder scan:', err)
  }

  const allFiles = await window.electron.listDicomFiles(dir)
  return buildSeriesFromFiles(allFiles)
}
