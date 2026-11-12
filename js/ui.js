/* Interfața: panouri, butoane de mișcare, cronologie, secvențe, glosar, HUD. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;
  const T = SIM.T;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtT = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
  const fmtShort = (t) => { const m = Math.floor(t / 60), s = Math.round(t - m * 60); return m + ':' + (s < 10 ? '0' : '') + s; };

  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" ><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 4.5h4.2v15H6zM13.8 4.5H18v15h-4.2z" fill="currentColor"/></svg>';

  SIM.createUI = function (store, engine, hooks) {
    const st = store.state;
    const app = $('#app');
    const TABS = ['seq', 'shots', 'lens', 'chars', 'set', 'moves'];
    let tab = 'seq';
    try { const t = localStorage.getItem('sim-miscari-aparat:tab'); if (TABS.includes(t)) tab = t; } catch (e) {}
    let toastTimer = null;

    /* ---------- utilitare ---------- */
    function toast(msg) {
      const el = $('#toast');
      el.textContent = msg; el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }
    engine.onNotice(toast);

    function el(html) {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    }
    function on(root, sel, ev, fn) {
      root.querySelectorAll(sel).forEach((n) => n.addEventListener(ev, fn));
    }
    function slider(label, id, min, max, step, value, fmt) {
      return `<label class="field">${label}<div class="row"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><output id="${id}Out">${fmt(value)}</output></div></label>`;
    }
    function bindSlider(root, id, fmt, fn) {
      const inp = root.querySelector('#' + id), out = root.querySelector('#' + id + 'Out');
      inp.addEventListener('pointerdown', () => (inp.dataset.dragging = '1'));
      const stop = () => delete inp.dataset.dragging;
      inp.addEventListener('pointerup', stop); inp.addEventListener('pointercancel', stop); inp.addEventListener('change', stop);
      inp.addEventListener('input', () => { const v = parseFloat(inp.value); out.textContent = fmt(v); fn(v); });
    }
    function swatchesHTML(colors, current, name) {
      return `<div class="swatches">${colors.map((c) => `<button class="swatch${c === current ? ' on' : ''}" data-${name}="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`;
    }

    // un loc liber lângă centrul imaginii de sus, ca obiectele noi să nu se suprapună
    function freeSpot(ctr) {
      const taken = st.doc.characters.map((c) => M.charPose(c, st.sceneTime)).concat(st.doc.set.props);
      const base = { x: Math.round(ctr.x * 2) / 2, z: Math.round(ctr.z * 2) / 2 };
      for (let r = 0; r < 8; r++) {
        for (let a = 0; a < 8; a++) {
          const x = base.x + Math.round(Math.cos((a * Math.PI) / 4) * r * 1.2 * 2) / 2;
          const z = base.z + Math.round(Math.sin((a * Math.PI) / 4) * r * 1.2 * 2) / 2;
          if (taken.every((o) => Math.hypot(o.x - x, o.z - z) > 1.1)) return { x, z };
          if (r === 0) break;
        }
      }
      return base;
    }
    function selectedChar() { return st.selected && st.selected.kind === 'char' ? st.doc.characters.find((c) => c.id === st.selected.id) : null; }
    function selectedProp() { return st.selected && st.selected.kind === 'prop' ? st.doc.set.props.find((p) => p.id === st.selected.id) : null; }

    /* ---------- tab: mișcări ---------- */
    function holdButton(key, dir, icon, word) {
      return `<button class="hold" data-key="${key}" data-dir="${dir}"><b>${icon}</b><span>${esc(word)}</span></button>`;
    }
    function moveCard(m) {
      const rows = m.axes.map((ax) => {
        const lbl = m.axes.length > 1 ? `<span class="axis-lbl">${ax.key === 'boom' ? 'Braț' : 'Rotire'}</span>` : '';
        return `<div class="hold-row">${lbl}${holdButton(ax.key, -1, ax.icons[0], ax.dirs[0])}${holdButton(ax.key, 1, ax.icons[1], ax.dirs[1])}</div>`;
      }).join('');
      const wide = m.axes.length > 1;
      return `<div class="move${wide ? ' wide' : ''}" data-move="${m.id}"><div class="move-title">${esc(m.label)} <small>(${esc(m.en)})</small></div>${wide ? '<div class="axes">' + rows + '</div>' : rows}</div>`;
    }
    function speedCard() {
      const v = engine.getSpeed();
      return `<div class="move speed-card"><div class="move-title">Viteza mișcării</div>
        <div class="seg" id="speedSeg">${[[0.4, 'Lent'], [1, 'Normal'], [2.2, 'Rapid']].map(([s, l]) => `<button data-speed="${s}" class="${s === v ? 'on' : ''}">${l}</button>`).join('')}</div>
</div>`;
    }
    function renderMoves() {
      const sc = selectedChar();
      const followCard = `<div class="move toggle-card" title="${esc(T.follow.hint)}"><div class="move-title">${esc(T.follow.label)}</div>
            <button class="switch${st.follow ? ' on' : ''}" id="swFollow">${st.follow ? (sc ? esc(sc.name) : 'Pornit') : 'Oprit'}</button></div>`;
      const aimCard = `<div class="move toggle-card" title="${esc(T.aim.hint)}"><div class="move-title">${esc(T.aim.label)}</div>
            <button class="switch${st.aim ? ' on' : ''}" id="swAim">${st.aim ? (sc ? esc(sc.name) : 'Pornit') : 'Oprit'}</button></div>`;
      const cards = T.moves.map((m) => (m.id === 'aim' ? aimCard : m.id === 'follow' ? followCard : moveCard(m))).join('');
      const root = el(`<div class="mgrid">${cards}${speedCard()}</div>`);
      root.querySelectorAll('.hold').forEach((b) => {
        const key = b.dataset.key, dir = +b.dataset.dir;
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try { b.setPointerCapture(e.pointerId); } catch (_) {}
          if (engine.press(key, dir, e.pointerId)) { b.classList.add('down'); b.dataset.pid = e.pointerId; }
        });
        const up = (e) => { engine.release(e.pointerId); b.classList.remove('down'); };
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
      });
      on(root, '[data-speed]', 'click', (e) => {
        engine.setSpeed(parseFloat(e.currentTarget.dataset.speed));
        root.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === e.currentTarget));
      });
      const f = root.querySelector('#swFollow'), a = root.querySelector('#swAim');
      if (f) f.addEventListener('click', () => engine.toggleFollow(!st.follow));
      if (a) a.addEventListener('click', () => engine.toggleAim(!st.aim));
      return root;
    }

    /* ---------- tab: obiectiv ---------- */
    const LOGF = (f) => Math.log(f), EXPF = (v) => Math.exp(v);
    function renderLens() {
      const c = st.live.camera;
      const root = el(`<div class="form-grid">
        <div class="field">${esc(T.lens.focal)}
          <div class="row"><input type="range" id="focal" min="${LOGF(10)}" max="${LOGF(300)}" step="0.001" value="${LOGF(c.focal)}"><output id="focalOut">${Math.round(c.focal)} mm</output></div>
          <div class="chips">${[18, 24, 35, 50, 85, 135, 200].map((f) => `<button class="btn" data-focal="${f}">${f}</button>`).join('')}</div>
        </div>
        <div class="field">Ce vede obiectivul
          <div class="readout" id="lensRead"></div>
          <p class="hint">Sub ${T.lens.wideMax} mm: ${esc(T.lens.wide.toLowerCase())}. ${T.lens.wideMax}–${T.lens.normalMax} mm: ${esc(T.lens.normal.toLowerCase())}. Peste ${T.lens.normalMax} mm: ${esc(T.lens.tele.toLowerCase())}. Senzor full-frame, format 16:9.</p>
        </div>
        ${slider('Înălțimea aparatului', 'camH', 0.2, 8, 0.05, c.y, (v) => v.toFixed(2) + ' m')}
        <div class="field">Poziția aparatului
          <div class="btns">
            <button class="btn" id="lvlTilt">Aparat orizontal</button>
            <button class="btn" id="lvlRoll">Fără unghi olandez</button>
            <button class="btn" id="setStart">Setează ca poziție de start</button>
            <button class="btn" id="goStart">Revino la poziția de start</button>
          </div>
        </div>
      </div>`);
      const fi = root.querySelector('#focal');
      fi.addEventListener('pointerdown', () => (fi.dataset.dragging = '1'));
      ['pointerup', 'pointercancel', 'change'].forEach((ev) => fi.addEventListener(ev, () => delete fi.dataset.dragging));
      fi.addEventListener('input', () => store.dispatch({ type: 'live/camera', camera: { focal: EXPF(parseFloat(fi.value)) } }));
      on(root, '[data-focal]', 'click', (e) => store.dispatch({ type: 'live/camera', camera: { focal: +e.currentTarget.dataset.focal } }));
      bindSlider(root, 'camH', (v) => v.toFixed(2) + ' m', (v) => store.dispatch({ type: 'live/camera', camera: { y: v } }));
      root.querySelector('#lvlTilt').addEventListener('click', () => store.dispatch({ type: 'live/camera', camera: { tilt: 0 } }));
      root.querySelector('#lvlRoll').addEventListener('click', () => store.dispatch({ type: 'live/camera', camera: { roll: 0 } }));
      root.querySelector('#setStart').addEventListener('click', () => { store.dispatch({ type: 'doc/setStartCamera', camera: st.live.camera }); toast('Poziția de start a fost salvată în secvență.'); });
      root.querySelector('#goStart').addEventListener('click', () => store.dispatch({ type: 'live/camera', camera: M.clone(st.shot.camera) }));
      return root;
    }

    /* ---------- tab: personaje ---------- */
    function renderChars() {
      const sc = selectedChar();
      const list = st.doc.characters.map((c) => `<button class="btn${sc && sc.id === c.id ? ' on' : ''}" data-char="${c.id}"><span class="dotc" style="background:${c.color}"></span>${esc(c.name)}</button>`).join('');
      let detail = '<p class="empty">Atinge un personaj în imaginea de sus sau în listă ca să-l modifici. Trage personajul ca să-l muți; trage mânerul alb ca să-l rotești.</p>';
      const fmtDeg = (v) => Math.round(v) + '°';
      if (sc) {
        detail = `<div class="form-grid">
          <label class="field">Nume<input type="text" id="cName" value="${esc(sc.name)}" maxlength="24"></label>
          <div class="field">Culoare${swatchesHTML(M.CHAR_COLORS, sc.color, 'ccolor')}</div>
          ${slider('Viteza de deplasare', 'cSpeed', 0.3, 4, 0.1, sc.speed, (v) => v.toFixed(1) + ' m/s')}
          ${slider('Pornește după', 'cDelay', 0, 20, 0.5, sc.delay, (v) => v.toFixed(1) + ' s')}
          ${slider('Înălțime', 'cHeight', 1.0, 2.1, 0.01, sc.height, (v) => v.toFixed(2) + ' m')}
          <div class="field">Poziție<div class="seg" id="cPose">
            <button data-pose="stand" class="${sc.pose !== 'sit' ? 'on' : ''}">În picioare</button>
            <button data-pose="sit" class="${sc.pose === 'sit' ? 'on' : ''}">Așezat</button></div>
            <p class="hint">${sc.path.length ? 'Pe drum merge; stă așezat înainte să plece și după ce ajunge.' : 'Pune personajul pe un scaun sau pe canapea.'}</p></div>
          ${slider(sc.path.length ? 'Orientare la început' : 'Orientare', 'cYaw', -180, 180, 15, M.wrapDeg(sc.yaw), fmtDeg)}
          ${sc.path.length ? `<div class="field">Orientare la final
            <div class="row"><input type="range" id="cEndYaw" min="-180" max="180" step="15" value="${sc.endYaw == null ? 0 : M.wrapDeg(sc.endYaw)}"${sc.endYaw == null ? ' disabled' : ''}><output id="cEndYawOut">${sc.endYaw == null ? 'în direcția de mers' : fmtDeg(sc.endYaw)}</output></div>
            <div class="btns"><button class="btn${sc.endYaw != null ? ' on' : ''}" id="cEndYawOn">${sc.endYaw != null ? '✓ Se întoarce la final' : 'Se întoarce la final'}</button></div>
            <p class="hint">Pe drum privește în direcția de mers. În imaginea de sus, mânerul alb apare înainte de plecare și după sosire.</p></div>` : ''}
          <div class="field">${'Traiectorie'} <span class="hint">${sc.path.length ? sc.path.length + ' puncte · ' + M.pathLength(sc).toFixed(1) + ' m' : 'personajul stă pe loc'}</span>
            <div class="btns">
              <button class="btn${st.pathMode ? ' on' : ''}" id="cPath">${st.pathMode ? '✓ Gata' : '✎ Desenează traiectoria'}</button>
              <button class="btn" id="cPop"${sc.path.length ? '' : ' disabled'}>↶ Anulează ultimul punct</button>
              <button class="btn" id="cClear"${sc.path.length ? '' : ' disabled'}>Șterge traiectoria</button>
            </div>
          </div>
          <div class="field">&nbsp;<div class="btns"><button class="btn danger" id="cDel">Șterge personajul</button></div></div>
        </div>`;
      }
      const root = el(`<div class="cols"><div><p class="subhead">Personaje</p><div class="list">${list}</div>
        <div class="btns" style="margin-top:10px"><button class="btn primary" id="cAdd">+ Adaugă personaj</button></div></div><div>${detail}</div></div>`);
      on(root, '[data-char]', 'click', (e) => store.dispatch({ type: 'select', sel: { kind: 'char', id: e.currentTarget.dataset.char } }));
      root.querySelector('#cAdd').addEventListener('click', () => {
        const n = st.doc.characters.length;
        const pos = freeSpot(hooks.planCenter());
        const c = M.makeCharacter({ x: pos.x, z: pos.z }, n);
        store.dispatch({ type: 'char/add', char: c });
        store.dispatch({ type: 'select', sel: { kind: 'char', id: c.id } });
      });
      if (sc) {
        const id = sc.id;
        root.querySelector('#cName').addEventListener('input', (e) => store.dispatch({ type: 'char/update', id, patch: { name: e.target.value || 'Personaj' } }));
        on(root, '[data-ccolor]', 'click', (e) => { store.dispatch({ type: 'char/update', id, patch: { color: e.currentTarget.dataset.ccolor } }); renderTab(); });
        bindSlider(root, 'cSpeed', (v) => v.toFixed(1) + ' m/s', (v) => store.dispatch({ type: 'char/update', id, patch: { speed: v } }));
        bindSlider(root, 'cDelay', (v) => v.toFixed(1) + ' s', (v) => store.dispatch({ type: 'char/update', id, patch: { delay: v } }));
        bindSlider(root, 'cHeight', (v) => v.toFixed(2) + ' m', (v) => store.dispatch({ type: 'char/update', id, patch: { height: v } }));
        on(root, '[data-pose]', 'click', (e) => { store.dispatch({ type: 'char/update', id, patch: { pose: e.currentTarget.dataset.pose } }); renderTab(); });
        bindSlider(root, 'cYaw', fmtDeg, (v) => store.dispatch({ type: 'char/update', id, patch: { yaw: v } }));
        if (root.querySelector('#cEndYaw')) {
          bindSlider(root, 'cEndYaw', fmtDeg, (v) => store.dispatch({ type: 'char/update', id, patch: { endYaw: v } }));
          root.querySelector('#cEndYawOn').addEventListener('click', () => {
            const c = selectedChar();
            store.dispatch({ type: 'char/update', id, patch: { endYaw: c.endYaw == null ? M.wrapDeg(M.charPose(c, 1e6).yaw) : null } });
            renderTab();
          });
        }
        root.querySelector('#cPath').addEventListener('click', () => {
          const onNow = !st.pathMode;
          store.dispatch({ type: 'ui/set', patch: { pathMode: onNow } });
          if (onNow) { engine.rewind(); toast('Atinge podeaua în imaginea de sus: fiecare atingere adaugă un punct.'); }
        });
        root.querySelector('#cPop').addEventListener('click', () => store.dispatch({ type: 'path/pop', id }));
        root.querySelector('#cClear').addEventListener('click', () => store.dispatch({ type: 'path/clear', id }));
        root.querySelector('#cDel').addEventListener('click', () => store.dispatch({ type: 'char/remove', id }));
      }
      return root;
    }

    /* ---------- tab: decor ---------- */
    function renderSet() {
      const sp = selectedProp();
      const add = Object.keys(T.props).map((k) => `<button class="btn" data-addprop="${k}">+ ${esc(T.props[k])}</button>`).join('');
      let detail = `<p class="empty">Adaugă obiecte și trage-le în imaginea de sus. Atinge un obiect ca să-l modifici; trage mânerul alb ca să-l rotești.</p>
        <p class="hint" style="margin-top:8px"><b>Obiect (orice)</b> ține locul oricărui lucru: o ceașcă, o carte, un telefon. Îi dai un nume, o formă și o mărime. Pus peste o masă, stă pe blat. Dacă ai selectată masa când îl adaugi, apare direct pe ea.</p>`;
      const fmtSize = (v) => (v < 1 ? Math.round(v * 100) + ' cm' : v.toFixed(2).replace('.', ',') + ' m');
      const sizeSlider = (label, id, v, max) => `<label class="field">${label}<div class="row"><input type="range" id="${id}" min="${Math.log(0.02)}" max="${Math.log(max)}" step="0.001" value="${Math.log(v)}"><output id="${id}Out">${fmtSize(v)}</output></div></label>`;
      if (sp) {
        const isObj = sp.type === 'obiect';
        detail = `<div class="form-grid">
          <div class="field">${esc(isObj ? sp.label || 'Obiect' : T.props[sp.type] || 'Obiect')}<div class="btns">
            <button class="btn" id="pRotL">↺ 15°</button><button class="btn" id="pRotR">↻ 15°</button>
            <button class="btn" id="pDup">Duplică</button><button class="btn danger" id="pDel">Șterge</button></div></div>
          ${isObj ? `<label class="field">Ce este<input type="text" id="pLabel" value="${esc(sp.label || '')}" maxlength="30" placeholder="ex.: ceașcă de ceai"></label>
          <div class="field">Formă<div class="seg" id="pShape">${[['cutie', 'Cutie'], ['cilindru', 'Cilindru'], ['sfera', 'Sferă']].map(([k, l]) => `<button data-shape="${k}" class="${(sp.shape || 'cutie') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
          ${sizeSlider('Lățime', 'pW', sp.w, 20)}
          ${sizeSlider('Adâncime', 'pD', sp.d, 20)}
          ${sizeSlider('Înălțime', 'pH', sp.h, 8)}
          <div class="field">Culoare${swatchesHTML(M.PROP_COLORS, sp.color, 'pcolor')}</div>
        </div>`;
      }
      const root = el(`<div class="cols"><div><p class="subhead">Adaugă în decor</p><div class="list">${add}</div>
          <label class="field" style="margin-top:12px">Fundal<select id="backdrop">${Object.keys(T.backdrops).map((k) => `<option value="${k}"${st.doc.set.backdrop === k ? ' selected' : ''}>${esc(T.backdrops[k])}</option>`).join('')}</select></label>
        </div><div>${detail}</div></div>`);
      on(root, '[data-addprop]', 'click', (e) => {
        const type = e.currentTarget.dataset.addprop;
        const under = selectedProp();
        // un obiect adăugat cât timp e selectată o masă (sau alt obiect) apare pe ea
        const onTop = type === 'obiect' && under;
        const pos = onTop ? { x: under.x, z: under.z } : freeSpot(hooks.planCenter());
        const p = M.makeProp(type, onTop ? { x: pos.x, z: pos.z, w: 0.12, d: 0.12, h: 0.12 } : { x: pos.x, z: pos.z });
        store.dispatch({ type: 'prop/add', prop: p });
        store.dispatch({ type: 'select', sel: { kind: 'prop', id: p.id } });
      });
      root.querySelector('#backdrop').addEventListener('change', (e) => store.dispatch({ type: 'set/update', patch: { backdrop: e.target.value } }));
      if (sp) {
        const id = sp.id;
        root.querySelector('#pRotL').addEventListener('click', () => store.dispatch({ type: 'prop/update', id, patch: { yaw: M.wrapDeg(selectedProp().yaw - 15) } }));
        root.querySelector('#pRotR').addEventListener('click', () => store.dispatch({ type: 'prop/update', id, patch: { yaw: M.wrapDeg(selectedProp().yaw + 15) } }));
        root.querySelector('#pDup').addEventListener('click', () => {
          const p = Object.assign(M.clone(selectedProp()), { id: M.uid('p') });
          p.x += 0.8; p.z += 0.8;
          store.dispatch({ type: 'prop/add', prop: p });
          store.dispatch({ type: 'select', sel: { kind: 'prop', id: p.id } });
        });
        root.querySelector('#pDel').addEventListener('click', () => store.dispatch({ type: 'prop/remove', id }));
        const r2 = (v) => Math.round(Math.exp(v) * 100) / 100;
        bindSlider(root, 'pW', (v) => fmtSize(r2(v)), (v) => store.dispatch({ type: 'prop/update', id, patch: { w: r2(v) } }));
        bindSlider(root, 'pD', (v) => fmtSize(r2(v)), (v) => store.dispatch({ type: 'prop/update', id, patch: { d: r2(v) } }));
        bindSlider(root, 'pH', (v) => fmtSize(r2(v)), (v) => store.dispatch({ type: 'prop/update', id, patch: { h: r2(v) } }));
        if (root.querySelector('#pLabel')) {
          root.querySelector('#pLabel').addEventListener('input', (e) => store.dispatch({ type: 'prop/update', id, patch: { label: e.target.value } }));
          on(root, '[data-shape]', 'click', (e) => { store.dispatch({ type: 'prop/update', id, patch: { shape: e.currentTarget.dataset.shape } }); renderTab(); });
        }
        on(root, '[data-pcolor]', 'click', (e) => { store.dispatch({ type: 'prop/update', id, patch: { color: e.currentTarget.dataset.pcolor } }); renderTab(); });
      }
      return root;
    }

    /* ---------- tab: cadre ---------- */
    const fmtSec = (v) => v.toFixed(1).replace('.', ',') + ' s';
    function addShotAfter(src, dup) {
      const i = st.shotIndex;
      const ns = dup
        ? M.makeShot(Object.assign(M.clone(src), { id: M.uid('k') }))
        : M.makeShot({ camera: M.pickCam(st.live.camera), duration: src.duration, continues: true });
      if (dup) ns.continues = true; // copia continuă acțiunea; pentru același moment din alt unghi se dezactivează „Continuă acțiunea”
      store.dispatch({ type: 'shot/add', shot: ns, index: i + 1 });
      store.dispatch({ type: 'shot/select', id: ns.id });
      toast(dup ? 'Cadrul ' + (i + 2) + ' este o copie a cadrului ' + (i + 1) + '.'
        : 'Cadrul ' + (i + 2) + ' continuă acțiunea. Mută aparatul pentru noul unghi.');
    }
    function renderShots() {
      const k = st.shot, i = st.shotIndex, n = st.doc.shots.length;
      const maxStart = Math.max(30, Math.ceil(M.suggestedDuration(st.doc)) + 10);
      const list = st.doc.shots.map((s, j) => `<button class="btn shot-btn${s.id === k.id ? ' on' : ''}" data-shot="${s.id}"><b>${j + 1}</b><span>${fmtShort(s.start)}–${fmtShort(s.start + s.duration)}</span></button>`).join('');
      const root = el(`<div class="cols"><div>
          <p class="subhead">Cadre · ${n}</p><div class="list shot-list">${list}</div>
          <div class="btns" style="margin-top:10px">
            <button class="btn primary" id="kAdd">+ Cadru nou</button>
            <button class="btn" id="kDup">Duplică</button>
            <button class="btn" id="kLeft"${i === 0 ? ' disabled' : ''} aria-label="Mută mai devreme">◀</button>
            <button class="btn" id="kRight"${i === n - 1 ? ' disabled' : ''} aria-label="Mută mai târziu">▶</button>
            <button class="btn danger" id="kDel"${n < 2 ? ' disabled' : ''}>Șterge</button>
          </div>
          <div class="btns" style="margin-top:8px">
            <button class="btn" id="kPlayAll">▶ Redă toate cadrele</button>
            <button class="btn" id="kBoard">Storyboard</button>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><span>Cadrul ${i + 1}: încadrarea se păstrează automat</span><p class="hint">Ce vezi în imaginea camerei este cadrul. Pentru o mișcare de aparat în cadru, folosește ● Înregistrează mișcarea sau keyframe-uri.</p></div>
          ${i > 0 ? `<div class="field">Racord<div class="btns"><button class="btn${k.continues !== false ? ' on' : ''}" id="kCont">${k.continues !== false ? '✓ Continuă acțiunea din cadrul ' + i : 'Continuă acțiunea din cadrul ' + i}</button></div>
            <p class="hint">${k.continues !== false ? 'Începe exact unde se termină cadrul anterior.' : 'Începe la momentul ales mai jos (de exemplu, același moment din alt unghi).'}</p></div>` : ''}
          ${slider('Începe la (momentul din acțiune)', 'kStart', 0, maxStart, 0.5, k.start, fmtSec)}
          ${slider('Durata cadrului', 'kDur', 1, 60, 0.5, k.duration, fmtSec)}
          <div class="field">&nbsp;<div class="btns"><button class="btn" id="kFit">Până la finalul acțiunii</button></div></div>
          <label class="field">Acțiune / dialog<textarea id="kNotes" placeholder="ex.: Ana intră și se oprește lângă masă. ANA: «Ai întârziat.»">${esc(k.notes)}</textarea></label>
        </div></div>`);
      on(root, '[data-shot]', 'click', (e) => { if (st.playAll) engine.pause(); store.dispatch({ type: 'shot/select', id: e.currentTarget.dataset.shot }); });
      root.querySelector('#kAdd').addEventListener('click', () => addShotAfter(k, false));
      root.querySelector('#kDup').addEventListener('click', () => addShotAfter(k, true));
      root.querySelector('#kLeft').addEventListener('click', () => store.dispatch({ type: 'shot/move', id: k.id, dir: -1 }));
      root.querySelector('#kRight').addEventListener('click', () => store.dispatch({ type: 'shot/move', id: k.id, dir: 1 }));
      root.querySelector('#kDel').addEventListener('click', async () => {
        if (await ask('Ștergi cadrul ' + (i + 1) + '?', 'Șterge')) store.dispatch({ type: 'shot/remove', id: k.id });
      });
      root.querySelector('#kPlayAll').addEventListener('click', () => engine.playAll());
      root.querySelector('#kBoard').addEventListener('click', openBoard);
      bindSlider(root, 'kStart', fmtSec, (v) => store.dispatch({ type: 'shot/update', id: k.id, patch: { start: v } }));
      if (i > 0 && k.continues !== false) root.querySelector('#kStart').disabled = true;
      // la eliberarea glisorului, lista de cadre își actualizează intervalele (cadrele următoare s-au mutat)
      ['kStart', 'kDur'].forEach((id) => root.querySelector('#' + id).addEventListener('change', () => setTimeout(renderTab, 0)));
      if (root.querySelector('#kCont')) root.querySelector('#kCont').addEventListener('click', () => {
        store.dispatch({ type: 'shot/update', id: k.id, patch: { continues: k.continues === false } });
        renderTab();
      });
      bindSlider(root, 'kDur', fmtSec, (v) => store.dispatch({ type: 'shot/update', id: k.id, patch: { duration: v } }));
      root.querySelector('#kFit').addEventListener('click', () => {
        const d = Math.max(1, Math.ceil((M.suggestedDuration(st.doc) - k.start + 1) * 2) / 2);
        store.dispatch({ type: 'shot/update', id: k.id, patch: { duration: d } }); renderTab();
        toast('Durata cadrului: ' + fmtSec(d));
      });
      root.querySelector('#kNotes').addEventListener('input', (e) => store.dispatch({ type: 'shot/update', id: k.id, patch: { notes: e.target.value } }));
      return root;
    }

    /* ---------- storyboard ---------- */
    const dist = (cam, id, t) => {
      const c = st.doc.characters.find((x) => x.id === id);
      if (!c) return null;
      const p = M.charPose(c, t);
      return Math.hypot(p.x - cam.x, p.z - cam.z);
    };
    const fmtM = (d) => (d == null ? '–' : d.toFixed(1).replace('.', ',') + ' m');
    const camDiff = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 0.05 || Math.abs(M.wrapDeg(a.yaw - b.yaw)) > 1 || Math.abs(a.tilt - b.tilt) > 1 || Math.abs(a.focal - b.focal) > 0.5 || Math.abs(a.roll - b.roll) > 1;
    function shotMoves(k) {
      if (!k.track.keys.length) return 'Cadru fix';
      const labels = [];
      k.track.log.slice().sort((a, b) => a.t0 - b.t0).forEach((g) => { if (!labels.includes(g.label)) labels.push(g.label); });
      const segs = k.track.log;
      const combined = segs.some((a) => segs.some((b) => a !== b && a.label !== b.label && a.t0 < b.t1 - 0.1 && b.t0 < a.t1 - 0.1));
      const txt = labels.length ? labels.join(', ') : 'Mișcare prin keyframe-uri';
      return combined ? T.combined + ': ' + txt : txt;
    }
    function boardPanel(k, i) {
      const t0 = k.start, t1 = k.start + k.duration;
      const c0 = M.camAt(k.track, 0) || k.camera;
      const c1 = k.track.keys.length ? M.camAt(k.track, k.duration) : c0;
      const charsMove = st.doc.characters.some((c) => { const a = M.charPose(c, t0), b = M.charPose(c, t1); return Math.hypot(a.x - b.x, a.z - b.z) > 0.2; });
      const showEnd = camDiff(c0, c1) || charsMove;
      const a = SIM.view3d.renderStill(c0, t0);
      const b = showEnd ? SIM.view3d.renderStill(c1, t1) : null;
      const both = (fa, fb) => (fb && fa !== fb ? esc(fa) + ' → ' + esc(fb) : esc(fa));
      const lensTxt = (c) => Math.round(c.focal) + ' mm';
      const d0 = dist(c0, a.shot.id, t0), d1 = b ? dist(c1, b.shot.id, t1) : null;
      const info = [
        ['Încadratură', both(a.shot.label, b && b.shot.label)],
        ['Mișcare', esc(shotMoves(k))],
        ['Obiectiv', both(lensTxt(c0) + ' · ' + M.lensType(c0.focal, T), b && lensTxt(c1) + ' · ' + M.lensType(c1.focal, T))],
        ['Distanță', both(fmtM(d0), b && d1 != null ? fmtM(d1) : null)],
        ['Unghi', both(a.angle, b && b.angle)],
      ];
      return `<article class="sb-panel" data-id="${k.id}">
        <header><b>Cadrul ${i + 1}</b><span>${fmtShort(t0)}–${fmtShort(t1)} · ${fmtSec(k.duration)}</span><button class="chip no-print" data-goto="${k.id}">Deschide</button></header>
        <div class="sb-imgs${b ? ' two' : ''}">
          <figure><img src="${a.url}" alt="Cadrul ${i + 1}, început"><figcaption>${b ? 'Început' : ''}</figcaption></figure>
          ${b ? `<figure><img src="${b.url}" alt="Cadrul ${i + 1}, final"><figcaption>Final</figcaption></figure>` : ''}
        </div>
        <dl class="sb-info">${info.map(([l, v]) => `<div><dt>${l}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <textarea class="sb-notes" data-notes="${k.id}" placeholder="Acțiune / dialog" rows="2">${esc(k.notes)}</textarea>
        <p class="sb-notes-print">${esc(k.notes)}</p>
      </article>`;
    }
    function openBoard() {
      if (st.playing) engine.pause();
      const shots = st.doc.shots;
      const total = shots.reduce((s, k) => s + k.duration, 0);
      $('#boardTitle').textContent = st.doc.name;
      $('#boardMeta').textContent = 'Storyboard · ' + shots.length + (shots.length === 1 ? ' cadru' : ' cadre') + ' · ' + fmtSec(total);
      $('#boardGrid').innerHTML = shots.map(boardPanel).join('');
      $('#board').hidden = false;
      $('#board').scrollTop = 0;
      on($('#boardGrid'), '[data-goto]', 'click', (e) => { closeBoard(); store.dispatch({ type: 'shot/select', id: e.currentTarget.dataset.goto }); tab = 'shots'; renderTab(); });
      on($('#boardGrid'), '[data-notes]', 'input', (e) => {
        store.dispatch({ type: 'shot/update', id: e.target.dataset.notes, patch: { notes: e.target.value } });
        e.target.nextElementSibling.textContent = e.target.value;
      });
    }
    function closeBoard() { $('#board').hidden = true; if (tab === 'shots') renderTab(); }
    $('#btnBoard').addEventListener('click', openBoard);

    /* meniul de pe telefon: aceleași butoane ca în bara de sus */
    $('#btnMenu').addEventListener('click', () => {
      const items = [['btnClass', $('#btnClass').textContent], ['btnBoard', 'Storyboard'], ['btnCompare', st.compare ? '✓ Comparație' : 'Comparație'],
        ['btnSeq', 'Secvențe'], ['btnGlossary', 'Glosar'], ['btnFull', 'Ecran complet']];
      openSheet('Meniu', `<div class="menu-list">${items.map(([id, l]) => `<button class="btn" data-proxy="${id}">${esc(l)}</button>`).join('')}</div>`, (root) => {
        on(root, '[data-proxy]', 'click', (e) => { const id = e.currentTarget.dataset.proxy; closeSheet(); setTimeout(() => $('#' + id).click(), 0); });
      });
    });
    $('#bClose').addEventListener('click', closeBoard);
    $('#bPrint').addEventListener('click', () => { try { window.print(); } catch (e) { toast('Printarea nu este disponibilă aici.'); } });
    $('#bPlayAll').addEventListener('click', () => { closeBoard(); engine.playAll(); });

    /* ---------- captura cadrului ---------- */
    function captureFrame() {
      if (st.compare) { toast('Ieși din Comparație ca să salvezi imaginea cadrului.'); return; }
      const W = 1920, H = 1080, BAR = 84;
      const r = SIM.view3d.renderStill(st.live.camera, st.sceneTime, W, H, 'image/png');
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H + BAR;
      const g = cv.getContext('2d');
      g.drawImage(r.canvas, 0, 0);
      g.fillStyle = '#14161b'; g.fillRect(0, H, W, BAR);
      const d = r.shot.id ? dist(st.live.camera, r.shot.id, st.sceneTime) : null;
      const parts = [st.doc.name, 'Cadrul ' + (st.shotIndex + 1), r.shot.label, Math.round(st.live.camera.focal) + ' mm', d != null ? fmtM(d) : '', r.angle].filter(Boolean);
      g.fillStyle = '#ffffff'; g.font = '600 34px system-ui, sans-serif'; g.textBaseline = 'middle';
      g.fillText(parts.join('  ·  '), 32, H + BAR / 2);
      const url = cv.toDataURL('image/png');
      const name = 'cadrul-' + (st.shotIndex + 1) + '.png';
      openSheet('Imaginea cadrului', `<img src="${url}" alt="Imaginea cadrului" style="width:100%;border-radius:10px;display:block">
        <div class="btns" style="margin-top:12px"><button class="btn primary" id="dlShot">Descarcă imaginea</button></div>
        <p class="hint" style="margin-top:8px">Pe tabletă poți și să ții apăsat pe imagine ca s-o salvezi.</p>`, (root) => {
        root.querySelector('#dlShot').addEventListener('click', () => {
          const a = document.createElement('a'); a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
        });
      });
    }
    $('#btnShot').addEventListener('click', captureFrame);

    /* ---------- comutatorul de cadre din cronologie ---------- */
    function stepShot(dir) {
      const j = st.shotIndex + dir;
      if (j < 0 || j >= st.doc.shots.length) return;
      if (st.playAll) engine.pause();
      store.dispatch({ type: 'shot/select', id: st.doc.shots[j].id });
    }
    $('#tlPrevShot').addEventListener('click', () => stepShot(-1));
    $('#tlNextShot').addEventListener('click', () => stepShot(1));
    $('#tlShotLbl').addEventListener('click', () => { tab = 'shots'; app.classList.remove('dock-hidden'); renderTab(); hooks.resize(); });

    /* ---------- tab: secvență ---------- */
    function renderSeq() {
      const d = st.doc;
      const root = el(`<div class="form-grid">
        <label class="field">Numele secvenței<input type="text" id="sName" value="${esc(d.name)}" maxlength="60"></label>
        <label class="field">Provocare (sarcina pentru elevi)<textarea id="sChal" placeholder="ex.: Urmărește personajul cu un travling lateral, termină cu o panoramare verticală în sus.">${esc(d.challenge)}</textarea>
          <div class="btns"><button class="btn${d.showChallenge ? ' on' : ''}" id="sShowChal">${d.showChallenge ? 'Provocarea e afișată' : 'Provocarea e ascunsă'}</button></div></label>
        <div class="field">Redare<div class="btns">
          <button class="btn${d.loop ? ' on' : ''}" id="sLoop">${d.loop ? '↻ Redare în buclă' : 'Redare o singură dată'}</button></div></div>
        ${slider('Lățimea podelei', 'sW', 4, 60, 1, d.set.w, (v) => v + ' m')}
        ${slider('Adâncimea podelei', 'sD', 4, 60, 1, d.set.d, (v) => v + ' m')}
        <div class="field">Secvențe<div class="btns">
          <button class="btn primary" id="sSave">Salvează secvența</button>
          <button class="btn" id="sOpen">Secvențe salvate…</button>
          <button class="btn" id="sNew">Secvență nouă</button></div></div>
      </div>`);
      root.querySelector('#sName').addEventListener('input', (e) => store.dispatch({ type: 'doc/update', patch: { name: e.target.value || 'Secvență' } }));
      root.querySelector('#sChal').addEventListener('input', (e) => store.dispatch({ type: 'doc/update', patch: { challenge: e.target.value } }));
      root.querySelector('#sShowChal').addEventListener('click', () => { store.dispatch({ type: 'doc/update', patch: { showChallenge: !d.showChallenge } }); renderTab(); });
      root.querySelector('#sLoop').addEventListener('click', () => { store.dispatch({ type: 'doc/update', patch: { loop: !d.loop } }); renderTab(); });
      bindSlider(root, 'sW', (v) => v + ' m', (v) => store.dispatch({ type: 'set/update', patch: { w: v } }));
      bindSlider(root, 'sD', (v) => v + ' m', (v) => store.dispatch({ type: 'set/update', patch: { d: v } }));
      root.querySelector('#sSave').addEventListener('click', () => openSequences(true));
      root.querySelector('#sOpen').addEventListener('click', () => openSequences(false));
      root.querySelector('#sNew').addEventListener('click', newSequence);
      return root;
    }

    /* ---------- randarea tab-ului curent ---------- */
    function renderTab() {
      try { localStorage.setItem('sim-miscari-aparat:tab', tab); } catch (e) {}
      const body = $('#tabBody');
      const scroll = body.scrollTop;
      let node;
      switch (tab) {
        case 'moves': node = renderMoves(); break;
        case 'shots': node = renderShots(); break;
        case 'lens': node = renderLens(); break;
        case 'chars': node = renderChars(); break;
        case 'set': node = renderSet(); break;
        case 'seq': node = renderSeq(); break;
      }
      body.replaceChildren(node);
      body.classList.toggle('fit', tab === 'moves');
      body.scrollTop = scroll;
      document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    }
    on(document, '#tabs button', 'click', (e) => {
      tab = e.currentTarget.dataset.tab;
      app.classList.remove('dock-hidden');
      $('#tabBody').scrollTop = 0;
      renderTab();
      hooks.resize();
    });

    /* ---------- secvențe ---------- */
    function ask(msg, okLabel) {
      return new Promise((resolve) => {
        const box = $('#ask');
        $('#askMsg').textContent = msg;
        $('#askOk').textContent = okLabel || 'Continuă';
        box.hidden = false;
        const done = (v) => { box.hidden = true; $('#askOk').onclick = $('#askNo').onclick = null; resolve(v); };
        $('#askOk').onclick = () => done(true);
        $('#askNo').onclick = () => done(false);
      });
    }
    async function confirmLose() {
      return !st.dirty || ask('Secvența curentă are modificări nesalvate. Continui fără să le salvezi?', 'Continuă fără salvare');
    }
    async function newSequence() {
      if (!(await confirmLose())) return;
      store.dispatch({ type: 'doc/load', doc: M.newDoc() });
      closeSheet();
      toast('Secvență nouă');
    }
    function saveCurrent(name) {
      if (name) store.dispatch({ type: 'doc/update', patch: { name } });
      if (String(st.doc.id).startsWith('model-')) store.dispatch({ type: 'doc/update', patch: { id: M.uid('s') } });
      if (!st.shot.track.keys.length) store.dispatch({ type: 'doc/setStartCamera', camera: st.live.camera });
      if (SIM.presets.save(store.getDoc())) { store.markSaved(); SIM.presets.forgetLast(); toast('Secvența „' + st.doc.name + '” a fost salvată pe acest dispozitiv.'); }
      else toast('Nu am putut salva pe acest dispozitiv. Folosește „Exportă fișier”.');
      updateHeader();
    }
    function exportFile() {
      const blob = new Blob([JSON.stringify(store.getDoc(), null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      const slug = st.doc.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'secventa';
      a.href = URL.createObjectURL(blob); a.download = slug + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Fișierul „' + slug + '.json” a fost descărcat.');
    }
    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          const d = M.normalizeDoc(JSON.parse(r.result));
          if (!(await confirmLose())) return;
          store.dispatch({ type: 'doc/load', doc: d });
          closeSheet(); toast('Am încărcat „' + d.name + '”.');
        } catch (err) { toast(err.message || 'Fișier invalid.'); }
      };
      r.readAsText(f);
    });

    function seqItem(d, kind) {
      const meta = [d.shots.length + (d.shots.length === 1 ? ' cadru' : ' cadre'), d.characters.length + (d.characters.length === 1 ? ' personaj' : ' personaje'), d.challenge ? 'Provocare: ' + d.challenge : ''].filter(Boolean).join(' · ');
      return `<div class="seq-item"><div class="meta"><b>${esc(d.name)}</b><span>${esc(meta)}</span></div>
        <button class="btn primary" data-load="${kind}:${d.id}">Încarcă</button>${kind === 'mine' ? `<button class="btn danger" data-del="${d.id}" aria-label="Șterge">Șterge</button>` : ''}</div>`;
    }
    function openSequences(focusSave) {
      const mine = SIM.presets.saved(), models = SIM.presets.builtins();
      const body = `
        <div class="field" style="margin-bottom:14px">Salvează secvența curentă
          <div class="row"><input type="text" id="saveName" value="${esc(st.doc.name)}" maxlength="60" style="flex:1"><button class="btn primary" id="saveBtn">Salvează secvența</button></div>
          <p class="hint">Se salvează pe acest dispozitiv, împreună cu decorul, personajele, poziția camerei și mișcarea înregistrată.</p>
        </div>
        <div class="btns" style="margin-bottom:18px">
          <button class="btn" id="newBtn">Secvență nouă</button>
          <button class="btn" id="expBtn">Exportă fișier</button>
          <button class="btn" id="impBtn">Importă fișier</button>
        </div>
        <p class="subhead">Secvențele mele</p>
        <div class="seq-list">${mine.length ? mine.map((d) => seqItem(M.normalizeDoc(d), 'mine')).join('') : '<p class="empty">Nu ai încă secvențe salvate pe acest dispozitiv.</p>'}</div>
        <p class="subhead">Secvențe model</p>
        <div class="seq-list">${models.map((d) => seqItem(d, 'model')).join('')}</div>`;
      openSheet('Secvențe', body, (root) => {
        const nameInp = root.querySelector('#saveName');
        root.querySelector('#saveBtn').addEventListener('click', () => { saveCurrent(nameInp.value.trim()); openSequences(false); });
        root.querySelector('#newBtn').addEventListener('click', newSequence);
        root.querySelector('#expBtn').addEventListener('click', exportFile);
        root.querySelector('#impBtn').addEventListener('click', () => $('#fileInput').click());
        on(root, '[data-load]', 'click', async (e) => {
          const [kind, id] = e.currentTarget.dataset.load.split(':');
          const src = kind === 'mine' ? SIM.presets.saved() : SIM.presets.builtins();
          const d = src.find((x) => x.id === id);
          if (!d || !(await confirmLose())) return;
          store.dispatch({ type: 'doc/load', doc: d });
          closeSheet(); toast('Am încărcat „' + d.name + '”.');
        });
        on(root, '[data-del]', 'click', async (e) => {
          const d = SIM.presets.saved().find((x) => x.id === e.currentTarget.dataset.del);
          if (d && (await ask('Ștergi secvența „' + d.name + '” de pe acest dispozitiv?', 'Șterge'))) { SIM.presets.remove(d.id); openSequences(false); }
        });
        if (focusSave) setTimeout(() => nameInp.select(), 50);
      });
    }

    function openGlossary() {
      const S = T.shots;
      const body = `<dl class="gloss">${T.glossary.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>
        <p class="subhead" style="margin-top:20px">Încadraturi (de la larg la strâns)</p>
        <p class="hint" style="font-size:14px;color:#c9cfdb">${[S.ansamblu, S.general, S.intreg, S.americanSub, S.americanPeste, S.mediu, S.prim, S.primStrans, S.detaliu].map(esc).join(' → ')}</p>
        <p class="subhead" style="margin-top:16px">Unghiuri de filmare</p>
        <p class="hint" style="font-size:14px;color:#c9cfdb">${esc(T.angles.normal)} · ${esc(T.angles.plonjeu)} · ${esc(T.angles.contraplonjeu)}</p>`;
      openSheet('Glosar', body);
    }

    function openSheet(title, html, bind) {
      $('#sheet .sheet-card').classList.remove('wide');
      $('#sheetTitle').textContent = title;
      const b = $('#sheetBody');
      b.innerHTML = html;
      if (bind) bind(b);
      $('#sheet').hidden = false;
    }
    function closeSheet() { $('#sheet').hidden = true; }
    $('#sheetClose').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('pointerdown', (e) => { if (e.target.id === 'sheet') closeSheet(); });

    /* ---------- bara de sus ---------- */
    let chalSig = null;
    function updateHeader() {
      const ch = $('#challenge');
      const want = !st.compare && st.doc.challenge && st.doc.showChallenge ? st.doc.challenge : '';
      if (want !== chalSig) { chalSig = want; ch.hidden = !want; ch.innerHTML = want ? '<b>Provocare</b>' + esc(want) : ''; ch.title = want; }
      const n = $('#seqName');
      n.textContent = st.doc.name;
      n.classList.toggle('dirty', st.dirty);
    }
    $('#seqName').addEventListener('click', () => { tab = 'seq'; app.classList.remove('dock-hidden'); renderTab(); hooks.resize(); });
    $('#btnSeq').addEventListener('click', () => openSequences(false));
    $('#btnGlossary').addEventListener('click', openGlossary);
    $('#btnFull').addEventListener('click', () => {
      const d = document;
      if (!d.fullscreenElement) (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen || (() => {})).call(d.documentElement);
      else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    });
    $('#btnCompare').addEventListener('click', () => setCompare(!st.compare));
    function setCompare(onNow) {
      store.dispatch({ type: 'ui/set', patch: { compare: onNow } });
      app.classList.toggle('compare', onNow);
      $('#btnCompare').classList.toggle('on', onNow);
      $('#compareBar').hidden = !onNow;
      $('#camTitle').textContent = onNow ? T.views.compare : T.views.camera;
      if (!onNow) hooks.setCompareAnim(false);
      else if (!engine.subject().char) toast('Încadrează un personaj (sau selectează-l) ca să vezi diferența mai clar.');
      hooks.resize();
    }
    on(document, '#cmpMode button', 'click', (e) => {
      store.dispatch({ type: 'ui/set', patch: { compareMode: e.currentTarget.dataset.mode } });
      document.querySelectorAll('#cmpMode button').forEach((b) => b.classList.toggle('on', b === e.currentTarget));
    });
    $('#cmpS').addEventListener('input', (e) => { hooks.setCompareAnim(false); store.dispatch({ type: 'ui/set', patch: { compareS: parseFloat(e.target.value) } }); });
    $('#cmpAnim').addEventListener('click', () => hooks.setCompareAnim(!hooks.compareAnim()));

    $('#btnGrid').addEventListener('click', () => { store.dispatch({ type: 'ui/set', patch: { grid: !st.grid } }); $('#btnGrid').classList.toggle('on', st.grid); });
    $('#btnMaxCam').addEventListener('click', () => { app.classList.remove('max-plan'); app.classList.toggle('max-cam'); hooks.resize(); });
    $('#btnMaxPlan').addEventListener('click', () => { app.classList.remove('max-cam'); app.classList.toggle('max-plan'); hooks.resize(); });
    $('#btnFit').addEventListener('click', () => hooks.fitPlan());
    $('#btnResetShot').addEventListener('click', async () => {
      if (!st.dirty) { toast('Nu ai nimic de resetat: secvența e deja ca la început.'); return; }
      if (!(await ask('Readuci secvența la cum era când ai deschis-o (sau la ultima salvare)? Decorul, personajele, cadrele și camera revin; modificările de după se pierd.', 'Resetează'))) return;
      const keep = st.shotId, t = st.time;
      if (st.playing) engine.pause();
      store.dispatch({ type: 'doc/load', doc: M.clone(st.baseline) });
      if (st.doc.shots.some((k) => k.id === keep)) { store.dispatch({ type: 'shot/select', id: keep }); engine.seek(t); }
      store.markSaved();
      toast('Secvența a revenit la varianta inițială.');
    });
    $('#btnDock').addEventListener('click', () => {
      app.classList.toggle('dock-hidden');
      $('#btnDock').textContent = app.classList.contains('dock-hidden') ? '▴' : '▾';
      hooks.resize();
    });

    /* ---------- cronologia ---------- */
    $('#tlPlay').addEventListener('click', () => (st.playing ? engine.pause() : engine.play()));
    $('#tlRewind').addEventListener('click', () => engine.rewind());
    $('#tlRec').addEventListener('click', () => (st.recording ? engine.stopRecording() : engine.startRecording()));
    $('#tlKey').addEventListener('click', () => {
      if (st.playing) engine.pause();
      engine.addKeyframe();
      toast('Keyframe adăugat la ' + fmtT(st.time) + '. Mută timpul, schimbă poziția camerei și adaugă încă unul.');
    });
    $('#tlSpeed').addEventListener('click', () => {
      const next = { 0.5: 1, 1: 2, 2: 0.5 }[st.playSpeed] || 1;
      store.dispatch({ type: 'ui/set', patch: { playSpeed: next } });
      $('#tlSpeed').textContent = (next === 0.5 ? '½' : next) + '×';
    });
    $('#tlClear').addEventListener('click', async () => {
      if (!st.shot.track.keys.length) { toast('Nu există nicio mișcare înregistrată.'); return; }
      if (await ask('Ștergi mișcarea înregistrată a camerei?', 'Șterge')) { store.dispatch({ type: 'track/clear' }); toast('Înregistrarea a fost ștearsă.'); }
    });
    const track = $('#tlTrack');
    let scrubbing = false;
    function scrubTo(e) {
      const r = track.getBoundingClientRect();
      engine.seek(M.clamp((e.clientX - r.left) / r.width, 0, 1) * st.shot.duration);
    }
    track.addEventListener('pointerdown', (e) => {
      if (st.recording) return;
      e.preventDefault();
      track.setPointerCapture(e.pointerId);
      scrubbing = true;
      if (st.playing) engine.pause();
      // atingere pe un keyframe = îl selectează pentru ștergere (apăsare lungă)
      scrubTo(e);
    });
    track.addEventListener('pointermove', (e) => { if (scrubbing) scrubTo(e); });
    const endScrub = () => (scrubbing = false);
    track.addEventListener('pointerup', endScrub); track.addEventListener('pointercancel', endScrub);

    let trackSig = '';
    function updateTrackMarks() {
      const tr = st.shot.track, D = st.shot.duration;
      const sig = tr.keys.length + '|' + (tr.keys[0] ? tr.keys[0].t : '') + '|' + (tr.keys.length ? tr.keys[tr.keys.length - 1].t : '') + '|' + tr.log.length + '|' + D;
      if (sig === trackSig) return;
      trackSig = sig;
      // zonele cu înregistrare live
      const bars = [];
      let start = null, prev = null;
      tr.keys.forEach((k) => {
        if (k.kind === 'rec') { if (start === null || (prev !== null && k.t - prev > 0.3)) { if (start !== null) bars.push([start, prev]); start = k.t; } prev = k.t; }
        else if (start !== null) { bars.push([start, prev]); start = null; prev = null; }
      });
      if (start !== null) bars.push([start, prev]);
      $('#tlRecBars').innerHTML = bars.map(([a, b]) => `<div style="left:${(a / D) * 100}%;width:${Math.max(0.4, ((b - a) / D) * 100)}%"></div>`).join('');
      $('#tlKeys').innerHTML = tr.keys.filter((k) => k.kind === 'key').map((k) => `<div style="left:${(k.t / D) * 100}%"></div>`).join('');
      // jurnalul mișcărilor (grupate: suprapunerile = mișcare combinată)
      const segs = tr.log.slice().sort((a, b) => a.t0 - b.t0);
      const groups = [];
      segs.forEach((s) => {
        const g = groups[groups.length - 1];
        if (g && s.t0 < g.t1 - 0.1) { g.t1 = Math.max(g.t1, s.t1); if (!g.labels.includes(s.label)) g.labels.push(s.label); }
        else groups.push({ t0: s.t0, t1: s.t1, labels: [s.label] });
      });
      $('#tlLog').innerHTML = groups.map((g) => g.labels.length > 1
        ? `<span class="comb">${fmtShort(g.t0)}–${fmtShort(g.t1)} ${esc(T.combined)}: ${esc(g.labels.join(' + '))}</span>`
        : `<span>${fmtShort(g.t0)}–${fmtShort(g.t1)} ${esc(g.labels[0])}</span>`).join('');
    }

    /* ---------- HUD ---------- */
    let hudSig = '';
    function renderHUD(info) {
      const parts = [];
      const lab = engine.activeLabels();
      info.frames.forEach((f, i) => {
        const c = info.cams[i];
        const sh = info.shots[i];
        const lens = M.lensType(c.focal, T);
        let inner = '';
        if (st.grid) inner += '<div class="grid3"></div>';
        if (!st.compare) {
          inner += `<div class="tag tl">${Math.round(c.focal)} mm · ${esc(lens)}<small>${esc(T.lens.fov)}: ${Math.round(M.hFov(c.focal))}°</small></div>`;
          inner += st.recording ? `<div class="tag tr rec">REC ${fmtT(st.time)}</div>`
            : st.doc.shots.length > 1 ? `<div class="tag tr">Cadrul ${st.shotIndex + 1}<small>din ${st.doc.shots.length}</small></div>` : '';
          const roll = Math.abs(c.roll) > 0.5 ? `<small>Unghi olandez ${Math.round(Math.abs(c.roll))}°</small>` : '';
          inner += `<div class="tag br">${esc(info.angle)}${roll}</div>`;
          if (lab.length) {
            inner += lab.length > 1
              ? `<div class="move-banner">${esc(T.combined)}<small>${esc(lab.join(' + '))}</small></div>`
              : `<div class="move-banner">${esc(lab[0])}</div>`;
          }
        } else {
          const isTf = st.compareMode === 'tf';
          const base = st.live.camera;
          const title = isTf ? (i === 0 ? 'Transfocare' : 'Travling înainte') : i === 0 ? 'Travling înainte' : 'Transtrav';
          const sub = isTf
            ? (i === 0 ? 'aparatul stă pe loc · ' + Math.round(base.focal) + ' → ' + Math.round(c.focal) + ' mm' : 'obiectivul rămâne ' + Math.round(c.focal) + ' mm · aparatul înaintează ' + Math.hypot(c.x - base.x, c.z - base.z).toFixed(1).replace('.', ',') + ' m')
            : (i === 0 ? 'personajul crește în cadru' : 'personajul rămâne la fel · ' + Math.round(base.focal) + ' → ' + Math.round(c.focal) + ' mm');
          inner += `<div class="tag tl cmp ${i === 0 ? 'a' : 'b'}">${esc(title)}<small>${esc(sub)}</small></div>`;
          inner += `<div class="tag br">${Math.round(c.focal)} mm<small>${esc(lens)}</small></div>`;
        }
        inner += `<div class="tag bl shot">${esc(sh.label)}${sh.name ? `<small>${esc(sh.name)}</small>` : ''}</div>`;
        parts.push(`<div class="frame" style="left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px">${inner}</div>`);
      });
      const html = parts.join('');
      if (html !== hudSig) { $('#hud').innerHTML = html; hudSig = html; }
    }

    /* ---------- actualizări la fiecare cadru ---------- */
    function updateDynamic() {
      const D = st.shot.duration;
      $('#tlHead').style.left = (st.time / D) * 100 + '%';
      $('#tlTime').textContent = fmtT(st.time) + ' / ' + fmtShort(D);
      const n = st.doc.shots.length, i = st.shotIndex;
      const sl = $('#tlShotLbl'), slTxt = 'Cadrul ' + (i + 1) + '|' + n + '|' + (st.playAll ? 1 : 0);
      if (sl.dataset.sig !== slTxt) {
        sl.dataset.sig = slTxt;
        sl.innerHTML = 'Cadrul ' + (i + 1) + '<small>' + (st.playAll ? 'redare toate' : 'din ' + n) + '</small>';
        $('#tlPrevShot').disabled = i === 0; $('#tlNextShot').disabled = i === n - 1;
      }
      const pb = $('#tlPlay');
      const playState = st.playing ? 'pause' : 'play';
      if (pb.dataset.state !== playState) {
        pb.dataset.state = playState;
        pb.innerHTML = st.playing ? ICON_PAUSE : ICON_PLAY;
        pb.setAttribute('aria-label', st.playing ? 'Pauză' : 'Redă');
      }
      $('#tlRec').classList.toggle('on', st.recording);
      const rl = $('#tlRec .lbl'); const want = st.recording ? 'Oprește înregistrarea' : 'Înregistrează mișcarea';
      if (rl.textContent !== want) rl.textContent = want;
      updateTrackMarks();
      updateHeader();
      // carduri de mișcare active
      const active = new Set();
      engine.activeLabels().forEach((l) => T.moves.forEach((m) => { if (m.label && l.startsWith(m.label)) active.add(m.id); }));
      document.querySelectorAll('.move[data-move]').forEach((n) => n.classList.toggle('active', active.has(n.dataset.move)));
      // valori live în tab-ul Obiectiv
      if (tab === 'lens') {
        const c = st.live.camera;
        const fi = $('#focal');
        if (fi && !fi.dataset.dragging) fi.value = Math.log(c.focal);
        const fo = $('#focalOut'); if (fo) fo.textContent = Math.round(c.focal) + ' mm';
        const lr = $('#lensRead'); if (lr) lr.innerHTML = `${esc(M.lensType(c.focal, T))} <small>· ${esc(T.lens.fov)} ${Math.round(M.hFov(c.focal))}° orizontal</small>`;
        const ch = $('#camH'); if (ch && !ch.dataset.dragging) { ch.value = c.y; $('#camHOut').textContent = c.y.toFixed(2) + ' m'; }
      }
    }

    // re-randarea panoului doar când se schimbă structura (nu la fiecare mișcare)
    const RERENDER = new Set(['doc/load', 'select', 'char/add', 'char/remove', 'prop/add', 'prop/remove', 'path/add', 'path/pop', 'path/clear']);
    const SHOT_RERENDER = new Set(['shot/add', 'shot/remove', 'shot/move', 'shot/select']);
    store.subscribe((a, s, meta) => {
      if (tab === 'shots' && (SHOT_RERENDER.has(a.type) || (meta && meta.remote && a.type === 'shot/update'))) { renderTab(); return; }
      if (a.type === 'shot/select') trackSig = '';
      if (RERENDER.has(a.type) || (a.type === 'ui/set' && ('follow' in a.patch || 'aim' in a.patch || 'pathMode' in a.patch))) {
        if (tab === 'moves' && a.type === 'ui/set' && 'pathMode' in a.patch) return; // nimic de actualizat acolo
        if (a.type === 'select' && a.sel && (tab === 'lens' || tab === 'seq')) return;
        renderTab();
      }
      if (a.type === 'doc/load') { trackSig = ''; setCompare(st.compare); }
    });

    renderTab();
    updateHeader();
    return { renderHUD, updateDynamic, renderTab, toast, setCompare, openSheet, closeSheet, ask, openBoard };
  };
})();
