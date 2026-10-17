// Fortjede — autorytatywna symulacja meczu: logika gry, burza, loot, boty.
// Jedna instancja na moduł; działa w Web Workerze hosta (host-worker.js), start przez init().
// Połączenie z graczem to dowolny obiekt z metodą send(string).
// Rozłączony gracz zostaje na mapie (link = null) i wraca do swojej postaci, łącząc się z tym samym tokenem.
// Host co 2 s wysyła gościom pełną kopię stanu (exportState), żeby po jego wyjściu ktoś mógł przejąć pokój (init(kopia)).
import {
  GameMap, WEAPONS, PICKAXE, BOT_WEAPONS, STORM_PHASES, STORM_START_R, BUS_TIME, MODES, MODE_CODE,
  GRAVITY, JUMP_V, randomItem, sanitizeItem, applyUse, busPos, findSpawn,
  collideCharacter, ceilingClamp, groundAt, raycastMap, OBJ_HP, STRUCT_DMG, objByKey,
  REBOOT_R, sameTeam, DEFAULT_SETTINGS, sanitizeSettings, teamDefaults,
} from './shared.js';

// ---------------------------------------------------------------- stan gry

let SEED = 0, map = null, MAP_JSON = null;
const BACKUP_TICKS = 40; // kopia stanu dla gości co 2 s
const LOBBY_GONE_MS = 60000; // rozłączony gracz w lobby znika po minucie (tyle może trwać ponowne łączenie); w meczu stoi do końca

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
  teams: new Map(), nextTeam: 1, teamSeq: 0,
};
const SET = () => game.settings;
const BOT_LEVEL = { easy: { acc: 0.6, dmg: 0.7, react: 1.6 }, normal: { acc: 1, dmg: 1, react: 1 }, hard: { acc: 1.3, dmg: 1.25, react: 0.6 } };

const BOT_NAMES = ['Botty Zed', 'Bot Brenda', 'Mike_AI', 'Captain Camper', 'NoScope Norbert', 'Jumpy Jack', 'Shield Steve',
  'Bambi', 'Default Dave', 'Mr Pickaxe', 'Sniper Sue', 'Bot Bob', 'Llama Larry', 'Zippy Zack', 'Halo 360',
  'Bushy Ben', 'Turbo Tess', 'Sweaty Steve', 'Bot Boris', 'Medkit Mike', 'Glider Gene', 'Ultra Ula',
  'Rush Ryan', 'Fries Fan', 'Eddie Eliminator', 'Pump Pam', 'Camper Kaz', 'Lucy Glide', 'Bot Bart', 'Speedy Sam',
  // + a few hundred combinations, enough for 99 bots without repeats
  ...['Fast', 'Silent', 'Angry', 'Lazy', 'Sneaky', 'Camping', 'Turbo', 'Mega', 'Golden', 'Wild', 'Sleepy', 'Hungry', 'Armored', 'Jumpy', 'Crazy', 'Secret']
    .flatMap((a) => ['Zed', 'Mike', 'Gene', 'Kaz', 'Rick', 'Eddie', 'Bob', 'Steve', 'Jack', 'Hank', 'Walt', 'Joe', 'Frank', 'Joey', 'Kris', 'Bella'].map((f) => `${a} ${f}`))];

const r2 = (v) => Math.round(v * 100) / 100;
const now = () => Date.now();

function send(e, msg) { if (e.link) e.link.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }
function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const e of ents.values()) if (e !== except) send(e, s);
}
function humans() { return [...ents.values()].filter((e) => !e.bot); }
function online() { return humans().filter((e) => e.link); }
function rosterMsg() {
  return { t: 'roster', list: [...ents.values()].map((e) => ({ id: e.id, name: e.name, bot: e.bot, team: e.team, off: !e.bot && !e.link })), host: game.hostId, teams: [...game.teams.values()] };
}
const EMPTY_INV = () => [null, null, null, null, null];
function removeHuman(e) {
  ents.delete(e.id);
  if (game.cards.delete(e.id)) broadcastCards();
  if (game.hostId === e.id) pickHost();
}

function newEnt(props) {
  return Object.assign({
    id: nextId++, name: '?', bot: false, link: null,
    x: 0, y: 0, z: 0, ry: 0, rx: 0, vy: 0, mode: 'ground', w: '', mv: false,
    hp: 100, sh: 0, alive: true, inMatch: false, kills: 0, respawnAt: 0, team: 0,
    tok: '', inv: EMPTY_INV(), place: 0, disc: 0,
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
  target.place = place;
  // ekwipunek: gracz online wyrzuca go sam (klient), za rozłączonego robi to host
  if (!target.bot && !target.link) {
    for (const it of target.inv || []) {
      if (!it) continue;
      const a = Math.random() * Math.PI * 2, d = 0.6 + Math.random() * 1.2;
      const x = target.x + Math.cos(a) * d, z = target.z + Math.sin(a) * d;
      spawnLoot(it, x, groundAt(map, x, z, target.y + 1), z);
    }
  }
  target.inv = EMPTY_INV();
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
  for (const e of ents.values()) if (sameTeam(e, target) && !e.bot) { if (!e.alive) e.place = place; send(e, { t: 'teamout', place }); }
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
    const pistol = { k: 'w', type: 'pistol', rar: 0, ammo: WEAPONS.pistol.mag };
    o.inv = [pistol, null, null, null, null];
    if (!o.bot && !o.link) parkOffline(o);
    send(o, { t: 'got', item: pistol });
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
    Object.assign(h, { inv: EMPTY_INV(), place: 0, kills: 0, respawnAt: 0 });
    // rozłączeni w lobby nie lecą autobusem — po powrocie oglądają mecz
    if (!h.link) { Object.assign(h, { inMatch: false, alive: false, mode: 'dead' }); continue; }
    Object.assign(h, { inMatch: true, alive: true, hp: SET().startHp, sh: SET().startShield, mode: 'bus' });
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
  for (const h of humans()) if (!h.link) removeHuman(h);
  for (const h of humans()) respawn(h, 'lobby');
  broadcast(rosterMsg());
}

function respawn(h, kind) {
  const p = spawnPos();
  Object.assign(h, { x: p.x, y: p.y, z: p.z, vy: 0, inMatch: false, alive: true, hp: 100, sh: 0, mode: 'ground', respawnAt: 0 });
  if (kind === 'lobby') { h.kills = 0; h.inv = EMPTY_INV(); h.place = 0; }
  send(h, { t: kind, p: [r2(p.x), r2(p.y), r2(p.z)] });
}

// rozłączony gracz nie ma kto sterować — zostaje stać na ziemi (z autobusu wypada od razu)
function parkOffline(e) {
  if (!e.alive) return;
  if (e.mode === 'bus' && game.bus) { const bp = busPos(game.bus, Math.min(1, game.busT)); e.x = bp.x; e.z = bp.z; }
  const d = Math.hypot(e.x, e.z);
  if (d > 165) { e.x *= 165 / d; e.z *= 165 / d; e.y = 200; } // autobus lata nad morzem — postaw na wyspie
  if (e.mode !== 'ground') { e.y = groundAt(map, e.x, e.z, e.y + 1); e.mode = 'ground'; }
  e.vy = 0; e.mv = false; e.cr = false;
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

const isHost = (e) => e && e.id === game.hostId;
const lobbyHost = (e) => isHost(e) && (game.state === 'lobby' || game.state === 'countdown');
function addTeam() {
  const d = teamDefaults(game.teamSeq++);
  const t = { id: game.nextTeam++, name: d.name, color: d.color };
  game.teams.set(t.id, t);
  return t;
}
function pickHost() {
  const hs = online();
  const owner = hs.find((h) => h.owner);
  game.hostId = owner ? owner.id : hs.length ? hs.reduce((a, b) => (a.id < b.id ? a : b)).id : null;
}

// stan własnej postaci dla wracającego gracza
function resumeInfo(e) {
  return {
    p: [r2(e.x), r2(e.y), r2(e.z)], ry: r2(e.ry), mode: e.mode, alive: e.alive, inMatch: e.inMatch,
    hp: Math.round(e.hp), sh: Math.round(e.sh), kills: e.kills, inv: e.inv, place: e.place, canReboot: game.cards.has(e.id),
  };
}

// nowe połączenie; owner = gracz, w którego przeglądarce działa symulacja
export function connect(link, owner) {
  let me = null;
  return {
    message(raw) {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (!me) {
        if (m.t !== 'join') return;
        const name = String(m.name || '').replace(/[<>&"']/g, '').trim().slice(0, 16) || `Player${nextId}`;
        const tok = typeof m.tok === 'string' ? m.tok.slice(0, 40) : '';
        // postaci hosta nie da się przejąć z innej karty (zamknęłoby to pokój wszystkim) — taki gracz wchodzi jako nowy
        const old = tok && humans().find((e) => e.tok === tok && !(e.link && e.owner && !owner));
        let resume = null;
        if (old) {
          // powrót do swojej postaci; jeśli stare połączenie jeszcze wisi, nowe je zastępuje
          if (old.link && old.link !== link) send(old, { t: 'replaced' });
          me = old;
          Object.assign(me, { link, name, owner: !!owner, disc: 0 });
          resume = resumeInfo(me);
        } else {
          me = newEnt({ link, name, owner: !!owner, tok: humans().some((e) => e.tok === tok) ? '' : tok });
          ents.set(me.id, me);
          const inLobby = game.state === 'lobby' || game.state === 'countdown';
          if (inLobby) { const p = spawnPos(); Object.assign(me, { x: p.x, y: p.y, z: p.z }); }
          else { me.alive = false; me.mode = 'dead'; }
        }
        const cur = ents.get(game.hostId);
        if (!cur || !cur.link || (owner && !cur.owner)) game.hostId = me.id;
        const spawn = !old && me.alive ? [r2(me.x), r2(me.y), r2(me.z)] : null;
        send(me, {
          t: 'welcome', id: me.id, map: MAP_JSON, gs: game.state, spawn, me: resume,
          bus: game.bus ? { from: game.bus.from, to: game.bus.to } : null,
          loot: [...game.loot.values()].map(lootPublic), opened: [...game.opened], settings: SET(),
          destroyed: [...game.destroyed], objHp: [...game.objHp], cards: cardsMsg(),
        });
        broadcast(rosterMsg());
        console.log(`${old ? '↺' : '+'} ${me.name} (${online().length} online)`);
        return;
      }
      if (me.link !== link) return; // to połączenie zastąpiło nowsze
      handle(me, m);
    },
    close() {
      if (!me || me.link !== link || !ents.has(me.id)) return;
      // postać zostaje na mapie: stoi, można ją zabić, a gracz może do niej wrócić
      me.link = null; me.disc = now();
      parkOffline(me);
      game.rebooting.delete(me.id);
      if (game.state === 'match') {
        let dropped = false;
        for (const c of game.cards.values()) if (c.carrier === me.id) { dropCard(c, me); dropped = true; }
        if (dropped) broadcastCards();
      }
      console.log(`- ${me.name} (${online().length} online)`);
      if (game.hostId === me.id) pickHost();
      broadcast(rosterMsg());
    },
  };
}

// ---------------------------------------------------------------- kopia stanu i start

// czasy zapisujemy względnie (ms od teraz), bo zegary komputerów hosta i następcy się różnią
const rel = (v, t) => (v ? v - t : 0);
const abs = (v, t) => (v ? v + t : 0);

export function exportState() {
  const t = now();
  return {
    v: 1, seed: SEED, nextId,
    game: {
      state: game.state, countdownEnd: rel(game.countdownEnd, t), endAt: rel(game.endAt, t),
      bus: game.bus && { ...game.bus, t0: rel(game.bus.t0, t) }, busT: game.busT,
      storm: game.storm && { phases: game.storm.phases, t0: rel(game.storm.t0, t) }, stormAcc: game.stormAcc,
      loot: [...game.loot.values()], nextLootId: game.nextLootId, opened: [...game.opened],
      startedWith: game.startedWith, objHp: [...game.objHp], destroyed: [...game.destroyed],
      cards: [...game.cards.values()].map((c) => ({ ...c, expireAt: rel(c.expireAt, t) })),
      rebootReadyAt: rel(game.rebootReadyAt, t), startedTeams: game.startedTeams,
      settings: game.settings, hostId: game.hostId, teams: [...game.teams.values()],
      nextTeam: game.nextTeam, teamSeq: game.teamSeq, tickNo: game.tickNo || 0,
    },
    ents: [...ents.values()].map(({ link, target, ...e }) => ({ ...e, respawnAt: rel(e.respawnAt, t), disc: rel(e.disc, t) })),
    // kolejność przejmowania pokoju: gracze online poza hostem, od najstarszego
    succ: online().filter((e) => !e.owner).sort((a, b) => a.id - b.id).map((e) => e.tok).filter(Boolean),
  };
}

// start symulacji: nowy pokój albo przejęcie z kopii stanu poprzedniego hosta
export function init(st) {
  SEED = st ? st.seed : (Math.random() * 1e9) | 0;
  map = new GameMap(SEED);
  MAP_JSON = map.toJSON();
  console.log(`Map: seed ${SEED}, ${map.towns.length} towns, ${map.pads.length} houses, ${map.chests.length} chests`);
  if (!st) {
    addTeam(); addTeam(); // na start dwie puste drużyny
    resetLoot();
    syncBots();
    return;
  }
  const t = now(), g = st.game;
  nextId = st.nextId;
  Object.assign(game, {
    state: g.state, countdownEnd: abs(g.countdownEnd, t), endAt: abs(g.endAt, t),
    bus: g.bus && { ...g.bus, t0: abs(g.bus.t0, t) }, busT: g.busT,
    storm: g.storm && { phases: g.storm.phases, t0: abs(g.storm.t0, t) }, stormAcc: g.stormAcc,
    loot: new Map(g.loot.map((l) => [l.id, l])), nextLootId: g.nextLootId, opened: new Set(g.opened),
    startedWith: g.startedWith, objHp: new Map(g.objHp), destroyed: new Set(g.destroyed),
    cards: new Map(g.cards.map((c) => [c.owner, { ...c, expireAt: abs(c.expireAt, t) }])), rebooting: new Map(),
    rebootReadyAt: abs(g.rebootReadyAt, t), startedTeams: g.startedTeams,
    settings: g.settings, hostId: g.hostId, teams: new Map(g.teams.map((x) => [x.id, x])),
    nextTeam: g.nextTeam, teamSeq: g.teamSeq, tickNo: g.tickNo,
  });
  game.stormNow = game.storm ? stormState(t) : null;
  for (const key of game.destroyed) { const o = objByKey(map, key); if (o) o.dead = true; }
  ents.clear();
  for (const e of st.ents) {
    const x = { ...e, link: null, owner: false, target: null, respawnAt: abs(e.respawnAt, t), disc: e.bot ? 0 : t };
    if (!x.bot) parkOffline(x);
    ents.set(x.id, x);
  }
  console.log(`Room taken over: ${humans().length} players, state ${game.state}`);
}

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
      if (!lobbyHost(me)) return;
      const tgt = ents.get(m.id);
      const team = m.team | 0;
      if (!tgt || (team !== 0 && !game.teams.has(team))) return;
      tgt.team = team;
      broadcast(rosterMsg());
      break;
    }
    case 'teamadd': {
      if (!lobbyHost(me)) return;
      const t = addTeam();
      const tgt = ents.get(m.id);
      if (tgt) tgt.team = t.id;
      broadcast(rosterMsg());
      break;
    }
    case 'teamdel': {
      if (!lobbyHost(me) || !game.teams.has(m.id)) return;
      for (const e of ents.values()) if (e.team === m.id) e.team = 0;
      game.teams.delete(m.id);
      broadcast(rosterMsg());
      break;
    }
    case 'teamrename': {
      const t = game.teams.get(m.id);
      if (!lobbyHost(me) || !t) return;
      t.name = String(m.name || '').replace(/[<>&"']/g, '').trim().slice(0, 20) || t.name;
      broadcast(rosterMsg());
      break;
    }
    case 'teamclean': { // usuń puste drużyny
      if (!lobbyHost(me)) return;
      for (const id of [...game.teams.keys()]) if (![...ents.values()].some((e) => e.team === id)) game.teams.delete(id);
      broadcast(rosterMsg());
      break;
    }
    case 'teamsauto': { // losowe drużyny po N osób (z botami albo bez)
      if (!lobbyHost(me)) return;
      const size = Math.max(1, Math.min(50, m.size | 0));
      const pool = [...ents.values()].filter((e) => m.bots || !e.bot).sort(() => Math.random() - 0.5);
      for (const e of ents.values()) e.team = 0;
      game.teams.clear(); game.teamSeq = 0;
      if (size > 1) {
        const n = Math.ceil(pool.length / size);
        const ts = Array.from({ length: n }, () => addTeam());
        pool.forEach((e, i) => { e.team = ts[Math.floor(i / size)].id; });
      }
      broadcast(rosterMsg());
      break;
    }
    case 'botsfill': { // rozdziel boty solo po równo do drużyn (najpierw tych z graczami)
      if (!lobbyHost(me)) return;
      const count = (id) => [...ents.values()].filter((e) => e.team === id).length;
      let targets = [...game.teams.keys()].filter((id) => [...ents.values()].some((e) => e.team === id && !e.bot));
      if (!targets.length) targets = [...game.teams.keys()];
      if (!targets.length) return;
      for (const b of [...ents.values()].filter((e) => e.bot && !e.team)) {
        targets.sort((a, c) => count(a) - count(c));
        b.team = targets[0];
      }
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
    case 'inv': { // ekwipunek trzyma klient; host ma kopię na wypadek rozłączenia i przejęcia pokoju
      if (!me.alive || !Array.isArray(m.inv)) return;
      me.inv = [0, 1, 2, 3, 4].map((i) => sanitizeItem(m.inv[i]));
      break;
    }
    case 'jump': {
      if (me.alive && me.mode === 'bus') me.mode = 'sky';
      break;
    }
  }
}

// ---------------------------------------------------------------- pętla symulacji

export const TICK = 50;
let lastTick = now();
export function step() {
  const t = now();
  const dt = Math.min(0.1, (t - lastTick) / 1000);
  lastTick = t;

  if (game.state === 'lobby' || game.state === 'countdown') {
    for (const h of humans()) if (!h.alive && h.respawnAt && t >= h.respawnAt) respawn(h, 'respawn');
    let gone = false;
    for (const h of humans()) if (!h.link && t - h.disc > LOBBY_GONE_MS) { removeHuman(h); gone = true; }
    if (gone) broadcast(rosterMsg());
    if (game.state === 'countdown' && t >= game.countdownEnd) {
      if (online().length) startMatch(); else game.state = 'lobby';
    }
  } else if (game.state === 'match' || game.state === 'ended') {
    if (game.bus && game.busT < 1) {
      game.busT = (t - game.bus.t0) / 1000 / BUS_TIME;
      if (game.busT >= 1) {
        for (const e of ents.values()) {
          if (e.mode !== 'bus') continue;
          e.mode = 'sky';
          if (!e.bot) { if (e.link) send(e, { t: 'eject' }); else parkOffline(e); }
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

  // snapshot — dalekie postacie (>140 m) wysyłane rzadziej (co 4. tik), żeby oszczędzać łącze przy wielu botach
  game.tickNo = (game.tickNo || 0) + 1;
  const rows = [];
  for (const e of ents.values()) {
    if (!e.alive) continue; // martwych nie wysyłamy (klient chowa ich po komunikacie 'kill')
    rows.push({ e, json: JSON.stringify([e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.ry), r2(e.rx), e.alive ? MODE_CODE[e.mode] ?? 0 : 4, e.bot ? e.w + e.rar : e.w, e.alive ? 1 : 0, e.mv ? 1 : 0, e.cr ? 1 : 0, Math.max(0, Math.round(e.hp)), Math.round(e.sh)]) });
  }
  const s = game.stormNow;
  const meta = JSON.stringify({
    gs: game.state, a: game.state === 'match' || game.state === 'ended' ? aliveInMatch().length : humans().length,
    bt: game.bus ? r2(game.busT) : null,
    cd: game.state === 'countdown' ? Math.ceil((game.countdownEnd - t) / 1000) : 0,
    st: s ? { x: r2(s.x), z: r2(s.z), r: r2(s.r), nx: r2(s.nx), nz: r2(s.nz), nr: r2(s.nr), shr: s.shr, tm: Math.ceil(s.tm), dmg: s.dmg } : null,
  }).slice(0, -1);
  for (const h of ents.values()) {
    if (h.bot || !h.link) continue;
    const near = h.alive && h.mode !== 'bus' && h.mode !== 'sky'; // z autobusu i po śmierci widać wszystko na bieżąco
    const parts = [];
    for (const r of rows) {
      const e = r.e;
      if (near && e !== h && !sameTeam(e, h) && (game.tickNo + e.id) % 4 !== 0 && Math.hypot(e.x - h.x, e.z - h.z) > 140) continue;
      parts.push(r.json);
    }
    send(h, `{"t":"s","me":[${Math.max(0, Math.round(h.hp))},${Math.round(h.sh)},${h.kills},${h.alive ? 1 : 0}],"c":${meta},"ps":[${parts.join(',')}]}}`);
  }

  // kopia stanu dla gości (przejęcie pokoju, gdy host wyjdzie)
  if (game.tickNo % BACKUP_TICKS === 0) {
    const guests = online().filter((h) => !h.owner);
    if (guests.length) {
      const b = `{"t":"backup","st":${JSON.stringify(exportState())}}`;
      for (const h of guests) send(h, b);
    }
  }
}
