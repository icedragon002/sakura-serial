/**
 * BLE 传输实现 (Web Bluetooth API)
 *
 * 使用 Electron 的 Web Bluetooth 支持 (Chromium 内核)，
 * 扫描并连接 probe-station BLE UART Service (NUS)。
 *
 * Nordic UART Service:
 *   - Service UUID:     0x6E40
 *   - RX Characteristic: 0x6E42 (PC → device, write)
 *   - TX Characteristic: 0x6E43 (device → PC, notify)
 *
 * 注意: 需要 Electron 28+ 且启用 experimental-web-bluetooth flag，
 *       或使用 @abandonware/noble (Node.js BLE 库)。
 */

import type { Transport, TransportConfig } from '../../shared/transport'

/* BLE UUIDs (16-bit → 128-bit conversion) */
const NUS_SERVICE_UUID    = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_RX_CHAR_UUID    = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_TX_CHAR_UUID    = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

export class BleTransport implements Transport {
  readonly type = 'ble' as const
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private txChar: BluetoothRemoteGATTCharacteristic | null = null
  private rxChar: BluetoothRemoteGATTCharacteristic | null = null
  private _isOpen = false

  private dataCbs: Array<(data: Uint8Array) => void> = []
  private errorCbs: Array<(err: Error) => void> = []
  private closeCbs: Array<() => void> = []

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(config: TransportConfig): Promise<void> {
    if (this._isOpen) await this.close()

    // Check Web Bluetooth availability
    if (!(navigator as any).bluetooth) {
      throw new Error('Web Bluetooth not available. Use Chrome/Edge or enable experimental-web-bluetooth in Electron.')
    }

    try {
      // Request device with NUS service filter
      this.device = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { services: [NUS_SERVICE_UUID] },
          { namePrefix: 'ProtoDebug' },
        ],
        optionalServices: [NUS_SERVICE_UUID],
      })

      this.device.addEventListener('gattserverdisconnected', () => {
        this._isOpen = false
        this.device = null
        this.server = null
        for (const cb of this.closeCbs) {
          try { cb() } catch { /* ignore */ }
        }
      })

      // Connect to GATT server
      this.server = await this.device.gatt!.connect()
      const service = await this.server.getPrimaryService(NUS_SERVICE_UUID)

      // Get characteristics
      this.txChar = await service.getCharacteristic(NUS_TX_CHAR_UUID)
      this.rxChar = await service.getCharacteristic(NUS_RX_CHAR_UUID)

      // Subscribe to TX notifications (device → PC)
      await this.txChar.startNotifications()
      this.txChar.addEventListener('characteristicvaluechanged', (event: Event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value
        if (value) {
          const bytes = new Uint8Array(value.buffer)
          for (const cb of this.dataCbs) {
            try { cb(bytes) } catch { /* ignore */ }
          }
        }
      })

      this._isOpen = true
    } catch (err) {
      this.device = null
      this.server = null
      throw err
    }
  }

  async close(): Promise<void> {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect()
    }
    this.device = null
    this.server = null
    this.txChar = null
    this.rxChar = null
    this._isOpen = false
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.rxChar) throw new Error('BLE not connected')

    // BLE characteristic write is limited to MTU size (~20-512 bytes)
    // for larger payloads, split into chunks
    const mtu = 20 // safe default
    for (let i = 0; i < data.length; i += mtu) {
      const chunk = data.subarray(i, Math.min(i + mtu, data.length))
      await this.rxChar.writeValueWithoutResponse(chunk)
    }
  }

  onData(cb: (data: Uint8Array) => void): void {
    this.dataCbs.push(cb)
  }

  onError(cb: (err: Error) => void): void {
    this.errorCbs.push(cb)
  }

  onClose(cb: () => void): void {
    this.closeCbs.push(cb)
  }

  removeAllListeners(): void {
    this.dataCbs = []
    this.errorCbs = []
    this.closeCbs = []
  }
}

/** List available BLE devices (Web Bluetooth scan) */
export async function listBleDevices(): Promise<Array<{ id: string; name: string; rssi?: number }>> {
  // Web Bluetooth doesn't support passive scanning without user gesture.
  // The requestDevice() call shows a browser picker dialog.
  // For passive scanning, @abandonware/noble is required.
  return []
}
