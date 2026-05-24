/**
 * probe-station 二进制帧协议 — 编解码器
 * 与 firmware/shared/frame.c 保持同步 (v1.3)
 *
 * 实现: CRC-16-CCITT / SLIP 转义 / 帧组装 / 流式解析
 */

import {
  FRAME_SYNC,
  FRAME_ESC,
  ESC_SYNC,
  ESC_ESC,
  CRC16_POLY,
  FRAME_HEADER_SIZE,
  FRAME_CRC_SIZE,
  FRAME_MAX_PAYLOAD,
  FRAME_MAX_SIZE,
} from './commands'

/* ═══════════════════════════════════════════════════
   CRC-16-CCITT
   ═══════════════════════════════════════════════════ */

export function crc16Calc(data: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < data.length; i++) {
    crc ^= (data[i] << 8) & 0xffff
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ CRC16_POLY) & 0xffff
      } else {
        crc = (crc << 1) & 0xffff
      }
    }
  }
  return crc
}

/* ═══════════════════════════════════════════════════
   SLIP Encode / Decode
   ═══════════════════════════════════════════════════ */

/**
 * SLIP encode: src → dst.
 * Returns the encoded Uint8Array (may be larger than input due to escaping).
 */
export function slipEncode(src: Uint8Array): Uint8Array {
  const chunks: number[] = []
  for (let i = 0; i < src.length; i++) {
    if (src[i] === FRAME_SYNC) {
      chunks.push(FRAME_ESC, ESC_SYNC)
    } else if (src[i] === FRAME_ESC) {
      chunks.push(FRAME_ESC, ESC_ESC)
    } else {
      chunks.push(src[i])
    }
  }
  return new Uint8Array(chunks)
}

/**
 * SLIP decode: src → dst.
 * Returns decoded Uint8Array, or throws on invalid escape sequence.
 */
export function slipDecode(src: Uint8Array): Uint8Array {
  const chunks: number[] = []
  let escaping = false

  for (let i = 0; i < src.length; i++) {
    if (escaping) {
      if (src[i] === ESC_SYNC) {
        chunks.push(FRAME_SYNC)
      } else if (src[i] === ESC_ESC) {
        chunks.push(FRAME_ESC)
      } else {
        throw new Error(`Invalid SLIP escape sequence: 0x${src[i].toString(16)}`)
      }
      escaping = false
    } else if (src[i] === FRAME_ESC) {
      escaping = true
    } else {
      chunks.push(src[i])
    }
  }

  if (escaping) {
    throw new Error('Truncated SLIP escape at end of stream')
  }

  return new Uint8Array(chunks)
}

/* ═══════════════════════════════════════════════════
   Frame Build
   ═══════════════════════════════════════════════════ */

/**
 * Assemble a complete frame from type + seq + payload.
 * Returns the full frame bytes (SYNC + SLIP-encoded body + CRC).
 */
export function frameBuild(
  type: number,
  seq: number,
  payload: Uint8Array | null,
  payloadLen?: number
): Uint8Array {
  const plen = payloadLen ?? (payload ? payload.length : 0)
  if (plen > FRAME_MAX_PAYLOAD) {
    throw new Error(`Payload length ${plen} exceeds max ${FRAME_MAX_PAYLOAD}`)
  }

  // Step 1: assemble raw frame [SYNC | LENGTH(2) | TYPE | SEQ | Payload | CRC(2)]
  const rawLen = 5 + plen + 2
  const raw = new Uint8Array(rawLen)
  raw[0] = FRAME_SYNC
  raw[1] = (plen >> 8) & 0xff
  raw[2] = plen & 0xff
  raw[3] = type & 0xff
  raw[4] = seq & 0xff
  if (payload && plen > 0) {
    raw.set(payload.subarray(0, plen), 5)
  }

  // CRC over [SYNC | LENGTH | TYPE | SEQ | Payload]
  const crc = crc16Calc(raw.subarray(0, 5 + plen))
  raw[5 + plen] = (crc >> 8) & 0xff
  raw[5 + plen + 1] = crc & 0xff

  // Step 2: SLIP-encode everything except the first SYNC byte
  const slipBody = slipEncode(raw.subarray(1))

  // Step 3: output = SYNC + encoded data
  const out = new Uint8Array(1 + slipBody.length)
  out[0] = FRAME_SYNC
  out.set(slipBody, 1)
  return out
}

/* ═══════════════════════════════════════════════════
   Frame Parser (Stateful stream parser)
   ═══════════════════════════════════════════════════ */

export interface ParsedFrame {
  type: number
  seq: number
  payload: Uint8Array
}

export class FrameParser {
  private buf: number[] = []

  reset(): void {
    this.buf = []
  }

  /**
   * Feed one byte into the parser.
   * Returns:
   *   null  — need more data
   *   ParsedFrame — complete frame extracted
   * Throws on CRC error or parse error.
   */
  feed(byte: number): ParsedFrame | null {
    // Waiting for SYNC
    if (this.buf.length === 0 && byte !== FRAME_SYNC) {
      return null
    }

    if (this.buf.length === 0 && byte === FRAME_SYNC) {
      this.buf.push(byte)
      return null
    }

    // Buffer the byte
    if (this.buf.length >= FRAME_MAX_SIZE * 2) {
      this.buf = []
      throw new Error('Frame buffer overflow')
    }
    this.buf.push(byte)

    // Need at least SYNC(1) + LENGTH(2) + TYPE(1) + SEQ(1) = 5 bytes in buf
    // After decode, need SYNC(1) + header(4) + CRC(2) = 7 bytes minimum
    if (this.buf.length < 7) return null

    // Try to SLIP-decode the body (skip the first SYNC byte)
    let decoded: Uint8Array
    try {
      decoded = slipDecode(new Uint8Array(this.buf.slice(1)))
    } catch {
      this.buf = []
      throw new Error('SLIP decode error')
    }

    // Need at least LENGTH(2) + TYPE(1) + SEQ(1) + CRC(2) = 6 bytes in decoded body
    if (decoded.length < 6) return null

    const payloadLen = ((decoded[0] << 8) | decoded[1]) >>> 0
    const type = decoded[2]
    const seq = decoded[3]

    if (payloadLen > FRAME_MAX_PAYLOAD) {
      this.buf = []
      throw new Error(`Payload length ${payloadLen} exceeds max ${FRAME_MAX_PAYLOAD}`)
    }

    const expected = 4 + payloadLen + 2 // header(4) + payload + crc(2)
    if (decoded.length < expected) return null

    // Verify CRC
    const crcBuf = new Uint8Array(5 + payloadLen)
    crcBuf[0] = FRAME_SYNC
    crcBuf[1] = decoded[0]
    crcBuf[2] = decoded[1]
    crcBuf[3] = decoded[2]
    crcBuf[4] = decoded[3]
    if (payloadLen > 0) {
      crcBuf.set(decoded.subarray(4, 4 + payloadLen), 5)
    }

    const calcCrc = crc16Calc(crcBuf)
    const recvCrc =
      ((decoded[4 + payloadLen] << 8) | decoded[4 + payloadLen + 1]) >>> 0

    if (calcCrc !== recvCrc) {
      this.buf = []
      throw new Error(
        `CRC mismatch: calc=0x${calcCrc.toString(16)}, recv=0x${recvCrc.toString(16)}`
      )
    }

    // Success
    const payload = payloadLen > 0 ? decoded.subarray(4, 4 + payloadLen).slice() : new Uint8Array(0)
    this.buf = []
    return { type, seq, payload }
  }

  /**
   * Feed multiple bytes at once. Returns array of complete frames found.
   * Leftover partial data stays in the parser buffer.
   */
  feedMany(data: Uint8Array): ParsedFrame[] {
    const frames: ParsedFrame[] = []
    for (let i = 0; i < data.length; i++) {
      try {
        const result = this.feed(data[i])
        if (result) frames.push(result)
      } catch {
        // CRC/parse errors on individual frames are silently dropped;
        // caller should handle via onError callback if needed.
        this.reset()
      }
    }
    return frames
  }
}
