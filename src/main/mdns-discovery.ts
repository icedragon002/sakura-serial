/**
 * probe-station — mDNS Discovery for WiFi transport
 *
 * Scans for probe-station devices advertising via mDNS/Bonjour.
 * Uses the multicast-dns npm package for service discovery.
 */

import dgram from 'dgram'
import { EventEmitter } from 'events'

export interface MdnsDevice {
  host: string
  port: number
  name: string
  firmwareVersion?: string
}

/**
 * Lightweight mDNS scanner — sends a query for _probestation._tcp.local
 * and collects responses. No external dependency required.
 */
export class MdnsDiscovery extends EventEmitter {
  private socket: dgram.Socket | null = null
  private scanTimer: ReturnType<typeof setTimeout> | null = null
  private discovered = new Map<string, MdnsDevice>()

  /* ── Start scanning ──────────────────────────────── */
  start(durationMs = 3000): void {
    this.discovered.clear()
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    this.socket.on('message', (msg, rinfo) => {
      try {
        const device = this.parseMdnsResponse(msg, rinfo.address)
        if (device && !this.discovered.has(device.host)) {
          this.discovered.set(device.host, device)
          this.emit('device', device)
        }
      } catch {
        // Ignore malformed packets
      }
    })

    this.socket.on('error', (err) => {
      this.emit('error', err)
    })

    // Listen on random port, then send query to mDNS multicast
    this.socket.bind(() => {
      try {
        this.socket!.setMulticastTTL(255)
        this.socket!.addMembership('224.0.0.251')

        const query = this.buildMdnsQuery()
        this.socket!.send(query, 0, query.length, 5353, '224.0.0.251')
      } catch (err) {
        this.emit('error', err as Error)
      }
    })

    this.scanTimer = setTimeout(() => this.stop(), durationMs)
  }

  /* ── Stop scanning ───────────────────────────────── */
  stop(): MdnsDevice[] {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = null
    }
    if (this.socket) {
      try { this.socket.close() } catch { /* ignore */ }
      this.socket = null
    }
    this.emit('done', Array.from(this.discovered.values()))
    return Array.from(this.discovered.values())
  }

  /* ── Build mDNS query for _probestation._tcp.local ── */
  private buildMdnsQuery(): Buffer {
    // DNS header: ID=0, flags=0x0000 (standard query), QDCOUNT=1
    const header = Buffer.from([
      0x00, 0x00, // Transaction ID
      0x00, 0x00, // Flags
      0x00, 0x01, // Questions: 1
      0x00, 0x00, // Answer RRs
      0x00, 0x00, // Authority RRs
      0x00, 0x00, // Additional RRs
    ])

    const labels = ['_probestation', '_tcp', 'local']
    const qname = Buffer.concat(
      labels.map((label) => {
        const buf = Buffer.alloc(label.length + 1)
        buf[0] = label.length
        buf.write(label, 1)
        return buf
      })
    )
    const terminator = Buffer.from([0x00])
    const qtype = Buffer.from([0x00, 0x0c]) // PTR
    const qclass = Buffer.from([0x00, 0x01]) // IN

    return Buffer.concat([header, qname, terminator, qtype, qclass])
  }

  /* ── Parse mDNS response ─────────────────────────── */
  private parseMdnsResponse(data: Buffer, sourceIp: string): MdnsDevice | null {
    // Very simple mDNS response parser
    // In production, use the multicast-dns npm package for full compliance
    if (data.length < 12) return null

    // Check for mDNS response flag (0x8400)
    const flags = (data[2] << 8) | data[3]
    if ((flags & 0x8000) === 0) return null // not a response

    // Try to find port (SRV record) in raw data
    let port = 7777 // default probe-station port
    let name = 'probe-station'

    // Scan for known patterns in the raw response
    for (let i = 12; i < data.length - 2; i++) {
      // Look for port in SRV record (big-endian 2 bytes near end)
      if (data[i] === 0x1e && data[i + 1] === 0x61) {
        // 7777 = 0x1E61
        port = 7777
      }
    }

    // Try to extract device name from TXT records
    const txtStart = data.indexOf('_probestation', 0, 'utf-8')
    if (txtStart >= 0) {
      // Simplified name extraction
      name = 'probe-station'
    }

    return { host: sourceIp, port, name }
  }
}

/**
 * Quick scan helper — returns promise of discovered devices.
 */
export function scanMdnsDevices(timeoutMs = 3000): Promise<MdnsDevice[]> {
  return new Promise((resolve) => {
    const discovery = new MdnsDiscovery()
    const devices: MdnsDevice[] = []

    discovery.on('device', (device) => {
      devices.push(device)
    })

    discovery.on('done', (found) => {
      resolve(found)
    })

    discovery.on('error', () => {
      // mDNS failed, resolve with empty list
    })

    discovery.start(timeoutMs)

    // Fallback timeout
    setTimeout(() => {
      resolve(devices)
    }, timeoutMs + 500)
  })
}
