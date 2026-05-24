/**
 * Sakura Serial — Native BLE via Windows.Devices.Bluetooth + PowerShell
 *
 * Zero native addons. Uses Windows 10+ built-in BLE APIs through PowerShell.
 * Scan → connect → GATT browse → R/W → notify, all without browser popups.
 */

import { spawn, exec } from 'child_process'

export interface BleDevice {
  id: string
  name: string
  address: string
  addressType: string
  rssi: number
  connectable: boolean
}

export interface BleGattService {
  uuid: string
  characteristics: BleGattChar[]
}

export interface BleGattChar {
  uuid: string
  properties: string[]
}

/* ═══════════════════════════════════════════════════
   PowerShell Runner
   ═══════════════════════════════════════════════════ */

function psExec(script: string, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) reject(err)
        else resolve(stdout || '')
      }
    )
  })
}

/* ═══════════════════════════════════════════════════
   Scan
   ═══════════════════════════════════════════════════ */

export async function startBleScan(
  onDevice: (device: BleDevice) => void,
  durationMs = 5000
): Promise<BleDevice[]> {
  const script = `
$watcher = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher]::new()
$devices = @{}
$reg = Register-ObjectEvent -InputObject $watcher -EventName Received -Action {
  $d = $Event.SourceEventArgs.BluetoothAddress
  $key = [string]$d
  if (-not $devices.ContainsKey($key)) {
    $info = @{
      id = [string]$d
      address = ('{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}' -f (($d -shr 40) -band 0xFF),(($d -shr 32) -band 0xFF),(($d -shr 24) -band 0xFF),(($d -shr 16) -band 0xFF),(($d -shr 8) -band 0xFF),($d -band 0xFF))
      name = $Event.SourceEventArgs.Advertisement.LocalName
      rssi = $Event.SourceEventArgs.RawSignalStrengthInDBm
    }
    $devices[$key] = $info
    Write-Host ('DEVICE:' + ($info | ConvertTo-Json -Compress))
  }
}
$watcher.Start()
Start-Sleep -Seconds ${Math.ceil(durationMs / 1000)}
$watcher.Stop()
Unregister-Event -SourceIdentifier $reg.Name -ErrorAction SilentlyContinue
`

  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`,
      { timeout: durationMs + 10000 },
      (_, stdout) => {
        const devices: BleDevice[] = []
        if (stdout) {
          for (const line of stdout.split('\n')) {
            if (line.startsWith('DEVICE:')) {
              try {
                const info = JSON.parse(line.slice(7))
                const d: BleDevice = {
                  id: info.id, name: info.name || 'Unknown',
                  address: info.address, addressType: 'public',
                  rssi: info.rssi || -100, connectable: true,
                }
                devices.push(d)
              } catch { /* skip */ }
            }
          }
        }
        for (const d of devices) onDevice(d)
        resolve(devices)
      }
    )
  })
}

export function stopBleScan(): void { /* scan stops by timeout */ }

/* ═══════════════════════════════════════════════════
   Connection
   ═══════════════════════════════════════════════════ */

let connectedAddr: string | null = null

export async function connectBle(addressOrId: string): Promise<void> {
  // Convert address string (XX:XX:XX:XX:XX:XX) to 64-bit int
  const addrHex = addressOrId.includes(':')
    ? '0x' + addressOrId.replace(/:/g, '')
    : addressOrId.startsWith('0x') ? addressOrId : '0x' + addressOrId

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$addr = [uint64]${addrHex}
$task = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)
while (-not $task.AsTask().Wait(10000)) { }
$device = $task.GetResults()
if ($device) {
  Write-Host 'CONNECTED:' $device.Name
  Write-Host 'BLEDEV:' ($device.BluetoothAddress.ToString())
} else {
  Write-Host 'ERROR:Device not found'
}
$device.Dispose()
`

  const out = await psExec(script, 15000)
  if (out.includes('ERROR:')) throw new Error(out.split('ERROR:')[1]?.trim() || 'Connection failed')
  if (!out.includes('CONNECTED:')) throw new Error('Connection failed — no response')
  connectedAddr = addressOrId
}

export async function disconnectBle(): Promise<void> {
  connectedAddr = null
}

export function isBleConnected(): boolean {
  return connectedAddr !== null
}

/* ═══════════════════════════════════════════════════
   GATT Operations
   ═══════════════════════════════════════════════════ */

export async function discoverServices(): Promise<BleGattService[]> {
  if (!connectedAddr) throw new Error('Not connected')

  const addrHex = connectedAddr.includes(':')
    ? '0x' + connectedAddr.replace(/:/g, '')
    : '0x' + connectedAddr

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$addr = [uint64]${addrHex}
$task = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)
while (-not $task.AsTask().Wait(10000)) { }
$dev = $task.GetResults()
$svcTask = $dev.GetGattServicesAsync()
while (-not $svcTask.AsTask().Wait(10000)) { }
$svcs = $svcTask.GetResults().Services
$result = @()
foreach ($s in $svcs) {
  $charTask = $s.GetCharacteristicsAsync()
  while (-not $charTask.AsTask().Wait(10000)) { }
  $chars = $charTask.GetResults().Characteristics
  $charList = @()
  foreach ($c in $chars) {
    $props = @()
    $cp = $c.CharacteristicProperties
    if ($cp.HasFlag([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Read)) { $props += 'read' }
    if ($cp.HasFlag([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Write)) { $props += 'write' }
    if ($cp.HasFlag([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::WriteWithoutResponse)) { $props += 'writeWithoutResponse' }
    if ($cp.HasFlag([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Notify)) { $props += 'notify' }
    if ($cp.HasFlag([Windows.Devices.Bluetooth.GenericAttributeProfile.GattCharacteristicProperties]::Indicate)) { $props += 'indicate' }
    $charList += @{ uuid = $c.Uuid.ToString(); properties = $props }
  }
  $result += @{ uuid = $s.Uuid.ToString(); characteristics = $charList }
}
$dev.Dispose()
Write-Host 'RESULT:' ($result | ConvertTo-Json -Compress -Depth 4)
`

  const out = await psExec(script, 20000)
  const match = out.match(/RESULT:(.+)/s)
  if (!match) throw new Error('Failed to discover services')
  return JSON.parse(match[1].trim())
}

export async function readCharacteristic(
  serviceUuid: string, charUuid: string
): Promise<number[]> {
  if (!connectedAddr) throw new Error('Not connected')

  const addrHex = connectedAddr.includes(':')
    ? '0x' + connectedAddr.replace(/:/g, '')
    : '0x' + connectedAddr

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$addr = [uint64]${addrHex}
$task = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)
while (-not $task.AsTask().Wait(10000)) { }
$dev = $task.GetResults()
$svcs = $dev.GetGattServicesAsync().GetResults().Services
$char = $null
foreach ($s in $svcs) {
  if ($s.Uuid.ToString() -eq '${serviceUuid}') {
    $chars = $s.GetCharacteristicsAsync().GetResults().Characteristics
    foreach ($c in $chars) {
      if ($c.Uuid.ToString() -eq '${charUuid}') { $char = $c; break }
    }
    break
  }
}
if (-not $char) { Write-Host 'ERROR:Characteristic not found'; $dev.Dispose(); return }
$readTask = $char.ReadValueAsync()
while (-not $readTask.AsTask().Wait(10000)) { }
$result = $readTask.GetResults()
if ($result.Status -eq [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus]::Success) {
  $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($result.Value)
  $bytes = New-Object byte[] ($reader.UnconsumedBufferLength)
  $reader.ReadBytes($bytes)
  $hex = [System.BitConverter]::ToString($bytes).Replace('-',' ')
  Write-Host 'VALUE:' $hex
} else {
  Write-Host 'ERROR:Read failed:' $result.Status
}
$dev.Dispose()
`

  const out = await psExec(script, 15000)
  const match = out.match(/VALUE:\s*(.+)/)
  if (!match) throw new Error('Read failed: ' + (out.match(/ERROR:(.+)/)?.[1] || 'unknown'))
  return match[1].trim().split(' ').map((b) => parseInt(b, 16))
}

export async function writeCharacteristic(
  serviceUuid: string, charUuid: string, data: number[], withoutResponse = false
): Promise<void> {
  if (!connectedAddr) throw new Error('Not connected')

  const addrHex = connectedAddr.includes(':')
    ? '0x' + connectedAddr.replace(/:/g, '')
    : '0x' + connectedAddr
  const hexData = data.map((b) => b.toString(16).padStart(2, '0')).join(' ')

  const writeOpt = withoutResponse
    ? '[Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteOption]::WriteWithoutResponse'
    : '[Windows.Devices.Bluetooth.GenericAttributeProfile.GattWriteOption]::WriteWithResponse'

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$addr = [uint64]${addrHex}
$task = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)
while (-not $task.AsTask().Wait(10000)) { }
$dev = $task.GetResults()
$svcs = $dev.GetGattServicesAsync().GetResults().Services
$char = $null
foreach ($s in $svcs) {
  if ($s.Uuid.ToString() -eq '${serviceUuid}') {
    $chars = $s.GetCharacteristicsAsync().GetResults().Characteristics
    foreach ($c in $chars) {
      if ($c.Uuid.ToString() -eq '${charUuid}') { $char = $c; break }
    }
    break
  }
}
if (-not $char) { Write-Host 'ERROR:Characteristic not found'; $dev.Dispose(); return }
$writer = [Windows.Storage.Streams.DataWriter]::new()
[byte[]]$bytes = @(${data.join(',')})
$writer.WriteBytes($bytes)
$writeTask = $char.WriteValueAsync($writer.DetachBuffer(), ${writeOpt})
while (-not $writeTask.AsTask().Wait(10000)) { }
$result = $writeTask.GetResults()
if ($result -eq [Windows.Devices.Bluetooth.GenericAttributeProfile.GattCommunicationStatus]::Success) {
  Write-Host 'WRITE OK'
} else {
  Write-Host 'ERROR:Write failed:' $result
}
$dev.Dispose()
`

  const out = await psExec(script, 15000)
  if (!out.includes('WRITE OK')) throw new Error(out.match(/ERROR:(.+)/)?.[1]?.trim() || 'Write failed')
}

export async function subscribeCharacteristic(
  serviceUuid: string, charUuid: string, onData: (data: number[]) => void
): Promise<void> {
  // For notifications, we need a persistent PowerShell process.
  // This implementation connects, subscribes, and keeps the session alive.
  if (!connectedAddr) throw new Error('Not connected')

  const addrHex = connectedAddr.includes(':')
    ? '0x' + connectedAddr.replace(/:/g, '')
    : '0x' + connectedAddr

  const script = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$addr = [uint64]${addrHex}
$task = [Windows.Devices.Bluetooth.BluetoothLEDevice]::FromBluetoothAddressAsync($addr)
while (-not $task.AsTask().Wait(10000)) { }
$dev = $task.GetResults()
$svcs = $dev.GetGattServicesAsync().GetResults().Services
$char = $null
foreach ($s in $svcs) {
  if ($s.Uuid.ToString() -eq '${serviceUuid}') {
    $chars = $s.GetCharacteristicsAsync().GetResults().Characteristics
    foreach ($c in $chars) {
      if ($c.Uuid.ToString() -eq '${charUuid}') { $char = $c; break }
    }
    break
  }
}
if (-not $char) { Write-Host 'ERROR:Characteristic not found'; return }
$session = New-Object Windows.Devices.Bluetooth.GenericAttributeProfile.GattSession
$cccTask = $char.WriteClientCharacteristicConfigurationDescriptorAsync(
  [Windows.Devices.Bluetooth.GenericAttributeProfile.GattClientCharacteristicConfigurationDescriptorValue]::Notify)
while (-not $cccTask.AsTask().Wait(5000)) { }
$char.add_ValueChanged({
  $reader = [Windows.Storage.Streams.DataReader]::FromBuffer($args[0].CharacteristicValue)
  $bytes = New-Object byte[] ($reader.UnconsumedBufferLength)
  $reader.ReadBytes($bytes)
  $hex = [System.BitConverter]::ToString($bytes).Replace('-',' ')
  Write-Host 'NOTIFY:' $hex
})
Write-Host 'SUBSCRIBED'
# Keep alive
while ($true) { Start-Sleep -Seconds 1 }
`

  const ps = spawn('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script
  ])

  ps.stdout.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (line.startsWith('NOTIFY:')) {
        const hex = line.slice(7).trim()
        if (hex) {
          onData(hex.split(' ').map((b) => parseInt(b, 16)))
        }
      }
    }
  })

  ps.stderr.on('data', (d: Buffer) => { /* ignore PS warnings */ })

  // Store process reference for cleanup
  ;(global as any).__ble_sub_process = ps
}

export async function unsubscribeCharacteristic(
  _serviceUuid: string, _charUuid: string
): Promise<void> {
  const ps: import('child_process').ChildProcess | undefined = (global as any).__ble_sub_process
  if (ps) {
    ps.kill()
    delete (global as any).__ble_sub_process
  }
}

export async function readRssi(): Promise<number> {
  if (!connectedAddr) throw new Error('Not connected')
  // RSSI from BluetoothLEAdvertisementWatcher stored from last scan
  // Return placeholder — Windows BLE API doesn't expose direct RSSI after connection
  return -50
}
