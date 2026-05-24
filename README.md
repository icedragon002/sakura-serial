<p align="center">
  <img src="https://github.com/user-attachments/assets/placeholder" alt="probe-station Banner" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/electron-28.x-9cf?style=for-the-badge&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/react-18.x-61DAFB?style=for-the-badge&logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.x-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/github/license/icedragon002/sakura-serial?style=for-the-badge&color=ff7eb3" alt="License">
</p>

<h1 align="center">⚡ probe-station</h1>

<p align="center">
  <b>Universal Protocol Debugger for Embedded Systems.</b><br>
  I²C · SPI · UART · CAN · 1-Wire · GPIO · Logic Analyzer — one tool, zero friction
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-protocol-panels">Protocol Panels</a> •
  <a href="#-script-engine">Script Engine</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-development">Dev</a>
</p>

---

## ✨ Why probe-station?

> "One cable. Eight protocols. No more tool-switching."

Embedded development means juggling multiple debug tools — a serial monitor, an I²C scanner, a logic analyzer, a CAN sniffer. **probe-station** unifies them all behind a single USB/WiFi/BLE connection to your target hardware. A desktop app that talks to the probe-station firmware running on your ESP32-S3 + RP2350 board, giving you full control over every protocol with a consistent UI and a built-in scripting engine.

---

## 🎯 Features

### 🔌 Universal Protocol Debugging

| Protocol | Capabilities |
|----------|-------------|
| **I²C** | Bus scan, read/write, write+read, known device labels |
| **SPI** | Multi-mode transfer, CS control, MSB/LSB, up to 50 MHz |
| **UART** | Configurable baud/data/parity/stop, auto-read, break, history |
| **CAN** | Normal/Listen-only, CAN FD, hardware filter, frame monitor |
| **1-Wire** | Reset/presence, ROM search, read/write |
| **GPIO** | Input/Output/PWM/Freq, pull-up/down, pin monitor |
| **Logic Analyzer** | 8ch capture, trigger config, buffer/stream mode, waveform viewer |
| **Script** | Monaco editor, full JS API, macro recording, example library |

### 🚀 Connectivity
- **USB CDC** — auto-detecting serial ports, up to 921600 baud
- **WiFi** — TCP transport with mDNS auto-discovery
- **BLE** — Web Bluetooth for wireless debugging

### 📜 Script Engine
- Full JavaScript API covering all 7 protocols
- Monaco editor with syntax highlighting
- Macro recorder — click operations, generate code
- Example library with 10+ ready-to-use scripts
- Web Worker sandbox for non-blocking execution

### 🎨 Beautiful & Customizable
- 3 handcrafted themes — Sakura Pink, Clean Light, Pure Dark
- CSS variable architecture — 0ms theme switch
- Cherry blossom particle system (optional)
- Anime mascot (dismissible)
- Resizable sidebar panels

### 🌐 Internationalization
- 中文 / English with one-click switch
- Auto-detects browser language
- Full coverage of all protocol panel UIs

---

## 📸 Protocol Panels

| I²C | SPI | UART | CAN |
|-----|-----|------|-----|
| Bus scan + R/W | Multi-mode transfer | Full UART config | Frame send + monitor |

| 1-Wire | GPIO | LA | Script |
|--------|------|-----|--------|
| ROM search + R/W | In/Out/PWM | 8ch capture | JS scripting |

---

## 🚀 Quick Start

### Download (Recommended)

| Platform | Download |
|----------|----------|
| 🪟 Windows | [probe-station-2.0.0-setup.exe](https://github.com/icedragon002/sakura-serial/releases) |
| 🍎 macOS | *Coming soon* |
| 🐧 Linux | [AppImage / .deb](https://github.com/icedragon002/sakura-serial/releases) |

### Run from Source

```bash
git clone https://github.com/icedragon002/sakura-serial.git
cd sakura-serial
npm install
npm run dev        # Development with HMR
npm run package    # Build & package installer
```

**Prerequisites:** Node.js 18+, npm 9+

**Hardware:** probe-station firmware running on ESP32-S3 + RP2350 board (see [firmware repo](#))

---

## 🏗️ Tech Stack

```
┌─────────────────────────────────────────────────┐
│                   Renderer                       │
│  React 18  ·  TypeScript  ·  Pure CSS           │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ i18n     │ │ Theme    │ │ Protocol Panels│  │
│  │ Context  │ │ System   │ │ (8 tabs)       │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Script   │ │ Macro    │ │ Waveform       │  │
│  │ Engine   │ │ Recorder │ │ Viewer (Canvas)│  │
│  └──────────┘ └──────────┘ └────────────────┘  │
├─────────────────────────────────────────────────┤
│                   Preload                       │
│  contextBridge  ·  IPC  ·  Type-safe API        │
├─────────────────────────────────────────────────┤
│               Main Process                      │
│  Electron 28  ·  serialport 12                  │
│  USB Transport  ·  TCP Transport  ·  BLE        │
│  mDNS Discovery  ·  Frame Protocol (CRC+SLIP)   │
│  Auto-Updater                                   │
└─────────────────────────────────────────────────┘
```

| Layer | Stack | Notes |
|-------|-------|-------|
| **Runtime** | Electron 28 | Cross-platform desktop |
| **UI** | React 18 + TS 5 | Zero UI libs, pure CSS |
| **Build** | Vite 5 + electron-vite | ~500ms HMR |
| **Serial** | serialport 12 | Node SerialPort native bindings |
| **Editor** | Monaco Editor | Script panel |
| **Package** | electron-builder | NSIS / DMG / AppImage |
| **Update** | electron-updater | GitHub Releases |
| **i18n** | Custom Context | ~40 lines, no deps |
| **Theme** | CSS Variables | 3 themes, `<1KB` diff each |

---

## 📦 Bundle Size

| Asset | Size | Notes |
|-------|------|-------|
| `index.js` | ~260 KB | Includes React 18 + ReactDOM |
| `index.css` | ~30 KB | 3 full themes |
| Installer (.exe) | ~74 MB | Includes Electron runtime |
| **npm dependencies** | **2** | Only `serialport` + `@monaco-editor/react` |

---

## 📂 Project Structure

```
sakura-serial/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # IPC handlers, window management
│   │   ├── usb-transport.ts
│   │   ├── tcp-transport.ts
│   │   └── mdns-discovery.ts
│   ├── preload/           # Context bridge
│   │   └── index.ts
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── i18n/          # i18n system (zh/en)
│   │       ├── components/    # 8 protocol panels + UI
│   │       ├── decoders/      # Protocol decode plugins
│   │       ├── script-api.ts  # Script device object
│   │       ├── script-examples.ts
│   │       ├── macro-recorder.ts
│   │       └── script.worker.ts
│   └── shared/            # Shared types & frame protocol
│       ├── commands.ts     # 40+ command definitions
│       ├── frame-codec.ts  # CRC-16 + SLIP codec
│       └── transport.ts    # Transport + Session abstraction
├── resources/             # App icons
├── electron-builder.yml
└── package.json
```

---

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Send / Execute (in panels) |
| `Ctrl+R` | Start macro recording |
| `Ctrl+Shift+R` | Stop & generate macro |

---

## 🔌 Binary Frame Protocol

probe-station uses a custom binary protocol over USB/WiFi:

- **Framing**: SLIP-encoded, SYNC byte (0xA5) delimited
- **Integrity**: CRC-16-CCITT per frame
- **Reliability**: Sequence numbers + ACK/NAK + timeout + retry (up to 3x)
- **Async events**: Out-of-band notifications (CAN frame RX, GPIO change, etc.)
- **Batch**: Multiple commands in a single frame

See `src/shared/commands.ts` for the full 40+ command catalog.

---

## 🤖 Roadmap

- [x] I²C / SPI / UART / CAN / 1-Wire / GPIO panels
- [x] Logic Analyzer config + capture
- [x] Script engine with Monaco editor
- [x] Macro recording
- [x] Protocol decoders (Modbus, AT, SMBus, I3C, etc.)
- [x] mDNS WiFi auto-discovery
- [x] LA waveform viewer
- [x] Dashboard mode
- [x] Auto-update
- [ ] Firmware OTA update
- [ ] AI mascot assistant
- [ ] Web-based remote access

---

## 📄 License

MIT © probe-station Team

```
⚡ Built by embedded developers, for embedded developers.
   Because your prototypes deserve better tools.
```
