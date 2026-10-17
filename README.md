# FORTJEDE 🪂

> Interfejs gry jest po angielsku. Menu (Esc) ma zakładki: Teams, Match settings, Options (grafika, celowanie, czułość myszy, głośność) i Controls.

Przeglądarkowy battle royale w stylu Fortnite (bez budowania), napisany w three.js. Nie ma tu bundlera ani kroku budowania, a do grania **nie jest potrzebny serwer gry**.

## Granie: https://bokamix.github.io/fortjede/

1. Jedna osoba (host) wpisuje nick i klika **CREATE ROOM**. Mecz liczy się w jej przeglądarce.
2. W lobby widać kod pokoju i link zaproszenia (**Copy link**). Host wysyła go znajomym.
3. Znajomi otwierają link i klikają **JOIN ROOM** (albo wpisują kod ręcznie na stronie głównej).

Przełączenie się na inną kartę nie zatrzymuje gry, bo u hosta symulacja działa w Web Workerze.

### Wyjście hosta i powrót do gry

- **Host może wyjść.** Co 2 s wysyła wszystkim kopię stanu meczu. Gdy wyjdzie (albo straci internet), pokój automatycznie przejmuje kolejny gracz, a reszta łączy się z nim sama. Gra przytnie się na kilka sekund, a na górze ekranu widać komunikat. Link zaproszenia dalej działa.
- **Rozłączony gracz zostaje na mapie.** Jego postać stoi w miejscu (z napisem „offline”) i można ją zabić. Wtedy jej ekwipunek wypada na ziemię.
- **Powrót do swojej postaci.** Po odświeżeniu strony, zerwaniu łącza albo ponownym wejściu z linku wracasz do swojej postaci z jej zdrowiem, tarczą, ekwipunkiem i drużyną (przeglądarka pamięta token gracza dla pokoju). W lobby rozłączony gracz znika po minucie, a w meczu stoi do jego końca.

### Jak to działa

- Strona jest statyczna (GitHub Pages, publikowana automatycznie z `public/` przy każdym pushu do `main`).
- Host uruchamia symulację meczu (`public/sim.js`) w Web Workerze (`public/host-worker.js`). Przy przejęciu pokoju następca startuje ją z ostatniej kopii stanu pod kolejnym identyfikatorem (`KOD-1`, `KOD-2`…).
- Goście łączą się z przeglądarką hosta przez **WebRTC** (biblioteka PeerJS, `public/net.js`). Darmowy serwer PeerJS służy tylko do zestawienia połączenia, a cały ruch gry idzie bezpośrednio peer-to-peer. Gdy bezpośrednie połączenie nie wyjdzie (restrykcyjny NAT, np. niektóre sieci komórkowe), PeerJS przechodzi na swoje serwery TURN.
- Wysyłanie danych obciąża łącze hosta: przy kilku graczach i wielu botach to rząd 0,5–1,5 MB/s.

## Uruchomienie lokalne (do testów)

```bash
npm start        # statyczny serwer na http://localhost:3000
```

Inny port: `PORT=8080 npm start`. Można otworzyć dwie karty: w jednej utworzyć pokój, w drugiej do niego dołączyć.

## Jak wygląda rozgrywka

1. **Lobby / rozgrywka rozgrzewkowa**: biegasz po mapie, zbierasz loot, możesz strzelać do kolegów (odradzasz się po 3 s).
2. **Esc → START MECZU**: ustawiasz liczbę botów (0–30) i każdy gracz może wystartować mecz.
3. **Autobus Bojowy** przelatuje nad wyspą. **Spacja** wyskakuje, a lotnia otwiera się sama nisko nad ziemią (albo wcześniej, spacją).
4. **Burza** zacieśnia się w 5 fazach i zadaje coraz większe obrażenia.
5. Ostatni żywy dostaje **#1 VICTORY ROYALE**, a potem wszyscy wracają do lobby.

## Host i ustawienia meczu

- **Host** to osoba, która utworzyła pokój (albo przejęła go po poprzednim hoście). Może przekazać rolę hosta (ustawianie drużyn i meczu) komuś innemu przyciskiem 👑 przy nicku, ale symulacja dalej działa w przeglądarce tego, kto prowadzi pokój.
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

### Telefon (iPhone, Android)

Na telefonie gra sama włącza sterowanie dotykiem (wymuszenie do testów na komputerze: `?touch=1`, wyłączenie: `?touch=0`). Gra się poziomo:

- lewy kciuk: joystick (pojawia się tam, gdzie dotkniesz); pchnięcie do przodu za obręcz to sprint,
- prawy kciuk: przeciąganie gdziekolwiek obraca kamerą; przeciąganie po przycisku strzału też celuje,
- przyciski: FIRE (drugi, mniejszy po lewej), AIM, JUMP, CROUCH, RELOAD, a obok łupu, skrzyni lub karty pojawia się PICK UP / OPEN (przytrzymanie przy furgonetce = reboot),
- stuknięcie w slot zmienia przedmiot, w minimapę otwiera mapę, w liczniki 👤 💀 pokazuje tabelę drużyn, ❚❚ to menu.

Na iPhonie najlepiej dodać stronę do ekranu początkowego (Udostępnij → Do ekranu początkowego): gra uruchamia się wtedy na pełnym ekranie, bez pasków Safari. Domyślna jakość grafiki na telefonie to Low. Jeśli nie ma dźwięku, sprawdź przełącznik wyciszenia z boku iPhone'a.

## Zawartość

- Bronie: pistolet, pistolet maszynowy, karabin szturmowy, strzelba, snajperka. Każda w 5 rzadkościach (szara → złota), a pusty slot daje kilof.
- Leczenie: bandaże, apteczka, mała i duża tarcza.
- **Niszczenie otoczenia**: kilofem (pusty slot) rozwalasz ściany, dachy, skrzynki, kontenery, drzewa i skały, a kule też je kruszą, tylko wolniej. Zniszczenia widzą wszyscy i odnawiają się przy każdym meczu.
- Skrzynie (złote, otwierane przez E), loot leżący na ziemi, a pokonani gracze i boty zostawiają swoje przedmioty.
- Trafienia w głowę, liczby obrażeń, killfeed, obserwowanie po śmierci.
- Losowa wyspa w każdym nowym pokoju: 5 nazwanych miasteczek, domy z drzwiami i oknami, kontenery, drzewa, skały, wzgórze.

## Grafika

W menu (Esc) jest przełącznik **Grafika: Niska / Średnia / Wysoka**, a wybór zapamiętuje przeglądarka. Na słabszym laptopie albo przy spadkach płynności ustaw Niską: wyłącza postprocessing i trawę wokół gracza oraz zmniejsza cienie. Wysoka dodaje cieniowanie otoczenia (AO), gęstszą trawę i ostrzejsze cienie.

## Pliki

- `server.js`: lokalny serwer plików statycznych do testów
- `public/sim.js`: autorytatywna symulacja meczu (burza, loot, boty, drużyny), działa u hosta
- `public/host-worker.js`: Web Worker hosta, który uruchamia `sim.js`
- `public/net.js`: sieć P2P (WebRTC/PeerJS): tworzenie pokoju, dołączanie, ponowne łączenie i przejmowanie pokoju
- `public/shared.js`: kod wspólny dla symulacji i klienta (mapa, kolizje, raycast, bronie)
- `public/game.js`: klient (sterowanie myszą i dotykiem, HUD, kamera)
- `public/visuals.js`: oprawa graficzna (niebo, woda, teren, faktury, roślinność, postprocessing)
- `public/avatar.js`: postacie i ich animacje
- `public/gunfx.js`: modele broni, ikony, dźwięki i efekty strzałów
- `public/index.html`, `public/style.css`: UI

Gra ufa klientom (pozycje i trafienia liczy przeglądarka), a host ma pełną kontrolę nad symulacją, więc nadaje się do grania ze znajomymi, a nie z obcymi.
