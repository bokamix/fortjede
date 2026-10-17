// Fortjede — modele broni, ikony, dźwięki broni i efekty strzałów
import * as THREE from 'three';
import { WEAPONS, CONSUMABLES, RARITIES } from './shared.js';

const rarColor = RARITIES.map((r) => new THREE.Color(r.color));

// ================================================================ modele
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 14); CYL.rotateX(Math.PI / 2); // oś wzdłuż Z
const SPH = new THREE.SphereGeometry(1, 12, 8);
const matCache = new Map();
function mat(color, shiny = 30, emissive = 0x000000, emI = 1) {
  const key = `${color}|${shiny}|${emissive}|${emI}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshPhongMaterial({ color, shininess: shiny, specular: shiny > 40 ? 0x666666 : 0x222222, emissive, emissiveIntensity: emI, flatShading: true });
    matCache.set(key, m);
  }
  return m;
}
const METAL = () => mat(0x2a2e35, 70);
const METAL2 = () => mat(0x4b525c, 60);
const WOOD = () => mat(0x8b5a2b, 15);
function rarMat(rar) {
  const c = rarColor[rar].clone();
  const em = rar >= 3 ? rarColor[rar].clone().multiplyScalar(0.18).getHex() : 0x000000;
  return mat(c.getHex(), 45, em);
}
function bx(g, w, h, d, m, x, y, z, rx = 0) {
  const me = new THREE.Mesh(BOX, m);
  me.scale.set(w, h, d); me.position.set(x, y, z); me.rotation.x = rx;
  me.castShadow = true; g.add(me);
  return me;
}
function cy(g, r, len, m, x, y, z) {
  const me = new THREE.Mesh(CYL, m);
  me.scale.set(r, r, len); me.position.set(x, y, z);
  me.castShadow = true; g.add(me);
  return me;
}

const BUILDERS = {
  pistol(g, R) {
    bx(g, 0.07, 0.075, 0.34, METAL(), 0, 0.07, -0.12);
    bx(g, 0.066, 0.05, 0.3, R, 0, 0.015, -0.1);
    bx(g, 0.066, 0.19, 0.09, R, 0, -0.08, 0.03, 0.25);
    bx(g, 0.02, 0.05, 0.08, METAL(), 0, -0.03, -0.07);
    bx(g, 0.02, 0.03, 0.02, METAL2(), 0, 0.12, -0.27);
    cy(g, 0.017, 0.04, METAL2(), 0, 0.065, -0.3);
    return -0.33;
  },
  smg(g, R) {
    bx(g, 0.09, 0.12, 0.42, R, 0, 0.03, -0.16);
    bx(g, 0.075, 0.05, 0.36, METAL(), 0, 0.115, -0.16);
    cy(g, 0.022, 0.16, METAL(), 0, 0.04, -0.44);
    cy(g, 0.034, 0.1, METAL2(), 0, 0.04, -0.53);
    bx(g, 0.05, 0.27, 0.07, METAL(), 0, -0.14, -0.2, 0.12);
    bx(g, 0.06, 0.16, 0.08, METAL(), 0, -0.1, 0.03, 0.22);
    bx(g, 0.045, 0.12, 0.05, METAL2(), 0, -0.08, -0.33);
    bx(g, 0.03, 0.03, 0.24, METAL(), 0, 0.05, 0.16);
    bx(g, 0.05, 0.13, 0.035, R, 0, 0.0, 0.28);
    return -0.58;
  },
  ar(g, R) {
    bx(g, 0.1, 0.13, 0.5, R, 0, 0.02, -0.15);
    bx(g, 0.07, 0.04, 0.48, METAL(), 0, 0.105, -0.15);
    bx(g, 0.086, 0.1, 0.32, METAL2(), 0, 0.02, -0.55);
    cy(g, 0.02, 0.24, METAL(), 0, 0.03, -0.8);
    cy(g, 0.032, 0.08, METAL(), 0, 0.03, -0.94);
    bx(g, 0.06, 0.23, 0.09, METAL(), 0, -0.14, -0.25, -0.28);
    bx(g, 0.06, 0.17, 0.08, METAL(), 0, -0.1, 0.0, 0.25);
    bx(g, 0.08, 0.12, 0.3, R, 0, 0.0, 0.24);
    bx(g, 0.086, 0.16, 0.04, METAL(), 0, -0.01, 0.4);
    bx(g, 0.05, 0.065, 0.1, METAL(), 0, 0.155, -0.1);
    bx(g, 0.032, 0.032, 0.012, mat(0xff2a2a, 10, 0xff0000), 0, 0.16, -0.045);
    bx(g, 0.02, 0.055, 0.02, METAL(), 0, 0.15, -0.66);
    return -0.99;
  },
  shotgun(g, R) {
    bx(g, 0.1, 0.13, 0.32, R, 0, 0.02, -0.1);
    cy(g, 0.03, 0.62, METAL(), 0, 0.06, -0.56);
    cy(g, 0.025, 0.5, METAL2(), 0, -0.01, -0.5);
    const pump = bx(g, 0.09, 0.085, 0.2, WOOD(), 0, -0.01, -0.48);
    bx(g, 0.075, 0.14, 0.36, WOOD(), 0, -0.05, 0.22, 0.15);
    bx(g, 0.062, 0.15, 0.08, WOOD(), 0, -0.1, 0.0, 0.3);
    bx(g, 0.022, 0.022, 0.022, mat(0xffd84d, 60), 0, 0.1, -0.84);
    bx(g, 0.104, 0.04, 0.18, METAL(), 0, 0.08, -0.08);
    g.userData.pump = pump;
    return -0.88;
  },
  sniper(g, R) {
    bx(g, 0.09, 0.12, 0.5, R, 0, 0.02, -0.1);
    cy(g, 0.021, 0.64, METAL(), 0, 0.04, -0.67);
    cy(g, 0.034, 0.1, METAL(), 0, 0.04, -1.02);
    cy(g, 0.043, 0.42, METAL(), 0, 0.17, -0.12);
    cy(g, 0.055, 0.07, METAL2(), 0, 0.17, -0.35);
    cy(g, 0.05, 0.06, METAL2(), 0, 0.17, 0.11);
    cy(g, 0.044, 0.006, mat(0x3366ff, 90, 0x2244cc), 0, 0.17, -0.388);
    bx(g, 0.03, 0.07, 0.03, METAL(), 0, 0.11, -0.25);
    bx(g, 0.03, 0.07, 0.03, METAL(), 0, 0.11, 0.0);
    bx(g, 0.1, 0.022, 0.022, METAL2(), 0.05, 0.06, 0.05);
    bx(g, 0.035, 0.035, 0.035, METAL(), 0.1, 0.06, 0.05);
    bx(g, 0.08, 0.15, 0.42, R, 0, -0.02, 0.33);
    bx(g, 0.07, 0.04, 0.2, METAL(), 0, 0.075, 0.3);
    bx(g, 0.06, 0.15, 0.08, METAL(), 0, -0.1, 0.05, 0.3);
    bx(g, 0.06, 0.1, 0.1, METAL(), 0, -0.08, -0.18);
    bx(g, 0.015, 0.2, 0.015, METAL(), 0.03, -0.08, -0.62, 0.5);
    bx(g, 0.015, 0.2, 0.015, METAL(), -0.03, -0.08, -0.62, 0.5);
    return -1.08;
  },
  pickaxe(g) {
    cy(g, 0.026, 0.9, mat(0x6b4f2a, 10), 0, 0, -0.4);
    bx(g, 0.04, 0.1, 0.12, mat(0x333333, 50), 0, 0, 0.02);
    const head = mat(0x9b6bff, 60, 0x4a1aa8, 0.6);
    bx(g, 0.07, 0.16, 0.12, head, 0, 0, -0.84);
    bx(g, 0.055, 0.3, 0.07, head, 0, 0.2, -0.79, 0.5);
    bx(g, 0.055, 0.3, 0.07, head, 0, -0.2, -0.79, -0.5);
    return -0.9;
  },
};

export function makeItemModel(type, rar = 0) {
  const g = new THREE.Group();
  const build = BUILDERS[type];
  if (build) {
    g.userData.muzzle = build(g, rarMat(Math.max(0, Math.min(4, rar | 0))));
    return g;
  }
  const C = CONSUMABLES[type];
  g.userData.muzzle = -0.2;
  if (!C) return g;
  if (type === 'bandage') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 14), mat(0xf4f1ea, 5));
    roll.rotation.z = Math.PI / 2; roll.castShadow = true; g.add(roll);
    bx(g, 0.17, 0.05, 0.2, mat(0xf4f1ea, 5), 0, -0.13, -0.1);
    bx(g, 0.03, 0.27, 0.27, mat(0xe03b3b, 10), 0, 0, 0);
  } else if (type === 'medkit') {
    bx(g, 0.5, 0.34, 0.24, mat(0xe63946, 30));
    bx(g, 0.24, 0.07, 0.26, mat(0xffffff, 10)); bx(g, 0.07, 0.24, 0.26, mat(0xffffff, 10));
    bx(g, 0.18, 0.05, 0.06, mat(0x333333, 40), 0, 0.19, 0);
  } else {
    const small = type === 'shield_s';
    const r = small ? 0.1 : 0.15, h = small ? 0.24 : 0.36;
    const glass = new THREE.MeshPhongMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.55, shininess: 100, specular: 0xffffff });
    const liquid = mat(C.color, 80, small ? 0x1a6fc4 : 0x1a3fd4, 0.9);
    const body = new THREE.Mesh(small ? SPH : new THREE.CylinderGeometry(1, 1, 1, 14), glass);
    if (small) body.scale.setScalar(r * 1.25); else body.scale.set(r, h, r);
    g.add(body);
    const liq = new THREE.Mesh(small ? SPH : new THREE.CylinderGeometry(1, 1, 1, 14), liquid);
    if (small) { liq.scale.setScalar(r * 1.05); liq.position.y = -0.01; } else { liq.scale.set(r * 0.88, h * 0.8, r * 0.88); liq.position.y = -h * 0.08; }
    g.add(liq);
    const neckY = small ? r * 1.2 : h / 2;
    cy(g, r * 0.35, 0.1, glass, 0, neckY + 0.04, 0).rotation.x = Math.PI / 2;
    bx(g, r * 0.8, 0.05, r * 0.8, mat(0xdddddd, 60), 0, neckY + 0.11, 0);
  }
  return g;
}

// ================================================================ ikony (render modelu do obrazka)
let iconR = null, iconScene = null, iconCam = null;
const iconCache = new Map();
const IW = 192, IH = 112;
export function itemIcon(type, rar = 0) {
  const key = type + ':' + rar;
  if (iconCache.has(key)) return iconCache.get(key);
  if (!iconR) {
    iconR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    iconR.setPixelRatio(1);
    iconR.setSize(IW, IH, false);
    iconScene = new THREE.Scene();
    iconScene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.4));
    const d = new THREE.DirectionalLight(0xffffff, 2.6); d.position.set(3, 4, 2); iconScene.add(d);
    iconCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  }
  const pivot = new THREE.Group();
  const m = makeItemModel(type, rar);
  pivot.add(m);
  if (WEAPONS[type] || type === 'pickaxe') { pivot.rotation.y = -0.18; pivot.rotation.x = 0.06; }
  else { pivot.rotation.y = 0.7; pivot.rotation.z = 0.25; }
  iconScene.add(pivot);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const aspect = IW / IH;
  const half = Math.max(size.z / aspect, size.y) * 0.58;
  Object.assign(iconCam, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
  iconCam.position.set(c.x + 5, c.y, c.z);
  iconCam.lookAt(c);
  iconCam.updateProjectionMatrix();
  iconR.setClearColor(0x000000, 0);
  iconR.render(iconScene, iconCam);
  const url = iconR.domElement.toDataURL();
  iconScene.remove(pivot);
  iconCache.set(key, url);
  return url;
}

// ================================================================ audio
let actx = null, noise = null, out = null;
export function ac() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    const len = actx.sampleRate * 2;
    noise = actx.createBuffer(1, len, actx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.15;
    out = actx.createGain(); out.gain.value = 0.9;
    out.connect(comp).connect(actx.destination);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function noiseLayer(t, filterType, f0, f1, q, peak, attack, decay) {
  const src = actx.createBufferSource(); src.buffer = noise;
  const f = actx.createBiquadFilter(); f.type = filterType; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  const g = actx.createGain(); env(g, t, peak, attack, decay);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5); src.stop(t + attack + decay + 0.05);
}
function tone(t, type, f0, f1, peak, attack, decay) {
  const o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + decay);
  const g = actx.createGain(); env(g, t, peak, attack, decay);
  o.connect(g).connect(out); o.start(t); o.stop(t + attack + decay + 0.05);
}
export function click(freq, vol = 0.2, delay = 0, dur = 0.025) {
  if (!actx) return;
  noiseLayer(actx.currentTime + delay, 'bandpass', freq, freq, 4, vol, 0.001, dur);
}

// [crack: freq, decay, vol] [body: freq, decay, vol] [thump: freq, decay, vol] [tail: freq, decay, vol]
const GUN_SND = {
  pistol: { crack: [3800, 0.03, 0.55], body: [2000, 0.08, 0.7], thump: [190, 0.07, 0.5], tail: [800, 0.35, 0.12] },
  smg: { crack: [4800, 0.022, 0.45], body: [2600, 0.055, 0.55], thump: [170, 0.05, 0.35], tail: [1000, 0.25, 0.08] },
  ar: { crack: [3200, 0.035, 0.65], body: [1600, 0.1, 0.8], thump: [120, 0.09, 0.75], tail: [650, 0.5, 0.16] },
  shotgun: { crack: [2400, 0.05, 0.75], body: [950, 0.22, 1.0], thump: [85, 0.2, 1.0], tail: [450, 0.9, 0.26], mech: 'pump' },
  sniper: { crack: [2800, 0.06, 1.0], body: [1150, 0.28, 1.0], thump: [65, 0.3, 1.0], tail: [380, 1.6, 0.32], mech: 'bolt' },
};

// dist = odległość od słuchacza; local = mój strzał
export function playShot(type, dist = 0, local = false) {
  if (!actx) return;
  const t = actx.currentTime;
  if (type === 'pickaxe') {
    const v = 1 / (1 + dist / 8);
    noiseLayer(t, 'bandpass', 500, 1600, 2, 0.35 * v, 0.02, 0.14);
    return;
  }
  const p = GUN_SND[type] || GUN_SND.ar;
  const vol = 1 / (1 + dist / 22);
  if (vol < 0.02) return;
  const far = Math.min(1, dist / 80);
  if (dist < 70) noiseLayer(t, 'highpass', p.crack[0], p.crack[0], 0.7, p.crack[2] * vol * (1 - far * 0.7), 0.0008, p.crack[1]);
  noiseLayer(t, 'lowpass', p.body[0] * (1 - far * 0.6), 180, 0.8, p.body[2] * vol, 0.001, p.body[1]);
  tone(t, 'sine', p.thump[0] * 2.2, p.thump[0] * 0.5, p.thump[2] * vol * (1 - far * 0.5), 0.001, p.thump[1]);
  noiseLayer(t + 0.01, 'lowpass', p.tail[0], 120, 0.5, p.tail[2] * vol * (0.6 + far), 0.02, p.tail[1]);
  if (local && p.mech === 'pump') { click(1400, 0.35, 0.32, 0.04); click(900, 0.4, 0.46, 0.05); }
  if (local && p.mech === 'bolt') { click(2200, 0.3, 0.5, 0.03); click(1500, 0.35, 0.68, 0.04); }
}
export function sndReloadStart() { click(1900, 0.3, 0, 0.03); click(700, 0.25, 0.06, 0.05); }
export function sndReloadEnd() { click(1200, 0.4, 0, 0.04); click(2600, 0.35, 0.09, 0.03); }
export function sndShell() { click(1700, 0.3, 0, 0.03); click(1100, 0.25, 0.05, 0.03); }
export function sndEquip() { click(2600, 0.25, 0, 0.025); click(1300, 0.3, 0.05, 0.035); }
export function sndDry() { click(3200, 0.3, 0, 0.015); }
export function sndHit(head, shield) {
  if (!actx) return;
  const t = actx.currentTime;
  if (head) {
    tone(t, 'sine', 1760, 1760, 0.28, 0.001, 0.35);
    tone(t, 'sine', 2640, 2640, 0.16, 0.001, 0.25);
    tone(t, 'triangle', 3520, 3520, 0.08, 0.001, 0.15);
  } else if (shield) {
    tone(t, 'triangle', 1500, 1300, 0.18, 0.001, 0.09);
    noiseLayer(t, 'highpass', 5000, 5000, 1, 0.12, 0.001, 0.06);
  } else {
    tone(t, 'square', 1150, 900, 0.1, 0.001, 0.05);
    noiseLayer(t, 'bandpass', 2500, 2500, 3, 0.2, 0.001, 0.03);
  }
}
export function sndKill() {
  if (!actx) return;
  const t = actx.currentTime;
  tone(t, 'sine', 160, 50, 0.6, 0.001, 0.3);
  tone(t + 0.04, 'triangle', 880, 880, 0.18, 0.005, 0.25);
  tone(t + 0.12, 'triangle', 1318, 1318, 0.18, 0.005, 0.35);
}
// uderzenie kilofem / kulą w obiekt: wood = drewno/ściana, stone = skała/metal
export function sndImpact(mat, vol = 1) {
  if (!actx) return;
  const t = actx.currentTime;
  if (mat === 'stone') {
    tone(t, 'triangle', 1200, 900, 0.18 * vol, 0.001, 0.12);
    noiseLayer(t, 'bandpass', 2400, 1500, 2, 0.35 * vol, 0.001, 0.08);
  } else {
    tone(t, 'sine', 210, 140, 0.45 * vol, 0.001, 0.12);
    noiseLayer(t, 'bandpass', 650, 400, 1.5, 0.45 * vol, 0.001, 0.09);
  }
}
export function sndBreak(mat, vol = 1) {
  if (!actx || vol < 0.03) return;
  const t = actx.currentTime;
  noiseLayer(t, 'lowpass', mat === 'stone' ? 1400 : 900, 90, 0.8, 0.8 * vol, 0.003, 0.7);
  tone(t, 'sine', 120, 40, 0.6 * vol, 0.002, 0.35);
  for (let i = 0; i < 5; i++) noiseLayer(t + 0.05 + Math.random() * 0.3, 'bandpass', 900 + Math.random() * 1500, null, 3, 0.25 * vol, 0.001, 0.04);
}
export function sndStep(dist = 0) {
  if (!actx) return;
  const v = 0.16 / (1 + dist / 5);
  if (v < 0.01) return;
  noiseLayer(actx.currentTime, 'bandpass', 260 + Math.random() * 120, 120, 1.2, v, 0.003, 0.07);
}
export function sndClimb() {
  if (!actx) return;
  const t = actx.currentTime;
  noiseLayer(t, 'bandpass', 700, 1600, 1.2, 0.22, 0.02, 0.18);
  click(500, 0.25, 0.12, 0.05);
}
export function sndSlide() {
  if (!actx) return;
  noiseLayer(actx.currentTime, 'bandpass', 1200, 400, 0.8, 0.3, 0.02, 0.7);
}
export function sndHurt() { if (actx) noiseLayer(actx.currentTime, 'lowpass', 600, 120, 1, 0.5, 0.002, 0.18); }
export function beep(freq, dur, type = 'square', vol = 0.12, delay = 0) {
  if (!actx) return;
  tone(actx.currentTime + delay, type, freq, freq, vol, 0.002, dur);
}

// ================================================================ efekty
let scene = null;
function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const softTex = () => canvasTex(64, (x, s) => {
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
});
const flashTex = () => canvasTex(128, (x, s) => {
  x.translate(s / 2, s / 2);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,220,120,0.9)'); g.addColorStop(1, 'rgba(255,140,30,0)');
  x.fillStyle = g;
  for (let i = 0; i < 6; i++) {
    x.rotate(Math.PI / 3);
    x.beginPath(); x.moveTo(0, -6); x.lineTo(s / 2, 0); x.lineTo(0, 6); x.fill();
  }
  x.beginPath(); x.arc(0, 0, s * 0.22, 0, Math.PI * 2); x.fill();
});

let SOFT, FLASH, sparkPts, sparkPos, sparkCol, sparkBase, sparkVel, sparkLife, sparkMax, sparkHead = 0;
const MAXP = 900;
const tracers = [], puffs = [], flashes = [], trails = [], debrisList = [];
let tracerMat, trailMat;

export function initFx(sc) {
  scene = sc;
  SOFT = softTex(); FLASH = flashTex();
  tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  sparkPos = new Float32Array(MAXP * 3).fill(-9999);
  sparkCol = new Float32Array(MAXP * 3);
  sparkBase = new Float32Array(MAXP * 3);
  sparkVel = new Float32Array(MAXP * 3);
  sparkLife = new Float32Array(MAXP);
  sparkMax = new Float32Array(MAXP).fill(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  sparkPts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, map: SOFT, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  sparkPts.frustumCulled = false;
  scene.add(sparkPts);
}

const _c = new THREE.Color();
export function sparks(p, color, n, speed = 6, up = 0.5) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const i = sparkHead; sparkHead = (sparkHead + 1) % MAXP;
    sparkPos[i * 3] = p.x; sparkPos[i * 3 + 1] = p.y; sparkPos[i * 3 + 2] = p.z;
    const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1 + up;
    const s = speed * (0.4 + Math.random() * 0.8);
    sparkVel[i * 3] = Math.cos(a) * s; sparkVel[i * 3 + 1] = e * s; sparkVel[i * 3 + 2] = Math.sin(a) * s;
    sparkBase[i * 3] = _c.r; sparkBase[i * 3 + 1] = _c.g; sparkBase[i * 3 + 2] = _c.b;
    sparkLife[i] = sparkMax[i] = 0.18 + Math.random() * 0.3;
  }
}

export function puff(p, color = 0xcfc6b8, size = 0.5, life = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SOFT, color, transparent: true, opacity: 0.55, depthWrite: false }));
  s.position.copy(p); s.scale.setScalar(size);
  scene.add(s);
  puffs.push({ s, life, max: life, size, vy: 0.6 });
}

export function muzzleFlash(p, size = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: Math.random() * Math.PI }));
  s.position.copy(p);
  s.scale.setScalar(size * (0.8 + Math.random() * 0.5));
  scene.add(s);
  flashes.push({ s, life: 0.05 });
}

// smuga lecąca od lufy do celu
export function tracer(a, b, opts = {}) {
  const len = a.distanceTo(b);
  if (len < 0.5) return;
  const m = new THREE.Mesh(BOX, tracerMat);
  const w = opts.width || 0.045;
  m.scale.set(w, w, 1);
  scene.add(m);
  tracers.push({ m, a: a.clone(), dir: b.clone().sub(a).divideScalar(len), len, head: 0, seg: Math.min(opts.seg || 7, len), speed: opts.speed || 230 });
  if (opts.trail) {
    const tm = new THREE.Mesh(BOX, trailMat.clone());
    tm.scale.set(0.03, 0.03, len);
    tm.position.copy(a).lerp(b, 0.5);
    tm.lookAt(b);
    scene.add(tm);
    trails.push({ m: tm, life: 1.4, max: 1.4 });
  }
}

// odłamki zniszczonego obiektu: center/size = pudełko obiektu, floorY = poziom podłogi
const debrisMats = new Map();
export function debris(center, size, color, floorY) {
  let m = debrisMats.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); debrisMats.set(color, m); }
  const vol = size.x * size.y * size.z;
  const n = Math.max(8, Math.min(26, Math.round(vol * 2.5)));
  const pieceMax = Math.min(0.4, Math.max(0.15, Math.cbrt(vol) * 0.22));
  for (let i = 0; i < n; i++) {
    const me = new THREE.Mesh(BOX, m);
    const sz = pieceMax * (0.4 + Math.random() * 0.6);
    me.scale.set(sz, sz * (0.5 + Math.random()), sz);
    me.position.set(center.x + (Math.random() - 0.5) * size.x, center.y + (Math.random() - 0.5) * size.y, center.z + (Math.random() - 0.5) * size.z);
    me.castShadow = true;
    scene.add(me);
    const vx = (me.position.x - center.x) * 3 + (Math.random() - 0.5) * 4;
    const vz = (me.position.z - center.z) * 3 + (Math.random() - 0.5) * 4;
    debrisList.push({ m: me, v: new THREE.Vector3(vx, 2 + Math.random() * 5, vz), av: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 1.6 + Math.random() * 0.8, sz: me.scale.clone(), floorY });
  }
  for (let i = 0; i < 4; i++) {
    puff(new THREE.Vector3(center.x + (Math.random() - 0.5) * size.x, center.y + (Math.random() - 0.5) * size.y * 0.6, center.z + (Math.random() - 0.5) * size.z), 0xcfc6b8, 1.2, 1.0);
  }
}

const _v = new THREE.Vector3();
export function updateFx(dt) {
  for (let i = debrisList.length - 1; i >= 0; i--) {
    const d = debrisList[i]; d.life -= dt;
    if (d.life <= 0) { scene.remove(d.m); debrisList.splice(i, 1); continue; }
    d.v.y -= 20 * dt;
    d.m.position.addScaledVector(d.v, dt);
    if (d.m.position.y < d.floorY + d.sz.y / 2) {
      d.m.position.y = d.floorY + d.sz.y / 2;
      d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.av.multiplyScalar(0.6);
    }
    d.m.rotation.x += d.av.x * dt; d.m.rotation.y += d.av.y * dt; d.m.rotation.z += d.av.z * dt;
    if (d.life < 0.4) d.m.scale.copy(d.sz).multiplyScalar(d.life / 0.4);
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.head += t.speed * dt;
    const head = Math.min(t.head, t.len), tail = Math.max(0, t.head - t.seg);
    if (tail >= t.len) { scene.remove(t.m); tracers.splice(i, 1); continue; }
    const segLen = Math.max(0.05, head - tail);
    t.m.position.copy(t.a).addScaledVector(t.dir, (head + tail) / 2);
    t.m.scale.z = segLen;
    t.m.lookAt(_v.copy(t.a).addScaledVector(t.dir, head + 1));
  }
  for (let i = trails.length - 1; i >= 0; i--) {
    const t = trails[i]; t.life -= dt;
    t.m.material.opacity = 0.35 * (t.life / t.max);
    t.m.scale.x = t.m.scale.y = 0.03 + (1 - t.life / t.max) * 0.08;
    if (t.life <= 0) { scene.remove(t.m); t.m.material.dispose(); trails.splice(i, 1); }
  }
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.life -= dt;
    if (f.life <= 0) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); }
  }
  for (let i = puffs.length - 1; i >= 0; i--) {
    const p = puffs[i]; p.life -= dt;
    const k = 1 - p.life / p.max;
    p.s.scale.setScalar(p.size * (1 + k * 2.2));
    p.s.position.y += p.vy * dt;
    p.s.material.opacity = 0.55 * (1 - k);
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); }
  }
  for (let i = 0; i < MAXP; i++) {
    if (sparkLife[i] <= 0) continue;
    sparkLife[i] -= dt;
    const j = i * 3;
    if (sparkLife[i] <= 0) { sparkPos[j + 1] = -9999; sparkCol[j] = sparkCol[j + 1] = sparkCol[j + 2] = 0; continue; }
    sparkVel[j + 1] -= 16 * dt;
    sparkPos[j] += sparkVel[j] * dt; sparkPos[j + 1] += sparkVel[j + 1] * dt; sparkPos[j + 2] += sparkVel[j + 2] * dt;
    const k = sparkLife[i] / sparkMax[i];
    sparkCol[j] = sparkBase[j] * k; sparkCol[j + 1] = sparkBase[j + 1] * k; sparkCol[j + 2] = sparkBase[j + 2] * k;
  }
  if (sparkPts) {
    sparkPts.geometry.attributes.position.needsUpdate = true;
    sparkPts.geometry.attributes.color.needsUpdate = true;
  }
}
