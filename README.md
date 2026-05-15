<p align="center">
  <img src="https://github.com/user-attachments/assets/placeholder" alt="Sakura Serial Banner" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blueviolet?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/electron-28.x-9cf?style=for-the-badge&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/react-18.x-61DAFB?style=for-the-badge&logo=react" alt="React">
  <img src="https://img.shields.io/badge/typescript-5.x-3178C6?style=for-the-badge&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/github/license/icedragon002/sakura-serial?style=for-the-badge&color=ff7eb3" alt="License">
  <img src="https://img.shields.io/github/stars/icedragon002/sakura-serial?style=for-the-badge&color=ff69b4" alt="Stars">
</p>

<h1 align="center">🌸 Sakura Serial</h1>

<p align="center">
  <b>The world's most beautiful serial port debug tool.</b><br>
  二次元 × 嵌入式开发 — 当串口调试遇上樱花美学
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-download">Download</a> •
  <a href="#-screenshots">Screenshots</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-development">Dev</a>
</p>

---

## ✨ Why Sakura Serial?

> "Because serial port tools don't have to look like they're from 1995."

Every embedded developer lives in the terminal, staring at serial monitors that look like DOS-era relics. **Sakura Serial** proves that developer tools can be both **powerful** and **beautiful**.

- 🌸 Cherry blossom particles float across your screen while you debug
- 🐱 A tiny anime mascot keeps you company during long debug sessions
- 🎨 Switch between Sakura / Light / Dark themes instantly
- 🌐 Full Chinese & English i18n
- ⚡ **Zero heavy UI dependencies** — handcrafted CSS, rAF-batched rendering, 60fps smooth

---

## 🎯 Features

<table>
<tr>
<td width="50%">

### 🎨 Beautiful & Customizable
- **3 handcrafted themes** — Sakura Pink, Clean Light, Pure Dark
- **CSS variable architecture** — theme switch in 0ms, no re-render
- **Cherry blossom particle system** — GPU-accelerated, optional
- **Anime mascot** — dismissible, AI-ready placeholder
- **Resizable panels** — drag to resize sidebar

### 🌐 Internationalization
- 中文 / English one-click switch
- Detects browser language automatically
- Persists preference to localStorage
- Zero dependencies — custom lightweight context

</td>
<td width="50%">

### 🔧 Serial Port Power
- Full baud rate support (300–921600)
- Configurable data bits / stop bits / parity / flow control
- DTR / RTS hardware flow control toggles
- HEX and ASCII dual-mode display
- Timestamp per entry
- TX / RX statistics counter

### ⚡ Advanced Features
- **Auto-send** — configurable periodic send (50ms–∞)
- **Timed send** — set interval, click start, walk away
- **Send history** — ↑↓ arrow key recall, up to 50 entries
- **HEX validation** — rejects invalid hex input
- **CRLF toggle** — one-click append `\r\n`
- **rAF-batched output** — 5000 entries without lag

</td>
</tr>
</table>

---

## 📸 Screenshots

> *Replace these placeholders with actual screenshots*

<p align="center">
  <table>
    <tr>
      <td align="center"><b>Sakura Theme</b></td>
      <td align="center"><b>Light Theme</b></td>
      <td align="center"><b>Dark Theme</b></td>
    </tr>
    <tr>
      <td><img src="https://github.com/user-attachments/assets/sakura-theme" width="280"></td>
      <td><img src="https://github.com/user-attachments/assets/light-theme" width="280"></td>
      <td><img src="https://github.com/user-attachments/assets/dark-theme" width="280"></td>
    </tr>
    <tr>
      <td align="center" colspan="3"><b>i18n · Auto Send · HEX Mode · Resizable Panels</b></td>
    </tr>
    <tr>
      <td><img src="https://github.com/user-attachments/assets/i18n" width="280"></td>
      <td><img src="https://github.com/user-attachments/assets/autosend" width="280"></td>
      <td><img src="https://github.com/user-attachments/assets/hex" width="280"></td>
    </tr>
  </table>
</p>

---

## 🚀 Quick Start

### Download (Recommended)

| Platform | Download |
|----------|----------|
| 🪟 Windows | [sakura-serial-1.1.0-setup.exe](https://github.com/icedragon002/sakura-serial/releases) |
| 🍎 macOS | *Coming soon* |
| 🐧 Linux | [AppImage / .deb](https://github.com/icedragon002/sakura-serial/releases) |

> **Upgrade?** Just run the new installer — it auto-detects the old version and upgrades in place.

### Run from Source

```bash
# Clone
git clone https://github.com/icedragon002/sakura-serial.git
cd sakura-serial

# Install
npm install

# Development
npm run dev

# Build & Package
npm run package
```

**Prerequisites:** Node.js 18+, npm 9+

---

## 🏗️ Tech Stack

```
┌─────────────────────────────────────────┐
│               Renderer                   │
│  React 18  ·  TypeScript  ·  Pure CSS   │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐  │
│  │ i18n    │ │ Theme    │ │ Settings │  │
│  │ Context │ │ System   │ │ Dropdown │  │
│  └─────────┘ └──────────┘ └──────────┘  │
│  ← rAF batched rendering →             │
├─────────────────────────────────────────┤
│               Preload                   │
│  contextBridge  ·  IPC  ·  Type-safe    │
├─────────────────────────────────────────┤
│              Main Process               │
│  Electron 28  ·  serialport 12          │
│  IPC handlers  ·  Window controls       │
└─────────────────────────────────────────┘
```

| Layer | Stack | Notes |
|-------|-------|-------|
| **Runtime** | Electron 28 | Cross-platform desktop |
| **UI** | React 18 + TS 5 | Zero UI libs, pure CSS |
| **Build** | Vite 5 + electron-vite | ~500ms HMR |
| **Serial** | serialport 12 | Node SerialPort native bindings |
| **Package** | electron-builder | NSIS / DMG / AppImage |
| **i18n** | Custom Context | ~40 lines, no deps |
| **Theme** | CSS Variables | 3 themes, `<1KB` diff each |

---

## 📦 Bundle Size

| Asset | Size | Notes |
|-------|------|-------|
| `index.js` | 258 KB | Includes React 18 + ReactDOM |
| `index.css` | 25 KB | 3 full themes |
| Installer (.exe) | 74 MB | Includes Electron runtime |
| **npm dependencies** | **1** | Only `serialport` |

> We take "lightweight" seriously. The only runtime dependency is `serialport`. No moment.js, no jQuery, no Bootstrap. Not even a CSS framework.

---

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Shift + Enter` | Newline in input |
| `↑` / `↓` | Browse send history |

---

## 📂 Project Structure

```
sakura-serial/
├── src/
│   ├── main/           # Electron main process
│   │   └── index.ts    # IPC handlers, serial port lifecycle
│   ├── preload/        # Context bridge
│   │   └── index.ts    # Type-safe API exposure
│   └── renderer/       # React frontend
│       ├── index.html
│       └── src/
│           ├── App.tsx           # Root component + state
│           ├── i18n/             # i18n system (zh/en)
│           │   ├── translations.ts
│           │   └── I18nContext.tsx
│           └── components/
│               ├── PortConfig.tsx       # Serial port settings
│               ├── Terminal.tsx         # Terminal output
│               ├── SendPanel.tsx        # Send panel + auto-send
│               ├── StatusBar.tsx        # Connection status
│               ├── SettingsButton.tsx   # Settings dropdown
│               ├── SakuraParticles.tsx  # Cherry blossom effect
│               └── Mascot.tsx           # Anime mascot
├── resources/          # App icons
├── electron-builder.yml
└── package.json
```

---

## 🤖 AI Mascot — Coming Soon

The bottom-left mascot isn't just cute — it's a **reserved AI entry point**. Future plans:

- 🗣️ Click to ask questions about serial data
- 📊 Auto-detect baud rate from signal analysis
- 🔍 Smart protocol decoding (Modbus, AT commands, etc.)
- 💬 Natural language → serial commands

*Interested in contributing the AI features? Check the [issues](https://github.com/icedragon002/sakura-serial/issues)!*

---

## 🤝 Contributing

PRs welcome! Here's how you can help:

- 🎨 **Designers**: Improve themes, add new theme variants
- 🌐 **Translators**: Add more languages (Japanese, Korean...)
- 🔌 **Embedded devs**: Suggest protocol parsers
- 🐛 **Bug hunters**: Report issues with detailed steps

```bash
git clone https://github.com/icedragon002/sakura-serial.git
cd sakura-serial
npm install
npm run dev
# Make changes, open PR! 🚀
```

---

## ⭐ Star History

<p align="center">
  <a href="https://star-history.com/#icedragon002/sakura-serial&Date">
    <img src="https://api.star-history.com/svg?repos=icedragon002/sakura-serial&type=Date" alt="Star History Chart">
  </a>
</p>

---

## 📄 License

MIT © Sakura Serial Team

```
🌸 Made with love for the embedded community.
   Because your UART deserves better.
```

<p align="center">
  <br>
  <img src="https://github.com/user-attachments/assets/placeholder" width="80">
  <br>
  <sub>If this tool made your debugging session a little brighter, drop a ⭐</sub>
</p>
