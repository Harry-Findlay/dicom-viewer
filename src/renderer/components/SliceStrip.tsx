import React, { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/appStore'
import styles from '../styles/SliceStrip.module.css'

const THUMB_W = 80
const THUMB_H = 80

export function SliceStrip() {
  const { activeSeries, activeSliceIndex, setActiveSliceIndex } = useStore()
  // Track which series we last rendered thumbnails for so we clear on switch
  const renderedSeriesRef = useRef<string | null>(null)
  const canvasMap = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const stripRef = useRef<HTMLDivElement>(null)

  // Clear canvas map when series changes
  useEffect(() => {
    if (!activeSeries) return
    if (renderedSeriesRef.current !== activeSeries.seriesUID) {
      renderedSeriesRef.current = activeSeries.seriesUID
      canvasMap.current.clear()
    }
  }, [activeSeries])

  // Scroll active thumb into view
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-idx="${activeSliceIndex}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [activeSliceIndex])

  const renderThumb = useCallback(async (canvas: HTMLCanvasElement, idx: number, seriesUID: string) => {
    if (!activeSeries || activeSeries.seriesUID !== seriesUID) return
    const imageId = activeSeries.imageIds[idx]
    if (!imageId) return

    try {
      const { imageLoader } = await import('@cornerstonejs/core')
      const image = await imageLoader.loadAndCacheImage(imageId)
      // Abort if series changed while loading
      if (!activeSeries || activeSeries.seriesUID !== seriesUID) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width = THUMB_W
      canvas.height = THUMB_H

      const pixelData = image.getPixelData()
      const rows = image.rows
      const cols = image.columns
      const min = image.minPixelValue ?? 0
      const max = image.maxPixelValue ?? 4096
      const range = max - min || 1

      const imgData = ctx.createImageData(THUMB_W, THUMB_H)
      for (let ty = 0; ty < THUMB_H; ty++) {
        for (let tx = 0; tx < THUMB_W; tx++) {
          const srcX = Math.floor((tx / THUMB_W) * cols)
          const srcY = Math.floor((ty / THUMB_H) * rows)
          const val = pixelData[srcY * cols + srcX] ?? 0
          const norm = Math.max(0, Math.min(255, Math.round(((val - min) / range) * 255)))
          const i = (ty * THUMB_W + tx) * 4
          imgData.data[i] = norm
          imgData.data[i + 1] = norm
          imgData.data[i + 2] = norm
          imgData.data[i + 3] = 255
        }
      }
      ctx.putImageData(imgData, 0, 0)
    } catch {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#1a1a22'
        ctx.fillRect(0, 0, THUMB_W, THUMB_H)
        ctx.fillStyle = '#555'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${idx + 1}`, THUMB_W / 2, THUMB_H / 2 + 4)
      }
    }
  }, [activeSeries])

  if (!activeSeries) return null

  return (
    <div className={styles.strip}>
      <div className={styles.label}>
        Slices — {activeSeries.seriesDescription || activeSeries.patientName}
      </div>
      <div className={styles.inner} ref={stripRef}>
        {activeSeries.imageIds.map((_, idx) => (
          <button
            key={`${activeSeries.seriesUID}-${idx}`}
            data-idx={idx}
            className={`${styles.thumb} ${idx === activeSliceIndex ? styles.active : ''}`}
            onClick={() => setActiveSliceIndex(idx)}
            title={`Slice ${idx + 1} of ${activeSeries.imageIds.length}`}
          >
            <canvas
              width={THUMB_W}
              height={THUMB_H}
              ref={(el) => {
                if (!el) return
                canvasMap.current.set(idx, el)
                // Use IntersectionObserver so we only render what's visible
                const observer = new IntersectionObserver(
                  (entries) => {
                    if (entries[0]?.isIntersecting) {
                      renderThumb(el, idx, activeSeries.seriesUID)
                      observer.disconnect()
                    }
                  },
                  { threshold: 0.1, root: stripRef.current }
                )
                observer.observe(el)
              }}
            />
            <span className={styles.sliceNum}>{idx + 1}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
