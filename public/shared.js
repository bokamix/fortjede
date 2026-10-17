// Wspólny kod klienta (przeglądarka) i serwera (Node): mapa, kolizje, raycast, bronie, burza.

export const ISLAND_R = 200;
export const PLAYABLE_R = 178;
export const WATER_Y = -0.6;
export const PLAYER_R = 0.42;
export const PLAYER_H = 1.8;
export const CROUCH_H = 1.1;
export const STEP_H = 0.55;
export const GRAVITY = 26;
export const JUMP_V = 8.5;
export const BUS_TIME = 24;
export const BUS_HEIGHT = 120;
export const MODES = ['ground', 'sky', 'glide', 'bus', 'dead', 'climb'];
export const MODE_CODE = { ground: 0, sky: 1, glide: 2, bus: 3, dead: 4, climb: 5 };

export const RARITIES = [
  { name: 'Pospolita', color: '#b8b8b8', mult: 1.0 },
  { name: 'Niepospolita', color: '#5cd65c', mult: 1.06 },
  { name: 'Rzadka', color: '#3fa9ff', mult: 1.12 },
  { name: 'Epicka', color: '#c05cff', mult: 1.18 },
  { name: 'Legendarna', color: '#ffb52e', mult: 1.25 },
];

// kick = odrzut kamery (rad) na strzał, climb = część odrzutu, która zostaje (trzeba ściągać myszką),
// shake = wstrząs kamery, shell = przeładowanie po jednym naboju (s/nabój)
export const WEAPONS = {
  pistol: { name: 'Pistolet', dmg: 25, interval: 0.15, auto: false, mag: 16, reload: 1.3, spread: 0.022, ads: 0.008, pellets: 1, range: 150, head: 2, kick: 0.024, kickYaw: 0.006, climb: 0, shake: 0.25, bloom: 0.01, zoom: 62, firstShot: true },
  smg: { name: 'Pistolet maszynowy', dmg: 16, interval: 0.07, auto: true, mag: 30, reload: 1.9, spread: 0.045, ads: 0.028, pellets: 1, range: 90, head: 1.75, kick: 0.008, kickYaw: 0.007, climb: 0.2, shake: 0.18, bloom: 0.004, zoom: 62 },
  ar: { name: 'Karabin szturmowy', dmg: 32, interval: 0.165, auto: true, mag: 30, reload: 2.2, spread: 0.03, ads: 0.006, pellets: 1, range: 220, head: 1.5, kick: 0.016, kickYaw: 0.005, climb: 0.3, shake: 0.25, bloom: 0.006, zoom: 52, firstShot: true },
  shotgun: { name: 'Strzelba pompka', dmg: 11, interval: 0.9, auto: false, mag: 5, reload: 0.55, shell: true, spread: 0.075, ads: 0.06, pellets: 10, range: 45, head: 1.6, kick: 0.075, kickYaw: 0.012, climb: 0, shake: 1, bloom: 0, zoom: 62, falloff: [8, 32] },
  sniper: { name: 'Snajperka', dmg: 110, interval: 1.3, auto: false, mag: 1, reload: 2.4, spread: 0.09, ads: 0, pellets: 1, range: 500, head: 2.5, kick: 0.09, kickYaw: 0.012, climb: 0, shake: 1, bloom: 0, zoom: 18, scope: true },
};
export const PICKAXE = { name: 'Kilof', dmg: 20, interval: 0.5, auto: true, mag: 0, melee: true, range: 2.6, head: 1, kick: 0.01, kickYaw: 0, climb: 0, shake: 0.1, bloom: 0, spread: 0, ads: 0, pellets: 1, zoom: 75 };

export const CONSUMABLES = {
  bandage: { name: 'Bandaże', time: 2.5, max: 15, pick: 5, hp: 15, hpCap: 75, color: 0xf2f2f2 },
  medkit: { name: 'Apteczka', time: 6, max: 3, pick: 1, hp: 100, hpCap: 100, color: 0xe63946 },
  shield_s: { name: 'Mała tarcza', time: 2, max: 6, pick: 3, sh: 25, shCap: 50, color: 0x4cc9f0 },
  shield_b: { name: 'Duża tarcza', time: 4.5, max: 3, pick: 1, sh: 50, shCap: 100, color: 0x3a86ff },
};

// Bronie botów (uproszczone, liczone na serwerze)
export const BOT_WEAPONS = {
  ar: { dmg: 13, cd: 0.32, range: 60, acc: 0.72, falloff: 90 },
  smg: { dmg: 9, cd: 0.14, range: 30, acc: 0.68, falloff: 50 },
  shotgun: { dmg: 42, cd: 1.1, range: 12, acc: 0.85, falloff: 25 },
  pistol: { dmg: 15, cd: 0.42, range: 45, acc: 0.7, falloff: 70 },
};

// wait = czas do zacieśniania, shrink = czas zacieśniania, r = promień docelowy, dmg = obrażenia/s
export const STORM_PHASES = [
  { wait: 55, shrink: 40, r: 115, dmg: 1 },
  { wait: 35, shrink: 30, r: 65, dmg: 2 },
  { wait: 30, shrink: 25, r: 32, dmg: 5 },
  { wait: 20, shrink: 20, r: 14, dmg: 8 },
  { wait: 15, shrink: 25, r: 0, dmg: 10 },
];
export const STORM_START_R = 260;

// drużyny i odradzanie (karta + punkt odrodzenia)
// drużyny tworzy host (dowolnie wiele); n-ta drużyna dostaje kolor i nazwę z listy, potem kolor wyliczony
export const SOLO_COLOR = '#b0b0b0';
const TEAM_PALETTE = ['#3a86ff', '#ff4d6d', '#2ec27e', '#ffbe0b', '#9b5de5', '#ff8c42', '#ff6ec7', '#00c2d1', '#c08552', '#8d99ae'];
const TEAM_DEFAULT_NAMES = ['Niebiescy', 'Czerwoni', 'Zieloni', 'Żółci', 'Fioletowi', 'Pomarańczowi', 'Różowi', 'Turkusowi', 'Brązowi', 'Szarzy'];
export function teamDefaults(n) { // n = 0, 1, 2… kolejna utworzona drużyna
  if (n < TEAM_PALETTE.length) return { name: TEAM_DEFAULT_NAMES[n], color: TEAM_PALETTE[n] };
  const hue = Math.round((n * 137.5) % 360);
  return { name: `Drużyna ${n + 1}`, color: `hsl(${hue}, 75%, 60%)` };
}
export const CARD_TIME = 90;        // s — tyle karta leży na ziemi, zanim przepadnie
export const REBOOT_TIME = 4;       // s — przytrzymanie E przy punkcie odrodzenia
export const REBOOT_COOLDOWN = 15;  // s — przerwa między odrodzeniami
export const REBOOT_R = 4.5;        // m — zasięg interakcji z punktem odrodzenia
export const sameTeam = (a, b) => !!a && !!b && a !== b && a.team > 0 && a.team === b.team;

// ustawienia meczu (zmienia host w lobby)
export const SETTINGS_SCHEMA = [
  { key: 'bots', label: 'Liczba botów (max 99)', type: 'int', min: 0, max: 99, def: 8 },
  { key: 'botLevel', label: 'Poziom botów', type: 'select', opts: [['easy', 'Łatwe'], ['normal', 'Normalne'], ['hard', 'Trudne']], def: 'normal' },
  { key: 'reboot', label: 'Odradzanie (karty)', type: 'bool', def: true },
  { key: 'cardTime', label: 'Czas karty na ziemi (s)', type: 'int', min: 10, max: 300, def: 90 },
  { key: 'rebootTime', label: 'Przytrzymanie E przy punkcie (s)', type: 'int', min: 1, max: 20, def: 4 },
  { key: 'rebootCooldown', label: 'Przerwa punktu odrodzenia (s)', type: 'int', min: 0, max: 180, def: 15 },
  { key: 'friendlyFire', label: 'Ogień do swoich', type: 'bool', def: false },
  { key: 'stormSpeed', label: 'Szybkość burzy', type: 'select', opts: [[0.5, 'Wolna ×0.5'], [0.75, 'Spokojna ×0.75'], [1, 'Normalna'], [1.5, 'Szybka ×1.5'], [2, 'Bardzo szybka ×2']], def: 1 },
  { key: 'loot', label: 'Ilość lootu', type: 'select', opts: [[0.5, 'Mało'], [1, 'Normalnie'], [1.5, 'Dużo'], [2, 'Bardzo dużo']], def: 1 },
  { key: 'startHp', label: 'Zdrowie na start', type: 'int', min: 1, max: 100, def: 100 },
  { key: 'startShield', label: 'Tarcza na start', type: 'int', min: 0, max: 100, def: 0 },
];
export const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS_SCHEMA.map((f) => [f.key, f.def]));
export function sanitizeSettings(cur, upd) {
  const out = { ...cur };
  if (!upd || typeof upd !== 'object') return out;
  for (const f of SETTINGS_SCHEMA) {
    if (!(f.key in upd)) continue;
    const v = upd[f.key];
    if (f.type === 'int') { const n = Math.round(Number(v)); if (Number.isFinite(n)) out[f.key] = Math.max(f.min, Math.min(f.max, n)); }
    else if (f.type === 'bool') out[f.key] = !!v;
    else if (f.type === 'select') { const o = f.opts.find(([val]) => String(val) === String(v)); if (o) out[f.key] = o[0]; }
  }
  return out;
}

// niszczenie otoczenia: wytrzymałość obiektów i obrażenia zadawane im przez broń (na trafienie / śrucinę)
export const OBJ_HP = { wall: 150, roof: 200, crate: 60, container: 400, tree: 120, rock: 250 };
export const OBJ_NAME = { wall: 'Ściana', roof: 'Dach', crate: 'Skrzynka', container: 'Kontener', tree: 'Drzewo', rock: 'Skała' };
export const STRUCT_DMG = { pickaxe: 50, pistol: 12, smg: 7, ar: 14, shotgun: 6, sniper: 60 };
// klucz obiektu: 'b12' = boxes[12], 'c5' = cyls[5]
export function objByKey(m, key) {
  const i = +String(key).slice(1);
  if (!Number.isInteger(i) || i < 0) return null;
  return key[0] === 'b' ? m.boxes[i] || null : key[0] === 'c' ? m.cyls[i] || null : null;
}

export function weaponDmg(type, rar) {
  const W = WEAPONS[type];
  return Math.round(W.dmg * RARITIES[rar].mult);
}

export function itemName(it) {
  if (!it) return PICKAXE.name;
  if (it.k === 'w') return `${WEAPONS[it.type].name} (${RARITIES[it.rar].name})`;
  return `${CONSUMABLES[it.type].name} ×${it.n}`;
}

export function itemColor(it) {
  if (!it) return '#ffffff';
  if (it.k === 'w') return RARITIES[it.rar].color;
  return it.type === 'medkit' || it.type === 'shield_b' ? RARITIES[2].color : RARITIES[1].color;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (v) => Math.round(v * 100) / 100;
const weighted = (rnd, table) => {
  let sum = 0; for (const k in table) sum += table[k];
  let r = rnd() * sum;
  for (const k in table) { r -= table[k]; if (r <= 0) return k; }
  return Object.keys(table)[0];
};

export function randomItem(rnd = Math.random, bonus = 0) {
  if (rnd() < 0.62) {
    const type = weighted(rnd, { ar: 30, smg: 22, shotgun: 22, pistol: 18, sniper: 8 });
    const r = rnd() + bonus * 0.15;
    let rar = r < 0.45 ? 0 : r < 0.72 ? 1 : r < 0.88 ? 2 : r < 0.97 ? 3 : 4;
    if (type === 'sniper') rar = Math.max(rar, 2);
    return { k: 'w', type, rar, ammo: WEAPONS[type].mag };
  }
  const type = weighted(rnd, { bandage: 30, medkit: 12, shield_s: 35, shield_b: 14 });
  return { k: 'c', type, n: CONSUMABLES[type].pick };
}

export function sanitizeItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.k === 'w' && WEAPONS[it.type]) {
    const rar = Math.max(0, Math.min(4, it.rar | 0));
    const ammo = Math.max(0, Math.min(WEAPONS[it.type].mag, it.ammo | 0));
    return { k: 'w', type: it.type, rar, ammo };
  }
  if (it.k === 'c' && CONSUMABLES[it.type]) {
    const n = Math.max(1, Math.min(CONSUMABLES[it.type].max, it.n | 0));
    return { k: 'c', type: it.type, n };
  }
  return null;
}

export function canUse(type, hp, sh) {
  const c = CONSUMABLES[type];
  if (!c) return false;
  return c.hp ? hp < c.hpCap : sh < c.shCap;
}

export function applyUse(type, ent) {
  const c = CONSUMABLES[type];
  if (!c || !canUse(type, ent.hp, ent.sh)) return false;
  if (c.hp) ent.hp = Math.min(c.hpCap, ent.hp + c.hp);
  else ent.sh = Math.min(c.shCap, ent.sh + c.sh);
  return true;
}

export function busPos(bus, t) {
  return { x: bus.from.x + (bus.to.x - bus.from.x) * t, y: BUS_HEIGHT, z: bus.from.z + (bus.to.z - bus.from.z) * t };
}

// ---------------------------------------------------------------- mapa

const TOWN_NAMES = ['Krzywe Wieże', 'Słone Źródła', 'Przyjemny Park', 'Leniwe Łąki', 'Emerytowe Doki', 'Bagienne Budy', 'Kapuściane Pole'];
const HOUSE_COLORS = [0xe9c46a, 0xf4a261, 0xe76f51, 0x90be6d, 0x8ecae6, 0xcdb4db, 0xffd6a5, 0xd4a373, 0xf28482, 0x84a59d];
const ROOF_COLORS = [0x9d0208, 0x6a040f, 0x264653, 0x3d405b, 0x7f5539, 0x495057];
const CONTAINER_COLORS = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x7d3c98];
const WALL_H = 3.6;
const WALL_T = 0.3;

export class GameMap {
  constructor(seed, data) {
    this.seed = seed;
    if (data) { Object.assign(this, data); return; }
    const rnd = mulberry32(seed);
    this.ofs = [0, 0, 0, 0, 0].map(() => rnd() * 100);
    const ha = rnd() * Math.PI * 2, hd = 70 + rnd() * 50;
    this.hill = { x: r2(Math.cos(ha) * hd), z: r2(Math.sin(ha) * hd), h: r2(14 + rnd() * 8), r: 26 };
    this.pads = []; this.boxes = []; this.cyls = []; this.trees = []; this.rocks = [];
    this.chests = []; this.lootSpots = []; this.towns = [];
    generate(this, rnd);
  }

  toJSON() {
    const { seed, ofs, hill, pads, boxes, cyls, trees, rocks, chests, lootSpots, towns, reboot } = this;
    return { seed, ofs, hill, pads, boxes, cyls, trees, rocks, chests, lootSpots, towns, reboot };
  }

  baseHeight(x, z) {
    const o = this.ofs;
    let h = 5
      + 4.5 * Math.sin(x * 0.017 + o[0]) * Math.cos(z * 0.019 + o[1])
      + 2.2 * Math.sin((x + z) * 0.041 + o[2])
      + 1.1 * Math.sin(z * 0.083 + o[3]) * Math.sin(x * 0.071 + o[4]);
    if (h < 1) h = 1 - (1 - h) * 0.25;
    const hl = this.hill;
    const hd2 = (x - hl.x) ** 2 + (z - hl.z) ** 2;
    h += hl.h * Math.exp(-hd2 / (2 * hl.r * hl.r));
    const d = Math.hypot(x, z);
    if (d > 160) h -= (d - 160) * 0.32;
    return h;
  }

  height(x, z) {
    let h = this.baseHeight(x, z);
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      const dx = Math.max(Math.abs(x - p.x) - p.hw, 0), dz = Math.max(Math.abs(z - p.z) - p.hd, 0);
      if (dx > 9 || dz > 9) continue;
      const d = Math.hypot(dx, dz);
      if (d < 9) { const k = d / 9; const t = 1 - k * k * (3 - 2 * k); h += (p.h - h) * t; }
    }
    return h;
  }
}

function addBox(m, x0, y0, z0, x1, y1, z1, c, k) {
  m.boxes.push({ x0: r2(x0), y0: r2(y0), z0: r2(z0), x1: r2(x1), y1: r2(y1), z1: r2(z1), c, k });
}

function blocked(m, x, z, margin) {
  for (const p of m.pads) if (Math.abs(x - p.x) < p.hw + margin && Math.abs(z - p.z) < p.hd + margin) return true;
  for (const b of m.boxes) if (x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin) return true;
  for (const c of m.cyls) if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return true;
  return false;
}

function generate(m, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const names = TOWN_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }

  for (let tries = 0; m.towns.length < 5 && tries < 400; tries++) {
    const a = rnd() * Math.PI * 2, d = 25 + rnd() * 110;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (m.baseHeight(x, z) < 2) continue;
    if (Math.hypot(x - m.hill.x, z - m.hill.z) < m.hill.r + 25) continue;
    if (m.towns.some((t) => Math.hypot(t.x - x, t.z - z) < 70)) continue;
    m.towns.push({ name: names[m.towns.length], x: r2(x), z: r2(z) });
  }

  for (const t of m.towns) {
    let built = 0;
    for (let tries = 0; built < 5 && tries < 80; tries++) {
      if (tryHouse(m, rnd, pick, t.x + (rnd() - 0.5) * 56, t.z + (rnd() - 0.5) * 56)) built++;
    }
  }
  for (let tries = 0, n = 0; n < 6 && tries < 200; tries++) {
    const a = rnd() * Math.PI * 2, d = 30 + rnd() * 115;
    if (tryHouse(m, rnd, pick, Math.cos(a) * d, Math.sin(a) * d)) n++;
  }

  // kontenery jako osłony w terenie
  for (let tries = 0, n = 0; n < 14 && tries < 300; tries++) {
    const a = rnd() * Math.PI * 2, d = 20 + rnd() * 140;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 1.5 || blocked(m, x, z, 6)) continue;
    const alongX = rnd() < 0.5;
    const hw = alongX ? 3 : 1.25, hd = alongX ? 1.25 : 3;
    addBox(m, x - hw, h - 1.2, z - hd, x + hw, h + 2.6, z + hd, pick(CONTAINER_COLORS), 'container');
    m.lootSpots.push({ x: r2(x + (alongX ? 0 : 2.2)), y: r2(h), z: r2(z + (alongX ? 2.2 : 0)) });
    n++;
  }

  // punkt odrodzenia (jeden na mapie, blisko środka, na płaskim terenie)
  for (let tries = 0; tries < 500 && !m.reboot; tries++) {
    const a = rnd() * Math.PI * 2, d = 10 + rnd() * 70;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 2 || blocked(m, x, z, 7)) continue;
    let mn = h, mx = h;
    for (const [sx, sz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { const hh = m.height(x + sx, z + sz); mn = Math.min(mn, hh); mx = Math.max(mx, hh); }
    if (mx - mn > 1.2) continue;
    m.reboot = { x: r2(x), y: r2(h), z: r2(z) };
    addBox(m, x - 1.2, h - 0.6, z - 2.6, x + 1.2, h + 2.5, z + 2.6, 0x2b6cff, 'van');
  }
  if (!m.reboot) m.reboot = { x: 0, y: r2(m.height(0, 0)), z: 0 };

  // drzewa
  for (let tries = 0; m.trees.length < 200 && tries < 3000; tries++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 172;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 0.6 || blocked(m, x, z, 2.5)) continue;
    const s = 0.8 + rnd() * 0.6;
    m.trees.push({ x: r2(x), y: r2(h), z: r2(z), s: r2(s) });
    m.cyls.push({ x: r2(x), z: r2(z), r: r2(0.38 * s), y0: r2(h - 0.5), y1: r2(h + 6.5 * s), k: 'tree', i: m.trees.length - 1 });
  }

  // skały
  for (let tries = 0; m.rocks.length < 55 && tries < 1500; tries++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 172;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 0.2 || blocked(m, x, z, 2)) continue;
    const s = 0.7 + rnd() * 1.5;
    m.rocks.push({ x: r2(x), y: r2(h), z: r2(z), s: r2(s), ry: r2(rnd() * 6.28) });
    m.cyls.push({ x: r2(x), z: r2(z), r: r2(s * 0.95), y0: r2(h - 1), y1: r2(h + s * 0.75), k: 'rock', i: m.rocks.length - 1 });
  }

  // skrzynie i loot w terenie
  for (let tries = 0, n = 0; n < 12 && tries < 500; tries++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 165;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 0.8 || blocked(m, x, z, 1.5)) continue;
    m.chests.push({ id: m.chests.length, x: r2(x), y: r2(h), z: r2(z), ry: r2(rnd() * 6.28) });
    n++;
  }
  for (let tries = 0, n = 0; n < 50 && tries < 800; tries++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 170;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 0.5 || blocked(m, x, z, 1)) continue;
    m.lootSpots.push({ x: r2(x), y: r2(h), z: r2(z) });
    n++;
  }
}

function tryHouse(m, rnd, pick, x, z) {
  const hw = 3.5 + Math.floor(rnd() * 5) * 0.5, hd = 3.5 + Math.floor(rnd() * 5) * 0.5;
  if (Math.hypot(x, z) + Math.max(hw, hd) > 150) return false;
  for (const p of m.pads) if (Math.abs(x - p.x) < hw + p.hw + 4 && Math.abs(z - p.z) < hd + p.hd + 4) return false;
  const h = m.baseHeight(x, z);
  if (h < 1.5) return false;
  let mn = h, mx = h;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const bh = m.baseHeight(x + sx * hw, z + sz * hd);
    mn = Math.min(mn, bh); mx = Math.max(mx, bh);
  }
  if (mx - mn > 4.5) return false;
  const pad = { x: r2(x), z: r2(z), hw, hd, h: r2(h) };
  m.pads.push(pad);
  buildHouse(m, rnd, pick, pad);
  return true;
}

function buildHouse(m, rnd, pick, pad) {
  const { x, z, hw, hd } = pad;
  const f = pad.h + 0.12;
  const T = WALL_T, WH = WALL_H;
  const color = pick(HOUSE_COLORS), roof = pick(ROOF_COLORS);
  const x0 = x - hw, x1 = x + hw, z0 = z - hd, z1 = z + hd;
  addBox(m, x0, pad.h - 1, z0, x1, f, z1, 0x8d7b68, 'floor'); // podłoga
  const door = Math.floor(rnd() * 4);
  for (let side = 0; side < 4; side++) {
    const alongX = side < 2;
    const a = alongX ? x0 : z0 + T, b = alongX ? x1 : z1 - T;
    const mid = (a + b) / 2, len = b - a;
    const seg = (u0, u1, y0, y1) => {
      if (u1 - u0 < 0.05) return;
      if (alongX) { const zz = side === 0 ? z0 : z1 - T; addBox(m, u0, y0, zz, u1, y1, zz + T, color, 'wall'); }
      else { const xx = side === 2 ? x0 : x1 - T; addBox(m, xx, y0, u0, xx + T, y1, u1, color, 'wall'); }
    };
    const holes = [];
    if (side === door) holes.push({ c: (rnd() - 0.5) * (len - 4), w: 2.0, y0: 0, y1: 2.5 });
    else if (rnd() < 0.8) holes.push({ c: (rnd() - 0.5) * (len - 4), w: 1.6, y0: 1.0, y1: 2.2 });
    let cur = a;
    for (const hl of holes) {
      const ha = mid + hl.c - hl.w / 2, hb = mid + hl.c + hl.w / 2;
      seg(cur, ha, f, f + WH);
      if (hl.y0 > 0) seg(ha, hb, f, f + hl.y0);
      if (hl.y1 < WH) seg(ha, hb, f + hl.y1, f + WH);
      cur = hb;
    }
    seg(cur, b, f, f + WH);
  }
  addBox(m, x0 - 0.4, f + WH, z0 - 0.4, x1 + 0.4, f + WH + 0.35, z1 + 0.4, roof, 'roof'); // dach
  const ix = () => x + (rnd() - 0.5) * (2 * hw - 2.4);
  const iz = () => z + (rnd() - 0.5) * (2 * hd - 2.4);
  if (rnd() < 0.75) m.chests.push({ id: m.chests.length, x: r2(ix()), y: r2(f), z: r2(iz()), ry: r2(Math.floor(rnd() * 4) * Math.PI / 2) });
  const nl = 1 + Math.floor(rnd() * 2);
  for (let i = 0; i < nl; i++) m.lootSpots.push({ x: r2(ix()), y: r2(f), z: r2(iz()) });
  if (rnd() < 0.5) {
    const cx = ix(), cz = iz();
    addBox(m, cx - 0.5, f, cz - 0.5, cx + 0.5, f + 1, cz + 0.5, 0xa47148, 'crate'); // skrzynka-osłona
  }
}

export function findSpawn(m, rnd = Math.random) {
  for (let i = 0; i < 300; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 150;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const h = m.height(x, z);
    if (h < 1 || blocked(m, x, z, 1.5)) continue;
    return { x, y: h + 0.05, z };
  }
  return { x: 0, y: m.height(0, 0) + 1, z: 0 };
}

// ---------------------------------------------------------------- kolizje

export function collideCharacter(m, p) {
  const R = PLAYER_R, H = p.h || PLAYER_H;
  const boxes = m.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.dead || p.x + R < b.x0 || p.x - R > b.x1 || p.z + R < b.z0 || p.z - R > b.z1) continue;
    if (p.y + H <= b.y0 || p.y >= b.y1 - STEP_H) continue;
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * R; p.z = cz + (dz / d) * R;
    } else {
      const l = p.x - b.x0, r = b.x1 - p.x, n = p.z - b.z0, f = b.z1 - p.z;
      const mn = Math.min(l, r, n, f);
      if (mn === l) p.x = b.x0 - R; else if (mn === r) p.x = b.x1 + R;
      else if (mn === n) p.z = b.z0 - R; else p.z = b.z1 + R;
    }
  }
  const cyls = m.cyls;
  for (let i = 0; i < cyls.length; i++) {
    const c = cyls[i];
    if (c.dead) continue;
    const rr = c.r + R;
    const dx = p.x - c.x, dz = p.z - c.z;
    if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
    if (p.y + H <= c.y0 || p.y >= c.y1 - STEP_H) continue;
    const d2 = dx * dx + dz * dz;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 1e-4;
    p.x = c.x + (dx / d) * rr; p.z = c.z + (dz / d) * rr;
  }
  const d = Math.hypot(p.x, p.z);
  if (d > PLAYABLE_R) { p.x *= PLAYABLE_R / d; p.z *= PLAYABLE_R / d; }
}

// Uderzenie głową w sufit przy skoku (prevY = pozycja stóp przed ruchem)
export function ceilingClamp(m, p, prevY) {
  if (p.vy <= 0) return;
  const R = PLAYER_R * 0.8;
  const H = p.h || PLAYER_H;
  const oldHead = prevY + H, head = p.y + H;
  for (const b of m.boxes) {
    if (b.dead || b.y0 < oldHead - 0.01 || b.y0 > head) continue;
    if (p.x + R < b.x0 || p.x - R > b.x1 || p.z + R < b.z0 || p.z - R > b.z1) continue;
    p.y = b.y0 - H - 0.001; p.vy = 0;
    return;
  }
}

export function groundAt(m, x, z, y) {
  let g = m.height(x, z);
  const R = PLAYER_R * 0.7, lim = y + STEP_H;
  const boxes = m.boxes;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b.dead && b.y1 > g && b.y1 <= lim && x + R > b.x0 && x - R < b.x1 && z + R > b.z0 && z - R < b.z1) g = b.y1;
  }
  const cyls = m.cyls;
  for (let i = 0; i < cyls.length; i++) {
    const c = cyls[i];
    if (!c.dead && c.y1 > g && c.y1 <= lim) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < c.r * c.r) g = c.y1;
    }
  }
  return g;
}

// ---------------------------------------------------------------- wspinaczka

// Czy postać o wysokości H zmieści się stojąc w punkcie p (stopy)
export function spaceFree(m, p, H = PLAYER_H) {
  const R = PLAYER_R * 0.9;
  for (const b of m.boxes) {
    if (b.dead || p.x + R < b.x0 || p.x - R > b.x1 || p.z + R < b.z0 || p.z - R > b.z1) continue;
    if (p.y + H <= b.y0 || p.y + 0.05 >= b.y1) continue;
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    if ((p.x - cx) ** 2 + (p.z - cz) ** 2 < R * R) return false;
  }
  for (const c of m.cyls) {
    if (c.dead || p.y + H <= c.y0 || p.y + 0.05 >= c.y1) continue;
    if ((p.x - c.x) ** 2 + (p.z - c.z) ** 2 < (c.r + R) ** 2) return false;
  }
  return true;
}

// Szuka krawędzi przed postacią (kierunek dx,dz) na wysokości (minUp, maxUp] nad stopami.
// Zwraca { x, y, z, crouch } — miejsce, w którym postać wyląduje po podciągnięciu, albo null.
export function findLedge(m, p, dx, dz, minUp, maxUp) {
  const R = PLAYER_R;
  for (const reach of [R + 0.3, R + 0.65]) {
    const qx = p.x + dx * reach, qz = p.z + dz * reach;
    let top = -Infinity;
    for (const b of m.boxes) {
      if (b.dead || qx < b.x0 || qx > b.x1 || qz < b.z0 || qz > b.z1) continue;
      if (b.y1 > p.y + minUp && b.y1 <= p.y + maxUp && b.y1 > top) top = b.y1;
    }
    for (const c of m.cyls) {
      if (c.dead || (qx - c.x) ** 2 + (qz - c.z) ** 2 > c.r * c.r) continue;
      if (c.y1 > p.y + minUp && c.y1 <= p.y + maxUp && c.y1 > top) top = c.y1;
    }
    const th = m.height(qx, qz);
    if (th > p.y + minUp && th <= p.y + maxUp && th > top) top = th;
    if (top === -Infinity) continue;
    const tx = p.x + dx * (reach + 0.2), tz = p.z + dz * (reach + 0.2);
    const spot = { x: tx, y: top + 0.02, z: tz };
    if (spaceFree(m, spot, PLAYER_H)) return { x: tx, y: top, z: tz, crouch: false };
    if (spaceFree(m, spot, CROUCH_H)) return { x: tx, y: top, z: tz, crouch: true };
  }
  return null;
}

// ---------------------------------------------------------------- raycast (d musi być znormalizowany)

function rayBox(o, d, b, maxT) {
  let t0 = 0, t1 = maxT;
  if (Math.abs(d.x) < 1e-9) { if (o.x < b.x0 || o.x > b.x1) return -1; }
  else {
    let a = (b.x0 - o.x) / d.x, c = (b.x1 - o.x) / d.x;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1;
  }
  if (Math.abs(d.y) < 1e-9) { if (o.y < b.y0 || o.y > b.y1) return -1; }
  else {
    let a = (b.y0 - o.y) / d.y, c = (b.y1 - o.y) / d.y;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1;
  }
  if (Math.abs(d.z) < 1e-9) { if (o.z < b.z0 || o.z > b.z1) return -1; }
  else {
    let a = (b.z0 - o.z) / d.z, c = (b.z1 - o.z) / d.z;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return -1;
  }
  return t0;
}

function rayCyl(o, d, cx, cz, r, y0, y1, maxT) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const c = ox * ox + oz * oz - r * r;
  if (a < 1e-9) {
    if (c > 0) return -1;
    let t;
    if (o.y > y1 && d.y < 0) t = (y1 - o.y) / d.y;
    else if (o.y < y0 && d.y > 0) t = (y0 - o.y) / d.y;
    else if (o.y >= y0 && o.y <= y1) t = 0;
    else return -1;
    return t <= maxT ? t : -1;
  }
  const b = ox * d.x + oz * d.z;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let tin = (-b - sq) / a;
  const tout = (-b + sq) / a;
  if (tout < 0) return -1;
  if (tin < 0) tin = 0;
  if (tin > maxT) return -1;
  const yin = o.y + d.y * tin;
  if (yin >= y0 && yin <= y1) return tin;
  if (Math.abs(d.y) < 1e-9) return -1;
  const tc = ((yin > y1 ? y1 : y0) - o.y) / d.y;
  if (tc >= tin && tc <= tout && tc <= maxT) return tc;
  return -1;
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  return c < 0 ? 0 : -1;
}

// Trafienie w gracza stojącego stopami w p. Zwraca { t, head } albo null.
export function rayPlayer(o, d, p, maxT, crouch = false) {
  const th = raySphere(o, d, p.x, p.y + (crouch ? 1.12 : 1.66), p.z, 0.27);
  const tb = rayCyl(o, d, p.x, p.z, 0.42, p.y, p.y + (crouch ? 0.9 : 1.42), maxT);
  let best = null;
  if (th >= 0 && th <= maxT) best = { t: th, head: true };
  if (tb >= 0 && (!best || tb < best.t)) best = { t: tb, head: false };
  return best;
}

export function raycastMap(m, o, d, maxT) {
  return raycastMapHit(m, o, d, maxT).t;
}

// Zwraca { t, obj } — obj = klucz trafionego obiektu ('b12', 'c5') albo null (teren / nic)
export function raycastMapHit(m, o, d, maxT) {
  let best = maxT, obj = null;
  const boxes = m.boxes;
  for (let i = 0; i < boxes.length; i++) {
    if (boxes[i].dead) continue;
    const t = rayBox(o, d, boxes[i], best);
    if (t >= 0 && t < best) { best = t; obj = 'b' + i; }
  }
  const cyls = m.cyls;
  for (let i = 0; i < cyls.length; i++) {
    const c = cyls[i];
    if (c.dead) continue;
    const t = rayCyl(o, d, c.x, c.z, c.r, c.y0, c.y1, best);
    if (t >= 0 && t < best) { best = t; obj = 'c' + i; }
  }
  if (o.y < m.height(o.x, o.z)) return { t: 0, obj: null };
  const step = 0.8;
  for (let t = step; t < best + step; t += step) {
    const tt = Math.min(t, best);
    const y = o.y + d.y * tt;
    if (y > 45 && d.y >= 0) break;
    if (y < m.height(o.x + d.x * tt, o.z + d.z * tt)) {
      let lo = tt - step, hi = tt;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (o.y + d.y * mid < m.height(o.x + d.x * mid, o.z + d.z * mid)) hi = mid; else lo = mid;
      }
      if (hi < best) return { t: hi, obj: null };
      break;
    }
    if (tt >= best) break;
  }
  return { t: best, obj };
}
