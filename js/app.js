/* Pornirea aplicației și bucla principală. */
(function () {
  const SIM = window.SIM;
  const M = SIM.model;

  // la fiecare deschidere, aplicația pornește curat (secvența demo); lucrul nesalvat se oferă printr-un buton „Reia”
  const lastWork = SIM.presets.last();
  const startDoc = SIM.presets.builtins()[0];
  const store = SIM.createStore(startDoc);
  const st = store.state;
  const engine = (SIM.engine = SIM.createEngine(store));
  const camStage = document.getElementById('camStage');
  const view3d = (SIM.view3d = SIM.createView3D(camStage, store));
  const plan = SIM.createPlan(document.getElementById('plan'), store, engine);

  let needsRender = true;
  let compareAnim = false, animT = 0;
  const hooks = {
    resize: () => requestAnimationFrame(() => { view3d.resize(); plan.resize(); needsRender = true; }),
    fitPlan: () => { plan.fit(); needsRender = true; },
    planCenter: () => plan.center(),
    setCompareAnim: (v) => {
      compareAnim = v;
      if (v) animT = Math.acos(1 - 2 * st.compareS) / (Math.PI * 2 / 5); // pornește din poziția curentă
      document.getElementById('cmpAnim').textContent = v ? '⏸ Oprește' : '▶ Animează';
    },
    compareAnim: () => compareAnim,
  };
  const ui = (SIM.ui = SIM.createUI(store, engine, hooks));
  plan.onChange(() => (needsRender = true));
  const classroom = (SIM.classroom = SIM.createClassroom(store, engine));
  SIM.createClassUI(store, classroom, ui);

  // ce reconstruiește scena 3D
  const STRUCT = new Set(['doc/load', 'set/update', 'prop/add', 'prop/update', 'prop/remove', 'char/add', 'char/update', 'char/remove']);
  let saveTimer = null;
  // într-un cadru fără mișcare înregistrată, încadrarea curentă devine automat încadrarea cadrului
  let frameTimer = null;
  store.subscribe((a, s, meta) => {
    if (a.type !== 'live/camera' || (meta && meta.remote)) return;
    clearTimeout(frameTimer);
    frameTimer = setTimeout(() => {
      if (st.playing || st.recording || st.follow || st.aim || st.shot.track.keys.length) return;
      const a0 = st.shot.camera, b0 = st.live.camera;
      const same = ['x', 'y', 'z', 'yaw', 'tilt', 'roll', 'focal'].every((k) => Math.abs(a0[k] - b0[k]) < 1e-3);
      if (!same) store.dispatch({ type: 'doc/setStartCamera', camera: b0 });
    }, 450);
  });
  store.subscribe((a) => {
    needsRender = true;
    if (STRUCT.has(a.type)) view3d.syncObjects();
    if (a.type === 'doc/load') { plan.requestFit(); hooks.resize(); }
    if (store.isDocAction(a)) {
      // păstrează lucrul curent dacă se reîncarcă pagina
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { if (st.dirty) SIM.presets.rememberLast(store.getDoc()); }, 800);
    }
  });

  // salvează imediat dacă pagina se închide sau trece în fundal
  const flush = () => { clearTimeout(saveTimer); if (st.dirty) SIM.presets.rememberLast(store.getDoc()); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

  // butoanele ținute apăsat se eliberează oriunde s-ar ridica degetul
  ['pointerup', 'pointercancel'].forEach((ev) => window.addEventListener(ev, (e) => engine.release(e.pointerId)));
  window.addEventListener('blur', () => engine.releaseAll());
  document.addEventListener('visibilitychange', () => { if (document.hidden) { engine.releaseAll(); if (st.playing) engine.pause(); } });
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input,textarea')) e.preventDefault(); });

  // tastatură (pentru tabla interactivă / PC)
  const KEYS = {
    ArrowLeft: ['pan', -1], ArrowRight: ['pan', 1], ArrowUp: ['tilt', 1], ArrowDown: ['tilt', -1],
    w: ['dolly', 1], s: ['dolly', -1], a: ['truck', -1], d: ['truck', 1],
    r: ['ped', 1], f: ['ped', -1], q: ['arc', -1], e: ['arc', 1],
    '+': ['zoom', 1], '=': ['zoom', 1], '-': ['zoom', -1], z: ['transtrav', -1], x: ['transtrav', 1],
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === ' ') { e.preventDefault(); st.playing ? engine.pause() : engine.play(); return; }
    const k = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (k && !e.repeat) { e.preventDefault(); engine.press(k[0], k[1], 'key:' + e.key.toLowerCase()); }
  });
  window.addEventListener('keyup', (e) => engine.release('key:' + e.key.toLowerCase()));

  // redimensionare
  const ro = new ResizeObserver(() => { view3d.resize(); plan.resize(); needsRender = true; });
  ro.observe(camStage);
  ro.observe(document.getElementById('plan').parentElement);

  view3d.syncObjects();
  view3d.resize();
  plan.resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (engine.tick(dt)) needsRender = true;
    if (classroom.tick(dt)) needsRender = true;
    if (compareAnim && st.compare) {
      animT += dt;
      const s = 0.5 - 0.5 * Math.cos((animT * Math.PI * 2) / 5);
      store.dispatch({ type: 'ui/set', patch: { compareS: s } });
      document.getElementById('cmpS').value = s;
    }
    if (needsRender) {
      needsRender = false;
      const info = view3d.render();
      plan.draw();
      ui.renderHUD(info);
      ui.updateDynamic();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // oferta de a relua lucrul nesalvat de data trecută
  if (lastWork && !/[?&]clasa=/.test(location.search)) {
    const bar = document.createElement('div');
    bar.className = 'resume-bar';
    bar.setAttribute('role', 'status');
    const name = document.createElement('span');
    name.textContent = 'Ai modificări nesalvate în „' + lastWork.name + '” de data trecută.';
    const yes = document.createElement('button'); yes.className = 'btn primary'; yes.textContent = 'Reia';
    const no = document.createElement('button'); no.className = 'btn'; no.textContent = 'Începe curat';
    bar.append(name, yes, no);
    document.body.appendChild(bar);
    let timer = setTimeout(() => bar.remove(), 20000);
    yes.addEventListener('click', () => {
      clearTimeout(timer); bar.remove();
      store.dispatch({ type: 'doc/load', doc: lastWork });
      st.dirty = true; // tot nesalvat; „Salvează secvența” îl păstrează definitiv
      ui.toast('Ai reluat „' + lastWork.name + '”.');
    });
    no.addEventListener('click', () => { clearTimeout(timer); bar.remove(); SIM.presets.forgetLast(); });
  }

  // acces pentru teste și pentru Etapa 2
  SIM.app = { store, engine, view3d, plan, ui, classroom };
})();
