// Fortjede — oprawa graficzna: niebo, woda, teren, faktury, roślinność, dekoracje domów, postprocessing
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { mulberry32, WATER_Y } from './shared.js';

export const uTime = { value: 0 };
export const SUN_DIR = new THREE.Vector3(0.45, 0.8, 0.35).normalize();
export const HORIZON = new THREE.Color(0xc4e9ff);

export const QUALITY = {
  low: { name: 'Niska', pixelRatio: 1, post: false, ao: false, msaa: 0, grassR: 0, flowers: 400, shadow: 1024 },
  medium: { name: 'Średnia', pixelRatio: 1.25, post: true, ao: false, msaa: 4, grassR: 34, flowers: 1200, shadow: 2048 },
  high: { name: 'Wysoka', pixelRatio: 2, post: true, ao: true, msaa: 4, grassR: 52, flowers: 2400, shadow: 4096 },
};

// ================================================================ szum
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) { return vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15; }

// ================================================================ faktury proceduralne (canvas)
function canvasTex(size, draw, { color = true, repeat = null } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  draw(x, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.repeat.set(repeat, repeat);
  return t;
}
const rnd = mulberry32(1337);
const shade = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
function speckle(x, s, n, min, max, r = 2) {
  for (let i = 0; i < n; i++) { x.fillStyle = shade(min + rnd() * (max - min)); x.fillRect(rnd() * s, rnd() * s, r * (0.5 + rnd()), r * (0.5 + rnd())); }
}

const TEX = {};
function makeTextures() {
  TEX.grass = canvasTex(256, (x, s) => {
    x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) {
      const v = 190 + rnd() * 65;
      x.strokeStyle = shade(v); x.lineWidth = 1 + rnd();
      const px = rnd() * s, py = rnd() * s, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9, l = 3 + rnd() * 6;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
  });
  TEX.plaster = canvasTex(256, (x, s) => {
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(0,0,0,${0.02 + rnd() * 0.04})`; x.beginPath(); x.arc(rnd() * s, rnd() * s, 8 + rnd() * 30, 0, 7); x.fill(); }
    speckle(x, s, 1500, 205, 245, 1.5);
  });
  TEX.planks = canvasTex(256, (x, s) => {
    const rows = 8, h = s / rows;
    for (let r = 0; r < rows; r++) {
      const v = 215 + rnd() * 35;
      x.fillStyle = shade(v); x.fillRect(0, r * h, s, h);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, r * h, s, 3);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, r * h + h - 4, s, 4);
      for (let g = 0; g < 7; g++) { x.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; x.fillRect(0, r * h + 4 + rnd() * (h - 10), s, 1); }
      const joint = rnd() * s;
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(joint, r * h, 3, h);
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(joint + 10, r * h + h / 2, 3, 3); x.fillRect(joint - 12, r * h + h / 2, 3, 3);
    }
  });
  TEX.brick = canvasTex(256, (x, s) => {
    x.fillStyle = '#d9d4cc'; x.fillRect(0, 0, s, s);
    const rows = 10, h = s / rows, w = s / 4;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 5; c++) {
        const ox = (r % 2) * w / 2;
        const v = rnd();
        x.fillStyle = `rgb(${170 + v * 50},${80 + v * 30},${60 + v * 25})`;
        x.fillRect(c * w + ox + 3, r * h + 3, w - 6, h - 6);
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(c * w + ox + 3, r * h + h - 7, w - 6, 4);
      }
    }
    speckle(x, s, 800, 120, 220, 1.5);
  });
  TEX.roof = canvasTex(256, (x, s) => {
    const rows = 8, h = s / rows, w = s / 6;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < 7; c++) {
        const ox = (r % 2) * w / 2, v = 200 + rnd() * 50;
        const g = x.createLinearGradient(0, r * h, 0, r * h + h);
        g.addColorStop(0, shade(v)); g.addColorStop(1, shade(v * 0.6));
        x.fillStyle = g;
        x.beginPath(); x.moveTo(c * w + ox + 2, r * h); x.lineTo(c * w + ox + w - 2, r * h);
        x.lineTo(c * w + ox + w - 2, r * h + h * 0.7); x.quadraticCurveTo(c * w + ox + w / 2, r * h + h * 1.15, c * w + ox + 2, r * h + h * 0.7); x.fill();
      }
    }
  });
  TEX.crate = canvasTex(128, (x, s) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 4; i++) { x.fillStyle = shade(190 + rnd() * 50); x.fillRect(0, i * s / 4 + 2, s, s / 4 - 4); }
    x.strokeStyle = '#8a8a8a'; x.lineWidth = 12; x.strokeRect(6, 6, s - 12, s - 12);
    x.lineWidth = 10; x.beginPath(); x.moveTo(10, 10); x.lineTo(s - 10, s - 10); x.stroke();
  });
  TEX.metal = canvasTex(128, (x, s) => {
    for (let i = 0; i < s; i++) { const v = 170 + 70 * (0.5 + 0.5 * Math.sin((i / s) * Math.PI * 2 * 8)); x.fillStyle = shade(v); x.fillRect(i, 0, 1, s); }
    speckle(x, s, 300, 120, 200, 1.5);
  });
  TEX.wood = canvasTex(256, (x, s) => {
    const n = 6, w = s / n;
    for (let i = 0; i < n; i++) {
      x.fillStyle = shade(205 + rnd() * 40); x.fillRect(i * w, 0, w, s);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(i * w + w - 3, 0, 3, s);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * w, rnd() * s, w, 3);
      for (let g = 0; g < 6; g++) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i * w + 3 + rnd() * (w - 8), 0, 1, s); }
    }
  });
  TEX.bark = canvasTex(128, (x, s) => {
    x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { x.fillStyle = shade(120 + rnd() * 80); x.fillRect(rnd() * s, 0, 2 + rnd() * 3, s); }
  });
  TEX.waterN = canvasTex(256, (x, s) => {
    const img = x.createImageData(s, s);
    const H = (u, v) => Math.sin(u * 6.283 * 3 + Math.sin(v * 6.283 * 2) * 1.5) * 0.5 + Math.sin(v * 6.283 * 5 + u * 6.283 * 2) * 0.35 + Math.sin((u + v) * 6.283 * 7) * 0.15;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const u = i / s, v = j / s, e = 1 / s;
      const dx = (H(u + e, v) - H(u - e, v)) * 6, dz = (H(u, v + e) - H(u, v - e)) * 6;
      const nx = -dx, ny = -dz, nz = 1, l = Math.hypot(nx, ny, nz);
      const k = (j * s + i) * 4;
      img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { color: false });
}

// materiał z mapowaniem faktury we współrzędnych świata (pudełka mają różne rozmiary)
function worldMat(map, scale, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0, color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTexScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vec4 wpp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpp = instanceMatrix * wpp;
        #endif
        vWPos = (modelMatrix * wpp).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nuniform float uTexScale;')
      .replace('#include <map_fragment>', `
        vec3 an = abs(vWNrm);
        vec2 tuv = an.x > 0.5 ? vec2(vWPos.z, vWPos.y) : (an.y > 0.5 ? vWPos.xz : vec2(vWPos.x, vWPos.y));
        diffuseColor *= texture2D(map, tuv * uTexScale);`);
  };
  m.customProgramCacheKey = () => 'worldmat';
  return m;
}

// kołysanie na wietrze (amp w metrach, heightBased: grubość efektu rośnie z wysokością wierzchołka)
function addWind(m, amp, heightBased) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ipos = vec3(0.0);
        #ifdef USE_INSTANCING
          ipos = instanceMatrix[3].xyz;
        #endif
        float wk = ${heightBased ? 'max(position.y, 0.0)' : '1.0'};
        float wv = sin(uTime * 1.7 + ipos.x * 0.21 + ipos.z * 0.17) + 0.4 * sin(uTime * 3.1 + ipos.z * 0.5);
        transformed.x += wv * ${amp.toFixed(3)} * wk;
        transformed.z += wv * ${(amp * 0.6).toFixed(3)} * wk;`);
  };
  m.customProgramCacheKey = () => `wind${amp}${heightBased}`;
  return m;
}

// ================================================================ niebo
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2b78de) }, horizon: { value: HORIZON.clone() }, bottom: { value: new THREE.Color(0x9ad3f2) },
      sunDir: { value: SUN_DIR }, storm: { value: 0 }, stormCol: { value: new THREE.Color(0x3d1466) },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform float storm; uniform vec3 stormCol;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(min(h * 1.4, 1.0), 0.7)) : mix(horizon, bottom, min(1.0, -h * 5.0));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12);
        col = mix(col, stormCol, storm * 0.75);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

// ================================================================ środowisko
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
const Y = new THREE.Vector3(0, 1, 0);

function displaceGeo(geo, amt, seed) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = fbm(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.3 + seed);
    v.multiplyScalar(1 + (n - 0.5) * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
function vertexGradient(geo, bottomCol, topCol, y0, y1) {
  const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
  const a = new THREE.Color(bottomCol), b = new THREE.Color(topCol), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = Math.max(0, Math.min(1, (p.getY(i) - y0) / (y1 - y0)));
    c.copy(a).lerp(b, k);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// kolor terenu — używany przez siatkę terenu i przez kępy trawy (żeby trawa zlewała się z podłożem)
const C_GA = new THREE.Color(0x72c94a), C_GB = new THREE.Color(0x4d9c33), C_MEAD = new THREE.Color(0xa6d35a), C_SAND = new THREE.Color(0xecdca4);
const C_WET = new THREE.Color(0xc4ad74), C_ROCK = new THREE.Color(0x8e8a7c), C_DIRT = new THREE.Color(0xae8f63), C_HIGH = new THREE.Color(0x86b84e);
function terrainColor(gm, x, z, h, ny, out) {
  const n1 = fbm(x * 0.035, z * 0.035), n2 = fbm(x * 0.012 + 40, z * 0.012 + 40);
  out.copy(C_GA).lerp(C_GB, Math.min(1, n1 * 1.3));
  if (n2 > 0.62) out.lerp(C_MEAD, Math.min(1, (n2 - 0.62) * 4));
  if (h > 14) out.lerp(C_HIGH, Math.min(1, (h - 14) / 8));
  if (h < 1.2) out.lerp(C_SAND, Math.min(1, (1.2 - h) * 2.2));
  if (h < WATER_Y + 0.5) out.lerp(C_WET, Math.min(1, (WATER_Y + 0.5 - h) * 1.5));
  if (ny < 0.86 && h > 0.8) out.lerp(C_ROCK, Math.min(1, (0.86 - ny) * 5));
  for (const p of gm.pads) {
    const dx = Math.max(Math.abs(x - p.x) - p.hw, 0), dz = Math.max(Math.abs(z - p.z) - p.hd, 0);
    const d = Math.hypot(dx, dz);
    if (d < 2.5) { out.lerp(C_DIRT, (1 - d / 2.5) * 0.75); break; }
  }
  return out;
}
function terrainNormalY(gm, x, z) {
  const e = 1.0;
  const dx = gm.height(x + e, z) - gm.height(x - e, z), dz = gm.height(x, z + e) - gm.height(x, z - e);
  return 2 * e / Math.hypot(dx, 2 * e, dz);
}

export function buildEnvironment(scene, gm, quality) {
  if (!TEX.grass) makeTextures();
  const root = new THREE.Group();
  scene.add(root);
  const parts = new Map(); // klucz obiektu -> [[mesh, index, matrix]]
  const reg = (key, mesh, idx, m) => { let a = parts.get(key); if (!a) parts.set(key, (a = [])); a.push([mesh, idx, m.clone()]); };
  const R = mulberry32((gm.seed ^ 0x5eed) >>> 0);

  // ---- niebo
  const sky = makeSky();
  scene.add(sky);

  // ---- teren
  const SIZE = 440, SEG = 220;
  const tg = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, gm.height(tp.getX(i), tp.getZ(i)));
  tg.computeVertexNormals();
  const tn = tg.attributes.normal, tcol = new Float32Array(tp.count * 3);
  for (let i = 0; i < tp.count; i++) {
    terrainColor(gm, tp.getX(i), tp.getZ(i), tp.getY(i), tn.getY(i), _c);
    tcol[i * 3] = _c.r; tcol[i * 3 + 1] = _c.g; tcol[i * 3 + 2] = _c.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(tcol, 3));
  const gtex = TEX.grass.clone(); gtex.needsUpdate = true; gtex.repeat.set(SIZE / 2.5, SIZE / 2.5);
  const terrain = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex, roughness: 0.95 }));
  terrain.receiveShadow = true;
  root.add(terrain);

  // ---- woda + piana przy brzegu
  const wtex = TEX.waterN;
  wtex.repeat.set(60, 60);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({
    color: 0x18a3dc, roughness: 0.12, metalness: 0.0, transparent: true, opacity: 0.8, normalMap: wtex, normalScale: new THREE.Vector2(0.35, 0.35),
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y;
  water.receiveShadow = true;
  root.add(water);
  const FN = 512;
  const foamTex = canvasTex(FN, (x, s) => {
    const img = x.createImageData(s, s);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const wx = ((i + 0.5) / s) * SIZE - SIZE / 2, wz = ((j + 0.5) / s) * SIZE - SIZE / 2;
      const h = gm.height(wx, wz);
      const d = WATER_Y - h; // głębokość
      let a = 0;
      if (d > -0.15 && d < 1.4) a = Math.max(0, 1 - Math.abs(d - 0.15) / 1.0) * (0.55 + 0.45 * fbm(wx * 0.4, wz * 0.4));
      const k = (j * s + i) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
  });
  foamTex.wrapS = foamTex.wrapT = THREE.ClampToEdgeWrapping;
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshBasicMaterial({ map: foamTex, transparent: true, depthWrite: false, opacity: 0.85 }));
  foam.rotation.x = -Math.PI / 2; foam.position.y = WATER_Y + 0.03;
  root.add(foam);

  // ---- chmury
  const cloudGeo = new THREE.IcosahedronGeometry(1, 3);
  const clouds = new THREE.InstancedMesh(cloudGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xaebfd6, emissiveIntensity: 0.45 }), 46 * 7);
  let ci = 0;
  for (let i = 0; i < 46; i++) {
    const a = R() * Math.PI * 2, d = 40 + R() * 260, cy = 95 + R() * 50;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, sz = 5 + R() * 6;
    for (let k = 0; k < 7; k++) {
      const r = sz * (0.6 + R() * 0.6);
      clouds.setMatrixAt(ci++, _m.compose(_v.set(cx + (R() - 0.5) * sz * 3, cy + R() * sz * 0.4, cz + (R() - 0.5) * sz * 1.6), _q.identity(), _s.set(r * 1.3, r * 0.75, r)));
    }
  }
  clouds.frustumCulled = false;
  root.add(clouds);

  // ---- pudełka (domy, skrzynki, kontenery) — osobne siatki wg rodzaju i stylu
  const STYLE_TEX = [TEX.plaster, TEX.planks, TEX.brick];
  const groups = {
    wall0: { mat: worldMat(TEX.plaster, 0.5), list: [] }, wall1: { mat: worldMat(TEX.planks, 0.45), list: [] }, wall2: { mat: worldMat(TEX.brick, 0.55), list: [] },
    roof: { mat: worldMat(TEX.roof, 0.6, { rough: 0.7 }), list: [] }, floor: { mat: worldMat(TEX.wood, 0.5), list: [] },
    crate: { mat: worldMat(TEX.crate, 1.0), list: [] }, container: { mat: worldMat(TEX.metal, 0.45, { rough: 0.55, metal: 0.35 }), list: [] },
    van: { mat: worldMat(TEX.metal, 0.6, { rough: 0.4, metal: 0.4 }), list: [] },
  };
  void STYLE_TEX;
  const styleOf = (c) => ((c * 2654435761) >>> 0) % 3;
  gm.boxes.forEach((b, i) => {
    const g = b.k === 'wall' ? 'wall' + styleOf(b.c) : groups[b.k] ? b.k : 'wall0';
    groups[g].list.push(i);
  });
  for (const [gname, g] of Object.entries(groups)) {
    if (!g.list.length) continue;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), g.mat, g.list.length);
    g.list.forEach((bi, j) => {
      const b = gm.boxes[bi];
      _m.compose(_v.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2), _q.identity(), _s.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0));
      mesh.setMatrixAt(j, _m);
      _c.setHex(b.c);
      if (gname === 'wall2') _c.lerp(new THREE.Color(0xffffff), 0.65);
      if (gname === 'floor') _c.setHex(0xc9a27a);
      if (gname === 'crate') _c.setHex(0xd2a36a);
      mesh.setColorAt(j, _c);
      reg('b' + bi, mesh, j, _m);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    root.add(mesh);
  }

  // ---- dekoracje domów: listwy, parapety, nadproża, ościeżnice, okap dachu
  const decor = [];
  const addDecor = (key, x0, y0, z0, x1, y1, z1, color) => decor.push({ key, x0, y0, z0, x1, y1, z1, color });
  const padOf = (b) => gm.pads.find((p) => Math.abs((b.x0 + b.x1) / 2 - p.x) <= p.hw + 0.6 && Math.abs((b.z0 + b.z1) / 2 - p.z) <= p.hd + 0.6);
  gm.boxes.forEach((b, i) => {
    const key = 'b' + i;
    if (b.k === 'wall') {
      const pad = padOf(b);
      if (!pad) return;
      const f = pad.h + 0.12;
      const alongX = (b.x1 - b.x0) > (b.z1 - b.z0);
      const ex = alongX ? 0 : 0.05, ez = alongX ? 0.05 : 0;
      const atFloor = Math.abs(b.y0 - f) < 0.05;
      const trim = 0xf4efe6;
      if (atFloor) addDecor(key, b.x0 - ex, b.y0, b.z0 - ez, b.x1 + ex, b.y0 + 0.28, b.z1 + ez, 0x5b4632); // cokół
      if (atFloor && b.y1 - b.y0 < 1.2) { // parapet pod oknem
        const sx = alongX ? 0.08 : 0.14, sz = alongX ? 0.14 : 0.08;
        addDecor(key, b.x0 - sx, b.y1 - 0.06, b.z0 - sz, b.x1 + sx, b.y1 + 0.05, b.z1 + sz, trim);
      }
      if (!atFloor) { // nadproże okna / drzwi
        addDecor(key, b.x0 - ex * 1.4, b.y0 - 0.02, b.z0 - ez * 1.4, b.x1 + ex * 1.4, b.y0 + 0.12, b.z1 + ez * 1.4, trim);
        if (b.y0 - f > 2.3) { // drzwi: ościeżnica po bokach
          const t = 0.1;
          if (alongX) {
            addDecor(key, b.x0 - t, f, b.z0 - 0.04, b.x0, b.y0, b.z1 + 0.04, trim);
            addDecor(key, b.x1, f, b.z0 - 0.04, b.x1 + t, b.y0, b.z1 + 0.04, trim);
          } else {
            addDecor(key, b.x0 - 0.04, f, b.z0 - t, b.x1 + 0.04, b.y0, b.z0, trim);
            addDecor(key, b.x0 - 0.04, f, b.z1, b.x1 + 0.04, b.y0, b.z1 + t, trim);
          }
        }
      }
      // narożniki
      if (atFloor && b.y1 - b.y0 > 3) {
        const cy1 = b.y1;
        for (const [cx, cz] of [[pad.x - pad.hw, pad.z - pad.hd], [pad.x + pad.hw, pad.z - pad.hd], [pad.x - pad.hw, pad.z + pad.hd], [pad.x + pad.hw, pad.z + pad.hd]]) {
          if (cx >= b.x0 - 0.01 && cx <= b.x1 + 0.01 && cz >= b.z0 - 0.01 && cz <= b.z1 + 0.01) {
            addDecor(key, cx - 0.14, f, cz - 0.14, cx + 0.14, cy1, cz + 0.14, 0x6b5139);
          }
        }
      }
    } else if (b.k === 'roof') {
      _c.setHex(b.c).multiplyScalar(0.7);
      const dark = _c.getHex();
      addDecor(key, b.x0 - 0.05, b.y0 - 0.12, b.z0 - 0.05, b.x1 + 0.05, b.y0 + 0.08, b.z1 + 0.05, 0xf4efe6); // okap
      const t = 0.18, h = 0.3;
      addDecor(key, b.x0, b.y1, b.z0, b.x1, b.y1 + h, b.z0 + t, dark);
      addDecor(key, b.x0, b.y1, b.z1 - t, b.x1, b.y1 + h, b.z1, dark);
      addDecor(key, b.x0, b.y1, b.z0 + t, b.x0 + t, b.y1 + h, b.z1 - t, dark);
      addDecor(key, b.x1 - t, b.y1, b.z0 + t, b.x1, b.y1 + h, b.z1 - t, dark);
      if (R() < 0.7) { // komin
        const cx = b.x0 + 1 + R() * (b.x1 - b.x0 - 2), cz = b.z0 + 1 + R() * (b.z1 - b.z0 - 2);
        addDecor(key, cx - 0.35, b.y1, cz - 0.35, cx + 0.35, b.y1 + 1.3, cz + 0.35, 0x9a5b45);
        addDecor(key, cx - 0.42, b.y1 + 1.3, cz - 0.42, cx + 0.42, b.y1 + 1.45, cz + 0.42, 0x5c3a2e);
      }
    } else if (b.k === 'container') {
      const alongX = (b.x1 - b.x0) > (b.z1 - b.z0);
      _c.setHex(b.c).multiplyScalar(0.6);
      const dark = _c.getHex();
      for (const s of [0, 1]) { // ramy na końcach
        if (alongX) { const x = s ? b.x1 - 0.12 : b.x0; addDecor(key, x - 0.02, b.y0, b.z0 - 0.03, x + 0.14, b.y1 + 0.03, b.z1 + 0.03, dark); }
        else { const z = s ? b.z1 - 0.12 : b.z0; addDecor(key, b.x0 - 0.03, b.y0, z - 0.02, b.x1 + 0.03, b.y1 + 0.03, z + 0.14, dark); }
      }
    }
  });
  if (decor.length) {
    const dm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), decor.length);
    decor.forEach((d, j) => {
      _m.compose(_v.set((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, (d.z0 + d.z1) / 2), _q.identity(), _s.set(d.x1 - d.x0, d.y1 - d.y0, d.z1 - d.z0));
      dm.setMatrixAt(j, _m);
      dm.setColorAt(j, _c.setHex(d.color));
      reg(d.key, dm, j, _m);
    });
    dm.castShadow = dm.receiveShadow = true;
    dm.frustumCulled = false;
    root.add(dm);
  }

  // ---- drzewa: świerki i liściaste
  const treeCyl = new Map();
  gm.cyls.forEach((c, j) => { if (c.k === 'tree') treeCyl.set(c.i, 'c' + j); });
  const pines = [], oaks = [];
  gm.trees.forEach((t, i) => (hash2(t.x * 0.37, t.z * 0.37) < 0.5 ? pines : oaks).push(i));
  const barkMat = new THREE.MeshStandardMaterial({ map: TEX.bark, color: 0x8a6240, roughness: 0.95 });
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 1, 8); trunkGeo.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, gm.trees.length);
  const coneGeo = vertexGradient(new THREE.ConeGeometry(1, 1, 10, 2), 0x6f8f6f, 0xffffff, -0.5, 0.5); coneGeo.translate(0, 0.5, 0);
  const pineMat = addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.9, flatShading: true }), 0.05, true);
  const cones = new THREE.InstancedMesh(coneGeo, pineMat, Math.max(1, pines.length * 3));
  const blobGeo = vertexGradient(displaceGeo(new THREE.IcosahedronGeometry(1, 2), 0.35, 3.1), 0x7a9a6a, 0xffffff, -1, 1);
  const oakMat = addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, flatShading: true }), 0.06, false);
  const blobs = new THREE.InstancedMesh(blobGeo, oakMat, Math.max(1, oaks.length * 4));
  const PINE_C = [0x2f7d4a, 0x3a8a4f, 0x2a6e45, 0x3f9455];
  const OAK_C = [0x5cae3a, 0x6dbb3e, 0x4f9e33, 0x8cc63f, 0x9ccf45];
  gm.trees.forEach((t, i) => {
    const key = treeCyl.get(i);
    const oak = oaks.includes(i);
    const th = oak ? 2.6 : 2.8;
    _m.compose(_v.set(t.x, t.y - 0.3, t.z), _q.identity(), _s.set(oak ? t.s * 1.3 : t.s, th * t.s, oak ? t.s * 1.3 : t.s));
    trunks.setMatrixAt(i, _m); if (key) reg(key, trunks, i, _m);
  });
  pines.forEach((i, n) => {
    const t = gm.trees[i], key = treeCyl.get(i), col = PINE_C[i % PINE_C.length];
    for (let k = 0; k < 3; k++) {
      const r = (2.2 - k * 0.55) * t.s;
      _q.setFromAxisAngle(Y, i * 1.7 + k);
      _m.compose(_v.set(t.x, t.y + (1.9 + k * 1.35) * t.s, t.z), _q, _s.set(r, 2.6 * t.s, r));
      cones.setMatrixAt(n * 3 + k, _m); cones.setColorAt(n * 3 + k, _c.setHex(col).offsetHSL(0, 0, k * 0.035));
      if (key) reg(key, cones, n * 3 + k, _m);
    }
  });
  oaks.forEach((i, n) => {
    const t = gm.trees[i], key = treeCyl.get(i), col = OAK_C[i % OAK_C.length];
    const off = [[0, 4.3, 0, 1.75], [0.95, 3.6, 0.3, 1.25], [-0.85, 3.7, -0.4, 1.3], [0.2, 3.5, -1.0, 1.2]];
    off.forEach(([ox, oy, oz, r], k) => {
      _q.setFromEuler(_e.set(i + k, i * 2.3 + k, 0));
      _m.compose(_v.set(t.x + ox * t.s, t.y + oy * t.s, t.z + oz * t.s), _q, _s.setScalar(r * t.s));
      blobs.setMatrixAt(n * 4 + k, _m); blobs.setColorAt(n * 4 + k, _c.setHex(col).offsetHSL(0, 0, (k - 1.5) * 0.025));
      if (key) reg(key, blobs, n * 4 + k, _m);
    });
  });
  for (const m of [trunks, cones, blobs]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; root.add(m); }

  // ---- skały
  const rockGeo = displaceGeo(new THREE.IcosahedronGeometry(1, 1), 0.45, 7.7);
  { // mech na górze
    const p = rockGeo.attributes.position, cols = new Float32Array(p.count * 3), g = new THREE.Color(0x9c9a92), mo = new THREE.Color(0x6e9d45), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { c.copy(g).offsetHSL(0, 0, (hash2(i, 3) - 0.5) * 0.08); if (p.getY(i) > 0.55) c.lerp(mo, Math.min(1, (p.getY(i) - 0.55) * 3)); cols.set([c.r, c.g, c.b], i * 3); }
    rockGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const rockCyl = new Map();
  gm.cyls.forEach((c, j) => { if (c.k === 'rock') rockCyl.set(c.i, 'c' + j); });
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), Math.max(1, gm.rocks.length));
  gm.rocks.forEach((r, i) => {
    _q.setFromEuler(_e.set(0, r.ry, 0));
    _m.compose(_v.set(r.x, r.y, r.z), _q, _s.set(r.s * 1.1, r.s * 0.85, r.s));
    rocks.setMatrixAt(i, _m);
    const key = rockCyl.get(i); if (key) reg(key, rocks, i, _m);
  });
  rocks.castShadow = rocks.receiveShadow = true; rocks.frustumCulled = false;
  root.add(rocks);

  // ---- krzaki (dekoracyjne, bez kolizji — można się w nich chować)
  const insidePad = (x, z, m) => gm.pads.some((p) => Math.abs(x - p.x) < p.hw + m && Math.abs(z - p.z) < p.hd + m);
  const insideBox = (x, z) => gm.boxes.some((b) => x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3);
  const bushPos = [];
  for (const p of gm.pads) {
    for (let k = 0; k < 3; k++) {
      const side = Math.floor(R() * 4), u = (R() - 0.5) * 2;
      const x = side < 2 ? p.x + u * p.hw : p.x + (side === 2 ? -1 : 1) * (p.hw + 1.1);
      const z = side < 2 ? p.z + (side === 0 ? -1 : 1) * (p.hd + 1.1) : p.z + u * p.hd;
      bushPos.push([x, z]);
    }
  }
  for (let i = 0; i < 160; i++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 170; bushPos.push([Math.cos(a) * d, Math.sin(a) * d]); }
  const bushList = bushPos.filter(([x, z]) => gm.height(x, z) > 0.8 && !insidePad(x, z, 0.2) && !insideBox(x, z));
  const bushMat = addWind(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, flatShading: true }), 0.03, false);
  const bushes = new THREE.InstancedMesh(blobGeo, bushMat, Math.max(1, bushList.length * 3));
  bushList.forEach(([x, z], i) => {
    const h = gm.height(x, z), s = 0.55 + R() * 0.35;
    for (let k = 0; k < 3; k++) {
      _q.setFromEuler(_e.set(R() * 3, R() * 3, 0));
      _m.compose(_v.set(x + (k - 1) * 0.5 * s, h + 0.35 * s + (k === 1 ? 0.2 : 0), z + (R() - 0.5) * 0.5), _q, _s.setScalar(s * (k === 1 ? 1 : 0.8)));
      bushes.setMatrixAt(i * 3 + k, _m);
      bushes.setColorAt(i * 3 + k, _c.setHex(0x4f9e3a).offsetHSL((R() - 0.5) * 0.03, 0, (R() - 0.5) * 0.08));
    }
  });
  bushes.castShadow = true; bushes.receiveShadow = true; bushes.frustumCulled = false;
  root.add(bushes);

  // ---- trawa: gęsty dywan wokół gracza (przesuwany przy ruchu); wysokość i kolor z siatki terenu
  const blades = [], gcols = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + hash2(k, 1) * 0.6, r = 0.05 + hash2(k, 2) * 0.16, h = 0.22 + hash2(k, 3) * 0.22, lean = 0.06 + hash2(k, 4) * 0.08;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, w = 0.035;
    const px = Math.cos(a + Math.PI / 2) * w, pz = Math.sin(a + Math.PI / 2) * w;
    const tri = [cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean];
    blades.push(...tri, tri[0], tri[1], tri[2], tri[6], tri[7], tri[8], tri[3], tri[4], tri[5]); // obie strony, bez czarnych tyłów
    for (let t = 0; t < 2; t++) gcols.push(0.62, 0.68, 0.55, 0.62, 0.68, 0.55, 1.12, 1.15, 0.92);
  }
  // kolejność kolorów dla odwróconego trójkąta: v0, v2(czubek), v1
  for (let k = 0; k < 9; k++) { const o = (k * 18 + 9) ; gcols.splice(o, 9, 0.62, 0.68, 0.55, 1.12, 1.15, 0.92, 0.62, 0.68, 0.55); }
  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute(blades, 3));
  grassGeo.setAttribute('color', new THREE.Float32BufferAttribute(gcols, 3));
  grassGeo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(blades.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const grassMat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.1, true);
  const CELL = 0.85, GR_MAX = QUALITY.high.grassR;
  const grassCap = Math.ceil(Math.PI * (GR_MAX / CELL) ** 2 * 1.05);
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCap);
  grass.count = 0;
  grass.receiveShadow = true; grass.frustumCulled = false;
  root.add(grass);
  const G1 = SEG + 1, step = SIZE / SEG;
  const tColAt = (x, z, out) => {
    const i = Math.round((x + SIZE / 2) / step), j = Math.round((z + SIZE / 2) / step);
    const idx = Math.max(0, Math.min(G1 - 1, j)) * G1 + Math.max(0, Math.min(G1 - 1, i));
    out.setRGB(tcol[idx * 3], tcol[idx * 3 + 1], tcol[idx * 3 + 2]);
    return tn.getY(idx);
  };
  const tHeightAt = (x, z) => { // dwuliniowo z siatki = dokładnie jak wyrenderowany teren
    const fx = (x + SIZE / 2) / step, fz = (z + SIZE / 2) / step;
    const i = Math.max(0, Math.min(SEG - 1, Math.floor(fx))), j = Math.max(0, Math.min(SEG - 1, Math.floor(fz)));
    const u = fx - i, v = fz - j;
    const h00 = tp.getY(j * G1 + i), h10 = tp.getY(j * G1 + i + 1), h01 = tp.getY((j + 1) * G1 + i), h11 = tp.getY((j + 1) * G1 + i + 1);
    // PlaneGeometry dzieli kwadrat na trójkąty po przekątnej (0,1)-(1,0)
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  let grassR = 0;
  const grassCenter = new THREE.Vector2(1e9, 1e9);
  function rebuildGrass(cx, cz) {
    grassCenter.set(cx, cz);
    if (grassR <= 0) { grass.count = 0; return; }
    const n0 = Math.ceil(grassR / CELL);
    const gi = Math.round(cx / CELL), gj = Math.round(cz / CELL);
    let n = 0;
    for (let j = -n0; j <= n0; j++) {
      for (let i = -n0; i <= n0; i++) {
        const ci = gi + i, cj = gj + j;
        const h1 = hash2(ci * 0.71, cj * 0.37), h2 = hash2(ci * 1.37, cj * 2.11);
        const x = (ci + h1 - 0.5) * CELL, z = (cj + h2 - 0.5) * CELL;
        const d = Math.hypot(x - cx, z - cz);
        if (d > grassR) continue;
        const ny = tColAt(x, z, _c);
        const h = tHeightAt(x, z);
        if (h < 1.0 || ny < 0.86) continue;
        if (vnoise(x * 0.08 + 9, z * 0.08 + 9) < 0.28) continue; // łysiny
        if (insidePad(x, z, 0.3)) continue;
        const edge = 1 - Math.max(0, (d - grassR * 0.7) / (grassR * 0.3));
        const sc = (0.75 + h1 * 0.6) * edge;
        _q.setFromAxisAngle(Y, h2 * 6.28);
        _m.compose(_v.set(x, h - 0.02, z), _q, _s.set(sc, sc * (0.8 + hash2(ci, cj) * 0.6), sc));
        grass.setMatrixAt(n, _m);
        grass.setColorAt(n, _c);
        if (++n >= grassCap) break;
      }
      if (n >= grassCap) break;
    }
    grass.count = n;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  }

  // ---- kwiaty
  const FL_MAX = QUALITY.high.flowers;
  const flowerGeo = new THREE.IcosahedronGeometry(0.075, 0);
  const flowers = new THREE.InstancedMesh(flowerGeo, addWind(new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x222222 }), 0.04, false), FL_MAX);
  const FLC = [0xffffff, 0xffe14d, 0xff7eb6, 0xb18cff, 0xff6b4a];
  {
    let n = 0, tries = 0;
    while (n < FL_MAX && tries < FL_MAX * 6) {
      tries++;
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * 172;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = gm.height(x, z);
      if (h < 1.1 || insidePad(x, z, 0.3) || fbm(x * 0.03 + 2, z * 0.03 + 2) < 0.55) continue;
      _m.compose(_v.set(x, h + 0.3 + R() * 0.12, z), _q.identity(), _s.setScalar(0.8 + R() * 0.6));
      flowers.setMatrixAt(n, _m);
      flowers.setColorAt(n, _c.setHex(FLC[Math.floor(R() * FLC.length)]));
      n++;
    }
    flowers.userData.max = n;
  }
  flowers.frustumCulled = false;
  root.add(flowers);

  // ---- API
  const dirty = new Set();
  const env = {
    root, sky, water, foam, grass, flowers,
    setVisible(key, vis) {
      const a = parts.get(key);
      if (!a) return;
      for (const [mesh, idx, m] of a) { mesh.setMatrixAt(idx, vis ? m : ZERO); dirty.add(mesh); }
    },
    resetAll() { for (const key of parts.keys()) env.setVisible(key, true); },
    setQuality(q) {
      grassR = q.grassR;
      grass.visible = grassR > 0;
      grassCenter.set(1e9, 1e9);
      flowers.count = Math.min(flowers.userData.max, q.flowers);
    },
    update(dt, camPos, storm) {
      uTime.value += dt;
      for (const m of dirty) m.instanceMatrix.needsUpdate = true;
      dirty.clear();
      sky.position.copy(camPos);
      if (grassR > 0 && Math.hypot(camPos.x - grassCenter.x, camPos.z - grassCenter.y) > 3) rebuildGrass(camPos.x, camPos.z);
      sky.material.uniforms.storm.value += (storm - sky.material.uniforms.storm.value) * Math.min(1, dt * 3);
      wtex.offset.set(uTime.value * 0.012, uTime.value * 0.007);
      foam.material.opacity = 0.65 + Math.sin(uTime.value * 1.3) * 0.2;
    },
  };
  env.setQuality(quality);
  return env;
}

// ================================================================ postprocessing
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.12 }, uContrast: { value: 1.05 }, uVig: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat; uniform float uContrast; uniform float uVig; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - uVig * smoothstep(0.4, 0.9, d);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export function createPost(renderer, scene, camera, q) {
  const w = innerWidth, h = innerHeight;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: q.msaa });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null;
  if (q.ao) {
    ao = new GTAOPass(scene, camera, w, h);
    ao.blendIntensity = 0.75;
    ao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1, thickness: 1, scale: 1, samples: 12 });
    composer.addPass(ao);
  }
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.55, 0.92));
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));
  return {
    composer,
    setSize(w2, h2) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w2, h2); if (ao) ao.setSize(w2, h2); },
    render() { composer.render(); },
    dispose() { rt.dispose(); composer.dispose && composer.dispose(); },
  };
}
