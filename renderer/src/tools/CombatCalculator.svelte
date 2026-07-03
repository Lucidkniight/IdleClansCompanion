<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Combat Calculator',
    desc: 'DPS, hit chance, and time-to-kill',
    icon: './skilltaskicons/Combat.png',
    author: 'Lucid',
  };
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte';

  function focusOnMount(node: HTMLElement) {
    tick().then(() => node.focus());
  }
  import {
    clients, allItems, allEquipment, allMonsters, enchantedToBase, priceCache, loadGameConfig, fetchProfile, fetchClanProfile, formatItemName, formatGold,
    xpToLevel,
    type ClientCard, type Monster, type PlayerProfile,
  } from '../lib/store';
  import DevPanel from '../lib/DevPanel.svelte';

  const SLOTS = [
    { key: 'ammunition', label: 'Ammo',     row: 1, col: 2, slotId: 9  },
    { key: 'head',       label: 'Head',     row: 1, col: 3, slotId: 11 },
    { key: 'cape',       label: 'Cape',     row: 1, col: 4, slotId: 10 },
    { key: 'pet',        label: 'Pet',      row: 4, col: 4, slotId: 15 },
    { key: 'earrings',   label: 'Earrings', row: 1, col: 1, slotId: 16 },
    { key: 'rightHand',  label: 'Weapon',   row: 2, col: 2, slotId: 7  },
    { key: 'body',       label: 'Body',     row: 2, col: 3, slotId: 5  },
    { key: 'leftHand',   label: 'Offhand',  row: 2, col: 4, slotId: 6  },
    { key: 'amulet',     label: 'Amulet',   row: 2, col: 1, slotId: 8  },
    { key: 'jewellery',  label: 'Ring',     row: 3, col: 1, slotId: 2  },
    { key: 'gloves',     label: 'Gloves',   row: 3, col: 2, slotId: 3  },
    { key: 'legs',       label: 'Legs',     row: 3, col: 3, slotId: 4  },
    { key: 'bracelet',   label: 'Bracelet', row: 4, col: 1, slotId: 13 },
    { key: 'belt',       label: 'Belt',     row: 3, col: 4, slotId: 14 },
    { key: 'boots',      label: 'Boots',    row: 4, col: 3, slotId: 1  },
  ];


  type EnchantType = 'attack' | 'strength' | 'defence' | 'archery' | 'magic' | 'exterminating';

  const ENCHANT_TYPES: EnchantType[] = ['attack', 'strength', 'defence', 'archery', 'magic', 'exterminating'];
  const SLOT_ORDER = SLOTS.map(s => s.key);
  const ENCHANT_LABELS: Record<EnchantType, string> = {
    attack: 'Atk', strength: 'Str', defence: 'Def', archery: 'Arch', magic: 'Mag', exterminating: 'Ext',
  };

  interface Enchants {
    attack: number; strength: number; defence: number; archery: number; magic: number; exterminating: number;
  }

  interface Loadout {
    id: number;
    label: string;
    equipped: Record<string, number>;
    enchants: Enchants;
  }

  function emptyEnchants(): Enchants {
    return { attack: 0, strength: 0, defence: 0, archery: 0, magic: 0, exterminating: 0 };
  }

  function emptyLoadout(id: number, label: string): Loadout {
    return { id, label, equipped: {}, enchants: emptyEnchants() };
  }

  function renumber(list: Loadout[]): Loadout[] {
    return list.map((l, i) => ({ ...l, label: /^\d*$/.test(l.label) ? `${i + 1}` : l.label }));
  }

  let loadouts: Loadout[] = [emptyLoadout(0, '1')];
  let activeIdx = 0;
  let nextId = 1;
  let selectedDropItemId: number | null = null;
  let dropTableOpen = false;
  let dropTableSearch = '';

  let tooltipVisible = false;
  let tooltipTitle = '';
  let tooltipDesc = '';
  let tooltipX = 0;
  let tooltipY = 0;

  interface SavedLoadout {
    name: string;
    equipped: Record<string, number>;
    enchants: Enchants;
    savedAt: number;
  }

  let savedLoadouts: SavedLoadout[] = [];

  // Add loadout modal
  let addModalOpen = false;
  let addCodeInput = '';
  let addCodeError = '';

  // Tab options modal
  let tabMenuOpen = false;
  let tabMenuMode: 'menu' | 'rename' | 'save' | 'export' = 'menu';
  let tabMenuRenameValue = '';
  let tabMenuSaveNameValue = '';
  let tabMenuExportCode = '';
  let tabMenuSaveError = '';
  let tabMenuCopied = false;

  function positionTooltip(e: MouseEvent) {
    const GAP = 14, TIP_W = 214, TIP_H = 72;
    tooltipX = e.clientX + GAP + TIP_W > window.innerWidth
      ? Math.max(4, e.clientX - GAP - TIP_W) : e.clientX + GAP;
    tooltipY = e.clientY + GAP + TIP_H > window.innerHeight
      ? Math.max(4, e.clientY - GAP - TIP_H) : e.clientY + GAP;
  }
  function showTooltip(e: MouseEvent, title: string, desc: string) {
    tooltipTitle = title; tooltipDesc = desc;
    positionTooltip(e);
    tooltipVisible = true;
  }
  function moveTooltip(e: MouseEvent) { positionTooltip(e); }
  function hideTooltip() { tooltipVisible = false; }

  let attackLevel   = 1;
  let strengthLevel = 1;
  let defenceLevel  = 1;
  let archeryLevel  = 1;
  let magicLevel    = 1;

  let importModalOpen = false;
  let importLevels   = true;
  let importUpgrades = true;
  let importGear     = true;
  let importSearch   = '';
  let importLoading  = false;
  let importError    = '';
  let importedPlayerName: string | null = null;
  let refreshCooldown = false;
  let _refreshTimer: ReturnType<typeof setTimeout>;

  $: readyClients = $clients.filter(c => c.playerName && c.profile && !c.loading && !c.error);

  $: slotNames = (() => {
    const names: Record<string, string> = {};
    const eq = loadouts[activeIdx]?.equipped ?? {};
    for (const slot of SLOTS) {
      const id = eq[slot.key] ?? -1;
      if (id < 0) { names[slot.key] = ''; continue; }
      const item = $allItems.find(i => i.id === id);
      names[slot.key] = item ? formatItemName(item.name) : `#${id}`;
    }
    return names;
  })();

  $: slotRawNames = (() => {
    const names: Record<string, string> = {};
    const eq = loadouts[activeIdx]?.equipped ?? {};
    for (const slot of SLOTS) {
      const id = eq[slot.key] ?? -1;
      if (id < 0) { names[slot.key] = ''; continue; }
      const item = $allItems.find(i => i.id === id);
      names[slot.key] = item?.name ?? '';
    }
    return names;
  })();

  function addLoadout() {
    nextId++;
    const newLoadout: Loadout = {
      id: nextId,
      label: '',
      equipped: { ...loadouts[activeIdx]?.equipped },
      enchants: { ...loadouts[activeIdx]?.enchants },
    };
    loadouts = renumber([...loadouts, newLoadout]);
    activeIdx = loadouts.length - 1;
  }

  let selectedMonster: Monster | null = null;
  let monsterSearch = '';
  let monsterPickerOpen = false;

  $: filteredLoot = (() => {
    const q = dropTableSearch.trim().toLowerCase();
    const loot = selectedMonster?.loot ?? [];
    return loot
      .filter(entry => {
        if (!q) return true;
        const item = $allItems.find(i => i.id === entry.itemId);
        const name = item ? formatItemName(item.name).toLowerCase() : `#${entry.itemId}`;
        return name.includes(q);
      })
      .slice()
      .sort((a, b) => b.dropRate - a.dropRate);
  })();

  $: filteredMonsters = (() => {
    const q = monsterSearch.trim().toLowerCase();
    return $allMonsters
      .filter(m => !q || formatMonsterName(m.name).toLowerCase().includes(q))
      .sort((a, b) => {
        const aIsAnyBoss = a.isBoss || a.bossType > 0;
        const bIsAnyBoss = b.isBoss || b.bossType > 0;
        if (aIsAnyBoss !== bIsAnyBoss) return aIsAnyBoss ? 1 : -1;
        return a.health - b.health;
      })
      .slice(0, q ? 200 : 100);
  })();

  function getMonsterStyle(m: Monster): string {
    if (m.archeryLevel > m.strengthLevel && m.archeryLevel >= m.magicLevel) return 'Arch';
    if (m.magicLevel > m.strengthLevel && m.magicLevel > m.archeryLevel) return 'Mag';
    return 'Melee';
  }

  function openMonsterPicker() {
    monsterPickerOpen = true;
    monsterSearch = '';
  }

  function closeMonsterPicker() {
    monsterPickerOpen = false;
    monsterSearch = '';
  }

  function openDropTable() { dropTableOpen = true; dropTableSearch = ''; }
  function closeDropTable() { dropTableOpen = false; }

  function selectMonster(m: Monster) {
    selectedMonster = m;
    selectedDropItemId = null;
    monsterSearch = '';
    monsterPickerOpen = false;
  }

  function clearMonster() {
    selectedMonster = null;
    selectedDropItemId = null;
    monsterSearch = '';
  }

  let pickerSlot: string | null = null;
  let pickerSearch = '';

  $: pickerLabel = SLOTS.find(s => s.key === pickerSlot)?.label ?? pickerSlot ?? '';

  $: pickerItems = (() => {
    if (!pickerSlot) return [];
    const slotId = SLOTS.find(s => s.key === pickerSlot)?.slotId;
    const q = pickerSearch.trim().toLowerCase();
    return $allEquipment
      .filter(i => i.slot === slotId)
      .filter(i => !q || formatItemName(i.name).toLowerCase().includes(q))
      .sort((a, b) => formatItemName(a.name).localeCompare(formatItemName(b.name)));
  })();

  function openPicker(slotKey: string) {
    pickerSlot = slotKey;
    pickerSearch = '';
  }

  function closePicker() {
    pickerSlot = null;
    pickerSearch = '';
  }

  function selectItem(itemId: number) {
    if (!pickerSlot) return;
    const slot = pickerSlot;
    const updated = [...loadouts];
    updated[activeIdx] = {
      ...updated[activeIdx],
      equipped: { ...updated[activeIdx].equipped, [slot]: itemId },
    };
    loadouts = updated;
    closePicker();
  }

  function clearLoadout() {
    const updated = [...loadouts];
    updated[activeIdx] = { ...updated[activeIdx], equipped: {} };
    loadouts = updated;
  }

  function clearSlot() {
    if (!pickerSlot) return;
    const slot = pickerSlot;
    const updated = [...loadouts];
    updated[activeIdx] = {
      ...updated[activeIdx],
      equipped: { ...updated[activeIdx].equipped, [slot]: -1 },
    };
    loadouts = updated;
    closePicker();
  }

  function removeLoadout(i: number) {
    if (loadouts.length <= 1) return;
    loadouts = renumber(loadouts.filter((_, idx) => idx !== i));
    if (activeIdx > i) activeIdx -= 1;
    else if (activeIdx >= loadouts.length) activeIdx = loadouts.length - 1;
  }

  function setEnchantPct(enchType: EnchantType, raw: string) {
    const v = Math.max(0, Math.min(100, parseFloat(raw) || 0));
    const updated = [...loadouts];
    updated[activeIdx] = { ...updated[activeIdx], enchants: { ...updated[activeIdx].enchants, [enchType]: v } };
    loadouts = updated;
  }

  function levelsFromSkills(skills: Record<string, number> | null) {
    const s = skills ?? {};
    attackLevel   = xpToLevel(s['attack']   ?? 0);
    strengthLevel = xpToLevel(s['strength'] ?? 0);
    defenceLevel  = xpToLevel(s['defence']  ?? 0);
    archeryLevel  = xpToLevel(s['archery']  ?? 0);
    magicLevel    = xpToLevel(s['magic']    ?? 0);
  }

  function openImportModal() {
    importModalOpen = true;
    importSearch = '';
    importError = '';
  }

  function closeImportModal() {
    importModalOpen = false;
    importSearch = '';
    importLoading = false;
  }

  async function doImport(profile: PlayerProfile) {
    if (importLevels) {
      levelsFromSkills(profile.skillExperiences);
    }
    if (importUpgrades) {
      const upgs = profile.upgrades ?? {};
      upgMonsterHunter      = (upgs['monsterHunter']                 ?? 0) > 0;
      upgBountyHunter       = (upgs['upgrade_bounty_hunter']        ?? 0) > 0;
      upgPrinciplesOfCombat = (upgs['upgrade_principles_of_combat'] ?? 0) > 0;
      if (profile.guildName) {
        const clan = await fetchClanProfile(profile.guildName);
        if (clan) {
          const ids: number[] = JSON.parse(clan.serializedUpgrades?.length ? clan.serializedUpgrades : '[]');
          upgBullseye        = ids.includes(22);
          upgClanBossSlayers = ids.includes(52);
          upgGetUp           = ids.includes(16);
          const rep = clan.repeatableUpgradeCounts ?? {};
          royalExtermination = rep['clan_upgrade_royal_extermination'] ?? 0;
        }
      }
    }
    if (importGear) {
      const boosts = profile.enchantmentBoosts ?? {};
      const enchants: Enchants = {
        attack:         boosts['attack']         ?? 0,
        strength:       boosts['strength']       ?? 0,
        defence:        boosts['defence']        ?? 0,
        archery:        boosts['archery']        ?? 0,
        magic:          boosts['magic']          ?? 0,
        exterminating:  boosts['exterminating']  ?? 0,
      };
      const remap = $enchantedToBase;
      const equipped: Record<string, number> = {};
      for (const [slot, id] of Object.entries(profile.equipment ?? {})) {
        equipped[slot] = remap[id] ?? id;
      }
      const updated = [...loadouts];
      updated[activeIdx] = { ...updated[activeIdx], equipped, enchants };
      loadouts = updated;
    }
    importedPlayerName = profile.username ?? null;
    closeImportModal();
  }

  function clearImport() {
    importedPlayerName = null;
    clearTimeout(_refreshTimer); refreshCooldown = false;
  }

  async function refreshImport() {
    if (!importedPlayerName || refreshCooldown) return;
    refreshCooldown = true;
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => { refreshCooldown = false; }, 30000);
    try {
      const profile = await fetchProfile(importedPlayerName);
      if (!profile) return;
      await doImport(profile);
    } catch {}
  }

  async function doImportBySearch(name: string) {
    const n = name.trim();
    if (!n || importLoading) return;
    importLoading = true;
    importError = '';
    try {
      const profile = await fetchProfile(n);
      if (!profile) { importError = 'Player not found'; return; }
      await doImport(profile);
    } catch {
      importError = 'Failed to load';
    } finally {
      importLoading = false;
    }
  }

  async function doImportFromClient(client: ClientCard) {
    if (!client.profile) return;
    importLoading = true;
    try {
      await doImport(client.profile);
    } finally {
      importLoading = false;
    }
  }

  // ── Build library ──────────────────────────────────────────────────────────

  function loadSavedLoadouts(): SavedLoadout[] {
    try { return JSON.parse(localStorage.getItem('icc-combat-saves') ?? '[]'); }
    catch { return []; }
  }

  function persistSaves(list: SavedLoadout[]) {
    localStorage.setItem('icc-combat-saves', JSON.stringify(list));
    savedLoadouts = list;
  }

  function encodeLoadout(l: Loadout): string {
    // 38+n bytes: 1 version + 15 slots×uint16-LE + 6 enchants×uint8 + 1 name-len + n name-bytes
    const nameBytes = new TextEncoder().encode(l.label ?? '');
    const nameLen = Math.min(nameBytes.length, 255);
    const buf = new Uint8Array(38 + nameLen);
    buf[0] = 1;
    for (let i = 0; i < 15; i++) {
      const id = Math.max(0, l.equipped[SLOT_ORDER[i]] ?? 0);
      buf[1 + i * 2] = id & 0xFF;
      buf[2 + i * 2] = (id >> 8) & 0xFF;
    }
    for (let i = 0; i < 6; i++) {
      buf[31 + i] = Math.round(l.enchants[ENCHANT_TYPES[i]] ?? 0);
    }
    buf[37] = nameLen;
    buf.set(nameBytes.slice(0, nameLen), 38);
    return 'ICC-' + btoa(String.fromCharCode(...buf));
  }

  function decodeLoadoutCode(code: string): { equipped: Record<string, number>; enchants: Enchants; name: string } | null {
    try {
      const trimmed = code.trim();
      if (!trimmed.startsWith('ICC-')) return null;
      const raw = atob(trimmed.slice(4));
      if (raw.charCodeAt(0) !== 1 || raw.length < 38) return null;
      const nameLen = raw.charCodeAt(37);
      if (raw.length !== 38 + nameLen) return null;
      const equipped: Record<string, number> = {};
      for (let i = 0; i < 15; i++) {
        const id = raw.charCodeAt(1 + i * 2) | (raw.charCodeAt(2 + i * 2) << 8);
        if (id > 0) equipped[SLOT_ORDER[i]] = id;
      }
      const enchants = emptyEnchants();
      for (let i = 0; i < 6; i++) {
        enchants[ENCHANT_TYPES[i]] = raw.charCodeAt(31 + i);
      }
      const nameBytes = new Uint8Array(nameLen);
      for (let i = 0; i < nameLen; i++) nameBytes[i] = raw.charCodeAt(38 + i);
      const name = new TextDecoder().decode(nameBytes);
      return { equipped, enchants, name };
    } catch { return null; }
  }

  function deleteSave(name: string) {
    persistSaves(loadSavedLoadouts().filter(s => s.name !== name));
  }

  // ── Add loadout modal ──────────────────────────────────────────────────────

  function hScroll(e: WheelEvent) {
    if (e.deltaY === 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
  }

  function openAddModal() {
    savedLoadouts = loadSavedLoadouts();
    addModalOpen = true;
    addCodeInput = '';
    addCodeError = '';
  }

  function closeAddModal() {
    addModalOpen = false;
    addCodeInput = '';
    addCodeError = '';
  }

  function addDuplicate() {
    addLoadout();
    closeAddModal();
  }

  function addFromSave(save: SavedLoadout) {
    nextId++;
    loadouts = [...loadouts, { id: nextId, label: save.name, equipped: { ...save.equipped }, enchants: { ...save.enchants } }];
    activeIdx = loadouts.length - 1;
    closeAddModal();
  }

  function addFromCode() {
    const decoded = decodeLoadoutCode(addCodeInput);
    if (!decoded) { addCodeError = 'Invalid code'; return; }
    nextId++;
    loadouts = [...loadouts, { id: nextId, label: decoded.name || `${loadouts.length + 1}`, equipped: decoded.equipped, enchants: decoded.enchants }];
    activeIdx = loadouts.length - 1;
    closeAddModal();
  }

  // ── Tab options modal ──────────────────────────────────────────────────────

  function openTabMenu() {
    tabMenuOpen = true;
    tabMenuMode = 'menu';
    tabMenuRenameValue = loadouts[activeIdx]?.label ?? '';
    tabMenuSaveNameValue = loadouts[activeIdx]?.label ?? '';
    tabMenuExportCode = '';
    tabMenuSaveError = '';
    tabMenuCopied = false;
  }

  function closeTabMenu() { tabMenuOpen = false; }

  function doRename() {
    const name = tabMenuRenameValue.trim();
    if (!name) return;
    const updated = [...loadouts];
    updated[activeIdx] = { ...updated[activeIdx], label: name };
    loadouts = updated;
    closeTabMenu();
  }

  function doSaveToLibrary() {
    const name = tabMenuSaveNameValue.trim();
    if (!name) { tabMenuSaveError = 'Enter a name'; return; }
    const saves = loadSavedLoadouts();
    const idx = saves.findIndex(s => s.name === name);
    const entry: SavedLoadout = { name, equipped: { ...loadouts[activeIdx].equipped }, enchants: { ...loadouts[activeIdx].enchants }, savedAt: Date.now() };
    if (idx >= 0) saves[idx] = entry; else saves.push(entry);
    persistSaves(saves);
    closeTabMenu();
  }

  function openExportMode() {
    tabMenuExportCode = encodeLoadout(loadouts[activeIdx]);
    tabMenuMode = 'export';
    tabMenuCopied = false;
  }

  async function copyExportCode() {
    await navigator.clipboard.writeText(tabMenuExportCode);
    tabMenuCopied = true;
  }

  function setLevel(field: 'attackLevel' | 'strengthLevel' | 'defenceLevel' | 'archeryLevel' | 'magicLevel', raw: string) {
    const v = Math.max(1, Math.min(120, parseInt(raw) || 1));
    if (field === 'attackLevel') attackLevel = v;
    else if (field === 'strengthLevel') strengthLevel = v;
    else if (field === 'defenceLevel') defenceLevel = v;
    else if (field === 'archeryLevel') archeryLevel = v;
    else magicLevel = v;
  }

  const COMPLETIONIST_CAPE_TIERS: Record<number, number> = { 529: 1, 530: 2, 531: 3, 532: 4 };

  const WEAKNESS_LABELS: Record<number, string> = {
    1: 'Stab', 2: 'Slash', 3: 'Pound', 4: 'Crush',
    5: 'Arch', 6: 'Magic', 7: 'Varies', 8: 'All',
  };

  function getWeakness(m: Monster): string | null {
    if (m.weaknessType != null && m.weaknessType > 0) {
      return WEAKNESS_LABELS[m.weaknessType] ?? null;
    }
    return null;
  }

  function formatMonsterName(name: string): string {
    return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  function formatDropTime(kph: number, dropRate: number): string {
    const hours = 1 / dropRate / kph;
    if (hours < 1 / 60) return `${(hours * 3600).toFixed(0)}s`;
    if (hours < 1) return `${(hours * 60).toFixed(1)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  }

  // Potions
  let potionGreatSight       = false;
  let potionSwiftness        = false;
  let potionPurePower        = false;
  let potionDarkMagic        = false;
  let potionAncientKnowledge = false;
  let potionAscension        = false;
  let potionResurrection     = false;

  // Player upgrades
  let upgMonsterHunter      = false;
  let upgBountyHunter       = false;
  let upgPrinciplesOfCombat = false;
  let upgBullseye           = false;

  // Clan upgrades
  let upgClanBossSlayers  = false;
  let upgGetUp            = false;
  let royalExtermination  = 0;


  // Task toggles
  let taskIsClanQuest               = false;
  let taskIsExterminatingAssignment = false;
  let taskIsQuest                   = false;

  // Buff group collapse state (default collapsed)
  let upgradesCollapsed = true;
  let potionsCollapsed  = true;
  let taskCollapsed     = true;

  const UPGRADES_TOTAL = 7;
  const POTIONS_TOTAL  = 7;
  const TASK_TOTAL     = 3;

  $: upgradesActiveCount = [upgMonsterHunter, upgBountyHunter, upgPrinciplesOfCombat, upgBullseye, upgClanBossSlayers, upgGetUp].filter(Boolean).length + (royalExtermination > 0 ? 1 : 0);
  $: potionsActiveCount  = [potionGreatSight, potionSwiftness, potionPurePower, potionDarkMagic, potionAncientKnowledge, potionAscension, potionResurrection].filter(Boolean).length;
  $: taskActiveCount     = [taskIsClanQuest, taskIsExterminatingAssignment, taskIsQuest].filter(Boolean).length;

  const GOLD_ITEM_ID = 19;
  $: keyItemIds = new Set(
    $allItems.filter(i => i.name.endsWith('_key') || i.name.endsWith('_chest')).map(i => i.id)
  );

  // ── Combat formula helpers ─────────────────────────────────────────────────

function calcAugmented(level: number, bonus: number): number {
    return Math.floor((level + 8) * (bonus + 64) / 10);
  }

  function calcHitChance(augAcc: number, augDef: number, accModPct: number): number {
    if (augAcc <= 0) return 0;
    const raw = augAcc < augDef
      ? Math.max(0, (augAcc - 1) / (augDef * 2))
      : 1 - (augDef + 1) / (augAcc * 2);
    const H = Math.floor(raw * 100);
    const D = Math.floor(101 - raw * 100);
    if (H <= 0) return 0;
    if (D <= 0) return 1;
    const hitMult = 1 + accModPct / 100;
    let hits = 0;
    for (let off = 0; off < H; off++) {
      const bh = off * hitMult;
      for (let d = 0; d < D; d++) {
        if (bh > d) hits++;
      }
    }
    return hits / (H * D);
  }

  function isWeakToStyle(weaknessType: number | null, weaponStyleNum: number): boolean {
    if (weaknessType == null || weaknessType <= 0) return false;
    if (weaknessType === 8) return true;
    return weaknessType === weaponStyleNum;
  }

  $: allDPS = loadouts.map(loadout => {
    const eq  = loadout.equipped;
    const enc = loadout.enchants;

    let meleeStr = 0, meleeAcc = 0;
    let archStr  = 0, archAcc  = 0;
    let magStr   = 0, magAcc   = 0;
    let weakBoostPct = 0;

    for (const id of Object.values(eq)) {
      if (typeof id !== 'number' || id < 0) continue;
      const item = $allEquipment.find(i => i.id === id);
      if (!item) continue;
      meleeStr += item.strengthBonus;
      meleeAcc += item.accuracyBonus;
      archStr  += item.archeryStrengthBonus;
      archAcc  += item.archeryAccuracyBonus;
      magStr   += item.magicStrengthBonus;
      magAcc   += item.magicAccuracyBonus;
      weakBoostPct += item.extraBoostAgainstWeak;
    }

    const weaponId = eq['rightHand'];
    const weapon = (typeof weaponId === 'number' && weaponId >= 0)
      ? ($allEquipment.find(i => i.id === weaponId) ?? null)
      : null;

    let style: 'melee' | 'archery' | 'magic' = 'melee';
    let weaponStyleNum = weapon?.style ?? 0;
    if (weapon) {
      if (weapon.style === 5) style = 'archery';
      else if (weapon.style === 6) style = 'magic';
    }

    let baseInterval = (weapon?.attackInterval ?? 0) > 0 ? weapon!.attackInterval : 3600;
    if (potionSwiftness) baseInterval = baseInterval - Math.floor(baseInterval * 10 / 100);
    const interval = baseInterval;

    const m = selectedMonster;
    let dps = 0, hitChance = 0, maxHit = 0, minHit = 1;
    let xpPerHour = 0, kph = 0, ttk = 0, avgHit = 0, respawn = 0;

    if (m) {
      const isBoss = m.isBoss;
      const isClanBoss = m.bossType > 0;
      const weakToPlayer = isWeakToStyle(m.weaknessType, weaponStyleNum);
      const enchantMult = potionAncientKnowledge ? 1.5 : 1.0;

      let strLevel: number;
      let strBonus: number;
      let accLevel: number;
      let accBonus: number;
      let defBonusEnemy: number;
      let accModPct = 0.0;
      let damageMod = 1.0;

      if (style === 'archery') {
        strLevel = archeryLevel;
        strBonus = upgBullseye ? archStr + Math.floor(archStr * 20 / 100) : archStr;
        accLevel = archeryLevel;
        accBonus = archAcc;
        defBonusEnemy = m.archeryDefenceBonus;
        const enchPct = enc.archery * enchantMult;
        accModPct += enchPct;
        damageMod += enchPct / 100;
        if (potionGreatSight) { accModPct += 10; damageMod += 0.10; }
      } else if (style === 'magic') {
        strLevel = magicLevel;
        strBonus = magStr;
        accLevel = magicLevel;
        accBonus = magAcc;
        defBonusEnemy = m.magicDefenceBonus;
        const enchPct = enc.magic * enchantMult;
        accModPct += enchPct;
        damageMod += enchPct / 100;
        if (potionDarkMagic) damageMod += 1.05;
      } else {
        strLevel = strengthLevel;
        strBonus = meleeStr;
        accLevel = attackLevel;
        accBonus = meleeAcc;
        defBonusEnemy = m.meleeDefenceBonus;
        const enchAccPct = enc.attack   * enchantMult;
        const enchStrPct = enc.strength * enchantMult;
        accModPct += enchAccPct;
        damageMod += enchStrPct / 100;
        if (potionPurePower) { accModPct += 20; damageMod += 0.20; }
      }

      if (taskIsExterminatingAssignment) {
        const extEnchPct = enc.exterminating * enchantMult;
        accModPct += extEnchPct;
        damageMod += extEnchPct / 100;
      }

      if (taskIsExterminatingAssignment && royalExtermination > 0) {
        strLevel = strLevel + Math.floor(strLevel * royalExtermination / 100);
        accLevel = accLevel + Math.floor(accLevel * royalExtermination / 100);
      }

      for (const id of Object.values(eq)) {
        if (typeof id !== 'number' || id < 0) continue;
        const compTier = COMPLETIONIST_CAPE_TIERS[id];
        if (compTier !== undefined) {
          const pct    = [0, 5, 10, 15, 20][compTier];
          const extPct = [0, 6, 12, 18, 24][compTier];
          accModPct += pct; damageMod += pct / 100;
          if (taskIsExterminatingAssignment) { accModPct += extPct; damageMod += extPct / 100; }
          continue;
        }
        const item = $allEquipment.find(i => i.id === id);
        if (!item || item.skillBoostPct <= 0) continue;
        const s = item.skillBoostSkill;
        const pct = item.skillBoostPct;
        if (style === 'melee' && s === 1)        { accModPct += pct; }
        else if (style === 'melee' && s === 2)   { damageMod += pct / 100; }
        else if (style === 'archery' && s === 4) { accModPct += pct; damageMod += pct / 100; }
        else if (style === 'magic' && s === 5)   { accModPct += pct; damageMod += pct / 100; }
        else if (s === 20 && taskIsExterminatingAssignment) { accModPct += pct; damageMod += pct / 100; }
      }

      if (weakToPlayer) damageMod += 0.20;
      if (taskIsClanQuest && upgMonsterHunter) damageMod += 0.20;
      if (potionAscension && isClanBoss) { damageMod += 0.15; accModPct += 15; }

      let equipBoostPct = 0.0;
      if (taskIsExterminatingAssignment && upgBountyHunter) equipBoostPct += 10;
      if (!isBoss && !isClanBoss && weakToPlayer) equipBoostPct += weakBoostPct;
      if (upgClanBossSlayers && isClanBoss) equipBoostPct += 10;

      const strBonusF = strBonus * (1 + equipBoostPct / 100);
      const accBonusF = accBonus * (1 + equipBoostPct / 100);

      const augAcc = calcAugmented(accLevel, Math.floor(accBonusF));
      let augDef = calcAugmented(m.defenceLevel, defBonusEnemy);
      const augDefRaw = augDef;
      if (weakToPlayer && m.weaknessType !== 8) augDef = (Math.max(0, augDef - augDef * 20 / 100)) | 0;

      const rawMax = Math.floor((13 + strLevel + strBonusF / 8 + strLevel * strBonusF / 64) / 10);
      maxHit = Math.floor(rawMax * damageMod);
      minHit = upgPrinciplesOfCombat ? Math.max(1, Math.ceil(maxHit * 0.05)) : 1;

      hitChance = calcHitChance(augAcc, augDef, accModPct);

      if (hitChance > 0 && maxHit > 0) {
        let rawRespawn = m.respawnTime > 0 ? m.respawnTime : 2550;
        if (upgGetUp) rawRespawn = rawRespawn - rawRespawn * 50 / 100;
        if (potionResurrection) rawRespawn = rawRespawn - rawRespawn * 40 / 100;
        rawRespawn = rawRespawn | 0;
        const expectedAttacks = Math.ceil(m.health / ((minHit + maxHit) / 2)) / hitChance;
        const cycleTime = (expectedAttacks * (interval / 1000)) + (rawRespawn / 1000);
        dps = m.health / cycleTime;
        kph = 3600 / cycleTime;
        ttk = expectedAttacks * (interval / 1000);
        respawn = rawRespawn / 1000;
        avgHit = hitChance * (minHit + maxHit) / 2;
        xpPerHour = dps * 4 * 3600;
      }
    }

    let goldPerHour = 0;
    let marketGoldPerHour = 0;
    let ritualPowerPerHour = 0;
    const keyDrops = new Map<number, number>();
    if (m && kph > 0) {
      const cache = $priceCache;
      for (const drop of m.loot) {
        const qty = kph * drop.dropRate * drop.avgAmount;
        if (drop.itemId === GOLD_ITEM_ID) {
          goldPerHour += qty;
          marketGoldPerHour += qty;
        } else {
          marketGoldPerHour += qty * (cache[drop.itemId]?.highestBuy ?? 0);
        }
        const item = $allItems.find(i => i.id === drop.itemId);
        if (item && item.ritualPowerModifier > 0) {
          ritualPowerPerHour += qty * item.baseValue * item.ritualPowerModifier;
        }
        if (keyItemIds.has(drop.itemId)) keyDrops.set(drop.itemId, (keyDrops.get(drop.itemId) ?? 0) + kph * drop.dropRate);
      }
    }

    return { style, dps, hitChance, maxHit, minHit, interval, xpPerHour, kph, ttk, avgHit, respawn, goldPerHour, marketGoldPerHour, ritualPowerPerHour, keyDrops };
  });

  onMount(async () => {
    savedLoadouts = loadSavedLoadouts();
    await loadGameConfig();
  });
</script>



<DevPanel>
  <div class="dev-row"><span class="dev-key">Items loaded</span><span class="dev-val">{$allItems.length}</span></div>
  <div class="dev-row"><span class="dev-key">Equipment</span><span class="dev-val">{$allEquipment.length} items</span></div>
  <div class="dev-row"><span class="dev-key">Monsters</span><span class="dev-val">{$allMonsters.length}</span></div>
  <div class="dev-row"><span class="dev-key">Loadouts</span><span class="dev-val">{loadouts.length} · active #{activeIdx + 1}</span></div>
  <div class="dev-sep"></div>
  <div class="dev-row"><span class="dev-key">Config API</span><span class="dev-val">/Configuration/game-data</span></div>
  <div class="dev-row"><span class="dev-key">Profile API</span><span class="dev-val">/PlayerProfile/{'{name}'}</span></div>
</DevPanel>

<div class="container">

  {#if importedPlayerName}
    <div class="import-active">
      <span class="import-name">{importedPlayerName}</span>
      <button class="import-refresh" on:click={refreshImport} disabled={refreshCooldown} title="Refresh player data">↺</button>
      <button class="import-clear" on:click={clearImport}>×</button>
    </div>
  {:else}
    <button class="top-import-btn" on:click={openImportModal}>Import Player Data</button>
  {/if}

  <!-- Player: Skills + Buffs -->
  <div class="section">
    <div class="section-label">Player</div>
    <div class="skills-row">
      <label class="skill-field">
        <span>Atk</span>
        <input type="number" min="1" max="120" value={attackLevel}   on:change={e => setLevel('attackLevel',   e.currentTarget.value)} />
      </label>
      <label class="skill-field">
        <span>Str</span>
        <input type="number" min="1" max="120" value={strengthLevel} on:change={e => setLevel('strengthLevel', e.currentTarget.value)} />
      </label>
      <label class="skill-field">
        <span>Def</span>
        <input type="number" min="1" max="120" value={defenceLevel}  on:change={e => setLevel('defenceLevel',  e.currentTarget.value)} />
      </label>
      <label class="skill-field">
        <span>Arch</span>
        <input type="number" min="1" max="120" value={archeryLevel}  on:change={e => setLevel('archeryLevel',  e.currentTarget.value)} />
      </label>
      <label class="skill-field">
        <span>Mag</span>
        <input type="number" min="1" max="120" value={magicLevel}    on:change={e => setLevel('magicLevel',    e.currentTarget.value)} />
      </label>
    </div>

    <div class="buff-groups">
      <div class="buff-group">
        <button class="buff-group-header" on:click={() => upgradesCollapsed = !upgradesCollapsed}>
          <span class="buff-group-label">Upgrades</span>
          <span class="buff-group-count"><span class="buff-count-num" class:buff-count-on={upgradesActiveCount > 0}>{upgradesActiveCount}</span><span class="buff-count-den">/{UPGRADES_TOTAL}</span></span>
          <svg class="buff-chevron" class:expanded={!upgradesCollapsed} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        {#if !upgradesCollapsed}
          <div class="buff-group-pills">
            <button class="buff-pill" class:active={upgMonsterHunter}      on:click={() => upgMonsterHunter      = !upgMonsterHunter}>Monster Hunter</button>
            <button class="buff-pill" class:active={upgBountyHunter}       on:click={() => upgBountyHunter       = !upgBountyHunter}>Bounty Hunter</button>
            <button class="buff-pill" class:active={upgPrinciplesOfCombat} on:click={() => upgPrinciplesOfCombat = !upgPrinciplesOfCombat}>Principles</button>
            <button class="buff-pill" class:active={upgBullseye}           on:click={() => upgBullseye           = !upgBullseye}>Bullseye</button>
            <button class="buff-pill" class:active={upgClanBossSlayers}    on:click={() => upgClanBossSlayers    = !upgClanBossSlayers}>Boss Slayers</button>
            <button class="buff-pill" class:active={upgGetUp}              on:click={() => upgGetUp              = !upgGetUp}>Get Up</button>
            <span class="buff-pill buff-pill-input">
              <span>Royal Ext.</span>
              <input class="buff-tier-input" type="number" min="0" max="20" bind:value={royalExtermination} />
              <span class="buff-note">/20</span>
            </span>
          </div>
        {/if}
      </div>
      <div class="buff-group">
        <button class="buff-group-header" on:click={() => potionsCollapsed = !potionsCollapsed}>
          <span class="buff-group-label">Potions</span>
          <span class="buff-group-count"><span class="buff-count-num" class:buff-count-on={potionsActiveCount > 0}>{potionsActiveCount}</span><span class="buff-count-den">/{POTIONS_TOTAL}</span></span>
          <svg class="buff-chevron" class:expanded={!potionsCollapsed} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        {#if !potionsCollapsed}
          <div class="buff-group-pills">
            <button class="buff-pill" class:active={potionGreatSight}       on:click={() => potionGreatSight       = !potionGreatSight}>Great Sight</button>
            <button class="buff-pill" class:active={potionPurePower}        on:click={() => potionPurePower        = !potionPurePower}>Pure Power</button>
            <button class="buff-pill" class:active={potionDarkMagic}        on:click={() => potionDarkMagic        = !potionDarkMagic}>Dark Magic</button>
            <button class="buff-pill" class:active={potionSwiftness}        on:click={() => potionSwiftness        = !potionSwiftness}>Swiftness</button>
            <button class="buff-pill" class:active={potionAncientKnowledge} on:click={() => potionAncientKnowledge = !potionAncientKnowledge}>Anc. Knowledge</button>
            <button class="buff-pill" class:active={potionAscension}        on:click={() => potionAscension        = !potionAscension}>Ascension</button>
            <button class="buff-pill" class:active={potionResurrection}     on:click={() => potionResurrection     = !potionResurrection}>Resurrection</button>
          </div>
        {/if}
      </div>
      <div class="buff-group">
        <button class="buff-group-header" on:click={() => taskCollapsed = !taskCollapsed}>
          <span class="buff-group-label">Task</span>
          <span class="buff-group-count"><span class="buff-count-num" class:buff-count-on={taskActiveCount > 0}>{taskActiveCount}</span><span class="buff-count-den">/{TASK_TOTAL}</span></span>
          <svg class="buff-chevron" class:expanded={!taskCollapsed} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        {#if !taskCollapsed}
          <div class="buff-group-pills">
            <button class="buff-pill" class:active={taskIsClanQuest}               on:click={() => taskIsClanQuest               = !taskIsClanQuest}>Clan Quest</button>
            <button class="buff-pill" class:active={taskIsExterminatingAssignment} on:click={() => taskIsExterminatingAssignment = !taskIsExterminatingAssignment}>Exterminating</button>
            <button class="buff-pill" class:active={taskIsQuest}                   on:click={() => taskIsQuest                   = !taskIsQuest}>Daily/Weekly</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Loadout tabs + gear grid + stats -->
  <div class="section-label">Loadout</div>
  <div class="gear-section">

    <div class="tab-bar">
      <div class="tab-scroll" on:wheel|nonpassive={hScroll}>
        {#each loadouts as loadout, i}
          <button
            class="tab"
            class:active={i === activeIdx}
            on:click={() => activeIdx = i}
          >
            <span class="tab-label">{loadout.label}</span>
            {#if loadouts.length > 1}
              <span class="tab-close" role="button" tabindex="-1" on:click|stopPropagation={() => removeLoadout(i)}>×</span>
            {/if}
          </button>
        {/each}
      </div>
      {#if loadouts.length < 20}
        <button class="tab-add" on:click={openAddModal} title="Add loadout">+</button>
      {/if}
      <button class="tab-options-btn" on:click={openTabMenu} title="Loadout options">···</button>
      <button class="clear-loadout-btn" on:click={clearLoadout} title="Clear loadout">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 3h10M4 3V2h4v1M5 5.5v4M7 5.5v4M2 3l.7 7.5a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L10 3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="gear-card">
      <div class="gear-grid">
        {#each SLOTS as slot}
          {@const name = slotNames[slot.key] ?? ''}
          <div
            class="slot"
            class:filled={name !== ''}
            class:active={pickerSlot === slot.key}
            style="grid-row:{slot.row};grid-column:{slot.col}"
            role="button"
            tabindex="0"
            title={name || slot.label}
            on:click={() => openPicker(slot.key)}
            on:keydown={(e) => e.key === 'Enter' && openPicker(slot.key)}
          >
            <span class="slot-label">{slot.label}</span>
            {#if slotRawNames[slot.key]}
              <img class="slot-img" src="./itemicons/{slotRawNames[slot.key]}.png" alt={name} on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
            {:else if name}
              <span class="slot-name">{name}</span>
            {:else}
              <span class="slot-plus">+</span>
            {/if}
          </div>
        {/each}
        <!-- Empty cell at 4,4 to complete the grid -->
        <div class="slot slot-blank" style="grid-row:4;grid-column:2"></div>
      </div>
      <div class="enchant-wrap">
        <div class="enchant-section-label">Enchants</div>
        <div class="enchant-row">
          {#each ENCHANT_TYPES as etype}
            <div class="enchant-field">
              <span class="enchant-field-label">{ENCHANT_LABELS[etype]}</span>
              <div class="enchant-field-wrap">
                <input
                  class="enchant-field-input"
                  type="number" min="0" max="100" step="0.5"
                  value={loadouts[activeIdx]?.enchants[etype] ?? 0}
                  on:change={e => setEnchantPct(etype, e.currentTarget.value)}
                />
                <span class="enchant-field-pct">%</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Enemy selection -->
  <div class="section" id="enemy-section">
    <div class="section-label">Enemy</div>
    <div class="section-body">
      {#if selectedMonster}
        {@const weakness = getWeakness(selectedMonster)}
        <div class="enemy-card">
          <img class="enemy-img" src="./combat/{selectedMonster.name}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          <div class="enemy-card-info">
            <div class="enemy-selected">
              <span class="enemy-name">{formatMonsterName(selectedMonster.name)}</span>
              <div class="enemy-selected-right">
                {#if weakness}
                  <span class="weakness-badge weakness-{weakness.toLowerCase()}">{weakness}</span>
                {/if}
                <button class="enemy-clear" on:click={clearMonster}>×</button>
              </div>
            </div>
            <div class="enemy-stats-grid">
              <div class="enemy-stat">
                <span class="enemy-stat-label">Atk</span>
                <span class="enemy-stat-val">{selectedMonster.attackLevel}</span>
              </div>
              <div class="enemy-stat">
                <span class="enemy-stat-label">Str</span>
                <span class="enemy-stat-val">{selectedMonster.strengthLevel}</span>
              </div>
              <div class="enemy-stat">
                <span class="enemy-stat-label">Def</span>
                <span class="enemy-stat-val">{selectedMonster.defenceLevel}</span>
              </div>
              <div class="enemy-stat">
                <span class="enemy-stat-label">HP</span>
                <span class="enemy-stat-val">{selectedMonster.health}</span>
              </div>
              <div class="enemy-stat" class:weak={weakness === 'Arch'}>
                <span class="enemy-stat-label">Arch</span>
                <span class="enemy-stat-val">{selectedMonster.archeryLevel}</span>
              </div>
              <div class="enemy-stat" class:weak={weakness === 'Magic'}>
                <span class="enemy-stat-label">Mag</span>
                <span class="enemy-stat-val">{selectedMonster.magicLevel}</span>
              </div>
            </div>
            {#if selectedMonster.loot.length > 0}
              <button
                class="drop-table-btn"
                class:drop-table-has-target={selectedDropItemId !== null}
                on:click={openDropTable}
              >
                {#if selectedDropItemId !== null}
                  {@const item = $allItems.find(i => i.id === selectedDropItemId)}
                  <span class="drop-table-btn-name">{item ? formatItemName(item.name) : `#${selectedDropItemId}`}</span>
                  <!-- svelte-ignore a11y-click-events-have-key-events -->
                  <span class="drop-table-btn-clear" role="button" on:click|stopPropagation={() => selectedDropItemId = null}>×</span>
                {:else}
                  <span>Drop Table</span>
                  <svg class="drop-table-chevron" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                {/if}
              </button>
            {/if}
          </div>
        </div>
      {:else}
        <button class="select-enemy-btn" on:click={openMonsterPicker}>Select Enemy…</button>
      {/if}
    </div>
  </div>

  <!-- Results comparison -->
  {#if selectedMonster}
  {@const bestDPS = Math.max(...allDPS.map(d => d.dps))}
  {@const bestKPH = Math.max(...allDPS.map(d => d.kph))}
  {@const bestXP  = Math.max(...allDPS.map(d => d.xpPerHour))}
  {@const bestMkt = Math.max(...allDPS.map(d => d.marketGoldPerHour))}
  <div class="section">
    <div class="section-label">Results vs {formatMonsterName(selectedMonster.name)}</div>
    <div class="results-wrap">

    {#if loadouts.length === 1}
      {@const d = allDPS[0]}
      {@const soloLabel = /^\d+$/.test(loadouts[0].label) ? `Loadout ${loadouts[0].label}` : loadouts[0].label}
      <div class="result-solo">
        <div class="result-header">
          <span class="result-name result-name-active">{soloLabel}</span>
          <span class="result-style-badge">{d.style[0].toUpperCase() + d.style.slice(1)}</span>
        </div>
        <div class="result-hero">
          <div class="result-hero-stat">
            <span class="result-hero-label">DPS</span>
            <span class="result-hero-value">{d.dps > 0 ? d.dps.toFixed(2) : '—'}</span>
          </div>
          <div class="result-hero-divider"></div>
          <div class="result-hero-stat">
            <span class="result-hero-label">KPH</span>
            <span class="result-hero-value">{d.kph > 0 ? Math.round(d.kph).toString() : '—'}</span>
          </div>
          <div class="result-hero-divider"></div>
          <div class="result-hero-stat">
            <span class="result-hero-label">XP/h</span>
            <span class="result-hero-value">{d.xpPerHour > 0 ? formatGold(Math.round(d.xpPerHour)) : '—'}</span>
          </div>
        </div>
        <div class="result-details-always">
          <div class="result-detail-cell">
            <span class="result-label">Hit%</span>
            <span class="result-value">{d.hitChance > 0 ? (d.hitChance * 100).toFixed(1) + '%' : '—'}</span>
          </div>
          <div class="result-detail-cell">
            <span class="result-label">Hit Range</span>
            <span class="result-value">{d.maxHit > 0 ? `${d.minHit}–${d.maxHit}` : '—'}</span>
          </div>
          <div class="result-detail-cell">
            <span class="result-label">Avg Hit</span>
            <span class="result-value">{d.avgHit > 0 ? d.avgHit.toFixed(1) : '—'}</span>
          </div>
          <div class="result-detail-cell">
            <span class="result-label">Atk Speed</span>
            <span class="result-value">{(d.interval / 1000).toFixed(2)}s</span>
          </div>
          <div class="result-detail-cell">
            <span class="result-label">TTK</span>
            <span class="result-value">{d.ttk > 0 ? d.ttk.toFixed(1) + 's' : '—'}</span>
          </div>
          <div class="result-detail-cell">
            <span class="result-label">Respawn</span>
            <span class="result-value">{d.respawn > 0 ? d.respawn.toFixed(1) + 's' : '—'}</span>
          </div>
        </div>
        {#if selectedDropItemId !== null}
          {@const targetDrop = selectedMonster?.loot.find(l => l.itemId === selectedDropItemId)}
          {#if targetDrop}
            <div class="result-drop-target">
              <span class="result-drop-item-name">{formatItemName($allItems.find(i => i.id === selectedDropItemId)?.name ?? `#${selectedDropItemId}`)}</span>
              {#if d.kph > 0}
                <div class="result-drop-right">
                  <span class="result-drop-kills">{Math.round(1 / targetDrop.dropRate).toLocaleString()} kills</span>
                  <span class="result-drop-time">{formatDropTime(d.kph, targetDrop.dropRate)}</span>
                </div>
              {:else}
                <span class="result-drop-time">—</span>
              {/if}
            </div>
          {/if}
        {/if}
        {#if d.marketGoldPerHour > 0 || d.goldPerHour > 0 || d.ritualPowerPerHour > 0 || d.keyDrops.size > 0}
          <div class="result-profit-section">
            <span class="result-section-label">Profit</span>
            {#if d.marketGoldPerHour > 0}
              <div class="result-detail-cell">
                <span class="result-label">Market/h</span>
                <span class="result-value">{formatGold(Math.round(d.marketGoldPerHour))}</span>
              </div>
            {/if}
            {#if d.goldPerHour > 0}
              <div class="result-detail-cell">
                <span class="result-label">Raw gold/h</span>
                <span class="result-value">{formatGold(Math.round(d.goldPerHour))}</span>
              </div>
            {/if}
            {#if d.ritualPowerPerHour > 0}
              <div class="result-detail-cell">
                <span class="result-label">Ritual/h</span>
                <span class="result-value">{formatGold(Math.round(d.ritualPowerPerHour))}</span>
              </div>
            {/if}
            {#each [...d.keyDrops.entries()] as [itemId, rate]}
              <div class="result-detail-cell">
                <span class="result-label">{formatItemName($allItems.find(i => i.id === itemId)?.name ?? `key_${itemId}`)}/h</span>
                <span class="result-value">{rate.toFixed(2)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    {:else}
      <!-- Multiple loadouts: table layout -->
      <div class="result-table-wrap" on:wheel|nonpassive={hScroll}>
        <table class="result-table">
          <thead>
            <tr>
              <th class="rt-label-col"></th>
              {#each loadouts as l, i}
                <th class="rt-head-cell" class:rt-active={i === activeIdx}>
                  <div class="rt-head-inner">
                    <span class="rt-head-name">{l.label}</span>
                    <span class="rt-head-style">{allDPS[i].style[0].toUpperCase() + allDPS[i].style.slice(1)}</span>
                  </div>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="rt-stat" on:mouseenter={(e) => showTooltip(e, 'DPS', 'Damage Per Second — effective DPS accounting for hit chance, attack speed, and the full kill/respawn cycle')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>DPS</td>
              {#each allDPS as d}
                <td class="rt-val rt-hero" class:rt-best={d.dps > 0 && d.dps === bestDPS}>{d.dps > 0 ? d.dps.toFixed(2) : '—'}</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat" on:mouseenter={(e) => showTooltip(e, 'KPH', 'Kills Per Hour — full kill cycle time including respawn wait')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>KPH</td>
              {#each allDPS as d}
                <td class="rt-val rt-hero" class:rt-best={d.kph > 0 && d.kph === bestKPH}>{d.kph > 0 ? Math.round(d.kph).toString() : '—'}</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat" on:mouseenter={(e) => showTooltip(e, 'XP/h', 'Experience Per Hour — 4 XP earned per point of damage dealt')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>XP/h</td>
              {#each allDPS as d}
                <td class="rt-val rt-hero" class:rt-best={d.xpPerHour > 0 && d.xpPerHour === bestXP}>{d.xpPerHour > 0 ? formatGold(Math.round(d.xpPerHour)) : '—'}</td>
              {/each}
            </tr>
            <tr class="rt-divider"><td class="rt-divider-cell" colspan={loadouts.length + 1}></td></tr>
            <tr>
              <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Hit%', 'Hit Chance — probability of landing a successful hit per attack')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Hit%</td>
              {#each allDPS as d}
                <td class="rt-val rt-sub">{d.hitChance > 0 ? (d.hitChance * 100).toFixed(1) + '%' : '—'}</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Hit Range', 'Hit Range — minimum and maximum damage per successful hit')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Hit Range</td>
              {#each allDPS as d}
                <td class="rt-val rt-sub">{d.maxHit > 0 ? `${d.minHit}–${d.maxHit}` : '—'}</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Avg Hit', 'Average Hit — expected damage per attack (hit chance × average of the hit range)')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Avg Hit</td>
              {#each allDPS as d}
                <td class="rt-val rt-sub">{d.avgHit > 0 ? d.avgHit.toFixed(1) : '—'}</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Atk Speed', 'Attack Speed — time between each attack')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Atk Speed</td>
              {#each allDPS as d}
                <td class="rt-val rt-sub">{(d.interval / 1000).toFixed(2)}s</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'TTK', 'Time to Kill — expected seconds to defeat this enemy, not including respawn')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>TTK</td>
              {#each allDPS as d}
                <td class="rt-val rt-sub">{d.ttk > 0 ? d.ttk.toFixed(1) + 's' : '—'}</td>
              {/each}
            </tr>
            <tr>
              <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Respawn', 'Respawn Time — delay before the enemy reappears after being killed')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Respawn</td>
              {#each allDPS as d}
                <td class="rt-val rt-sub">{d.respawn > 0 ? d.respawn.toFixed(1) + 's' : '—'}</td>
              {/each}
            </tr>
            {#if allDPS.some(d => d.marketGoldPerHour > 0)}
              <tr class="rt-divider"><td class="rt-divider-cell" colspan={loadouts.length + 1}></td></tr>
              <tr>
                <td class="rt-stat" on:mouseenter={(e) => showTooltip(e, 'Market/h', 'Market Gold Per Hour — loot sold at current market buy prices')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Market/h</td>
                {#each allDPS as d}
                  <td class="rt-val rt-hero" class:rt-best={d.marketGoldPerHour > 0 && d.marketGoldPerHour === bestMkt}>{d.marketGoldPerHour > 0 ? formatGold(Math.round(d.marketGoldPerHour)) : '—'}</td>
                {/each}
              </tr>
              {#if allDPS.some(d => d.goldPerHour > 0)}
                <tr>
                  <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Raw Gold/h', 'Raw Gold Per Hour — direct gold drops only, not counting sellable items')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Raw gold/h</td>
                  {#each allDPS as d}
                    <td class="rt-val rt-sub">{d.goldPerHour > 0 ? formatGold(Math.round(d.goldPerHour)) : '—'}</td>
                  {/each}
                </tr>
              {/if}
              {#if allDPS.some(d => d.ritualPowerPerHour > 0)}
                <tr>
                  <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, 'Ritual/h', 'Ritual Power Per Hour — estimated invocation ritual power from sacrificing loot')} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>Ritual/h</td>
                  {#each allDPS as d}
                    <td class="rt-val rt-sub">{d.ritualPowerPerHour > 0 ? formatGold(Math.round(d.ritualPowerPerHour)) : '—'}</td>
                  {/each}
                </tr>
              {/if}
            {/if}
            {#if selectedDropItemId !== null}
              {@const targetDrop = selectedMonster?.loot.find(l => l.itemId === selectedDropItemId)}
              {#if targetDrop}
                {@const dropItemName = formatItemName($allItems.find(i => i.id === selectedDropItemId)?.name ?? `#${selectedDropItemId}`)}
                <tr class="rt-divider"><td class="rt-divider-cell" colspan={loadouts.length + 1}></td></tr>
                <tr>
                  <td class="rt-stat rt-sub" on:mouseenter={(e) => showTooltip(e, dropItemName, `1 in ${Math.round(1 / targetDrop.dropRate).toLocaleString()} kills (${(targetDrop.dropRate * 100).toFixed(2)}% drop rate) — time shown is the expected wait between drops`)} on:mousemove={moveTooltip} on:mouseleave={hideTooltip}>{dropItemName}</td>
                  {#each allDPS as d}
                    <td class="rt-val rt-sub">{d.kph > 0 ? formatDropTime(d.kph, targetDrop.dropRate) : '—'}</td>
                  {/each}
                </tr>
              {/if}
            {/if}
          </tbody>
        </table>
      </div>
    {/if}

    </div>
  </div>
  {/if}

</div>

{#if tooltipVisible}
  <div class="stat-tip" style="left:{tooltipX}px;top:{tooltipY}px">
    <strong class="stat-tip-title">{tooltipTitle}</strong>
    {#if tooltipDesc}<span class="stat-tip-desc">{tooltipDesc}</span>{/if}
  </div>
{/if}

{#if addModalOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closeAddModal}></div>
  <div class="import-panel add-loadout-panel">
    <div class="picker-header">
      <span class="picker-title">Add Loadout</span>
      <button class="picker-close" on:click={closeAddModal}>×</button>
    </div>
    <div class="add-section">
      <button class="add-option-btn" on:click={addDuplicate}>
        <div class="add-option-body">
          <span class="add-option-title">Duplicate Loadout {loadouts[activeIdx]?.label}</span>
          <span class="add-option-desc">Copy current gear & enchants into a new tab</span>
        </div>
      </button>
    </div>
    <div class="add-section add-section-border">
      <div class="add-section-label">Saved Builds</div>
      {#if savedLoadouts.length === 0}
        <div class="add-empty">No saved builds yet — use ··· to save one</div>
      {:else}
        <div class="add-saves-list">
          {#each savedLoadouts as save (save.name)}
            <div class="add-save-row">
              <span class="add-save-name">{save.name}</span>
              <button class="add-save-delete" on:click={() => deleteSave(save.name)} title="Delete">×</button>
              <button class="add-save-load" on:click={() => addFromSave(save)}>Load</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    <div class="add-section add-section-border">
      <div class="add-section-label">Import from Code</div>
      <div class="search-row">
        <input class="search-input" placeholder="Paste code…" bind:value={addCodeInput} on:keydown={(e) => e.key === 'Enter' && addFromCode()} use:focusOnMount />
        <button class="search-btn" on:click={addFromCode}>Load</button>
      </div>
      {#if addCodeError}<div class="search-error">{addCodeError}</div>{/if}
    </div>
  </div>
{/if}

{#if tabMenuOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closeTabMenu}></div>
  <div class="import-panel tab-menu-panel">
    <div class="picker-header">
      <span class="picker-title">{loadouts[activeIdx]?.label}</span>
      <button class="picker-close" on:click={closeTabMenu}>×</button>
    </div>
    {#if tabMenuMode === 'menu'}
      <div class="tab-menu-options">
        <button class="tab-menu-option" on:click={() => { tabMenuMode = 'rename'; tabMenuRenameValue = loadouts[activeIdx]?.label ?? ''; }}>
          Rename
        </button>
        <button class="tab-menu-option" on:click={() => { tabMenuMode = 'save'; tabMenuSaveNameValue = loadouts[activeIdx]?.label ?? ''; tabMenuSaveError = ''; }}>
          Save to Library
        </button>
        <button class="tab-menu-option" on:click={openExportMode}>
          Export Code
        </button>
      </div>
    {:else if tabMenuMode === 'rename'}
      <div class="tab-menu-form">
        <input class="search-input" bind:value={tabMenuRenameValue} use:focusOnMount placeholder="Loadout name…" on:keydown={(e) => e.key === 'Enter' && doRename()} />
        <div class="tab-menu-btns">
          <button class="tab-menu-btn-secondary" on:click={() => tabMenuMode = 'menu'}>Back</button>
          <button class="search-btn" on:click={doRename}>Rename</button>
        </div>
      </div>
    {:else if tabMenuMode === 'save'}
      <div class="tab-menu-form">
        <input class="search-input" bind:value={tabMenuSaveNameValue} use:focusOnMount placeholder="Build name…" on:keydown={(e) => e.key === 'Enter' && doSaveToLibrary()} />
        {#if tabMenuSaveError}<div class="search-error">{tabMenuSaveError}</div>{/if}
        <div class="tab-menu-btns">
          <button class="tab-menu-btn-secondary" on:click={() => tabMenuMode = 'menu'}>Back</button>
          <button class="search-btn" on:click={doSaveToLibrary}>Save</button>
        </div>
      </div>
    {:else if tabMenuMode === 'export'}
      <div class="tab-menu-form">
        <textarea class="tab-menu-code" readonly>{tabMenuExportCode}</textarea>
        <div class="tab-menu-btns">
          <button class="tab-menu-btn-secondary" on:click={() => tabMenuMode = 'menu'}>Back</button>
          <button class="search-btn" on:click={copyExportCode}>{tabMenuCopied ? 'Copied!' : 'Copy'}</button>
        </div>
      </div>
    {/if}
  </div>
{/if}

{#if importModalOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closeImportModal}></div>
  <div class="import-panel">
    <div class="picker-header">
      <span class="picker-title">Import Player</span>
      <button class="picker-close" on:click={closeImportModal}>×</button>
    </div>
    <div class="import-toggles">
      <button class="import-toggle" class:active={importLevels}   on:click={() => importLevels   = !importLevels}>Levels</button>
      <button class="import-toggle" class:active={importUpgrades} on:click={() => importUpgrades = !importUpgrades}>Upgrades</button>
      <button class="import-toggle" class:active={importGear}     on:click={() => importGear     = !importGear}>Gear</button>
    </div>
    {#if readyClients.length > 0}
      <div class="import-chips">
        {#each readyClients as client}
          <button class="chip" on:click={() => doImportFromClient(client)}>{client.playerName}</button>
        {/each}
      </div>
    {/if}
    <div class="import-search">
      <div class="search-row">
        <input
          class="search-input"
          placeholder="Search player…"
          bind:value={importSearch}
          on:keydown={(e) => e.key === 'Enter' && doImportBySearch(importSearch)}
          disabled={importLoading}
          use:focusOnMount
        />
        <button class="search-btn" on:click={() => doImportBySearch(importSearch)} disabled={importLoading}>
          {importLoading ? '…' : 'Load'}
        </button>
      </div>
      {#if importError}
        <div class="search-error">{importError}</div>
      {/if}
    </div>
  </div>
{/if}

{#if monsterPickerOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closeMonsterPicker}></div>
  <div class="picker-panel">
    <div class="picker-header">
      <span class="picker-title">Select Enemy</span>
      <button class="picker-close" on:click={closeMonsterPicker}>×</button>
    </div>
    <div class="picker-search-wrap">
      <input
        class="picker-search"
        placeholder="Search enemies…"
        bind:value={monsterSearch}
        use:focusOnMount
      />
    </div>
    <div class="picker-list">
      {#each filteredMonsters as m (m.name)}
        {@const weakness = getWeakness(m)}
        {@const styleIcon = getMonsterStyle(m) === 'Arch' ? 'Archery' : getMonsterStyle(m) === 'Mag' ? 'Magic' : 'Rigour'}
        <button class="monster-item" on:click={() => selectMonster(m)}>
          <img class="monster-icon" src="./combat/{m.name}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          <span class="monster-name">{formatMonsterName(m.name)}</span>
          <div class="monster-meta">
            <img class="monster-stat-icon" src="./skilltaskicons/Health.png" alt="HP" />
            <span class="monster-hp">{m.health}</span>
            <img class="monster-stat-icon" src="./skilltaskicons/{styleIcon}.png" alt={styleIcon} />
            <span class="monster-weak-tag {weakness ? 'weakness-' + weakness.toLowerCase() : 'weakness-none'}">{weakness ?? 'None'}</span>
          </div>
        </button>
      {/each}
      {#if filteredMonsters.length === 0}
        <div class="picker-empty">No enemies found</div>
      {/if}
    </div>
  </div>
{/if}

{#if pickerSlot}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closePicker}></div>
  <div class="picker-panel">
    <div class="picker-header">
      <span class="picker-title">{pickerLabel}</span>
      <button class="picker-close" on:click={closePicker}>×</button>
    </div>
    <div class="picker-search-wrap">
      <input
        class="picker-search"
        placeholder="Search items…"
        bind:value={pickerSearch}
        autofocus
      />
    </div>
    <div class="picker-list">
      <button class="picker-item picker-item-clear" on:click={clearSlot}>Clear slot</button>
      {#each pickerItems as item (item.id)}
        <button class="picker-item" on:click={() => selectItem(item.id)}>
          <img class="picker-item-icon" src="./itemicons/{item.name}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          {formatItemName(item.name)}
        </button>
      {/each}
      {#if pickerItems.length === 0}
        <div class="picker-empty">{pickerSearch ? 'No items found' : 'No items for this slot'}</div>
      {/if}
    </div>
  </div>
{/if}

{#if dropTableOpen && selectedMonster}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closeDropTable}></div>
  <div class="picker-panel">
    <div class="picker-header">
      <span class="picker-title">Drop Table — {formatMonsterName(selectedMonster.name)}</span>
      <button class="picker-close" on:click={closeDropTable}>×</button>
    </div>
    <div class="picker-search-wrap">
      <input
        class="picker-search"
        placeholder="Search drops…"
        bind:value={dropTableSearch}
        use:focusOnMount
      />
    </div>
    <div class="picker-list">
      <button class="picker-item picker-item-clear" on:click={() => { selectedDropItemId = null; closeDropTable(); }}>Clear selection</button>
      {#each filteredLoot as entry (entry.itemId)}
        {@const item = $allItems.find(i => i.id === entry.itemId)}
        {@const name = item ? formatItemName(item.name) : `#${entry.itemId}`}
        {@const rawName = item?.name ?? ''}
        {@const isSelected = selectedDropItemId === entry.itemId}
        <button
          class="picker-item loot-picker-item"
          class:loot-picker-selected={isSelected}
          on:click={() => { selectedDropItemId = isSelected ? null : entry.itemId; closeDropTable(); }}
        >
          <img class="picker-item-icon" src="./itemicons/{rawName}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          <span class="loot-picker-name">
            {name}{#if entry.avgAmount > 1}<span class="loot-amt"> ×{Number.isInteger(entry.avgAmount) ? entry.avgAmount : entry.avgAmount.toFixed(1)}</span>{/if}
          </span>
          <span class="loot-rate">1 in {Math.round(1 / entry.dropRate).toLocaleString()}</span>
        </button>
      {/each}
      {#if filteredLoot.length === 0}
        <div class="picker-empty">No drops found</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 10px;
  }

  /* ── Top import button ── */
  .top-import-btn {
    width: 100%;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 10px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    letter-spacing: 0.3px;
  }
  .top-import-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .import-active {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-raised); border: 1px solid var(--accent-lo);
    border-radius: 5px; padding: 5px 10px;
  }
  .import-name {
    flex: 1; font-size: 10px; font-weight: 700; color: var(--accent); letter-spacing: 0.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .import-refresh {
    background: none; border: none; color: var(--text-faint);
    font-size: 14px; line-height: 1; cursor: pointer; padding: 0 2px; transition: color 0.15s;
  }
  .import-refresh:hover:not(:disabled) { color: var(--text); }
  .import-refresh:disabled { opacity: 0.3; cursor: default; }
  .import-clear {
    background: none; border: none; color: var(--text-faint);
    font-size: 14px; line-height: 1; cursor: pointer; padding: 0 2px; transition: color 0.15s;
  }
  .import-clear:hover { color: var(--text); }

  /* ── Player section ── */
  .section {
    display: flex;
    flex-direction: column;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--accent);
    padding: 5px 10px 4px;
    white-space: nowrap;
  }
  .section-label::before,
  .section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .section-body {
    padding: 4px 10px 5px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .import-btn {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    padding: 2px 8px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }
  .import-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .chip {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 10px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover { border-color: var(--accent-lo); color: var(--text); }

  .search-row {
    display: flex;
    gap: 6px;
  }

  .search-input {
    flex: 1;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    padding: 5px 8px;
    outline: none;
    transition: border-color 0.15s;
    min-width: 0;
  }
  .search-input:focus { border-color: var(--accent-md); }
  .search-input::placeholder { color: var(--text-faint); }
  .search-input:disabled { opacity: 0.5; }

  .search-btn {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 12px;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
    width: auto;
  }
  .search-btn:hover:not(:disabled) { border-color: var(--accent-md); color: var(--accent); }
  .search-btn:disabled { opacity: 0.5; cursor: default; }

  .search-error {
    font-size: 10px;
    color: var(--neg);
    font-weight: 600;
  }

  /* ── Buff groups ── */
  .buff-groups {
    border-top: 1px solid var(--divider);
    display: flex;
    flex-direction: column;
  }

  .buff-group {
    padding: 5px 10px 6px;
    border-bottom: 1px solid var(--divider);
  }
  .buff-group:last-child { border-bottom: none; padding-bottom: 5px; }

  .buff-group-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
  }
  .buff-group-header:hover .buff-group-label { color: var(--text-sub); }

  .buff-group-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--text-faint);
    transition: color 0.15s;
  }

  .buff-group-count {
    font-family: 'Nunito', sans-serif;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
  }
  .buff-count-num { color: var(--text-faint); }
  .buff-count-num.buff-count-on { color: var(--accent); }
  .buff-count-den { color: var(--text-faint); }

  .buff-chevron {
    width: 10px;
    height: 10px;
    color: var(--text-faint);
    flex-shrink: 0;
    margin-left: auto;
    transition: transform 0.2s;
  }
  .buff-chevron.expanded { transform: rotate(180deg); }

  .buff-group-pills {
    padding-bottom: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .buff-pill {
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-sub);
    cursor: pointer;
    transition: border-color 0.1s, color 0.1s, background 0.1s;
    white-space: nowrap;
  }
  .buff-pill:hover { border-color: var(--accent-md); color: var(--accent); }
  .buff-pill.active { border-color: var(--accent-md); background: var(--bg-raised); color: var(--accent); }
  .buff-pill-input { display: flex; align-items: center; gap: 5px; cursor: default; }
  .buff-note { font-size: 9px; font-weight: 600; color: var(--text-faint); }
  .buff-tier-input {
    width: 32px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 3px;
    text-align: center;
    outline: none;
  }
  .buff-tier-input:focus { border-color: var(--accent-md); }

  /* ── Gear section ── */
  .gear-section {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Loadout tabs ── */
  .tab-bar {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    padding: 0 0 0 2px;
    min-width: 0;
  }

  .tab-scroll {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
  }
  .tab-scroll::-webkit-scrollbar { display: none; }

  .tab {
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 7px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    flex-shrink: 0;
  }

  .tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .tab-close {
    flex-shrink: 0;
    font-size: 13px;
    line-height: 1;
    color: var(--text-faint);
    transition: color 0.15s;
  }
  .tab-close:hover { color: var(--neg); }
  .tab:hover { color: var(--text); border-color: var(--accent-lo); }
  .tab.active {
    background: var(--bg-card);
    border-color: var(--accent-lo);
    color: var(--accent);
  }

  .tab-add {
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
    font-size: 16px;
    font-weight: 400;
    padding: 0 6px 4px;
    cursor: pointer;
    transition: color 0.15s;
    line-height: 1;
    align-self: center;
    flex-shrink: 0;
  }
  .tab-add:hover { color: var(--accent); }

  .tab-import { align-self: center; margin-bottom: 2px; flex-shrink: 0; }

  .clear-loadout-btn {
    align-self: center;
    margin-bottom: 2px;
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: var(--text-faint);
    padding: 3px 4px;
    cursor: pointer;
    transition: color 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .clear-loadout-btn:hover { color: var(--neg); }


  /* ── Gear card (wraps grid + stats) ── */
  .gear-card {
    display: flex;
    flex-direction: column;
  }

  /* ── Gear grid ── */
  .gear-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(4, 1fr);
    gap: 4px;
    padding: 5px 5px 4px;
  }

  .slot {
    aspect-ratio: 1 / 1;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 4px 3px;
    text-align: center;
    overflow: hidden;
    transition: border-color 0.15s, background 0.15s;
    cursor: pointer;
    position: relative;
  }
  .slot:hover { border-color: var(--accent-lo); }

  .slot.filled {
    border-color: var(--accent-lo);
    background: var(--bg-raised);
  }

  .slot.active {
    border-color: var(--accent-hi);
    background: var(--bg-raised);
  }

  .slot-blank {
    background: transparent;
    border-color: transparent;
    pointer-events: none;
    cursor: default;
  }

  /* ── Enchants ── */
  .enchant-wrap {
    padding: 4px 8px 4px;
    border-top: 1px solid var(--divider);
  }

  .enchant-section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    padding-bottom: 4px;
  }

  .enchant-row {
    display: flex;
    gap: 4px;
  }

  .enchant-field {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .enchant-field-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .enchant-field-wrap {
    display: flex;
    align-items: center;
    gap: 1px;
    width: 100%;
  }

  .enchant-field-input {
    flex: 1;
    min-width: 0;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 3px;
    text-align: center;
    outline: none;
    transition: border-color 0.15s;
  }
  .enchant-field-input:focus { border-color: var(--accent-md); }

  .enchant-field-pct {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-faint);
    flex-shrink: 0;
  }

  /* ── Skills row ── */
  .skills-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
    padding: 4px 8px 6px;
  }

  .skill-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .skill-field span {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .skill-field input {
    width: 100%;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 4px;
    text-align: center;
    outline: none;
    transition: border-color 0.15s;
    min-width: 0;
  }
  .skill-field input:focus { border-color: var(--accent-md); }

  /* ── Results section ── */
  .results-wrap {
    padding: 4px 8px 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Single loadout — Option B */
  .result-solo {
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }

  .result-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 5px 8px 4px;
    border-bottom: 1px solid var(--divider);
  }

  .result-name {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-sub);
  }
  .result-name.result-name-active { color: var(--accent); }

  .result-style-badge {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    background: var(--bg-raised);
    border-radius: 3px;
    padding: 2px 5px;
  }

  .result-hero {
    display: flex;
    align-items: stretch;
    padding: 10px 6px 8px;
  }

  .result-hero-stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .result-hero-divider {
    width: 1px;
    background: var(--divider);
    margin: 4px 0;
    flex-shrink: 0;
  }

  .result-hero-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .result-hero-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    line-height: 1;
  }

  .result-details-always {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    padding: 5px 6px;
    border-top: 1px solid var(--divider);
  }

  .result-profit-section {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 3px;
    padding: 5px 6px;
    border-top: 1px solid var(--divider);
  }

  .result-section-label {
    grid-column: 1 / -1;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-faint);
    text-align: center;
    padding-bottom: 2px;
  }

  .result-detail-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--bg-raised);
    border-radius: 4px;
    padding: 3px 2px;
    min-width: 0;
  }

  .result-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 1px;
    white-space: nowrap;
  }

  .result-value {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
  }

  /* Multi-loadout table — Option D */
  .result-table-wrap {
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .result-table-wrap::-webkit-scrollbar { height: 4px; }
  .result-table-wrap::-webkit-scrollbar-track { background: transparent; }
  .result-table-wrap::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .result-table {
    min-width: 100%;
    border-collapse: collapse;
    table-layout: auto;
  }

  .rt-label-col {
    width: 68px;
    position: sticky;
    left: 0;
    z-index: 2;
    background: var(--bg-deep);
  }

  .rt-head-cell {
    padding: 5px 4px 4px;
    border-bottom: 1px solid var(--divider);
    min-width: 52px;
  }

  .rt-head-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .rt-head-name {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-sub);
  }
  .rt-head-cell.rt-active .rt-head-name { color: var(--accent); }

  .rt-head-style {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    background: var(--bg-raised);
    border-radius: 3px;
    padding: 1px 4px;
  }

  .rt-stat {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-sub);
    padding: 4px 8px;
    white-space: nowrap;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--bg-deep);
  }
  .rt-stat.rt-sub {
    font-size: 8px;
    font-weight: 600;
    color: var(--text-faint);
  }

  .rt-val {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    text-align: center;
    padding: 3px 4px;
    white-space: nowrap;
  }
  .rt-val.rt-hero { font-size: 13px; }
  .rt-val.rt-sub { font-size: 10px; color: var(--text-sub); }
  .rt-val.rt-best { color: var(--pos); }

  .rt-divider-cell {
    height: 1px;
    background: var(--divider);
    padding: 0;
  }

  /* ── Stat row tooltip ── */
  .stat-tip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 6px 9px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-width: 210px;
    font-family: 'Nunito', sans-serif;
  }

  .stat-tip-title {
    font-size: 10px;
    font-weight: 700;
    color: var(--text);
  }

  .stat-tip-desc {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-sub);
    line-height: 1.4;
  }

  /* ── Enemy section ── */
  .enemy-card {
    display: flex;
    gap: 10px;
    margin-bottom: 7px;
    align-items: flex-start;
  }

  .enemy-img {
    width: 60px;
    height: 60px;
    object-fit: contain;
    flex-shrink: 0;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px;
  }

  .enemy-card-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .enemy-selected {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .enemy-selected-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .weakness-badge {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.3px;
    border-radius: 3px;
    padding: 1px 4px;
    border: 1px solid var(--border);
    width: 36px;
    text-align: center;
    flex-shrink: 0;
  }
  .weakness-badge.weakness-melee,
  .weakness-badge.weakness-stab,
  .weakness-badge.weakness-slash,
  .weakness-badge.weakness-crush,
  .weakness-badge.weakness-pound,
  .weakness-badge.weakness-fire   { color: #e07b54; border-color: #e07b5466; background: #e07b5418; }
  .weakness-badge.weakness-arch   { color: #6abf6a; border-color: #6abf6a66; background: #6abf6a18; }
  .weakness-badge.weakness-magic  { color: #7b9ee0; border-color: #7b9ee066; background: #7b9ee018; }
  .weakness-badge.weakness-all    { color: #c9a84c; border-color: #c9a84c66; background: #c9a84c18; }

  .enemy-stat.weak {
    border: 1px solid var(--accent-lo);
    background: var(--bg-raised);
  }
  .enemy-stat.weak .enemy-stat-val { color: var(--pos); }

  .enemy-name {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-hi);
  }

  .enemy-clear {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
    transition: color 0.15s;
  }
  .enemy-clear:hover { color: var(--neg); }

  .enemy-stats-grid {
    display: flex;
    flex-wrap: nowrap;
    gap: 3px;
  }

  .enemy-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: var(--bg-deep);
    border-radius: 5px;
    padding: 3px 4px;
    flex: 1;
    min-width: 0;
  }

  .enemy-stat-label {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 2px;
    white-space: nowrap;
  }

  .enemy-stat-val {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .select-enemy-btn {
    width: 100%;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 10px;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .select-enemy-btn:hover { border-color: var(--accent-md); color: var(--text-sub); }

  .monster-item {
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 8px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .monster-item:hover { background: var(--bg-raised); color: var(--text); }

  .monster-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .monster-meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .monster-stat-icon {
    width: 13px;
    height: 13px;
    object-fit: contain;
    flex-shrink: 0;
    opacity: 0.7;
  }

  .monster-hp {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-faint);
    margin-right: 2px;
  }

  .monster-weak-tag {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.3px;
    border-radius: 3px;
    padding: 1px 4px;
    border: 1px solid var(--border);
    color: var(--text-faint);
    background: var(--bg-deep);
    white-space: nowrap;
    width: 36px;
    text-align: center;
    flex-shrink: 0;
  }

  .monster-weak-tag.weakness-arch   { color: #6abf6a; border-color: #6abf6a44; background: #6abf6a10; }
  .monster-weak-tag.weakness-magic  { color: #7b9ee0; border-color: #7b9ee044; background: #7b9ee010; }
  .monster-weak-tag.weakness-all    { color: #c9a84c; border-color: #c9a84c44; background: #c9a84c10; }
  .monster-weak-tag.weakness-stab,
  .monster-weak-tag.weakness-slash,
  .monster-weak-tag.weakness-crush,
  .monster-weak-tag.weakness-pound,
  .monster-weak-tag.weakness-fire   { color: #e07b54; border-color: #e07b5444; background: #e07b5410; }

  .monster-icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex-shrink: 0;
  }

  /* ── Import toggles ── */
  .import-toggles {
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--divider);
  }

  .import-toggle {
    flex: 1;
    font-family: 'Nunito', sans-serif;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--bg-deep);
    color: var(--text-faint);
    cursor: pointer;
    transition: all 0.15s;
    text-align: center;
  }
  .import-toggle:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .import-toggle.active { border-color: var(--accent-md); background: var(--bg-raised); color: var(--accent); }

  /* ── Import modal ── */
  .import-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 51;
    width: 260px;
    background: var(--bg-card);
    border: 1px solid var(--accent-lo);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .import-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--divider);
  }

  .import-search {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ── Item picker ── */
  .picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(0, 0, 0, 0.55);
  }

  .picker-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 51;
    width: 260px;
    height: 360px;
    background: var(--bg-card);
    border: 1px solid var(--accent-lo);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px 7px;
    border-bottom: 1px solid var(--divider);
    flex-shrink: 0;
  }

  .picker-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-faint);
  }

  .picker-close {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
    transition: color 0.15s;
  }
  .picker-close:hover { color: var(--text); }

  .picker-search-wrap {
    padding: 7px 8px 6px;
    border-bottom: 1px solid var(--divider);
    flex-shrink: 0;
  }

  .picker-search {
    width: 100%;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    padding: 5px 8px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .picker-search:focus { border-color: var(--accent-md); }
  .picker-search::placeholder { color: var(--text-faint); }

  .picker-list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .picker-item {
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 8px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    flex-shrink: 0;
    line-height: 1.3;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .picker-item-icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex-shrink: 0;
  }
  .picker-item:hover { background: var(--bg-raised); color: var(--text); }

  .picker-item-clear {
    color: var(--text-faint);
    font-style: italic;
    border-bottom: 1px solid var(--divider);
    border-radius: 4px 4px 0 0;
    margin-bottom: 2px;
    padding-bottom: 7px;
  }
  .picker-item-clear:hover { color: var(--neg); background: none; }

  .picker-empty {
    font-size: 10px;
    color: var(--text-faint);
    text-align: center;
    padding: 12px 0;
  }

  .slot-label {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--text-faint);
    line-height: 1;
    margin-bottom: 3px;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slot-name {
    font-size: 8px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1.2;
    word-break: break-word;
    hyphens: auto;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    overflow: hidden;
  }

  .slot-plus {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 20px;
    color: var(--text-faint);
    opacity: 0.4;
    line-height: 1;
    pointer-events: none;
  }

  .slot-img {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: contain;
    padding: 1px 2px 2px;
  }

  /* ── Drop table button (inside enemy card) ── */
  .drop-table-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
    padding: 3px 7px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
    text-align: left;
  }
  .drop-table-btn:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .drop-table-btn.drop-table-has-target { border-color: var(--accent-lo); color: var(--accent); }

  .drop-table-btn-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .drop-table-btn-clear {
    flex-shrink: 0;
    font-size: 13px;
    line-height: 1;
    color: var(--text-faint);
    transition: color 0.15s;
  }
  .drop-table-btn-clear:hover { color: var(--neg); }

  .drop-table-chevron {
    width: 9px;
    height: 9px;
    color: var(--text-faint);
    flex-shrink: 0;
    margin-left: auto;
  }

  /* ── Loot picker modal items ── */
  .loot-picker-item { gap: 7px; }

  .loot-picker-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loot-picker-selected { background: var(--bg-raised) !important; color: var(--accent) !important; }
  .loot-picker-selected .loot-rate { color: var(--accent); }

  .loot-rate {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-faint);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .loot-amt {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-faint);
    flex-shrink: 0;
  }

  /* ── Result drop target ── */
  .result-drop-target {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 8px 4px;
    border-top: 1px solid var(--divider);
  }

  .result-drop-item-name {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .result-drop-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    margin-left: 8px;
  }

  .result-drop-kills {
    font-size: 9px;
    font-weight: 700;
    color: var(--text-faint);
    white-space: nowrap;
  }

  .result-drop-time {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
  }

  /* ── Tab options button ── */
  .tab-options-btn {
    background: transparent;
    border: none;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
    font-size: 13px;
    font-weight: 700;
    padding: 0 5px 5px;
    cursor: pointer;
    transition: color 0.15s;
    line-height: 1;
    align-self: center;
    flex-shrink: 0;
    letter-spacing: 2px;
  }
  .tab-options-btn:hover { color: var(--accent); }

  /* ── Add loadout modal ── */
  .add-loadout-panel { width: 260px; }

  .add-section { padding: 8px 10px; }
  .add-section-border { border-top: 1px solid var(--divider); }

  .add-section-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 6px;
  }

  .add-option-btn {
    width: 100%;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    cursor: pointer;
    transition: border-color 0.15s;
    text-align: left;
  }
  .add-option-btn:hover { border-color: var(--accent-md); }

  .add-option-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .add-option-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
  }

  .add-option-desc {
    font-size: 9px;
    font-weight: 600;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
  }

  .add-empty {
    font-size: 10px;
    color: var(--text-faint);
    font-weight: 600;
    text-align: center;
    padding: 4px 0 2px;
    font-family: 'Nunito', sans-serif;
  }

  .add-saves-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .add-save-row {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 8px;
  }

  .add-save-name {
    flex: 1;
    font-size: 11px;
    font-weight: 700;
    color: var(--text);
    font-family: 'Nunito', sans-serif;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add-save-delete {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    transition: color 0.15s;
  }
  .add-save-delete:hover { color: var(--neg); }

  .add-save-load {
    flex-shrink: 0;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 8px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
  }
  .add-save-load:hover { border-color: var(--accent-md); color: var(--accent); }

  /* ── Tab options modal ── */
  .tab-menu-panel { width: 210px; }

  .tab-menu-options { display: flex; flex-direction: column; }

  .tab-menu-option {
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid var(--divider);
    color: var(--text-sub);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 700;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .tab-menu-option:last-child { border-bottom: none; }
  .tab-menu-option:hover { color: var(--text); background: var(--bg-raised); }

  .tab-menu-form {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .tab-menu-btns {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  .tab-menu-btn-secondary {
    background: none;
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 10px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }
  .tab-menu-btn-secondary:hover { color: var(--text); border-color: var(--accent-lo); }

  .tab-menu-code {
    width: 100%;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 5px;
    color: var(--text-sub);
    font-family: monospace;
    font-size: 8px;
    padding: 6px 8px;
    resize: none;
    height: 56px;
    outline: none;
    box-sizing: border-box;
    word-break: break-all;
    line-height: 1.4;
  }
  .tab-menu-code:focus { border-color: var(--accent-md); }
</style>
