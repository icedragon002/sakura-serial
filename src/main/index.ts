/**
 * probe-station 桌面应用 — Electron 主进程
 *
 * 职责:
 *   - 窗口创建与管理 (无框窗口 + 自定义标题栏)
 *   - Session 管理 (USB/TCP 传输 + 帧协议处理)
 *   - IPC 桥接 (renderer ↔ main process)
 *   - 异步事件转发 (设备 → UI)
 */

import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import { Session } from '../shared/transport'
import type { TransportConfig, DeviceInfo } from '../shared/transport'
import { UsbTransport, listUsbDevices } from './usb-transport'
import { TcpTransport } from './tcp-transport'
import { scanMdnsDevices, type MdnsDevice } from './mdns-discovery'
import { autoUpdater } from 'electron-updater'
import {
  startBleScan, stopBleScan, connectBle, disconnectBle,
  isBleConnected, discoverServices, readCharacteristic,
  writeCharacteristic, subscribeCharacteristic, unsubscribeCharacteristic, readRssi,
  type BleDevice,
} from './ble-native'

let mainWindow: BrowserWindow | null = null
let session: Session | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1230',
    title: 'Sakura Serial',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.maximize()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.sakuraserial.desktop')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  registerIpcHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // Auto-update (only in production builds)
  if (!is.dev) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    // Check every 6 hours
    setInterval(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    }, 6 * 60 * 60 * 1000)
  }
})

app.on('window-all-closed', () => {
  if (session?.isOpen) {
    session.close().catch(() => {})
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/* ═══════════════════════════════════════════════════
   IPC Handlers
   ═══════════════════════════════════════════════════ */

function notifyStatus(status: 'connected' | 'disconnected' | 'error', detail?: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('device:status', status, detail)
  }
}

function notifyAsyncEvent(eventType: number, payload: Uint8Array): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('device:async-event', eventType, Array.from(payload))
  }
}

function registerIpcHandlers(): void {
  /* ── device:list ─────────────────────────────────── */
  ipcMain.handle('device:list', async (): Promise<DeviceInfo[]> => {
    const devices: DeviceInfo[] = []

    // USB CDC devices (serial ports)
    try {
      const ports = await listUsbDevices()
      for (const p of ports) {
        devices.push({
          id: `usb:${p.path}`,
          type: 'usb',
          name: p.manufacturer || p.serialNumber || p.path,
          path: p.path,
          manufacturer: p.manufacturer,
          serialNumber: p.serialNumber,
          detail: p.path,
        })
      }
    } catch (err) {
      console.error('Failed to list USB devices:', err)
    }

    // WiFi — mDNS/Bonjour scan
    try {
      const mdnsDevices = await scanMdnsDevices(3000)
      for (const d of mdnsDevices) {
        devices.push({
          id: `wifi:${d.host}:${d.port}`,
          type: 'wifi',
          name: d.name || `probe-station @ ${d.host}`,
          path: `${d.host}:${d.port}`,
          detail: `${d.host}:${d.port}`,
        })
      }
    } catch (err) {
      console.error('Failed to scan mDNS devices:', err)
    }

    // BLE — not yet implemented (requires Web Bluetooth or node-ble)

    return devices
  })

  /* ── device:connect ──────────────────────────────── */
  ipcMain.handle('device:connect', async (_event, config: TransportConfig) => {
    // Close existing session
    if (session) {
      await session.close().catch(() => {})
      session = null
    }

    // Create appropriate transport
    let transport
    switch (config.type) {
      case 'usb':
        transport = new UsbTransport()
        break
      case 'wifi':
        transport = new TcpTransport()
        break
      case 'ble':
        // BLE transport runs in renderer (Web Bluetooth). Main process
        // acknowledges the connection; commands are proxied from renderer.
        session = null // BLE session lives in renderer
        notifyStatus('connected')
        return // no need to create transport here
      default:
        throw new Error(`Unsupported transport type: ${config.type}`)
    }

    session = new Session(transport, {
      timeout: 1000,
      maxRetries: 3,
      pingInterval: 5000,
    })

    // Forward async events to renderer
    session.onAsyncEvent((type, payload) => {
      notifyAsyncEvent(type, payload)
    })

    session.onSessionClose(() => {
      notifyStatus('disconnected')
    })

    session.onSessionError((err) => {
      notifyStatus('error', err.message)
    })

    await session.open(config)
    notifyStatus('connected')
  })

  /* ── device:disconnect ───────────────────────────── */
  ipcMain.handle('device:disconnect', async () => {
    if (session) {
      await session.close()
      session = null
    }
    notifyStatus('disconnected')
  })

  /* ── device:send ──────────────────────────────────── */
  ipcMain.handle('device:send', async (_event, type: number, payload: number[]) => {
    if (!session?.isOpen) {
      throw new Error('Device not connected')
    }
    const resp = await session.sendCommand(type, new Uint8Array(payload))
    return {
      type: resp.type,
      seq: resp.seq,
      payload: Array.from(resp.payload),
    }
  })

  /* ── device:is-open ──────────────────────────────── */
  ipcMain.handle('device:is-open', async () => {
    return session?.isOpen ?? false
  })

  /* ── device:get-info ─────────────────────────────── */
  ipcMain.handle('device:get-info', async () => {
    if (!session?.isOpen) {
      throw new Error('Device not connected')
    }
    return session.getDeviceInfo()
  })

  /* ── BLE (Native) ──────────────────────────────────── */
  ipcMain.handle('ble:scan', async (_event, durationMs: number) => {
    const devices: BleDevice[] = []
    try {
      await startBleScan((d) => {
        devices.push(d)
        mainWindow?.webContents.send('ble:device-found', d)
      }, durationMs || 5000)
    } catch (err) {
      console.error('BLE scan failed:', err)
    }
    return devices
  })

  ipcMain.handle('ble:stop-scan', async () => {
    stopBleScan()
  })

  ipcMain.handle('ble:connect', async (_event, deviceId: string) => {
    await connectBle(deviceId)
    mainWindow?.webContents.send('ble:status', 'connected')
  })

  ipcMain.handle('ble:disconnect', async () => {
    await disconnectBle()
    mainWindow?.webContents.send('ble:status', 'disconnected')
  })

  ipcMain.handle('ble:is-connected', async () => isBleConnected())

  ipcMain.handle('ble:services', async () => {
    return discoverServices()
  })

  ipcMain.handle('ble:read', async (_event, svcUuid: string, charUuid: string) => {
    return readCharacteristic(svcUuid, charUuid)
  })

  ipcMain.handle('ble:write', async (_event, svcUuid: string, charUuid: string, data: number[], woResp: boolean) => {
    await writeCharacteristic(svcUuid, charUuid, data, woResp)
  })

  ipcMain.handle('ble:subscribe', async (_event, svcUuid: string, charUuid: string) => {
    await subscribeCharacteristic(svcUuid, charUuid, (data) => {
      mainWindow?.webContents.send('ble:notify', svcUuid, charUuid, Array.from(data))
    })
  })

  ipcMain.handle('ble:unsubscribe', async (_event, svcUuid: string, charUuid: string) => {
    await unsubscribeCharacteristic(svcUuid, charUuid)
  })

  ipcMain.handle('ble:rssi', async () => {
    return readRssi()
  })

  /* ── Window Controls ──────────────────────────────── */
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
}
