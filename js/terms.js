/* Toți termenii afișați în interfață. Pentru a corecta un termen, modifică doar acest fișier. */
(function () {
  const SIM = (window.SIM = window.SIM || {});

  SIM.T = {
    appTitle: 'Mișcări de aparat',
    appSubtitle: 'Simulator',

    views: {
      camera: 'Imaginea camerei',
      top: 'Imagine de sus',
      compare: 'Comparație',
    },

    // Mișcările. dirs: [negativ, pozitiv] — etichetele butoanelor.
    // Ordinea de aici = ordinea butoanelor: panoramări, travlinguri, transfocare, transtrav, unghi olandez, urmăriri.
    moves: [
      { id: 'pan', label: 'Panoramare orizontală', en: 'pan',
        axes: [{ key: 'pan', dirs: ['Stânga', 'Dreapta'], icons: ['◀', '▶'] }] },
      { id: 'tilt', label: 'Panoramare verticală', en: 'tilt',
        axes: [{ key: 'tilt', dirs: ['Jos', 'Sus'], icons: ['▼', '▲'] }] },
      { id: 'dolly', label: 'Travling înainte / înapoi', en: 'dolly',
        axes: [{ key: 'dolly', dirs: ['Înapoi', 'Înainte'], icons: ['▼', '▲'] }] },
      { id: 'truck', label: 'Travling lateral', en: 'tracking',
        axes: [{ key: 'truck', dirs: ['Stânga', 'Dreapta'], icons: ['◀', '▶'] }] },
      { id: 'arc', label: 'Travling circular', en: 'arc',
        axes: [{ key: 'arc', dirs: ['Stânga', 'Dreapta'], icons: ['↶', '↷'] }] },
      { id: 'ped', label: 'Travling vertical', en: 'pedestal',
        axes: [{ key: 'ped', dirs: ['Jos', 'Sus'], icons: ['▼', '▲'] }] },
      { id: 'zoom', label: 'Transfocare', en: 'zoom',
        axes: [{ key: 'zoom', dirs: ['Înapoi', 'Înainte'], icons: ['−', '+'] }] },
      { id: 'transtrav', label: 'Transtrav', en: 'efectul Vertigo',
        axes: [{ key: 'transtrav', dirs: ['Înapoi', 'Înainte'], icons: ['▼', '▲'] }] },
      { id: 'roll', label: 'Unghi olandez', en: 'dutch',
        axes: [{ key: 'roll', dirs: ['Stânga', 'Dreapta'], icons: ['↺', '↻'] }] },
      { id: 'aim', toggle: true },
      { id: 'follow', toggle: true },
    ],

    // Comutatoare (mișcări automate legate de personajul selectat)
    follow: { label: 'Travling de urmărire', hint: 'Aparatul se deplasează odată cu personajul selectat.' },
    aim: { label: 'Panoramare de urmărire', hint: 'Aparatul rămâne pe loc și se rotește după personajul selectat.' },
    combined: 'Mișcare combinată',

    // Încadraturi — de la cel mai larg la cel mai strâns
    shots: {
      ansamblu: 'Plan de ansamblu',
      general: 'Plan general',
      intreg: 'Plan întreg',
      americanSub: 'Plan american sub genunchi',
      americanPeste: 'Plan american peste genunchi',
      mediu: 'Plan mediu',
      prim: 'Prim-plan',
      primStrans: 'Prim-plan strâns',
      detaliu: 'Plan detaliu',
      none: 'Niciun personaj în cadru',
    },
    // Praguri: cât din înălțimea personajului (de la creștet în jos) intră în cadru
    shotThresholds: { americanSub: 0.72, americanPeste: 0.58, mediu: 0.38, prim: 0.2, primStrans: 0.1 },
    // Personaj întreg în cadru: raport înălțime cadru / înălțime personaj
    shotWide: { intreg: 2.6, general: 7 },

    angles: { normal: 'Unghi normal', plonjeu: 'Plonjeu', contraplonjeu: 'Contraplonjeu' },
    angleThreshold: 8, // grade de înclinare

    lens: {
      focal: 'Distanță focală',
      fov: 'Unghi de cuprindere',
      wide: 'Obiectiv wide',
      normal: 'Obiectiv normal',
      tele: 'Teleobiectiv',
      wideMax: 35, // sub 35 mm = wide
      normalMax: 70, // 35–70 mm = normal, peste = teleobiectiv
      perspective: 'Perspectivă',
      compression: 'Compresia perspectivei',
    },

    props: {
      obiect: 'Obiect (orice)',
      perete: 'Perete', masa: 'Masă', scaun: 'Scaun', canapea: 'Canapea',
      cutie: 'Cutie', coloana: 'Coloană', copac: 'Copac', lampa: 'Lampă',
    },

    backdrops: { pereti: 'Studio (pereți)', exterior: 'Exterior', gol: 'Fără fundal' },

    glossary: [
      ['Panoramare orizontală (pan)', 'Aparatul se rotește pe loc, stânga–dreapta, în jurul axei verticale.'],
      ['Panoramare verticală (tilt)', 'Aparatul se rotește pe loc, în sus sau în jos.'],
      ['Panoramare de urmărire', 'Aparatul rămâne pe loc și se rotește ca să păstreze personajul în cadru.'],
      ['Travling înainte / înapoi', 'Aparatul se deplasează spre subiect sau se îndepărtează de el. Perspectiva se schimbă: planurile din imagine se despart.'],
      ['Travling lateral', 'Aparatul se deplasează paralel cu subiectul, spre stânga sau spre dreapta.'],
      ['Travling circular', 'Aparatul se deplasează pe un arc de cerc în jurul subiectului, privind permanent spre el.'],
      ['Travling vertical (pedestal)', 'Aparatul urcă sau coboară vertical, fără să-și schimbe înclinarea.'],
      ['Travling de urmărire', 'Aparatul se deplasează odată cu personajul, păstrând aceeași distanță față de el.'],
      ['Transfocare (zoom)', 'Aparatul stă pe loc; se schimbă distanța focală. Imaginea se mărește sau se micșorează, dar perspectiva rămâne aceeași.'],
      ['Transtrav (efectul Vertigo)', 'Travling și transfocare executate simultan, în sens opus: personajul rămâne la fel de mare, iar fundalul se dilată sau se comprimă.'],
      ['Unghi olandez', 'Aparatul se rotește în jurul axei obiectivului; linia orizontului devine înclinată.'],
      ['Mișcare combinată', 'Două sau mai multe mișcări executate în același timp, de exemplu travling + panoramare.'],
    ],
  };
})();
