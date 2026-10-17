<div align="center">
  <img src="public/favicon.svg" width="120" alt="Axon Logs Logo" />
  <h1>AXON LOGS</h1>
  <p><strong>Instagram-style chatting. Nothing else.</strong></p>

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

**Axon Logs** is a distraction-free, chat-only messenger with the familiar flow of Instagram DMs — wrapped in the original cyber-terminal aesthetic. Powered by Supabase Realtime broadcast channels, nodes establish secure uplinks without relying on database insertions. All traffic is client-side encrypted using **AES-256** before being emitted over WebSockets.

**No feed. No reels. No posts. No noise. Just conversations.**

If the key (room code) is wrong, the data remains cryptographic noise. **No logs. No traces. Total obfuscation.**

---

## ⚡ What It Feels Like

- 📥 **DM Inbox** — story-ring avatars ("Your note" strip), search, last-message previews, unread dots, timestamps. Sorts by recency.
- 💬 **DM Conversation** — rounded bubbles (theirs left / yours in a cyan→emerald gradient), grouped messages, day dividers, "Active now" / typing indicators, **Seen** receipts.
- ❤️ **Double-tap to heart** — the Instagram signature. Double-click/tap any message for the big heart pop + reaction badge.
- 🙂 **Reactions & replies** — hover a message for the quick emoji bar; reply quotes jump back to the original.
- 📞 **Calls in the header** — voice & video call buttons live in the conversation header, exactly where you expect them.
- 👤 **Profile page** — gradient avatar picker, alias, bio note, stats (chats / sent / active), quick toggles.
- 🚀 **New message flow** — create an encrypted chat with an auto-generated `AXON-XXXX` key, or join with a link code.
- 🔐 **End-to-End Encryption (AES-256):** every message and attachment is encrypted client-side using the chat key before broadcasting.
- ⏱️ **Burn-on-read:** per-message 🔥 toggle or a global auto-destruct timer. Payloads vanish everywhere.
- 🕶️ **Stealth Mode:** blurs the app when the tab loses focus. **Panic Protocol** (`/panic`) deploys a fake 404 overlay.
- 🔒 **Session locking:** chats re-lock on refresh; idle lock engages automatically; brute-force lockout after 5 bad attempts; decoy-passphrase diversion.

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

### Code Layout

- `src/App.tsx`: App root with context providers.
- `src/components/layout/ChatApp.tsx`: App shell — desktop icon rail + inbox + conversation, mobile stack, all modals, panic/decoy/idle screens.
- `src/components/chat/InboxPanel.tsx`: Instagram-DM-style inbox (story rings, search, previews, unread).
- `src/components/chat/ConversationPanel.tsx`: Bubbles, double-tap heart, reactions, replies, seen, composer.
- `src/components/profile/ProfilePanel.tsx`: Profile page (avatar, alias, bio, stats, quick controls).
- `src/components/profile/Avatar.tsx`: Gradient story-ring avatar with presence dot.
- `src/utils/chatMeta.ts`: Avatar gradients, last-message previews, unread tracking.
- `src/contexts/CryptoContext.tsx`: E2EE chat engine (local sandbox + Supabase online).
- `src/components/settings/SettingsPanel.tsx`: Appearance, alerts, cloud sync, data import/export.

---

## 💻 Hidden Power-Commands

The composer stays clean, but quiet commands still work:
- `/ping` - latency check · `/clear` - purge the local feed · `/lock` - re-lock the chat · `/panic` - fake 404 decoy

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js (v18+)
- A Supabase Project (for Realtime WebSockets — optional, works offline out of the box)

### 1. Clone the Repository
```bash
git clone https://github.com/trigxon/axonlogs.git
cd axonlogs
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration (optional)
Create a `.env.local` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```
*(Without credentials the app runs in a fully-offline local sandbox. Run `supabase/schema.sql` once in the Supabase SQL editor to go global.)*

### 4. Start Chatting
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🎨 Design System Specifications

The original Axon identity is fully preserved:
- **Void Background:** `#04050a` with a faint 1px grid overlay and vignette.
- **Neon Cyan:** `#22d3ee` (primary actions, your bubbles, story rings).
- **Matrix Green:** `#34d399` (presence, success, gradient partners).
- **Alert Red:** `#ef4444` (burn indicators, key rotation, destruction).
- **Typography:** `JetBrains Mono` / Monospace fallback for absolute alignment.
- **Texture:** CRT scanlines, phosphor glows, warm-up flicker.

<div align="center">
  <sub>Chat only. No feeds. No reels. No distractions.</sub>
</div>
