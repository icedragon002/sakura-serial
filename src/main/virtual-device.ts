/**
 * Sakura Serial — Virtual Device Simulator
 *
 * 模拟 probe-station 硬件，响应所有协议命令，返回逼真数据。
 * 无需真实硬件即可测试全部面板、Script 引擎、宏录制。
 *
 * 实现 Transport 接口，直接注入 Session，全协议覆盖：
 *   System · I²C · SPI · UART · CAN · 1-Wire · GPIO · LA
 */

import type { Transport, TransportConfig } from '../shared/transport'
import {
  CMD_PING, CMD_GET_INFO, CMD_RESET_RP2350, CMD_SET_VREF, CMD_GET_VREF,
  CMD_ENTER_BOOT, CMD_ENTER_RP2350_BOOT, CMD_ASYNC_ENABLE, CMD_ASYNC_DISABLE,
  CMD_I2C_SCAN, CMD_I2C_READ, CMD_I2C_WRITE, CMD_I2C_WRITE_READ,
  CMD_SPI_TRANSFER, CMD_SPI_CS_CTRL,
  CMD_UART_CFG, CMD_UART_WRITE, CMD_UART_READ, CMD_UART_BREAK,
  CMD_CAN_CFG, CMD_CAN_SEND, CMD_CAN_FILTER, CMD_CAN_MONITOR,
  CMD_OW_RESET, CMD_OW_SEARCH, CMD_OW_READ, CMD_OW_WRITE,
  CMD_GPIO_CFG, CMD_GPIO_WRITE, CMD_GPIO_READ, CMD_GPIO_PWM,
  CMD_LA_CFG, CMD_LA_START, CMD_LA_STOP, CMD_LA_DATA, CMD_LA_STATUS, CMD_LA_STREAM_MODE,
  RESP_ACK, ASYNC_EVENT, CMD_BATCH,
  EVENT_CAN_FRAME_RX, EVENT_GPIO_CHANGE, EVENT_UART_DATA,
} from '../shared/commands'
import { frameBuild, type ParsedFrame } from '../shared/frame-codec'

/* ═══════════════════════════════════════════════════
   Virtual Transport
   ═══════════════════════════════════════════════════ */

export class VirtualTransport implements Transport {
  readonly type = 'usb' as const
  private _isOpen = false
  private dataCbs: Array<(data: Uint8Array) => void> = []
  private errorCbs: Array<(err: Error) => void> = []
  private closeCbs: Array<() => void> = []
  private canMonitorActive = false
  private canTimer: ReturnType<typeof setInterval> | null = null

  // Simulated device state
  private gpioState: number[] = Array(8).fill(0)
  private gpioMode: number[] = Array(8).fill(0)
  private i2cDevices = [0x50, 0x68, 0x76] // EEPROM, MPU6050, BME280
  private owRoms = [[0x28, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x00]]
  private uartCfg = { baud: 115200, data: 8, parity: 0, stop: 1 }
  private laArmed = false
  private laConfig = { channels: 0xFF, rate: 1000, triggerMask: 0, triggerVal: 0 }

  get isOpen(): boolean { return this._isOpen }

  async open(_config: TransportConfig): Promise<void> {
    this._isOpen = true
  }

  async close(): Promise<void> {
    this._isOpen = false
    this.stopCanMonitor()
    for (const cb of this.closeCbs) { try { cb() } catch { /* */ } }
  }

  async send(rawFrame: Uint8Array): Promise<void> {
    if (!this._isOpen) throw new Error('Not connected')

    // Parse the raw frame (skip SLIP encoding for simplicity — we simulate at command level)
    // The frame format: [SYNC(1)] [SLIP-encoded body]
    // For virtual device, we decode the SLIP layer manually
    let payload: Uint8Array
    let cmdType: number
    let seq: number

    try {
      // Simple SLIP decode (strip SYNC, unescape)
      const decoded: number[] = []
      let escaping = false
      for (let i = 1; i < rawFrame.length; i++) {
        const b = rawFrame[i]
        if (escaping) {
          if (b === 0x01) decoded.push(0xa5)
          else if (b === 0x02) decoded.push(0xa6)
          escaping = false
        } else if (b === 0xa6) {
          escaping = true
        } else {
          decoded.push(b)
        }
      }

      if (decoded.length < 4) return
      const plen = (decoded[0] << 8) | decoded[1]
      cmdType = decoded[2]
      seq = decoded[3]
      payload = new Uint8Array(decoded.slice(4, 4 + plen))
    } catch {
      return // Ignore parse errors
    }

    // Build response
    const respData = this.handleCommand(cmdType, payload)

    // Build ACK frame
    const respFrame = frameBuild(RESP_ACK, seq, new Uint8Array(respData))

    // Simulate small delay then deliver response
    setTimeout(() => {
      for (const cb of this.dataCbs) {
        try { cb(respFrame) } catch { /* */ }
      }
    }, 10 + Math.random() * 30)
  }

  onData(cb: (data: Uint8Array) => void): void { this.dataCbs.push(cb) }
  onError(cb: (err: Error) => void): void { this.errorCbs.push(cb) }
  onClose(cb: () => void): void { this.closeCbs.push(cb) }
  removeAllListeners(): void { this.dataCbs = []; this.errorCbs = []; this.closeCbs = [] }

  /* ═══════════════════════════════════════════════════
     Command Handler
     ═══════════════════════════════════════════════════ */

  private handleCommand(type: number, payload: Uint8Array): number[] {
    switch (type) {
      /* ── System ────────────────────────── */
      case CMD_PING:
        return []

      case CMD_GET_INFO: {
        const fw = 'SakuraFW v2.0 (sim)'
        const protos = [0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]
        const name = 'Virtual Probe'
        const nameBytes = [...new TextEncoder().encode(name)]
        // [fwLen(1)][fw(N)][protoCount(1)][proto(N)][nameLen(1)][name(N)][vrefCount(1)][ch(1)][mV(2)][sram(2)]
        const result = [fw.length, ...new TextEncoder().encode(fw), protos.length, ...protos]
        result.push(nameBytes.length, ...nameBytes)
        result.push(2, 0, 3, (3300 >> 8) & 0xff, 3300 & 0xff, 1, 5, (5000 >> 8) & 0xff, 5000 & 0xff)
        result.push((128 >> 8) & 0xff, 128 & 0xff) // SRAM 128KB
        return result
      }

      case CMD_RESET_RP2350: return [1] // OK
      case CMD_SET_VREF: return []
      case CMD_GET_VREF: return [0, (3300 >> 8) & 0xff, 3300 & 0xff]
      case CMD_ENTER_BOOT: return []
      case CMD_ENTER_RP2350_BOOT: return []
      case CMD_ASYNC_ENABLE: return []
      case CMD_ASYNC_DISABLE: return []

      /* ── I²C ───────────────────────────── */
      case CMD_I2C_SCAN: {
        // payload: [channel(1)][speedCode(1)]
        return this.i2cDevices
      }
      case CMD_I2C_READ: {
        // payload: [ch(1)][addr(1)][regHi(1)][regLo(1)][lenHi(1)][lenLo(1)]
        const len = ((payload[4] || 0) << 8) | (payload[5] || 1)
        const data: number[] = []
        for (let i = 0; i < Math.min(len, 256); i++) {
          data.push(Math.floor(Math.random() * 256))
        }
        return data
      }
      case CMD_I2C_WRITE: return []
      case CMD_I2C_WRITE_READ: {
        const rdLen = ((payload[payload.length - 2] || 0) << 8) | (payload[payload.length - 1] || 8)
        const data: number[] = []
        for (let i = 0; i < Math.min(rdLen, 256); i++) data.push(Math.floor(Math.random() * 256))
        return data
      }

      /* ── SPI ───────────────────────────── */
      case CMD_SPI_TRANSFER: {
        // payload: [bus(1)][mode(1)][speed100kHz(1)][cs(1)][bitOrder(1)][lenHi(1)][lenLo(1)][data(N)]
        const txLen = ((payload[5] || 0) << 8) | (payload[6] || 0)
        const data: number[] = []
        for (let i = 0; i < Math.min(txLen, 256); i++) {
          data.push(Math.floor(Math.random() * 256))
        }
        return data
      }
      case CMD_SPI_CS_CTRL: return []

      /* ── UART ───────────────────────────── */
      case CMD_UART_CFG: {
        // [port(1)][baud(4)][dataBits(1)][parity(1)][stopBits(1)][flow(1)]
        const baud = (payload[1] << 24) | (payload[2] << 16) | (payload[3] << 8) | payload[4]
        this.uartCfg = { baud, data: payload[5], parity: payload[6], stop: payload[7] || 1 }
        return []
      }
      case CMD_UART_WRITE: {
        // After write, simulate echo response as async event
        const port = payload[0]
        const data = payload.slice(1)
        setTimeout(() => {
          const eventPayload = [EVENT_UART_DATA, port, ...data]
          const frame = frameBuild(ASYNC_EVENT, 0, new Uint8Array(eventPayload))
          for (const cb of this.dataCbs) { try { cb(frame) } catch { /* */ } }
        }, 50 + Math.random() * 100)
        return []
      }
      case CMD_UART_READ: {
        // Return simulated received data
        const txt = `[${new Date().toLocaleTimeString()}] RX: Hello from virtual device!\r\n`
        return [...new TextEncoder().encode(txt)]
      }
      case CMD_UART_BREAK: return []

      /* ── CAN ───────────────────────────── */
      case CMD_CAN_CFG: return []
      case CMD_CAN_SEND: return [] // ACK only

      case CMD_CAN_FILTER: return []

      case CMD_CAN_MONITOR: {
        const enable = payload.length > 0 && payload[0] === 1
        if (enable) this.startCanMonitor()
        else this.stopCanMonitor()
        return []
      }

      /* ── 1-Wire ────────────────────────── */
      case CMD_OW_RESET: return [1] // Presence detected
      case CMD_OW_SEARCH: {
        // Return simulated ROMs
        return this.owRoms.flat()
      }
      case CMD_OW_READ: {
        const len = ((payload[payload.length - 2] || 0) << 8) | (payload[payload.length - 1] || 8)
        const data: number[] = []
        for (let i = 0; i < Math.min(len, 256); i++) data.push(Math.floor(Math.random() * 256))
        // DS18B20 temperature: 0x0191 = 25.0625°C
        if (payload[payload.length - 3] === 0xBE && len >= 9) {
          data[0] = 0x91; data[1] = 0x01 // 25.06°C
          for (let i = 2; i < 9; i++) data[i] = 0xFF
        }
        return data
      }
      case CMD_OW_WRITE: return []

      /* ── GPIO ───────────────────────────── */
      case CMD_GPIO_CFG: {
        const pin = payload[0]
        const mode = payload[1]
        if (pin < 8) this.gpioMode[pin] = mode
        return []
      }
      case CMD_GPIO_WRITE: {
        const pin = payload[0]; const val = payload[1]
        if (pin < 8) {
          this.gpioState[pin] = val
          // Fire async GPIO change event
          setTimeout(() => {
            const eventPayload = [EVENT_GPIO_CHANGE, pin, val]
            const frame = frameBuild(ASYNC_EVENT, 0, new Uint8Array(eventPayload))
            for (const cb of this.dataCbs) { try { cb(frame) } catch { /* */ } }
          }, 5)
        }
        return []
      }
      case CMD_GPIO_READ: {
        const pin = payload[0]
        return [pin < 8 ? this.gpioState[pin] : 0]
      }
      case CMD_GPIO_PWM: return []

      /* ── LA ─────────────────────────────── */
      case CMD_LA_CFG: {
        this.laConfig = {
          channels: payload[0],
          rate: (payload[1] << 24) | (payload[2] << 16) | (payload[3] << 8) | payload[4],
          triggerMask: payload[5],
          triggerVal: payload[6],
        }
        this.laArmed = true
        return []
      }
      case CMD_LA_START: {
        // Simulate capture complete after 500ms (fires LA_DATA async)
        setTimeout(() => {
          const chCount = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => this.laConfig.channels & (1 << i)).length
          const samplesPerCh = 1024
          const laPayload = [chCount, (samplesPerCh >> 8) & 0xff, samplesPerCh & 0xff]
          for (let ch = 0; ch < chCount; ch++) {
            for (let s = 0; s < samplesPerCh; s++) {
              laPayload.push(s < 256 ? 0 : 1) // Simple toggle pattern
            }
          }
          const frame = frameBuild(ASYNC_EVENT, 0, new Uint8Array(laPayload))
          for (const cb of this.dataCbs) { try { cb(frame) } catch { /* */ } }
        }, 500)
        return []
      }
      case CMD_LA_STOP: return []
      case CMD_LA_DATA: {
        // Generate simulated capture data
        const chCount = [0, 1, 2, 3, 4, 5, 6, 7].filter((i) => this.laConfig.channels & (1 << i)).length
        const samplesPerCh = 1024
        const result = [chCount, (samplesPerCh >> 8) & 0xff, samplesPerCh & 0xff]
        for (let ch = 0; ch < chCount; ch++) {
          for (let s = 0; s < samplesPerCh; s++) {
            // Simulate different patterns per channel
            const val = ch === 0 ? (s % 100 < 50 ? 1 : 0) // 50% duty
              : ch === 1 ? (s % 50 < 10 ? 1 : 0)           // 20% duty
              : (s % 20 === 0 ? 1 : 0)                      // pulse
            result.push(val)
          }
        }
        return result
      }
      case CMD_LA_STATUS: return [3] // done
      case CMD_LA_STREAM_MODE: return []

      /* ── Batch ──────────────────────────── */
      case CMD_BATCH: return [0] // ACK

      default: return []
    }
  }

  /* ── CAN Monitor Simulation ──────────── */
  private startCanMonitor(): void {
    if (this.canTimer) return
    this.canMonitorActive = true
    // Generate simulated CAN frames every 500-1500ms
    const sendFrame = () => {
      if (!this.canMonitorActive) return
      const id = [0x7E8, 0x18F, 0x520, 0x3C0][Math.floor(Math.random() * 4)]
      const dlc = 8
      const data: number[] = []
      for (let i = 0; i < dlc; i++) data.push(Math.floor(Math.random() * 256))
      // CAN frame payload: [IDE(1)][ID(4)][DLC(1)][Data(DLC)]
      const eventPayload = [
        EVENT_CAN_FRAME_RX,
        0, // IDE = standard
        (id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff,
        dlc,
        ...data,
      ]
      const frame = frameBuild(ASYNC_EVENT, 0, new Uint8Array(eventPayload))
      for (const cb of this.dataCbs) { try { cb(frame) } catch { /* */ } }
      this.canTimer = setTimeout(sendFrame, 500 + Math.random() * 1000)
    }
    sendFrame()
  }

  private stopCanMonitor(): void {
    this.canMonitorActive = false
    if (this.canTimer) { clearTimeout(this.canTimer); this.canTimer = null }
  }
}
