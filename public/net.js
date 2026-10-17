// Fortjede — sieć P2P (WebRTC przez PeerJS, globalny `Peer` z index.html).
// Host: symulacja w Web Workerze, goście łączą się bezpośrednio z przeglądarką hosta.
// Serwer PeerJS służy tylko do zestawienia połączenia (sygnalizacja), ruch gry idzie peer-to-peer.

const PREFIX = 'fortjede-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez mylących 0/O, 1/I
const CHUNK = 16000; // kanał danych WebRTC ma limit rozmiaru wiadomości — dłuższe dzielimy
// PeerJS potrafi długo nie zauważyć zerwanego łącza, więc pilnujemy go sami:
// gość odpowiada '~p' na ruch od hosta (najwyżej raz na sekundę — działa też w karcie w tle, bo nie zależy od timera),
// a przy zamykaniu strony obie strony wysyłają '~b'.
const PING = '~p', BYE = '~b';
const DEAD_MS = 20000; // hojnie: słaby komputer potrafi przyciąć wątek główny na kilka sekund (np. przy budowaniu świata)

export const roomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const inviteLink = (code) => `${location.origin}${location.pathname}?room=${code}`;

// wysyłka z dzieleniem na kawałki: '~0' + część, ostatnia '~1' + część; całe wiadomości zaczynają się od '{'
function sendChunked(conn, s) {
  if (s.length <= CHUNK) { conn.send(s); return; }
  for (let i = 0; i < s.length; i += CHUNK) conn.send((i + CHUNK >= s.length ? '~1' : '~0') + s.slice(i, i + CHUNK));
}
function unchunker(onWhole, onBye) {
  let buf = '';
  return (d) => {
    if (typeof d !== 'string') return;
    if (d[0] !== '~') { onWhole(d); return; }
    if (d === PING) return;
    if (d === BYE) { onBye(); return; }
    buf += d.slice(2);
    if (d[1] === '1') { const s = buf; buf = ''; onWhole(s); }
  };
}

// PeerJS potrafi długo nie zgłaszać 'close' po zerwaniu łącza — patrzymy też na stan RTCPeerConnection
function watchState(conn, onDead) {
  const pc = conn.peerConnection;
  if (!pc) return;
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') onDead();
  });
}

function peerError(err) {
  const map = {
    'peer-unavailable': 'Room not found — check the code or ask the host for a new link.',
    'network': 'Cannot reach the matchmaking server — check your internet connection.',
    'server-error': 'Matchmaking server error — try again in a moment.',
    'browser-incompatible': 'Your browser does not support WebRTC.',
    'unavailable-id': 'That room code is taken.',
  };
  return map[err && err.type] || `Connection error (${(err && err.type) || err}).`;
}

// Tworzy pokój: uruchamia symulację u siebie i przyjmuje gości.
// Zwraca { send, code } przez onReady; onMsg dostaje wiadomości do lokalnego gracza (string JSON).
export function hostRoom({ onReady, onMsg, onError, onPeers }) {
  if (typeof Peer === 'undefined') { onError('Could not load the networking library — refresh the page.'); return null; }
  const worker = new Worker(new URL('./host-worker.js', import.meta.url), { type: 'module' });
  const conns = new Map(); // cid -> DataConnection
  const seen = new Map(); // cid -> czas ostatniej wiadomości
  let nextCid = 1;
  const LOCAL = 0;
  worker.onmessage = ({ data: m }) => {
    if (m.cid === LOCAL) { onMsg(m.data); return; }
    const c = conns.get(m.cid);
    if (c && c.open) sendChunked(c, m.data);
  };
  worker.onerror = (e) => { console.error(e); onError('The game simulation crashed — refresh the page.'); };
  worker.postMessage({ t: 'open', cid: LOCAL, owner: true });
  const local = { send: (s) => worker.postMessage({ t: 'msg', cid: LOCAL, data: s }) };

  let peer = null, tries = 0, ready = false;
  const start = () => {
    const code = roomCode();
    peer = new Peer(PREFIX + code, { debug: 1 });
    peer.on('open', () => {
      if (ready) return; // ponowne połączenie z sygnalizacją po zerwaniu
      ready = true;
      onReady({ code, send: local.send });
    });
    peer.on('connection', (conn) => {
      const cid = nextCid++;
      const bye = () => {
        seen.delete(cid);
        if (!conns.delete(cid)) return;
        worker.postMessage({ t: 'close', cid });
        onPeers && onPeers(conns.size);
        conn.close();
      };
      conn.on('open', () => {
        conns.set(cid, conn);
        seen.set(cid, { at: performance.now(), bye });
        worker.postMessage({ t: 'open', cid, owner: false });
        onPeers && onPeers(conns.size);
        watchState(conn, bye);
      });
      const rx = unchunker((data) => worker.postMessage({ t: 'msg', cid, data }), bye);
      conn.on('data', (d) => { const s = seen.get(cid); if (s) s.at = performance.now(); rx(d); });
      conn.on('close', bye);
      conn.on('error', bye);
    });
    // utrata sygnalizacji nie zrywa gry — tylko nowi nie mogą dołączyć; próbujemy wrócić
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000); });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && !ready && tries++ < 5) { peer.destroy(); start(); return; }
      if (ready && err.type !== 'network' && err.type !== 'server-error') { console.warn('peer', err); return; }
      if (!ready) onError(peerError(err));
    });
  };
  start();
  setInterval(() => {
    const t = performance.now();
    for (const s of [...seen.values()]) if (t - s.at > DEAD_MS) s.bye();
  }, 2000);
  addEventListener('pagehide', () => {
    for (const c of conns.values()) if (c.open) c.send(BYE);
    peer && peer.destroy();
  });
  return { send: local.send };
}

// Dołącza do pokoju o danym kodzie.
export function joinRoom(code, { onOpen, onMsg, onClose, onError }) {
  if (typeof Peer === 'undefined') { onError('Could not load the networking library — refresh the page.'); return null; }
  const peer = new Peer({ debug: 1 });
  let conn = null, opened = false, closed = false, lastRx = 0, lastPing = 0;
  const close = () => {
    if (closed) return;
    closed = true;
    peer.destroy();
    if (opened) onClose(); else onError('Could not connect to the host.');
  };
  const timer = setTimeout(() => { if (!opened) { closed = true; peer.destroy(); onError('The host is not responding — check the code or try again.'); } }, 20000);
  peer.on('open', () => {
    conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
    conn.on('open', () => {
      opened = true; lastRx = performance.now(); clearTimeout(timer); watchState(conn, close); onOpen();
      setInterval(() => { if (!closed && performance.now() - lastRx > DEAD_MS) close(); }, 2000);
    });
    const rx = unchunker(onMsg, close);
    conn.on('data', (d) => {
      const t = performance.now();
      lastRx = t;
      if (t - lastPing > 1000 && conn.open) { lastPing = t; conn.send(PING); }
      rx(d);
    });
    conn.on('close', close);
    conn.on('error', close);
  });
  peer.on('error', (err) => {
    if (opened && (err.type === 'network' || err.type === 'server-error' || err.type === 'disconnected')) return; // sygnalizacja nie jest już potrzebna
    if (closed) return;
    closed = true; clearTimeout(timer); peer.destroy();
    onError(peerError(err));
  });
  peer.on('disconnected', () => { /* gra trwa przez kanał danych */ });
  addEventListener('pagehide', () => { if (conn && conn.open) conn.send(BYE); peer.destroy(); });
  return { send: (s) => { if (conn && conn.open) sendChunked(conn, s); } };
}
