# Fortjede

Przeglądarkowy battle royale w three.js (bez kroku budowania). Serwer: `server.js` (Node + `ws`), klient w `public/` jako moduły ES ładowane wprost przez import map. Uruchomienie: `npm install`, `npm start` (port 3000), dla kolegów `ngrok http 3000`.

## Zasady pracy

- **Po każdej zakończonej zmianie zawsze rób commit i push** do `origin main` (https://github.com/bokamix/fortjede, remote po SSH). Nie pytaj o zgodę, po prostu commituj i wypychaj, z opisem zmian po polsku.
- Z użytkownikiem rozmawiaj po polsku, ale **wszystkie teksty w grze (UI, HUD, komunikaty, nazwy) są po angielsku**.
- Kod wspólny dla serwera i klienta (mapa, kolizje, bronie, ustawienia) trzymaj w `public/shared.js`.
