/**
 * probe-station — LA Waveform Viewer
 * Canvas-based digital waveform renderer with zoom/pan/cursors.
 */

import { useRef, useEffect, useCallback, useState } from 'react'

export interface WaveformChannel {
  label: string
  data: Uint8Array  // 1 byte per sample, 0 or 1
  color: string
}

interface Props {
  channels: WaveformChannel[]
  sampleRateKHz: number
  triggerSample?: number  // sample index where trigger fired
  width?: number
  height?: number
}

const CHANNEL_HEIGHT = 40
const CHANNEL_GAP = 2
const LABEL_WIDTH = 32
const GRID_COLOR = 'rgba(128,128,128,0.15)'
const CURSOR_COLOR = '#ff6b9d'
const TRIGGER_COLOR = '#ff4444'

export default function WaveformViewer({
  channels,
  sampleRateKHz,
  triggerSample,
  width = 800,
  height = 300,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(1)
  const [scrollX, setScrollX] = useState(0)
  const [cursorA, setCursorA] = useState<number | null>(null)
  const [cursorB, setCursorB] = useState<number | null>(null)
  const [dragging, setDragging] = useState<'pan' | 'cursorA' | 'cursorB' | null>(null)
  const dragRef = useRef({ startX: 0, startScroll: 0 })

  const sampleCount = channels.length > 0 ? channels[0].data.length : 0
  const visibleSamples = Math.floor(sampleCount / zoom)
  const pixelsPerSample = (width - LABEL_WIDTH) / visibleSamples
  const totalHeight = channels.length * (CHANNEL_HEIGHT + CHANNEL_GAP)

  const sampleToX = useCallback(
    (sampleIdx: number): number => {
      const visibleStart = scrollX
      return LABEL_WIDTH + (sampleIdx - visibleStart) * pixelsPerSample
    },
    [scrollX, pixelsPerSample]
  )

  const xToSample = useCallback(
    (x: number): number => {
      return Math.round(scrollX + (x - LABEL_WIDTH) / pixelsPerSample)
    },
    [scrollX, pixelsPerSample]
  )

  /* ── Draw ─────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = totalHeight * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${totalHeight}px`
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, width, totalHeight)

    // Grid
    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 0.5
    const gridStepX = Math.max(1, Math.round(visibleSamples / 10))
    for (let i = 0; i <= 10; i++) {
      const sampleIdx = scrollX + Math.round((i / 10) * visibleSamples)
      const x = sampleToX(sampleIdx)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, totalHeight)
      ctx.stroke()
    }

    // Draw each channel
    for (let ch = 0; ch < channels.length; ch++) {
      const { data, color, label } = channels[ch]
      const yBase = ch * (CHANNEL_HEIGHT + CHANNEL_GAP)
      const yMid = yBase + CHANNEL_HEIGHT / 2
      const yHigh = yBase + 4
      const yLow = yBase + CHANNEL_HEIGHT - 4

      // Channel background
      ctx.fillStyle = '#111122'
      ctx.fillRect(0, yBase, width, CHANNEL_HEIGHT)

      // Label
      ctx.fillStyle = '#888'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(label, LABEL_WIDTH - 4, yMid + 1)

      // Center line
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(LABEL_WIDTH, yMid)
      ctx.lineTo(width, yMid)
      ctx.stroke()

      // Waveform
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      let prevY = yMid
      let drawing = false
      for (let x = LABEL_WIDTH; x < width; x++) {
        const sampleIdx = xToSample(x)
        if (sampleIdx < 0 || sampleIdx >= data.length) {
          drawing = false
          continue
        }
        const bit = data[sampleIdx]
        const y = bit ? yHigh : yLow

        if (!drawing) {
          ctx.moveTo(x, prevY)
          ctx.lineTo(x, y)
          drawing = true
        } else if (y !== prevY) {
          // Vertical transition
          ctx.lineTo(x, prevY)
          ctx.lineTo(x, y)
        }
        prevY = y
      }
      ctx.lineTo(width, prevY)
      ctx.stroke()
    }

    // Trigger marker
    if (triggerSample !== undefined && triggerSample >= scrollX && triggerSample < scrollX + visibleSamples) {
      const tx = sampleToX(triggerSample)
      ctx.strokeStyle = TRIGGER_COLOR
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(tx, 0)
      ctx.lineTo(tx, totalHeight)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = TRIGGER_COLOR
      ctx.font = '9px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('T', tx, totalHeight - 10)
    }

    // Cursors
    const drawCursor = (sampleIdx: number | null, label: string) => {
      if (sampleIdx === null || sampleIdx < scrollX || sampleIdx > scrollX + visibleSamples) return
      const cx = sampleToX(sampleIdx)
      ctx.strokeStyle = CURSOR_COLOR
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx, totalHeight)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = CURSOR_COLOR
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, cx, 8)
    }
    drawCursor(cursorA, 'A')
    drawCursor(cursorB, 'B')

    // Delta time
    if (cursorA !== null && cursorB !== null && cursorA !== cursorB) {
      const delta = Math.abs(cursorB - cursorA)
      const timeUs = (delta / (sampleRateKHz * 1000)) * 1_000_000
      const midX = sampleToX(Math.round((cursorA + cursorB) / 2))
      ctx.fillStyle = CURSOR_COLOR
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      const timeStr = timeUs < 1000 ? `${timeUs.toFixed(1)}µs` : `${(timeUs / 1000).toFixed(2)}ms`
      ctx.fillText(`ΔT: ${timeStr}`, midX, totalHeight - 4)
    }
  }, [channels, width, totalHeight, scrollX, zoom, visibleSamples, pixelsPerSample, cursorA, cursorB, triggerSample, sampleToX, xToSample])

  /* ── Mouse handlers ────────────────────────────────── */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = e.clientX - rect.left

      if (e.shiftKey) {
        // Place cursor
        const sample = xToSample(x)
        if (cursorA === null || (cursorB !== null)) {
          setCursorA(sample)
          setCursorB(null)
        } else {
          setCursorB(sample)
        }
      } else {
        // Pan
        setDragging('pan')
        dragRef.current = { startX: e.clientX, startScroll: scrollX }
      }
    },
    [xToSample, cursorA, cursorB, scrollX]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging === 'pan') {
        const dx = e.clientX - dragRef.current.startX
        const sampleDelta = Math.round(-dx / pixelsPerSample)
        setScrollX(Math.max(0, Math.min(sampleCount - visibleSamples, dragRef.current.startScroll + sampleDelta)))
      }
    },
    [dragging, pixelsPerSample, sampleCount, visibleSamples]
  )

  const handleMouseUp = useCallback(() => setDragging(null), [])
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        const newZoom = Math.max(1, Math.min(100, zoom + (e.deltaY > 0 ? -2 : 2)))
        setZoom(newZoom)
      } else {
        setScrollX((s) => Math.max(0, Math.min(sampleCount - visibleSamples, s + (e.deltaY > 0 ? 50 : -50))))
      }
    },
    [zoom, sampleCount, visibleSamples]
  )

  const handleFitWidth = () => {
    setZoom(1)
    setScrollX(0)
    setCursorA(null)
    setCursorB(null)
  }

  if (channels.length === 0) {
    return <div className="pp-placeholder">No data yet. Configure and start capture.</div>
  }

  return (
    <div style={{ userSelect: 'none' }}>
      <div className="pp-row" style={{ marginBottom: 4 }}>
        <button className="pp-btn" onClick={() => setZoom((z) => Math.max(1, z - 1))} title="Zoom out">−</button>
        <button className="pp-btn" onClick={() => setZoom((z) => Math.min(100, z + 1))} title="Zoom in">+</button>
        <button className="pp-btn" onClick={handleFitWidth}>Fit Width</button>
        <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
          Zoom: {zoom}x · Scroll: wheel · Cursor: Shift+click · Pan: drag
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)',
          cursor: dragging === 'pan' ? 'grabbing' : 'crosshair',
          width: '100%',
          maxWidth: width,
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  )
}
