import { useState, useCallback, useEffect, useRef } from 'react'
import type { SerialPortInfo, SerialConfig, SerialData } from '../../preload/index'
import { useT } from './i18n/I18nContext'
import PortConfig from './components/PortConfig'
import Terminal from './components/Terminal'
import SendPanel from './components/SendPanel'
import StatusBar from './components/StatusBar'
import SakuraParticles from './components/SakuraParticles'
import Mascot from './components/Mascot'
import SettingsButton from './components/SettingsButton'
import type { Theme } from './components/SettingsButton'

export interface TerminalEntry {
  id: number
  timestamp: number
  direction: 'tx' | 'rx'
  data: string
  hex: string
}

const MAX_ENTRIES = 5000
const DEFAULT_SIDEBAR_WIDTH = 250
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? v === '1' : fallback
  } catch { return fallback }
}

function saveBool(key: string, v: boolean) {
  try { localStorage.setItem(key, v ? '1' : '0') } catch { /* noop */ }
}

function loadStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}

function saveStr(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* noop */ }
}

export default function App() {
  const { t } = useT()

  // ── Serial State ──
  const [ports, setPorts] = useState<SerialPortInfo[]>([])
  const [selectedPort, setSelectedPort] = useState('')
  const [baudRate, setBaudRate] = useState(115200)
  const [dataBits, setDataBits] = useState<5 | 6 | 7 | 8>(8)
  const [stopBits, setStopBits] = useState<1 | 1.5 | 2>(1)
  const [parity, setParity] = useState<'none' | 'even' | 'odd' | 'mark' | 'space'>('none')
  const [flowControl, setFlowControl] = useState<'none' | 'rtscts' | 'xon/xoff'>('none')
  const [isOpen, setIsOpen] = useState(false)
  const [dtr, setDtr] = useState(false)
  const [rts, setRts] = useState(false)

  // ── Terminal State ──
  const [entries, setEntries] = useState<TerminalEntry[]>([])
  const [showHex, setShowHex] = useState(false)
  const [showTimestamp, setShowTimestamp] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [txCount, setTxCount] = useState(0)
  const [rxCount, setRxCount] = useState(0)

  // ── UI State ──
  const [theme, setTheme] = useState<Theme>(() => loadStr('sakura-theme', 'sakura') as Theme)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [showParticles, setShowParticles] = useState(() => loadBool('sakura-particles', true))
  const [showMascot, setShowMascot] = useState(() => loadBool('sakura-mascot', true))
  const sidebarRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const idCounter = useRef(0)
  const entriesRef = useRef<TerminalEntry[]>([])
  const rafRef = useRef<number>(0)
  const pendingEntries = useRef<TerminalEntry[]>([])

  // Keep entriesRef in sync
  entriesRef.current = entries

  // ── Sidebar resize ──
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    const startX = e.clientX
    const startWidth = sidebarRef.current?.offsetWidth ?? sidebarWidth

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const w = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + delta))
      setSidebarWidth(w)
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  // ── Apply theme to document ──
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const handleSetTheme = useCallback((th: Theme) => {
    setTheme(th)
    saveStr('sakura-theme', th)
  }, [])

  const handleToggleParticles = useCallback((v: boolean) => {
    setShowParticles(v)
    saveBool('sakura-particles', v)
  }, [])
  const handleToggleMascot = useCallback((v: boolean) => {
    setShowMascot(v)
    saveBool('sakura-mascot', v)
  }, [])

  // ── Flush pending entries in batch via rAF ──
  const flushPending = useCallback(() => {
    if (pendingEntries.current.length === 0) return
    setEntries((prev) => {
      const next = [...prev, ...pendingEntries.current]
      pendingEntries.current = []
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
    })
  }, [])

  // ── Add entry (batched) ──
  const addEntry = useCallback((entry: Omit<TerminalEntry, 'id'>) => {
    const newEntry = { ...entry, id: ++idCounter.current }
    pendingEntries.current.push(newEntry)

    if (entry.direction === 'tx') {
      setTxCount((c) => c + 1)
    } else {
      setRxCount((c) => c + 1)
    }

    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0
        flushPending()
      })
    }
  }, [flushPending])

  // ── Serial Data Listener ──
  useEffect(() => {
    const cleanup = window.api.onSerialData((data: SerialData) => {
      addEntry({
        timestamp: data.timestamp,
        direction: 'rx',
        data: data.data,
        hex: data.hex
      })
    })
    return cleanup
  }, [addEntry])

  // ── Serial Error Listener ──
  useEffect(() => {
    const cleanup = window.api.onSerialError((error: string) => {
      addEntry({
        timestamp: Date.now(),
        direction: 'rx',
        data: t('serial.error', { error }),
        hex: ''
      })
    })
    return cleanup
  }, [addEntry, t])

  // ── Serial Status Listener ──
  useEffect(() => {
    const cleanup = window.api.onSerialStatus((status: string) => {
      if (status === 'closed') {
        setIsOpen(false)
        setDtr(false)
        setRts(false)
      }
    })
    return cleanup
  }, [])

  // ── List Ports ──
  const refreshPorts = useCallback(async () => {
    const list = await window.api.listPorts()
    setPorts(list)
    return list
  }, [])

  // ── Initial port scan ──
  useEffect(() => {
    refreshPorts()
    const interval = setInterval(refreshPorts, 3000)
    return () => clearInterval(interval)
  }, [refreshPorts])

  // ── Open / Close ──
  function parityLabelShort(p: string): string {
    switch (p) { case 'none': return 'N'; case 'even': return 'E'; case 'odd': return 'O'; case 'mark': return 'M'; case 'space': return 'S'; default: return 'N' }
  }

  const handleOpen = useCallback(async () => {
    if (!selectedPort) return
    const config: SerialConfig = {
      path: selectedPort,
      baudRate,
      dataBits,
      stopBits,
      parity,
      flowControl
    }
    const result = await window.api.openPort(config)
    if (result.success) {
      setIsOpen(true)
      addEntry({
        timestamp: Date.now(),
        direction: 'rx',
        data: t('serial.opened', {
          port: selectedPort,
          baud: String(baudRate),
          data: String(dataBits),
          parity: parityLabelShort(parity),
          stop: String(stopBits)
        }),
        hex: ''
      })
    } else {
      addEntry({
        timestamp: Date.now(),
        direction: 'rx',
        data: t('serial.openFailed', { error: result.error || '' }),
        hex: ''
      })
    }
  }, [selectedPort, baudRate, dataBits, stopBits, parity, flowControl, addEntry, t])

  const handleClose = useCallback(async () => {
    const result = await window.api.closePort()
    if (result.success) {
      setIsOpen(false)
      setDtr(false)
      setRts(false)
      addEntry({
        timestamp: Date.now(),
        direction: 'rx',
        data: t('serial.closed'),
        hex: ''
      })
    }
  }, [addEntry, t])

  // ── Send Data ──
  const handleSend = useCallback(async (data: string, isHex: boolean) => {
    if (!isOpen || !data) return
    const result = await window.api.writeData(data, isHex)
    if (result.success) {
      addEntry({
        timestamp: Date.now(),
        direction: 'tx',
        data: isHex ? `[HEX] ${data}` : data,
        hex: isHex ? data.replace(/\s/g, '') : ''
      })
    }
  }, [isOpen, addEntry])

  // ── DTR / RTS ──
  const handleDtr = useCallback(async (state: boolean) => {
    await window.api.setDtr(state)
    setDtr(state)
  }, [])

  const handleRts = useCallback(async (state: boolean) => {
    await window.api.setRts(state)
    setRts(state)
  }, [])

  // ── Clear Terminal ──
  const handleClear = useCallback(() => {
    setEntries([])
    setTxCount(0)
    setRxCount(0)
    idCounter.current = 0
  }, [])

  return (
    <div className="app-container">
      {showParticles && <SakuraParticles />}

      {/* Title Bar */}
      <div className="title-bar">
        <div className="title-bar__left">
          <span className="title-bar__icon">🌸</span>
          <span className="title-bar__text">{t('app.title')}</span>
        </div>
        <div className="title-bar__controls">
          <SettingsButton
            theme={theme}
            onSetTheme={handleSetTheme}
            showParticles={showParticles}
            showMascot={showMascot}
            onToggleParticles={handleToggleParticles}
            onToggleMascot={handleToggleMascot}
          />
          <button className="title-bar__btn" onClick={() => window.api.minimizeWindow()}
            title={t('win.minimize')}>─</button>
          <button className="title-bar__btn" onClick={() => window.api.maximizeWindow()}
            title={t('win.maximize')}>□</button>
          <button className="title-bar__btn title-bar__btn--close"
            onClick={() => window.api.closeWindow()} title={t('win.close')}>✕</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="port-config-sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
          <PortConfig
            ports={ports}
            selectedPort={selectedPort}
            onSelectPort={setSelectedPort}
            baudRate={baudRate}
            onBaudRateChange={setBaudRate}
            dataBits={dataBits}
            onDataBitsChange={setDataBits}
            stopBits={stopBits}
            onStopBitsChange={setStopBits}
            parity={parity}
            onParityChange={setParity}
            flowControl={flowControl}
            onFlowControlChange={setFlowControl}
            isOpen={isOpen}
            onOpen={handleOpen}
            onClose={handleClose}
            onRefresh={refreshPorts}
            dtr={dtr}
            rts={rts}
            onDtrChange={handleDtr}
            onRtsChange={handleRts}
          />
        </div>

        {/* Resize Handle */}
        <div className="sidebar-resize-handle" onMouseDown={onDragStart} />

        <div className="terminal-panel">
          <Terminal
            entries={entries}
            showHex={showHex}
            showTimestamp={showTimestamp}
            autoScroll={autoScroll}
            onToggleHex={() => setShowHex((v) => !v)}
            onToggleTimestamp={() => setShowTimestamp((v) => !v)}
            onToggleAutoScroll={() => setAutoScroll((v) => !v)}
            onClear={handleClear}
          />

          <SendPanel
            isOpen={isOpen}
            onSend={handleSend}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        isOpen={isOpen}
        selectedPort={selectedPort}
        baudRate={baudRate}
        dataBits={dataBits}
        stopBits={stopBits}
        parity={parity}
        txCount={txCount}
        rxCount={rxCount}
      />

      {/* Mascot */}
      {showMascot && <Mascot isConnected={isOpen} sidebarWidth={sidebarWidth} onDismiss={() => handleToggleMascot(false)} />}
    </div>
  )
}
