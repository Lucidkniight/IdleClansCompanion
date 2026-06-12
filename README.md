# Idle Clans Companion
A Windows desktop companion app for [Idle Clans](https://idleclans.com), built to make multi-account management and game planning easier without ever leaving your screen.

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

## Features

### 🎮 Clients

Detects any open Idle Clans game clients on your system and displays them in a clean sidebar.

- **Switch between clients instantly** by clicking an account card
- **Live window previews** update every second so you can see what each account is doing at a glance
- Account profiles load automatically, showing clan and online status
- **Reorder account cards** using the arrow buttons that appear on hover — the order is saved locally

### 🧰 Tools

A searchable collection of tools accessible from the Tools tab.

---

#### ⚔️ Combat Calculator
Estimates DPS, hit chance, and time-to-kill calculator. Select a character from your active clients or enter stats manually. Choose a combat style, configure your gear, and benchmark against any monster or boss in the game.
> ⚠️ Still in testing — results may not be fully accurate.

#### 💸 Profit Calculator
Estimates gold profit per hour for any production skill task. Supports tool tier, gear, jewelry, mastery cape, gatherers upgrade, and buy/sell speed modifiers. 

#### ✨ XP Calculator
Estimates XP per hour and time to goal level for any task. Supports all the same modifiers as the Profit Calculator.

#### 🏪 Market
Browse live buy and sell prices for any item. Includes order books, price averages over 1, 7, and 30 days, 24h trade volume, and a 24h price history chart.

#### 🏆 Clan Cup
Live Cup leaderboard filterable by category — total points, individual skills, boss kills, special objectives, and speed runs. Search any clan to see all their standings at once.

#### 🛡️ Clan
Enter a clan name to see a full XP leaderboard for its members, defaulting to lifetime XP with a toggle to switch to contributed XP. Filter by any individual skill using the dropdown. Click any player to jump directly to their profile. Also shows your clan's current **Clan Cup standings** — tabbed by Skills, Kills, Speed, and Points.

#### 🔎 Player Lookup
Search any player by name. Shows every skill with level, XP, and progress bar, plus upgrades, enchantments, PvM kill counts, game mode icon, online status, and last logged activity.

#### ✅ Completionist Calculator
Track your progress toward the completionist cape. Shows all required skills, displays a running count of how many remain and how estimates how long it will take.

#### 📖 Wiki
Search the Idle Clans wiki directly from the app. Results open in your default browser.

#### 📝 Notepad
A plain notepad that persists locally. Useful for tracking goals, clan notes, or anything else you want to keep handy.

---

### 🎨 Themes

Nine built-in themes selectable from the settings menu: Dark, Light, Vaporwave, Slate, Forest, Ocean, Midnight, Rose, and Ember.

---

### 🔄 Auto-Updates

The app checks for updates automatically and notifies you with a banner when a new version is available. Click **Restart** to install immediately — no manual downloads required.

---

## Screenshots

<img width="284" height="1000" alt="Image" src="https://github.com/user-attachments/assets/7a32173a-0eb7-4888-8d4d-76b5c27ff11e" />
<img width="284" height="1000" alt="Image" src="https://github.com/user-attachments/assets/e8516619-3317-4191-9bc8-fbdecd3fb588" />
<img width="284" height="1000" alt="Image" src="https://github.com/user-attachments/assets/bffd85ba-86d6-4ea3-a7fb-a729fc6d9690" />
<img width="284" height="1000" alt="Image" src="https://github.com/user-attachments/assets/740c433c-6dcb-4692-958c-7439d08aa6b8" />

---

## Built With

- [Electron](https://www.electronjs.org/) — Desktop app framework
- [Svelte](https://svelte.dev/) — Frontend UI
- [node-window-manager](https://github.com/sentialx/node-window-manager) — Window detection and management
- [node-screenshots](https://github.com/nashaofu/node-screenshots) — Live window preview capture
- [Idle Clans Public API](https://query.idleclans.com/api-docs/index.html) — Live game data

---

## Analytics

Idle Clans Companion collects anonymous usage data to help improve the app. No personal data is ever collected — no player names, account details, or search history.

The following is collected:
- App launch (version number)
- Which tools are opened
- Number of game clients detected
- Theme changes
- External link opens — only a count and which tool triggered it (e.g. Wiki), never the URL or page visited

You can opt out at any time via **Settings → Advanced → Opt out of analytics**.

---

## Disclaimer

This project is a fan-made tool and is not affiliated with, endorsed by, or connected to the Idle Clans development team. All game data, item names, and game mechanics are the property of their respective owners.

Market prices, XP rates, and profit figures displayed in this app are estimates based on publicly available game data and live market prices. They should not be used as a sole basis for in-game decisions.
