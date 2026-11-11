# Simulator de mișcări de aparat

Aplicație web statică, fără conturi și fără server. Merge pe tablete Android (Chrome), pe tabla interactivă și pe PC.

## Cum se folosește
- `dist/simulator-miscari-aparat.html` — un singur fișier, cu totul inclus (merge și fără internet).
- Pentru găzduire (Etapa 3, GitHub Pages / Netlify): se urcă întregul folder (`index.html`, `css/`, `js/`).
- După orice modificare a surselor: `python3 build.py` reface fișierul unic.

## Unde se schimbă ce
| Vrei să schimbi… | Fișier |
|---|---|
| un termen din interfață, pragurile pentru încadraturi / tipul obiectivului, glosarul | `js/terms.js` |
| secvențele model | `js/presets.js` |
| vitezele mișcărilor | `RATE` în `js/engine.js` |

## Arhitectură (pregătită pentru Etapa 2)
- **Documentul secvenței** (`js/model.js`): un singur obiect JSON — decor, personaje + traiectorii, poziția de start a camerei, durată, provocare, mișcarea înregistrată (`track.keys`, `track.log`). Același obiect se salvează local, se exportă ca fișier și (în Etapa 2) se trimite de la tablă la tablete.
- **Store** (`js/store.js`): orice schimbare trece prin `store.dispatch(action)`. Acțiunile sunt JSON simplu.
  - acțiunile `doc/*`, `set/*`, `prop/*`, `char/*`, `path/*`, `track/*` modifică secvența;
  - `live/camera`, `time/set`, `play/set`, `select`, `ui/set` sunt starea de lucru a dispozitivului.
- **Puncte de conectare pentru Etapa 2:**
  - `store.use((action, next) => { trimite(action); next(action); })` — interceptează acțiunile locale;
  - `store.applyRemote(action)` — aplică o acțiune primită fără s-o retrimită;
  - `store.getDoc()` / `{type:'doc/load', doc}` — „profesorul trimite secvența pe toate tabletele”;
  - `state.live.camera` + `state.time` — „Trimite pe tablă” (camera și momentul curent al unui elev).
- Vizualizarea (`view3d.js`, `plan.js`) și interfața (`ui.js`) doar citesc starea, deci modul clasă se adaugă fără rescriere. Dacă sincronizarea cade, fiecare dispozitiv continuă să funcționeze singur.


## Storyboard (cadre)
- O secvență are mai multe **cadre** (`doc.shots[]`): fiecare cu propria cameră de start, mișcare înregistrată (`track`), durată, momentul din acțiune la care începe (`start`) și note (`notes`).
- Personajele se mișcă după timpul scenei: `state.sceneTime = shot.start + state.time`.
- Pagina Storyboard randează fiecare cadru la cerere (`view3d.renderStill`), deci nu se salvează imagini în secvență.
- Secvențele vechi (un singur cadru) sunt convertite automat la încărcare (`normalizeDoc`).

## Modul Clasă (Etapa 2)
- `js/sync.js`: transportul (interschimbabil) + logica clasei. Fără configurare, folosește `BroadcastChannel` (doar între ferestre pe același dispozitiv). Cu `SIM.config.firebase` completat în `js/config.js`, folosește Firebase Realtime Database (`clase/<COD>/host`, `/all`, `/live`).
- `js/classui.js`: ecranele Clasă, banda de stare, butonul „Trimite pe tablă”. Linkul din QR are forma `…/index.html?clasa=COD`.
- Elevul care controlează tabla trimite acțiunile (prin `store.use`) și un flux de cameră/timp la ~20 pe secundă; tabla le aplică cu `store.applyRemote` și nu își mai avansează singură timpul (`state.remoteDriven`).
