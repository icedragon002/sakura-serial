/**
 * Sakura Serial — Native BLE via Windows PowerShell
 *
 * Uses Windows 10+ Bluetooth PowerShell cmdlets for BLE scanning.
 * No native addons, no compilation, no browser popups.
 */

import { exec } from 'child_process'

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

/**
 * Scan for BLE devices using Windows Bluetooth PowerShell.
 */
export async function startBleScan(
  onDevice: (device: BleDevice) => void,
  durationMs = 5000
): Promise<BleDevice[]> {
  const script = `
[Windows.Devices.Radios.Radio, Windows.System, ContentType = WindowsRuntime] | Out-Null
[Windows.Devices.Radios.RadioAccessStatus, Windows.System, ContentType = WindowsRuntime] | Out-Null
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$async = [Windows.Devices.Radios.Radio]::RequestAccessAsync()
while (-not $async.AsTask().IsCompleted) { Start-Sleep -Milliseconds 50 }
$watcher = [Windows.Devices.Bluetooth.Advertisement.BluetoothLEAdvertisementWatcher]::new()
$devices = @{}
$done = $false
$reg = Register-ObjectEvent -InputObject $watcher -EventName Received -Action {
  $d = $Event.SourceEventArgs.BluetoothAddress
  $key = [string]$d
  if (-not $devices.ContainsKey($key)) {
    $info = @{
      id = [string]$d
      address = ('{0:X2}:{1:X2}:{2:X2}:{3:X2}:{4:X2}:{5:X2}' -f ($d -shr 40 -band 0xFF),($d -shr 32 -band 0xFF),($d -shr 24 -band 0xFF),($d -shr 16 -band 0xFF),($d -shr 8 -band 0xFF),($d -band 0xFF))
      name = $Event.SourceEventArgs.Advertisement.LocalName
      rssi = $Event.SourceEventArgs.RawSignalStrengthInDBm
    }
    $devices[$key] = $info
    Write-Host "DEVICE:$($info | ConvertTo-Json -Compress)"
  }
}
$watcher.Start()
Start-Sleep -Seconds ${Math.ceil(durationMs / 1000)}
$watcher.Stop()
Unregister-Event -SourceIdentifier $reg.Name -ErrorAction SilentlyContinue
`

  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
      { timeout: durationMs + 5000 },
      (error, stdout) => {
        const devices: BleDevice[] = []
        if (stdout) {
          for (const line of stdout.split('\n')) {
            if (line.startsWith('DEVICE:')) {
              try {
                const info = JSON.parse(line.slice(7))
                const d: BleDevice = {
                  id: info.id,
                  name: info.name || 'Unknown',
                  address: info.address,
                  addressType: 'public',
                  rssi: info.rssi || -100,
                  connectable: true,
                }
                devices.push(d)
                onDevice(d)
              } catch { /* skip parse errors */ }
            }
          }
        }
        resolve(devices)
      }
    )
  })
}

export function stopBleScan(): void {
  // PowerShell process is terminated by timeout
}

// Placeholder — actual GATT operations need a native BLE stack.
// Use the BLE Explorer panel for GATT browsing via Web Bluetooth,
// or install @abandonware/noble (requires VS Build Tools) for full native BLE.

let connected = false

export async function connectBle(_deviceId: string): Promise<void> {
  throw new Error('Native BLE GATT requires @abandonware/noble. Install VS Build Tools to compile native addons.')
}

export async function disconnectBle(): Promise<void> {
  connected = false
}

export function isBleConnected(): boolean {
  return connected
}

export async function discoverServices(): Promise<BleGattService[]> {
  throw new Error('Native BLE GATT requires @abandonware/noble.')
}

export async function readCharacteristic(_svc: string, _ch: string): Promise<number[]> {
  throw new Error('Native BLE GATT requires @abandonware/noble.')
}

export async function writeCharacteristic(_svc: string, _ch: string, _d: number[], _wo?: boolean): Promise<void> {
  throw new Error('Native BLE GATT requires @abandonware/noble.')
}

export async function subscribeCharacteristic(_svc: string, _ch: string, _on: (d: number[]) => void): Promise<void> {
  throw new Error('Native BLE GATT requires @abandonware/noble.')
}

export async function unsubscribeCharacteristic(_svc: string, _ch: string): Promise<void> {
  throw new Error('Native BLE GATT requires @abandonware/noble.')
}

export async function readRssi(): Promise<number> {
  throw new Error('Native BLE GATT requires @abandonware/noble.')
}
