/**
 * Tools Module — Universal Protocol Debugger
 * Sub-tabs: I²C · SPI · CAN · 1-Wire · GPIO · LA
 */

import { useState } from 'react'
import ErrorBoundary from './ErrorBoundary'
import I2CPanel from './I2CPanel'
import SPIPanel from './SPIPanel'
import CANPanel from './CANPanel'
import OneWirePanel from './OneWirePanel'
import GPIOPanel from './GPIOPanel'
import LAPanel from './LAPanel'

interface Props {
  isConnected: boolean
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

type ToolTab = 'i2c' | 'spi' | 'can' | 'onewire' | 'gpio' | 'la'

const TOOLS = [
  { key: 'i2c' as ToolTab, label: 'I²C', icon: '🔌', hint: 'Bus scan, R/W' },
  { key: 'spi' as ToolTab, label: 'SPI', icon: '⚡', hint: 'Multi-mode transfer' },
  { key: 'can' as ToolTab, label: 'CAN', icon: '🚗', hint: 'Frame send + monitor' },
  { key: 'onewire' as ToolTab, label: '1-Wire', icon: '🌡', hint: 'ROM search, R/W' },
  { key: 'gpio' as ToolTab, label: 'GPIO', icon: '🔌', hint: 'In/Out/PWM' },
  { key: 'la' as ToolTab, label: 'LA', icon: '📈', hint: '8ch capture' },
]

export default function ToolsModule({ isConnected, onTransaction }: Props) {
  const [tab, setTab] = useState<ToolTab>('i2c')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', padding: '0 8px', flexShrink: 0 }}>
        {TOOLS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--accent)' : 'var(--text-dim)',
              background: tab === t.key ? 'var(--bg-surface-hover)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              transition: 'color 0.15s',
            }}
          >
            <span style={{ marginRight: 4 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <ErrorBoundary fallbackLabel={`${tab.toUpperCase()} panel crashed`}>
          {tab === 'i2c' && <I2CPanel isConnected={isConnected} onTransaction={onTransaction} />}
          {tab === 'spi' && <SPIPanel isConnected={isConnected} onTransaction={onTransaction} />}
          {tab === 'can' && <CANPanel isConnected={isConnected} onTransaction={onTransaction} />}
          {tab === 'onewire' && <OneWirePanel isConnected={isConnected} onTransaction={onTransaction} />}
          {tab === 'gpio' && <GPIOPanel isConnected={isConnected} onTransaction={onTransaction} />}
          {tab === 'la' && <LAPanel isConnected={isConnected} onTransaction={onTransaction} />}
        </ErrorBoundary>
      </div>
    </div>
  )
}
