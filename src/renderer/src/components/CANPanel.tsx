import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { CMD_CAN_CFG, CMD_CAN_SEND, CMD_CAN_FILTER, CMD_CAN_MONITOR, EVENT_CAN_FRAME_RX } from '../../../shared/commands'
import { useT } from '../i18n/I18nContext'
import { recordStep } from '../macro-recorder'
import { decodeWith } from '../decoders/index'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

interface CanFrame {
  id: number
  ide: number
  dlc: number
  data: number[]
  timestamp: number
}

const BITRATES = [125_000, 250_000, 500_000, 1_000_000, 2_000_000, 4_000_000, 8_000_000]

export default function CANPanel({ isConnected, onTransaction }: Props) {
  const { t } = useT()
  const [mode, setMode] = useState(0) // 0=Normal, 1=ListenOnly
  const [bitrate, setBitrate] = useState(500_000)
  const [fd, setFd] = useState(0)
  const [termination, setTermination] = useState(1)
  const [configured, setConfigured] = useState(false)
  const [monitoring, setMonitoring] = useState(false)

  const [txId, setTxId] = useState('0x7E8')
  const [txIde, setTxIde] = useState(0) // 0=standard, 1=extended
  const [txDlc, setTxDlc] = useState(8)
  const [txData, setTxData] = useState('')
  const [busy, setBusy] = useState(false)
  const [decodedFrame, setDecodedFrame] = useState<string>('')

  const [frames, setFrames] = useState<CanFrame[]>([])
  const [filterId, setFilterId] = useState('0x000')
  const [filterMask, setFilterMask] = useState('0x7FF')

  const addTxRef = useRef(onTransaction)
  addTxRef.current = onTransaction
  const addTx = useMemo(() => (s: string, d: string) =>
    addTxRef.current({ timestamp: Date.now(), direction: 'tx', protocol: 'CAN', summary: s, data: d }), [])
  const addRxRef = useRef(onTransaction)
  addRxRef.current = onTransaction
  const addRx = useMemo(() => (s: string, d: string) =>
    addRxRef.current({ timestamp: Date.now(), direction: 'rx', protocol: 'CAN', summary: s, data: d }), [])

  const parseHex = (s: string): number => parseInt(s.replace(/^0x/i, ''), 16)

  /* ── Config ─────────────────────────────────────── */
  const handleConfig = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    const modeName = mode === 0 ? 'Normal' : 'ListenOnly'
    addTx(`CFG ${modeName} ${bitrate / 1000}kbps FD=${fd ? 'ON' : 'OFF'} Term=${termination ? '120Ω' : 'OFF'}`, '')
    try {
      const payload = new Uint8Array([
        mode,
        (bitrate >> 24) & 0xff, (bitrate >> 16) & 0xff, (bitrate >> 8) & 0xff, bitrate & 0xff,
        fd, termination,
      ])
      await window.deviceApi.sendCommand(CMD_CAN_CFG, Array.from(payload))
      setConfigured(true)
      recordStep('CAN', 'config', { mode, bitrate, fd, termination })
      addRx('CFG OK', '')
    } catch (err: any) {
      addRx('CFG ERROR', err.message)
    } finally {
      setBusy(false)
    }
  }, [isConnected, mode, bitrate, fd, termination, addTx, addRx])

  /* ── Async CAN frame listener ───────────────────── */
  useEffect(() => {
    if (!isConnected || !monitoring) return
    const cleanup = window.deviceApi.onAsyncEvent((eventType, payload) => {
      if (eventType === EVENT_CAN_FRAME_RX && payload.length >= 7) {
        // Payload: [IDE(1B)] [ID(4B)] [DLC(1B)] [Data(DLC)]
        const ide = payload[0]
        const id = (payload[1] << 24) | (payload[2] << 16) | (payload[3] << 8) | payload[4]
        const dlc = payload[5]
        const data = payload.slice(6, 6 + dlc)
        const frame: CanFrame = { id, ide, dlc, data, timestamp: Date.now() }
        setFrames((prev) => {
          const next = [...prev, frame]
          return next.length > 500 ? next.slice(-500) : next
        })
        const hex = data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
        addRx(`CAN RX ID=${id.toString(16).toUpperCase()} DLC=${dlc}`, hex)
      }
    })
    return cleanup
  }, [isConnected, monitoring, addRx])

  /* ── Monitor toggle ──────────────────────────────── */
  const toggleMonitor = useCallback(async () => {
    if (!isConnected) return
    try {
      await window.deviceApi.sendCommand(CMD_CAN_MONITOR, monitoring ? [] : [1])
      setMonitoring((v) => !v)
      recordStep('CAN', monitoring ? 'monitorStop' : 'monitorStart', {})
      addRx(monitoring ? 'MONITOR STOP' : 'MONITOR START', '')
    } catch (err: any) {
      addRx('MONITOR ERROR', err.message)
    }
  }, [isConnected, monitoring, addRx])

  /* ── Send ───────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    if (!isConnected || !txData.trim()) return
    setBusy(true)
    const id = parseHex(txId)
    const dataBytes = txData.replace(/\s/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
    const dlc = Math.min(dataBytes.length, 64)
    addTx(`SEND ID=${id.toString(16).toUpperCase()} DLC=${dlc}`, txData)

    try {
      const payload = new Uint8Array([
        (id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff,
        txIde, dlc, ...dataBytes.slice(0, dlc),
      ])
      await window.deviceApi.sendCommand(CMD_CAN_SEND, Array.from(payload))
      addRx('SEND OK', '')
      recordStep('CAN', 'send', { id, ide: txIde, data: dataBytes })
    } catch (err: any) {
      addRx('SEND ERROR', err.message)
    } finally {
      setBusy(false)
    }
  }, [isConnected, txId, txIde, txData, addTx, addRx])

  /* ── Filter ─────────────────────────────────────── */
  const handleFilter = useCallback(async () => {
    if (!isConnected) return
    const id = parseHex(filterId)
    const mask = parseHex(filterMask)
    addTx(`FILTER ID=${filterId} MASK=${filterMask}`, '')
    try {
      const payload = new Uint8Array([
        0, // filter #
        (mask >> 24) & 0xff, (mask >> 16) & 0xff, (mask >> 8) & 0xff, mask & 0xff,
        (id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff,
      ])
      await window.deviceApi.sendCommand(CMD_CAN_FILTER, Array.from(payload))
      recordStep('CAN', 'filter', { filterId, filterMask })
      addRx('FILTER OK', '')
    } catch (err: any) {
      addRx('FILTER ERROR', err.message)
    }
  }, [isConnected, filterId, filterMask, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">🚗</span>
        <span className="pp-title">{t('can.title')}</span>
      </div>

      {/* Config Row */}
      <div className="pp-row">
        <div className="pp-field">
          <label>Mode</label>
          <select value={mode} onChange={(e) => setMode(Number(e.target.value))}>
            <option value={0}>Normal</option>
            <option value={1}>Listen Only</option>
          </select>
        </div>
        <div className="pp-field">
          <label>Bitrate</label>
          <select value={bitrate} onChange={(e) => setBitrate(Number(e.target.value))}>
            {BITRATES.map((r) => <option key={r} value={r}>{r >= 1e6 ? `${r / 1e6}Mbps` : `${r / 1000}kbps`}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>FD</label>
          <select value={fd} onChange={(e) => setFd(Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={1}>On</option>
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>Term</label>
          <select value={termination} onChange={(e) => setTermination(Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={1}>120Ω</option>
          </select>
        </div>
        <button className="pp-btn pp-btn--scan" onClick={handleConfig} disabled={busy || !isConnected}>
          Apply
        </button>
      </div>

      {configured && (
        <>
          {/* Monitor Toggle */}
          <div className="pp-row">
            <button className={`pp-btn pp-btn--scan ${monitoring ? 'pp-btn--active' : ''}`} onClick={toggleMonitor} disabled={!isConnected}>
              {monitoring ? '⏹ Stop' : '▶ Monitor'}
            </button>
            <span className="pp-hint" style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
              {frames.length} frames
            </span>
            {frames.length > 0 && (
              <button
                className="pp-btn"
                onClick={() => {
                  const csv = ['id,ide,dlc,data,timestamp']
                    .concat(frames.map((f) =>
                      `${f.id.toString(16)},${f.ide},${f.dlc},"${f.data.map((b) => b.toString(16).padStart(2, '0')).join(' ')}",${new Date(f.timestamp).toISOString()}`
                    ))
                    .join('\n')
                  const blob = new Blob([csv], { type: 'text/csv' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url; a.download = `can-frames-${Date.now()}.csv`; a.click()
                  URL.revokeObjectURL(url)
                }}
                style={{ fontSize: 10 }}
              >
                Export CSV
              </button>
            )}
          </div>

          {/* Filter */}
          <div className="pp-row">
            <div className="pp-field">
              <label>Filter ID</label>
              <input value={filterId} onChange={(e) => setFilterId(e.target.value)} placeholder="0x7E8" spellCheck={false} />
            </div>
            <div className="pp-field">
              <label>Mask</label>
              <input value={filterMask} onChange={(e) => setFilterMask(e.target.value)} placeholder="0x7FF" spellCheck={false} />
            </div>
            <button className="pp-btn" onClick={handleFilter} disabled={!isConnected}>Set Filter</button>
          </div>

          {/* Send */}
          <div className="pp-row">
            <div className="pp-field">
              <label>CAN ID</label>
              <input value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="0x7E8" spellCheck={false} />
            </div>
            <div className="pp-field pp-field--sm">
              <label>IDE</label>
              <select value={txIde} onChange={(e) => setTxIde(Number(e.target.value))}>
                <option value={0}>Std</option>
                <option value={1}>Ext</option>
              </select>
            </div>
            <div className="pp-field pp-field--sm">
              <label>DLC</label>
              <input type="number" value={txDlc} onChange={(e) => setTxDlc(Math.min(64, Math.max(0, Number(e.target.value))))} min={0} max={64} />
            </div>
          </div>
          <div className="pp-row">
            <div className="pp-field pp-field--grow">
              <label>Data (hex)</label>
              <input value={txData} onChange={(e) => setTxData(e.target.value.replace(/[^0-9a-fA-F\s]/g, ''))} placeholder="01 02 03 04 05 06 07 08" spellCheck={false} />
            </div>
            <button className="pp-btn pp-btn--write" onClick={handleSend} disabled={busy || !isConnected || !txData.trim()}>Send</button>
          </div>

          {/* Frame Log */}
          {frames.length > 0 && (
            <div className="pp-row">
              <div className="pp-field pp-field--grow">
                <label>Frame Log ({decodedFrame && <span style={{ color: 'var(--accent)', fontSize: 10 }}>{decodedFrame}</span>})</label>
                <div className="can-log">
                  {frames.slice(-30).map((f, i) => (
                    <div key={`${f.timestamp}-${i}`} className="can-log-line">
                      <span className="can-log-id">{f.id.toString(16).toUpperCase().padStart(f.ide ? 8 : 3, '0')}</span>
                      <span className="can-log-dlc">DLC:{f.dlc}</span>
                      <span className="can-log-data">
                        {f.data.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                      </span>
                      <button
                        className="log-toolbar__btn"
                        onClick={() => {
                          const raw = new Uint8Array([
                            (f.id >> 24) & 0xff, (f.id >> 16) & 0xff,
                            (f.id >> 8) & 0xff, f.id & 0xff,
                            f.ide, f.dlc, ...f.data,
                          ])
                          const result = decodeWith(raw)
                          setDecodedFrame(`${result.protocol}: ${result.summary}`)
                        }}
                        style={{ fontSize: 9, padding: '1px 4px', marginLeft: 4, opacity: 0.6 }}
                        title="Decode"
                      >
                        D
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {!configured && (
        <div className="pp-placeholder">Configure CAN bus then start monitoring or sending frames.</div>
      )}
    </div>
  )
}
