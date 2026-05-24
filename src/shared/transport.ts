/**
 * probe-station 传输抽象层
 *
 * 定义设备连接/发现的接口和类型。
 * 具体实现在 main process（Node.js 原生模块）。
 * Renderer 通过 preload IPC 桥接获得代理。
 */

import { FrameParser, frameBuild, type ParsedFrame } from './frame-codec'
import {
  CMD_PING,
  CMD_GET_INFO,
  RESP_ACK,
  RESP_NAK,
  ASYNC_EVENT,
  ERR_TIMEOUT,
} from './commands'

/* ═══════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════ */

export type ConnectionType = 'usb' | 'wifi' | 'ble'

export interface DeviceInfo {
  /** Unique device identifier */
  id: string
  /** Connection type */
  type: ConnectionType
  /** Human-readable name */
  name: string
  /** Transport-specific path/address */
  path: string
  /** Additional metadata */
  manufacturer?: string
  serialNumber?: string
  /** WiFi: IP address; BLE: RSSI */
  rssi?: number
  /** USB: COM port path; WiFi: IP:port; BLE: device ID */
  detail?: string
}

export interface TransportConfig {
  type: ConnectionType
  path: string
  /** USB: baud rate (default 921600 for USB CDC) */
  baudRate?: number
  /** TCP: host; USB: port path */
  host?: string
  /** TCP: port number */
  port?: number
}

/* ═══════════════════════════════════════════════════
   Transport Interface
   ═══════════════════════════════════════════════════ */

export interface Transport {
  readonly type: ConnectionType
  readonly isOpen: boolean

  open(config: TransportConfig): Promise<void>
  close(): Promise<void>
  send(data: Uint8Array): Promise<void>

  /** Register data callback (raw bytes received) */
  onData(cb: (data: Uint8Array) => void): void
  /** Register error callback */
  onError(cb: (err: Error) => void): void
  /** Register close callback */
  onClose(cb: () => void): void

  /** Remove all listeners */
  removeAllListeners(): void
}

/* ═══════════════════════════════════════════════════
   Pending Request
   ═══════════════════════════════════════════════════ */

interface PendingRequest {
  seq: number
  resolve: (frame: ParsedFrame) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  retries: number
  cmdType: number
  payload: Uint8Array
}

/* ═══════════════════════════════════════════════════
   Session
   ═══════════════════════════════════════════════════ */

export interface SessionOptions {
  /** Request timeout in ms (default 1000) */
  timeout?: number
  /** Max retries on timeout/CRC error (default 3) */
  maxRetries?: number
  /** Auto-ping interval in ms (0 = disabled, default 5000) */
  pingInterval?: number
}

export interface DeviceSysInfo {
  firmwareVersion: string
  supportedProtocols: number[]
  vrefChannels: Record<number, number>
  sramUsage: number
  deviceName: string
}

/**
 * Session wraps a Transport with FrameParser and request/response matching.
 * Provides high-level sendCommand() API with automatic seq numbering,
 * timeout, retry, and async event dispatch.
 */
export class Session {
  readonly transport: Transport
  private parser = new FrameParser()
  private seq = 0
  private pending = new Map<number, PendingRequest>()
  private options: Required<SessionOptions>
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private closed = false

  // Callbacks
  private asyncListeners: Array<(type: number, payload: Uint8Array) => void> = []
  private closeListeners: Array<() => void> = []
  private errorListeners: Array<(err: Error) => void> = []

  constructor(transport: Transport, options: SessionOptions = {}) {
    this.transport = transport
    this.options = {
      timeout: options.timeout ?? 1000,
      maxRetries: options.maxRetries ?? 3,
      pingInterval: options.pingInterval ?? 5000,
    }

    this.transport.onData((data) => this.handleData(data))
    this.transport.onClose(() => this.handleClose())
    this.transport.onError((err) => this.handleError(err))
  }

  get isOpen(): boolean {
    return this.transport.isOpen && !this.closed
  }

  /* ── Lifecycle ──────────────────────────────────── */

  async open(config: TransportConfig): Promise<void> {
    this.closed = false
    await this.transport.open(config)
    if (this.options.pingInterval > 0) {
      this.startPing()
    }
  }

  async close(): Promise<void> {
    this.closed = true
    this.stopPing()
    // Reject all pending requests
    for (const [, req] of this.pending) {
      clearTimeout(req.timer)
      req.reject(new Error('Session closed'))
    }
    this.pending.clear()
    await this.transport.close()
  }

  /* ── Send Command ───────────────────────────────── */

  /**
   * Send a command frame and wait for the response.
   * Automatically assigns sequence number, handles retries.
   *
   * Returns the response frame (type + payload).
   * RESP_ACK payload contains command result data.
   * RESP_NAK payload contains [errorCode(2B) | errorMsg(var)].
   */
  async sendCommand(type: number, payload: Uint8Array = new Uint8Array(0)): Promise<ParsedFrame> {
    if (!this.isOpen) throw new Error('Session not open')

    const seq = (this.seq++) & 0xff
    return this.sendWithRetry(type, seq, payload, 0)
  }

  private async sendWithRetry(
    type: number,
    seq: number,
    payload: Uint8Array,
    attempt: number
  ): Promise<ParsedFrame> {
    const frame = frameBuild(type, seq, payload)

    return new Promise<ParsedFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq)
        if (attempt < this.options.maxRetries) {
          this.sendWithRetry(type, seq, payload, attempt + 1).then(resolve, reject)
        } else {
          reject(new Error(`Command 0x${type.toString(16)} timeout after ${attempt + 1} attempts`))
        }
      }, this.options.timeout)

      this.pending.set(seq, { seq, resolve, reject, timer, retries: attempt, cmdType: type, payload })

      this.transport.send(frame).catch((err) => {
        clearTimeout(timer)
        this.pending.delete(seq)
        reject(err)
      })
    })
  }

  /* ── Async Events ───────────────────────────────── */

  onAsyncEvent(cb: (type: number, payload: Uint8Array) => void): () => void {
    this.asyncListeners.push(cb)
    return () => {
      this.asyncListeners = this.asyncListeners.filter((l) => l !== cb)
    }
  }

  onSessionClose(cb: () => void): () => void {
    this.closeListeners.push(cb)
    return () => {
      this.closeListeners = this.closeListeners.filter((l) => l !== cb)
    }
  }

  onSessionError(cb: (err: Error) => void): () => void {
    this.errorListeners.push(cb)
    return () => {
      this.errorListeners = this.errorListeners.filter((l) => l !== cb)
    }
  }

  /* ── Convenience: System Commands ───────────────── */

  async ping(): Promise<boolean> {
    try {
      await this.sendCommand(CMD_PING)
      return true
    } catch {
      return false
    }
  }

  async getDeviceInfo(): Promise<DeviceSysInfo> {
    const resp = await this.sendCommand(CMD_GET_INFO)
    // Payload format:
    //   [fwVerLen(1B)][fwVer(N)] [protoCount(1B)][proto(N)]
    //   [nameLen(1B)][deviceName(N)] [vrefCount(1B)][ch(1B)|mV(2B)]...
    //   [sramHi(1B)][sramLo(1B)]
    const view = new DataView(resp.payload.buffer, resp.payload.byteOffset, resp.payload.byteLength)
    let off = 0
    const fwLen = view.getUint8(off++)
    const fw = new TextDecoder().decode(resp.payload.subarray(off, off + fwLen))
    off += fwLen
    const protoCount = view.getUint8(off++)
    const protos: number[] = []
    for (let i = 0; i < protoCount; i++) {
      protos.push(view.getUint8(off++))
    }
    // Device name
    let deviceName = ''
    if (off < resp.payload.length) {
      const nameLen = view.getUint8(off++)
      deviceName = new TextDecoder().decode(resp.payload.subarray(off, off + nameLen))
      off += nameLen
    }
    // VRef channels
    const vrefChannels: Record<number, number> = {}
    if (off < resp.payload.length) {
      const vrefCount = view.getUint8(off++)
      for (let i = 0; i < vrefCount && off + 2 < resp.payload.length; i++) {
        const ch = view.getUint8(off++)
        const mV = (view.getUint8(off) << 8) | view.getUint8(off + 1)
        off += 2
        vrefChannels[ch] = mV
      }
    }
    // SRAM usage
    let sramUsage = 0
    if (off + 1 < resp.payload.length) {
      sramUsage = (view.getUint8(off) << 8) | view.getUint8(off + 1)
    }
    return { firmwareVersion: fw, supportedProtocols: protos, vrefChannels, sramUsage, deviceName }
  }

  /* ── Internals ──────────────────────────────────── */

  private handleData(data: Uint8Array): void {
    const frames = this.parser.feedMany(data)
    for (const frame of frames) {
      if (frame.type === ASYNC_EVENT) {
        // Async event — dispatch to listeners
        const eventType = frame.payload.length > 0 ? frame.payload[0] : 0
        const eventData = frame.payload.length > 1 ? frame.payload.subarray(1) : new Uint8Array(0)
        for (const cb of this.asyncListeners) {
          try { cb(eventType, eventData) } catch { /* ignore */ }
        }
        continue
      }

      // Response to a pending request
      const pending = this.pending.get(frame.seq)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(frame.seq)
        pending.resolve(frame)
      }
    }
  }

  private handleClose(): void {
    this.closed = true
    this.stopPing()
    for (const cb of this.closeListeners) {
      try { cb() } catch { /* ignore */ }
    }
  }

  private handleError(err: Error): void {
    for (const cb of this.errorListeners) {
      try { cb(err) } catch { /* ignore */ }
    }
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.ping().catch(() => { /* ignore ping failures */ })
    }, this.options.pingInterval)
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }
}
