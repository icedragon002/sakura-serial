/**
 * probe-station — Macro Recorder
 *
 * Records user operations across protocol panels and generates
 * executable JavaScript script code from the recorded sequence.
 */

export interface MacroStep {
  timestamp: number
  protocol: string
  command: string
  params: Record<string, unknown>
}

export interface MacroRecording {
  startedAt: number
  steps: MacroStep[]
}

let activeRecording: MacroRecording | null = null

export function startRecording(): void {
  activeRecording = {
    startedAt: Date.now(),
    steps: [],
  }
}

export function stopRecording(): MacroRecording | null {
  const rec = activeRecording
  activeRecording = null
  return rec
}

export function isRecording(): boolean {
  return activeRecording !== null
}

export function recordStep(
  protocol: string,
  command: string,
  params: Record<string, unknown> = {}
): void {
  if (!activeRecording) return
  activeRecording.steps.push({
    timestamp: Date.now(),
    protocol,
    command,
    params,
  })
}

/**
 * Generate JavaScript code from a recorded macro.
 * The generated code uses the same ScriptDevice API that the Script panel
 * provides, so it can be copied directly into the Script editor and run.
 */
export function generateScript(recording: MacroRecording): string {
  const lines: string[] = [
    '// probe-station — Recorded Macro',
    `// Generated: ${new Date().toISOString()}`,
    `// Steps: ${recording.steps.length}`,
    '',
    '(async () => {',
  ]

  for (const step of recording.steps) {
    const { protocol, command, params } = step
    lines.push('')
    lines.push(`  // ${protocol} — ${command}`)

    switch (`${protocol}:${command}`) {
      /* I2C */
      case 'I2C:scan':
        lines.push(`  const addrs = await device.i2c.scan({ channel: ${params.channel ?? 0}, speed: ${params.speed ?? 400_000} })`)
        lines.push(`  console.log('I2C Scan:', addrs.map(a => '0x' + a.toString(16)).join(', '))`)
        break
      case 'I2C:read':
        lines.push(`  const i2cData = await device.i2c.read({ channel: ${params.channel ?? 0}, addr: ${params.addr ?? 0x68}, reg: ${params.reg ?? 0x00}, len: ${params.len ?? 8} })`)
        lines.push(`  console.log('I2C Read:', i2cData.map(b => b.toString(16).padStart(2, '0')).join(' '))`)
        break
      case 'I2C:write':
        lines.push(`  await device.i2c.write({ channel: ${params.channel ?? 0}, addr: ${params.addr ?? 0x68}, reg: ${params.reg ?? 0x00}, data: [${(params.data as number[] || []).join(', ')}] })`)
        break

      /* SPI */
      case 'SPI:transfer':
        lines.push(`  const spiData = await device.spi.transfer({ bus: ${params.bus ?? 0}, mode: ${params.mode ?? 0}, speedKHz: ${params.speedKHz ?? 1000}, cs: ${params.cs ?? 0}, data: [${(params.data as number[] || []).join(', ')}] })`)
        lines.push(`  console.log('SPI MISO:', spiData.map(b => b.toString(16).padStart(2, '0')).join(' '))`)
        break
      case 'SPI:csCtrl':
        lines.push(`  await device.spi.csControl(${params.bus ?? 0}, ${params.cs ?? 0}, ${params.state ?? 0})`)
        break

      /* UART */
      case 'UART:config':
        lines.push(`  await device.uart.config({ port: ${params.port ?? 0}, baud: ${params.baud ?? 115200}, dataBits: ${params.dataBits ?? 8}${params.parity && params.parity !== 'none' ? `, parity: '${params.parity}'` : ''}${params.stopBits !== 1 ? `, stopBits: ${params.stopBits}` : ''} })`)
        break
      case 'UART:write':
        if (params.text) {
          lines.push(`  await device.uart.write(${params.port ?? 0}, [...new TextEncoder().encode('${params.text}')])`)
        } else {
          lines.push(`  await device.uart.write(${params.port ?? 0}, [${(params.data as number[] || []).join(', ')}])`)
        }
        break
      case 'UART:read':
        lines.push(`  const uartData = await device.uart.read(${params.port ?? 0}, ${params.timeout ?? 100})`)
        lines.push(`  console.log('UART RX:', uartData.map(b => b.toString(16).padStart(2, '0')).join(' '))`)
        break

      /* CAN */
      case 'CAN:config':
        lines.push(`  await device.can.config({ bitrate: ${params.bitrate ?? 500_000}${params.mode ? `, mode: ${params.mode}` : ''}${params.fd ? ', fd: 1' : ''} })`)
        break
      case 'CAN:send':
        lines.push(`  await device.can.sendFrame({ id: ${params.id ?? 0x7E8}, data: [${(params.data as number[] || []).join(', ')}]${params.ide ? ', ide: 1' : ''} })`)
        break
      case 'CAN:monitorStart':
        lines.push(`  await device.can.startMonitor()`)
        break
      case 'CAN:monitorStop':
        lines.push(`  await device.can.stopMonitor()`)
        break

      /* 1-Wire */
      case '1W:reset':
        lines.push(`  const presence = await device.onewire.reset()`)
        lines.push(`  console.log('1-Wire presence:', presence)`)
        break
      case '1W:search':
        lines.push(`  const roms = await device.onewire.search()`)
        lines.push(`  console.log('1-Wire devices:', roms.map(r => r.map(b => b.toString(16).padStart(2, '0')).join(':')).join(', '))`)
        break
      case '1W:read':
        lines.push(`  const owData = await device.onewire.read([${(params.rom as number[] || [0,0,0,0,0,0,0,0]).join(', ')}], ${params.cmd ?? 0xBE}, ${params.len ?? 8})`)
        lines.push(`  console.log('1-Wire Read:', owData.map(b => b.toString(16).padStart(2, '0')).join(' '))`)
        break

      /* GPIO */
      case 'GPIO:config':
        lines.push(`  await device.gpio.config(${params.pin ?? 0}, ${params.mode ?? 1}, ${params.pull ?? 0})`)
        break
      case 'GPIO:write':
        lines.push(`  await device.gpio.write(${params.pin ?? 0}, ${params.value ?? 0})`)
        break
      case 'GPIO:read':
        lines.push(`  const gpioVal = await device.gpio.read(${params.pin ?? 0})`)
        lines.push(`  console.log('GPIO${params.pin ?? 0}:', gpioVal)`)
        break
      case 'GPIO:pwm':
        lines.push(`  await device.gpio.pwm(${params.pin ?? 0}, ${params.freq ?? 1000}, ${params.duty ?? 500})`)
        break

      /* LA */
      case 'LA:config':
        lines.push(`  await device.la.config({ channels: ${params.channels ?? 0xff}, sampleRateKHz: ${params.rate ?? 1000} })`)
        break
      case 'LA:start':
        lines.push(`  await device.la.start()`)
        break
      case 'LA:stop':
        lines.push(`  await device.la.stop()`)
        break

      default:
        lines.push(`  // Unknown step: ${protocol}:${command}`)
        break
    }
  }

  lines.push('')
  lines.push(`  console.log('Macro complete. ${recording.steps.length} steps executed.')`)
  lines.push('})()')

  return lines.join('\n')
}
