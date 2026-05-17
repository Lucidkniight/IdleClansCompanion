# Idle Clans Companion

> ⚠️ **Pre-Production Notice**
> This application is currently in early development. Features may be incomplete, unstable, or change significantly between versions. In particular, **calculator formulas (XP, profit, DPS) have not been fully verified and should not be relied upon for critical in-game decisions.** Use them as rough estimates only.

---

A Windows desktop companion app for [Idle Clans](https://idleclans.com), built to make multi-account management and game planning easier without ever leaving your screen.

---

## Features

### 🎮 Multi-Client Management

Idle Clans Companion detects any open Idle Clans game clients on your system and displays them in a clean sidebar. You can:

- **Switch between clients instantly** by clicking an account card
- **Live window previews** update every second so you can see what each account is doing at a glance


### 💰 Task Profit Calculator

Estimates gold profit per hour for any craftable or processable task in the game. Supports all production skills including Smithing, Cooking, Fishing, Woodcutting, Mining, Carpentry, Crafting, Brewing, Foraging, Farming, Agility, Enchanting, and Plundering.

**Outputs:**
- Profit per hour
- Input material cost per hour
- Output value per hour
- Actions per hour
- Task time after modifiers

> ⚠️ Profit figures use live market prices from the Idle Clans API and are estimates only. Formula accuracy is not guaranteed.

### ⭐ XP Calculator

Estimates experience per hour and time to goal level for any task across all supported skills.

**Outputs:**
- XP per hour
- XP per action (after housing boost)
- Actions per hour
- Time to reach goal level
- Actions needed to reach goal level

> ⚠️ XP figures are estimates only. Formula accuracy is not guaranteed.

### 📈 Market Browser

Browse live market prices for any item in the game.

- **Search** any item by name with instant autocomplete
- View **lowest sell orders** and **highest buy orders**
- **Price averages** over 1 day, 7 days, and 30 days
- **Trade volume** over the last 24 hours
- All data sourced live from the official Idle Clans API

### 🔄 Auto-Updates

The app checks for updates automatically and notifies you with a banner when a new version is available. Clicking **Restart** installs the update immediately — no manual downloads required.

---

## Installation

1. Download the latest installer from the [Releases](../../releases) page
2. Run `IdleClansCompanion-Setup-x.x.x.exe`
3. Launch **Idle Clans Companion** from your Start menu or desktop shortcut
4. Open your Idle Clans game clients — they will be detected automatically

---

## Requirements

- Windows 10 or later
- [Idle Clans](https://idleclans.com) installed and running

---

## Screenshots

<img width="284" height="1000" alt="IdleClansCompanion_ryYXRq5qFu" src="https://github.com/user-attachments/assets/aeef1582-4107-414b-b446-a4ce110254c9" />
<img width="284" height="1000" alt="IdleClansCompanion_IkEsft5JVy" src="https://github.com/user-attachments/assets/a565070e-4400-4781-aeb8-7096cdb738e5" />
<img width="284" height="1000" alt="IdleClansCompanion_qMQgCFZH07" src="https://github.com/user-attachments/assets/f5e16ba9-b351-46cc-864f-8cc44b6592d8" />
<img width="284" height="1000" alt="IdleClansCompanion_ifoCmqWdqh" src="https://github.com/user-attachments/assets/809d59d4-b7cb-4061-b151-7f983f3f0a07" />


---

## Built With

- [Electron](https://www.electronjs.org/) — Desktop app framework
- [Svelte](https://svelte.dev/) — Frontend UI
- [node-window-manager](https://github.com/sentialx/node-window-manager) — Window detection and management
- [Idle Clans Public API](https://query.idleclans.com/api-docs/index.html) — Live game data

---

## Disclaimer

This project is a fan-made tool and is not affiliated with, endorsed by, or connected to the Idle Clans development team. All game data, item names, and game mechanics are the property of their respective owners.

Market prices, XP rates, and profit figures displayed in this app are estimates based on publicly available game data and live market prices. They should not be used as a sole basis for in-game decisions.
