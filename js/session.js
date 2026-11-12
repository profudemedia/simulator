/* Sesiuni: spații de lucru separate, păstrate online, care se deschid cu un cod (ex.: K7M-P2Q).
   O sesiune conține lucrul în curs (salvat automat) și secvențele ei salvate.
   În baza de date, sesiunea stă sub o amprentă a codului (SHA-256), deci nimeni nu poate lista codurile.
   Sesiunile neaccesate 15 zile sunt șterse de aplicație, la deschidere (cel mult o dată pe zi pe dispozitiv). */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const DAYS15 = 15 * 24 * 3600 * 1000;
  const RECENT_KEY = 'sim-miscari-aparat:sesiuni-recente';
  const CLEAN_KEY = 'sim-miscari-aparat:curatare';

  const newCode = () => Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const showCode = (c) => c.slice(0, 3) + '-' + c.slice(3);
  async function hashCode(code) {
    const data = new TextEncoder().encode('sim-sesiune:' + code);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  SIM.createSessions = function (store, ui, hooks) {
    const st = store.state;
    let cur = null; // {code, hash, name, label}
    let saved = []; // secvențele sesiunii (în memorie, sincronizate online)
    let db = null, saveTimer = null;

    const base = () => db.ref('sesiuni/' + cur.hash);
    const touch = () => {
      const now = window.firebase.database.ServerValue.TIMESTAMP;
      const up = {}; up['sesiuni/' + cur.hash + '/meta/acces'] = now; up['sesiuni_acces/' + cur.hash] = now;
      return db.ref().update(up);
    };

    async function connect() {
      const app = await SIM.firebaseApp();
      db = app.database();
      cleanup(); // în fundal
      return db;
    }

    /* ştergerea sesiunilor neaccesate de 15 zile */
    async function cleanup() {
      const last = ls.get(CLEAN_KEY, 0);
      if (Date.now() - last < 24 * 3600 * 1000) return;
      ls.set(CLEAN_KEY, Date.now());
      try {
        const snap = await db.ref('sesiuni_acces').orderByValue().endAt(Date.now() - DAYS15).limitToFirst(50).once('value');
        const up = {};
        snap.forEach((c) => { up['sesiuni/' + c.key] = null; up['sesiuni_acces/' + c.key] = null; });
        if (Object.keys(up).length) await db.ref().update(up);
      } catch (e) { /* curățarea poate aștepta până data viitoare */ }
    }

    function remember(code, name) {
      const list = ls.get(RECENT_KEY, []).filter((r) => r.code !== code);
      list.unshift({ code, name: name || '', at: Date.now() });
      ls.set(RECENT_KEY, list.slice(0, 8));
    }
    function forget(code) { ls.set(RECENT_KEY, ls.get(RECENT_KEY, []).filter((r) => r.code !== code)); }

    const backend = {
      saved: () => saved.map((d) => M.clone(d)),
      save(doc) {
        saved = saved.filter((d) => d.id !== doc.id); saved.unshift(doc);
        base().child('salvate/' + doc.id).set(JSON.stringify(doc)).catch(() => ui.toast('Nu s-a putut salva online. Verifică internetul.'));
        touch();
        return true;
      },
      remove(id) {
        saved = saved.filter((d) => d.id !== id);
        base().child('salvate/' + id).remove();
        return true;
      },
    };

    function enter(session, work, savedList) {
      cur = session;
      cur.label = showCode(cur.code);
      saved = savedList;
      SIM.presets.setBackend(backend);
      remember(cur.code, cur.name);
      store.dispatch({ type: 'doc/load', doc: work || SIM.presets.builtins()[0] });
      refreshChip();
    }

    async function create(name) {
      await connect();
      let code, hash;
      for (let i = 0; i < 5; i++) {
        code = newCode(); hash = await hashCode(code);
        const exists = await db.ref('sesiuni/' + hash + '/meta').once('value');
        if (!exists.exists()) break;
      }
      const now = window.firebase.database.ServerValue.TIMESTAMP;
      const up = {};
      up['sesiuni/' + hash + '/meta'] = { nume: String(name || '').slice(0, 60), creat: now, acces: now };
      up['sesiuni_acces/' + hash] = now;
      await db.ref().update(up);
      return { code, hash, name: name || '' };
    }

    async function open(codeIn) {
      const code = normCode(codeIn);
      if (code.length !== 6) throw new Error('Codul are 6 caractere, de exemplu K7M-P2Q.');
      await connect();
      const hash = await hashCode(code);
      const snap = await db.ref('sesiuni/' + hash).once('value');
      if (!snap.exists()) { forget(code); throw new Error('Nu am găsit sesiunea ' + showCode(code) + '. Verifică codul; sesiunile neaccesate 15 zile se șterg.'); }
      const v = snap.val();
      const parse = (j) => { try { return M.normalizeDoc(JSON.parse(j)); } catch (e) { return null; } };
      const work = v.lucru ? parse(v.lucru) : null;
      const list = Object.values(v.salvate || {}).map(parse).filter(Boolean).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
      enter({ code, hash, name: (v.meta && v.meta.nume) || '' }, work, list);
      await touch();
    }

    /* lucrul în curs se salvează automat în sesiune */
    function scheduleSave() {
      if (!cur || !db) return;
      const c = SIM.classroom && SIM.classroom.info;
      if (c && (c.guestFrom || c.controller || c.controlling)) return; // pe tablă se vede secvența altcuiva
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 2500);
    }
    function flush() {
      clearTimeout(saveTimer);
      if (!cur || !db) return;
      base().child('lucru').set(JSON.stringify(store.getDoc())).catch(() => {});
      touch().catch(() => {});
    }
    store.subscribe((a, s, meta) => { if (store.isDocAction(a) && !(meta && meta.remote)) scheduleSave(); });
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

    function leave() {
      flush();
      cur = null; saved = [];
      SIM.presets.setBackend(null);
      refreshChip();
    }

    /* ---------- cipul cu codul, din bara de sus ---------- */
    function refreshChip() {
      const chip = $('#sessionChip');
      chip.textContent = cur ? cur.label : 'Fără sesiune';
      chip.classList.toggle('off', !cur);
    }
    $('#sessionChip').addEventListener('click', () => openSessionSheet());

    function copy(text) {
      try { navigator.clipboard.writeText(text).then(() => ui.toast('Codul ' + text + ' a fost copiat.'), () => ui.toast('Notează codul: ' + text)); }
      catch (e) { ui.toast('Notează codul: ' + text); }
    }

    function openSessionSheet() {
      const body = cur
        ? `<div class="sess-sheet"><p class="hint">Sesiunea ${cur.name ? '„' + esc(cur.name) + '”' : 'curentă'}. Cu acest cod o deschizi de pe orice dispozitiv.</p>
            <div class="sess-code">${esc(cur.label)}</div>
            <div class="btns"><button class="btn primary" id="ssCopy">Copiază codul</button><button class="btn" id="ssSwitch">Schimbă sesiunea</button></div>
            <p class="hint">Lucrul se salvează automat. Sesiunea se șterge dacă nu e deschisă 15 zile.</p></div>`
        : `<div class="sess-sheet"><p class="hint">Lucrezi fără sesiune: secvențele se păstrează doar pe acest dispozitiv.</p>
            <div class="btns"><button class="btn primary" id="ssMake">Salvează ca sesiune nouă</button><button class="btn" id="ssSwitch">Schimbă sesiunea</button></div>
            <p class="hint" id="ssErr"></p></div>`;
      ui.openSheet('Sesiune', body, (root) => {
        const q = (s) => root.querySelector(s);
        if (q('#ssCopy')) q('#ssCopy').addEventListener('click', () => copy(cur.label));
        q('#ssSwitch').addEventListener('click', () => { ui.closeSheet(); leave(); showStart(); });
        if (q('#ssMake')) q('#ssMake').addEventListener('click', async () => {
          q('#ssMake').disabled = true;
          try {
            const doc = store.getDoc();
            const s = await create(doc.name);
            enter(s, doc, []);
            flush();
            ui.closeSheet();
            showCreated(s);
          } catch (e) { q('#ssErr').textContent = 'Nu m-am putut conecta. Verifică internetul și încearcă din nou.'; q('#ssMake').disabled = false; }
        });
      });
    }

    /* ---------- ecranul de start ---------- */
    const startEl = $('#start');
    function renderRecent() {
      const list = ls.get(RECENT_KEY, []);
      const box = $('#stRecent');
      box.hidden = !list.length;
      $('#stRecentList').innerHTML = list.map((r) => `<li><button class="recent-open" data-code="${r.code}"><b>${esc(showCode(r.code))}</b>${r.name ? `<span>${esc(r.name)}</span>` : ''}</button><button class="recent-x" data-forget="${r.code}" aria-label="Elimină din listă">✕</button></li>`).join('');
      box.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => doOpen(b.dataset.code)));
      box.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', () => { forget(b.dataset.forget); renderRecent(); }));
    }
    const setErr = (t) => { $('#stErr').textContent = t || ''; };
    const busy = (on) => startEl.querySelectorAll('button, input').forEach((x) => (x.disabled = on));

    async function doOpen(code) {
      setErr(''); busy(true);
      try { await open(code); hideStart(); ui.toast('Ai deschis sesiunea ' + cur.label + '.'); }
      catch (e) { setErr(e.message && /Nu am găsit|6 caractere/.test(e.message) ? e.message : 'Nu m-am putut conecta. Verifică internetul sau lucrează fără sesiune.'); renderRecent(); }
      busy(false);
    }
    function showCreated(s) {
      startEl.hidden = false;
      $('#stMain').hidden = true; $('#stDone').hidden = false;
      $('#stDoneCode').textContent = showCode(s.code);
    }
    function showStart() {
      setErr('');
      $('#stMain').hidden = false; $('#stDone').hidden = true;
      $('#stName').value = ''; $('#stCode').value = '';
      renderRecent();
      startEl.hidden = false;
    }
    function hideStart() { startEl.hidden = true; hooks.resize(); }

    $('#stNew').addEventListener('click', async () => {
      setErr(''); busy(true);
      try {
        const s = await create($('#stName').value.trim());
        enter(s, null, []);
        flush();
        showCreated(s);
      } catch (e) { setErr('Nu m-am putut conecta. Verifică internetul sau lucrează fără sesiune.'); }
      busy(false);
    });
    $('#stOpen').addEventListener('click', () => doOpen($('#stCode').value));
    $('#stCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doOpen($('#stCode').value); });
    $('#stCode').addEventListener('input', (e) => {
      const c = normCode(e.target.value);
      const shown = c.length > 3 ? showCode(c) : c;
      if (e.target.value !== shown) e.target.value = shown;
    });
    $('#stDoneCopy').addEventListener('click', () => copy($('#stDoneCode').textContent));
    $('#stEnter').addEventListener('click', hideStart);
    $('#stLocal').addEventListener('click', () => { leave(); hideStart(); if (hooks.offerResume) hooks.offerResume(); });

    return {
      showStart, hideStart, leave, flush,
      get current() { return cur; },
      _test: { create, open, hashCode, normCode },
    };
  };
})();
