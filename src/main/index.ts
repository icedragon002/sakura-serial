import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { SerialPort } from 'serialport'

let mainWindow: BrowserWindow | null = null
let serialPort: SerialPort | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0821',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
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
  electronApp.setAppUserModelId('com.sakura.serial')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (serialPort?.isOpen) {
    serialPort.close()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// ─── Serial Port IPC Handlers ───────────────────────────────────

ipcMain.handle('serial:list', async () => {
  try {
    const ports = await SerialPort.list()
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer || '',
      serialNumber: p.serialNumber || '',
      pnpId: p.pnpId || '',
      vendorId: p.vendorId || '',
      productId: p.productId || '',
      friendlyName: p.friendlyName || ''
    }))
  } catch (err) {
    console.error('Failed to list ports:', err)
    return []
  }
})

ipcMain.handle(
  'serial:open',
  async (
    _event,
    config: {
      path: string
      baudRate: number
      dataBits: 5 | 6 | 7 | 8
      stopBits: 1 | 1.5 | 2
      parity: 'none' | 'even' | 'odd' | 'mark' | 'space'
      flowControl: 'none' | 'rtscts' | 'xon/xoff'
    }
  ) => {
    try {
      if (serialPort?.isOpen) {
        serialPort.close()
      }

      serialPort = new SerialPort({
        path: config.path,
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        rtscts: config.flowControl === 'rtscts',
        xon: config.flowControl === 'xon/xoff',
        xoff: config.flowControl === 'xon/xoff',
        autoOpen: false
      })

      return new Promise((resolve, reject) => {
        serialPort!.open((err) => {
          if (err) {
            serialPort = null
            reject(err.message)
            return
          }

          serialPort!.on('data', (data: Buffer) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('serial:data', {
                type: 'raw',
                data: data.toString('utf8'),
                hex: data.toString('hex'),
                timestamp: Date.now()
              })
            }
          })

          serialPort!.on('error', (err) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('serial:error', err.message)
            }
          })

          serialPort!.on('close', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('serial:status', 'closed')
            }
          })

          resolve({ success: true })
        })
      })
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
)

ipcMain.handle('serial:close', async () => {
  try {
    if (serialPort?.isOpen) {
      serialPort.close()
      serialPort = null
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:write', async (_event, data: string, isHex: boolean) => {
  try {
    if (!serialPort?.isOpen) {
      return { success: false, error: 'Port not open' }
    }

    const buffer = isHex
      ? Buffer.from(data.replace(/\s/g, ''), 'hex')
      : Buffer.from(data, 'utf8')

    return new Promise((resolve, reject) => {
      serialPort!.write(buffer, (err) => {
        if (err) {
          reject(err.message)
        } else {
          serialPort!.drain((drainErr) => {
            if (drainErr) {
              reject(drainErr.message)
            } else {
              resolve({ success: true, bytesWritten: buffer.length })
            }
          })
        }
      })
    })
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:set-dtr', async (_event, state: boolean) => {
  try {
    if (!serialPort?.isOpen) {
      return { success: false, error: 'Port not open' }
    }
    serialPort.set({ dtr: state })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:set-rts', async (_event, state: boolean) => {
  try {
    if (!serialPort?.isOpen) {
      return { success: false, error: 'Port not open' }
    }
    serialPort.set({ rts: state })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('serial:is-open', async () => {
  return serialPort?.isOpen ?? false
})

// ─── Window Controls ────────────────────────────────────────────

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
