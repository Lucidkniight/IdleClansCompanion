# Idle Clans Companion
A Windows desktop companion app for [Idle Clans](https://idleclans.com), built to make multi-account management and game planning easier without ever leaving your screen.

---

## Features

### 🎮 Clients

Detects any open Idle Clans game clients on your system and displays them in a clean sidebar.

- **Switch between clients instantly** by clicking an account card
- **Live window previews** update every second so you can see what each account is doing at a glance
- Account profiles load automatically, showing clan and online status

### 🧰 Tools

A searchable collection of tools accessible from the Tools tab.

---

#### 💸 Profit Calculator
Estimates gold profit per hour for any production skill task. Supports tool tier, gear, jewelry, mastery cape, gatherers upgrade, and sell speed modifiers. Market prices refresh every 5 minutes.
> ⚠️ Estimates only — formula accuracy is not guaranteed.

#### ✨ XP Calculator
Estimates XP per hour and time to goal level for any task. Supports all the same modifiers as the Profit Calculator, plus clan housing bonus.
> ⚠️ Estimates only — formula accuracy is not guaranteed.

#### 🏪 Market
Browse live buy and sell prices for any item. Includes order books, price averages over 1, 7, and 30 days, 24h trade volume, and a 24h price history chart.

#### 🏆 Clan Cup
Live Cup leaderboard filterable by category — total points, individual skills, boss kills, special objectives, and speed runs. Search any clan to see all their standings at once.

#### 🛡️ Clan
Enter a clan name to see a full XP leaderboard for its members, defaulting to lifetime XP with a toggle to switch to contributed XP. Filter by any individual skill using the dropdown. Click any player to jump directly to their profile. Also shows your clan's current **Clan Cup standings** — tabbed by Skills, Kills, Speed, and Points — including estimated weekly cup credits and a countdown to the Sunday reset.

#### 🔎 Player Lookup
Search any player by name. Shows every skill with level, XP, and progress bar, plus upgrades, enchantments, PvM kill counts, game mode badge, online status, and last logged activity.

#### ✅ Completionist Calculator
Track your progress toward the completionist cape. Shows all 20 required skills, highlights which you've maxed, and displays a running count of how many remain.

#### 📝 Notepad
A plain notepad that persists locally. Useful for tracking goals, clan notes, or anything else you want to keep handy.

---

### 🎨 Themes

Nine built-in themes selectable from the settings menu: Dark, Light, Vaporwave, Slate, Forest, Ocean, Midnight, Rose, and Ember.

---

### 🔄 Auto-Updates

The app checks for updates automatically and notifies you with a banner when a new version is available. Click **Restart** to install immediately — no manual downloads required.

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
