// Fortjede — postacie: model, stroje, proceduralne animacje z IK rąk
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeItemModel } from './gunfx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const geoCache = new Map();
function rbox(w, h, d, r = 0.05) {
  const key = `${w}|${h}|${d}|${r}`;
  let g = geoCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); geoCache.set(key, g); }
  return g;
}
const matCache = new Map();
function mat(c, rough = 0.75) {
  const key = c + '|' + rough;
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough }); matCache.set(key, m); }
  return m;
}
function part(parent, geo, m, x = 0, y = 0, z = 0) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  parent.add(me);
  return me;
}

// stroje: [koszulka, spodnie, buty, akcent]
const OUTFITS = [
  [0x3a86ff, 0x2b2d42, 0xf4f4f4, 0xffbe0b], [0xff006e, 0x3d3d5c, 0x222222, 0x8338ec], [0x2ec4b6, 0x1b4965, 0xffffff, 0xff9f1c],
  [0xfb5607, 0x3a3a3a, 0x8d5524, 0xffd166], [0x8338ec, 0x22223b, 0xeeeeee, 0x06d6a0], [0x06d6a0, 0x264653, 0x333333, 0xef476f],
  [0xffd166, 0x5c4033, 0x222222, 0x118ab2], [0xef476f, 0x073b4c, 0xf8f8f8, 0x06d6a0], [0x90be6d, 0x4a4e69, 0x6b4226, 0xf94144],
  [0xf8f9fa, 0x1d3557, 0xe63946, 0x457b9d],
];
const SKINS = [0xffd3b0, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffe0c4];
const HAIRS = [0x2b1b0e, 0x6b3e1e, 0xe6c35c, 0x111111, 0xb5361b, 0x5b5bff, 0xff7eb6, 0xf2f2f2];
const BOT_OUTFIT = [0x9c8a6e, 0x4a3b2a, 0x2b2b2b, 0xffd27a];

// teamColor: kolor drużyny — nick kolegi z drużyny widać przez ściany
export function makeNameSprite(name, bot, teamColor = null) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = '600 30px Rubik, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const w = Math.min(250, x.measureText(name).width + 24);
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(128 - w / 2, 12, w, 40);
  if (teamColor) { x.fillStyle = teamColor; x.fillRect(128 - w / 2, 48, w, 4); }
  x.fillStyle = teamColor || (bot ? '#ffd27a' : '#ffffff'); x.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: !teamColor, transparent: true }));
  s.scale.set(2, 0.5, 1); s.position.y = 2.35;
  if (teamColor) { s.renderOrder = 999; s.material.sizeAttenuation = false; s.scale.set(0.16, 0.04, 1); }
  return s;
}

const UPPER = 0.34, FORE = 0.34, THIGH = 0.45, SHIN = 0.43;
export const GUN_POS = new THREE.Vector3(0.16, 0.3, -0.22);
const AIM_TWIST = 0.35; // tułów obrócony lewym barkiem do przodu przy broni długiej

export function createAvatar(id, name, bot) {
  const [shirt, pants, shoes, accent] = bot ? BOT_OUTFIT : OUTFITS[id % OUTFITS.length];
  const skin = SKINS[(id * 3) % SKINS.length], hairC = HAIRS[(id * 5) % HAIRS.length];
  const mShirt = mat(shirt, 0.8), mPants = mat(pants, 0.85), mShoes = mat(shoes, 0.6), mAcc = mat(accent, 0.7), mSkin = mat(skin, 0.65), mHair = mat(hairC, 0.8);

  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 1.0; root.add(body);

  // nogi
  const hips = new THREE.Group(); hips.position.y = -0.08; body.add(hips);
  part(hips, rbox(0.42, 0.22, 0.26, 0.07), mPants, 0, 0.02, 0);
  const legs = [];
  for (const sx of [-1, 1]) {
    const thigh = new THREE.Group(); thigh.position.set(0.12 * sx, -0.04, 0); hips.add(thigh);
    part(thigh, rbox(0.19, THIGH + 0.04, 0.21, 0.07), mPants, 0, -THIGH / 2, 0);
    const shin = new THREE.Group(); shin.position.y = -THIGH; thigh.add(shin);
    part(shin, rbox(0.17, SHIN, 0.19, 0.06), mPants, 0, -SHIN / 2, 0);
    part(shin, rbox(0.2, 0.13, 0.33, 0.05), mShoes, 0, -SHIN - 0.02, -0.05);
    part(shin, rbox(0.205, 0.04, 0.34, 0.02), mat(0xffffff, 0.6), 0, -SHIN - 0.075, -0.05);
    legs.push({ thigh, shin });
  }

  // tułów
  const torso = new THREE.Group(); torso.position.y = 0.02; body.add(torso);
  part(torso, rbox(0.52, 0.58, 0.3, 0.1), mShirt, 0, 0.27, 0);
  part(torso, rbox(0.54, 0.09, 0.32, 0.04), mat(0x2a2a2a, 0.6), 0, 0.0, 0); // pasek
  part(torso, rbox(0.12, 0.08, 0.04, 0.02), mat(0xd9b44a, 0.3), 0, 0.0, -0.16); // klamra
  part(torso, rbox(0.5, 0.1, 0.31, 0.04), mAcc, 0, 0.47, 0); // pas na piersi / kołnierz
  part(torso, rbox(0.38, 0.42, 0.18, 0.08), mAcc, 0, 0.3, 0.23); // plecak
  part(torso, rbox(0.3, 0.12, 0.05, 0.03), mat(0x222222, 0.6), 0, 0.2, 0.33);
  // głowa
  const head = new THREE.Group(); head.position.y = 0.6; torso.add(head);
  part(head, rbox(0.15, 0.1, 0.15, 0.04), mSkin, 0, -0.02, 0); // szyja
  part(head, rbox(0.4, 0.42, 0.38, 0.13), mSkin, 0, 0.2, 0);
  const white = mat(0xffffff, 0.3), black = mat(0x151515, 0.3);
  for (const sx of [-1, 1]) {
    part(head, rbox(0.1, 0.11, 0.03, 0.02), white, 0.085 * sx, 0.23, -0.19);
    part(head, rbox(0.055, 0.07, 0.02, 0.015), black, 0.085 * sx + 0.01 * sx, 0.225, -0.205);
    part(head, rbox(0.11, 0.03, 0.03, 0.01), mat(hairC === 0xf2f2f2 ? 0x777777 : hairC, 0.8), 0.085 * sx, 0.31, -0.19);
  }
  part(head, rbox(0.12, 0.025, 0.02, 0.01), mat(0x8a3b2b, 0.6), 0, 0.11, -0.19);
  const style = bot ? 2 : (id * 7) % 4;
  if (style === 0) { part(head, rbox(0.43, 0.14, 0.41, 0.06), mHair, 0, 0.39, 0.01); part(head, rbox(0.43, 0.25, 0.1, 0.04), mHair, 0, 0.3, 0.16); }
  else if (style === 1) {
    part(head, rbox(0.42, 0.1, 0.4, 0.04), mHair, 0, 0.4, 0);
    for (let i = 0; i < 5; i++) { const sp = part(head, new THREE.ConeGeometry(0.07, 0.2, 5), mHair, -0.14 + i * 0.07, 0.5, 0.02 - (i % 2) * 0.08); sp.rotation.x = 0.4; }
  } else if (style === 2) { // czapka z daszkiem
    part(head, rbox(0.43, 0.17, 0.41, 0.08), mAcc, 0, 0.4, 0.01);
    part(head, rbox(0.38, 0.04, 0.2, 0.02), mAcc, 0, 0.34, -0.25);
  } else { part(head, rbox(0.43, 0.13, 0.41, 0.06), mHair, 0, 0.39, 0.01); part(head, rbox(0.42, 0.42, 0.12, 0.05), mHair, 0, 0.18, 0.18); }

  // ręce
  const arms = [];
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(0.3 * sx, 0.48, 0); torso.add(shoulder);
    part(shoulder, rbox(0.17, 0.13, 0.19, 0.06), mShirt, 0, -0.02, 0); // bark
    part(shoulder, rbox(0.14, UPPER, 0.15, 0.06), mShirt, 0, -UPPER / 2, 0);
    const elbow = new THREE.Group(); elbow.position.y = -UPPER; shoulder.add(elbow);
    part(elbow, rbox(0.12, FORE, 0.13, 0.05), mSkin, 0, -FORE / 2, 0);
    part(elbow, rbox(0.14, 0.14, 0.14, 0.06), mat(0x2a2a2a, 0.6), 0, -FORE - 0.02, 0); // rękawica
    arms.push({ shoulder, elbow, sx });
  }

  const gunHolder = new THREE.Group(); gunHolder.position.copy(GUN_POS); gunHolder.scale.setScalar(1.35); torso.add(gunHolder);

  const glider = new THREE.Group(); glider.position.y = 1.35; torso.add(glider);
  const gl = mat(shirt, 0.6), gl2 = mat(accent, 0.6);
  part(glider, rbox(3.4, 0.08, 1.2, 0.04), gl, 0, 0.55, 0);
  part(glider, rbox(1.1, 0.09, 1.21, 0.04), gl2, 0, 0.56, 0);
  part(glider, rbox(3.5, 0.1, 0.12, 0.04), mat(0x222222, 0.5), 0, 0.57, -0.62);
  part(glider, rbox(0.03, 0.55, 0.03, 0.01), mat(0xdddddd, 0.5), -0.6, 0.27, 0);
  part(glider, rbox(0.03, 0.55, 0.03, 0.01), mat(0xdddddd, 0.5), 0.6, 0.27, 0);
  part(glider, rbox(1.3, 0.05, 0.05, 0.02), mat(0x333333, 0.5), 0, -0.02, 0);
  glider.visible = false;

  const tag = makeNameSprite(name, bot);
  root.add(tag);

  return {
    root, body, hips, torso, head, legs, arms, gunHolder, glider, tag, name,
    held: null, gun: null, phase: 0, swing: 0, kick: 0, equipT: 0, pumpT: 0, rl: 0, reloading: false,
    land: 0, wasAir: false, hipYaw: 0, lean: 0, speedS: 0, t: Math.random() * 10, lastStep: 0, cr: 0, sl: 0,
  };
}

// ---------------------------------------------------------------- IK ręki (2 kości)
const DOWN = new THREE.Vector3(0, -1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3(), _el = new THREE.Vector3(), _f = new THREE.Vector3(), _qi = new THREE.Quaternion();
function solveArm(arm, target, pole) {
  const { shoulder, elbow } = arm;
  _d.copy(target).sub(shoulder.position);
  const dist = clamp(_d.length(), 0.08, UPPER + FORE - 0.002);
  _d.normalize();
  const cosA = clamp((UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
  _p.normalize();
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA);
  shoulder.quaternion.setFromUnitVectors(DOWN, _u);
  _el.copy(shoulder.position).addScaledVector(_u, UPPER);
  _f.copy(target).sub(_el).normalize();
  _qi.copy(shoulder.quaternion).invert();
  _f.applyQuaternion(_qi);
  elbow.quaternion.setFromUnitVectors(DOWN, _f);
}
const POLE_R = new THREE.Vector3(1, -1.2, 0.4).normalize(), POLE_L = new THREE.Vector3(-1, -1.2, 0.4).normalize();
const _tR = new THREE.Vector3(), _tL = new THREE.Vector3();

// ---------------------------------------------------------------- animacja
// st: { mode, vx, vz, vy, onGround, rx, held, ry, crouch, slide }
// zwraca true w chwili postawienia stopy (do dźwięku kroków)
export function animateAvatar(av, st, dt) {
  av.t += dt;
  if (av.held !== st.held) {
    av.gunHolder.clear();
    const m = /^([a-z_]+?)(\d)?$/.exec(st.held || 'pickaxe');
    av.gun = makeItemModel(m ? m[1] : 'pickaxe', m ? +(m[2] || 0) : 0);
    av.gunHolder.add(av.gun);
    av.held = st.held;
    av.equipT = 0.25;
  }
  const mode = st.mode;
  av.glider.visible = mode === 'glide';
  const air = mode === 'ground' && !st.onGround;
  if (mode === 'ground' && av.wasAir && st.onGround) av.land = 1;
  av.wasAir = mode !== 'ground' || !st.onGround;
  av.land = Math.max(0, av.land - dt * 5);

  // prędkość względem kierunku patrzenia
  const ry = st.ry;
  const fwdX = -Math.sin(ry), fwdZ = -Math.cos(ry);
  const sp = Math.hypot(st.vx, st.vz);
  av.speedS += (sp - av.speedS) * Math.min(1, dt * 10);
  const k = clamp(av.speedS / 6.2, 0, 1.4);
  const fwd = sp > 0.1 ? (st.vx * fwdX + st.vz * fwdZ) / sp : 1;
  const side = sp > 0.1 ? (st.vx * -fwdZ + st.vz * fwdX) / sp : 0;
  const back = fwd < -0.3;
  let targetYaw = sp > 0.5 ? (back ? Math.atan2(side, -fwd) : Math.atan2(-side, fwd)) : 0;
  targetYaw = clamp(targetYaw, -1.0, 1.0);
  av.hipYaw += (targetYaw - av.hipYaw) * Math.min(1, dt * 10);

  let stepped = false;
  const [L, Rr] = av.legs;
  const [AL, AR] = av.arms;
  av.body.rotation.set(0, 0, 0);
  av.body.position.y = 1.0;
  av.root.scale.set(1, 1, 1);

  if (mode === 'sky') {
    av.body.rotation.x = -1.3;
    av.hips.rotation.set(0, 0, 0);
    L.thigh.rotation.set(0.25, 0, -0.35); Rr.thigh.rotation.set(0.25, 0, 0.35);
    L.shin.rotation.set(-0.6, 0, 0); Rr.shin.rotation.set(-0.6, 0, 0);
    AL.shoulder.rotation.set(0, 0, -1.4); AR.shoulder.rotation.set(0, 0, 1.4);
    AL.elbow.rotation.set(0, 0, -0.3); AR.elbow.rotation.set(0, 0, 0.3);
    av.torso.rotation.set(0, 0, Math.sin(av.t * 2) * 0.05);
    av.head.rotation.set(0.9, 0, 0);
    av.gunHolder.visible = false;
    return false;
  }
  if (mode === 'glide') {
    av.hips.rotation.set(0, 0, 0);
    const sw = Math.sin(av.t * 2.2) * 0.15;
    L.thigh.rotation.set(0.35 + sw, 0, -0.05); Rr.thigh.rotation.set(0.15 - sw, 0, 0.05);
    L.shin.rotation.set(-0.5, 0, 0); Rr.shin.rotation.set(-0.3, 0, 0);
    av.torso.rotation.set(0.1, 0, 0);
    av.head.rotation.set(0.15, 0, 0);
    solveArm(AL, _tL.set(-0.55, 1.36, -0.02), POLE_L);
    solveArm(AR, _tR.set(0.55, 1.36, -0.02), POLE_R);
    av.gunHolder.visible = false;
    return false;
  }

  if (mode === 'climb') { // podciąganie się na krawędź
    av.hips.rotation.set(0, 0, 0);
    const c = Math.sin(av.t * 14) * 0.3;
    L.thigh.rotation.set(1.3 + c, 0, -0.05); Rr.thigh.rotation.set(0.5 - c, 0, 0.05);
    L.shin.rotation.set(-1.6, 0, 0); Rr.shin.rotation.set(-1.1, 0, 0);
    av.torso.rotation.set(-0.35, 0, 0);
    av.head.rotation.set(0.35, 0, 0);
    solveArm(AL, _tL.set(-0.26, 1.05, -0.42), POLE_L);
    solveArm(AR, _tR.set(0.26, 1.05, -0.42), POLE_R);
    av.gunHolder.visible = false;
    av.cr = st.crouch ? 1 : 0; av.sl = 0;
    return false;
  }
  av.cr += ((st.crouch && !st.slide ? 1 : 0) - av.cr) * Math.min(1, dt * 12);
  av.sl += ((st.slide ? 1 : 0) - av.sl) * Math.min(1, dt * 14);

  // ---- nogi
  if (air) {
    av.hips.rotation.set(0, 0, 0);
    L.thigh.rotation.set(0.7, 0, -0.05); Rr.thigh.rotation.set(-0.1, 0, 0.05);
    L.shin.rotation.set(-1.1, 0, 0); Rr.shin.rotation.set(-0.5, 0, 0);
  } else if (av.speedS > 0.3) {
    const prev = av.phase;
    av.phase += dt * (5 + av.speedS * 1.15) * (back ? -1 : 1);
    if (Math.floor(prev / Math.PI) !== Math.floor(av.phase / Math.PI)) stepped = true;
    const a = Math.sin(av.phase), c = Math.cos(av.phase);
    const amp = 0.55 * k;
    av.hips.rotation.set(0, av.hipYaw, 0);
    L.thigh.rotation.set(a * amp, 0, 0);
    Rr.thigh.rotation.set(-a * amp, 0, 0);
    L.shin.rotation.set(-(0.1 + Math.max(0, c * (back ? -1 : 1)) * 1.2) * k, 0, 0);
    Rr.shin.rotation.set(-(0.1 + Math.max(0, -c * (back ? -1 : 1)) * 1.2) * k, 0, 0);
    av.body.position.y = 1.0 + Math.abs(Math.sin(av.phase)) * 0.055 * k - 0.03 * k;
  } else {
    av.phase = 0;
    av.hips.rotation.set(0, av.hipYaw * 0.5, 0);
    L.thigh.rotation.set(0.05, 0, -0.04); Rr.thigh.rotation.set(-0.08, 0, 0.04);
    L.shin.rotation.set(-0.08, 0, 0); Rr.shin.rotation.set(-0.05, 0, 0);
  }
  // kucanie: zgięte kolana, niżej biodra (stopy zostają na ziemi)
  if (av.cr > 0.01) {
    const c = av.cr;
    for (const leg of av.legs) {
      leg.thigh.rotation.x = leg.thigh.rotation.x * (1 - 0.5 * c) + 1.15 * c;
      leg.shin.rotation.x = leg.shin.rotation.x * (1 - 0.4 * c) - 1.75 * c;
    }
    av.body.position.y -= 0.36 * c;
  }
  // ślizg: jedna noga wyprostowana do przodu, druga podwinięta, tułów odchylony
  if (av.sl > 0.01) {
    const c = av.sl;
    av.hips.rotation.y *= 1 - c;
    L.thigh.rotation.set(L.thigh.rotation.x * (1 - c) + 1.45 * c, 0, 0);
    L.shin.rotation.set(L.shin.rotation.x * (1 - c) - 0.15 * c, 0, 0);
    Rr.thigh.rotation.set(Rr.thigh.rotation.x * (1 - c) + 0.55 * c, 0, 0.1 * c);
    Rr.shin.rotation.set(Rr.shin.rotation.x * (1 - c) - 1.9 * c, 0, 0);
    av.body.position.y -= 0.52 * c;
  }
  // przysiad po wylądowaniu
  if (av.land > 0) {
    const q = Math.sin(av.land * Math.PI) * 0.12;
    av.body.position.y -= q;
    L.thigh.rotation.x += q * 3; Rr.thigh.rotation.x += q * 3;
    L.shin.rotation.x -= q * 6; Rr.shin.rotation.x -= q * 6;
  }

  // ---- tułów
  const pitch = clamp(st.rx, -1.1, 1.1);
  const lean = air ? 0 : -0.12 * k * (back ? -0.5 : 1) * (1 - av.sl) - 0.22 * av.cr + 0.3 * av.sl;
  av.lean += (lean - av.lean) * Math.min(1, dt * 8);
  const breathe = Math.sin(av.t * 2.2) * 0.012;
  const heldType = /^([a-z_]+?)\d?$/.exec(av.held || '')?.[1] || 'pickaxe';
  const longGun = /^(ar|smg|shotgun|sniper)$/.test(heldType);
  const twist = longGun ? AIM_TWIST : 0;
  av.torso.rotation.set(av.lean + pitch * 0.3, -av.hipYaw * 0.15 - twist, Math.sin(av.phase) * 0.04 * k);
  av.torso.position.y = 0.02 + breathe;
  av.head.rotation.set(pitch * 0.4 - av.lean * 0.6, 0, 0);

  // ---- broń i ręce (IK do chwytów broni)
  av.kick = Math.max(0, av.kick - dt * 9);
  av.equipT = Math.max(0, av.equipT - dt);
  av.rl += ((av.reloading ? 1 : 0) - av.rl) * Math.min(1, dt * 12);
  const kk = av.kick * av.kick, eq = av.equipT / 0.25, rl = av.rl;
  let swing = 0;
  if (av.swing > 0) {
    av.swing = Math.max(0, av.swing - dt);
    const ph = 1 - av.swing / 0.3;
    swing = ph < 0.3 ? (ph / 0.3) * 0.9 : ph < 0.55 ? 0.9 - ((ph - 0.3) / 0.25) * 1.6 : -0.7 * (1 - (ph - 0.55) / 0.45);
  }
  const runBob = Math.sin(av.phase * 2) * 0.012 * k;
  const gh = av.gunHolder;
  gh.visible = true;
  gh.position.set(GUN_POS.x, GUN_POS.y - eq * 0.25 - rl * 0.1 + runBob, GUN_POS.z + kk * 0.12);
  gh.rotation.set(pitch * 0.7 + kk * 0.3 + swing - eq * 0.9 - rl * 0.45, twist, rl * 0.6, 'YXZ');
  // pompka strzelby
  const pump = av.gun && av.gun.userData.pump;
  let pumpOff = 0;
  if (pump) {
    if (pump.userData.z0 === undefined) pump.userData.z0 = pump.position.z;
    if (av.pumpT > 0) { av.pumpT -= dt; if (av.pumpT < 0.32) pumpOff = Math.sin((1 - av.pumpT / 0.32) * Math.PI) * 0.14; }
    pump.position.z = pump.userData.z0 + pumpOff;
  }
  gh.updateMatrix();
  const type = heldType;
  const muzzle = av.gun ? av.gun.userData.muzzle ?? -0.5 : -0.5;
  if (type === 'pickaxe') {
    _tR.set(0, 0, 0.0); _tL.set(0, 0, -0.28);
  } else if (type === 'pistol') {
    _tR.set(0, -0.08, 0.03); _tL.set(-0.03, -0.09, 0.0);
  } else if (/^(ar|smg|shotgun|sniper)$/.test(type)) {
    _tR.set(0, -0.09, 0.02);
    _tL.set(0, -0.05, muzzle * (type === 'shotgun' ? 0.42 : 0.27) + pumpOff);
    if (rl > 0.05) _tL.lerp(_tR.clone().add(new THREE.Vector3(-0.05, -0.18 + Math.sin(av.t * 9) * 0.05, -0.2)), rl);
  } else { // przedmiot do leczenia trzymany oburącz
    _tR.set(0.1, -0.02, 0.02); _tL.set(-0.1, -0.02, 0.02);
  }
  _tR.applyMatrix4(gh.matrix); _tL.applyMatrix4(gh.matrix);
  solveArm(AR, _tR, POLE_R);
  solveArm(AL, _tL, POLE_L);
  return stepped;
}

const _mz = new THREE.Vector3();
export function muzzleOf(av) {
  av.root.updateMatrixWorld(true);
  const g = av.gun;
  if (!g || !av.gunHolder.visible) return av.root.localToWorld(_mz.set(0.3, 1.4, -0.6)).clone();
  return g.localToWorld(_mz.set(0, 0.04, g.userData.muzzle ?? -0.5)).clone();
}
