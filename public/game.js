// Fortjede — klient gry (three.js, bez bundlera)
import * as THREE from 'three';
import * as S from './shared.js';
import * as FX from './gunfx.js';
import * as VIS from './visuals.js';
import { createAvatar, animateAvatar, muzzleOf, makeNameSprite } from './avatar.js';
import { startSession, cleanCode, inviteLink } from './net.js';

const { WEAPONS, CONSUMABLES, RARITIES, PICKAXE, MODE_CODE, MODES } = S;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// telefon / tablet: sterowanie dotykiem zamiast myszy i klawiatury (?touch=1 wymusza, ?touch=0 wyłącza)
const qTouch = new URLSearchParams(location.search).get('touch');
const TOUCH = qTouch != null ? qTouch !== '0' : matchMedia('(hover: none) and (pointer: coarse)').matches;
if (TOUCH) document.body.classList.add('touch');

// rozmiar widoku. iOS w trybie aplikacji (z ekranu początkowego) w poziomie zgłasza widok niższy
// o pasek statusu i zostawia pusty pas na dole — wtedy bierzemy pełny ekran.
let VW = innerWidth, VH = innerHeight;
function measureView() {
  VW = innerWidth; VH = innerHeight;
  if (navigator.standalone && screen.width && screen.height) {
    const land = innerWidth > innerHeight, a = Math.max(screen.width, screen.height), b = Math.min(screen.width, screen.height);
    const sw = land ? a : b, sh = land ? b : a;
    if (sw > VW && sw < VW * 1.3) VW = sw; // nie ruszaj przy podzielonym ekranie na iPadzie
    if (sh > VH && sh < VH * 1.3) VH = sh;
  }
  document.documentElement.style.setProperty('--vw', `${VW}px`);
  document.documentElement.style.setProperty('--vh', `${VH}px`);
}
measureView();

addEventListener('error', (e) => { const el = document.getElementById('connStatus'); if (el) el.textContent = 'Error: ' + e.message; });

const sndPickup = () => { FX.beep(660, 0.06, 'triangle', 0.15); FX.beep(990, 0.08, 'triangle', 0.15, 0.06); };
const sndChest = () => [523, 659, 784, 1046].forEach((f, i) => FX.beep(f, 0.15, 'triangle', 0.12, i * 0.07));
const sndWin = () => [523, 659, 784, 1046, 784, 1046].forEach((f, i) => FX.beep(f, 0.25, 'triangle', 0.15, i * 0.15));

// ================================================================ renderer / scena
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.domElement.id = 'game';
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = TOUCH ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap; // miękkie cienie są za drogie na telefon
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY = VIS.HORIZON.clone(), STORM_FOG = new THREE.Color(0x5a2a9a);
scene.background = SKY.clone();
scene.fog = new THREE.Fog(SKY.clone(), 160, 520);
const camera = new THREE.PerspectiveCamera(75, VW / VH, 0.1, 1500);
camera.position.set(0, 80, 120);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xd6ecff, 0x6a8a4a, 1.25));
const sun = new THREE.DirectionalLight(0xfff0d6, 3.3);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 360 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const flash = new THREE.PointLight(0xffc870, 0, 14, 2);
scene.add(flash);
FX.initFx(scene);

// jakość grafiki (zapamiętana w przeglądarce)
const QDEF = TOUCH ? 'low' : 'medium';
let QKEY = QDEF;
try { QKEY = localStorage.getItem('fortjede-q') || QDEF; } catch { /* brak storage */ }
if (!VIS.QUALITY[QKEY]) QKEY = QDEF;
let QUAL = VIS.QUALITY[QKEY];
let post = null;
function applyQuality() {
  // ekran telefonu jest mały i gęsty: przy 1:1 obraz byłby rozmyty, więc trochę więcej pikseli
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUAL.pixelRatio * (TOUCH ? 1.5 : 1)));
  renderer.setSize(VW, VH);
  sun.shadow.mapSize.set(QUAL.shadow, QUAL.shadow);
  if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  if (post) { post.dispose(); post = null; }
  if (QUAL.post) { post = VIS.createPost(renderer, scene, camera, QUAL); post.setSize(VW, VH); }
  if (env) env.setQuality(QUAL);
}

function onResize() {
  measureView();
  renderer.setSize(VW, VH);
  camera.aspect = VW / VH;
  camera.updateProjectionMatrix();
  if (post) post.setSize(VW, VH);
}
addEventListener('resize', onResize);
addEventListener('orientationchange', () => setTimeout(onResize, 300)); // iOS podaje nowy rozmiar z opóźnieniem

// ================================================================ modele pomocnicze
const BOX = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
const lam = (c) => {
  let m = matCache.get(c);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }); matCache.set(c, m); }
  return m;
};
function boxMesh(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(BOX, typeof color === 'number' ? lam(color) : color);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
  return m;
}

// ================================================================ świat
let gm = null, env = null;
let busMesh = null, stormMesh = null, rebootMesh = null;
const chestMeshes = [];
const chestMat = new THREE.MeshStandardMaterial({ color: 0xe0a51e, emissive: 0x7a4c00, roughness: 0.35, metalness: 0.4 });
const chestLidMat = new THREE.MeshStandardMaterial({ color: 0xf5c542, emissive: 0x7a4c00, roughness: 0.35, metalness: 0.4 });

function buildWorld() {
  env = VIS.buildEnvironment(scene, gm, QUAL);

  for (const ch of gm.chests) {
    const g = new THREE.Group();
    g.add(boxMesh(1.0, 0.5, 0.6, chestMat, 0, 0.25, 0));
    g.add(boxMesh(1.04, 0.22, 0.64, chestLidMat, 0, 0.6, 0));
    g.add(boxMesh(1.06, 0.07, 0.66, 0x4a3218, 0, 0.5, 0));
    for (const x of [-0.42, 0.42]) g.add(boxMesh(0.08, 0.74, 0.66, 0x4a3218, x, 0.37, 0));
    g.add(boxMesh(0.16, 0.2, 0.05, 0x2a2a2a, 0, 0.48, -0.33));
    g.position.set(ch.x, ch.y, ch.z);
    g.rotation.y = ch.ry;
    scene.add(g);
    chestMeshes[ch.id] = g;
  }

  busMesh = new THREE.Group();
  busMesh.add(boxMesh(3.2, 2.8, 9, 0x2b6cff));
  busMesh.add(boxMesh(3.26, 0.9, 7.4, 0x9fe7ff, 0, 0.5, 0.2));
  busMesh.add(boxMesh(2.8, 0.9, 0.1, 0x9fe7ff, 0, 0.5, -4.52));
  busMesh.add(boxMesh(3.3, 0.25, 9.1, 0xffffff, 0, -0.7, 0));
  for (const [x, z] of [[-1.5, -3], [1.5, -3], [-1.5, 3], [1.5, 3]]) busMesh.add(boxMesh(0.4, 1, 1, 0x222222, x, -1.4, z));
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(4, 24, 16), new THREE.MeshStandardMaterial({ color: 0x3fa9ff, roughness: 0.5 }));
  balloon.position.y = 8; balloon.scale.set(1, 1.15, 1.25);
  busMesh.add(balloon);
  busMesh.add(boxMesh(8.2, 0.6, 0.6, 0xffe14d, 0, 8, 0));
  for (const [x, z] of [[-1.4, -3.5], [1.4, -3.5], [-1.4, 3.5], [1.4, 3.5]]) busMesh.add(boxMesh(0.05, 4, 0.05, 0xdddddd, x, 3.4, z));
  busMesh.visible = false;
  scene.add(busMesh);

  // punkt odrodzenia (furgonetka; korpus i kolizja pochodzą z mapy)
  const rb = gm.reboot;
  rebootMesh = new THREE.Group();
  rebootMesh.position.set(rb.x, rb.y, rb.z);
  rebootMesh.add(boxMesh(2.44, 0.28, 5.24, 0xffffff, 0, 1.0, 0));
  rebootMesh.add(boxMesh(2.0, 0.9, 0.06, 0x9fe7ff, 0, 1.8, -2.63));
  rebootMesh.add(boxMesh(2.46, 0.7, 1.2, 0x9fe7ff, 0, 1.85, -1.7));
  for (const [x, z] of [[-1.22, -1.7], [1.22, -1.7], [-1.22, 1.7], [1.22, 1.7]]) rebootMesh.add(boxMesh(0.3, 0.8, 0.8, 0x222222, x, -0.2, z));
  rebootMesh.add(boxMesh(0.9, 0.3, 0.9, 0x333333, 0, 2.65, 0.8));
  const screen = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x4cf2ff }));
  screen.scale.set(0.06, 0.6, 1.0); screen.position.set(1.24, 1.5, 0.6);
  rebootMesh.add(screen);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), new THREE.MeshBasicMaterial({ color: 0x4cf2ff }));
  lamp.position.set(0, 3.0, 0.8);
  rebootMesh.add(lamp);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 160, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x4cf2ff, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.set(0, 82, 0.8);
  rebootMesh.add(beam);
  const lc = document.createElement('canvas'); lc.width = 512; lc.height = 96;
  const lx = lc.getContext('2d');
  lx.fillStyle = 'rgba(0,30,60,0.75)'; lx.fillRect(16, 12, 480, 72);
  lx.fillStyle = '#4cf2ff'; lx.font = '800 42px Rubik, sans-serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle';
  lx.fillText('♻ REBOOT VAN', 256, 50);
  const ltex = new THREE.CanvasTexture(lc); ltex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, depthWrite: false }));
  label.scale.set(5, 0.94, 1); label.position.set(0, 4.3, 0);
  rebootMesh.add(label);
  rebootMesh.userData = { lamp, beam, screen };
  scene.add(rebootMesh);

  stormMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 400, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  );
  stormMesh.position.y = 150;
  stormMesh.visible = false;
  stormMesh.frustumCulled = false;
  scene.add(stormMesh);
}

// ================================================================ niszczenie otoczenia
function setObjVisible(key, vis) {
  const o = S.objByKey(gm, key);
  if (!o) return;
  o.dead = !vis;
  env.setVisible(key, vis);
}
const objMat = (o) => (o.k === 'rock' || o.k === 'container' ? 'stone' : 'wood');
function objCenter(o) {
  if (o.x0 !== undefined) return new THREE.Vector3((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, (o.z0 + o.z1) / 2);
  return new THREE.Vector3(o.x, (o.y0 + o.y1) / 2, o.z);
}
function destroyObj(key) {
  const o = S.objByKey(gm, key);
  if (!o || o.dead) return;
  setObjVisible(key, false);
  const c = objCenter(o);
  const dist = c.distanceTo(camera.position);
  if (dist < 120) {
    if (o.x0 !== undefined) {
      const size = new THREE.Vector3(o.x1 - o.x0, o.y1 - o.y0, o.z1 - o.z0);
      FX.debris(c, size, o.c, S.groundAt(gm, c.x, c.z, o.y0));
    } else if (o.k === 'tree') {
      const t = gm.trees[o.i];
      FX.debris(new THREE.Vector3(o.x, t.y + 1.5 * t.s, o.z), new THREE.Vector3(0.6, 3 * t.s, 0.6), 0x7a5230, t.y);
      FX.debris(new THREE.Vector3(o.x, t.y + 4 * t.s, o.z), new THREE.Vector3(3 * t.s, 3 * t.s, 3 * t.s), 0x5cae3a, t.y);
    } else {
      FX.debris(c, new THREE.Vector3(o.r * 2, o.y1 - o.y0, o.r * 2), 0x9c9a92, gm.height(o.x, o.z));
    }
  }
  FX.sndBreak(objMat(o), 1 / (1 + dist / 25));
  if (key === G.lastObj) { G.objHpShow = { name: S.OBJ_NAME[o.k], hp: 0, max: S.OBJ_HP[o.k] }; G.lastObjT = 1; }
}
function resetObjs() {
  for (const o of [...gm.boxes, ...gm.cyls]) o.dead = false;
  env.resetAll();
}

// ================================================================ loot
const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 3, 6); beamGeo.translate(0, 1.5, 0);
const glowGeo = new THREE.CircleGeometry(0.7, 24); glowGeo.rotateX(-Math.PI / 2);
const beamMats = RARITIES.map((r) => new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
const glowMats = RARITIES.map((r) => new THREE.MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
function rarIndex(it) { return it.k === 'w' ? it.rar : (it.type === 'medkit' || it.type === 'shield_b' ? 2 : 1); }

function addLoot(l) {
  removeLoot(l.id);
  const g = new THREE.Group();
  const model = FX.makeItemModel(l.type, l.rar || 0);
  model.scale.setScalar(1.3);
  model.position.y = 0.5;
  g.add(model);
  g.add(new THREE.Mesh(beamGeo, beamMats[rarIndex(l)]));
  const glow = new THREE.Mesh(glowGeo, glowMats[rarIndex(l)]);
  glow.position.y = 0.04;
  g.add(glow);
  g.position.set(l.x, l.y, l.z);
  scene.add(g);
  G.loot.set(l.id, { ...l, mesh: g, model });
}
function removeLoot(id) {
  const l = G.loot.get(id);
  if (!l) return;
  scene.remove(l.mesh);
  G.loot.delete(id);
}
function setLoot(list, opened) {
  for (const id of [...G.loot.keys()]) removeLoot(id);
  for (const l of list) addLoot(l);
  G.opened = new Set(opened);
  chestMeshes.forEach((m, id) => { if (m) m.visible = !G.opened.has(id); });
}

// ================================================================ karty odrodzenia
const cardMeshes = new Map();
function makeCardMesh(team, name) {
  const col = tColor(team);
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 128; c.height = 180;
  const x = c.getContext('2d');
  x.fillStyle = col; x.fillRect(0, 0, 128, 180);
  x.fillStyle = '#ffffff'; x.fillRect(8, 8, 112, 164);
  x.fillStyle = col; x.font = '800 64px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText('♻', 64, 90);
  x.fillStyle = '#222'; x.font = '700 18px Rubik, sans-serif'; x.fillText(name.slice(0, 10), 64, 140);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: tex });
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.03), [lam(0xffffff), lam(0xffffff), lam(0xffffff), lam(0xffffff), face, face]);
  card.position.y = 0.8;
  g.add(card);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 3;
  g.add(beam);
  g.userData.card = card;
  return g;
}
function setCards(msg) {
  G.cards = new Map(msg.list.map((c) => [c.owner, { ...c, until: c.left != null ? performance.now() + c.left * 1000 : null }]));
  G.rebootReadyAt = performance.now() + (msg.ready || 0) * 1000;
  for (const [owner, mesh] of cardMeshes) if (!G.cards.has(owner) || G.cards.get(owner).carrier) { scene.remove(mesh); cardMeshes.delete(owner); }
  for (const c of G.cards.values()) {
    const mine = c.owner === G.myId || (G.myTeam > 0 && c.team === G.myTeam);
    if (!mine || c.carrier) continue;
    let mesh = cardMeshes.get(c.owner);
    if (!mesh) { mesh = makeCardMesh(c.team, nameOf(c.owner)); scene.add(mesh); cardMeshes.set(c.owner, mesh); }
    mesh.position.set(c.x, c.y, c.z);
  }
  if (!carrying().length && G.rebootT > 0) cancelReboot();
}

// ================================================================ znaczniki na ekranie (karty, punkt odrodzenia)
const markerEls = new Map();
const _mv = new THREE.Vector3();
function updateMarkers() {
  const want = [];
  if (G.state === 'match' && !G.dead) {
    for (const c of G.cards.values()) {
      if (c.carrier || c.owner === G.myId || !cardMeshes.has(c.owner)) continue;
      want.push({ key: 'c' + c.owner, x: c.x, y: c.y + 1.2, z: c.z, icon: '🃏', label: nameOf(c.owner), color: tColor(c.team) });
    }
    if (carrying().length) want.push({ key: 'reboot', x: gm.reboot.x, y: gm.reboot.y + 3.5, z: gm.reboot.z, icon: '♻', label: 'Reboot Van', color: '#4cf2ff' });
  }
  const keep = new Set();
  const W = VW, H = VH, M = 46;
  for (const w of want) {
    keep.add(w.key);
    let el = markerEls.get(w.key);
    if (!el) {
      el = document.createElement('div'); el.className = 'mk';
      el.innerHTML = '<span class="ma"></span><div class="mi"></div><div class="ml"></div>';
      $('markers').appendChild(el); markerEls.set(w.key, el);
    }
    el.style.setProperty('--c', w.color);
    el.querySelector('.mi').textContent = w.icon;
    const dist = Math.round(Math.hypot(w.x - me.x, w.z - me.z));
    el.querySelector('.ml').textContent = `${w.label} • ${dist} m`;
    _mv.set(w.x, w.y, w.z).project(camera);
    let sx = (_mv.x * 0.5 + 0.5) * W, sy = (-_mv.y * 0.5 + 0.5) * H;
    const behind = _mv.z > 1;
    if (behind) { sx = W - sx; sy = H - sy; }
    const edge = behind || sx < M || sx > W - M || sy < M || sy > H - M;
    if (edge) { // przyklej do krawędzi ekranu i pokaż strzałkę w stronę celu
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((W / 2 - M) / Math.max(1e-3, Math.abs(dx)), (H / 2 - M) / Math.max(1e-3, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
      el.querySelector('.ma').style.transform = `translate(-50%,-50%) rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad) translateY(-30px)`;
    }
    el.classList.toggle('edge', edge);
    el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%)`;
  }
  for (const [k, el] of markerEls) if (!keep.has(k)) { el.remove(); markerEls.delete(k); }
}

// ================================================================ liczby obrażeń
const dmgNums = [];
function spawnDmgNum(p, dmg, cls) {
  const el = document.createElement('div');
  el.className = 'dn ' + cls;
  el.textContent = dmg;
  $('dmgnums').appendChild(el);
  dmgNums.push({
    el, pos: new THREE.Vector3(p[0] + (Math.random() - 0.5) * 0.8, p[1] + 2.0, p[2] + (Math.random() - 0.5) * 0.8),
    vx: (Math.random() - 0.5) * 60, life: 0.95,
  });
}
const _proj = new THREE.Vector3();
function updateDmgNums(dt) {
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i]; d.life -= dt;
    if (d.life <= 0) { d.el.remove(); dmgNums.splice(i, 1); continue; }
    _proj.copy(d.pos).project(camera);
    if (_proj.z > 1) { d.el.style.display = 'none'; continue; }
    d.el.style.display = '';
    const age = 0.95 - d.life;
    const x = (_proj.x * 0.5 + 0.5) * VW + d.vx * age, y = (-_proj.y * 0.5 + 0.5) * VH - age * 70 + age * age * 60;
    const s = age < 0.1 ? 1.7 - age * 7 : 1;
    d.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s})`;
    d.el.style.opacity = Math.min(1, d.life / 0.3);
  }
}

// ================================================================ stan gry
const G = {
  myId: 0, state: 'lobby', cd: 0, alive: 0, storm: null, bus: null, busT: 0, busTarget: 0,
  hp: 100, sh: 0, kills: 0,
  inv: [null, null, null, null, null], sel: 0,
  fireCd: 0, reloadT: 0, reloading: false, useT: 0, bloom: 0, sinceShot: 9,
  ads: false, adsHeld: false, mouseDown: false, firedThisPress: false, dryClicked: false,
  dead: false, deadInfo: null, spectating: false, specId: null,
  roster: new Map(), others: new Map(), loot: new Map(), opened: new Set(),
  endInfo: null, killMsg: '', killMsgT: 0,
  lastObj: null, lastObjAt: 0, lastObjT: 0, objHpShow: null,
  myTeam: 0, cards: new Map(), rebootReadyAt: 0, rebootT: 0, teamPanelT: 0,
  settings: { ...S.DEFAULT_SETTINGS }, hostId: null, teams: new Map(), selChip: null,
};
const me = { x: 0, y: 30, z: 0, vx: 0, vy: 0, vz: 0, ry: 0, rx: 0, mode: 'ground', onGround: false, crouch: false, h: S.PLAYER_H, slideT: 0, climb: null, eyeH: 1.6 };
// odrzut kamery: p/y = aktualne przesunięcie, tp/ty = cel (sprężyna), shake = wstrząs
const RC = { p: 0, y: 0, tp: 0, ty: 0, shake: 0, fov: 0 };
let meAv = null;
let hotbarDirty = true;

function getOther(id) {
  let o = G.others.get(id);
  if (!o) {
    const info = G.roster.get(id) || { name: '?', bot: false };
    o = { id, av: createAvatar(id, info.name, info.bot), cur: new THREE.Vector3(), tgt: new THREE.Vector3(), ry: 0, tRy: 0, rx: 0, mode: 0, w: 'pickaxe', alive: true, mv: false, fresh: true, vx: 0, vy: 0, vz: 0 };
    scene.add(o.av.root);
    G.others.set(id, o);
    refreshTag(o);
  }
  return o;
}
function refreshTag(o) {
  const info = G.roster.get(o.id);
  if (!info) return;
  const tc = G.myTeam > 0 && info.team === G.myTeam ? tColor(info.team) : null;
  const label = info.off ? `${info.name} (offline)` : info.name;
  const key = label + '|' + tc + '|' + G.myTeam;
  if (o.av.tagKey === key) return;
  o.av.root.remove(o.av.tag);
  o.av.tag = makeNameSprite(label, info.bot, tc);
  o.av.tagKey = key; o.av.name = info.name;
  o.av.root.add(o.av.tag);
}
function removeOther(id) {
  const o = G.others.get(id);
  if (!o) return;
  scene.remove(o.av.root);
  G.others.delete(id);
}
const isMate = (id) => G.myTeam > 0 && id !== G.myId && (G.roster.get(id) || {}).team === G.myTeam;
const amHost = () => G.hostId === G.myId;
const teamOf = (t) => G.teams.get(t) || { id: 0, name: 'Solo', color: S.SOLO_COLOR };
const tColor = (t) => teamOf(t).color;
const tName = (t) => teamOf(t).name;
const nameOf = (id) => (G.roster.get(id) || {}).name || '?';
const carrying = () => [...G.cards.values()].filter((c) => c.carrier === G.myId);
// koledzy z drużyny są „przezroczyści” dla kul
const targetable = (o) => o.alive && o.mode !== 3 && o.mode !== 4 && o.av.root.visible && (!isMate(o.id) || G.settings.friendlyFire);
const curItem = () => G.inv[G.sel];
const curWeapon = () => { const it = curItem(); return it && it.k === 'w' ? WEAPONS[it.type] : (it ? null : PICKAXE); };
const heldStr = () => { const it = curItem(); return !it ? 'pickaxe' : it.k === 'w' ? it.type + it.rar : it.type; };

function placeMe(p) {
  me.x = p[0]; me.y = p[1]; me.z = p[2];
  me.vx = me.vy = me.vz = 0;
  me.mode = 'ground';
  me.crouch = false; me.h = S.PLAYER_H; me.slideT = 0; me.climb = null;
}

// ================================================================ sieć
// host: symulacja w Web Workerze u siebie; gość: połączenie WebRTC z przeglądarką hosta (net.js).
// Sesja sama wraca po zerwaniu łącza i przenosi pokój do innego gracza, gdy host wyjdzie.
let session = null;
const net = { send(o) { if (session) session.send(JSON.stringify(o)); } };
const recv = (data) => { try { onMsg(JSON.parse(data)); } catch (err) { console.error(err); } };
let lastInvKey = '';

function setBanner(text) {
  $('netBanner').textContent = text || '';
  $('netBanner').classList.toggle('hidden', !text);
}

function connFailed(text) {
  setBanner(null);
  session = null;
  if (!gm) { // jeszcze w menu
    $('connStatus').textContent = text;
    $('playBtn').disabled = false; $('joinBtn').disabled = false;
    return;
  }
  if (document.pointerLockElement) document.exitPointerLock();
  if (TOUCH && locked) setLocked(false);
  $('menu').classList.remove('hidden');
  $('joinBox').classList.remove('hidden');
  $('lobbyBox').classList.add('hidden');
  $('joinCard').classList.add('hidden');
  $('connStatus').textContent = `${text} Refresh the page to play again.`;
}

function connect(name, code) {
  session = startSession({
    code, name,
    onMsg: recv,
    onReady({ code: c }) {
      G.room = c;
      // adres z kodem pokoju: po odświeżeniu strony wracasz do gry
      try { history.replaceState(null, '', `${location.pathname}?room=${c}`); sessionStorage.setItem('fortjede-in', c); } catch { /* bez historii */ }
    },
    onStatus(text) {
      if (!gm) { $('connStatus').textContent = text || ''; return; }
      setBanner(text);
    },
    onRole(owner) {
      G.roomOwner = owner;
      if (owner && gm) { G.killMsg = 'You are now hosting the room'; G.killMsgT = 3; }
      renderPlayersList();
    },
    onFail: connFailed,
  });
}

function renderRoomInfo() {
  if (!G.room) return;
  $('roomInfo').classList.remove('hidden');
  $('roomCodeOut').textContent = G.room;
  $('roomLink').value = inviteLink(G.room);
}
const canShare = TOUCH && !!navigator.share;
if (canShare) $('copyLinkBtn').textContent = 'Share link';
$('copyLinkBtn').onclick = () => {
  if (canShare) { navigator.share({ title: 'Fortjede', text: `Join my Fortjede room ${G.room}`, url: $('roomLink').value }).catch(() => {}); return; }
  const done = () => { $('copyLinkBtn').textContent = 'Copied!'; setTimeout(() => { $('copyLinkBtn').textContent = 'Copy link'; }, 1500); };
  const t = $('roomLink');
  if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(done, () => { t.select(); });
  else { t.select(); document.execCommand('copy'); done(); }
};
$('roomLink').onfocus = (e) => e.target.select();

function onMsg(m) {
  switch (m.t) {
    case 'welcome': {
      // ponowne powitanie (powrót po zerwaniu łącza albo nowy host): świat już stoi, odświeżamy tylko stan
      const again = !!gm;
      if (again && gm.seed !== m.map.seed) { location.reload(); return; }
      G.myId = m.id;
      if (!again) {
        gm = new S.GameMap(m.map.seed, m.map);
        buildWorld();
        buildMapImage();
        meAv = createAvatar(m.id, '', false);
        meAv.tag.visible = false;
        scene.add(meAv.root);
      } else resetObjs();
      for (const o of [...gm.boxes, ...gm.cyls]) o.dead = false;
      for (const k of m.destroyed || []) setObjVisible(k, false);
      G.state = m.gs; G.bus = m.bus;
      if (m.settings) G.settings = m.settings;
      renderSettings();
      setLoot(m.loot, m.opened);
      if (m.cards) setCards(m.cards);
      lastInvKey = ''; // wyślij hostowi aktualny ekwipunek
      const r = m.me;
      if (r && again && r.alive === !G.dead) {
        // ta sama strona po krótkiej przerwie: lokalny stan (pozycja, ekwipunek) jest świeższy niż u hosta
      } else if (r) {
        G.inv = r.inv.map((it) => it && { ...it }); G.sel = 0; hotbarDirty = true;
        resetWeaponState();
        if (r.alive) {
          placeMe(r.p);
          me.ry = r.ry;
          me.mode = r.mode === 'dead' ? 'ground' : r.mode;
          G.dead = false; G.spectating = false; G.deadInfo = null;
        } else {
          G.dead = true; me.mode = 'dead';
          G.deadInfo = { place: r.place, canReboot: r.canReboot, lobby: !r.inMatch };
          G.spectating = r.inMatch; G.specId = null;
        }
      } else if (m.spawn) { placeMe(m.spawn); G.dead = false; G.spectating = false; }
      else { G.dead = true; G.spectating = true; me.mode = 'dead'; }
      $('joinBox').classList.add('hidden');
      $('lobbyBox').classList.remove('hidden');
      $('hud').classList.remove('hidden');
      renderRoomInfo();
      $('connStatus').textContent = '';
      break;
    }
    case 'roster': {
      G.roster = new Map(m.list.map((p) => [p.id, p]));
      G.myTeam = (G.roster.get(G.myId) || {}).team || 0;
      G.hostId = m.host;
      G.teams = new Map((m.teams || []).map((t) => [t.id, t]));
      for (const o of G.others.values()) refreshTag(o);
      renderPlayersList();
      break;
    }
    case 's': {
      const [hp, sh, k] = m.me;
      G.hp = hp; G.sh = sh; G.kills = k;
      const c = m.c;
      if (c.gs !== G.state) { G.state = c.gs; renderPlayersList(); }
      G.alive = c.a; G.storm = c.st; G.cd = c.cd;
      if (c.bt != null) G.busTarget = c.bt;
      const seen = new Set();
      const nowMs = performance.now();
      for (const e of c.ps) {
        const [id, x, y, z, ry, rx, md, w, alv, mv, cr, ohp, osh] = e;
        if (id === G.myId) continue;
        seen.add(id);
        const o = getOther(id);
        o.seen = nowMs;
        o.tgt.set(x, y, z); o.tRy = ry; o.rx = rx; o.mode = md; o.w = w || 'pickaxe'; o.alive = !!alv; o.mv = !!mv; o.cr = !!cr; o.hp = ohp; o.sh = osh;
        if (o.fresh || o.cur.distanceToSquared(o.tgt) > 400) { o.cur.copy(o.tgt); o.ry = ry; o.fresh = false; }
      }
      // dalekie postacie przychodzą rzadziej — usuwaj dopiero po dłuższej ciszy
      for (const [id, o] of [...G.others]) if (!seen.has(id) && nowMs - (o.seen || 0) > 2000) removeOther(id);
      break;
    }
    case 'matchstart': {
      G.bus = m.bus; G.busT = G.busTarget = 0;
      G.inv = [null, null, null, null, null]; G.sel = 0; hotbarDirty = true;
      G.dead = false; G.spectating = false; G.deadInfo = null; G.endInfo = null; G.specId = null;
      G.cards.clear(); G.rebootT = 0;
      for (const mesh of cardMeshes.values()) scene.remove(mesh);
      cardMeshes.clear();
      me.mode = 'bus'; me.vx = me.vy = me.vz = 0;
      resetWeaponState();
      FX.beep(440, 0.3, 'triangle', 0.15); FX.beep(660, 0.4, 'triangle', 0.15, 0.25);
      break;
    }
    case 'eject': if (me.mode === 'bus') jumpFromBus(); break;
    case 'lootreset': setLoot(m.loot, m.opened); break;
    case 'loot+': for (const l of m.items) addLoot(l); break;
    case 'loot-': removeLoot(m.id); break;
    case 'chest': {
      G.opened.add(m.id);
      const cm = chestMeshes[m.id];
      if (cm) {
        cm.visible = false;
        if (Math.hypot(cm.position.x - me.x, cm.position.z - me.z) < 30) {
          sndChest();
          FX.sparks(cm.position.clone().setY(cm.position.y + 0.6), 0xffd24a, 30, 5, 1.2);
        }
      }
      break;
    }
    case 'got': addItem(m.item); sndPickup(); toast(m.item); break;
    case 'shot': {
      const e = V(m.e);
      const other = G.others.get(m.id);
      const vis = other && other.av.root.visible;
      const from = vis ? muzzleOf(other.av) : V(m.o);
      const dist = from.distanceTo(camera.position);
      if (m.w === 'pickaxe') { if (other) other.av.swing = 0.3; }
      else {
        if (vis) {
          other.av.kick = 1;
          if (m.w === 'shotgun') other.av.pumpT = 0.65;
          FX.muzzleFlash(from, m.w === 'shotgun' || m.w === 'sniper' ? 0.9 : 0.55);
        }
        FX.tracer(from, e, m.w === 'sniper' ? { width: 0.07, seg: 14, speed: 600, trail: true } : {});
        FX.sparks(e, 0xffc070, 4, 5);
      }
      FX.playShot(m.w, dist, false);
      break;
    }
    case 'hitm': {
      spawnDmgNum(m.p, m.dmg, m.kill ? 'kill' : m.head ? 'head' : m.sh ? 'sh' : '');
      showHitmarker(m.kill ? 'kill' : m.head ? 'head' : '');
      FX.sndHit(m.head, m.sh);
      if (m.kill) setTimeout(FX.sndKill, 60);
      break;
    }
    case 'dmg': {
      const vg = $('vignette');
      vg.classList.add('on');
      clearTimeout(vg._t); vg._t = setTimeout(() => vg.classList.remove('on'), 120);
      if (m.from) { FX.sndHurt(); RC.shake = Math.min(1.5, RC.shake + 0.35); }
      break;
    }
    case 'kill': { addKillfeed(m); const o = G.others.get(m.vid); if (o) o.alive = false; break; }
    case 'objhp': {
      const o = S.objByKey(gm, m.k);
      if (!o) break;
      if (m.k === G.lastObj && performance.now() - G.lastObjAt < 2000) {
        G.objHpShow = { name: S.OBJ_NAME[o.k], hp: m.hp, max: m.max }; G.lastObjT = 1.8;
      }
      if (!(m.k === G.lastObj && performance.now() - G.lastObjAt < 400)) {
        const d = objCenter(o).distanceTo(camera.position);
        if (d < 50) FX.sndImpact(objMat(o), 1 / (1 + d / 10));
      }
      break;
    }
    case 'objdel': destroyObj(m.k); break;
    case 'objreset': resetObjs(); break;
    case 'dead': {
      G.dead = true; G.deadInfo = m; me.mode = 'dead';
      for (const it of G.inv) if (it) dropItem(it, true);
      G.inv = [null, null, null, null, null]; hotbarDirty = true;
      resetWeaponState();
      if (!m.lobby) {
        G.spectating = true;
        const mate = [...G.others.values()].find((o) => o.alive && isMate(o.id));
        G.specId = mate ? mate.id : m.by;
      }
      cancelReboot();
      break;
    }
    case 'teamout': {
      if (G.deadInfo) { G.deadInfo.place = m.place; G.deadInfo.canReboot = false; }
      break;
    }
    case 'cardlost': {
      if (G.deadInfo) G.deadInfo.canReboot = false;
      G.killMsg = 'Your reboot card expired'; G.killMsgT = 3;
      break;
    }
    case 'cards': setCards(m); break;
    case 'settings': G.settings = m.s; renderSettings(); break;
    case 'rebooted': {
      G.dead = false; G.spectating = false; G.deadInfo = null; G.specId = null;
      placeMe(m.p);
      me.mode = 'sky';
      G.killMsg = `${m.by} rebooted you!`; G.killMsgT = 3;
      [523, 784, 1046].forEach((f, i) => FX.beep(f, 0.18, 'triangle', 0.15, i * 0.1));
      break;
    }
    case 'rebootmsg': {
      addKillfeed({ custom: `♻ ${m.by} rebooted ${m.names.join(', ')}` });
      if (m.by === nameOf(G.myId)) { cancelReboot(); FX.beep(880, 0.2, 'triangle', 0.15); FX.beep(1320, 0.25, 'triangle', 0.15, 0.12); }
      break;
    }
    case 'respawn':
    case 'lobby': {
      placeMe(m.p);
      G.dead = false; G.spectating = false; G.deadInfo = null; G.specId = null;
      if (m.t === 'lobby') { G.endInfo = null; G.bus = null; G.inv = [null, null, null, null, null]; G.sel = 0; hotbarDirty = true; }
      break;
    }
    case 'replaced': { // ta sama postać weszła z innej karty
      if (session) session.stop();
      connFailed('You joined this room from another tab.');
      break;
    }
    case 'end': {
      G.endInfo = m;
      if ((m.wids || []).includes(G.myId)) sndWin();
      break;
    }
  }
}

function showHitmarker(kind) {
  const hm = $('hitmarker');
  hm.className = '';
  void hm.offsetWidth; // restart animacji
  hm.className = 'on' + (kind ? ' ' + kind : '');
}

function addKillfeed(m) {
  let html;
  if (m.custom) {
    const el = document.createElement('div');
    el.textContent = m.custom; el.className = 'me';
    $('killfeed').prepend(el);
    setTimeout(() => el.remove(), 7000);
    return;
  }
  const icon = WEAPONS[m.w] || m.w === 'pickaxe' ? `<img src="${FX.itemIcon(m.w, 0)}">` : '';
  if (m.w === 'quit') html = `${esc(m.v)} left the match`;
  else if (!m.k) html = m.w === 'storm' ? `🌀 ${esc(m.v)} was lost in the storm` : `${esc(m.v)} was eliminated`;
  else html = `${esc(m.k)} ${icon || '➜'} ${esc(m.v)}${m.head ? ' <span class="hs">✸ HEADSHOT</span>' : ''}`;
  const el = document.createElement('div');
  el.innerHTML = html;
  if (m.kid === G.myId || m.vid === G.myId) el.className = 'me';
  const kf = $('killfeed');
  kf.prepend(el);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => el.remove(), 7000);
  if (m.kid === G.myId && m.vid !== G.myId) { G.killMsg = `ELIMINATED ${m.v}`; G.killMsgT = 2.5; }
}

function toast(it) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--rc', S.itemColor(it) + '99');
  el.innerHTML = `<img src="${FX.itemIcon(it.type, it.rar || 0)}"><span style="color:${S.itemColor(it)}">+ ${esc(S.itemName(it))}</span>`;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

// ================================================================ ekwipunek
let ADS_MODE = 'toggle', SENS = 1;
try { ADS_MODE = localStorage.getItem('fortjede-ads') || 'toggle'; } catch { /* brak storage */ }
if (TOUCH) ADS_MODE = 'toggle'; // na ekranie AIM włącza i wyłącza celowanie
function resetWeaponState() {
  if (ADS_MODE === 'toggle') G.adsHeld = false; // zmiana broni kończy celowanie
  G.reloadT = 0; G.reloading = false; G.useT = 0;
  G.fireCd = Math.max(G.fireCd, 0.25);
  G.dryClicked = false;
}
function showEquipName() {
  const it = curItem();
  const el = $('equipName');
  el.textContent = it ? (it.k === 'w' ? WEAPONS[it.type].name : CONSUMABLES[it.type].name) : PICKAXE.name;
  el.style.color = S.itemColor(it);
  el.className = '';
  void el.offsetWidth;
  el.className = 'on';
}
function dropCurrent() {
  if (!curItem() || G.dead) return;
  dropItem(curItem()); G.inv[G.sel] = null; resetWeaponState(); hotbarDirty = true;
}
function selectSlot(i) {
  if (i === G.sel) return;
  G.sel = i; resetWeaponState(); hotbarDirty = true;
  FX.sndEquip();
  showEquipName();
}
function dropItem(it, scatter) {
  const a = scatter ? Math.random() * Math.PI * 2 : me.ry;
  const d = scatter ? 0.6 + Math.random() * 1.2 : 1.3;
  net.send({ t: 'drop', item: it, p: [r2(me.x - Math.sin(a) * d), r2(me.y), r2(me.z - Math.cos(a) * d)] });
}
function addItem(item) {
  if (item.k === 'c') {
    const C = CONSUMABLES[item.type];
    for (const s of G.inv) {
      if (s && s.k === 'c' && s.type === item.type && s.n < C.max) {
        const add = Math.min(C.max - s.n, item.n);
        s.n += add; item.n -= add;
        if (item.n <= 0) { hotbarDirty = true; return; }
      }
    }
  }
  const empty = G.inv.indexOf(null);
  if (empty >= 0) {
    G.inv[empty] = item;
    if (empty === G.sel) { resetWeaponState(); showEquipName(); }
  } else {
    dropItem(G.inv[G.sel]);
    G.inv[G.sel] = item;
    resetWeaponState();
    showEquipName();
  }
  hotbarDirty = true;
}
function startReload() {
  const it = curItem();
  if (!it || it.k !== 'w' || G.reloading || G.dead) return;
  const W = WEAPONS[it.type];
  if (it.ammo >= W.mag) return;
  if (ADS_MODE === 'toggle') G.adsHeld = false;
  G.reloading = true;
  G.reloadT = W.reload;
  FX.sndReloadStart();
}

function nearReboot() { return gm && Math.hypot(gm.reboot.x - me.x, gm.reboot.z - me.z) < S.REBOOT_R; }
function startReboot() {
  if (performance.now() < G.rebootReadyAt || !carrying().length) return;
  G.rebootT = 0.0001;
  net.send({ t: 'reboot', on: true });
}
function cancelReboot() {
  if (G.rebootT > 0) net.send({ t: 'reboot', on: false });
  G.rebootT = 0;
}
function findInteract() {
  if (G.dead || me.mode !== 'ground') return null;
  if (carrying().length && nearReboot()) return { kind: 'reboot' };
  let best = null, bd = 2.4;
  for (const c of G.cards.values()) {
    if (c.carrier || !cardMeshes.has(c.owner) || c.owner === G.myId) continue;
    const d = Math.hypot(c.x - me.x, c.z - me.z);
    if (d < bd + 0.6 && Math.abs(c.y - me.y) < 2) { bd = d; best = { kind: 'card', c }; }
  }
  for (const l of G.loot.values()) {
    const d = Math.hypot(l.x - me.x, l.z - me.z);
    if (d < bd && Math.abs(l.y - me.y) < 2) { bd = d; best = { kind: 'loot', l }; }
  }
  for (const c of gm.chests) {
    if (G.opened.has(c.id)) continue;
    const d = Math.hypot(c.x - me.x, c.z - me.z);
    if (d < bd && Math.abs(c.y - me.y) < 2) { bd = d; best = { kind: 'chest', c }; }
  }
  return best;
}
function interact() {
  const it = findInteract();
  if (!it) return;
  if (it.kind === 'reboot') startReboot();
  else if (it.kind === 'card') net.send({ t: 'cardpick', owner: it.c.owner });
  else if (it.kind === 'loot') net.send({ t: 'pickup', id: it.l.id });
  else net.send({ t: 'chest', id: it.c.id });
}

// ================================================================ wejście
const keys = {};
let locked = false, jumpQueued = false;

// „locked” = trwa gra (menu schowane). Na komputerze to przechwycona mysz, na telefonie po prostu tryb gry.
function setLocked(v) {
  locked = v;
  document.body.classList.toggle('playing', v);
  $('menu').classList.toggle('hidden', v);
  if (!v) { releaseTouch(); G.mouseDown = false; G.adsHeld = false; renderPlayersList(); }
}
function lock() {
  if (!G.myId) return;
  FX.ac();
  if (document.activeElement) document.activeElement.blur();
  if (TOUCH) {
    setLocked(true);
    // Android: pełny ekran i poziomo; iPhone tego nie umie (tam pełny ekran daje „Do ekranu początkowego”)
    const de = document.documentElement, fs = de.requestFullscreen || de.webkitRequestFullscreen;
    try {
      const p = !document.fullscreenElement && fs && fs.call(de);
      if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}), () => {});
    } catch { /* bez pełnego ekranu */ }
    return;
  }
  try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
}
document.addEventListener('pointerlockchange', () => { if (!TOUCH) setLocked(document.pointerLockElement === renderer.domElement); });
// telefon: wyjście z aplikacji / blokada ekranu = pauza (żadne palce nie zostają „wciśnięte”)
document.addEventListener('visibilitychange', () => { if (TOUCH && document.hidden && locked) setLocked(false); });
renderer.domElement.addEventListener('click', () => { if (!locked) lock(); });

addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (!locked) return;
  if (e.code === 'Space') { e.preventDefault(); onSpace(); }
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) selectSlot(n - 1); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyC') onCrouchKey();
  if (e.code === 'KeyE' && !e.repeat) interact();
  if (e.code === 'KeyQ') dropCurrent();
  if (e.code === 'KeyM') $('fullmap').classList.toggle('hidden');
  if (e.code === 'Tab') { e.preventDefault(); renderScoreboard(); $('scoreboard').classList.remove('hidden'); }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'KeyE') cancelReboot();
  if (e.code === 'Tab') { e.preventDefault(); $('scoreboard').classList.add('hidden'); }
});
addEventListener('mousedown', (e) => {
  if (!locked || TOUCH) return; // na telefonie iOS dorabia mousedown po każdym stuknięciu
  if (e.button === 0) {
    G.mouseDown = true;
    if (G.spectating) nextSpec();
  }
  if (e.button === 2) G.adsHeld = ADS_MODE === 'hold' ? true : !G.adsHeld;
});
addEventListener('mouseup', (e) => {
  if (TOUCH) return;
  if (e.button === 0) { G.mouseDown = false; G.dryClicked = false; }
  if (e.button === 2 && ADS_MODE === 'hold') G.adsHeld = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => {
  if (!locked || G.dead || TOUCH) return;
  selectSlot((G.sel + (e.deltaY > 0 ? 1 : -1) + 5) % 5);
});
function lookBy(dx, dy, base) {
  const W = curWeapon();
  const zoomK = G.ads && W ? (W.scope ? 0.3 : 0.65) : 1;
  const sens = base * zoomK * SENS;
  me.ry -= dx * sens;
  me.rx = clamp(me.rx - dy * sens, -1.45, 1.45);
}
addEventListener('mousemove', (e) => {
  if (!locked || TOUCH) return;
  lookBy(e.movementX, e.movementY, 0.0022);
});

// ================================================================ sterowanie dotykiem
// lewy kciuk: pływający joystick (za obręczą = sprint); prawy: przeciąganie = rozglądanie;
// przyciski w #tctl. Wszystko na zdarzeniach pointer — każdy palec ma własny pointerId.
const JOY_R = 52;
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, sprint: false };
const looks = new Map(); // palce, które obracają kamerą: pointerId -> ostatnia pozycja
const tHeld = new Map(); // wciśnięte przyciski: pointerId -> co zrobić po puszczeniu
let fireN = 0;
function drawJoy() {
  const el = $('joy');
  if (!el) return;
  const on = joy.id != null;
  // w spoczynku miejsce wyznacza CSS (z marginesem na wcięcie ekranu), w ruchu — palec
  el.style.left = on ? `${joy.ox}px` : '';
  el.style.top = on ? `${joy.oy}px` : '';
  el.classList.toggle('on', on);
  el.classList.toggle('run', joy.sprint);
  el.firstChild.style.transform = `translate(${joy.x * JOY_R}px,${-joy.y * JOY_R}px)`;
}
function moveJoy(e) {
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
  let d = Math.hypot(dx, dy);
  const far = JOY_R * 1.7;
  if (d > far) { // baza jedzie za palcem, żeby nie trzeba było wracać kciukiem
    joy.ox += dx * (1 - far / d); joy.oy += dy * (1 - far / d);
    dx = e.clientX - joy.ox; dy = e.clientY - joy.oy; d = far;
  }
  joy.sprint = d > JOY_R * 1.3 && -dy > d * 0.6; // mocno do przodu, za obręcz
  const k = d < 6 ? 0 : Math.min(1, d / JOY_R) / d;
  joy.x = dx * k; joy.y = -dy * k;
  drawJoy();
}
function releaseTouch() {
  for (const up of tHeld.values()) if (up) up();
  tHeld.clear(); looks.clear(); fireN = 0;
  joy.id = null; joy.x = joy.y = 0; joy.sprint = false;
  drawJoy();
}
function press(id, down, up, look) {
  $(id).addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!locked || tHeld.has(e.pointerId)) return;
    down();
    tHeld.set(e.pointerId, up || null);
    if (look) looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
}
if (TOUCH) {
  const zone = $('tzone');
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!locked) return;
    if (e.clientX < VW * 0.42 && joy.id == null) { joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; moveJoy(e); }
    else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) moveJoy(e);
    const l = looks.get(e.pointerId);
    if (l) {
      if (locked) lookBy(e.clientX - l.x, e.clientY - l.y, 0.0048);
      l.x = e.clientX; l.y = e.clientY;
    }
  });
  const endPointer = (e) => {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joy.sprint = false; drawJoy(); }
    looks.delete(e.pointerId);
    if (tHeld.has(e.pointerId)) { const up = tHeld.get(e.pointerId); tHeld.delete(e.pointerId); if (up) up(); }
  };
  addEventListener('pointerup', endPointer);
  addEventListener('pointercancel', endPointer);
  // bez zaznaczania tekstu, lupy i przybliżania dwoma palcami w trakcie gry
  document.addEventListener('touchstart', (e) => { if (locked && !e.target.closest('#scoreboard')) e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  const fireDown = () => { fireN++; G.mouseDown = true; if (G.spectating) nextSpec(); };
  const fireUp = () => { fireN = Math.max(0, fireN - 1); if (!fireN) { G.mouseDown = false; G.dryClicked = false; } };
  press('tFire', fireDown, fireUp, true); // przeciąganie po przycisku strzału też celuje
  press('tFire2', fireDown, fireUp, false);
  press('tAim', () => { G.adsHeld = !G.adsHeld; });
  press('tJump', onSpace);
  press('tCrouch', onCrouchKey);
  press('tReload', startReload);
  press('tUse', () => { keys.KeyE = true; interact(); }, () => { keys.KeyE = false; cancelReboot(); });
  press('tDrop', dropCurrent);
  press('tPause', () => setLocked(false));

  $('hotbar').addEventListener('pointerdown', (e) => {
    const s = e.target.closest('.slot');
    if (!s || !locked || G.dead) return;
    e.preventDefault();
    selectSlot([...s.parentNode.children].indexOf(s));
  });
  $('minimap').addEventListener('pointerdown', () => { if (locked) $('fullmap').classList.toggle('hidden'); });
  $('fullmap').addEventListener('pointerdown', () => $('fullmap').classList.add('hidden'));
  $('counters').addEventListener('pointerdown', () => { if (!locked) return; renderScoreboard(); $('scoreboard').classList.toggle('hidden'); });
  $('scoreboard').addEventListener('click', () => $('scoreboard').classList.add('hidden'));
  drawJoy();
}

function onSpace() {
  if (G.dead) return;
  if (me.mode === 'bus') jumpFromBus();
  else if (me.mode === 'sky') me.mode = 'glide';
  else jumpQueued = true;
}
function jumpFromBus() {
  if (!G.bus) return;
  const p = S.busPos(G.bus, clamp(G.busT, 0, 1));
  me.x = p.x; me.y = p.y - 4; me.z = p.z;
  me.vx = me.vz = 0; me.vy = 0;
  me.mode = 'sky';
  me.crouch = false; me.h = S.PLAYER_H; me.slideT = 0; me.climb = null;
  net.send({ t: 'jump' });
  FX.beep(300, 0.25, 'sine', 0.1);
}

function nextSpec() {
  const list = [...G.others.values()].filter((o) => o.alive && o.mode !== 3 && o.mode !== 4);
  if (!list.length) { G.specId = null; return; }
  const i = list.findIndex((o) => o.id === G.specId);
  G.specId = list[(i + 1) % list.length].id;
}
function specTarget() {
  let o = G.specId != null ? G.others.get(G.specId) : null;
  if (!o || !o.alive || o.mode === 4) {
    const alive = [...G.others.values()].filter((x) => x.alive && x.mode !== 4);
    o = alive.find((x) => isMate(x.id)) || alive[0] || null;
    G.specId = o ? o.id : null;
  }
  return o;
}

// ================================================================ fizyka gracza
function setCrouch(on) {
  if (on === me.crouch) return true;
  if (!on && !S.spaceFree(gm, { x: me.x, y: me.y + 0.02, z: me.z }, S.PLAYER_H)) return false; // nad głową przeszkoda
  me.crouch = on;
  me.h = on ? S.CROUCH_H : S.PLAYER_H;
  if (!on) me.slideT = 0;
  return true;
}
function onCrouchKey() {
  if (G.dead || me.mode !== 'ground') return;
  const sp = Math.hypot(me.vx, me.vz);
  if (!me.crouch && me.onGround && sp > 7.5) { // ślizg z biegu
    me.crouch = true; me.h = S.CROUCH_H; me.slideT = 0.85;
    const k = Math.max(sp, 11.5) / sp;
    me.vx *= k; me.vz *= k;
    FX.sndSlide();
    FX.puff(new THREE.Vector3(me.x, me.y + 0.15, me.z), 0xd8cfc0, 0.9, 0.6);
  } else setCrouch(!me.crouch);
}
function ledgeAhead(dx, dz, minUp, maxUp) {
  return S.findLedge(gm, me, dx, dz, minUp, maxUp);
}
function startClimb(l) {
  me.climb = { t: 0, dur: 0.22 + Math.max(0, l.y - me.y) * 0.13, x0: me.x, y0: me.y, z0: me.z, x1: l.x, y1: l.y, z1: l.z };
  me.mode = 'climb';
  me.vx = me.vz = me.vy = 0; me.slideT = 0;
  if (l.crouch) { me.crouch = true; me.h = S.CROUCH_H; }
  else setCrouch(false);
  FX.sndClimb();
}

function physics(dt) {
  if (me.mode === 'dead') return;
  if (me.mode === 'bus') {
    if (!G.bus) { me.mode = 'ground'; return; }
    const p = S.busPos(G.bus, clamp(G.busT, 0, 1));
    me.x = p.x; me.y = p.y - 3; me.z = p.z;
    return;
  }
  if (me.mode === 'climb') { // podciąganie: najpierw w górę, potem nad krawędź
    const c = me.climb;
    c.t += dt / c.dur;
    const t = Math.min(1, c.t);
    const up = 1 - (1 - Math.min(1, t / 0.65)) ** 2;
    const fw = t < 0.4 ? 0 : (t - 0.4) / 0.6, fs = fw * fw * (3 - 2 * fw);
    me.x = c.x0 + (c.x1 - c.x0) * fs; me.z = c.z0 + (c.z1 - c.z0) * fs;
    me.y = c.y0 + (c.y1 + 0.05 - c.y0) * up;
    if (t >= 1) {
      me.mode = 'ground'; me.climb = null; me.vy = 0; me.onGround = false;
      const dx = c.x1 - c.x0, dz = c.z1 - c.z0, dl = Math.hypot(dx, dz) || 1;
      me.vx = (dx / dl) * 2.5; me.vz = (dz / dl) * 2.5;
    }
    jumpQueued = false;
    return;
  }
  let ix = 0, iz = 0;
  if (locked) { // klawisze albo joystick (analogowo: lekkie wychylenie = wolny chód)
    ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
    iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + joy.y;
  }
  const sprintIn = !!keys.ShiftLeft || joy.sprint;
  const fx = -Math.sin(me.ry), fz = -Math.cos(me.ry);
  const rxv = Math.cos(me.ry), rzv = -Math.sin(me.ry);
  let wx = fx * iz + rxv * ix, wz = fz * iz + rzv * ix;
  let wl = Math.hypot(wx, wz);
  if (wl > 1) { wx /= wl; wz /= wl; wl = 1; }

  const n = Math.max(1, Math.ceil(dt / (1 / 90)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const prevY = me.y;
    if (me.mode === 'sky') {
      const sp = 22;
      me.vx += (wx * sp - me.vx) * Math.min(1, 2 * h);
      me.vz += (wz * sp - me.vz) * Math.min(1, 2 * h);
      me.vy = -28 - Math.max(0, -me.rx) * 14;
    } else if (me.mode === 'glide') {
      const sp = 13 + (iz > 0 ? 2 : 0);
      me.vx += (wx * sp - me.vx) * Math.min(1, 2.5 * h);
      me.vz += (wz * sp - me.vz) * Math.min(1, 2.5 * h);
      me.vy = -7 - (iz > 0 ? 1.5 : 0);
    } else {
      if (sprintIn && iz > 0.3 && ADS_MODE === 'toggle' && G.adsHeld) G.adsHeld = false; // sprint kończy celowanie
      const sprintKey = sprintIn && iz > 0.3 && !G.ads && G.useT === 0;
      if (sprintKey && me.crouch && me.slideT <= 0) setCrouch(false); // sprint podnosi z kucania
      const sprint = sprintKey && !me.crouch;
      if (me.slideT > 0) {
        // ślizg: pęd wygasa, z górki przyspiesza, lekkie skręcanie
        me.slideT -= h;
        let sp = Math.hypot(me.vx, me.vz) || 0.001;
        const ux = me.vx / sp, uz = me.vz / sp;
        const dh = gm.height(me.x + ux * 0.6, me.z + uz * 0.6) - gm.height(me.x, me.z);
        let acc = -6.5;
        if (dh < -0.03) { acc += Math.min(14, (-dh / 0.6) * 22); me.slideT = Math.max(me.slideT, 0.12); }
        sp = clamp(sp + acc * h, 0, 16);
        let ang = Math.atan2(ux, uz);
        if (wl > 0) {
          let d = Math.atan2(wx, wz) - ang;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          ang += clamp(d, -1.3 * h, 1.3 * h);
        }
        me.vx = Math.sin(ang) * sp; me.vz = Math.cos(ang) * sp;
        if (sp < 3.4) me.slideT = 0;
        if (jumpQueued && me.onGround) { me.slideT = 0; setCrouch(false); me.vy = S.JUMP_V; me.onGround = false; }
      } else {
        let sp = G.ads ? 3.6 : sprint ? 8.6 : 6.2;
        if (me.crouch) sp = G.ads ? 2.4 : 3.3;
        if (G.useT > 0) sp = 2.6;
        const accel = me.onGround ? 14 : 3;
        me.vx += (wx * sp - me.vx) * Math.min(1, accel * h);
        me.vz += (wz * sp - me.vz) * Math.min(1, accel * h);
        if (jumpQueued && me.onGround) {
          const dx = wl > 0 ? wx / wl : fx, dz = wl > 0 ? wz / wl : fz;
          const l = ledgeAhead(dx, dz, 0.6, 1.6); // przeskok przez niską przeszkodę
          if (l) { startClimb(l); jumpQueued = false; return; }
          if (!me.crouch || setCrouch(false)) { me.vy = S.JUMP_V; me.onGround = false; }
        }
      }
      me.vy -= S.GRAVITY * h;
      // w powietrzu z wciśniętym W przy krawędzi -> podciągnij się
      if (!me.onGround && iz > 0.3 && me.vy < 5) {
        const l = ledgeAhead(fx, fz, 0.3, 2.7);
        if (l) { startClimb(l); jumpQueued = false; return; }
      }
    }
    me.x += me.vx * h; me.y += me.vy * h; me.z += me.vz * h;
    S.ceilingClamp(gm, me, prevY);
    S.collideCharacter(gm, me);
    const g = S.groundAt(gm, me.x, me.z, me.y);
    if (me.mode === 'sky' && me.y - g < 32) me.mode = 'glide';
    if (me.y <= g) {
      me.y = g; me.vy = 0; me.onGround = true;
      if (me.mode !== 'ground') { me.mode = 'ground'; me.vx *= 0.3; me.vz *= 0.3; FX.puff(new THREE.Vector3(me.x, me.y + 0.2, me.z), 0xd8cfc0, 1.4, 0.9); }
    } else if (me.mode === 'ground' && me.onGround && me.vy <= 0 && me.y - g < 0.45) {
      me.y = g; me.vy = 0;
    } else me.onGround = false;
  }
  if (me.slideT > 0 && Math.random() < dt * 25) FX.puff(new THREE.Vector3(me.x, me.y + 0.1, me.z), 0xd8cfc0, 0.5, 0.5);
  jumpQueued = false;
}

// ================================================================ strzelanie
const _fwd = new THREE.Vector3();
let camDistNow = 3;
function computeAim() {
  const fwd = _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const start = camera.position.clone().addScaledVector(fwd, camDistNow);
  let t = S.raycastMap(gm, start, fwd, 600);
  for (const o of G.others.values()) {
    if (!targetable(o)) continue;
    const h = S.rayPlayer(start, fwd, o.cur, t, o.cr);
    if (h) t = h.t;
  }
  return start.addScaledVector(fwd, t);
}

// rozrzut (rad) — ten sam liczony dla strzału i dla celownika
function currentSpread(W) {
  if (!W || W.melee) return 0;
  let s = G.ads ? W.ads : W.spread;
  if (!(G.ads && W.scope)) s += G.bloom;
  const moving = Math.hypot(me.vx, me.vz) > 1;
  if (!me.onGround) s *= 1.6;
  else if (moving) s *= 1.25;
  if (W.firstShot && !moving && me.onGround && G.sinceShot > 0.35) s *= 0.3;
  if (me.crouch && me.slideT <= 0 && me.onGround) s *= 0.7; // kucanie = celniej
  return s;
}

function fire(it, W) {
  const eye = new THREE.Vector3(me.x, me.y + me.eyeH - 0.1, me.z);
  const aim = computeAim();
  const base = aim.clone().sub(eye);
  if (base.lengthSq() < 0.25) base.set(0, 0, -1).applyQuaternion(camera.quaternion);
  base.normalize();
  const spread = currentSpread(W);
  const up = Math.abs(base.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(base, up).normalize();
  const v = new THREE.Vector3().crossVectors(u, base);
  const muzzle = muzzleOf(meAv);
  const hits = new Map(), objs = {};
  let firstEnd = null, objHit = null;
  const type = it ? it.type : 'pickaxe';
  for (let i = 0; i < W.pellets; i++) {
    let a, r;
    if (W.pellets > 1) { // stały wzór śrutu: środek + dwa pierścienie
      a = i === 0 ? 0 : (i / (W.pellets - 1)) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      r = i === 0 ? 0 : spread * (i % 2 ? 0.5 : 1) * (0.85 + Math.random() * 0.3);
    } else {
      a = Math.random() * Math.PI * 2; r = Math.sqrt(Math.random()) * spread;
    }
    const d = base.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
    const wh = S.raycastMapHit(gm, eye, d, W.range);
    const wt = wh.t;
    let best = null;
    for (const o of G.others.values()) {
      if (!targetable(o)) continue;
      const hh = S.rayPlayer(eye, d, o.cur, wt, o.cr);
      if (hh && (!best || hh.t < best.t)) best = { o, t: hh.t, head: hh.head };
    }
    const t = best ? best.t : wt;
    const end = eye.clone().addScaledVector(d, t);
    if (!firstEnd) firstEnd = end;
    if (best) {
      let dmg = W.dmg * (it ? RARITIES[it.rar].mult : 1) * (best.head ? W.head : 1);
      if (W.falloff) dmg *= clamp(1 - (best.t - W.falloff[0]) / W.falloff[1], 0.35, 1);
      const hr = hits.get(best.o.id) || { id: best.o.id, dmg: 0, head: false };
      hr.dmg += dmg; hr.head = hr.head || best.head;
      hits.set(best.o.id, hr);
      FX.sparks(end, best.head ? 0xffe066 : 0xffffff, W.pellets > 1 ? 3 : 8, 5);
    } else if (wt < W.range) {
      const o = wh.obj && S.objByKey(gm, wh.obj);
      if (o && S.OBJ_HP[o.k]) { objs[wh.obj] = (objs[wh.obj] || 0) + 1; objHit = o; G.lastObj = wh.obj; G.lastObjAt = performance.now(); }
      FX.sparks(end, W.melee ? (o && objMat(o) === 'stone' ? 0xdddddd : 0xc8a070) : 0xffb050, W.melee ? 12 : W.pellets > 1 ? 3 : 7, 6);
      FX.puff(end, 0xd8cfc0, W.pellets > 1 ? 0.25 : type === 'sniper' ? 0.7 : 0.4, 0.55);
    }
    if (!W.melee) FX.tracer(muzzle, end, type === 'sniper' ? { width: 0.07, seg: 14, speed: 600, trail: true } : W.pellets > 1 ? { width: 0.03, seg: 3, speed: 260 } : {});
  }
  net.send({
    t: 'shoot', o: [r2(eye.x), r2(eye.y), r2(eye.z)], e: [r2(firstEnd.x), r2(firstEnd.y), r2(firstEnd.z)],
    w: type, hits: [...hits.values()].map((h) => ({ id: h.id, dmg: Math.round(h.dmg), head: h.head })),
    objs: Object.entries(objs).map(([k, n]) => ({ k, n })),
  });
  if (objHit && W.melee) { FX.sndImpact(objMat(objHit)); RC.shake = Math.min(1.5, RC.shake + 0.4); }
  FX.playShot(type, 0, true);
  if (!W.melee) {
    FX.muzzleFlash(muzzle, type === 'shotgun' || type === 'sniper' ? 1.0 : type === 'smg' ? 0.45 : 0.6);
    FX.puff(muzzle, 0xbbbbbb, 0.25, 0.35);
    flash.position.copy(muzzle); flash.intensity = type === 'shotgun' || type === 'sniper' ? 60 : 35;
    meAv.kick = 1;
    if (type === 'shotgun') meAv.pumpT = 0.65;
  } else meAv.swing = 0.3;
  // odrzut: kamera podskakuje i wraca, część (climb) zostaje do ściągnięcia myszką
  const adsK = G.ads ? 0.65 : 1;
  RC.tp = Math.min(0.14, RC.tp + W.kick * adsK);
  RC.ty += (Math.random() - 0.5) * 2 * W.kickYaw * adsK;
  if (W.climb) me.rx = clamp(me.rx + W.kick * W.climb * adsK, -1.45, 1.45);
  RC.shake = Math.min(1.5, RC.shake + W.shake);
  if (type === 'shotgun' || type === 'sniper') RC.fov += 3;
  G.bloom = Math.min(0.08, G.bloom + W.bloom);
  G.sinceShot = 0;
}

function weaponUpdate(dt) {
  G.fireCd -= dt;
  G.sinceShot += dt;
  G.bloom = Math.max(0, G.bloom - dt * (G.sinceShot > 0.25 ? 0.12 : 0.03));
  const it = curItem();
  if (G.reloading) {
    G.reloadT -= dt;
    if (G.reloadT <= 0) {
      if (it && it.k === 'w') {
        const W = WEAPONS[it.type];
        if (W.shell) {
          it.ammo++;
          FX.sndShell();
          if (it.ammo < W.mag) G.reloadT = W.reload; else { G.reloading = false; FX.click(900, 0.3, 0.05, 0.04); }
        } else { it.ammo = W.mag; G.reloading = false; FX.sndReloadEnd(); }
        hotbarDirty = true;
      } else G.reloading = false;
    }
  }
  meAv.reloading = G.reloading;
  if (G.dead || me.mode !== 'ground' || !locked) { G.useT = 0; if (!locked) G.firedThisPress = false; return; }
  if (it && it.k === 'c') {
    if (G.mouseDown && G.useT === 0 && S.canUse(it.type, G.hp, G.sh)) G.useT = 0.0001;
    if (G.useT > 0) {
      G.useT += dt;
      if (!S.canUse(it.type, G.hp, G.sh)) G.useT = 0;
      else if (G.useT >= CONSUMABLES[it.type].time) {
        net.send({ t: 'use', type: it.type });
        it.n--;
        if (it.n <= 0) G.inv[G.sel] = null;
        G.useT = 0; hotbarDirty = true;
        FX.beep(880, 0.12, 'sine', 0.12); FX.beep(1320, 0.15, 'sine', 0.1, 0.08);
      }
    }
    return;
  }
  G.useT = 0;
  const W = it ? WEAPONS[it.type] : PICKAXE;
  if (!G.mouseDown) { G.firedThisPress = false; return; }
  // strzelbę da się przerwać w trakcie ładowania nabojów
  if (G.reloading && W.shell && it.ammo > 0 && !G.firedThisPress) { G.reloading = false; G.reloadT = 0; }
  if (G.fireCd > 0 || G.reloading) return;
  if (!W.auto && G.firedThisPress) return;
  if (it && it.ammo <= 0) {
    if (!G.dryClicked) { FX.sndDry(); G.dryClicked = true; }
    startReload();
    return;
  }
  fire(it, W);
  G.fireCd = W.interval;
  G.firedThisPress = true;
  if (it) {
    it.ammo--;
    hotbarDirty = true;
    if (it.ammo <= 0) setTimeout(() => { if (curItem() === it && it.ammo <= 0) startReload(); }, 300);
  }
}

// ================================================================ kamera
const camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const camQ = new THREE.Quaternion();
const camOff = new THREE.Vector3(1.2, 0.5, 3.1);
const _off = new THREE.Vector3(), _piv = new THREE.Vector3(), _dir = new THREE.Vector3();
let scopedNow = false;

function updateCamera(dt) {
  const W = curWeapon();
  scopedNow = G.ads && W && W.scope && !G.dead && me.mode === 'ground';
  // sprężyna odrzutu
  RC.p += (RC.tp - RC.p) * Math.min(1, dt * 32);
  RC.y += (RC.ty - RC.y) * Math.min(1, dt * 32);
  RC.tp *= Math.exp(-dt * 7.5);
  RC.ty *= Math.exp(-dt * 7.5);
  RC.shake *= Math.exp(-dt * 11);
  RC.fov *= Math.exp(-dt * 10);
  let fovT = 75, rp = RC.p, ry = RC.y;
  if (G.spectating) {
    rp = ry = 0;
    const o = specTarget();
    if (o) { _piv.copy(o.cur).y += 1.6; camEuler.set(-0.3, o.ry, 0); _off.set(0, 0.8, 4.8); }
    else { _piv.set(0, 60, 0); camEuler.set(-0.6, performance.now() / 20000, 0); _off.set(0, 0, 150); }
  } else if (me.mode === 'bus' && G.bus) {
    const bp = S.busPos(G.bus, clamp(G.busT, 0, 1));
    _piv.set(bp.x, bp.y + 3, bp.z); camEuler.set(me.rx, me.ry, 0); _off.set(0, 3, 24);
    fovT = 80;
  } else {
    _piv.set(me.x, me.y + me.eyeH, me.z);
    if (me.mode === 'sky' || me.mode === 'glide') { _off.set(0, 1.5, 7); fovT = 80; }
    else if (scopedNow) { _off.set(0, 0, 0); fovT = W.zoom; }
    else if (G.ads) { _off.set(0.85, 0.3, 1.5); fovT = W ? W.zoom : 65; }
    else _off.set(1.2, 0.5, 3.1);
    const sk = RC.shake * 0.006;
    camEuler.set(me.rx + rp + (Math.random() - 0.5) * sk, me.ry + ry + (Math.random() - 0.5) * sk, (Math.random() - 0.5) * sk * 1.5);
  }
  camQ.setFromEuler(camEuler);
  if (scopedNow) camOff.copy(_off); else camOff.lerp(_off, Math.min(1, dt * 14));
  _dir.copy(camOff).applyQuaternion(camQ);
  const len = _dir.length();
  if (len > 0.01) {
    _dir.divideScalar(len);
    const t = S.raycastMap(gm, _piv, _dir, len);
    camera.position.copy(_piv).addScaledVector(_dir, Math.max(0.15, t - 0.25));
  } else camera.position.copy(_piv);
  camera.quaternion.copy(camQ);
  fovT += RC.fov;
  const nf = scopedNow ? fovT : camera.fov + (fovT - camera.fov) * Math.min(1, dt * 12);
  if (Math.abs(nf - camera.fov) > 0.01) { camera.fov = nf; camera.updateProjectionMatrix(); }
  camDistNow = camera.position.distanceTo(_piv);
}

// ================================================================ HUD
let mapImg = null;
const MAP_N = 320;
function buildMapImage() {
  const c = document.createElement('canvas'); c.width = c.height = MAP_N;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(MAP_N, MAP_N);
  for (let py = 0; py < MAP_N; py++) {
    for (let px = 0; px < MAP_N; px++) {
      const x = ((px + 0.5) / MAP_N) * 440 - 220, z = ((py + 0.5) / MAP_N) * 440 - 220;
      const h = gm.height(x, z);
      let r, g, b;
      if (h < S.WATER_Y) { const k = clamp((S.WATER_Y - h) / 10, 0, 1); r = 45 - 25 * k; g = 160 - 60 * k; b = 225 - 45 * k; }
      else if (h < 0.9) { r = 233; g = 216; b = 166; }
      else { const k = clamp(h / 22, 0, 1); r = 105 - 35 * k + 60 * Math.max(0, k - 0.7); g = 195 - 70 * k; b = 80 - 10 * k; }
      const i = (py * MAP_N + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const k = MAP_N / 440;
  ctx.fillStyle = '#7d7468';
  for (const p of gm.pads) ctx.fillRect((p.x - p.hw + 220) * k, (p.z - p.hd + 220) * k, p.hw * 2 * k, p.hd * 2 * k);
  ctx.fillStyle = '#ffd24a';
  for (const ch of gm.chests) ctx.fillRect((ch.x + 220) * k - 1, (ch.z + 220) * k - 1, 2, 2);
  mapImg = c;
}

function drawMap(ctx, size, cx, cz, span, big) {
  const k = size / span, ox = cx - span / 2, oz = cz - span / 2;
  const mx = (x) => (x - ox) * k, mz = (z) => (z - oz) * k;
  ctx.fillStyle = '#1b6ca8'; ctx.fillRect(0, 0, size, size);
  const s = MAP_N / 440;
  ctx.drawImage(mapImg, (ox + 220) * s, (oz + 220) * s, span * s, span * s, 0, 0, size, size);
  if (big) {
    ctx.font = `bold ${Math.round(size / 36)}px Rubik, sans-serif`;
    ctx.textAlign = 'center';
    for (const t of gm.towns) {
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(t.name.toUpperCase(), mx(t.x), mz(t.z) - 14);
      ctx.fillStyle = '#fff'; ctx.fillText(t.name.toUpperCase(), mx(t.x), mz(t.z) - 14);
    }
  }
  const st = G.storm;
  if (st && G.state !== 'lobby' && G.state !== 'countdown') {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, size, size);
    ctx.arc(mx(st.x), mz(st.z), Math.max(0.5, st.r * k), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(130,40,230,0.45)'; ctx.fill('evenodd');
    ctx.beginPath(); ctx.arc(mx(st.x), mz(st.z), Math.max(0.5, st.r * k), 0, Math.PI * 2);
    ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx(st.nx), mz(st.nz), Math.max(0.5, st.nr * k), 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }
  if (G.bus && G.state === 'match' && G.busT < 1) {
    ctx.save();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(mx(G.bus.from.x), mz(G.bus.from.z)); ctx.lineTo(mx(G.bus.to.x), mz(G.bus.to.z)); ctx.stroke();
    const bp = S.busPos(G.bus, clamp(G.busT, 0, 1));
    ctx.fillStyle = '#3fa9ff'; ctx.beginPath(); ctx.arc(mx(bp.x), mz(bp.z), 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // punkt odrodzenia
  {
    const rx = Math.max(9, Math.min(size - 9, mx(gm.reboot.x))), rz = Math.max(9, Math.min(size - 9, mz(gm.reboot.z))), pulse = carrying().length ? 2 + Math.sin(performance.now() / 150) * 2 : 0;
    ctx.beginPath(); ctx.arc(rx, rz, 7 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = '#0b3d4a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#4cf2ff'; ctx.stroke();
    ctx.fillStyle = '#4cf2ff'; ctx.font = 'bold 10px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('♻', rx, rz + 1);
  }
  // karty kolegów i koledzy
  const clampE = (v) => Math.max(9, Math.min(size - 9, v));
  for (const c of G.cards.values()) {
    if (c.carrier || !cardMeshes.has(c.owner)) continue;
    const cx = clampE(mx(c.x)), cz = clampE(mz(c.z)), pulse = 3 + Math.sin(performance.now() / 180) * 3;
    ctx.beginPath(); ctx.arc(cx, cz, 9 + pulse, 0, Math.PI * 2); ctx.strokeStyle = tColor(c.team); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = tColor(c.team); ctx.fillRect(cx - 5, cz - 7, 10, 14);
    ctx.fillStyle = '#fff'; ctx.fillRect(cx - 3, cz - 5, 6, 10);
    ctx.fillStyle = tColor(c.team); ctx.font = 'bold 8px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♻', cx, cz + 0.5);
  }
  for (const o of G.others.values()) {
    if (!o.alive || o.mode === 4 || !isMate(o.id)) continue;
    ctx.beginPath(); ctx.arc(mx(o.cur.x), mz(o.cur.z), 4.5, 0, Math.PI * 2);
    ctx.fillStyle = tColor(G.myTeam); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  }
  let px = me.x, pz = me.z, pry = me.ry;
  if (G.spectating) { const o = specTarget(); if (o) { px = o.cur.x; pz = o.cur.z; pry = o.ry; } }
  ctx.save();
  ctx.translate(mx(px), mz(pz)); ctx.rotate(-pry);
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
  ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
  ctx.restore();
}

function renderHotbar() {
  const hb = $('hotbar');
  hb.innerHTML = '';
  G.inv.forEach((it, i) => {
    const d = document.createElement('div');
    d.className = 'slot' + (i === G.sel ? ' sel' : '');
    let html = `<span class="num">${i + 1}</span>`;
    if (it) {
      html += `<img src="${FX.itemIcon(it.type, it.rar || 0)}">`;
      if (it.k === 'w') html += `<span class="cnt${it.ammo === 0 ? ' empty' : ''}">${it.ammo}</span>`;
      else html += `<span class="cnt">×${it.n}</span>`;
      const rc = S.itemColor(it);
      d.style.background = `linear-gradient(160deg, ${rc}dd, ${rc}55 60%, rgba(0,0,0,.5))`;
    }
    d.innerHTML = html;
    hb.appendChild(d);
  });
}

function renderPlayersList() {
  // nie przebudowuj w trakcie wpisywania nazwy drużyny (straciłbyś fokus)
  if (document.activeElement && document.activeElement.classList.contains('tname')) { G.boardDirty = true; return; }
  const all = [...G.roster.values()];
  const host = amHost();
  const edit = host && (G.state === 'lobby' || G.state === 'countdown');
  const humansN = all.filter((p) => !p.bot).length, botsN = all.length - humansN;
  $('lobbyStatus').innerHTML = `<span class="pill">🙂 <b>${humansN}</b> player${humansN === 1 ? '' : 's'}</span><span class="pill">🤖 <b>${botsN}</b> bots</span><span class="pill">👑 ${esc(nameOf(G.hostId))}</span>`;
  $('hostInfo').innerHTML = host ? 'You are the <b>host</b>. You set up the teams and the match.' : `<b>${esc(nameOf(G.hostId))}</b> is the host and sets up the teams and the match.`;
  if (G.roomOwner) $('hostInfo').innerHTML += ' The match runs in <b>your browser</b>. If you leave, another player takes over the room automatically.';
  $('teamHint').textContent = !edit ? 'Only the host can arrange teams.' : TOUCH ? 'Tap a player, then tap a team. Tap a team name to rename it.' : 'Drag a player onto a team, or click a player and then a team. Click a team name to rename it.';
  $('teamTools').innerHTML = !edit ? '' : `
    <button class="btn ghost" data-act="solo">Everyone solo</button>
    <span class="grp">Random teams of
      <span class="stepper"><button data-auto-d="-1">−</button><input type="number" id="autoSize" min="2" max="50" value="${G.autoSize || 2}"><button data-auto-d="1">+</button></span>
      <label><span class="toggle"><input type="checkbox" id="autoBots"${G.autoBots ? ' checked' : ''}><span></span></span>incl. bots</label>
      <button class="btn accent" data-act="auto">Shuffle</button></span>
    <button class="btn ghost" data-act="fill">Spread bots over player teams</button>
    <button class="btn ghost" data-act="clean">Remove empty teams</button>`;
  const chip = (p) => {
    const av = p.bot ? '🤖' : p.id === G.hostId ? '👑' : esc(p.name.slice(0, 1).toUpperCase());
    const cls = ['chip', p.bot ? 'bot' : 'human', p.id === G.myId ? 'me' : '', edit ? 'can' : '', G.selChip === p.id ? 'sel' : ''].join(' ');
    const hostBtn = edit && !p.bot && p.id !== G.myId ? `<button class="mkhost" data-host="${p.id}" title="Make host">👑</button>` : '';
    return `<span class="${cls}" data-pid="${p.id}"${edit ? ' draggable="true"' : ''}><span class="av">${av}</span>${esc(p.name)}${p.id === G.myId ? ' (you)' : ''}${hostBtn}</span>`;
  };
  const card = (id, members) => {
    const t = teamOf(id), solo = id === 0;
    const head = solo ? `<span class="tname" style="pointer-events:none">No team (solo)</span>`
      : `<input class="tname" data-rename="${id}" value="${esc(t.name)}" maxlength="20"${edit ? '' : ' disabled'}>`;
    const del = edit && !solo ? `<button class="tdel" data-del="${id}" title="Delete team">✕</button>` : '';
    return `<div class="tcard${solo ? ' solo' : ''}${edit && G.selChip != null ? ' pick' : ''}" data-team="${id}" style="--tc:${t.color}">
      <div class="tchead"><span class="tdot"></span>${head}<span class="tcount">${members.length}</span>${del}</div>
      <div class="tchips">${members.map(chip).join('') || `<span class="tempty">${solo ? 'Nobody' : 'Empty — drop players here'}</span>`}</div></div>`;
  };
  const sortM = (a, b) => a.bot - b.bot || a.id - b.id;
  let html = '';
  for (const t of G.teams.values()) html += card(t.id, all.filter((p) => p.team === t.id).sort(sortM));
  if (edit) html += `<div class="tcard add" data-add="1"><b>+</b>New team</div>`;
  html += card(0, all.filter((p) => !p.team || !G.teams.has(p.team)).sort(sortM));
  $('teamBoard').innerHTML = html;
  const sb = $('startBtn');
  sb.disabled = G.state !== 'lobby' || !host;
  sb.textContent = G.state === 'countdown' ? 'STARTING…' : G.state !== 'lobby' ? 'MATCH IN PROGRESS' : host ? 'START MATCH' : 'WAITING FOR HOST';
  renderSettings();
}
// przenoszenie: przeciągnij i upuść albo kliknij żeton, potem drużynę
function moveTo(pid, cardEl) {
  if (!cardEl) return;
  if (cardEl.dataset.add) net.send({ t: 'teamadd', id: pid });
  else net.send({ t: 'team', id: pid, team: +cardEl.dataset.team });
}
const board = $('teamBoard');
board.addEventListener('dragstart', (e) => { const c = e.target.closest('.chip.can'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.pid); e.dataTransfer.effectAllowed = 'move'; } });
board.addEventListener('dragover', (e) => { const t = e.target.closest('.tcard'); if (t) { e.preventDefault(); board.querySelectorAll('.drop').forEach((x) => x !== t && x.classList.remove('drop')); t.classList.add('drop'); } });
board.addEventListener('dragleave', (e) => { const t = e.target.closest('.tcard'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('drop'); });
board.addEventListener('drop', (e) => {
  e.preventDefault();
  board.querySelectorAll('.drop').forEach((x) => x.classList.remove('drop'));
  const pid = +e.dataTransfer.getData('text/plain');
  if (pid) moveTo(pid, e.target.closest('.tcard'));
});
board.addEventListener('click', (e) => {
  if (!amHost()) return;
  const hb = e.target.closest('button[data-host]');
  if (hb) { e.stopPropagation(); net.send({ t: 'host', id: +hb.dataset.host }); return; }
  const del = e.target.closest('button[data-del]');
  if (del) { net.send({ t: 'teamdel', id: +del.dataset.del }); return; }
  if (e.target.closest('input')) return;
  const c = e.target.closest('.chip.can');
  if (c) { const id = +c.dataset.pid; G.selChip = G.selChip === id ? null : id; renderPlayersList(); return; }
  const card = e.target.closest('.tcard');
  if (card && (card.dataset.add || G.selChip != null)) {
    if (G.selChip != null) { moveTo(G.selChip, card); G.selChip = null; }
    else net.send({ t: 'teamadd' });
  }
});
board.addEventListener('change', (e) => {
  const r = e.target.closest('input[data-rename]');
  if (r) net.send({ t: 'teamrename', id: +r.dataset.rename, name: r.value });
});
board.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[data-rename]')) e.target.blur(); });
board.addEventListener('focusout', () => { if (G.boardDirty) { G.boardDirty = false; setTimeout(renderPlayersList, 0); } });
$('teamTools').addEventListener('click', (e) => {
  const d = e.target.closest('button[data-auto-d]');
  if (d) { const inp = $('autoSize'); inp.value = clamp((+inp.value || 2) + +d.dataset.autoD, 2, 50); G.autoSize = +inp.value; return; }
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'solo') net.send({ t: 'teamsauto', size: 1, bots: true });
  if (act === 'auto') {
    G.autoSize = Math.max(2, +$('autoSize').value || 2); G.autoBots = $('autoBots').checked;
    net.send({ t: 'teamsauto', size: G.autoSize, bots: G.autoBots });
  }
  if (act === 'fill') net.send({ t: 'botsfill' });
  if (act === 'clean') net.send({ t: 'teamclean' });
});
function renderSettings() {
  const box = $('settingsBox');
  if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { G.setDirty = true; return; }
  const ro = !amHost() || G.state !== 'lobby';
  const dis = ro ? ' disabled' : '';
  let html = '';
  for (const g of S.SETTINGS_GROUPS) {
    html += `<div class="setGroup"><h4>${g}</h4>`;
    for (const f of S.SETTINGS_SCHEMA.filter((x) => x.group === g)) {
      const v = G.settings[f.key];
      let ctl;
      if (f.type === 'int') ctl = `<span class="stepper"><button data-step="${f.key}" data-d="-1"${dis}>−</button><input type="number" data-set="${f.key}" min="${f.min}" max="${f.max}" value="${v}"${dis}><button data-step="${f.key}" data-d="1"${dis}>+</button></span>`;
      else if (f.type === 'bool') ctl = `<label class="toggle"><input type="checkbox" data-set="${f.key}"${v ? ' checked' : ''}${dis}><span></span></label>`;
      else ctl = `<div class="seg${ro ? ' dis' : ''}" data-seg="${f.key}">${f.opts.map(([val, lab]) => `<button data-v="${val}" class="${String(val) === String(v) ? 'on' : ''}">${lab}</button>`).join('')}</div>`;
      html += `<div class="setRow"><span>${f.label}</span>${ctl}</div>`;
    }
    html += `</div>`;
  }
  if (ro) html += `<div class="lockNote">🔒 ${G.state !== 'lobby' ? 'Settings are locked while a match is running.' : 'Only the host can change match settings.'}</div>`;
  box.innerHTML = html;
}
const sendSetting = (key, v) => { if (amHost()) net.send({ t: 'settings', s: { [key]: v } }); };
let setTimer = 0;
$('settingsBox').addEventListener('click', (e) => {
  const st = e.target.closest('button[data-step]');
  if (st) {
    const f = S.SETTINGS_SCHEMA.find((x) => x.key === st.dataset.step);
    sendSetting(f.key, clamp((+G.settings[f.key] || 0) + f.step * +st.dataset.d, f.min, f.max));
    return;
  }
  const sb = e.target.closest('.seg[data-seg] button');
  if (sb) sendSetting(sb.parentElement.dataset.seg, sb.dataset.v);
});
$('settingsBox').addEventListener('change', (e) => {
  const el = e.target.closest('input[data-set]');
  if (el) sendSetting(el.dataset.set, el.type === 'checkbox' ? el.checked : el.value);
});
$('settingsBox').addEventListener('input', (e) => { // liczby zapisuj też w trakcie pisania (bez czekania na Enter)
  const el = e.target.closest('input[type=number][data-set]');
  if (!el) return;
  clearTimeout(setTimer);
  setTimer = setTimeout(() => sendSetting(el.dataset.set, el.value), 450);
});
$('settingsBox').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('settingsBox').addEventListener('focusout', () => { if (G.setDirty) { G.setDirty = false; setTimeout(renderSettings, 0); } });

// zakładki menu
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  for (const x of $('tabs').children) x.classList.toggle('on', x === b);
  for (const p of document.querySelectorAll('.pane')) p.classList.toggle('on', p.dataset.pane === b.dataset.tab);
});

function memberStatus(p) {
  if (p.id === G.myId) return G.dead ? (G.cards.get(G.myId) ? '🃏 card' : '✖ down') : '✔ alive';
  const o = G.others.get(p.id);
  if (o && o.alive) return isMate(p.id) ? `✔ ${o.hp ?? 100} HP${o.sh ? ' + ' + o.sh : ''}` : '✔ alive';
  const c = G.cards.get(p.id);
  if (c) return c.carrier ? '🃏 carried' : `🃏 ${Math.max(0, Math.ceil((c.until - performance.now()) / 1000))} s`;
  return G.state === 'match' || G.state === 'ended' ? '✖ out' : '—';
}
function renderScoreboard() {
  const all = [...G.roster.values()];
  let html = `<h3>Teams</h3>`;
  const groups = [];
  for (const t of G.teams.keys()) { const m = all.filter((p) => p.team === t); if (m.length) groups.push([t, m]); }
  for (const p of all.filter((p) => !p.team)) groups.push([0, [p]]);
  for (const [t, members] of groups) {
    const alive = members.some((p) => (p.id === G.myId ? !G.dead : (G.others.get(p.id) || {}).alive));
    html += `<div class="sbTeam${alive || G.state === 'lobby' ? '' : ' out'}" style="--tc:${tColor(t)}"><div class="sbHead">${t ? esc(tName(t)) : 'Solo'}</div>`;
    for (const p of members) html += `<div class="sbRow"><span class="n">${p.bot ? '🤖 ' : ''}${p.id === G.myId ? '<u>' + esc(p.name) + '</u>' : esc(p.name)}</span><span class="st">${memberStatus(p)}</span></div>`;
    html += `</div>`;
  }
  $('scoreboard').innerHTML = html;
}

function renderTeamPanel() {
  const el = $('teamPanel');
  if (G.myTeam <= 0) { el.innerHTML = ''; return; }
  const mates = [...G.roster.values()].filter((p) => p.team === G.myTeam && p.id !== G.myId);
  const nowT = performance.now();
  el.innerHTML = `<div class="tpHead" style="color:${tColor(G.myTeam)}">Team: ${esc(tName(G.myTeam))}</div>` + mates.map((p) => {
    const o = G.others.get(p.id);
    const card = G.cards.get(p.id);
    let status;
    if (o && o.alive) {
      status = `<div class="tpBars"><div class="tpSh" style="width:${o.sh || 0}%"></div><div class="tpHp" style="width:${o.hp ?? 100}%"></div></div>`;
    } else if (card) {
      status = card.carrier ? `<span class="tpCard">🃏 carried by ${esc(nameOf(card.carrier))}</span>`
        : `<span class="tpCard">🃏 card: ${Math.max(0, Math.ceil((card.until - nowT) / 1000))} s left</span>`;
    } else status = G.state === 'match' ? '<span class="tpOut">✖ out</span>' : '';
    return `<div class="tpRow"><span class="tdot" style="background:${tColor(G.myTeam)}"></span><b>${esc(p.name)}</b>${status}</div>`;
  }).join('');
}

function itemStats(it) {
  if (it.k === 'w') {
    const W = WEAPONS[it.type];
    const dmg = S.weaponDmg(it.type, it.rar);
    return `Damage ${dmg}${W.pellets > 1 ? '×' + W.pellets : ''} • ${(1 / W.interval).toFixed(1)} shots/s • Mag ${W.mag}`;
  }
  const C = CONSUMABLES[it.type];
  return C.hp ? `+${C.hp} HP (up to ${C.hpCap}) • ${C.time} s` : `+${C.sh} shield (up to ${C.shCap}) • ${C.time} s`;
}

const hudCache = {};
function setText(id, txt) { if (hudCache[id] !== txt) { hudCache[id] = txt; $(id).textContent = txt; } }
function setStyle(id, prop, val) {
  const k = id + prop;
  if (hudCache[k] === val) return;
  hudCache[k] = val;
  if (prop.startsWith('--')) $(id).style.setProperty(prop, val); else $(id).style[prop] = val;
}
function setClass(id, cls, on) { const k = id + '.' + cls; if (hudCache[k] !== on) { hudCache[k] = on; $(id).classList.toggle(cls, on); } }
function setAttr(id, attr, val) { const k = id + '@' + attr; if (hudCache[k] !== val) { hudCache[k] = val; $(id).setAttribute(attr, val); } }
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

let mapAcc = 0;
function updateHUD(dt) {
  if (hotbarDirty) { renderHotbar(); hotbarDirty = false; }
  setStyle('hpFill', 'width', G.hp + '%'); setText('hpTxt', String(G.hp));
  setStyle('shFill', 'width', G.sh + '%'); setText('shTxt', String(G.sh));

  // panel broni
  const it = curItem();
  const rc = S.itemColor(it);
  setText('weaponName', it ? S.itemName(it).replace(/ ×\d+$/, '') : PICKAXE.name);
  setStyle('weaponName', 'color', rc);
  setStyle('weaponPanel', '--rc', it ? rc + 'aa' : 'rgba(120,90,255,.6)');
  setAttr('wIcon', 'src', FX.itemIcon(it ? it.type : 'pickaxe', it ? it.rar || 0 : 0));
  if (it && it.k === 'w') {
    const mag = WEAPONS[it.type].mag;
    setText('ammoMag', String(it.ammo)); setText('ammoMax', `/${mag}`);
    setClass('ammo', 'low', it.ammo > 0 && it.ammo <= Math.max(1, mag * 0.25));
    setClass('ammo', 'empty', it.ammo === 0);
  } else {
    setText('ammoMag', it ? `×${it.n}` : ''); setText('ammoMax', '');
    setClass('ammo', 'low', false); setClass('ammo', 'empty', false);
  }
  setClass('ammoHint', 'on', !!(it && it.k === 'w' && it.ammo === 0 && !G.reloading && !G.dead));

  // celownik pokazuje prawdziwy rozrzut
  const W = curWeapon();
  const spread = currentSpread(W);
  const halfH = VH / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const gap = Math.round(clamp(Math.tan(spread) * halfH + RC.p * 120, 3, 160));
  setStyle('crosshair', '--g', `${gap}px`);
  const kind = !W ? 'dot' : W.melee ? 'dot' : W.pellets > 1 ? 'ring' : 'lines';
  const off = scopedNow || G.spectating || me.mode !== 'ground' || G.dead;
  const xc = off ? 'off' : kind;
  if (hudCache.xh !== xc) { hudCache.xh = xc; $('crosshair').className = xc; }
  setClass('scope', 'on', !!scopedNow);

  // przeładowanie / leczenie — pierścień wokół celownika
  let prog = 0, plabel = '';
  if (G.reloading && it && it.k === 'w') {
    const Wi = WEAPONS[it.type];
    prog = Wi.shell ? (it.ammo + 1 - G.reloadT / Wi.reload) / Wi.mag : 1 - G.reloadT / Wi.reload;
    plabel = 'RELOADING';
  } else if (G.useT > 0 && it && it.k === 'c') { prog = G.useT / CONSUMABLES[it.type].time; plabel = CONSUMABLES[it.type].name.toUpperCase(); }
  if (G.rebootT > 0) { prog = Math.min(1, G.rebootT / G.settings.rebootTime); plabel = 'REBOOTING…'; }
  setClass('reloadRing', 'on', prog > 0);
  if (prog > 0) setStyle('reloadFg', 'strokeDashoffset', String(Math.round(163.4 * (1 - clamp(prog, 0, 1)))));
  setText('progressLabel', plabel);

  const st = G.storm;
  let outside = false;
  if (st && (G.state === 'match' || G.state === 'ended') && !G.dead) outside = Math.hypot(me.x - st.x, me.z - st.z) > st.r;
  setClass('stormfx', 'on', outside);
  let si = 'Warm-up — no storm';
  if (st && (G.state === 'match' || G.state === 'ended')) {
    si = st.tm <= 0 ? 'Final zone!' : `${st.shr ? '🌀 Storm closing' : '⏳ Storm in'} ${fmt(st.tm)}`;
    if (outside) si += ' • ⚠ YOU ARE IN THE STORM';
  } else if (G.state === 'countdown') si = `Starting in ${G.cd}…`;
  setText('stormInfo', si);
  setText('aliveCnt', `👤 ${G.alive}`);
  setText('killCnt', `💀 ${G.kills}`);

  // wytrzymałość uderzanego obiektu
  if (G.lastObjT > 0) G.lastObjT -= dt;
  const oh = G.lastObjT > 0 ? G.objHpShow : null;
  setClass('objhp', 'on', !!oh);
  if (oh) {
    setText('objName', oh.hp > 0 ? oh.name : `${oh.name} — DESTROYED`);
    setText('objTxt', `${Math.max(0, oh.hp)} / ${oh.max}`);
    setStyle('objFill', 'width', `${Math.round((Math.max(0, oh.hp) / oh.max) * 100)}%`);
  }

  // karta podnoszenia
  const inter = !G.dead ? findInteract() : null;
  if (inter) {
    const key = inter.kind === 'chest' ? 'chest' : inter.kind === 'card' ? 'card' + inter.c.owner
      : inter.kind === 'reboot' ? 'reboot' + Math.ceil((G.rebootReadyAt - performance.now()) / 1000) : 'loot' + inter.l.id;
    if (hudCache.prompt !== key) {
      hudCache.prompt = key;
      const p = $('prompt');
      if (inter.kind === 'reboot') {
        const cd = Math.ceil((G.rebootReadyAt - performance.now()) / 1000);
        p.style.setProperty('--rc', '#4cf2ff');
        p.innerHTML = cd > 0 ? `<div class="pcard"><div><div class="pname" style="color:#4cf2ff">Reboot Van</div><div class="pstats">Recharging… ${cd} s</div></div></div>`
          : `<div class="pcard"><div><div class="pname" style="color:#4cf2ff">Reboot ${esc(carrying().map((c) => nameOf(c.owner)).join(', '))}</div><div class="pstats">Hold ${TOUCH ? 'REBOOT' : 'E'} for ${G.settings.rebootTime} s</div></div></div><div class="pkey"><kbd>E</kbd>Hold</div>`;
        hudCache.prompt = 'reboot' + cd;
      } else if (inter.kind === 'card') {
        const col = tColor(inter.c.team);
        p.style.setProperty('--rc', col);
        p.innerHTML = `<div class="pcard"><div><div class="pname" style="color:${col}">${esc(nameOf(inter.c.owner))}'s reboot card</div><div class="pstats">Take it to the Reboot Van</div></div></div><div class="pkey"><kbd>E</kbd>Pick up card</div>`;
      } else if (inter.kind === 'chest') {
        p.style.setProperty('--rc', '#ffb52e');
        p.innerHTML = `<div class="pcard"><div><div class="pname" style="color:#ffd24a">Chest</div><div class="pstats">Weapons and items inside</div></div></div><div class="pkey"><kbd>E</kbd>Open</div>`;
      } else {
        const l = inter.l, c = S.itemColor(l);
        const rarName = l.k === 'w' ? RARITIES[l.rar].name : 'Item';
        const name = l.k === 'w' ? WEAPONS[l.type].name : `${CONSUMABLES[l.type].name} ×${l.n}`;
        p.style.setProperty('--rc', c);
        p.innerHTML = `<div class="pcard"><img src="${FX.itemIcon(l.type, l.rar || 0)}"><div><div class="pname" style="color:${c}">${name}</div><div class="prar">${rarName}</div><div class="pstats">${itemStats(l)}</div></div></div><div class="pkey"><kbd>E</kbd>Pick up</div>`;
      }
    }
  } else hudCache.prompt = null;
  setClass('prompt', 'on', !!inter);
  if (TOUCH) updateTouchHUD(it, W, inter);

  // komunikaty
  let big = '', red = false, sub = '';
  if (G.killMsgT > 0) G.killMsgT -= dt;
  if (G.endInfo) {
    if ((G.endInfo.wids || []).includes(G.myId)) big = '#1 VICTORY ROYALE!';
    else big = G.endInfo.winner ? `${G.endInfo.winner} WINS` : 'MATCH OVER';
    if (G.endInfo.team) sub = `Team ${tName(G.endInfo.team)}: ${G.endInfo.winner} • `;
    sub = (sub || '') + 'Back to the lobby in a moment…';
  } else if (G.state === 'countdown') { big = `MATCH IN ${G.cd}`; sub = 'Get ready!'; }
  else if (G.state === 'lobby') sub = G.dead ? 'You died — respawning in a moment…' : (amHost() ? `WARM-UP • ${TOUCH ? '❚❚' : 'Esc'} → START MATCH` : 'WARM-UP • waiting for the host to start the match');
  else if (G.state === 'match') {
    const so = G.spectating ? specTarget() : null;
    const sname = so ? (G.roster.get(so.id) || {}).name || '?' : '—';
    if (G.dead && G.deadInfo && !G.deadInfo.lobby && G.deadInfo.canReboot) {
      big = 'ELIMINATED'; red = true;
      const card = G.cards.get(G.myId);
      const st = !card ? '' : card.carrier ? `${nameOf(card.carrier)} is carrying your card — fingers crossed!` : `your reboot card is waiting ${Math.max(0, Math.ceil((card.until - performance.now()) / 1000))} s — your team can reboot you`;
      sub = `${st} • spectating ${sname}`;
    } else if (G.dead && G.deadInfo && !G.deadInfo.lobby) {
      big = 'ELIMINATED'; red = true;
      sub = `${G.deadInfo.place ? `Placed #${G.deadInfo.place}` : 'Your team is still fighting'}${G.deadInfo.byName ? ` • eliminated by ${G.deadInfo.byName}` : ''} • spectating ${sname} (${TOUCH ? 'NEXT' : 'LMB'} — next)`;
    } else if (G.spectating) sub = `Match in progress — spectating ${sname}. You'll play in the next one!`;
    else if (me.mode === 'bus') sub = TOUCH ? 'Tap JUMP OUT to leave the Battle Bus' : 'SPACE — jump out of the Battle Bus';
    else if (me.mode === 'sky') sub = TOUCH ? 'Tap GLIDE to deploy the glider' : 'SPACE — deploy glider';
    else if (carrying().length) sub = `🃏 Carrying ${carrying().map((c) => nameOf(c.owner)).join(', ')}'s card — bring it to the ♻ Reboot Van (blue marker)`;
  }
  if (!sub && G.killMsgT > 0) sub = G.killMsg;
  setText('bigmsg', big); setClass('bigmsg', 'red', red);
  setText('submsg', sub);

  G.teamPanelT -= dt;
  if (G.teamPanelT <= 0) { G.teamPanelT = 0.25; renderTeamPanel(); if (!$('scoreboard').classList.contains('hidden')) renderScoreboard(); }

  mapAcc += dt;
  if (mapAcc > 0.1 && mapImg) {
    mapAcc = 0;
    const span = me.mode === 'bus' || me.mode === 'sky' ? 440 : 170;
    let cx = me.x, cz = me.z;
    if (G.spectating) { const o = specTarget(); if (o) { cx = o.cur.x; cz = o.cur.z; } }
    if (span === 440) { cx = 0; cz = 0; }
    drawMap($('minimap').getContext('2d'), 200, cx, cz, span, false);
    if (!$('fullmap').classList.contains('hidden')) drawMap($('bigmap').getContext('2d'), 640, 0, 0, 440, true);
  }
}

// przyciski dotykowe pokazują tylko to, co się teraz da zrobić
function updateTouchHUD(it, W, inter) {
  const alive = !G.dead && !G.spectating;
  const ground = alive && (me.mode === 'ground' || me.mode === 'climb');
  setText('tFireL', G.spectating ? 'NEXT' : it && it.k === 'c' ? 'USE' : W && W.melee ? 'HIT' : 'FIRE');
  setText('tAmmo', ground && it && it.k === 'w' ? `${it.ammo}/${WEAPONS[it.type].mag}` : ground && it ? `×${it.n}` : '');
  setClass('tAmmo', 'empty', !!(it && it.k === 'w' && it.ammo === 0));
  setClass('tFire', 'hide', !(ground || G.spectating));
  setClass('tFire2', 'hide', !ground);
  setClass('tAim', 'hide', !(ground && W && !W.melee));
  setClass('tAim', 'on', !!G.adsHeld);
  setClass('tReload', 'hide', !(ground && it && it.k === 'w' && it.ammo < WEAPONS[it.type].mag));
  setClass('tReload', 'on', !!(it && it.k === 'w' && it.ammo === 0 && !G.reloading));
  setClass('tCrouch', 'hide', !ground);
  setClass('tCrouch', 'on', me.crouch);
  setClass('tJump', 'hide', !(ground || (alive && (me.mode === 'bus' || me.mode === 'sky'))));
  setText('tJumpL', me.mode === 'bus' ? 'JUMP OUT' : me.mode === 'sky' ? 'GLIDE' : 'JUMP');
  setClass('tDrop', 'hide', !(ground && it));
  setClass('tUse', 'hide', !inter);
  if (inter) setText('tUseL', inter.kind === 'chest' ? 'OPEN' : inter.kind === 'reboot' ? 'REBOOT' : inter.kind === 'card' ? 'TAKE CARD' : 'PICK UP');
}

// ================================================================ pętla
let last = performance.now(), sendAcc = 0;
const _sunOff = VIS.SUN_DIR.clone().multiplyScalar(160);

function update(dt) {
  if (G.bus && G.state !== 'lobby') {
    G.busTarget += dt / S.BUS_TIME;
    G.busT += dt / S.BUS_TIME;
    G.busT += (G.busTarget - G.busT) * Math.min(1, dt * 3);
  }
  const W = curWeapon();
  G.ads = G.adsHeld && locked && !G.dead && me.mode === 'ground' && !!W && !W.melee && !G.reloading;

  physics(dt);
  const eyeT = me.mode === 'climb' ? 1.4 : me.crouch ? (me.slideT > 0 ? 0.95 : 1.15) : 1.6;
  me.eyeH += (eyeT - me.eyeH) * Math.min(1, dt * 12);
  weaponUpdate(dt);

  sendAcc += dt;
  if (sendAcc >= 0.05) {
    sendAcc = 0;
    if (!G.dead) {
      net.send({ t: 'st', p: [r2(me.x), r2(me.y), r2(me.z)], r: [r3(me.ry), r3(me.rx)], m: MODE_CODE[me.mode] ?? 0, w: heldStr(), mv: Math.hypot(me.vx, me.vz) > 0.5 ? 1 : 0, c: me.crouch ? 1 : 0 });
      // kopia ekwipunku u hosta: żeby po rozłączeniu albo zmianie hosta wrócić z tym, co się miało
      const ik = JSON.stringify(G.inv);
      if (ik !== lastInvKey) { lastInvKey = ik; net.send({ t: 'inv', inv: G.inv }); }
    }
  }

  for (const o of G.others.values()) {
    const k = Math.min(1, dt * 12);
    const px = o.cur.x, py = o.cur.y, pz = o.cur.z;
    o.cur.lerp(o.tgt, k);
    const iv = 1 / Math.max(dt, 1e-3), kv = Math.min(1, dt * 10);
    o.vx += ((o.cur.x - px) * iv - o.vx) * kv; o.vy += ((o.cur.y - py) * iv - o.vy) * kv; o.vz += ((o.cur.z - pz) * iv - o.vz) * kv;
    o.ry = lerpAngle(o.ry, o.tRy, k);
    const cull = scopedNow ? 520 : 220;
    const far = !isMate(o.id) && camera.position.distanceToSquared(o.cur) > cull * cull; // nie rysuj bardzo dalekich (w lunecie — tak)
    const vis = o.alive && o.mode !== 3 && o.mode !== 4 && !far;
    o.av.root.visible = vis;
    if (!vis) continue;
    o.av.root.position.copy(o.cur);
    o.av.root.rotation.y = o.ry;
    const stepped = animateAvatar(o.av, { mode: MODES[o.mode], vx: o.vx, vz: o.vz, vy: o.vy, onGround: Math.abs(o.vy) < 1.5, rx: o.rx, held: o.w, ry: o.ry, crouch: o.cr, slide: o.cr && Math.hypot(o.vx, o.vz) > 6 }, dt);
    if (stepped) { const d = o.cur.distanceTo(camera.position); if (d < 25) FX.sndStep(d); }
    o.av.tag.visible = isMate(o.id) || camera.position.distanceTo(o.cur) < 55;
  }

  if (meAv) {
    meAv.root.visible = !(G.dead || me.mode === 'bus' || G.spectating || scopedNow);
    meAv.root.position.set(me.x, me.y, me.z);
    meAv.root.rotation.y = me.ry;
    const stepped = animateAvatar(meAv, { mode: me.mode, vx: me.vx, vz: me.vz, vy: me.vy, onGround: me.onGround, rx: me.rx + RC.p * 0.5, held: heldStr(), ry: me.ry, crouch: me.crouch, slide: me.slideT > 0 }, dt);
    if (stepped && me.mode === 'ground') FX.sndStep(0);
  }

  updateCamera(dt);

  const focus = G.spectating && specTarget() ? specTarget().cur : me;
  sun.target.position.set(focus.x, focus.y, focus.z);
  sun.position.set(focus.x + _sunOff.x, focus.y + _sunOff.y, focus.z + _sunOff.z);

  const busOn = !!G.bus && (G.state === 'match' || G.state === 'ended') && G.busT < 1.05;
  busMesh.visible = busOn;
  if (busOn) {
    const bp = S.busPos(G.bus, G.busT);
    busMesh.position.set(bp.x, bp.y, bp.z);
    busMesh.rotation.y = Math.atan2(-(G.bus.to.x - G.bus.from.x), -(G.bus.to.z - G.bus.from.z));
    busMesh.position.y += Math.sin(performance.now() / 600) * 0.4;
  }

  const st = G.storm;
  const stormOn = !!st && (G.state === 'match' || G.state === 'ended');
  stormMesh.visible = stormOn;
  let inStorm = false;
  if (stormOn) {
    const r = Math.max(0.1, st.r);
    stormMesh.position.set(st.x, 150, st.z);
    stormMesh.scale.set(r, 1, r);
    const dc = Math.hypot(camera.position.x - st.x, camera.position.z - st.z);
    inStorm = dc > st.r;
    stormMesh.material.opacity = clamp(0.4 - Math.abs(st.r - dc) / 300, 0.04, 0.35);
  }
  const fogT = inStorm ? STORM_FOG : SKY;
  scene.fog.color.lerp(fogT, Math.min(1, dt * 3));
  scene.background.copy(scene.fog.color);
  scene.fog.far += ((inStorm ? 90 : 520) - scene.fog.far) * Math.min(1, dt * 3);
  scene.fog.near += ((inStorm ? 5 : 160) - scene.fog.near) * Math.min(1, dt * 3);
  env.update(dt, camera.position, inStorm ? 1 : 0);

  const tt = performance.now() / 1000;
  for (const l of G.loot.values()) {
    l.model.rotation.y = tt * 1.5 + l.id;
    l.model.position.y = 0.5 + Math.sin(tt * 2 + l.id) * 0.08;
  }
  chestMat.emissiveIntensity = chestLidMat.emissiveIntensity = 0.7 + Math.sin(tt * 4) * 0.3;
  flash.intensity = Math.max(0, flash.intensity - dt * 900);

  // przytrzymanie E przy punkcie odrodzenia
  if (G.rebootT > 0) {
    if (G.dead || !nearReboot() || !keys.KeyE) cancelReboot();
    else {
      const before = G.rebootT;
      G.rebootT += dt;
      if (Math.floor(before * 2) !== Math.floor(G.rebootT * 2)) net.send({ t: 'reboot', on: true }); // ponawiaj (lag)
    }
    if (G.rebootT > G.settings.rebootTime + 1.5) cancelReboot();
  }
  for (const mesh of cardMeshes.values()) {
    const c = mesh.userData.card;
    c.rotation.y = tt * 2;
    c.position.y = 0.8 + Math.sin(tt * 3) * 0.08;
  }
  if (rebootMesh) {
    const u = rebootMesh.userData, carry = carrying().length > 0;
    u.lamp.scale.setScalar(1 + Math.sin(tt * 6) * 0.15);
    u.beam.material.opacity = carry ? 0.3 + Math.sin(tt * 4) * 0.08 : 0.1;
    u.screen.material.color.setHex(performance.now() < G.rebootReadyAt ? 0xff5050 : 0x4cf2ff);
  }

  FX.updateFx(dt);
  updateMarkers();
  updateDmgNums(dt);
  updateHUD(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (gm) update(dt);
  if (post && gm) post.render(); else renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ================================================================ menu
try { $('nick').value = localStorage.getItem('fortjede-nick') || ''; } catch { /* brak storage */ }
const qs = new URLSearchParams(location.search);
const invited = cleanCode(qs.get('room'));
function join(asGuest) {
  FX.ac();
  const name = $('nick').value.trim() || `Player${Math.floor(Math.random() * 1000)}`;
  const code = asGuest ? cleanCode($('roomCode').value) : '';
  if (asGuest && code.length < 4) { $('connStatus').textContent = 'Enter the room code you got from the host.'; $('roomCode').focus(); return; }
  try { localStorage.setItem('fortjede-nick', name); } catch { /* brak storage */ }
  $('playBtn').disabled = true; $('joinBtn').disabled = true;
  connect(name, code);
}
$('playBtn').onclick = () => join(false);
$('joinBtn').onclick = () => join(true);
$('nick').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(!!invited); });
$('roomCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(true); });
$('roomCode').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
let rejoin = false;
try { rejoin = !!invited && sessionStorage.getItem('fortjede-in') === invited; } catch { /* brak storage */ }
if (invited) {
  // wejście z linku zaproszenia: główną akcją jest dołączenie
  $('roomCode').value = invited;
  $('joinCard').classList.add('invited');
  $('joinBtn').textContent = `JOIN ROOM ${invited}`;
  $('playBtn').textContent = 'Create my own room instead';
}
$('resumeBtn').onclick = lock;
if (TOUCH) { $('resumeBtn').textContent = '▶ TAP TO PLAY'; $('ammoHint').textContent = 'TAP RELOAD'; }
$('startBtn').onclick = () => { net.send({ t: 'start' }); lock(); };
if (!TOUCH) $('nick').focus(); // na telefonie klawiatura zasłoniłaby pół ekranu
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* brak storage */ } };
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
function bindSeg(id, value, onPick) {
  const el = $(id);
  const mark = (v) => { for (const b of el.children) b.classList.toggle('on', b.dataset.v === v); };
  mark(value);
  el.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { mark(b.dataset.v); onPick(b.dataset.v); } });
}
bindSeg('qualitySeg', QKEY, (v) => { QKEY = v; QUAL = VIS.QUALITY[v]; store('fortjede-q', v); applyQuality(); });
bindSeg('adsSeg', ADS_MODE, (v) => { ADS_MODE = v; G.adsHeld = false; store('fortjede-ads', v); });
SENS = +load('fortjede-sens', 1) || 1;
$('sens').value = SENS; $('sensVal').textContent = `×${SENS.toFixed(2)}`;
$('sens').addEventListener('input', (e) => { SENS = +e.target.value; $('sensVal').textContent = `×${SENS.toFixed(2)}`; store('fortjede-sens', SENS); });
const VOL0 = +load('fortjede-vol', 0.8);
$('vol').value = VOL0; FX.setVolume(VOL0); $('volVal').textContent = `${Math.round(VOL0 * 100)}%`;
$('vol').addEventListener('input', (e) => { const v = +e.target.value; FX.setVolume(v); $('volVal').textContent = `${Math.round(v * 100)}%`; store('fortjede-vol', v); });
applyQuality();
const qsNick = qs.get('nick');
if (qsNick) { $('nick').value = qsNick.slice(0, 16); join(!!invited); }
else if (rejoin && $('nick').value.trim()) join(true); // odświeżona karta w trakcie gry — wracamy od razu

window.__fj = { G, me, net, camera, keys, joy, jumpFromBus, addItem, interact, selectSlot, onCrouchKey, setLocked: (v) => { locked = v; }, get gm() { return gm; } }; // debug
