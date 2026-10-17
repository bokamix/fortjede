# FORTJEDE 🪂

> Interfejs gry jest po angielsku. Menu (Esc) ma zakładki: Teams, Match settings, Options (grafika, celowanie, czułość myszy, głośność) i Controls.

Przeglądarkowy battle royale w stylu Fortnite (bez budowania), napisany w three.js. Nie ma tu bundlera ani kroku budowania: serwer Node podaje pliki wprost.

## Start

```bash
npm install      # tylko raz (three + ws)
npm start        # serwer na http://localhost:3000
```

Inny port: `PORT=8080 npm start`

## Granie z kolegami przez ngrok

```bash
ngrok http 3000
```

Wyślij kolegom adres `https://….ngrok-free.app`. Na darmowym ngroku przy pierwszym wejściu pojawi się ostrzeżenie, wystarczy kliknąć **Visit Site**. WebSocket idzie tym samym adresem, więc nie trzeba nic więcej konfigurować.

## Jak wygląda rozgrywka

1. **Lobby / rozgrywka rozgrzewkowa**: biegasz po mapie, zbierasz loot, możesz strzelać do kolegów (odradzasz się po 3 s).
2. **Esc → START MECZU**: ustawiasz liczbę botów (0–30) i każdy gracz może wystartować mecz.
3. **Autobus Bojowy** przelatuje nad wyspą. **Spacja** wyskakuje, a lotnia otwiera się sama nisko nad ziemią (albo wcześniej, spacją).
4. **Burza** zacieśnia się w 5 fazach i zadaje coraz większe obrażenia.
5. Ostatni żywy dostaje **#1 VICTORY ROYALE**, a potem wszyscy wracają do lobby.

## Host i ustawienia meczu

- **Host** to osoba grająca na komputerze, na którym działa serwer (rozpoznawana po połączeniu lokalnym, a nie przez ngrok). Gdy nikt nie gra lokalnie, hostem zostaje pierwszy gracz. Host może przekazać hosta komuś innemu przyciskiem 👑 przy nicku.
- Tylko host ustawia drużyny, zmienia ustawienia i startuje mecz. Pozostali widzą wszystko, ale nie mogą tego zmienić.
- Ustawienia w lobby (Esc):

| Ustawienie | Zakres |
|---|---|
| Liczba botów | 0–30 |
| Poziom botów | łatwe / normalne / trudne |
| Odradzanie | wł./wył. |
| Czas karty na ziemi | 10–300 s |
| Przytrzymanie E przy punkcie | 1–20 s |
| Przerwa punktu odrodzenia | 0–180 s |
| Ogień do swoich | wł./wył. |
| Szybkość burzy | ×0.5–×2 |
| Ilość lootu | mało – bardzo dużo |
| Zdrowie na start | 1–100 |
| Tarcza na start | 0–100 |

- Boty są widoczne w lobby od razu i można je przypisać do drużyn tak samo jak graczy, także do drużyny z ludźmi.

## Drużyny i odradzanie

- W lobby (Esc) host układa drużyny na tablicy: **dowolnie wiele drużyn** („+ Nowa drużyna”, × usuwa drużynę, a nazwę zmienia się kliknięciem). Gracza albo bota przenosi się, przeciągając jego żeton na drużynę, albo klikając żeton, a potem drużynę. Szybkie akcje: „Wszyscy solo”, „Losowo po N” (z botami albo bez), „Rozdziel boty do drużyn graczy”, „Usuń puste”.
- Kolegów z drużyny nie da się zranić. Ich nicki są w kolorze drużyny i widać je przez ściany, a na minimapie mają kropki. Panel z ich zdrowiem jest w lewym dolnym rogu.
- Po śmierci zostaje twoja **karta odrodzenia**, którą widzą tylko koledzy. Leży 90 s i przepada, jeśli nikt jej nie podniesie.
- Kolega podnosi kartę (`E`), zanosi ją do **♻ Punktu Odrodzenia** (furgonetka z niebieską wiązką światła, jedna na mapie, zaznaczona na minimapie) i przytrzymuje `E` przez 4 s. Odrodzony gracz spada na lotni nad punktem z pistoletem.
- Po każdym odrodzeniu punkt ładuje się 15 s. Gdy niosący kartę zginie, karta spada na ziemię i znów ma 90 s.
- Wygrywa ostatnia drużyna, w której ktoś żyje. Pod klawiszem `Tab` jest tabela wszystkich drużyn.
- Karty kolegów widać jako znaczniki na ekranie z odległością (przy krawędzi ekranu ze strzałką), a gdy niesiesz kartę, pojawia się też znacznik Punktu Odrodzenia.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WSAD / Shift | ruch / sprint |
| Spacja | skok, wyskok z autobusu, lotnia |
| LPM / PPM | strzał (albo użycie apteczki) / celowanie: klik włącza i wyłącza (w menu można zmienić na przytrzymanie), snajperka ma lunetę |
| 1–5, kółko | sloty ekwipunku |
| R | przeładowanie |
| E | podnieś / otwórz skrzynię |
| Q | wyrzuć przedmiot |
| C | kucanie (w biegu: ślizg) |
| W + Spacja przy krawędzi | wspinaczka / przeskok |
| M | duża mapa |

## Zawartość

- Bronie: pistolet, pistolet maszynowy, karabin szturmowy, strzelba, snajperka. Każda w 5 rzadkościach (szara → złota), a pusty slot daje kilof.
- Leczenie: bandaże, apteczka, mała i duża tarcza.
- **Niszczenie otoczenia**: kilofem (pusty slot) rozwalasz ściany, dachy, skrzynki, kontenery, drzewa i skały, a kule też je kruszą, tylko wolniej. Zniszczenia widzą wszyscy i odnawiają się przy każdym meczu.
- Skrzynie (złote, otwierane przez E), loot leżący na ziemi, a pokonani gracze i boty zostawiają swoje przedmioty.
- Trafienia w głowę, liczby obrażeń, killfeed, obserwowanie po śmierci.
- Losowa wyspa przy każdym uruchomieniu serwera: 5 nazwanych miasteczek, domy z drzwiami i oknami, kontenery, drzewa, skały, wzgórze.

## Grafika

W menu (Esc) jest przełącznik **Grafika: Niska / Średnia / Wysoka**, a wybór zapamiętuje przeglądarka. Na słabszym laptopie albo przy spadkach płynności ustaw Niską: wyłącza postprocessing i trawę wokół gracza oraz zmniejsza cienie. Wysoka dodaje cieniowanie otoczenia (AO), gęstszą trawę i ostrzejsze cienie.

## Pliki

- `server.js`: serwer HTTP + WebSocket, mecz, burza, loot i boty
- `public/shared.js`: kod wspólny dla serwera i przeglądarki (mapa, kolizje, raycast, bronie)
- `public/game.js`: klient (sterowanie, sieć, HUD, kamera)
- `public/visuals.js`: oprawa graficzna (niebo, woda, teren, faktury, roślinność, postprocessing)
- `public/avatar.js`: postacie i ich animacje
- `public/gunfx.js`: modele broni, ikony, dźwięki i efekty strzałów
- `public/index.html`, `public/style.css`: UI

Gra ufa klientom (pozycje i trafienia liczy przeglądarka), więc nadaje się do grania ze znajomymi, a nie z obcymi.
