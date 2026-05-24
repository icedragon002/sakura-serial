import { useState, useEffect, useCallback } from 'react'
import type { DeviceInfo, TransportConfig } from '../../../shared/transport'
import { BleTransport } from '../ble-transport'

interface Props {
  isConnected: boolean
  deviceName: string
  deviceInfo?: {
    firmwareVersion: string
    supportedProtocols: number[]
    transportType: string
  } | null
  onConnect: (config: TransportConfig) => Promise<void>
  onDisconnect: () => Promise<void>
}

export default function ConnectionManager({
  isConnected,
  deviceName,
  deviceInfo,
  onConnect,
  onDisconnect,
}: Props) {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [selectedPath, setSelectedPath] = useState('')
  const [connType, setConnType] = useState<'usb' | 'wifi' | 'ble'>('usb')
  const [wifiHost, setWifiHost] = useState('')
  const [connecting, setConnecting] = useState(false)

  const refreshDevices = useCallback(async () => {
    try {
      const list = await window.deviceApi.listDevices()
      setDevices(list)
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    refreshDevices()
    const interval = setInterval(refreshDevices, 3000)
    return () => clearInterval(interval)
  }, [refreshDevices])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    try {
      if (connType === 'ble') {
        // BLE handled directly in renderer via Web Bluetooth
        try {
          const transport = new BleTransport()
          await transport.open({ type: 'ble', path: '' })
          // For now, BLE just opens the transport — full Session integration TBD
          await transport.close()
        } catch (err: any) {
          console.error('BLE connection failed:', err)
        }
        setConnecting(false)
        return
      }

      const config: TransportConfig =
        connType === 'usb'
          ? { type: 'usb', path: selectedPath }
          : { type: 'wifi', path: wifiHost, host: wifiHost }
      await onConnect(config)
    } catch (err: any) {
      console.error('Connection failed:', err)
    } finally {
      setConnecting(false)
    }
  }, [connType, selectedPath, wifiHost, onConnect])

  const handleDisconnect = useCallback(async () => {
    await onDisconnect()
  }, [onDisconnect])

  return (
    <div className="connection-manager">
      <div className="cm-header">
        <div className={`cm-status ${isConnected ? 'cm-status--connected' : ''}`} />
        <span className="cm-title">
          {isConnected ? deviceName || 'Connected' : 'Disconnected'}
        </span>
      </div>

      {!isConnected && (
        <>
          {/* Transport type tabs */}
          <div className="cm-tabs">
            <button
              className={`cm-tab ${connType === 'usb' ? 'cm-tab--active' : ''}`}
              onClick={() => setConnType('usb')}
            >
              USB
            </button>
            <button
              className={`cm-tab ${connType === 'wifi' ? 'cm-tab--active' : ''}`}
              onClick={() => setConnType('wifi')}
            >
              WiFi
            </button>
            <button
              className={`cm-tab ${connType === 'ble' ? 'cm-tab--active' : ''}`}
              onClick={() => setConnType('ble')}
            >
              BLE
            </button>
          </div>

          {connType === 'ble' ? (
            <div className="cm-section">
              <div className="cm-label">Web Bluetooth</div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Opens browser Bluetooth picker to scan for nearby probe-station devices.
                Make sure your device is advertising as "ProtoDebug".
              </p>
            </div>
          ) : connType === 'usb' ? (
            <>
              <div className="cm-section">
                <div className="cm-label">Serial Ports</div>
                <select
                  className="cm-select"
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                >
                  <option value="">— Select port —</option>
                  {devices
                    .filter((d) => d.type === 'usb')
                    .map((d) => (
                      <option key={d.id} value={d.path}>
                        {d.name} ({d.path})
                      </option>
                    ))}
                </select>
                <button className="cm-refresh" onClick={refreshDevices}>
                  ↻ Refresh
                </button>
              </div>
            </>
          ) : (
            <div className="cm-section">
              <div className="cm-label">Host:Port</div>
              <input
                className="cm-input"
                value={wifiHost}
                onChange={(e) => setWifiHost(e.target.value)}
                placeholder="192.168.1.100:7777"
                spellCheck={false}
              />
            </div>
          )}

          <button
            className="cm-connect-btn"
            onClick={handleConnect}
            disabled={connecting || (connType === 'usb' ? !selectedPath : connType === 'ble' ? false : !wifiHost)}
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </>
      )}

      {isConnected && (
        <button className="cm-disconnect-btn" onClick={handleDisconnect}>
          Disconnect
        </button>
      )}

      {/* Device info (when connected) */}
      {isConnected && (
        <div className="cm-info">
          <div className="cm-info-row">
            <span>Transport</span>
            <span>{deviceInfo?.transportType ?? 'USB CDC'}</span>
          </div>
          {deviceInfo?.firmwareVersion && (
            <div className="cm-info-row">
              <span>Firmware</span>
              <span>{deviceInfo.firmwareVersion}</span>
            </div>
          )}
          {deviceInfo?.supportedProtocols && deviceInfo.supportedProtocols.length > 0 && (
            <div className="cm-info-row">
              <span>Protocols</span>
              <span>{deviceInfo.supportedProtocols.length} supported</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
