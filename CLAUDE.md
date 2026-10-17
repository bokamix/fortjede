# Fortjede

Przeglądarkowy battle royale w three.js (bez kroku budowania), multiplayer P2P bez serwera gry. Wszystko jest w `public/` jako moduły ES ładowane przez import map (three i PeerJS z CDN). Host liczy mecz w Web Workerze (`public/host-worker.js` → `public/sim.js`), a goście łączą się z nim przez WebRTC (`public/net.js`, PeerJS). Gdy host wyjdzie, pokój przejmuje następca z kopii stanu (`exportState`/`init` w `sim.js`), a gracze wracają do swoich postaci dzięki tokenowi. Publikacja: GitHub Pages z `public/` (workflow `.github/workflows/pages.yml`), adres https://bokamix.github.io/fortjede/. Lokalnie: `npm start` (statyczny serwer na porcie 3000).

## Zasady pracy

- **Po każdej zakończonej zmianie zawsze rób commit i push** do `origin main` (https://github.com/bokamix/fortjede, remote po SSH). Nie pytaj o zgodę, po prostu commituj i wypychaj, z opisem zmian po polsku.
- Z użytkownikiem rozmawiaj po polsku, ale **wszystkie teksty w grze (UI, HUD, komunikaty, nazwy) są po angielsku**.
- Kod wspólny dla symulacji i klienta (mapa, kolizje, bronie, ustawienia) trzymaj w `public/shared.js`. Logika meczu (autorytatywna) jest w `public/sim.js`.
