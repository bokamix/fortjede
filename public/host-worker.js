// Fortjede — Web Worker hosta: uruchamia symulację (sim.js) poza głównym wątkiem,
// żeby gra nie zwalniała, gdy host przełączy kartę (timery w tle są tam dławione).
// Protokół z wątkiem głównym: in {t:'open'|'msg'|'close', cid, owner?, data?}, out {cid, data}.
import { connect, step, TICK } from './sim.js';

const sessions = new Map(); // cid -> sesja z sim.connect

self.onmessage = ({ data: m }) => {
  if (m.t === 'open') {
    const cid = m.cid;
    sessions.set(cid, connect({ send: (data) => self.postMessage({ cid, data }) }, m.owner));
  } else if (m.t === 'msg') {
    sessions.get(m.cid)?.message(m.data);
  } else if (m.t === 'close') {
    sessions.get(m.cid)?.close();
    sessions.delete(m.cid);
  }
};

setInterval(step, TICK);
