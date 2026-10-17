// Fortjede — sieć P2P (WebRTC przez PeerJS, globalny `Peer` z index.html).
// Host: symulacja w Web Workerze, goście łączą się bezpośrednio z przeglądarką hosta.
// Serwer PeerJS służy tylko do zestawienia połączenia (sygnalizacja), ruch gry idzie peer-to-peer.
//
// Pokój KOD ma kolejne „epoki”: host epoki n ma identyfikator fortjede-v1-KOD-n (epoka 0 bez sufiksu).
// Host co 2 s wysyła gościom kopię stanu z listą następców. Gdy wyjdzie, następca rejestruje epokę n+1
// (unikalność identyfikatora w PeerJS działa jak blokada — wygrywa jeden), uruchamia symulację z kopii,
// a reszta łączy się z nim i wraca do swoich postaci dzięki tokenowi.

const PREFIX = 'fortjede-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez mylących 0/O, 1/I
const CHUNK = 16000; // kanał danych WebRTC ma limit rozmiaru wiadomości — dłuższe dzielimy
// PeerJS potrafi długo nie zauważyć zerwanego łącza, więc pilnujemy go sami:
// gość odpowiada '~p' na ruch od hosta (najwyżej raz na sekundę — działa też w karcie w tle, bo nie zależy od timera),
// a przy zamykaniu strony obie strony wysyłają '~b'.
const PING = '~p', BYE = '~b';
const DEAD_MS = 20000; // hojnie: słaby komputer potrafi przyciąć wątek główny na kilka sekund (np. przy budowaniu świata)
const SUCC_STEP = 4000; // kolejny następca czeka o tyle dłużej, zanim sam przejmie pokój
const GIVE_UP_MS = 60000;
const PROBE = 12; // tyle epok sprawdzamy naraz, szukając aktualnego hosta

export const roomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const inviteLink = (code) => `${location.origin}${location.pathname}?room=${code}`;
const peerId = (code, ep) => PREFIX + code + (ep ? '-' + ep : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// token gracza w danym pokoju — po powrocie (odświeżenie, zerwane łącze, nowy host) wracasz do swojej postaci
function tokenFor(code) {
  const k = 'fortjede-tok-' + code;
  try {
    let t = localStorage.getItem(k);
    if (!t) { t = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(k, t); }
    return t;
  } catch { return Math.random().toString(36).slice(2); }
}

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
    'network': 'Cannot reach the matchmaking server — check your internet connection.',
    'server-error': 'Matchmaking server error — try again in a moment.',
    'browser-incompatible': 'Your browser does not support WebRTC.',
  };
  return map[err && err.type] || `Connection error (${(err && err.type) || err}).`;
}

// Sesja gry: tworzy pokój (code = null) albo dołącza do istniejącego, a potem sama pilnuje połączenia.
// cb: onMsg(string JSON), onReady({ code }), onStatus(tekst | null), onRole(isOwner), onFail(tekst)
export function startSession({ code, name, ...cb }) {
  if (typeof Peer === 'undefined') { cb.onFail('Could not load the networking library — refresh the page.'); return null; }
  let tok = code ? tokenFor(code) : '';
  let epoch = 0, link = null, backup = null, stopped = false, recovering = false, gen = 0;
  let gpeer = null; // Peer gościa (losowe id), do łączenia z hostem
  let host = null; // { peer, worker, conns } gdy to my liczymy mecz
  let guest = null; // { conn, lastRx }
  const pending = new Map(); // id hosta -> funkcja kończąca próbę połączenia (gdy PeerJS zgłosi 'peer-unavailable')
  const joinMsg = () => JSON.stringify({ t: 'join', name, tok });

  // ------------------------------------------------------------ host

  // Rejestruje epokę ep i uruchamia symulację (z kopii stanu albo od zera).
  // true = jesteśmy hostem, false = ktoś był szybszy, inny błąd PeerJS = obiekt błędu.
  function becomeHost(ep, state) {
    return new Promise((resolve) => {
      const peer = new Peer(peerId(code, ep), { debug: 1 });
      let ready = false;
      peer.on('open', () => {
        if (ready) return; // ponowne połączenie z sygnalizacją po zerwaniu
        ready = true;
        if (stopped) { peer.destroy(); resolve(false); return; }
        const worker = new Worker(new URL('./host-worker.js', import.meta.url), { type: 'module' });
        const conns = new Map(); // cid -> { conn, at, bye }
        let nextCid = 1;
        const LOCAL = 0;
        host = { peer, worker, conns };
        worker.onmessage = ({ data: m }) => {
          if (m.cid === LOCAL) { cb.onMsg(m.data); return; }
          const c = conns.get(m.cid);
          if (c && c.conn.open) sendChunked(c.conn, m.data);
        };
        worker.onerror = (e) => { console.error(e); cb.onFail('The game simulation crashed — refresh the page.'); };
        worker.postMessage({ t: 'init', state });
        worker.postMessage({ t: 'open', cid: LOCAL, owner: true });
        link = { send: (s) => worker.postMessage({ t: 'msg', cid: LOCAL, data: s }) };
        peer.on('connection', (conn) => {
          const cid = nextCid++;
          const bye = () => {
            if (!conns.delete(cid)) return;
            worker.postMessage({ t: 'close', cid });
            conn.close();
          };
          conn.on('open', () => {
            conns.set(cid, { conn, at: performance.now(), bye });
            worker.postMessage({ t: 'open', cid, owner: false });
            watchState(conn, bye);
          });
          const rx = unchunker((data) => worker.postMessage({ t: 'msg', cid, data }), bye);
          conn.on('data', (d) => { const c = conns.get(cid); if (c) c.at = performance.now(); rx(d); });
          conn.on('close', bye);
          conn.on('error', bye);
        });
        epoch = ep;
        if (gpeer) { gpeer.destroy(); gpeer = null; }
        link.send(joinMsg());
        cb.onRole(true);
        cb.onStatus(null);
        resolve(true);
      });
      // utrata sygnalizacji nie zrywa gry — tylko nowi nie mogą dołączyć; próbujemy wrócić
      peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000); });
      peer.on('error', (err) => {
        if (!ready) {
          peer.destroy();
          resolve(err.type === 'unavailable-id' ? false : err);
          return;
        }
        if (err.type !== 'network' && err.type !== 'server-error' && err.type !== 'peer-unavailable') console.warn('peer', err);
      });
    });
  }

  // ------------------------------------------------------------ gość

  function guestPeer() {
    if (gpeer && !gpeer.destroyed && gpeer.open) return Promise.resolve(gpeer);
    if (gpeer) gpeer.destroy();
    return new Promise((res, rej) => {
      const p = new Peer({ debug: 1 });
      gpeer = p;
      p.on('open', () => res(p));
      p.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          const id = (String(err.message).match(/fortjede-v1-[A-Z0-9-]+/) || [])[0];
          const fin = pending.get(id);
          if (fin) fin('gone');
          return;
        }
        if (!p.open) rej(err);
      });
      p.on('disconnected', () => { if (!p.destroyed) setTimeout(() => !p.destroyed && p.reconnect(), 1500); });
    });
  }

  // jedna próba połączenia z hostem epoki ep: conn | 'gone' (nie ma takiego hosta) | null (brak odpowiedzi)
  function tryConnect(peer, ep, ms) {
    return new Promise((resolve) => {
      const id = peerId(code, ep);
      const conn = peer.connect(id, { reliable: true, serialization: 'raw' });
      let done = false;
      const fin = (v) => {
        if (done) return;
        done = true; clearTimeout(tm); pending.delete(id);
        if (v !== conn) conn.close();
        resolve(v);
      };
      const tm = setTimeout(() => fin(null), ms);
      pending.set(id, fin);
      conn.on('open', () => fin(conn));
      conn.on('error', () => fin(null));
    });
  }

  // szuka aktualnego hosta wśród epok from..from+n-1 naraz: { conn, ep } | { allGone } | { error }
  async function findHost(from, n, ms) {
    let peer;
    try { peer = await guestPeer(); } catch (err) { return { error: err }; }
    return new Promise((resolve) => {
      let left = n, gone = 0, won = false;
      for (let ep = from; ep < from + n; ep++) {
        tryConnect(peer, ep, ms).then((r) => {
          left--;
          if (r && r !== 'gone') {
            if (won) r.close(); else { won = true; resolve({ conn: r, ep }); }
          } else if (r === 'gone') gone++;
          if (!left && !won) resolve({ allGone: gone === n });
        });
      }
    });
  }

  function attach(conn, ep) {
    const my = ++gen;
    epoch = ep;
    guest = { conn, lastRx: performance.now() };
    let lastPing = 0;
    link = { send: (s) => { if (conn.open) sendChunked(conn, s); } };
    const lost = (certain) => { if (my === gen) recover(certain); };
    const rx = unchunker((d) => {
      // kopia stanu dla przejęcia pokoju — nie idzie do gry
      if (d.startsWith('{"t":"backup"')) { try { backup = JSON.parse(d).st; } catch { /* uszkodzona */ } return; }
      cb.onMsg(d);
    }, () => lost(true));
    conn.on('data', (d) => {
      if (my !== gen) return;
      const t = performance.now();
      guest.lastRx = t;
      if (t - lastPing > 1000 && conn.open) { lastPing = t; conn.send(PING); }
      rx(d);
    });
    conn.on('close', () => lost(false));
    conn.on('error', () => lost(false));
    watchState(conn, () => lost(false));
    conn.send(joinMsg());
    cb.onRole(false);
    cb.onStatus(null);
  }

  // utrata hosta: najpierw próbujemy wrócić do niego, a gdy go nie ma — przejęcie pokoju
  async function recover(certain) {
    if (recovering || stopped) return;
    recovering = true;
    gen++;
    if (guest) { guest.conn.close(); guest = null; }
    link = null;
    const t0 = performance.now();
    if (!certain) {
      cb.onStatus('Connection to the host lost — reconnecting…');
      for (let i = 0; i < 3 && !stopped; i++) {
        const r = await findHost(epoch, 1, 7000);
        if (r.conn) { recovering = false; attach(r.conn, r.ep); return; }
        if (r.allGone) break;
        await sleep(1000);
      }
    }
    cb.onStatus('The host left — moving the game to another player…');
    const succ = (backup && backup.succ) || [];
    const myIdx = succ.indexOf(tok);
    while (!stopped && performance.now() - t0 < GIVE_UP_MS) {
      const r = await findHost(epoch + 1, 3, 4000);
      if (r.conn) { recovering = false; attach(r.conn, r.ep); return; }
      if (backup && myIdx >= 0 && performance.now() - t0 >= myIdx * SUCC_STEP) {
        const ok = await becomeHost(epoch + 1, backup);
        if (ok === true) { recovering = false; return; }
      }
      await sleep(700);
    }
    if (!stopped) { stopped = true; cb.onFail('The host left and nobody could take over the room.'); }
  }

  // ------------------------------------------------------------ start

  (async () => {
    if (!code) {
      cb.onStatus('Creating a room…');
      for (let i = 0; i < 5; i++) {
        code = roomCode();
        tok = tokenFor(code);
        const r = await becomeHost(0, null);
        if (r === true) { cb.onReady({ code }); return; }
        if (r !== false) { cb.onFail(peerError(r)); return; }
      }
      cb.onFail('Could not create a room — try again.');
      return;
    }
    cb.onStatus(`Joining room ${code}…`);
    const r = await findHost(0, PROBE, 20000);
    if (r.conn) { attach(r.conn, r.ep); cb.onReady({ code }); return; }
    stopped = true;
    if (gpeer) gpeer.destroy();
    cb.onFail(r.error ? peerError(r.error) : r.allGone ? 'Room not found — check the code or ask the host for a new link.' : 'The host is not responding — check the code or try again.');
  })();

  // pilnowanie łącza: host sprząta milczących gości, gość wykrywa milczącego hosta
  const watch = setInterval(() => {
    const t = performance.now();
    if (host) for (const c of [...host.conns.values()]) if (t - c.at > DEAD_MS) c.bye();
    if (guest && t - guest.lastRx > DEAD_MS) recover(false);
  }, 2000);

  function stop() {
    if (stopped && !host && !guest) return;
    stopped = true; gen++;
    clearInterval(watch);
    if (guest && guest.conn.open) guest.conn.send(BYE);
    if (host) {
      for (const c of host.conns.values()) if (c.conn.open) c.conn.send(BYE);
      host.peer.destroy();
      host.worker.terminate();
    }
    if (gpeer) gpeer.destroy();
    host = null; guest = null; link = null;
  }
  addEventListener('pagehide', stop);

  return { send: (s) => { if (link) link.send(s); }, stop };
}
