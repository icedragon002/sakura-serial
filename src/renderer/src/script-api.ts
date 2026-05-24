/**
 * probe-station Script API
 *
 * 提供给用户脚本的 device 对象，封装 sendCommand() 为类型化方法。
 * 脚本在 sandboxed async function 中执行，可访问此对象。
 */

import {
  CMD_PING, CMD_GET_INFO, CMD_RESET_RP2350, CMD_SET_VREF, CMD_GET_VREF,
  CMD_I2C_SCAN, CMD_I2C_READ, CMD_I2C_WRITE, CMD_I2C_WRITE_READ,
  CMD_SPI_TRANSFER, CMD_SPI_CS_CTRL,
  CMD_UART_CFG, CMD_UART_WRITE, CMD_UART_READ, CMD_UART_BREAK,
  CMD_CAN_CFG, CMD_CAN_SEND, CMD_CAN_FILTER, CMD_CAN_MONITOR,
  CMD_OW_RESET, CMD_OW_SEARCH, CMD_OW_READ, CMD_OW_WRITE,
  CMD_GPIO_CFG, CMD_GPIO_WRITE, CMD_GPIO_READ, CMD_GPIO_PWM,
  CMD_LA_CFG, CMD_LA_START, CMD_LA_STOP, CMD_LA_STATUS, CMD_LA_STREAM_MODE,
} from '../../shared/commands'

type SendFn = (type: number, payload: number[]) => Promise<{ type: number; seq: number; payload: number[] }>

/* ═══════════════════════════════════════════════════
   I2C API
   ═══════════════════════════════════════════════════ */

export function i2cApi(send: SendFn) {
  return {
    async scan(opts: { channel: number; speed?: number }): Promise<number[]> {
      const speedCode = (opts.speed ?? 400_000) === 100_000 ? 0 : (opts.speed ?? 400_000) === 400_000 ? 1 : 2
      const resp = await send(CMD_I2C_SCAN, [opts.channel, speedCode])
      return Array.from(resp.payload)
    },

    async read(opts: { channel: number; addr: number; reg: number; len: number }): Promise<number[]> {
      const resp = await send(CMD_I2C_READ, [
        opts.channel, opts.addr,
        (opts.reg >> 8) & 0xff, opts.reg & 0xff,
        (opts.len >> 8) & 0xff, opts.len & 0xff,
      ])
      return Array.from(resp.payload)
    },

    async write(opts: { channel: number; addr: number; reg: number; data: number[] }): Promise<void> {
      await send(CMD_I2C_WRITE, [
        opts.channel, opts.addr,
        (opts.reg >> 8) & 0xff, opts.reg & 0xff,
        ...opts.data,
      ])
    },

    async writeRead(opts: {
      channel: number; addr: number; writeData: number[]; readLen: number
    }): Promise<number[]> {
      const resp = await send(CMD_I2C_WRITE_READ, [
        opts.channel, opts.addr, opts.writeData.length, ...opts.writeData,
        (opts.readLen >> 8) & 0xff, opts.readLen & 0xff,
      ])
      return Array.from(resp.payload)
    },
  }
}

/* ═══════════════════════════════════════════════════
   SPI API
   ═══════════════════════════════════════════════════ */

export function spiApi(send: SendFn) {
  return {
    async transfer(opts: {
      bus: number; mode: number; speedKHz: number; cs: number
      bitOrder?: number; data: number[]
    }): Promise<number[]> {
      const speed100kHz = Math.max(1, Math.round(opts.speedKHz / 100))
      const resp = await send(CMD_SPI_TRANSFER, [
        opts.bus, opts.mode, speed100kHz, opts.cs, opts.bitOrder ?? 0,
        (opts.data.length >> 8) & 0xff, opts.data.length & 0xff,
        ...opts.data,
      ])
      return Array.from(resp.payload)
    },

    async csControl(bus: number, cs: number, state: number): Promise<void> {
      await send(CMD_SPI_CS_CTRL, [bus, cs, state])
    },
  }
}

/* ═══════════════════════════════════════════════════
   UART API
   ═══════════════════════════════════════════════════ */

export function uartApi(send: SendFn) {
  return {
    async config(opts: { port: number; baud: number; dataBits: number; parity?: string; stopBits?: number }): Promise<void> {
      const parMap: Record<string, number> = { none: 0, even: 1, odd: 2, mark: 3, space: 4 }
      await send(CMD_UART_CFG, [
        opts.port,
        (opts.baud >> 24) & 0xff, (opts.baud >> 16) & 0xff, (opts.baud >> 8) & 0xff, opts.baud & 0xff,
        opts.dataBits, parMap[opts.parity ?? 'none'] ?? 0, opts.stopBits ?? 1,
      ])
    },

    async write(port: number, data: number[]): Promise<void> {
      await send(CMD_UART_WRITE, [port, ...data])
    },

    async read(port: number, timeoutMs = 100): Promise<number[]> {
      const resp = await send(CMD_UART_READ, [port, (timeoutMs >> 8) & 0xff, timeoutMs & 0xff])
      return Array.from(resp.payload)
    },

    async sendBreak(port: number, durationMs = 100): Promise<void> {
      await send(CMD_UART_BREAK, [port, (durationMs >> 8) & 0xff, durationMs & 0xff])
    },
  }
}

/* ═══════════════════════════════════════════════════
   CAN API
   ═══════════════════════════════════════════════════ */

export function canApi(send: SendFn) {
  return {
    async config(opts: { mode?: number; bitrate: number; fd?: number; termination?: number }): Promise<void> {
      await send(CMD_CAN_CFG, [
        opts.mode ?? 0,
        (opts.bitrate >> 24) & 0xff, (opts.bitrate >> 16) & 0xff, (opts.bitrate >> 8) & 0xff, opts.bitrate & 0xff,
        opts.fd ?? 0, opts.termination ?? 1,
      ])
    },

    async sendFrame(opts: { id: number; ide?: number; data: number[] }): Promise<void> {
      await send(CMD_CAN_SEND, [
        (opts.id >> 24) & 0xff, (opts.id >> 16) & 0xff, (opts.id >> 8) & 0xff, opts.id & 0xff,
        opts.ide ?? 0, opts.data.length, ...opts.data,
      ])
    },

    async setFilter(filterNum: number, mask: number, id: number): Promise<void> {
      await send(CMD_CAN_FILTER, [
        filterNum,
        (mask >> 24) & 0xff, (mask >> 16) & 0xff, (mask >> 8) & 0xff, mask & 0xff,
        (id >> 24) & 0xff, (id >> 16) & 0xff, (id >> 8) & 0xff, id & 0xff,
      ])
    },

    async startMonitor(): Promise<void> {
      await send(CMD_CAN_MONITOR, [1])
    },

    async stopMonitor(): Promise<void> {
      await send(CMD_CAN_MONITOR, [])
    },
  }
}

/* ═══════════════════════════════════════════════════
   1-Wire API
   ═══════════════════════════════════════════════════ */

export function owApi(send: SendFn) {
  return {
    async reset(): Promise<boolean> {
      const resp = await send(CMD_OW_RESET, [])
      return resp.payload.length > 0 && resp.payload[0] === 1
    },

    async search(): Promise<number[][]> {
      const resp = await send(CMD_OW_SEARCH, [])
      const roms: number[][] = []
      for (let i = 0; i + 7 < resp.payload.length; i += 8) {
        roms.push(resp.payload.slice(i, i + 8))
      }
      return roms
    },

    async read(rom: number[], cmd: number, len: number): Promise<number[]> {
      const resp = await send(CMD_OW_READ, [...rom, cmd, (len >> 8) & 0xff, len & 0xff])
      return Array.from(resp.payload)
    },

    async write(rom: number[], data: number[]): Promise<void> {
      await send(CMD_OW_WRITE, [...rom, ...data])
    },
  }
}

/* ═══════════════════════════════════════════════════
   GPIO API
   ═══════════════════════════════════════════════════ */

export function gpioApi(send: SendFn) {
  return {
    async config(pin: number, mode: number, pull: number): Promise<void> {
      await send(CMD_GPIO_CFG, [pin, mode, pull])
    },

    async write(pin: number, value: number): Promise<void> {
      await send(CMD_GPIO_WRITE, [pin, value])
    },

    async read(pin: number): Promise<number> {
      const resp = await send(CMD_GPIO_READ, [pin])
      return resp.payload.length > 0 ? resp.payload[0] : 0
    },

    async pwm(pin: number, freqHz: number, dutyPermille: number): Promise<void> {
      await send(CMD_GPIO_PWM, [
        pin,
        (freqHz >> 24) & 0xff, (freqHz >> 16) & 0xff, (freqHz >> 8) & 0xff, freqHz & 0xff,
        (dutyPermille >> 8) & 0xff, dutyPermille & 0xff,
      ])
    },
  }
}

/* ═══════════════════════════════════════════════════
   LA API
   ═══════════════════════════════════════════════════ */

export function laApi(send: SendFn) {
  return {
    async config(opts: {
      channels: number; sampleRateKHz: number; vref?: number
      triggerMask?: number; triggerVal?: number
      preSamples?: number; postSamples?: number
    }): Promise<void> {
      await send(CMD_LA_CFG, [
        opts.channels,
        (opts.sampleRateKHz >> 24) & 0xff, (opts.sampleRateKHz >> 16) & 0xff,
        (opts.sampleRateKHz >> 8) & 0xff, opts.sampleRateKHz & 0xff,
        opts.triggerMask ?? 0, opts.triggerVal ?? 0,
        (opts.preSamples ?? 4096) >> 24 & 0xff, (opts.preSamples ?? 4096) >> 16 & 0xff,
        (opts.preSamples ?? 4096) >> 8 & 0xff, (opts.preSamples ?? 4096) & 0xff,
        (opts.postSamples ?? 4096) >> 24 & 0xff, (opts.postSamples ?? 4096) >> 16 & 0xff,
        (opts.postSamples ?? 4096) >> 8 & 0xff, (opts.postSamples ?? 4096) & 0xff,
        opts.vref ?? 1,
      ])
    },

    async start(): Promise<void> { await send(CMD_LA_START, []) },
    async stop(): Promise<void> { await send(CMD_LA_STOP, []) },
    async status(): Promise<number> {
      const resp = await send(CMD_LA_STATUS, [])
      return resp.payload.length > 0 ? resp.payload[0] : 0
    },
    async setStreamMode(mode: number): Promise<void> {
      await send(CMD_LA_STREAM_MODE, [mode])
    },
  }
}

/* ═══════════════════════════════════════════════════
   System API
   ═══════════════════════════════════════════════════ */

export function sysApi(send: SendFn) {
  return {
    async ping(): Promise<void> { await send(CMD_PING, []) },
    async getInfo(): Promise<{ fw: string; protocols: number[] }> {
      const resp = await send(CMD_GET_INFO, [])
      const view = new DataView(new Uint8Array(resp.payload).buffer)
      let off = 0
      const fwLen = view.getUint8(off++)
      const fw = new TextDecoder().decode(new Uint8Array(resp.payload.slice(off, off + fwLen)))
      off += fwLen
      const protoCount = view.getUint8(off++)
      const protocols: number[] = []
      for (let i = 0; i < protoCount; i++) protocols.push(view.getUint8(off++))
      return { fw, protocols }
    },
    async resetRP2350(): Promise<void> { await send(CMD_RESET_RP2350, []) },
    async setVref(port: number, mV: number): Promise<void> {
      await send(CMD_SET_VREF, [port, (mV >> 8) & 0xff, mV & 0xff])
    },
  }
}

/* ═══════════════════════════════════════════════════
   Device Object (assembled for scripts)
   ═══════════════════════════════════════════════════ */

export interface ScriptDevice {
  i2c: ReturnType<typeof i2cApi>
  spi: ReturnType<typeof spiApi>
  uart: ReturnType<typeof uartApi>
  can: ReturnType<typeof canApi>
  onewire: ReturnType<typeof owApi>
  gpio: ReturnType<typeof gpioApi>
  la: ReturnType<typeof laApi>
  sys: ReturnType<typeof sysApi>
  delay: (ms: number) => Promise<void>
  /** Send a batch of commands in a single frame */
  batch: (cmds: Array<{ type: number; payload: number[] }>) => Promise<Array<{ type: number; payload: number[] }>>
  sendRaw: (type: number, payload: number[]) => Promise<{ type: number; payload: number[] }>
}

export function createScriptDevice(send: SendFn): ScriptDevice {
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

  return {
    i2c: i2cApi(send),
    spi: spiApi(send),
    uart: uartApi(send),
    can: canApi(send),
    onewire: owApi(send),
    gpio: gpioApi(send),
    la: laApi(send),
    sys: sysApi(send),
    delay,
    async batch(cmds) {
      // Simple sequential execution (hardware BATCH command can be added later)
      const results: Array<{ type: number; payload: number[] }> = []
      for (const cmd of cmds) {
        results.push(await send(cmd.type, cmd.payload))
      }
      return results
    },
    async sendRaw(type, payload) {
      return send(type, payload)
    },
  }
}
