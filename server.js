// Fortjede — serwer gry: pliki statyczne + WebSocket (ws), logika meczu, burza, loot, boty.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import {
  GameMap, WEAPONS, PICKAXE, BOT_WEAPONS, STORM_PHASES, STORM_START_R, BUS_TIME, MODES, MODE_CODE,
  GRAVITY, JUMP_V, randomItem, sanitizeItem, applyUse, busPos, findSpawn,
  collideCharacter, ceilingClamp, groundAt, raycastMap, OBJ_HP, STRUCT_DMG, objByKey,
  TEAM_COUNT, REBOOT_R, sameTeam, DEFAULT_SETTINGS, sanitizeSettings,
} from './public/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = path.join(__dirname, 'node_modules', 'three', 'build');
const ADDONS = path.join(__dirname, 'node_modules', 'three', 'examples', 'jsm');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  let base = PUBLIC;
  if (url.startsWith('/vendor/addons/')) { base = ADDONS; url = url.slice('/vendor/addons'.length); }
  else if (url.startsWith('/vendor/')) { base = VENDOR; url = url.slice('/vendor'.length); }
  if (url === '/') url = '/index.html';
  const file = path.normalize(path.join(base, url));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- stan gry

const SEED = (Math.random() * 1e9) | 0;
const map = new GameMap(SEED);
const MAP_JSON = map.toJSON();
console.log(`Mapa: seed ${SEED}, ${map.towns.length} miasta, ${map.pads.length} domów, ${map.chests.length} skrzyń`);

const ents = new Map(); // id -> gracz lub bot
let nextId = 1;
const game = {
  state: 'lobby', // lobby | countdown | match | ended
  countdownEnd: 0, endAt: 0,
  bus: null, busT: 0,
  storm: null, stormNow: null, stormAcc: 0,
  loot: new Map(), nextLootId: 1, opened: new Set(),
  startedWith: 0,
  objHp: new Map(), destroyed: new Set(),
  cards: new Map(), rebooting: new Map(), rebootReadyAt: 0, startedTeams: 0,
  settings: { ...DEFAULT_SETTINGS }, hostId: null,
};
const SET = () => game.settings;
const BOT_LEVEL = { easy: { acc: 0.6, dmg: 0.7, react: 1.6 }, normal: { acc: 1, dmg: 1, react: 1 }, hard: { acc: 1.3, dmg: 1.25, react: 0.6 } };

const BOT_NAMES = ['Bocik Zenek', 'Bot Grażyna', 'Mirek_AI', 'Kapitan Kampa', 'NoScope Norbert', 'Jarek Jumper', 'Tytus Tarcza',
  'Bambik', 'Default Dawid', 'Pan Kilof', 'Wiesia Snajper', 'Bot Bogdan', 'Lama Lucek', 'Zbyszek Zip', 'Halinka 360',
  'Krzysiek Krzak', 'Turbo Teresa', 'Sweaty Stefan', 'Bot Bożydar', 'Mietek Medkit', 'Gienek Glider', 'Ula Ultra',
  'Ryszard Rush', 'Fanka Frytek', 'Edek Eliminator', 'Pani Pompa', 'Kazik Kampa', 'Lotnia Lucyna', 'Bot Bartek', 'Szymek Szybki'];

const r2 = (v) => Math.round(v * 100) / 100;
const now = () => Date.now();

function send(e, msg) { if (e.ws && e.ws.readyState === 1) e.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const e of ents.values()) if (e !== except) send(e, s);
}
function humans() { return [...ents.values()].filter((e) => !e.bot); }
function rosterMsg() {
  return { t: 'roster', list: [...ents.values()].map((e) => ({ id: e.id, name: e.name, bot: e.bot, team: e.team })), host: game.hostId };
}

function newEnt(props) {
  return Object.assign({
    id: nextId++, name: '?', bot: false, ws: null,
    x: 0, y: 0, z: 0, ry: 0, rx: 0, vy: 0, mode: 'ground', w: '', mv: false,
    hp: 100, sh: 0, alive: true, inMatch: false, kills: 0, respawnAt: 0, team: 0,
  }, props);
}

// ---------------------------------------------------------------- loot

function lootPublic(l) { return { id: l.id, k: l.k, type: l.type, rar: l.rar, ammo: l.ammo, n: l.n, x: r2(l.x), y: r2(l.y), z: r2(l.z) }; }

function spawnLoot(item, x, y, z, silent) {
  const l = { id: game.nextLootId++, ...item, x, y, z };
  game.loot.set(l.id, l);
  if (!silent) broadcast({ t: 'loot+', items: [lootPublic(l)] });
  return l;
}

function resetLoot() {
  game.loot.clear();
  game.opened.clear();
  const L = SET().loot;
  for (const s of map.lootSpots) {
    if (Math.random() < Math.min(1, 0.8 * L)) spawnLoot(randomItem(), s.x, s.y, s.z, true);
    if (L > 1 && Math.random() < L - 1) spawnLoot(randomItem(), s.x + 0.9, s.y, s.z + 0.4, true);
  }
  broadcast({ t: 'lootreset', loot: [...game.loot.values()].map(lootPublic), opened: [] });
}

function openChest(c) {
  game.opened.add(c.id);
  broadcast({ t: 'chest', id: c.id });
  const fx = -Math.sin(c.ry), fz = -Math.cos(c.ry);
  const items = [randomItem(Math.random, 2), randomItem(Math.random, 1)];
  if (items[0].k !== 'w') items[0] = randomItem(() => Math.random() * 0.62, 2); // pierwsza zawsze broń
  items.forEach((it, i) => {
    const x = c.x + fx * 1.2 + (i - 0.5) * 0.9, z = c.z + fz * 1.2;
    spawnLoot(it, x, groundAt(map, x, z, c.y + 0.5), z);
  });
}

// ---------------------------------------------------------------- niszczenie otoczenia

function damageObj(key, dmg) {
  const o = objByKey(map, key);
  if (!o || o.dead || !OBJ_HP[o.k] || dmg <= 0) return;
  const max = OBJ_HP[o.k];
  const hp = (game.objHp.get(key) ?? max) - dmg;
  if (hp <= 0) {
    o.dead = true;
    game.objHp.delete(key);
    game.destroyed.add(key);
    broadcast({ t: 'objdel', k: key });
  } else {
    game.objHp.set(key, hp);
    broadcast({ t: 'objhp', k: key, hp: Math.round(hp), max });
  }
}

function resetObjects() {
  for (const key of game.destroyed) { const o = objByKey(map, key); if (o) o.dead = false; }
  game.destroyed.clear();
  game.objHp.clear();
  broadcast({ t: 'objreset' });
}

// ---------------------------------------------------------------- burza

function makeStorm() {
  const phases = [];
  let cx = 0, cz = 0, r = STORM_START_R;
  for (const ph of STORM_PHASES) {
    const nr = ph.r;
    const maxOff = Math.max(0, (r === STORM_START_R ? 120 : r) - nr) * 0.85;
    const a = Math.random() * Math.PI * 2, off = Math.random() * maxOff;
    let nx = cx + Math.cos(a) * off, nz = cz + Math.sin(a) * off;
    const lim = Math.max(0, 150 - nr), dd = Math.hypot(nx, nz);
    if (dd > lim) { nx *= lim / dd; nz *= lim / dd; }
    const k = SET().stormSpeed;
    phases.push({ ...ph, wait: ph.wait / k, shrink: ph.shrink / k, x0: cx, z0: cz, r0: r, x1: nx, z1: nz, r1: nr });
    cx = nx; cz = nz; r = nr;
  }
  return { phases, t0: now() };
}

function stormState(t) {
  let s = (t - game.storm.t0) / 1000;
  const ph = game.storm.phases;
  for (let i = 0; i < ph.length; i++) {
    const p = ph[i];
    const dmg = i === 0 ? 1 : ph[i - 1].dmg;
    if (s < p.wait) return { x: p.x0, z: p.z0, r: p.r0, nx: p.x1, nz: p.z1, nr: p.r1, shr: 0, tm: p.wait - s, dmg, ph: i };
    s -= p.wait;
    if (s < p.shrink) {
      const k = s / p.shrink;
      return {
        x: p.x0 + (p.x1 - p.x0) * k, z: p.z0 + (p.z1 - p.z0) * k, r: p.r0 + (p.r1 - p.r0) * k,
        nx: p.x1, nz: p.z1, nr: p.r1, shr: 1, tm: p.shrink - s, dmg: p.dmg, ph: i,
      };
    }
    s -= p.shrink;
  }
  const p = ph[ph.length - 1];
  return { x: p.x1, z: p.z1, r: p.r1, nx: p.x1, nz: p.z1, nr: p.r1, shr: 0, tm: 0, dmg: p.dmg, ph: ph.length };
}

// ---------------------------------------------------------------- walka

function applyDamage(target, dmg, attacker, w, head) {
  if (!target.alive || dmg <= 0) return;
  if (attacker && sameTeam(attacker, target) && !SET().friendlyFire) return; // bez ognia do swoich
  let rem = dmg, shDmg = 0;
  if (target.sh > 0) { shDmg = Math.min(target.sh, rem); target.sh -= shDmg; rem -= shDmg; }
  target.hp -= rem;
  if (attacker && attacker !== target) {
    send(attacker, { t: 'hitm', id: target.id, dmg: Math.round(dmg), head: !!head, sh: shDmg > 0 && rem === 0, kill: target.hp <= 0, p: [r2(target.x), r2(target.y), r2(target.z)] });
  }
  send(target, { t: 'dmg', from: attacker ? [r2(attacker.x), r2(attacker.z)] : null });
  if (target.hp <= 0) kill(target, attacker, w, head);
}

function aliveInMatch() { return [...ents.values()].filter((e) => e.inMatch && e.alive); }

function kill(target, attacker, w, head) {
  target.hp = 0; target.sh = 0; target.alive = false; target.mode = 'dead';
  if (attacker && attacker !== target) attacker.kills++;
  broadcast({ t: 'kill', k: attacker && attacker !== target ? attacker.name : null, kid: attacker ? attacker.id : null, v: target.name, vid: target.id, w: w || '', head: !!head });
  const inMatch = game.state === 'match' && target.inMatch;
  let place = 0, canReboot = false;
  if (inMatch) {
    for (const c of game.cards.values()) if (c.carrier === target.id) dropCard(c, target); // niesione karty spadają
    game.rebooting.delete(target.id);
    if (aliveInMatch().some((e) => sameTeam(e, target))) { canReboot = SET().reboot; if (canReboot) createCard(target); }
    else { place = aliveTeams().size + 1; teamOut(target, place); }
  }
  send(target, { t: 'dead', place, canReboot, by: attacker && attacker !== target ? attacker.id : null, byName: attacker && attacker !== target ? attacker.name : null, lobby: !inMatch });
  if (!inMatch) target.respawnAt = now() + 3000;
  if (target.bot && inMatch) {
    spawnLoot(randomItem(Math.random, 1), target.x + 0.6, groundAt(map, target.x + 0.6, target.z, target.y + 1), target.z);
    if (Math.random() < 0.6) spawnLoot(randomItem(), target.x - 0.6, groundAt(map, target.x - 0.6, target.z, target.y + 1), target.z);
  }
  checkEnd();
}

// ---------------------------------------------------------------- drużyny i karty odrodzenia

const teamKey = (e) => (e.team > 0 ? 't' + e.team : 'p' + e.id);
function aliveTeams() { return new Set(aliveInMatch().map(teamKey)); }

function cardsMsg() {
  const t = now();
  return {
    t: 'cards',
    list: [...game.cards.values()].map((c) => ({ owner: c.owner, team: c.team, x: r2(c.x), y: r2(c.y), z: r2(c.z), left: c.carrier ? null : Math.max(0, Math.ceil((c.expireAt - t) / 1000)), carrier: c.carrier })),
    ready: Math.max(0, Math.ceil((game.rebootReadyAt - t) / 1000)),
  };
}
function broadcastCards() { broadcast(cardsMsg()); }

function createCard(e) {
  game.cards.set(e.id, { owner: e.id, team: e.team, x: e.x, y: groundAt(map, e.x, e.z, e.y + 1), z: e.z, expireAt: now() + SET().cardTime * 1000, carrier: null });
  broadcastCards();
}
function dropCard(c, carrier) {
  c.carrier = null;
  c.x = carrier.x + (Math.random() - 0.5); c.z = carrier.z + (Math.random() - 0.5);
  c.y = groundAt(map, c.x, c.z, carrier.y + 1);
  c.expireAt = now() + SET().cardTime * 1000;
}
// cała drużyna odpadła: powiadom martwych kolegów i usuń ich karty
function teamOut(target, place) {
  if (target.team <= 0) return;
  for (const e of ents.values()) if (sameTeam(e, target) && !e.bot) send(e, { t: 'teamout', place });
  for (const [owner, c] of game.cards) if (c.team === target.team) game.cards.delete(owner);
  broadcastCards();
}
function clearCards() { game.cards.clear(); game.rebooting.clear(); game.rebootReadyAt = 0; broadcastCards(); }

function doReboot(carrier) {
  const revived = [];
  for (const [owner, c] of [...game.cards]) {
    if (c.carrier !== carrier.id) continue;
    game.cards.delete(owner);
    const o = ents.get(owner);
    if (!o || o.alive) continue;
    const a = Math.random() * Math.PI * 2;
    Object.assign(o, { alive: true, inMatch: true, hp: 100, sh: 0, mode: 'sky', respawnAt: 0, x: map.reboot.x + Math.cos(a) * 3, y: map.reboot.y + 55, z: map.reboot.z + Math.sin(a) * 3 });
    if (o.bot) Object.assign(o, { tx: map.reboot.x + (Math.random() - 0.5) * 30, tz: map.reboot.z + (Math.random() - 0.5) * 30, target: null, wp: null });
    send(o, { t: 'rebooted', p: [r2(o.x), r2(o.y), r2(o.z)], by: carrier.name });
    send(o, { t: 'got', item: { k: 'w', type: 'pistol', rar: 0, ammo: WEAPONS.pistol.mag } });
    revived.push(o.name);
  }
  if (revived.length) {
    game.rebootReadyAt = now() + SET().rebootCooldown * 1000;
    broadcast({ t: 'rebootmsg', by: carrier.name, names: revived });
  }
}

function updateCards(t) {
  let changed = false;
  const aliveTeamNums = new Set(aliveInMatch().filter((e) => e.team > 0).map((e) => e.team));
  for (const [owner, c] of game.cards) {
    const o = ents.get(owner);
    if (c.carrier && !ents.get(c.carrier)) { c.carrier = null; c.expireAt = t + SET().cardTime * 1000; changed = true; }
    if (!o || o.alive || !aliveTeamNums.has(c.team) || (!c.carrier && t > c.expireAt)) {
      game.cards.delete(owner);
      if (o && !o.bot && !o.alive && t > c.expireAt) send(o, { t: 'cardlost' });
      changed = true;
    }
  }
  for (const [cid, r] of game.rebooting) {
    const c = ents.get(cid);
    // pozycja gracza może przyjść z opóźnieniem (lag) — 1 s tolerancji na dojście do punktu
    const far = !c || Math.hypot(map.reboot.x - c.x, map.reboot.z - c.z) > REBOOT_R + 1.5;
    if (!c || !c.alive || (far && t - r.start > 1000)) { game.rebooting.delete(cid); continue; }
    if (t >= r.end && !far) { game.rebooting.delete(cid); doReboot(c); changed = true; }
  }
  if (changed) broadcastCards();
}

function los(a, b) {
  const o = { x: a.x, y: a.y + 1.5, z: a.z };
  let dx = b.x - o.x, dy = b.y + (b.cr ? 0.85 : 1.3) - o.y, dz = b.z - o.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  dx /= d; dy /= d; dz /= d;
  return raycastMap(map, o, { x: dx, y: dy, z: dz }, d) >= d - 0.3;
}

// ---------------------------------------------------------------- mecz

function syncBots() {
  const bots = [...ents.values()].filter((e) => e.bot);
  const want = SET().bots;
  if (bots.length > want) {
    // usuwaj najpierw boty solo, potem z drużyn
    bots.sort((a, b) => (a.team > 0) - (b.team > 0) || b.id - a.id);
    for (const b of bots.slice(0, bots.length - want)) ents.delete(b.id);
  }
  const used = new Set([...ents.values()].filter((e) => e.bot).map((e) => e.name));
  const free = BOT_NAMES.filter((n) => !used.has(n)).sort(() => Math.random() - 0.5);
  for (let i = bots.length; i < want; i++) {
    const b = newEnt({ bot: true, name: free.pop() || 'Bot', alive: false, inMatch: false, mode: 'dead' });
    ents.set(b.id, b);
  }
}

function prepBot(bot) {
  const wkeys = Object.keys(BOT_WEAPONS);
  let tx, tz;
  if (map.towns.length && Math.random() < 0.7) {
    const t = map.towns[(Math.random() * map.towns.length) | 0];
    tx = t.x + (Math.random() - 0.5) * 40; tz = t.z + (Math.random() - 0.5) * 40;
  } else { const sp = findSpawn(map); tx = sp.x; tz = sp.z; }
  Object.assign(bot, {
    inMatch: true, alive: true, mode: 'bus', hp: SET().startHp, kills: 0, cr: false,
    sh: Math.max(SET().startShield, [0, 0, 25, 50][(Math.random() * 4) | 0]), w: wkeys[(Math.random() * wkeys.length) | 0], rar: (Math.random() * 4) | 0,
    dropAt: 0.12 + Math.random() * 0.8, tx, tz, vy: 0,
    thinkT: 0, fireCd: 0, reactT: 0, strafeT: 0, strafe: 1, wp: null, wpT: 0, stuckT: 1.5, lx: 0, lz: 0, onGround: false, target: null,
  });
}

function startCountdown() {
  if (game.state !== 'lobby') return;
  game.state = 'countdown';
  game.countdownEnd = now() + 5000;
}

function spawnPos() { return findSpawn(map); }

function startMatch() {
  syncBots();
  game.state = 'match';
  resetObjects();
  resetLoot();
  const a = Math.random() * Math.PI * 2, R = 230;
  const b = a + Math.PI + (Math.random() - 0.5) * 0.9;
  game.bus = { from: { x: r2(Math.cos(a) * R), z: r2(Math.sin(a) * R) }, to: { x: r2(Math.cos(b) * R), z: r2(Math.sin(b) * R) }, t0: now() };
  game.busT = 0;
  game.storm = makeStorm();
  game.stormNow = stormState(now());
  game.stormAcc = 0;
  for (const h of humans()) {
    Object.assign(h, { inMatch: true, alive: true, hp: SET().startHp, sh: SET().startShield, kills: 0, mode: 'bus', respawnAt: 0 });
    const bp = busPos(game.bus, 0); h.x = bp.x; h.y = bp.y; h.z = bp.z;
  }
  for (const e of ents.values()) if (e.bot) prepBot(e);
  game.startedWith = aliveInMatch().length;
  game.startedTeams = aliveTeams().size;
  clearCards();
  broadcast({ t: 'matchstart', bus: { from: game.bus.from, to: game.bus.to } });
  broadcast(rosterMsg());
}

function checkEnd() {
  if (game.state !== 'match') return;
  const alive = aliveInMatch();
  const teams = new Set(alive.map(teamKey));
  if ((game.startedTeams > 1 && teams.size <= 1) || alive.length === 0) {
    const wk = alive.length ? teamKey(alive[0]) : null;
    const winners = wk ? [...ents.values()].filter((e) => e.inMatch && teamKey(e) === wk) : [];
    game.state = 'ended';
    game.endAt = now() + 9000;
    clearCards();
    broadcast({ t: 'end', winner: winners.length ? winners.map((e) => e.name).join(' + ') : null, wids: winners.map((e) => e.id), team: wk && wk[0] === 't' ? +wk.slice(1) : 0 });
  }
}

function toLobby() {
  for (const e of ents.values()) if (e.bot) Object.assign(e, { alive: false, inMatch: false, mode: 'dead', target: null });
  syncBots();
  game.state = 'lobby';
  game.bus = null; game.storm = null; game.stormNow = null;
  clearCards();
  resetObjects();
  resetLoot();
  for (const h of humans()) respawn(h, 'lobby');
  broadcast(rosterMsg());
}

function respawn(h, kind) {
  const p = spawnPos();
  Object.assign(h, { x: p.x, y: p.y, z: p.z, vy: 0, inMatch: false, alive: true, hp: 100, sh: 0, mode: 'ground', respawnAt: 0 });
  if (kind === 'lobby') h.kills = 0;
  send(h, { t: kind, p: [r2(p.x), r2(p.y), r2(p.z)] });
}

// ---------------------------------------------------------------- boty

function updateBot(b, dt) {
  if (!b.alive) return;
  if (b.mode === 'bus') {
    const bp = busPos(game.bus, Math.min(1, game.busT));
    b.x = bp.x; b.y = bp.y - 3; b.z = bp.z;
    if (game.busT >= b.dropAt) { b.mode = 'sky'; b.vy = 0; }
    return;
  }
  if (b.mode === 'sky' || b.mode === 'glide') {
    const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
    const sp = b.mode === 'sky' ? 20 : 13;
    if (d > 1) { const s = Math.min(sp * dt, d); b.x += (dx / d) * s; b.z += (dz / d) * s; b.ry = Math.atan2(-dx, -dz); }
    b.y -= (b.mode === 'sky' ? 30 : 7.5) * dt;
    collideCharacter(map, b);
    const g = groundAt(map, b.x, b.z, b.y);
    if (b.mode === 'sky' && b.y - g < 32) b.mode = 'glide';
    if (b.y <= g) { b.y = g; b.vy = 0; b.mode = 'ground'; b.onGround = true; }
    b.mv = true;
    return;
  }

  const st = game.stormNow;
  b.thinkT -= dt; b.fireCd -= dt; b.reactT -= dt; b.strafeT -= dt; b.wpT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = 0.35 + Math.random() * 0.3;
    let best = null, bd = 75;
    for (const o of ents.values()) {
      if (o === b || !o.alive || !o.inMatch || o.mode === 'bus' || o.mode === 'sky' || (sameTeam(o, b) && !SET().friendlyFire)) continue;
      const d = Math.hypot(o.x - b.x, o.y - b.y, o.z - b.z);
      if (d >= bd || !los(b, o)) continue;
      best = o; bd = d;
    }
    if (best && best !== b.target) b.reactT = (0.45 + Math.random() * 0.6) * BOT_LEVEL[SET().botLevel].react;
    b.target = best;
  }
  const W = BOT_WEAPONS[b.w];
  let mx = 0, mz = 0, speed = 5.2;
  const t = b.target && b.target.alive ? b.target : null;
  if (t) {
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
    b.ry = Math.atan2(-dx, -dz);
    b.rx = Math.atan2(t.y - b.y, d);
    if (b.strafeT <= 0) {
      b.strafeT = 0.6 + Math.random() * 1.2;
      b.strafe = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.2 && b.onGround) b.vy = JUMP_V;
    }
    const ux = dx / d, uz = dz / d;
    const fwd = d > W.range * 0.8 ? 1 : d < W.range * 0.3 ? -0.6 : 0;
    mx = ux * fwd - uz * b.strafe * 0.8;
    mz = uz * fwd + ux * b.strafe * 0.8;
    if (b.reactT <= 0 && b.fireCd <= 0 && d < W.range * 1.4) {
      b.fireCd = W.cd * (0.8 + Math.random() * 0.5);
      botShoot(b, t, Math.hypot(dx, t.y - b.y, dz), W);
    }
  } else {
    const outside = st && Math.hypot(b.x - st.nx, b.z - st.nz) > st.nr * 0.85;
    if (!b.wp || Math.hypot(b.wp.x - b.x, b.wp.z - b.z) < 2 || b.wpT <= 0 || (outside && !b.wp.storm)) {
      if (outside) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * st.nr * 0.6;
        b.wp = { x: st.nx + Math.cos(a) * r, z: st.nz + Math.sin(a) * r, storm: true };
      } else {
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 35;
        let x = b.x + Math.cos(a) * r, z = b.z + Math.sin(a) * r;
        const dd = Math.hypot(x, z); if (dd > 165) { x *= 165 / dd; z *= 165 / dd; }
        b.wp = { x, z };
      }
      b.wpT = 12;
    }
    const dx = b.wp.x - b.x, dz = b.wp.z - b.z, d = Math.hypot(dx, dz) || 1;
    mx = dx / d; mz = dz / d;
    b.ry = Math.atan2(-dx, -dz); b.rx = 0;
    if (outside) speed = 7;
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const prevY = b.y;
  b.x += mx * speed * dt; b.z += mz * speed * dt;
  b.vy -= GRAVITY * dt; b.y += b.vy * dt;
  ceilingClamp(map, b, prevY);
  collideCharacter(map, b);
  const g = groundAt(map, b.x, b.z, b.y);
  if (b.y <= g) { b.y = g; b.vy = 0; b.onGround = true; }
  else if (b.onGround && b.vy <= 0 && b.y - g < 0.45) { b.y = g; b.vy = 0; }
  else b.onGround = false;
  b.mv = ml > 0.1;
  b.stuckT -= dt;
  if (b.stuckT <= 0) {
    b.stuckT = 1.5;
    if (ml > 0.1 && Math.hypot(b.x - b.lx, b.z - b.lz) < 1.2) { if (b.onGround) b.vy = JUMP_V; b.wp = null; }
    b.lx = b.x; b.lz = b.z;
  }
}

function botShoot(b, t, d, W) {
  const o = { x: b.x, y: b.y + 1.45, z: b.z };
  const lv = BOT_LEVEL[SET().botLevel];
  let p = Math.max(0.08, Math.min(0.85, (W.acc - d / W.falloff) * lv.acc));
  if (t.mv) p *= 0.75;
  if (t.mode === 'glide') p *= 0.5;
  const hit = Math.random() < p;
  const ty = t.y + (t.cr ? 0.75 : 1.2);
  const e = hit ? { x: t.x, y: ty, z: t.z } : { x: t.x + (Math.random() - 0.5) * 3, y: ty + (Math.random() - 0.3) * 2, z: t.z + (Math.random() - 0.5) * 3 };
  broadcast({ t: 'shot', id: b.id, o: [r2(o.x), r2(o.y), r2(o.z)], e: [r2(e.x), r2(e.y), r2(e.z)], w: b.w });
  if (hit) {
    const head = Math.random() < 0.12;
    applyDamage(t, Math.round(W.dmg * lv.dmg * (head ? 1.5 : 1)), b, b.w, head);
  }
}

// ---------------------------------------------------------------- sieć

const wss = new WebSocketServer({ server });

const isHost = (e) => e && e.id === game.hostId;
function pickHost() {
  const hs = humans();
  const local = hs.find((h) => h.local);
  game.hostId = local ? local.id : hs.length ? hs.reduce((a, b) => (a.id < b.id ? a : b)).id : null;
}

wss.on('connection', (ws, req) => {
  let me = null;
  // host = osoba grająca na komputerze z serwerem (połączenie lokalne, nie przez ngrok)
  const ra = req.socket.remoteAddress || '';
  const local = !req.headers['x-forwarded-for'] && (ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1');
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    if (!me) {
      if (m.t !== 'join') return;
      const name = String(m.name || '').replace(/[<>&"']/g, '').trim().slice(0, 16) || `Gracz${nextId}`;
      me = newEnt({ ws, name, local });
      ents.set(me.id, me);
      const cur = ents.get(game.hostId);
      if (!cur || (local && !cur.local)) game.hostId = me.id;
      const inLobby = game.state === 'lobby' || game.state === 'countdown';
      let spawn = null;
      if (inLobby) { const p = spawnPos(); Object.assign(me, { x: p.x, y: p.y, z: p.z }); spawn = [r2(p.x), r2(p.y), r2(p.z)]; }
      else { me.alive = false; me.mode = 'dead'; }
      send(me, {
        t: 'welcome', id: me.id, map: MAP_JSON, gs: game.state, spawn,
        bus: game.bus ? { from: game.bus.from, to: game.bus.to } : null,
        loot: [...game.loot.values()].map(lootPublic), opened: [...game.opened], settings: SET(),
        destroyed: [...game.destroyed], objHp: [...game.objHp], cards: cardsMsg(),
      });
      broadcast(rosterMsg());
      console.log(`+ ${me.name} (${humans().length} graczy)`);
      return;
    }
    handle(me, m);
  });
  ws.on('close', () => {
    if (!me) return;
    ents.delete(me.id);
    console.log(`- ${me.name} (${humans().length} graczy)`);
    if (game.hostId === me.id) pickHost();
    broadcast(rosterMsg());
    if (game.state === 'match' && me.inMatch && me.alive) {
      broadcast({ t: 'kill', k: null, kid: null, v: me.name, vid: me.id, w: 'quit', head: false });
      for (const c of game.cards.values()) if (c.carrier === me.id) dropCard(c, me);
      if (!aliveInMatch().some((e) => sameTeam(e, me))) teamOut(me, aliveTeams().size + 1);
      checkEnd();
    }
    if (game.cards.delete(me.id)) broadcastCards();
    if (humans().length === 0 && game.state !== 'lobby') toLobby();
  });
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (a) => Array.isArray(a) && a.length === 3 && a.every(isNum);

function handle(me, m) {
  switch (m.t) {
    case 'st': {
      if (!me.alive || !vec(m.p)) return;
      [me.x, me.y, me.z] = m.p;
      if (Array.isArray(m.r) && isNum(m.r[0]) && isNum(m.r[1])) [me.ry, me.rx] = m.r;
      const md = MODES[m.m];
      if (md && md !== 'dead') me.mode = md;
      me.w = typeof m.w === 'string' ? m.w.slice(0, 10) : '';
      me.mv = !!m.mv;
      me.cr = !!m.c;
      break;
    }
    case 'shoot': {
      if (!me.alive || me.mode === 'bus' || game.state === 'ended') return;
      if (!vec(m.o) || !vec(m.e)) return;
      const W = WEAPONS[m.w] || PICKAXE;
      const wt = WEAPONS[m.w] ? m.w : 'pickaxe';
      broadcast({ t: 'shot', id: me.id, o: m.o, e: m.e, w: wt }, me);
      if (Array.isArray(m.objs)) {
        for (const h of m.objs.slice(0, 12)) {
          const o = h && objByKey(map, h.k);
          if (!o) continue;
          const cx = o.x0 !== undefined ? (o.x0 + o.x1) / 2 : o.x, cz = o.z0 !== undefined ? (o.z0 + o.z1) / 2 : o.z;
          if (Math.hypot(cx - me.x, cz - me.z) > (W.range || 3) + 15) continue;
          damageObj(h.k, STRUCT_DMG[wt] * Math.max(1, Math.min(W.pellets || 1, h.n | 0)));
        }
      }
      if (!Array.isArray(m.hits)) return;
      let total = 0;
      for (const h of m.hits.slice(0, 8)) {
        const tgt = ents.get(h && h.id);
        if (!tgt || tgt === me || !tgt.alive || tgt.mode === 'bus' || !isNum(h.dmg)) continue;
        if (game.state === 'match' && (!tgt.inMatch || !me.inMatch)) continue;
        if (Math.hypot(tgt.x - me.x, tgt.y - me.y, tgt.z - me.z) > (W.range || 3) + 12) continue;
        const dmg = Math.max(0, Math.min(300 - total, Math.round(h.dmg)));
        total += dmg;
        applyDamage(tgt, dmg, me, m.w, !!h.head);
      }
      break;
    }
    case 'pickup': {
      const l = game.loot.get(m.id);
      if (!l || !me.alive) return;
      if (Math.hypot(l.x - me.x, l.z - me.z) > 5) return;
      game.loot.delete(l.id);
      broadcast({ t: 'loot-', id: l.id });
      const { id, x, y, z, ...item } = l;
      send(me, { t: 'got', item });
      break;
    }
    case 'drop': {
      const item = sanitizeItem(m.item);
      if (!item) return;
      let [x, y, z] = vec(m.p) ? m.p : [me.x, me.y, me.z];
      if (Math.hypot(x - me.x, z - me.z) > 10) { x = me.x; y = me.y; z = me.z; }
      spawnLoot(item, x, groundAt(map, x, z, y + 1), z);
      break;
    }
    case 'chest': {
      const c = map.chests[m.id];
      if (!c || game.opened.has(c.id) || !me.alive) return;
      if (Math.hypot(c.x - me.x, c.z - me.z) > 5) return;
      openChest(c);
      break;
    }
    case 'use': {
      if (me.alive) applyUse(m.type, me);
      break;
    }
    case 'team': {
      if (!isHost(me) || (game.state !== 'lobby' && game.state !== 'countdown')) return;
      const tgt = ents.get(m.id);
      if (!tgt) return;
      tgt.team = Math.max(0, Math.min(TEAM_COUNT, m.team | 0));
      broadcast(rosterMsg());
      break;
    }
    case 'teamsauto': {
      if (!isHost(me) || (game.state !== 'lobby' && game.state !== 'countdown')) return;
      const size = Math.max(1, Math.min(4, m.size | 0));
      const hs = [...ents.values()].filter((e) => !e.bot || !m.humansOnly).sort(() => Math.random() - 0.5);
      hs.forEach((h, i) => { const tn = 1 + Math.floor(i / size); h.team = size === 1 || tn > TEAM_COUNT ? 0 : tn; });
      broadcast(rosterMsg());
      break;
    }
    case 'cardpick': {
      const c = game.cards.get(m.owner);
      if (!c || c.carrier || !me.alive || !me.inMatch || game.state !== 'match') return;
      const owner = ents.get(c.owner);
      if (!owner || !sameTeam(owner, me) || Math.hypot(c.x - me.x, c.z - me.z) > 5) return;
      c.carrier = me.id;
      broadcastCards();
      break;
    }
    case 'reboot': {
      if (!m.on) { game.rebooting.delete(me.id); return; }
      if (game.rebooting.has(me.id)) return;
      if (game.state !== 'match' || !me.alive || now() < game.rebootReadyAt) return;
      if (![...game.cards.values()].some((c) => c.carrier === me.id)) return;
      if (Math.hypot(map.reboot.x - me.x, map.reboot.z - me.z) > REBOOT_R + 12) return;
      game.rebooting.set(me.id, { start: now(), end: now() + SET().rebootTime * 1000 });
      break;
    }
    case 'start': {
      if (!isHost(me)) return;
      startCountdown();
      break;
    }
    case 'settings': {
      if (!isHost(me) || game.state !== 'lobby') return;
      game.settings = sanitizeSettings(game.settings, m.s);
      syncBots();
      broadcast({ t: 'settings', s: game.settings });
      broadcast(rosterMsg());
      break;
    }
    case 'host': {
      const tgt = ents.get(m.id);
      if (!isHost(me) || !tgt || tgt.bot) return;
      game.hostId = tgt.id;
      broadcast(rosterMsg());
      break;
    }
    case 'jump': {
      if (me.alive && me.mode === 'bus') me.mode = 'sky';
      break;
    }
  }
}

// ---------------------------------------------------------------- pętla serwera

resetLoot();
syncBots();

const TICK = 50;
let lastTick = now();
setInterval(() => {
  const t = now();
  const dt = Math.min(0.1, (t - lastTick) / 1000);
  lastTick = t;

  if (game.state === 'lobby' || game.state === 'countdown') {
    for (const h of humans()) if (!h.alive && h.respawnAt && t >= h.respawnAt) respawn(h, 'respawn');
    if (game.state === 'countdown' && t >= game.countdownEnd) {
      if (humans().length) startMatch(); else game.state = 'lobby';
    }
  } else if (game.state === 'match' || game.state === 'ended') {
    if (game.bus && game.busT < 1) {
      game.busT = (t - game.bus.t0) / 1000 / BUS_TIME;
      if (game.busT >= 1) {
        for (const e of ents.values()) {
          if (e.mode !== 'bus') continue;
          e.mode = 'sky';
          if (!e.bot) send(e, { t: 'eject' });
        }
      }
    }
    game.stormNow = stormState(t);
    for (const e of ents.values()) if (e.bot) updateBot(e, dt);
    if (game.state === 'match') {
      game.stormAcc += dt;
      if (game.stormAcc >= 1) {
        game.stormAcc -= 1;
        const s = game.stormNow;
        for (const e of aliveInMatch()) {
          if (e.mode === 'bus') continue;
          if (Math.hypot(e.x - s.x, e.z - s.z) > s.r) applyDamage(e, s.dmg, null, 'storm', false);
        }
      }
    }
    if (game.state === 'match') updateCards(t);
    if (game.state === 'ended' && t >= game.endAt) toLobby();
  }

  // snapshot
  const ps = [];
  for (const e of ents.values()) {
    if (!e.alive && !e.inMatch) continue;
    ps.push([e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.ry), r2(e.rx), e.alive ? MODE_CODE[e.mode] ?? 0 : 4, e.bot ? e.w + e.rar : e.w, e.alive ? 1 : 0, e.mv ? 1 : 0, e.cr ? 1 : 0, Math.max(0, Math.round(e.hp)), Math.round(e.sh)]);
  }
  const s = game.stormNow;
  const common = JSON.stringify({
    gs: game.state, ps, a: game.state === 'match' || game.state === 'ended' ? aliveInMatch().length : humans().length,
    bt: game.bus ? r2(game.busT) : null,
    cd: game.state === 'countdown' ? Math.ceil((game.countdownEnd - t) / 1000) : 0,
    st: s ? { x: r2(s.x), z: r2(s.z), r: r2(s.r), nx: r2(s.nx), nz: r2(s.nz), nr: r2(s.nr), shr: s.shr, tm: Math.ceil(s.tm), dmg: s.dmg } : null,
  });
  for (const h of ents.values()) {
    if (h.bot) continue;
    send(h, `{"t":"s","me":[${Math.max(0, Math.round(h.hp))},${Math.round(h.sh)},${h.kills},${h.alive ? 1 : 0}],"c":${common}}`);
  }
}, TICK);

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  FORTJEDE działa!`);
  console.log(`  Lokalnie:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  W sieci:   http://${ip}:${PORT}`);
  console.log(`  Dla kolegów przez internet:  ngrok http ${PORT}\n`);
});
