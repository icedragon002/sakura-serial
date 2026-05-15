import { contextBridge, ipcRenderer } from 'electron'

export interface SerialPortInfo {
  path: string
  manufacturer: string
  serialNumber: string
  pnpId: string
  vendorId: string
  productId: string
  friendlyName: string
}

export interface SerialConfig {
  path: string
  baudRate: number
  dataBits: 5 | 6 | 7 | 8
  stopBits: 1 | 1.5 | 2
  parity: 'none' | 'even' | 'odd' | 'mark' | 'space'
  flowControl: 'none' | 'rtscts' | 'xon/xoff'
}

export interface SerialData {
  type: 'raw'
  data: string
  hex: string
  timestamp: number
}

const api = {
  // Serial operations
  listPorts: (): Promise<SerialPortInfo[]> => ipcRenderer.invoke('serial:list'),
  openPort: (config: SerialConfig): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:open', config),
  closePort: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:close'),
  writeData: (
    data: string,
    isHex: boolean
  ): Promise<{ success: boolean; error?: string; bytesWritten?: number }> =>
    ipcRenderer.invoke('serial:write', data, isHex),
  setDtr: (state: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:set-dtr', state),
  setRts: (state: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('serial:set-rts', state),
  isOpen: (): Promise<boolean> => ipcRenderer.invoke('serial:is-open'),

  // Event listeners
  onSerialData: (callback: (data: SerialData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: SerialData) => callback(data)
    ipcRenderer.on('serial:data', listener)
    return () => ipcRenderer.removeListener('serial:data', listener)
  },
  onSerialError: (callback: (error: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => callback(error)
    ipcRenderer.on('serial:error', listener)
    return () => ipcRenderer.removeListener('serial:error', listener)
  },
  onSerialStatus: (callback: (status: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
    ipcRenderer.on('serial:status', listener)
    return () => ipcRenderer.removeListener('serial:status', listener)
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close')
}

contextBridge.exposeInMainWorld('api', api)

export type SerialApi = typeof api
