/* Secvențe model incluse în aplicație și memoria locală pentru secvențele salvate. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;
  const P = (type, x, z, o) => M.makeProp(type, Object.assign({ x, z }, o || {}));
  const C = (i, o) => M.makeCharacter(o, i);
  // secvențele model au un singur cadru: camera + durata sunt mutate în cadru de normalizeDoc
  const doc = (o) => { const d = Object.assign(M.newDoc(), o); delete d.shots; return d; };

  function columnsCorridor(z0, z1, step, x) {
    const out = [];
    for (let z = z0; z >= z1; z -= step) { out.push(P('coloana', -x, z)); out.push(P('coloana', x, z)); }
    return out;
  }

  const builtins = [
    () => doc({
      id: 'model-demo', name: 'Demo – mișcări de bază', duration: 14,
      challenge: 'Urmărește personajul cu un travling lateral, apoi termină cu o panoramare verticală în sus.',
      set: { w: 18, d: 16, backdrop: 'pereti', props: [
        P('masa', 3, -3), P('scaun', 3, -2.2, { yaw: 180 }), P('scaun', 3, -3.8), P('canapea', -4, -6.5),
        P('lampa', -6.5, -6.5), P('coloana', -6, -1), P('coloana', 6, -1), P('cutie', -2, -5), P('cutie', -1.4, -5.2, { h: 0.4, w: 0.5, d: 0.5, color: '#bc6c25' }),
      ] },
      characters: [C(0, { name: 'Ana', x: -6, z: 0, yaw: 90, speed: 1.0, path: [{ x: 6, z: 0 }] })],
      camera: { x: 0, y: 1.6, z: 6, yaw: 0, tilt: 0, roll: 0, focal: 35 },
    }),
    () => doc({
      id: 'model-tf-travling', name: 'Transfocare vs. travling', duration: 10,
      challenge: 'Apropie-te de personaj o dată prin transfocare și o dată prin travling. Ce se întâmplă cu coloanele din spate?',
      set: { w: 12, d: 30, backdrop: 'pereti', props: columnsCorridor(-1, -13, 2, 2.4).concat([P('perete', 0, -14.6, { w: 6, color: '#a23b3b' })]) },
      characters: [C(0, { name: 'Ana', x: 0, z: 0, yaw: 180 })],
      camera: { x: 0, y: 1.6, z: 9, yaw: 0, tilt: 0, roll: 0, focal: 35 },
    }),
    () => doc({
      id: 'model-transtrav', name: 'Transtrav (efectul Vertigo)', duration: 10,
      challenge: 'Folosește transtrav: personajul trebuie să rămână la fel de mare în cadru, dar fundalul se schimbă.',
      set: { w: 12, d: 34, backdrop: 'pereti', props: columnsCorridor(0, -15, 1.5, 2).concat([P('perete', 0, -16.5, { w: 5, color: '#3d405b' })]) },
      characters: [C(0, { name: 'Ana', x: 0, z: 1, yaw: 180 })],
      camera: { x: 0, y: 1.6, z: 5, yaw: 0, tilt: 0, roll: 0, focal: 50 },
    }),
    () => doc({
      id: 'model-dialog', name: 'Dialog – două personaje', duration: 10,
      challenge: 'Fă un travling circular în jurul celor două personaje, păstrându-le pe amândouă în cadru.',
      set: { w: 14, d: 14, backdrop: 'pereti', props: [P('masa', 0, 0), P('lampa', 0, -4), P('canapea', -4.5, -4.5, { yaw: 45 }), P('coloana', 4.5, -4.5)] },
      characters: [C(0, { name: 'Ana', x: -1.1, z: 0, yaw: 90 }), C(1, { name: 'Matei', x: 1.1, z: 0, yaw: -90 })],
      camera: { x: 0, y: 1.6, z: 5, yaw: 0, tilt: 0, roll: 0, focal: 35 },
    }),
    () => doc({
      id: 'model-urmarire', name: 'Urmărire – personaj în mers', duration: 16,
      challenge: 'Urmărește personajul cu un travling de urmărire, apoi oprește aparatul și lasă-l să iasă din cadru.',
      set: { w: 30, d: 24, backdrop: 'exterior', props: [
        P('copac', -9, -4), P('copac', -4, -6), P('copac', 2, -5), P('copac', 8, -7), P('copac', 12, -3),
        P('lampa', -6, 2), P('lampa', 0, 2), P('lampa', 6, 2), P('cutie', 4, 4),
      ] },
      characters: [C(0, { name: 'Matei', x: -12, z: 0, yaw: 90, speed: 1.4, path: [{ x: -4, z: 0 }, { x: 4, z: -2 }, { x: 12, z: -1 }] })],
      camera: { x: -9, y: 1.5, z: 5, yaw: 0, tilt: 0, roll: 0, focal: 35 },
    }),
    () => doc({
      id: 'model-deschidere', name: 'Deschidere de scenă', duration: 14,
      challenge: 'Pornește dintr-un prim-plan și deschide scena până la un plan de ansamblu: travling înapoi, travling vertical în sus și panoramare verticală în jos.',
      set: { w: 30, d: 30, backdrop: 'exterior', props: [
        P('copac', -6, -6), P('copac', 6, -8), P('copac', -10, 4), P('copac', 10, 3), P('masa', 0, -3), P('scaun', -1, -3, { yaw: 90 }), P('scaun', 1, -3, { yaw: -90 }),
      ] },
      characters: [
        C(0, { name: 'Ana', x: 0, z: 1.5, yaw: 180 }),
        C(1, { name: 'Matei', x: -8, z: -1, yaw: 90, speed: 1.1, path: [{ x: 8, z: -1 }] }),
        C(2, { name: 'Ioana', x: 6, z: 6, yaw: -45, speed: 0.9, path: [{ x: -4, z: -8 }] }),
      ],
      camera: { x: 0, y: 1.5, z: 3.4, yaw: 0, tilt: 0, roll: 0, focal: 50 },
    }),
    () => {
      // secvență cu mai multe cadre: exemplu de storyboard
      const d = M.newDoc();
      Object.assign(d, {
        id: 'model-storyboard', name: 'Storyboard – întâlnire în parc', loop: false,
        challenge: 'Completează storyboard-ul: adaugă cadrul 4 cu reacția lui Matei, apoi transformă cadrul 2 într-un travling lateral.',
        set: { w: 26, d: 20, backdrop: 'exterior', props: [
          P('copac', -8, -5), P('copac', -3, -7), P('copac', 5, -6), P('copac', 9, -2), P('copac', -10, 5),
          P('lampa', 3, -1.2), P('canapea', 3.2, -2.4, { color: '#6d4c41', h: 0.8 }), P('cutie', -5, 3, { color: '#8a9a5b' }),
        ] },
        characters: [
          C(0, { name: 'Ana', x: 2.2, z: -0.6, yaw: -90 }),
          C(1, { name: 'Matei', x: -10, z: 1, yaw: 90, speed: 1.2, path: [{ x: -4, z: 0.6 }, { x: 0.9, z: -0.4 }] }),
        ],
      });
      d.shots = [
        M.makeShot({ start: 0, duration: 4, camera: { x: -1, y: 1.8, z: 11, yaw: 0, tilt: -2, roll: 0, focal: 24 },
          notes: 'Parcul, după-amiază. Ana așteaptă lângă felinar. Matei apare din stânga.' }),
        M.makeShot({ start: 4, duration: 4, camera: { x: -2.8, y: 1.5, z: 5, yaw: 0, tilt: 0, roll: 0, focal: 35 },
          notes: 'Matei grăbește pasul spre Ana.' }),
        M.makeShot({ start: 8, duration: 3.5, camera: { x: 0.2, y: 1.62, z: 0.6, yaw: 65, tilt: 0, roll: 0, focal: 85 },
          notes: 'Ana îl vede. ANA: «Ai întârziat.»' }),
      ];
      return d;
    },
  ];

  const KEY = 'sim-miscari-aparat:secvente';
  function readSaved() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
  }
  function writeSaved(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  // secvențele salvate: pe dispozitiv (implicit) sau în sesiunea deschisă (setBackend)
  let backend = null;
  SIM.presets = {
    builtins: () => builtins.map((f) => M.normalizeDoc(f())),
    setBackend(b) { backend = b; },
    inSession: () => !!backend,
    saved() { return backend ? backend.saved() : readSaved(); },
    save(doc) {
      const copy = M.clone(doc);
      copy.savedAt = new Date().toISOString();
      if (backend) return backend.save(copy);
      const list = readSaved().filter((d) => d.id !== doc.id);
      list.unshift(copy);
      return writeSaved(list);
    },
    remove(id) { return backend ? backend.remove(id) : writeSaved(readSaved().filter((d) => d.id !== id)); },
    // lucrul nesalvat de data trecută (doar modificări nesalvate; se oferă la deschidere, nu se încarcă singur)
    rememberLast(doc) { try { localStorage.setItem(KEY + ':ultima', JSON.stringify(doc)); } catch (e) {} },
    forgetLast() { try { localStorage.removeItem(KEY + ':ultima'); } catch (e) {} },
    last() { try { const d = JSON.parse(localStorage.getItem(KEY + ':ultima') || 'null'); return d ? M.normalizeDoc(d) : null; } catch (e) { return null; } },
  };
})();
