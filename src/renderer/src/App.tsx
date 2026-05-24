/**
 * Sakura Serial 桌面应用 — React 主组件
 *
 * 布局:
 *   - 顶部: 自定义标题栏 (无框窗口)
 *   - 左侧: 连接管理器侧边栏 (USB/WiFi/BLE)
 *   - 中部: 5 个顶级模块 (Dashboard / UART / Tools / Wireless / Script)
 *   - 底部: 事务日志 + 导出
 *   - 状态栏: 连接状态 + 收发计数
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import type { TransportConfig } from '../../shared/transport'
import ConnectionManager, { getBleSession } from './components/ConnectionManager'
import TransactionLog from './components/TransactionLog'
import type { TransactionEntry } from './components/TransactionLog'
import UARTPanel from './components/UARTPanel'
import ScriptPanel from './components/ScriptPanel'
import DashboardPanel from './components/DashboardPanel'
import ToolsModule from './components/ToolsModule'
import WirelessModule from './components/WirelessModule'
import ErrorBoundary from './components/ErrorBoundary'
import SakuraParticles from './components/SakuraParticles'
import Mascot from './components/Mascot'
import SettingsButton from './components/SettingsButton'
import type { Theme } from './components/SettingsButton'
import {
  isRecording,
  startRecording,
  stopRecording,
  generateScript,
  type MacroRecording,
} from './macro-recorder'

/* ── Modules ───────────────────────────────────────── */
type ModuleTab = 'dashboard' | 'uart' | 'tools' | 'wireless' | 'script'

const MODULES: { key: ModuleTab; label: string; icon: string; hint: string }[] = [
  { key: 'dashboard', label: 'Dash', icon: '📊', hint: 'Overview' },
  { key: 'uart', label: 'UART', icon: '📡', hint: 'Serial terminal' },
  { key: 'tools', label: 'Tools', icon: '🔧', hint: 'I²C/SPI/CAN/1-Wire/GPIO/LA' },
  { key: 'wireless', label: 'Wireless', icon: '📶', hint: 'WiFi + BLE' },
  { key: 'script', label: 'Script', icon: '📜', hint: 'JS scripting' },
]

/* ── Constants ────────────────────────────────────── */
const MAX_ENTRIES = 5000
const DEFAULT_SIDEBAR_WIDTH = 260
const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 380

function loadBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v !== null ? v === '1' : fallback } catch { return fallback }
}
function saveBool(key: string, v: boolean) { try { localStorage.setItem(key, v ? '1' : '0') } catch { /* noop */ } }
function loadStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function saveStr(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* noop */ } }

export default function App() {
  /* ── Device State ── */
  const [isConnected, setIsConnected] = useState(false)
  const [deviceName, setDeviceName] = useState('')
  const [deviceInfo, setDeviceInfo] = useState<{
    firmwareVersion: string; supportedProtocols: number[]; transportType: string
    vrefChannels?: Record<number, number>; sramUsage?: number
  } | null>(null)

  /* ── Transaction Log ── */
  const [entries, setEntries] = useState<TransactionEntry[]>([])
  const [showTimestamp, setShowTimestamp] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [txCount, setTxCount] = useState(0)
  const [rxCount, setRxCount] = useState(0)

  /* ── Module ── */
  const [activeTab, setActiveTab] = useState<ModuleTab>('dashboard')
  const [connectedAt, setConnectedAt] = useState<number | undefined>()
  const [macroRecording, setMacroRecording] = useState<MacroRecording | null>(null)

  /* ── UI State ── */
  const [theme, setTheme] = useState<Theme>(() => loadStr('sakura-theme', 'sakura') as Theme)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [showParticles, setShowParticles] = useState(() => loadBool('sakura-particles', true))
  const [showMascot, setShowMascot] = useState(() => loadBool('sakura-mascot', true))
  const sidebarRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const idCounter = useRef(0)
  const bleMode = useRef(false)

  /* ── Apply theme ── */
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])

  /* ── Keyboard Shortcuts ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault()
        if (isRecording()) {
          const rec = stopRecording()
          if (rec && rec.steps.length > 0) {
            setMacroRecording(rec)
            navigator.clipboard.writeText(generateScript(rec)).catch(() => {})
            setActiveTab('script')
          }
        } else {
          startRecording(); setMacroRecording(null)
        }
      }
      if (e.ctrlKey && e.key === 'l') { e.preventDefault(); handleClearLog() }
      if (e.ctrlKey && e.key === '1') { e.preventDefault(); setActiveTab('dashboard') }
      if (e.ctrlKey && e.key === '2') { e.preventDefault(); setActiveTab('uart') }
      if (e.ctrlKey && e.key === '3') { e.preventDefault(); setActiveTab('tools') }
      if (e.ctrlKey && e.key === '4') { e.preventDefault(); setActiveTab('wireless') }
      if (e.ctrlKey && e.key === '5') { e.preventDefault(); setActiveTab('script') }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  /* ── Status listener ── */
  useEffect(() => {
    return window.deviceApi.onStatusChange((status, detail) => {
      if (status === 'connected') setIsConnected(true)
      else if (status === 'disconnected') { setIsConnected(false); setDeviceName(''); setDeviceInfo(null) }
      else if (status === 'error') addEntry({ timestamp: Date.now(), direction: 'rx', protocol: 'SYS', summary: `Error: ${detail || 'Unknown'}`, data: '' })
    })
  }, [])

  /* ── Sidebar resize ── */
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true
    const startX = e.clientX
    const startWidth = sidebarRef.current?.offsetWidth ?? sidebarWidth
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + ev.clientX - startX))
      setSidebarWidth(w)
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  /* ── Transaction Log ── */
  const addEntry = useCallback((entry: Omit<TransactionEntry, 'id'>) => {
    const newEntry = { ...entry, id: ++idCounter.current }
    setEntries((prev) => {
      const next = [...prev, newEntry]
      return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next
    })
    if (entry.direction === 'tx') setTxCount((c) => c + 1)
    else setRxCount((c) => c + 1)
  }, [])

  const handleLogTransaction = useCallback((entry: { timestamp: number; direction: 'tx' | 'rx'; protocol: string; summary: string; data: string }) => {
    addEntry(entry)
  }, [addEntry])

  const handleClearLog = useCallback(() => { setEntries([]); setTxCount(0); setRxCount(0); idCounter.current = 0 }, [])

  /* ── Export ── */
  const handleExport = useCallback((format: 'csv' | 'json') => {
    if (entries.length === 0) return
    let content: string; let filename: string
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    if (format === 'csv') {
      content = ['timestamp,direction,protocol,summary,data', ...entries.map((e) => `"${new Date(e.timestamp).toISOString()}","${e.direction}","${e.protocol}","${e.summary}","${e.data}"`)].join('\n')
      filename = `sakura-serial-log-${ts}.csv`
    } else {
      content = JSON.stringify(entries, null, 2)
      filename = `sakura-serial-log-${ts}.json`
    }
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }, [entries])

  /* ── Connection ── */
  const handleConnect = useCallback(async (config: TransportConfig) => {
    const isBle = config.type === 'ble'
    bleMode.current = isBle
    if (!isBle) await window.deviceApi.connect(config)
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
      setDeviceName(info.firmwareVersion || info.deviceName || 'Sakura Serial')
      setDeviceInfo({ firmwareVersion: info.firmwareVersion || 'unknown', supportedProtocols: info.supportedProtocols || [], transportType: config.type.toUpperCase(), vrefChannels: info.vrefChannels || {}, sramUsage: info.sramUsage || 0 })
      addEntry({ timestamp: Date.now(), direction: 'rx', protocol: 'SYS', summary: `Connected · FW: ${info.firmwareVersion} · Protocols: ${info.supportedProtocols.length}`, data: '' })
    } catch {
      setDeviceName('Sakura Serial')
      setDeviceInfo({ firmwareVersion: 'unknown', supportedProtocols: [], transportType: config.type.toUpperCase(), vrefChannels: {}, sramUsage: 0 })
      addEntry({ timestamp: Date.now(), direction: 'rx', protocol: 'SYS', summary: 'Connected', data: '' })
    }
  }, [addEntry])

  const handleDisconnect = useCallback(async () => {
    if (bleMode.current) {
      const bleSess = getBleSession(); if (bleSess) await bleSess.close().catch(() => {})
      bleMode.current = false
    } else {
      await window.deviceApi.disconnect()
    }
    setIsConnected(false); setDeviceName(''); setDeviceInfo(null); setConnectedAt(undefined)
    addEntry({ timestamp: Date.now(), direction: 'rx', protocol: 'SYS', summary: 'Disconnected', data: '' })
  }, [addEntry])

  return (
    <div className="app-container">
      {showParticles && <SakuraParticles />}

      {/* Title Bar */}
      <div className="title-bar">
        <div className="title-bar__left">
          <span className="title-bar__icon">🌸</span>
          <span className="title-bar__text">Sakura Serial</span>
        </div>
        <div className="title-bar__controls">
          <SettingsButton
            theme={theme} onSetTheme={(t) => { setTheme(t); saveStr('sakura-theme', t) }}
            showParticles={showParticles} showMascot={showMascot}
            onToggleParticles={(v) => { setShowParticles(v); saveBool('sakura-particles', v) }}
            onToggleMascot={(v) => { setShowMascot(v); saveBool('sakura-mascot', v) }}
          />
          <button className="title-bar__btn" onClick={() => window.deviceApi.minimizeWindow()}>─</button>
          <button className="title-bar__btn" onClick={() => window.deviceApi.maximizeWindow()}>□</button>
          <button className="title-bar__btn title-bar__btn--close" onClick={() => window.deviceApi.closeWindow()}>✕</button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Sidebar */}
        <div className="port-config-sidebar" ref={sidebarRef} style={{ width: sidebarWidth }}>
          <ConnectionManager
            isConnected={isConnected} deviceName={deviceName} deviceInfo={deviceInfo}
            onConnect={handleConnect} onDisconnect={handleDisconnect}
          />
        </div>
        <div className="sidebar-resize-handle" onMouseDown={onDragStart} />

        {/* Module Area */}
        <div className="terminal-panel">
          {/* Module Tabs */}
          <div className="protocol-tabs">
            {MODULES.map((mod) => (
              <button
                key={mod.key}
                className={`protocol-tab ${activeTab === mod.key ? 'protocol-tab--active' : ''}`}
                onClick={() => setActiveTab(mod.key)}
                title={mod.hint}
              >
                <span className="protocol-tab__icon">{mod.icon}</span>
                <span className="protocol-tab__label">{mod.label}</span>
              </button>
            ))}
          </div>

          {/* Active Module */}
          <div className="protocol-panel-area">
            <ErrorBoundary fallbackLabel="Dashboard crashed">
              {activeTab === 'dashboard' && (
                <DashboardPanel
                  isConnected={isConnected} deviceInfo={deviceInfo}
                  txCount={txCount} rxCount={rxCount} entryCount={entries.length}
                  connectedAt={connectedAt}
                />
              )}
            </ErrorBoundary>

            <ErrorBoundary fallbackLabel="UART crashed">
              {activeTab === 'uart' && (
                <UARTPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
              )}
            </ErrorBoundary>

            <ErrorBoundary fallbackLabel="Tools crashed">
              {activeTab === 'tools' && (
                <ToolsModule isConnected={isConnected} onTransaction={handleLogTransaction} />
              )}
            </ErrorBoundary>

            <ErrorBoundary fallbackLabel="Wireless crashed">
              {activeTab === 'wireless' && (
                <WirelessModule
                  isConnected={isConnected} deviceName={deviceName}
                  onConnect={handleConnect} onDisconnect={handleDisconnect}
                  onTransaction={handleLogTransaction}
                />
              )}
            </ErrorBoundary>

            <ErrorBoundary fallbackLabel="Script crashed">
              {activeTab === 'script' && (
                <ScriptPanel isConnected={isConnected} onTransaction={handleLogTransaction} />
              )}
            </ErrorBoundary>
          </div>

          {/* Transaction Log */}
          <TransactionLog
            entries={entries}
            showTimestamp={showTimestamp} autoScroll={autoScroll}
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
          {isConnected ? `Connected (${deviceName || 'Sakura Serial'})` : 'Disconnected'}
        </span>
        <span className="status-bar__spacer" />
        <span className="status-bar__stat">TX: {txCount}</span>
        <span className="status-bar__stat">RX: {rxCount}</span>
        {macroRecording && (
          <span className="status-bar__stat" style={{ color: 'var(--accent)' }}>⏺ REC {macroRecording.steps.length}</span>
        )}
        {isConnected && (
          <button
            className="status-bar__record-btn"
            onClick={() => {
              if (isRecording()) {
                const rec = stopRecording()
                if (rec && rec.steps.length > 0) {
                  setMacroRecording(rec)
                  navigator.clipboard.writeText(generateScript(rec)).catch(() => {})
                  setActiveTab('script')
                }
              } else { startRecording(); setMacroRecording(null) }
            }}
            style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11, background: isRecording() ? 'var(--accent)' : 'transparent', color: isRecording() ? '#fff' : 'var(--text-muted)', border: '1px solid ' + (isRecording() ? 'var(--accent)' : 'var(--border-color)'), borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
          >
            {isRecording() ? '⏹ Stop' : '⏺ Record'}
          </button>
        )}
      </div>

      {/* Mascot */}
      {showMascot && <Mascot isConnected={isConnected} sidebarWidth={sidebarWidth} onDismiss={() => { setShowMascot(false); saveBool('sakura-mascot', false) }} />}
    </div>
  )
}
