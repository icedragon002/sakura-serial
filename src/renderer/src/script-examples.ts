/**
 * probe-station — Script Example Library
 *
 * Built-in templates demonstrating common protocol operations.
 * Each example has a name, description, and code that can be
 * loaded into the Script panel editor.
 */

export interface ScriptExample {
  name: string
  description: string
  code: string
}

export const scriptExamples: ScriptExample[] = [
  {
    name: 'I2C Bus Scanner',
    description: 'Scan all I2C channels for devices',
    code: `// I2C Bus Scanner — probes all addresses on selected channel
const channel = 0
const addrs = await device.i2c.scan({ channel })
if (addrs.length === 0) {
  console.log('No devices found on channel ' + channel)
} else {
  console.log('Found ' + addrs.length + ' device(s):')
  for (const addr of addrs) {
    console.log('  0x' + addr.toString(16).toUpperCase().padStart(2, '0'))
  }
}
console.log('Scan complete.')`,
  },
  {
    name: 'MPU6050 Accelerometer',
    description: 'Read accelerometer data from MPU6050 via I2C',
    code: `// Read MPU6050 accelerometer (addr 0x68)
const addr = 0x68

// Wake up the device
await device.i2c.write({ channel: 0, addr, reg: 0x6B, data: [0x00] })
await device.delay(100)

// Read accelerometer (registers 0x3B-0x40, 6 bytes)
const data = await device.i2c.read({ channel: 0, addr, reg: 0x3B, len: 6 })

// Convert to signed 16-bit values
function toInt16(hi: number, lo: number) {
  let v = (hi << 8) | lo
  return v > 32767 ? v - 65536 : v
}

const ax = toInt16(data[0], data[1])
const ay = toInt16(data[2], data[3])
const az = toInt16(data[4], data[5])

console.log('Accelerometer:')
console.log('  X: ' + ax)
console.log('  Y: ' + ay)
console.log('  Z: ' + az)`,
  },
  {
    name: 'CAN Bus Sniffer',
    description: 'Monitor and log all CAN bus frames',
    code: `// CAN Bus Sniffer — configure and start monitoring
await device.can.config({ bitrate: 500000 })
await device.can.startMonitor()

console.log('CAN monitor started. Listening for frames...')
console.log('(This runs for 10 seconds, then stops)')

await device.delay(10000)

await device.can.stopMonitor()
console.log('Monitor stopped.')`,
  },
  {
    name: 'SPI Flash Read JEDEC ID',
    description: 'Read JEDEC manufacturer ID from SPI flash chip',
    code: `// SPI Flash — Read JEDEC ID (command 0x9F)
const jedecCmd = [0x9F]

const result = await device.spi.transfer({
  bus: 0,
  mode: 0,
  speedKHz: 1000,
  cs: 0,
  data: jedecCmd,
})

// Response: [dummy] [Manufacturer] [MemoryType] [Capacity]
const mfg = result[1]
const memType = result[2]
const capacity = result[3]

console.log('JEDEC ID:')
console.log('  Manufacturer: 0x' + mfg.toString(16).toUpperCase().padStart(2, '0'))
console.log('  Memory Type:  0x' + memType.toString(16).toUpperCase().padStart(2, '0'))
console.log('  Capacity:     0x' + capacity.toString(16).toUpperCase().padStart(2, '0') + ' (2^' + capacity + ' bytes)')

const mfgNames: Record<number, string> = {
  0x01: 'Spansion', 0x20: 'Micron/Numonyx', 0x1F: 'Adesto',
  0xC2: 'Macronix', 0x9D: 'ISSI', 0xEF: 'Winbond', 0xBF: 'SST',
}
console.log('  → ' + (mfgNames[mfg] || 'Unknown vendor'))`,
  },
  {
    name: '1-Wire DS18B20 Temperature',
    description: 'Read temperature from DS18B20 sensor',
    code: `// Read DS18B20 temperature sensor
const owReset = await device.onewire.reset()
if (!owReset) {
  console.log('No device on 1-Wire bus!')
} else {
  console.log('1-Wire presence detected')

  // Search for devices
  const roms = await device.onewire.search()
  if (roms.length === 0) {
    console.log('No ROMs found')
  } else {
    for (const rom of roms) {
      const family = rom[0]
      console.log('Found ROM: ' + rom.map(b => b.toString(16).padStart(2, '0')).join(':'))

      if (family === 0x28) {
        // DS18B20 — start conversion
        await device.onewire.write(rom, [0x44]) // Convert T
        await device.delay(750)

        // Read scratchpad
        const data = await device.onewire.read(rom, 0xBE, 9)
        const tempRaw = (data[1] << 8) | data[0]
        const celsius = tempRaw / 16.0
        console.log('Temperature: ' + celsius.toFixed(2) + '°C')
      }
    }
  }
}`,
  },
  {
    name: 'GPIO Blink',
    description: 'Blink GPIO pin in a loop',
    code: `// GPIO Blink — toggle a pin 5 times
const pin = 0

// Configure as output
await device.gpio.config(pin, 1, 0) // mode=output, pull=none

console.log('Blinking GPIO' + pin + '...')
for (let i = 0; i < 5; i++) {
  await device.gpio.write(pin, 1)
  await device.delay(500)
  await device.gpio.write(pin, 0)
  await device.delay(500)
}
console.log('Done.')`,
  },
  {
    name: 'PWM Sweep',
    description: 'Sweep PWM duty cycle for LED fade effect',
    code: `// PWM Sweep — fade an LED from 0% to 100% and back
const pin = 0
const freq = 1000

// Configure as PWM
await device.gpio.config(pin, 2, 0) // mode=pwm

// Sweep up
console.log('Sweeping up...')
for (let duty = 0; duty <= 1000; duty += 20) {
  await device.gpio.pwm(pin, freq, duty)
  await device.delay(20)
}

// Sweep down
console.log('Sweeping down...')
for (let duty = 1000; duty >= 0; duty -= 20) {
  await device.gpio.pwm(pin, freq, duty)
  await device.delay(20)
}

console.log('Sweep complete.')`,
  },
  {
    name: 'UART Echo Test',
    description: 'Send text and read back response',
    code: `// UART Echo Test
await device.uart.config({ port: 0, baud: 115200, dataBits: 8 })

const testMsg = 'Hello probe-station!\\r\\n'
console.log('Sending: ' + testMsg.trim())

const txBytes = [...new TextEncoder().encode(testMsg)]
await device.uart.write(0, txBytes)

// Wait and read response
await device.delay(200)
const rxData = await device.uart.read(0, 500)

if (rxData.length > 0) {
  const text = new TextDecoder().decode(rxData)
  console.log('Received (' + rxData.length + ' bytes): ' + text)
} else {
  console.log('No response (timeout)')
}`,
  },
  {
    name: 'LA Snapshot Capture',
    description: 'Configure logic analyzer and capture a snapshot',
    code: `// Logic Analyzer — capture with trigger on channel 0 rising edge
await device.la.config({
  channels: 0xFF,        // all 8 channels
  sampleRateKHz: 5000,   // 5 MHz
  triggerMask: 0x01,     // trigger on CH0
  triggerVal: 0x01,      // rising edge
  preSamples: 2048,
  postSamples: 2048,
})

console.log('LA configured. Starting capture...')
await device.la.start()

// Wait for capture to complete
await device.delay(1000)
const st = await device.la.status()
console.log('LA status: ' + st)

await device.la.stop()
console.log('Capture stopped.')`,
  },
  {
    name: 'Multi-Protocol Probe',
    description: 'Scan I2C + check GPIO + UART in sequence',
    code: `// Multi-Protocol Probe — quick health check
console.log('=== probe-station System Check ===')

// System info
const info = await device.sys.getInfo()
console.log('Firmware: ' + info.fw)
console.log('Supported protocols: ' + info.protocols.map(p => '0x' + p.toString(16)).join(', '))

// I2C scan
console.log('\\n--- I2C Scan ---')
const addrs = await device.i2c.scan({ channel: 0 })
console.log('Devices: ' + (addrs.length > 0 ? addrs.map(a => '0x' + a.toString(16)).join(', ') : 'none'))

// GPIO quick read
console.log('\\n--- GPIO Read ---')
for (let pin = 0; pin < 4; pin++) {
  try {
    await device.gpio.config(pin, 0, 0) // input, no pull
    const v = await device.gpio.read(pin)
    console.log('GPIO' + pin + ': ' + v)
  } catch {
    console.log('GPIO' + pin + ': unavailable')
  }
}

// 1-Wire presence
console.log('\\n--- 1-Wire ---')
const owPres = await device.onewire.reset()
console.log('1-Wire: ' + (owPres ? 'device present' : 'no device'))

console.log('\\n=== Check complete ===')`,
  },
  {
    name: 'I2C EEPROM Dump',
    description: 'Read and dump entire 24C02 EEPROM',
    code: `// Read entire 24C02 EEPROM (256 bytes) via I2C
const addr = 0x50  // 24C02 address
const totalBytes = 256
const chunkSize = 16

console.log('Dumping 24C02 EEPROM at 0x' + addr.toString(16) + '...')

const dump: number[] = []
for (let offset = 0; offset < totalBytes; offset += chunkSize) {
  const data = await device.i2c.read({
    channel: 0,
    addr,
    reg: offset,
    len: chunkSize,
  })
  dump.push(...data)
}

// Print hex dump
for (let i = 0; i < dump.length; i += 16) {
  const addr = i.toString(16).toUpperCase().padStart(4, '0')
  const hex = dump.slice(i, i + 16).map(b => b.toString(16).padStart(2, '0')).join(' ')
  const ascii = dump.slice(i, i + 16).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('')
  console.log(addr + '  ' + hex.padEnd(48) + '  ' + ascii)
}

console.log('\\nDump complete: ' + dump.length + ' bytes read.')`,
  },
]

export function getExampleByName(name: string): ScriptExample | undefined {
  return scriptExamples.find((e) => e.name === name)
}
