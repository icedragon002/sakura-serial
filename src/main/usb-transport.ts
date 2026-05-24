/**
 * USB CDC 传输实现 (基于 serialport 库)
 *
 * probe-station 设备通过 USB CDC ACM 枚举为串口。
 * 默认波特率 921600，8N1。
 */

import { SerialPort } from 'serialport'
import type { Transport, TransportConfig } from '../shared/transport'

export class UsbTransport implements Transport {
  readonly type = 'usb' as const
  private port: SerialPort | null = null
  private _isOpen = false
  private dataCbs: Array<(data: Uint8Array) => void> = []
  private errorCbs: Array<(err: Error) => void> = []
  private closeCbs: Array<() => void> = []

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(config: TransportConfig): Promise<void> {
    if (this._isOpen) await this.close()

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: config.path,
        baudRate: config.baudRate ?? 921600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false,
      })

      this.port.open((err) => {
        if (err) {
          this.port = null
          reject(err)
          return
        }

        this._isOpen = true

        this.port!.on('data', (data: Buffer) => {
          const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          for (const cb of this.dataCbs) {
            try { cb(bytes) } catch { /* ignore */ }
          }
        })

        this.port!.on('error', (err: Error) => {
          for (const cb of this.errorCbs) {
            try { cb(err) } catch { /* ignore */ }
          }
        })

        this.port!.on('close', () => {
          this._isOpen = false
          for (const cb of this.closeCbs) {
            try { cb() } catch { /* ignore */ }
          }
        })

        resolve()
      })
    })
  }

  async close(): Promise<void> {
    if (!this.port) return
    return new Promise((resolve) => {
      this.port!.close(() => {
        this.port = null
        this._isOpen = false
        resolve()
      })
    })
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.port || !this._isOpen) throw new Error('Port not open')

    return new Promise((resolve, reject) => {
      this.port!.write(Buffer.from(data), (err) => {
        if (err) {
          reject(err)
        } else {
          this.port!.drain((drainErr) => {
            if (drainErr) reject(drainErr)
            else resolve()
          })
        }
      })
    })
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
    if (this.port) {
      this.port.removeAllListeners()
    }
  }
}

/** List available USB CDC devices (serial ports) */
export async function listUsbDevices(): Promise<Array<{ path: string; manufacturer: string; serialNumber: string; pnpId: string; vendorId: string; productId: string }>> {
  const ports = await SerialPort.list()
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer || '',
    serialNumber: p.serialNumber || '',
    pnpId: p.pnpId || '',
    vendorId: p.vendorId || '',
    productId: p.productId || '',
  }))
}
