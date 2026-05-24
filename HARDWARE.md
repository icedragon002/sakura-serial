# Sakura Serial Hardware — 原理图 & PCB 参考

## 物料清单 (BOM)

| 编号 | 物料 | 封装 | 数量 | 单价 | 备注 |
|------|------|------|------|------|------|
| U1 | ESP32-S3-WROOM-1 | SMD-38 | 1 | ¥15 | 16MB Flash |
| U2 | RP2350A | QFN-60 | 1 | ¥8 | 或 RP2040 ¥4 |
| U3 | AMS1117-3.3 | SOT-223 | 1 | ¥0.5 | 5V→3.3V LDO |
| U4 | MCP2551-I/SN | SOIC-8 | 1 | ¥2 | CAN 收发器 |
| U5 | CP2102N | QFN-24 | 1 | ¥3 | USB-UART (可选, ESP32-S3 已有 USB) |
| Q1 | 12MHz 晶振 | HC-49S | 1 | ¥0.5 | ESP32 外部晶振 |
| Q2 | 12MHz 晶振 | HC-49S | 1 | ¥0.5 | RP2350 |
| D1-D8 | TVS 阵列 | SOD-323 | 8 | ¥0.2 | 8 通道 ESD 保护 |
| C1-C4 | 22µF MLCC | 0805 | 4 | ¥0.3 | LDO 输入/输出 |
| C5-C12 | 100nF MLCC | 0603 | 8 | ¥0.1 | 去耦 |
| R1,R2 | 120Ω 1% | 0805 | 2 | ¥0.1 | CAN 终端电阻 |
| R3-R10 | 10kΩ | 0603 | 8 | ¥0.05 | LA 通道下拉 |
| R11,R12 | 5.1kΩ | 0603 | 2 | ¥0.05 | I²C 上拉 |
| J1 | USB-C 16P | SMD-16 | 1 | ¥2 | 供电+数据 |
| J2 | 40-pin 排针 | TH-2.54mm | 1 | ¥1.5 | 扩展 IO |
| SW1 | 轻触开关 | SMD-4 | 1 | ¥0.3 | BOOT |
| SW2 | 轻触开关 | SMD-4 | 1 | ¥0.3 | RESET |
| | 2 层 PCB 1.6mm | 50×50mm | 1 | ¥5 | 嘉立创经济型 |

**总 BOM: ~¥45** (含 PCB)

---

## 系统连接图

```
                    ┌────────────────────────────────────┐
                    │            USB-C (J1)               │
                    │     VBUS ──┬── 5V                   │
                    │     D+  ──┼── GPIO20 (ESP32 USB)    │
                    │     D-  ──┼── GPIO19 (ESP32 USB)    │
                    │     GND ──┴── GND                   │
                    └────────────────────────────────────┘

  5V ──► AMS1117-3.3 ──► 3.3V Rail ──┬── ESP32-S3 VDD
                                      ├── RP2350 VDD
                                      ├── MCP2551 VDD
                                      ├── 上拉电阻
                                      └── 去耦电容

┌─────────────────────────────────────────────────────────────────┐
│                        ESP32-S3-WROOM-1                         │
│                                                                 │
│  GPIO19 ── USB_D-         GPIO20 ── USB_D+                     │
│  GPIO4  ── SDA (I²C0)     GPIO5  ── SCL (I²C0)                 │
│  GPIO6  ── MOSI (SPI1)    GPIO7  ── MISO (SPI1)                │
│  GPIO8  ── SCK (SPI1)     GPIO10 ── CS0 (SPI1 → RP2350)        │
│  GPIO11 ── MOSI (SPI2)    GPIO12 ── MISO (SPI2)                │
│  GPIO13 ── SCK (SPI2)                                          │
│  GPIO17 ── UART1_RX       GPIO18 ── UART1_TX                   │
│  GPIO14 ── CAN_TX         GPIO15 ── CAN_RX                     │
│  GPIO16 ── 1-Wire         GPIO21 ── LA_TRIG                    │
│  GPIO0  ── BTN_BOOT       EN    ── BTN_RESET + RC              │
│  GPIO1-3,38-41 ── 空闲 GPIO                                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                 │
    ┌─────▼─────┐   ┌──────▼──────┐   ┌─────▼─────┐
    │ MCP2551   │   │   I²C Bus   │   │  1-Wire   │
    │ CAN XCVR  │   │             │   │           │
    │           │   │ SDA ─┬─ 5.1k│   │ GPIO16 ───┤
    │ TXD GPIO14│   │      │  →3V3│   │           │
    │ RXD GPIO15│   │ SCL ─┘      │   │ DS18B20   │
    │           │   │             │   │ (可选)    │
    │ CANH ─┬───┤   │ I²C 设备    │   │           │
    │       │120Ω   │ (外部连接)  │   └───────────┘
    │ CANL ─┘   │   └────────────┘
    └───────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌─────▼──────┐
        │  UART1    │ │  SPI2  │ │  GPIO 排针 │
        │ RX:GPIO17 │ │ MOSI   │ │ GPIO1-3    │
        │ TX:GPIO18 │ │ MISO   │ │ GPIO38-41  │
        │ (外部连接)│ │ SCK    │ │ (自由使用) │
        └───────────┘ │ CS (外)│ └────────────┘
                      └────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          RP2350A                                 │
│  3.3V ── VDD    GND ── GND                                      │
│                                                                 │
│  GPIO0-7  ── 8ch LA 输入 (经 10kΩ 下拉 + TVS ESD 保护)         │
│  GPIO8    ── MOSI (SPI0 Slave → ESP32 SPI1)                     │
│  GPIO9    ── MISO (SPI0 Slave)                                   │
│  GPIO10   ── SCK (SPI0 Slave)                                    │
│  GPIO11   ── CS (SPI0 Slave ← ESP32 GPIO10)                     │
│  GPIO12   ── TRIG_IN (外部触发信号, 经 ESD 保护)                │
│  SWCLK/IO ── 预留 SWD 调试口 (2.54mm 3-pin)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 关键电路

### USB-C 到 ESP32-S3

```
USB-C        ESP32-S3
D+  ──22Ω── GPIO20
D-  ──22Ω── GPIO19
VBUS ────── 5V Rail (经 LDO → 3.3V)
GND ────── GND
CC1/CC2 ── 各 5.1kΩ → GND (500mA 供电声明)
```

**注意：** ESP32-S3-WROOM-1 内置 USB Serial/JTAG，D+/D- 直连 GPIO19/20 不需要 CP2102。如果需要独立 UART 调试口，可加 CP2102N 连 UART0（TX=GPIO43, RX=GPIO44）。

### CAN 收发器

```
ESP32           MCP2551
GPIO14 ── TXD ── pin1    pin7 CANH ──┬── 120Ω ── CANH 总线
GPIO15 ── RXD ── pin4    pin6 CANL ──┘          CANL 总线
3.3V  ── VDD ── pin3    pin8 RS ── GND (高速模式)
GND   ── GND ── pin2    pin5 VREF ── NC
```

### 1-Wire (DS18B20)

```
ESP32           DS18B20     (寄生供电模式)
GPIO16 ──────── DQ  ──┬── VDD
             4.7kΩ   │
3.3V ─────────┘       └── GND
```

### LA 输入保护 (每通道)

```
外部信号 ──┬── 10kΩ ── RP2350 GPIOx
           │
          TVS ── GND (ESD 保护, 例如 PESD5V0S1BA)
```

### BOOT / RESET

```
ESP32-S3
EN  ──┬── 10kΩ ── 3.3V (上拉)
      ├── 100nF ── GND
      └── SW2 ── GND (RESET, 按下接地)

IO0 ──┬── 10kΩ ── 3.3V (上拉)
      └── SW1 ── GND (BOOT, 按下接地，上电时进入下载模式)
```

---

## PCB Layout 建议

| 参数 | 建议值 |
|------|--------|
| 层数 | 2 层 (信号+地) |
| 板厚 | 1.6mm |
| 铜厚 | 1oz |
| 尺寸 | 50×50mm (嘉立创 ¥5) |
| 线宽/间距 | ≥6mil |
| 过孔 | 0.3mm 钻孔 / 0.6mm 外径 |

**布局要点：**
- USB-C 差分对 (D+/D-) 等长等间距走线
- CAN 总线 120Ω 终端电阻靠近 MCP2551
- LDO 22µF 电容靠近输入/输出引脚
- ESP32 天线区域 (模组 PCB 天线端) 下方不铺铜
- LA 8 通道 TVS 靠近排针

---

## 简化方案 (单 ESP32-S3)

如果不想用双芯片，可以先做单 ESP32-S3 版本：

```
ESP32-S3-WROOM-1 (单芯片)
├── USB CDC (PC 通信)
├── WiFi 4 / BLE 5.0
├── I²C ×2, SPI ×4, UART ×3
├── CAN (通过 MCP2551)
├── 1-Wire (bit-bang)
├── GPIO ×8
└── LA (4ch 软件采样, ~500kHz @ 4ch)

BOM: ~¥22, PCB 35×35mm 即可
```

LA 采样率会从双芯片的 50MHz×8ch 降到 500kHz×4ch，但其他协议功能完全不受影响。**建议先做这个版本跑通所有协议，RP2350 LA 扩展板后期叠加。**

---

## 软件开发配套

PCB 回来后需要的固件：
1. ESP-IDF 项目模板 + FreeRTOS 任务
2. 帧协议编解码器 (C 语言，与 `src/shared/commands.ts` 同步)
3. 各协议驱动 (I²C/SPI/UART/CAN/1-Wire/GPIO/LA)
4. USB CDC 传输 + TCP Server + BLE NUS

桌面端已有完整的测试基础设施（虚拟连接 + 10 面板 + Script 引擎），固件可逐协议对接验证。
