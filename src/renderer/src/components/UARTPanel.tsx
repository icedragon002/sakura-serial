import { useState, useCallback, useRef, useEffect } from 'react'
import { CMD_UART_CFG, CMD_UART_WRITE, CMD_UART_READ, CMD_UART_BREAK, EVENT_UART_DATA } from '../../../shared/commands'
import { useT } from '../i18n/I18nContext'
import { recordStep } from '../macro-recorder'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1000000, 2000000, 3000000, 6000000]
const DATA_BITS = [5, 6, 7, 8]
const STOP_BITS = [1, 1.5, 2]
const PARITIES = ['none', 'even', 'odd', 'mark', 'space'] as const

const HISTORY_MAX = 50

export default function UARTPanel({ isConnected, onTransaction }: Props) {
  const { t } = useT()
  const [port, setPort] = useState(0)
  const [baud, setBaud] = useState(115200)
  const [dataBits, setDataBits] = useState(8)
  const [stopBits, setStopBits] = useState(1)
  const [parity, setParity] = useState<string>('none')
  const [configured, setConfigured] = useState(false)

  const [input, setInput] = useState('')
  const [isHex, setIsHex] = useState(false)
  const [appendNewline, setAppendNewline] = useState(true)
  const [rxBuffer, setRxBuffer] = useState('')
  const [busy, setBusy] = useState(false)

  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-read polling
  const [autoRead, setAutoRead] = useState(false)
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  /* ── Async UART data listener ── */
  useEffect(() => {
    if (!isConnected) return
    const cleanup = window.deviceApi.onAsyncEvent((eventType, payload) => {
      if (eventType === EVENT_UART_DATA && payload.length > 0) {
        const portIdx = payload[0]
        const data = payload.slice(1)
        const text = new TextDecoder().decode(data)
        const hex = data.map((b) => b.toString(16).padStart(2, '0')).join(' ')
        addRx(`ASYNC Port${portIdx} ${data.length}B`, hex)
        setRxBuffer((prev) => prev + text)
      }
    })
    return cleanup
  }, [isConnected])

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'UART', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'UART', summary: s, data: d })

  /* ── Configure ──────────────────────────────────── */
  const handleConfig = useCallback(async () => {
    if (!isConnected) return
    setBusy(true)
    const parMap: Record<string, number> = { none: 0, even: 1, odd: 2, mark: 3, space: 4 }
    addTx(`CFG Port${port} ${baud} ${dataBits}${parity[0].toUpperCase()}${stopBits}`, '')

    try {
      const payload = new Uint8Array([
        port,
        (baud >> 24) & 0xff, (baud >> 16) & 0xff, (baud >> 8) & 0xff, baud & 0xff,
        dataBits, parMap[parity] ?? 0, stopBits === 1.5 ? 1 : stopBits,
      ])
      await window.deviceApi.sendCommand(CMD_UART_CFG, Array.from(payload))
      setConfigured(true)
      recordStep('UART', 'config', { port, baud, dataBits, parity, stopBits })
      addRx('CFG OK', `${baud} ${dataBits}${parity[0].toUpperCase()}${stopBits}`)
    } catch (err: any) {
      addRx('CFG ERROR', err.message)
    } finally {
      setBusy(false)
    }
  }, [isConnected, port, baud, dataBits, stopBits, parity, addTx, addRx])

  /* ── Send ───────────────────────────────────────── */
  const doSend = useCallback(() => {
    if (!input.trim() || !isConnected) return
    let data = input
    if (appendNewline && !isHex) data += '\r\n'

    const bytes = isHex
      ? data.replace(/\s/g, '').match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []
      : [...new TextEncoder().encode(data)]

    if (bytes.length === 0) return
    addTx(`WRITE Port${port} ${bytes.length}B`, isHex ? data : input)
    const payload = new Uint8Array([port, ...bytes])
    if (isHex) recordStep('UART', 'write', { port, data: bytes })
    else recordStep('UART', 'write', { port, text: input })

    window.deviceApi.sendCommand(CMD_UART_WRITE, Array.from(payload)).catch(() => {})

    setHistory((prev) => {
      const next = [input, ...prev.filter((h) => h !== input)]
      return next.length > HISTORY_MAX ? next.slice(0, HISTORY_MAX) : next
    })
    setHistoryIdx(-1)
    setInput('')
    inputRef.current?.focus()
  }, [input, isHex, appendNewline, isConnected, port, addTx])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHistoryIdx((prev) => {
        const next = prev + 1
        if (next >= history.length) return prev
        setInput(history[next])
        return next
      })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHistoryIdx((prev) => {
        const next = prev - 1
        if (next < 0) { setInput(''); return -1 }
        setInput(history[next])
        return next
      })
    }
  }, [doSend, history])

  /* ── Read ───────────────────────────────────────── */
  const handleRead = useCallback(async () => {
    if (!isConnected) return
    try {
      const payload = new Uint8Array([port, 0x00, 0x64]) // timeout = 100ms
      const resp = await window.deviceApi.sendCommand(CMD_UART_READ, Array.from(payload))
      if (resp.payload.length > 0) {
        const text = new TextDecoder().decode(resp.payload)
        const hex = Array.from(resp.payload).map((b) => b.toString(16).padStart(2, '0')).join(' ')
        addRx(`READ ${resp.payload.length}B`, hex)
        recordStep('UART', 'read', { port })
        setRxBuffer((prev) => prev + text)
      }
    } catch (err: any) {
      addRx('READ ERROR', err.message)
    }
  }, [isConnected, port, addRx])

  /* ── Auto Read ──────────────────────────────────── */
  useEffect(() => {
    if (autoTimer.current) { clearInterval(autoTimer.current); autoTimer.current = null }
    if (autoRead && isConnected) {
      autoTimer.current = setInterval(handleRead, 500)
    }
    return () => { if (autoTimer.current) clearInterval(autoTimer.current) }
  }, [autoRead, isConnected, handleRead])

  /* ── Break ──────────────────────────────────────── */
  const handleBreak = useCallback(async () => {
    if (!isConnected) return
    addTx(`BREAK Port${port} 100ms`, '')
    try {
      await window.deviceApi.sendCommand(CMD_UART_BREAK, Array.from(new Uint8Array([port, 0x00, 0x64])))
      addRx('BREAK OK', '')
    } catch (err: any) {
      addRx('BREAK ERROR', err.message)
    }
  }, [isConnected, port, addTx, addRx])

  return (
    <div className="protocol-panel">
      <div className="pp-header">
        <span className="pp-icon">📡</span>
        <span className="pp-title">{t('uart.title')}</span>
      </div>

      {/* Config Row */}
      <div className="pp-row">
        <div className="pp-field">
          <label>Port</label>
          <select value={port} onChange={(e) => setPort(Number(e.target.value))}>
            {[0, 1, 2, 3].map((i) => <option key={i} value={i}>UART {i}</option>)}
          </select>
        </div>
        <div className="pp-field">
          <label>Baud</label>
          <select value={baud} onChange={(e) => setBaud(Number(e.target.value))}>
            {BAUD_RATES.map((r) => <option key={r} value={r}>{r.toLocaleString()}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>Data</label>
          <select value={dataBits} onChange={(e) => setDataBits(Number(e.target.value))}>
            {DATA_BITS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>Parity</label>
          <select value={parity} onChange={(e) => setParity(e.target.value)}>
            {PARITIES.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
        </div>
        <div className="pp-field pp-field--sm">
          <label>Stop</label>
          <select value={stopBits} onChange={(e) => setStopBits(Number(e.target.value))}>
            {STOP_BITS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button className="pp-btn pp-btn--scan" onClick={handleConfig} disabled={busy || !isConnected}>
          Apply
        </button>
      </div>

      {configured && (
        <>
          {/* Send Row */}
          <div className="pp-row">
            <div className="pp-field pp-field--grow">
              <label>Send</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  ref={inputRef}
                  style={{ flex: 1 }}
                  value={input}
                  onChange={(e) => {
                    const v = e.target.value
                    setInput(isHex ? v.replace(/[^0-9a-fA-F\s]/g, '') : v)
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={isHex ? '48 65 6C 6C 6F' : 'Type here…'}
                  spellCheck={false}
                  disabled={!isConnected}
                />
                <button className="pp-btn pp-btn--write" onClick={doSend} disabled={!isConnected || !input.trim()}>
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* Options Row */}
          <div className="pp-row" style={{ alignItems: 'center' }}>
            <button className={`pp-opt ${isHex ? 'pp-opt--active' : ''}`} onClick={() => setIsHex((v) => !v)}>HEX</button>
            <button className={`pp-opt ${appendNewline ? 'pp-opt--active' : ''}`} onClick={() => setAppendNewline((v) => !v)}>⏎</button>
            <button className="pp-btn" onClick={handleRead} disabled={!isConnected}>Read</button>
            <button className={`pp-opt ${autoRead ? 'pp-opt--active' : ''}`} onClick={() => setAutoRead((v) => !v)} disabled={!isConnected}>
              {autoRead ? '⏸ Auto' : '▶ Auto'}
            </button>
            <button className="pp-btn" onClick={handleBreak} disabled={!isConnected}>BREAK</button>
          </div>

          {/* RX Buffer */}
          <div className="pp-row">
            <div className="pp-field pp-field--grow">
              <label>RX Buffer ({rxBuffer.length} chars)</label>
              <textarea
                className="pp-textarea"
                value={rxBuffer}
                readOnly
                rows={6}
                placeholder="Received data…"
              />
            </div>
          </div>
          <div className="pp-row">
            <button className="pp-btn" onClick={() => setRxBuffer('')}>Clear Buffer</button>
          </div>
        </>
      )}

      {!configured && (
        <div className="pp-placeholder">Configure UART port then start sending/receiving.</div>
      )}
    </div>
  )
}
