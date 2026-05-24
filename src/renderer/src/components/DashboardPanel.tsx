/**
 * probe-station — Dashboard Panel
 *
 * Real-time overview of device status, protocol activity,
 * and performance metrics in a single view.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useT } from '../i18n/I18nContext'

interface Props {
  isConnected: boolean
  deviceInfo?: {
    firmwareVersion: string
    supportedProtocols: number[]
    transportType: string
    vrefChannels?: Record<number, number>
    sramUsage?: number
  } | null
  txCount: number
  rxCount: number
  entryCount: number
  connectedAt?: number
}

const PROTOCOL_NAMES: Record<number, string> = {
  0x10: 'System', 0x20: 'I²C', 0x30: 'SPI', 0x40: 'UART',
  0x50: 'CAN', 0x60: '1-Wire', 0x70: 'GPIO', 0x80: 'LA',
}

export default function DashboardPanel({
  isConnected,
  deviceInfo,
  txCount,
  rxCount,
  entryCount,
  connectedAt,
}: Props) {
  const { t } = useT()
  const [uptime, setUptime] = useState('')
  const [txRate, setTxRate] = useState(0)
  const [rxRate, setRxRate] = useState(0)
  const txPrev = useRef(txCount)
  const rxPrev = useRef(rxCount)
  const rateTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [txHistory, setTxHistory] = useState<number[]>(Array(30).fill(0))
  const [rxHistory, setRxHistory] = useState<number[]>(Array(30).fill(0))
  const sparklineRef = useRef<HTMLCanvasElement>(null)

  /* ── Uptime ticker ── */
  useEffect(() => {
    if (!isConnected || !connectedAt) {
      setUptime('—')
      return
    }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - connectedAt) / 1000)
      const h = Math.floor(elapsed / 3600)
      const m = Math.floor((elapsed % 3600) / 60)
      const s = elapsed % 60
      setUptime(`${h}h ${m}m ${s}s`)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [isConnected, connectedAt])

  /* ── TX/RX rate ── */
  useEffect(() => {
    rateTimer.current = setInterval(() => {
      const txR = txCount - txPrev.current
      const rxR = rxCount - rxPrev.current
      setTxRate(txR)
      setRxRate(rxR)
      setTxHistory((prev) => [...prev.slice(1), txR])
      setRxHistory((prev) => [...prev.slice(1), rxR])
      txPrev.current = txCount
      rxPrev.current = rxCount
    }, 1000)
    return () => { if (rateTimer.current) clearInterval(rateTimer.current) }
  }, [txCount, rxCount])

  /* ── Sparkline canvas draw ── */
  useEffect(() => {
    const c = sparklineRef.current
    if (!c || !isConnected) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const w = c.width; const h = c.height
    ctx.clearRect(0, 0, w, h)
    const drawLine = (data: number[], color: string) => {
      const max = Math.max(1, ...data)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * w
        const y = h - (v / max) * (h - 4) - 2
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
    drawLine(txHistory, '#ff6b9d')
    drawLine(rxHistory, '#4fc3f7')
  }, [txHistory, rxHistory, isConnected])

  const protocolCount = deviceInfo?.supportedProtocols?.length ?? 0

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📊</span>
        <span className="pp-title">{t('dash.title')}</span>
      </div>

      {!isConnected ? (
        <div className="pp-placeholder">Connect a device to see the dashboard.</div>
      ) : (
        <>
          {/* Device Info Card */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>{t('dash.deviceInfo')}</div>
            <div style={gridStyle}>
              <Metric label={t('conn.firmware')} value={deviceInfo?.firmwareVersion || '—'} />
              <Metric label={t('conn.transport')} value={deviceInfo?.transportType || '—'} />
              <Metric label={t('conn.protocols')} value={String(protocolCount)} />
              <Metric label={t('dash.uptime')} value={uptime} />
            </div>
          </div>

          {/* Stats Card */}
          <div style={cardStyle}>
            <div style={cardTitleStyle}>Activity</div>
            <div style={gridStyle}>
              <Metric label={t('dash.txRate')} value={`${txRate}/s`} highlight />
              <div style={{ gridColumn: '1 / -1', padding: '4px 12px 0' }}>
                <canvas ref={sparklineRef} width={300} height={40} style={{ width: '100%', height: 40 }} />
              </div>
              <Metric label={t('dash.rxRate')} value={`${rxRate}/s`} highlight />
              <Metric label={`Total ${t('status.tx')}`} value={String(txCount)} />
              <Metric label={`Total ${t('status.rx')}`} value={String(rxCount)} />
              <Metric label={t('log.entries', { n: String(entryCount) })} value="" />
            </div>
          </div>

          {/* Protocol Support Card */}
          {deviceInfo?.supportedProtocols && deviceInfo.supportedProtocols.length > 0 && (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>{t('dash.protocolsActive')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {deviceInfo.supportedProtocols.map((p) => (
                  <span key={p} style={chipStyle}>
                    {PROTOCOL_NAMES[p] || `0x${p.toString(16)}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* VRef & SRAM Card */}
          {(deviceInfo?.vrefChannels && Object.keys(deviceInfo.vrefChannels).length > 0) || (deviceInfo?.sramUsage && deviceInfo.sramUsage > 0) ? (
            <div style={cardStyle}>
              <div style={cardTitleStyle}>Hardware</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                {deviceInfo.vrefChannels && Object.keys(deviceInfo.vrefChannels).length > 0 && (
                  <span style={{ color: 'var(--text-dim)' }}>
                    VRef: {Object.entries(deviceInfo.vrefChannels).map(([ch, mV]) => `CH${ch}=${(mV / 1000).toFixed(1)}V`).join(', ')}
                  </span>
                )}
                {deviceInfo.sramUsage && deviceInfo.sramUsage > 0 && (
                  <span style={{ color: 'var(--text-dim)' }}>
                    SRAM: {deviceInfo.sramUsage}KB
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────── */

function Metric({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div style={{ padding: '8px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: highlight ? 'var(--accent)' : 'var(--text)',
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-md)',
  padding: '12px 16px',
  marginBottom: 12,
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-dim)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
  gap: 4,
}

const chipStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-color)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text)',
}
