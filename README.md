<div align="center">
  <img src="public/favicon.svg" width="120" alt="Axon Logs Logo" />
  <h1>AXON LOGS</h1>
  <p><strong>E2EE Real-Time Ephemeral Communication Terminal</strong></p>

  <p>
    <a href="https://axonlogs.vercel.app"><img src="https://img.shields.io/badge/Live_Deployment-Vercel-000000?style=for-the-badge&logo=vercel" alt="Deployed on Vercel" /></a>
    <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/Supabase-Realtime-3ECF8E?style=for-the-badge&logo=supabase" alt="Supabase Realtime" />
    <img src="https://img.shields.io/badge/AES--256-Encrypted-FF003C?style=for-the-badge&logo=lock" alt="AES-256" />
  </p>
</div>

<hr />

## 📖 Overview

**Axon Logs** is a highly secure, zero-persistence, ephemeral chat terminal engineered with a strict hacker aesthetic. Powered by Supabase Realtime's broadcast channels, it allows nodes to establish secure uplinks without relying on database insertions. All traffic is client-side encrypted using **AES-256** before being emitted over WebSockets.

If the key (room code) is wrong, the data remains cryptographic noise. **No logs. No traces. Total obfuscation.**

---

## ⚡ Core Features

- 🔐 **End-to-End Encryption (AES-256):** Every message and image payload is encrypted client-side using the `SECURE_LINK` as the passphrase before broadcasting.
- 🚀 **Zero Persistence (In-Memory Only):** Supabase `broadcast` mode ensures data exists exclusively in transit and within the browser's React runtime state.
- ⏱️ **Burn-On-Read:** A 10-second auto-destruct timer per message. Once the timer expires, the payload vanishes from the DOM.
- 👻 **Stealth Mode:** Instantly obfuscates terminal output using CSS blurring, revealing content only upon user interaction.
- 🚨 **Panic Protocol:** Instantly deploy a fake 404 page overlay by typing `/panic` to hide your activity.
- 📺 **Immersive UI:** Hardware-accelerated `framer-motion` animations, CRT scanline effects, dynamic latency monitoring, and strict typography.

---

## 🛠️ Architecture & Tech Stack

| Technology | Purpose |
|------------|---------|
| **Vite + React 19** | Ultra-fast frontend framework and state management. |
| **Tailwind CSS v4** | Rapid, token-based utility styling and strict layout hierarchy. |
| **Crypto-JS** | Military-grade AES-256 encryption & decryption algorithms. |
| **Supabase Realtime** | Low-latency WebSocket infrastructure and presence syncing. |
| **Framer Motion** | Fluid, physics-based spring animations and UI transitions. |
| **Lucide React** | Clean, minimalist SVG iconography. |

---

## 💻 Slash Commands

The command prompt supports built-in terminal execution strings:
- `/ping` - Calculates WebSocket round-trip latency.
- `/clear` - Instantly purges the local terminal feed.
- `/panic` - Triggers a full-screen, realistic `404 Not Found` decoy page. Double-click to exit.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js (v18+)
- A Supabase Project (for Realtime Websockets)

### 1. Clone the Repository
```bash
git clone https://github.com/trigxon/axonlogs.git
cd axonlogs
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env.local` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```
*(Ensure Realtime is enabled in your Supabase project settings)*

### 4. Initiate Uplink
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🎨 Design System Specifications

The visual identity of Axon Logs adheres to strict color tokens:
- **Void Background:** `#050505` with a `rgba(255,255,255,0.02)` 1px grid overlay.
- **Neon Cyan:** `#00e5ff` (Primary actions, User nodes).
- **Matrix Green:** `#00FF41` (Success states, E2EE active).
- **Alert Red:** `#ff003c` (Errors, Decryption failures, Timers).
- **Typography:** `JetBrains Mono` / Monospace fallback for absolute alignment.

<div align="center">
  <sub>Built for secure, ephemeral transmissions.</sub>
</div>
