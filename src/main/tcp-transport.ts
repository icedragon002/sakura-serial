/**
 * TCP/WiFi 传输实现 (基于 Node.js net 模块)
 *
 * probe-station 设备 WiFi 连接走 TCP socket，
 * ESP32-S3 在端口 7777 上监听 TCP 命令连接。
 */

import * as net from 'net'
import type { Transport, TransportConfig } from '../shared/transport'

export class TcpTransport implements Transport {
  readonly type = 'wifi' as const
  private socket: net.Socket | null = null
  private _isOpen = false
  private dataCbs: Array<(data: Uint8Array) => void> = []
  private errorCbs: Array<(err: Error) => void> = []
  private closeCbs: Array<() => void> = []

  get isOpen(): boolean {
    return this._isOpen
  }

  async open(config: TransportConfig): Promise<void> {
    if (this._isOpen) await this.close()

    const host = config.host ?? config.path
    const port = config.port ?? 7777

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()

      const onError = (err: Error) => {
        reject(err)
      }

      this.socket.once('error', onError)
      this.socket.once('connect', () => {
        this.socket!.removeListener('error', onError)
        this._isOpen = true

        this.socket!.on('data', (data: Buffer) => {
          const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          for (const cb of this.dataCbs) {
            try { cb(bytes) } catch { /* ignore */ }
          }
        })

        this.socket!.on('error', (err: Error) => {
          for (const cb of this.errorCbs) {
            try { cb(err) } catch { /* ignore */ }
          }
        })

        this.socket!.on('close', () => {
          this._isOpen = false
          for (const cb of this.closeCbs) {
            try { cb() } catch { /* ignore */ }
          }
        })

        resolve()
      })

      this.socket.connect(port, host)
    })
  }

  async close(): Promise<void> {
    if (!this.socket) return
    return new Promise((resolve) => {
      this.socket!.on('close', () => {
        this._isOpen = false
        resolve()
      })
      this.socket!.destroy()
      this.socket = null
    })
  }

  async send(data: Uint8Array): Promise<void> {
    if (!this.socket || !this._isOpen) throw new Error('Socket not connected')

    return new Promise((resolve, reject) => {
      this.socket!.write(Buffer.from(data), (err) => {
        if (err) reject(err)
        else resolve()
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
    if (this.socket) {
      this.socket.removeAllListeners()
    }
  }
}
