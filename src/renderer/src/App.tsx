/**
 * probe-station 桌面应用 — React 主组件
 *
 * 布局:
 *   - 顶部: 自定义标题栏 (无框窗口)
 *   - 左侧: 连接管理器侧边栏 (USB/WiFi/BLE)
 *   - 中部: 8 个协议面板 Tab 切换 (I2C/SPI/UART/CAN/1-Wire/GPIO/LA/Script)
 *   - 底部: 事务日志 + 导出
 *   - 状态栏: 连接状态 + 收发计数
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { TransportConfig } from '../../shared/transport'
import ConnectionManager, { getBleSession } from './components/ConnectionManager'
import TransactionLog from './components/TransactionLog'
import type { TransactionEntry } from './components/TransactionLog'
import I2CPanel from './components/I2CPanel'
import SPIPanel from './components/SPIPanel'
import UARTPanel from './components/UARTPanel'
import CANPanel from './components/CANPanel'
import OneWirePanel from './components/OneWirePanel'
import GPIOPanel from './components/GPIOPanel'
import LAPanel from './components/LAPanel'
import ScriptPanel from './components/ScriptPanel'
import DashboardPanel from './components/DashboardPanel'
import SakuraParticles from './components/SakuraParticles'
import Mascot from './components/Mascot'
import SettingsButton from './components/SettingsButton'
import type { Theme } from './components/SettingsButton'
import {
  isRecording,
  startRecording,
  stopRecording,
  generateScript,
  recordStep,
  type MacroRecording,
} from './macro-recorder'

/* ── Tabs ─────────────────────────────────────────── */
type PanelTab =
  | 'i2c'
  | 'spi'
  | 'uart'
  | 'can'
  | 'onewire'
  | 'gpio'
  | 'la'
  | 'script'
  | 'dashboard'

const TABS: { key: PanelTab; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dash', icon: '📊' },
  { key: 'i2c', label: 'I²C', icon: '🔌' },
  { key: 'spi', label: 'SPI', icon: '⚡' },
  { key: 'uart', label: 'UART', icon: '📡' },
  { key: 'can', label: 'CAN', icon: '🚗' },
  { key: 'onewire', label: '1-Wire', icon: '🌡' },
  { key: 'gpio', label: 'GPIO', icon: '🔌' },
  { key: 'la', label: 'LA', icon: '📈' },
  { key: 'script', label: 'Script', icon: '📜' },
]

/* ── Constants ────────────────────────────────────── */
const MAX_ENTRIES = 5000
const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 380

function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v !== null ? v === '1' : fallback
  } catch {
    return fallback
  }
}

function saveBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0')
  } catch {
    /* noop */
  }
}

function loadStr(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function saveStr(key: string, v: string) {
  try {
    localStorage.setItem(key, v)
  } catch {
    /* noop */
  }
}

export default function App() {
  /* ── Device State ── */
  const [isConnected, setIsConnected] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [deviceInfo, setDeviceInfo] = useState<{
    firmwareVersion: string
    supportedProtocols: number[]
    transportType: string
  } | null>(null)

  /* ── Transaction Log ── */
  const [entries, setEntries] = useState<TransactionEntry[]>([])
  const [showTimestamp, setShowTimestamp] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [txCount, setTxCount] = useState(0)
  const [rxCount, setRxCount] = useState(0)

  /* ── Active Panel ── */
  const [activeTab, setActiveTab] = useState<PanelTab>('dashboard')
  const [connectedAt, setConnectedAt] = useState<number | undefined>()
  const [macroRecording, setMacroRecording] = useState<MacroRecording | null>(null)

  /* ── UI State ── */
  const [theme, setTheme] = useState<Theme>(() => loadStr('sakura-theme', 'sakura') as Theme)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [showParticles, setShowParticles] = useState(() => loadBool('sakura-particles', true))
  const [showMascot, setShowMascot] = useState(() => loadBool('sakura-mascot', true))
  const sidebarRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  /* ── Entry ID Counter ── */
  const idCounter = useRef(0)

  /* ── Apply theme ── */
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  /* ── Keyboard Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        if (isRecording()) {
          const rec = stopRecording()
          if (rec && rec.steps.length > 0) {
            setMacroRecording(rec)
            const code = generateScript(rec)
            navigator.clipboard.writeText(code).catch(() => {})
            setActiveTab('script')
          }
        } else {
          startRecording()
          setMacroRecording(null)
        }
      }
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault()
        handleClearLog()
      }
      if (e.ctrlKey && e.key === '1') { e.preventDefault(); setActiveTab('dashboard') }
      if (e.ctrlKey && e.key === '2') { e.preventDefault(); setActiveTab('i2c') }
      if (e.ctrlKey && e.key === '3') { e.preventDefault(); setActiveTab('spi') }
      if (e.ctrlKey && e.key === '4') { e.preventDefault(); setActiveTab('uart') }
      if (e.ctrlKey && e.key === '5') { e.preventDefault(); setActiveTab('can') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleClearLog])

  /* ── Status listener ── */
  useEffect(() => {
    const cleanup = window.deviceApi.onStatusChange((status, detail) => {
      if (status === 'connected') {
        setIsConnected(true)
      } else if (status === 'disconnected') {
        setIsConnected(false)
        setDeviceName('')
        setDeviceInfo(null)
      } else if (status === 'error') {
        addEntry({
          timestamp: Date.now(),
          direction: 'rx',
          protocol: 'SYS',
          summary: `Error: ${detail || 'Unknown error'}`,
          data: '',
        })
      }
    })
    return cleanup
  }, [])

  /* ── Sidebar resize ── */
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [sidebarWidth]
  )

  /* ── Theme ── */
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

  /* ── Transaction Log ── */
  const addEntry = useCallback(
    (entry: Omit<TransactionEntry, 'id'>) => {
      const newEntry = { ...entry, id: ++idCounter.current }
      setEntries((prev) => {
        const next = [...prev, newEntry]
        return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
      })
      if (entry.direction === 'tx') setTxCount((c) => c + 1)
      else setRxCount((c) => c + 1)
    },
    []
  )

  const handleLogTransaction = useCallback(
    (entry: {
      timestamp: number
      direction: 'tx' | 'rx'
      protocol: string
      summary: string
      data: string
    }) => {
      addEntry(entry)
    },
    [addEntry]
  )

  const handleClearLog = useCallback(() => {
    setEntries([])
    setTxCount(0)
    setRxCount(0)
    idCounter.current = 0
  }, [])

  /* ── Export ── */
  const handleExport = useCallback(
    (format: 'csv' | 'json') => {
      if (entries.length === 0) return

      let content: string
      let filename: string
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      if (format === 'csv') {
        const header = 'timestamp,direction,protocol,summary,data'
        const rows = entries.map(
          (e) =>
            `"${new Date(e.timestamp).toISOString()}","${e.direction}","${e.protocol}","${e.summary}","${e.data}"`
        )
        content = [header, ...rows].join('\n')
        filename = `probe-station-log-${ts}.csv`
      } else {
        content = JSON.stringify(entries, null, 2)
        filename = `probe-station-log-${ts}.json`
      }

      const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    },
    [entries]
  )

  /* ── Connection handlers ── */
  const bleMode = useRef(false)

  const handleConnect = useCallback(
    async (config: TransportConfig) => {
      const isBle = config.type === 'ble'
      bleMode.current = isBle

      if (!isBle) {
        await window.deviceApi.connect(config)
      }
      // For BLE, the session is already open in ConnectionManager
      setIsConnected(true)
      setConnectedAt(Date.now())

      try {
        let info
        if (isBle) {
          const bleSess = getBleSession()
          if (bleSess) info = await bleSess.getDeviceInfo()
          else throw new Error('No BLE session')
        } else {
          info = await window.deviceApi.getDeviceInfo()
        }
        setDeviceName(info.firmwareVersion || info.deviceName || 'probe-station')
        setDeviceInfo({
          firmwareVersion: info.firmwareVersion || 'unknown',
          supportedProtocols: info.supportedProtocols || [],
          transportType: config.type.toUpperCase(),
        })
        addEntry({
          timestamp: Date.now(),
          direction: 'rx',
          protocol: 'SYS',
          summary: `Connected · FW: ${info.firmwareVersion} · Protocols: ${info.supportedProtocols.length}`,
          data: '',
        })
      } catch {
        setDeviceName('probe-station')
        setDeviceInfo({ firmwareVersion: 'unknown', supportedProtocols: [], transportType: config.type.toUpperCase() })
        addEntry({
          timestamp: Date.now(),
          direction: 'rx',
          protocol: 'SYS',
          summary: 'Connected',
          data: '',
        })
      }
    },
    [addEntry]
  )

  const handleDisconnect = useCallback(async () => {
    if (bleMode.current) {
      const bleSess = getBleSession()
      if (bleSess) await bleSess.close().catch(() => {})
      bleMode.current = false
    } else {
      await window.deviceApi.disconnect()
    }
    setIsConnected(false)
    setDeviceName('')
    setDeviceInfo(null)
    setConnectedAt(undefined)
    addEntry({
      timestamp: Date.now(),
      direction: 'rx',
      protocol: 'SYS',
      summary: 'Disconnected',
      data: '',
    })
  }, [addEntry])

  return (
    <div className="app-container">
      {showParticles && <SakuraParticles />}

      {/* Title Bar */}
      <div className="title-bar">
        <div className="title-bar__left">
          <span className="title-bar__icon">⚡</span>
          <span className="title-bar__text">probe-station</span>
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
          <button
            className="title-bar__btn"
            onClick={() => window.deviceApi.minimizeWindow()}
            title="Minimize"
          >
            ─
          </button>
          <button
            className="title-bar__btn"
            onClick={() => window.deviceApi.maximizeWindow()}
            title="Maximize"
          >
            □
          </button>
          <button
            className="title-bar__btn title-bar__btn--close"
            onClick={() => window.deviceApi.closeWindow()}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Sidebar — Connection Manager */}
        <div className="port-config-sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
          <ConnectionManager
            isConnected={isConnected}
            deviceName={deviceName}
            deviceInfo={deviceInfo}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>

        {/* Resize Handle */}
        <div className="sidebar-resize-handle" onMouseDown={onDragStart} />

        {/* Protocol Panel Area */}
        <div className="terminal-panel">
          {/* Tab Bar */}
          <div className="protocol-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`protocol-tab ${activeTab === tab.key ? 'protocol-tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
                title={tab.label}
              >
                <span className="protocol-tab__icon">{tab.icon}</span>
                <span className="protocol-tab__label">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Active Panel */}
          <div className="protocol-panel-area">
            {activeTab === 'i2c' && (
              <I2CPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'spi' && (
              <SPIPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'uart' && (
              <UARTPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'can' && (
              <CANPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'onewire' && (
              <OneWirePanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'gpio' && (
              <GPIOPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'la' && (
              <LAPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'script' && (
              <ScriptPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
            )}
            {activeTab === 'dashboard' && (
              <DashboardPanel
                isConnected={isConnected}
                deviceInfo={deviceInfo}
                txCount={txCount}
                rxCount={rxCount}
                entryCount={entries.length}
                connectedAt={connectedAt}
              />
            )}
          </div>

          {/* Transaction Log */}
          <TransactionLog
            entries={entries}
            showTimestamp={showTimestamp}
            autoScroll={autoScroll}
            onToggleTimestamp={() => setShowTimestamp((v) => !v)}
            onToggleAutoScroll={() => setAutoScroll((v) => !v)}
            onClear={handleClearLog}
            onExport={handleExport}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span className={`status-bar__dot ${isConnected ? 'status-bar__dot--connected' : ''}`} />
        <span className="status-bar__text">
          {isConnected
            ? `Connected (${deviceName || 'probe-station'})`
            : 'Disconnected'}
        </span>
        <span className="status-bar__spacer" />
        <span className="status-bar__stat">TX: {txCount}</span>
        <span className="status-bar__stat">RX: {rxCount}</span>
        {macroRecording && (
          <span className="status-bar__stat" style={{ color: 'var(--accent)' }}>
            ⏺ REC {macroRecording.steps.length} steps
          </span>
        )}
        {isConnected && (
          <button
            className="status-bar__record-btn"
            onClick={() => {
              if (isRecording()) {
                const rec = stopRecording()
                if (rec && rec.steps.length > 0) {
                  setMacroRecording(rec)
                  const code = generateScript(rec)
                  navigator.clipboard.writeText(code).catch(() => {})
                  setActiveTab('script')
                }
              } else {
                startRecording()
                setMacroRecording(null)
              }
            }}
            style={{
              marginLeft: 8,
              padding: '2px 8px',
              fontSize: 11,
              background: isRecording() ? 'var(--accent)' : 'transparent',
              color: isRecording() ? '#fff' : 'var(--text-muted)',
              border: '1px solid ' + (isRecording() ? 'var(--accent)' : 'var(--border-color)'),
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            {isRecording() ? '⏹ Stop' : '⏺ Record'}
          </button>
        )}
      </div>

      {/* Mascot */}
      {showMascot && (
        <Mascot
          isConnected={isConnected}
          sidebarWidth={sidebarWidth}
          onDismiss={() => handleToggleMascot(false)}
        />
      )}
    </div>
  )
}
