import dicomParser from 'dicom-parser'
import type { DicomSeries } from '../store/appStore'
import { registerImageSpacing } from './cornerstoneInit'

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

/** Convert a Windows or Unix filesystem path to a wadouri imageId */
function pathToImageId(filePath: string): string {
  const normalised = filePath.replace(/\\/g, '/')
  const fileUrl = normalised.startsWith('/')
    ? `file://${normalised}`
    : `file:///${normalised}`
  return `wadouri:${fileUrl}`
}

/** Convert Electron IPC buffer (plain object) to ArrayBuffer */
function ipcBufferToArrayBuffer(buf: any): ArrayBuffer {
  // Electron sends Buffer as a plain {0:n, 1:n, ...} object across contextBridge
  if (buf instanceof ArrayBuffer) return buf
  if (buf?.buffer instanceof ArrayBuffer) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }
  // Plain object fallback
  const len = Object.keys(buf).length
  const arr = new Uint8Array(len)
  for (let i = 0; i < len; i++) arr[i] = buf[i]
  return arr.buffer
}

export function parseDicomMeta(buffer: ArrayBuffer): DicomMeta | null {
  try {
    const byteArray = new Uint8Array(buffer)
    // Parse only up to pixel data tag for speed
    const ds = dicomParser.parseDicom(byteArray, { untilTag: '7FE00010' })

    const seriesUID = safeStr(ds, 'x0020000e')
    if (!seriesUID) return null

    const pixelSpacingStr = safeStr(ds, 'x00280030')
    let pixelSpacing: [number, number] | null = null
    if (pixelSpacingStr) {
      const parts = pixelSpacingStr.split('\\').map(Number)
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
        pixelSpacing = [parts[0], parts[1]]
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
      sliceThickness: safeNum(ds, 'x00180050'),
      pixelSpacing,
      sliceLocation: safeNum(ds, 'x00201041'),
    }
  } catch {
    return null
  }
}

/** Run tasks with a concurrency cap */
async function pLimit<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      results[i] = await tasks[i]()
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  await Promise.all(workers)
  return results
}

export async function buildSeriesFromFiles(filePaths: string[]): Promise<DicomSeries[]> {
  const seriesMap = new Map<string, { meta: DicomMeta; filePath: string }[]>()

  // Parse metadata in parallel — 8 concurrent reads is fast without overwhelming disk
  const tasks = filePaths.map((filePath) => async () => {
    try {
      const raw = await window.electron.readFile(filePath)
      const ab = ipcBufferToArrayBuffer(raw)
      const meta = parseDicomMeta(ab)
      if (!meta) return
      const uid = meta.seriesUID
      if (!seriesMap.has(uid)) seriesMap.set(uid, [])
      seriesMap.get(uid)!.push({ meta, filePath })
    } catch {
      // skip unreadable / non-DICOM files silently
    }
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
    const imageIds = entries.map((e) => pathToImageId(e.filePath))

    // Register pixel spacing into the Cornerstone metadata cache NOW, before
    // any image loads. This ensures the Length tool gets correct mm values.
    if (first.pixelSpacing) {
      const [rowMm, colMm] = first.pixelSpacing
      imageIds.forEach(id => registerImageSpacing(id, rowMm, colMm))
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
