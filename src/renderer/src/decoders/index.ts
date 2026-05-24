/**
 * probe-station — Protocol Decoder Plugin System
 *
 * Each decoder implements:
 *   - name: display name
 *   - detect(rawBytes): boolean — auto-detection
 *   - decode(rawBytes): DecodeResult — structured decode
 */

export interface DecodeField {
  name: string
  value: string
  description?: string
}

export interface DecodeResult {
  protocol: string
  summary: string
  fields: DecodeField[]
  raw: string
}

export interface ProtocolDecoder {
  name: string
  detect(raw: Uint8Array): boolean
  decode(raw: Uint8Array): DecodeResult
}

/* ═══════════════════════════════════════════════════
   Modbus RTU Decoder
   ═══════════════════════════════════════════════════ */

const modbusDecoder: ProtocolDecoder = {
  name: 'Modbus RTU',
  detect(raw: Uint8Array): boolean {
    if (raw.length < 4) return false
    // Modbus RTU: addr(1) + func(1) + data(N) + crc(2)
    // Function codes 1-6, 15-16, 23 are common
    const func = raw[1]
    return (func >= 1 && func <= 6) || func === 15 || func === 16 || func === 23
  },
  decode(raw: Uint8Array): DecodeResult {
    const funcNames: Record<number, string> = {
      1: 'Read Coils', 2: 'Read Discrete Inputs', 3: 'Read Holding Registers',
      4: 'Read Input Registers', 5: 'Write Single Coil', 6: 'Write Single Register',
      15: 'Write Multiple Coils', 16: 'Write Multiple Registers', 23: 'Read/Write Multiple Registers',
    }
    const addr = raw[0]
    const func = raw[1]
    const data = raw.slice(2, -2)
    const crc = ((raw[raw.length - 1] << 8) | raw[raw.length - 2])

    const fields: DecodeField[] = [
      { name: 'Address', value: `0x${addr.toString(16).toUpperCase()}` },
      { name: 'Function', value: funcNames[func] || `0x${func.toString(16)}` },
    ]

    if (func === 3 && data.length >= 4) {
      const reg = (data[0] << 8) | data[1]
      const count = (data[2] << 8) | data[3]
      fields.push({ name: 'Start Reg', value: `0x${reg.toString(16)}` })
      fields.push({ name: 'Count', value: String(count) })
    }

    fields.push({ name: 'CRC', value: `0x${crc.toString(16).toUpperCase().padStart(4, '0')}` })

    return {
      protocol: 'Modbus RTU',
      summary: `${funcNames[func] || 'Unknown'} → Slave ${addr}`,
      fields,
      raw: Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join(' '),
    }
  },
}

/* ═══════════════════════════════════════════════════
   AT Command Decoder
   ═══════════════════════════════════════════════════ */

const atDecoder: ProtocolDecoder = {
  name: 'AT Commands',
  detect(raw: Uint8Array): boolean {
    // AT commands start with "AT" (0x41 0x54) or "at" (0x61 0x74)
    if (raw.length < 2) return false
    return (raw[0] === 0x41 && raw[1] === 0x54) || (raw[0] === 0x61 && raw[1] === 0x74)
  },
  decode(raw: Uint8Array): DecodeResult {
    const text = new TextDecoder().decode(raw).trim()
    const isResponse = text.startsWith('+') || text.startsWith('OK') || text.startsWith('ERROR')
    return {
      protocol: 'AT',
      summary: isResponse ? `Response: ${text}` : `Command: ${text}`,
      fields: [{ name: isResponse ? 'Response' : 'Command', value: text }],
      raw: Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join(' '),
    }
  },
}

/* ═══════════════════════════════════════════════════
   SMBus Decoder
   ═══════════════════════════════════════════════════ */

const smbusDecoder: ProtocolDecoder = {
  name: 'SMBus',
  detect(raw: Uint8Array): boolean {
    if (raw.length < 2) return false
    // SMBus uses I2C-like addressing (0x08-0x77)
    const addr = raw[0] >> 1
    const rw = raw[0] & 1
    return addr >= 0x08 && addr <= 0x77 && raw.length >= 3
  },
  decode(raw: Uint8Array): DecodeResult {
    const addr = raw[0] >> 1
    const rw = raw[0] & 1
    const cmd = raw[1]
    const data = raw.slice(2)

    const smbusCmds: Record<number, string> = {
      0x00: 'Quick Command', 0x02: 'Receive Byte', 0x04: 'Send Byte',
      0x06: 'Read Byte', 0x08: 'Write Byte', 0x0a: 'Read Word',
      0x0c: 'Write Word', 0x0e: 'Block Read', 0x10: 'Block Write',
    }

    return {
      protocol: 'SMBus',
      summary: `${rw ? 'Read' : 'Write'} 0x${addr.toString(16).toUpperCase()} ${smbusCmds[cmd] || `Cmd 0x${cmd.toString(16)}`}`,
      fields: [
        { name: 'Address', value: `0x${addr.toString(16).toUpperCase()} (7-bit)` },
        { name: 'Direction', value: rw ? 'Read' : 'Write' },
        { name: 'Command', value: smbusCmds[cmd] || `0x${cmd.toString(16).toUpperCase()}` },
        { name: 'Data', value: data.map((b) => b.toString(16).padStart(2, '0')).join(' ') || '(none)' },
      ],
      raw: Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join(' '),
    }
  },
}

/* ═══════════════════════════════════════════════════
   GPS NMEA Decoder
   ═══════════════════════════════════════════════════ */

const nmeaDecoder: ProtocolDecoder = {
  name: 'GPS NMEA',
  detect(raw: Uint8Array): boolean {
    if (raw.length < 6) return false
    return raw[0] === 0x24 // '$'
  },
  decode(raw: Uint8Array): DecodeResult {
    const text = new TextDecoder().decode(raw).trim()
    const parts = text.split(',')
    const talker = text.substring(1, 3) || '??'
    const sentence = text.substring(3, 6) || '???'

    const sentences: Record<string, string> = {
      GGA: 'Fix Data', GLL: 'Lat/Lon', GSA: 'DOP & Active Sats',
      GSV: 'Sats in View', RMC: 'Min Recommended', VTG: 'Track & Speed',
    }

    return {
      protocol: 'NMEA 0183',
      summary: `${talker}${sentence}: ${sentences[sentence] || 'Unknown'}`,
      fields: [
        { name: 'Talker', value: talker },
        { name: 'Sentence', value: sentences[sentence] || sentence },
        { name: 'Raw', value: text },
      ],
      raw: text,
    }
  },
}

/* ═══════════════════════════════════════════════════
   MIDI Decoder
   ═══════════════════════════════════════════════════ */

const midiDecoder: ProtocolDecoder = {
  name: 'MIDI',
  detect(raw: Uint8Array): boolean {
    if (raw.length < 2) return false
    // MIDI status byte: 0x80-0xFF
    return (raw[0] & 0x80) !== 0
  },
  decode(raw: Uint8Array): DecodeResult {
    const status = raw[0]
    const msgType = status & 0xf0
    const channel = (status & 0x0f) + 1

    const msgNames: Record<number, string> = {
      0x80: 'Note Off', 0x90: 'Note On', 0xa0: 'Poly Pressure',
      0xb0: 'Control Change', 0xc0: 'Program Change', 0xd0: 'Channel Pressure',
      0xe0: 'Pitch Bend', 0xf0: 'System',
    }

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    const fields: DecodeField[] = [
      { name: 'Message', value: msgNames[msgType] || `0x${msgType.toString(16).toUpperCase()}` },
      { name: 'Channel', value: String(channel) },
    ]

    if ((msgType === 0x90 || msgType === 0x80) && raw.length >= 3) {
      const note = raw[1]
      const vel = raw[2]
      fields.push({ name: 'Note', value: `${noteNames[note % 12]}${Math.floor(note / 12) - 1} (${note})` })
      fields.push({ name: 'Velocity', value: String(vel) })
    }

    return {
      protocol: 'MIDI',
      summary: `${msgNames[msgType] || 'Unknown'} Ch${channel}`,
      fields,
      raw: Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join(' '),
    }
  },
}

/* ═══════════════════════════════════════════════════
   Registry
   ═══════════════════════════════════════════════════ */

const decoders: ProtocolDecoder[] = [
  modbusDecoder,
  atDecoder,
  smbusDecoder,
  nmeaDecoder,
  midiDecoder,
]

export function getAllDecoders(): ProtocolDecoder[] {
  return decoders
}

export function getDecoderByName(name: string): ProtocolDecoder | undefined {
  return decoders.find((d) => d.name === name)
}

export function autoDetect(raw: Uint8Array): ProtocolDecoder | null {
  for (const d of decoders) {
    if (d.detect(raw)) return d
  }
  return null
}

export function decodeWith(raw: Uint8Array, decoderName?: string): DecodeResult {
  if (decoderName) {
    const d = getDecoderByName(decoderName)
    if (d) return d.decode(raw)
  }

  const detected = autoDetect(raw)
  if (detected) return detected.decode(raw)

  return {
    protocol: 'RAW',
    summary: `${raw.length} bytes`,
    fields: [],
    raw: Array.from(raw).map((b) => b.toString(16).padStart(2, '0')).join(' '),
  }
}
