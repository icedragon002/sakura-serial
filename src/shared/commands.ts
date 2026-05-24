/**
 * probe-station 二进制帧协议 — 命令/响应/错误码定义
 * 与 firmware/shared/commands.h 保持同步 (v1.3)
 */

/* ── Frame Constants ─────────────────────────────── */
export const FRAME_SYNC = 0xa5
export const FRAME_ESC = 0xa6
export const ESC_SYNC = 0x01
export const ESC_ESC = 0x02

export const CRC16_POLY = 0x1021

export const FRAME_HEADER_SIZE = 5 // sync(1) + length(2) + type(1) + seq(1)
export const FRAME_CRC_SIZE = 2
export const FRAME_MAX_PAYLOAD = 2048
export const FRAME_MAX_SIZE = FRAME_HEADER_SIZE + FRAME_MAX_PAYLOAD + FRAME_CRC_SIZE

export const CMD_QUEUE_DEPTH = 32

/* ── Command Types ────────────────────────────────── */

/** Batch */
export const CMD_BATCH = 0x0f

/** System: 0x10-0x1F */
export const CMD_PING = 0x10
export const CMD_GET_INFO = 0x11
export const CMD_RESET_RP2350 = 0x12
export const CMD_SET_VREF = 0x13
export const CMD_GET_VREF = 0x14
export const CMD_ENTER_BOOT = 0x15
export const CMD_ENTER_RP2350_BOOT = 0x16
export const CMD_ASYNC_ENABLE = 0x17
export const CMD_ASYNC_DISABLE = 0x18

/** I2C: 0x20-0x2F */
export const CMD_I2C_SCAN = 0x20
export const CMD_I2C_READ = 0x21
export const CMD_I2C_WRITE = 0x22
export const CMD_I2C_WRITE_READ = 0x23

/** SPI: 0x30-0x3F */
export const CMD_SPI_TRANSFER = 0x30
export const CMD_SPI_CS_CTRL = 0x31

/** UART: 0x40-0x4F */
export const CMD_UART_CFG = 0x40
export const CMD_UART_WRITE = 0x41
export const CMD_UART_READ = 0x42
export const CMD_UART_BREAK = 0x43

/** CAN: 0x50-0x5F */
export const CMD_CAN_CFG = 0x50
export const CMD_CAN_SEND = 0x51
export const CMD_CAN_FILTER = 0x52
export const CMD_CAN_MONITOR = 0x53

/** 1-Wire: 0x60-0x6F */
export const CMD_OW_RESET = 0x60
export const CMD_OW_SEARCH = 0x61
export const CMD_OW_READ = 0x62
export const CMD_OW_WRITE = 0x63

/** GPIO: 0x70-0x7F */
export const CMD_GPIO_CFG = 0x70
export const CMD_GPIO_WRITE = 0x71
export const CMD_GPIO_READ = 0x72
export const CMD_GPIO_PWM = 0x73

/** Logic Analyzer: 0x80-0x8F */
export const CMD_LA_CFG = 0x80
export const CMD_LA_START = 0x81
export const CMD_LA_STOP = 0x82
export const CMD_LA_DATA = 0x83
export const CMD_LA_STATUS = 0x84
export const CMD_LA_STREAM_MODE = 0x85

/** Responses */
export const RESP_ACK = 0x80
export const RESP_NAK = 0xff

/** Async Event */
export const ASYNC_EVENT = 0xe0

/* ── Error Codes ──────────────────────────────────── */
export const ERR_TIMEOUT = 0x0001
export const ERR_CRC = 0x0002
export const ERR_PARAM = 0x0003
export const ERR_BUSY = 0x0004
export const ERR_HARDWARE = 0x0005
export const ERR_NOT_SUPPORTED = 0x0006
export const ERR_BUS_ERROR = 0x0007
export const ERR_RP2350_DEAD = 0x0008
export const ERR_OVERFLOW = 0x0009
export const ERR_DISCONNECTED = 0x000a

/* ── Async Event Types ────────────────────────────── */
export const EVENT_CAN_FRAME_RX = 0x01
export const EVENT_GPIO_CHANGE = 0x02
export const EVENT_UART_DATA = 0x03
export const EVENT_OVERCURRENT = 0x04
export const EVENT_THERMAL_WARNING = 0x05
export const EVENT_DISCONNECT = 0x06

/* ── Lookup Maps ──────────────────────────────────── */
export const COMMAND_NAMES: Record<number, string> = {
  [CMD_BATCH]: 'BATCH',
  [CMD_PING]: 'PING',
  [CMD_GET_INFO]: 'GET_INFO',
  [CMD_RESET_RP2350]: 'RESET_RP2350',
  [CMD_SET_VREF]: 'SET_VREF',
  [CMD_GET_VREF]: 'GET_VREF',
  [CMD_ENTER_BOOT]: 'ENTER_BOOT',
  [CMD_ENTER_RP2350_BOOT]: 'ENTER_RP2350_BOOT',
  [CMD_ASYNC_ENABLE]: 'ASYNC_ENABLE',
  [CMD_ASYNC_DISABLE]: 'ASYNC_DISABLE',
  [CMD_I2C_SCAN]: 'I2C_SCAN',
  [CMD_I2C_READ]: 'I2C_READ',
  [CMD_I2C_WRITE]: 'I2C_WRITE',
  [CMD_I2C_WRITE_READ]: 'I2C_WRITE_READ',
  [CMD_SPI_TRANSFER]: 'SPI_TRANSFER',
  [CMD_SPI_CS_CTRL]: 'SPI_CS_CTRL',
  [CMD_UART_CFG]: 'UART_CFG',
  [CMD_UART_WRITE]: 'UART_WRITE',
  [CMD_UART_READ]: 'UART_READ',
  [CMD_UART_BREAK]: 'UART_BREAK',
  [CMD_CAN_CFG]: 'CAN_CFG',
  [CMD_CAN_SEND]: 'CAN_SEND',
  [CMD_CAN_FILTER]: 'CAN_FILTER',
  [CMD_CAN_MONITOR]: 'CAN_MONITOR',
  [CMD_OW_RESET]: 'OW_RESET',
  [CMD_OW_SEARCH]: 'OW_SEARCH',
  [CMD_OW_READ]: 'OW_READ',
  [CMD_OW_WRITE]: 'OW_WRITE',
  [CMD_GPIO_CFG]: 'GPIO_CFG',
  [CMD_GPIO_WRITE]: 'GPIO_WRITE',
  [CMD_GPIO_READ]: 'GPIO_READ',
  [CMD_GPIO_PWM]: 'GPIO_PWM',
  [CMD_LA_CFG]: 'LA_CFG',
  [CMD_LA_START]: 'LA_START',
  [CMD_LA_STOP]: 'LA_STOP',
  [CMD_LA_DATA]: 'LA_DATA',
  [CMD_LA_STATUS]: 'LA_STATUS',
  [CMD_LA_STREAM_MODE]: 'LA_STREAM_MODE',
}

export const ERROR_NAMES: Record<number, string> = {
  [ERR_TIMEOUT]: 'TIMEOUT',
  [ERR_CRC]: 'CRC',
  [ERR_PARAM]: 'PARAM',
  [ERR_BUSY]: 'BUSY',
  [ERR_HARDWARE]: 'HARDWARE',
  [ERR_NOT_SUPPORTED]: 'NOT_SUPPORTED',
  [ERR_BUS_ERROR]: 'BUS_ERROR',
  [ERR_RP2350_DEAD]: 'RP2350_DEAD',
  [ERR_OVERFLOW]: 'OVERFLOW',
  [ERR_DISCONNECTED]: 'DISCONNECTED',
}
