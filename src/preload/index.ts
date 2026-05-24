import { contextBridge, ipcRenderer } from 'electron'
import type { DeviceInfo, TransportConfig, ParsedFrame, DeviceSysInfo } from '../shared/transport'

/**
 * probe-station 桌面应用 preload 桥接
 *
 * 暴露 device API 给 renderer process，通过 IPC 与 main process 通信。
 * 上层使用 keyof 类型约束通道名，保证 main/preload/renderer 三方一致。
 */

const VALID_CHANNELS = [
  'device:list',
  'device:connect',
  'device:disconnect',
  'device:send',
  'device:is-open',
  'device:get-info',
] as const

const validChannels = (channel: string): channel is (typeof VALID_CHANNELS)[number] =>
  (VALID_CHANNELS as readonly string[]).includes(channel)

const invoke = <T>(channel: (typeof VALID_CHANNELS)[number], ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

const api = {
  /** List available devices (USB / WiFi / BLE) */
  listDevices: (): Promise<DeviceInfo[]> => invoke('device:list'),

  /** Connect to a device via the specified transport */
  connect: (config: TransportConfig): Promise<void> => invoke('device:connect', config),

  /** Disconnect from the device */
  disconnect: (): Promise<void> => invoke('device:disconnect'),

  /** Send a raw command frame and get the response frame.
   *  Low-level API — prefer using the typed command builders in renderer. */
  sendCommand: (type: number, payload: number[]): Promise<ParsedFrame> =>
    invoke('device:send', type, payload),

  /** Check if device is connected */
  isOpen: (): Promise<boolean> => invoke('device:is-open'),

  /** Get device system info (firmware version, supported protocols, etc.) */
  getDeviceInfo: (): Promise<DeviceSysInfo> => invoke('device:get-info'),

  // ── Event listeners ────────────────────────────────

  /** Async events from device (CAN frames, GPIO changes, UART data, etc.) */
  onAsyncEvent: (callback: (eventType: number, payload: number[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, eventType: number, payload: number[]) =>
      callback(eventType, payload)
    ipcRenderer.on('device:async-event', listener)
    return () => ipcRenderer.removeListener('device:async-event', listener)
  },

  /** Connection status changes */
  onStatusChange: (callback: (status: 'connected' | 'disconnected' | 'error', detail?: string) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: 'connected' | 'disconnected' | 'error',
      detail?: string
    ) => callback(status, detail)
    ipcRenderer.on('device:status', listener)
    return () => ipcRenderer.removeListener('device:status', listener)
  },

  // ── Window controls (keep from sakura-serial) ──────

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
}

contextBridge.exposeInMainWorld('deviceApi', api)

export type DeviceApi = typeof api
