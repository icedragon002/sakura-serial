/**
 * Wireless Module — WiFi & BLE Debugging
 * Sub-tabs: WiFi (mDNS scan, TCP connect) · BLE (scan, GATT browser)
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import ErrorBoundary from './ErrorBoundary'
import BLEPanel from './BLEPanel'
import type { DeviceInfo, TransportConfig } from '../../../shared/transport'

interface Props {
  isConnected: boolean
  deviceName: string
  onConnect: (config: TransportConfig) => Promise<void>
  onDisconnect: () => Promise<void>
  onTransaction: (entry: {
    timestamp: number; direction: 'tx' | 'rx'; protocol: string
    summary: string; data: string
  }) => void
}

type WireTab = 'wifi' | 'ble'

export default function WirelessModule({ isConnected, deviceName, onConnect, onDisconnect, onTransaction }: Props) {
  const [tab, setTab] = useState<WireTab>('wifi')
  const [wifiHost, setWifiHost] = useState('')
  const [wifiPort, setWifiPort] = useState('7777')
  const [connecting, setConnecting] = useState(false)
  const [mdnsDevices, setMdnsDevices] = useState<DeviceInfo[]>([])

  const addTx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'tx', protocol: 'WiFi', summary: s, data: d })
  const addRx = (s: string, d: string) =>
    onTransaction({ timestamp: Date.now(), direction: 'rx', protocol: 'WiFi', summary: s, data: d })

  /* ── Poll mDNS devices ── */
  useEffect(() => {
    const poll = () => {
      window.deviceApi.listDevices().then((list) => {
        setMdnsDevices(list.filter((d) => d.type === 'wifi'))
      }).catch(() => {})
    }
    poll()
    const timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [])

  const handleWifiConnect = useCallback(async () => {
    if (!wifiHost) return
    setConnecting(true)
    addTx(`Connect: ${wifiHost}:${wifiPort}`, '')
    try {
      await onConnect({
        type: 'wifi',
        path: `${wifiHost}:${wifiPort}`,
        host: wifiHost,
        port: parseInt(wifiPort) || 7777,
      })
      addRx('WiFi connected', `${wifiHost}:${wifiPort}`)
    } catch (err: any) {
      addRx('WiFi error: ' + err.message, '')
    } finally {
      setConnecting(false)
    }
  }, [wifiHost, wifiPort, onConnect, addTx, addRx])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border-color)', padding: '0 8px', flexShrink: 0 }}>
        {[
          { key: 'wifi' as WireTab, label: 'WiFi', icon: '📡', hint: 'TCP + mDNS' },
          { key: 'ble' as WireTab, label: 'BLE', icon: '📶', hint: 'Scanner + GATT' },
        ].map((t) => (
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
            }}
          >
            <span style={{ marginRight: 4 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'wifi' && (
          <div className="protocol-panel">
            <div className="pp-header">
              <span className="pp-icon">📡</span>
              <span className="pp-title">WiFi Transport</span>
            </div>

            {/* mDNS Discovered */}
            {mdnsDevices.length > 0 && (
              <div className="pp-field">
                <label>Discovered ({mdnsDevices.length})</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {mdnsDevices.map((d) => (
                    <button
                      key={d.id}
                      className="pp-chip"
                      onClick={() => {
                        const [host, port] = d.detail?.split(':') || [d.path, '7777']
                        setWifiHost(host)
                        setWifiPort(port || '7777')
                      }}
                      style={{ fontSize: 11 }}
                    >
                      {d.name} ({d.detail || d.path})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual connect */}
            <div className="pp-row">
              <div className="pp-field" style={{ flex: 1 }}>
                <label>Host</label>
                <input
                  value={wifiHost}
                  onChange={(e) => setWifiHost(e.target.value)}
                  placeholder="192.168.1.100"
                  spellCheck={false}
                />
              </div>
              <div className="pp-field" style={{ width: 90 }}>
                <label>Port</label>
                <input
                  value={wifiPort}
                  onChange={(e) => setWifiPort(e.target.value.replace(/\D/g, ''))}
                  placeholder="7777"
                  spellCheck={false}
                />
              </div>
              <div className="pp-field" style={{ alignSelf: 'flex-end' }}>
                {isConnected ? (
                  <button className="pp-btn" onClick={onDisconnect}>
                    Disconnect ({deviceName})
                  </button>
                ) : (
                  <button className="pp-btn pp-btn--read" onClick={handleWifiConnect} disabled={connecting || !wifiHost}>
                    {connecting ? 'Connecting…' : 'Connect'}
                  </button>
                )}
              </div>
            </div>

            <div className="pp-placeholder" style={{ marginTop: 16 }}>
              probe-station devices advertise via mDNS as <code>_probestation._tcp.local</code>.
              Connect over WiFi to use any protocol (I²C/SPI/UART/CAN/etc.) remotely.
            </div>
          </div>
        )}

        {tab === 'ble' && (
          <ErrorBoundary fallbackLabel="BLE panel crashed">
            <BLEPanel isConnected={isConnected} onTransaction={onTransaction} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}
