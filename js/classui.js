/* Interfața modului Clasă: pornirea clasei pe tablă, intrarea elevilor, trimiterea pe tablă,
   predarea controlului, trimiterea secvenței către toate tabletele. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });

  SIM.createClassUI = function (store, cls, ui) {
    const st = store.state;
    let joinTimer = null, joined = false;

    const joinUrl = (room) => location.href.split(/[?#]/)[0] + '?clasa=' + room + (/[?&]local=1\b/.test(location.search) ? '&local=1' : '');
    function qrImg(text) {
      try {
        const q = window.qrcode(0, 'M'); q.addData(text); q.make();
        return `<img class="qr" src="${q.createDataURL(8, 2)}" alt="Cod QR pentru intrarea în clasă">`;
      } catch (e) { return ''; }
    }
    const transportNote = () => cls.info.transport === 'local'
      ? '<p class="hint class-note">Mod de test: legătura funcționează deocamdată doar între ferestre deschise pe același dispozitiv. Legătura dintre tablete și tablă se activează în Etapa 3.</p>'
      : '';
    const isOpen = () => !$('#sheet').hidden && $('#sheetTitle').textContent === 'Clasă';

    function openClass(prefill) {
      const I = cls.info;
      let body = '';
      if (!I.role) {
        const code = (prefill && prefill.code) || I.savedRoom || '';
        body = `<div class="class-choose">
          <section><h3>Pe tablă</h3><p class="hint">Pornește clasa. Pe ecran apar un cod și un cod QR; elevii îl scanează cu tableta.</p>
            <button class="btn primary" id="cHost">Pornește clasa</button></section>
          <section><h3>Pe tabletă</h3>
            <label class="field">Codul clasei<input type="text" id="cCode" value="${esc(code)}" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="ex.: K7MP"></label>
            <label class="field">Numele tău<input type="text" id="cName" value="${esc(I.savedName || '')}" maxlength="24" autocomplete="off" placeholder="ex.: Ana P."></label>
            <button class="btn primary" id="cJoin">Intră în clasă</button>
            <p class="hint" id="cErr"></p></section>
        </div>${transportNote()}`;
      } else if (I.role === 'host') {
        const url = joinUrl(I.room);
        const roster = I.roster.length
          ? I.roster.map((r) => {
            const has = I.controller && I.controller.id === r.id;
            return `<li><span>${esc(r.name)}</span>${has ? '<b class="pill">controlează tabla</b><button class="btn" data-revoke>Ia înapoi</button>' : `<button class="btn" data-grant="${r.id}">Dă controlul</button>`}</li>`;
          }).join('')
          : '<li class="empty">Încă nu a intrat niciun elev.</li>';
        const inbox = I.inbox.length
          ? I.inbox.map((it) => `<li><span><b>${esc(it.name)}</b> · ${esc(it.snap.doc.name)} · ${it.snap.doc.shots.length} ${it.snap.doc.shots.length === 1 ? 'cadru' : 'cadre'}<small>${hhmm(it.at)}</small></span><button class="btn primary" data-show="${it.id}">Arată</button></li>`).join('')
          : '<li class="empty">Elevii apasă „Trimite pe tablă” pe tabletă.</li>';
        body = `<div class="class-host">
          <section class="class-join">
            <p class="subhead">Intră în clasă</p>
            ${qrImg(url)}
            <div class="room-code">${esc(I.room)}</div>
            <p class="hint">Scanează codul QR sau deschide simulatorul și scrie codul.</p>
          </section>
          <section class="class-side">
            <div class="btns"><button class="btn primary" id="cPush">Trimite secvența mea pe toate tabletele</button></div>
            <p class="subhead">Elevi · ${I.roster.length}</p><ul class="class-list">${roster}</ul>
            <p class="subhead">Primite pe tablă</p><ul class="class-list">${inbox}</ul>
            <div class="btns"><button class="btn danger" id="cClose">Închide clasa</button></div>
          </section>
        </div>${transportNote()}`;
      } else {
        const status = I.controlling ? 'Controlezi tabla: tot ce faci apare pe ecranul mare.' : joined ? 'Ești conectat.' : 'Se conectează…';
        body = `<div class="class-student">
          <p class="readout">Clasa ${esc(I.room)} · ${esc(I.name)}</p><p class="hint">${status}</p>
          <div class="btns">
            ${I.controlling ? '<button class="btn" id="cRelease">Renunță la control</button>' : '<button class="btn primary" id="cSend">Trimite pe tablă</button>'}
            <button class="btn danger" id="cLeave">Ieși din clasă</button>
          </div>
          <p class="hint">„Trimite pe tablă” trimite secvența ta, cu toate cadrele și mișcările înregistrate. Profesorul o poate afișa pe ecranul mare.</p>
        </div>${transportNote()}`;
      }
      ui.openSheet('Clasă', body, bind);
      $('#sheet .sheet-card').classList.add('wide');
    }

    function bind(root) {
      const q = (s) => root.querySelector(s);
      if (q('#cHost')) q('#cHost').addEventListener('click', async () => {
        try { await cls.host(); openClass(); } catch (e) { ui.toast('Clasa nu a putut porni aici. Deschide simulatorul din fișierul HTML sau de pe site.'); }
      });
      if (q('#cJoin')) q('#cJoin').addEventListener('click', async () => {
        const code = q('#cCode').value.trim().toUpperCase(), name = q('#cName').value.trim();
        if (code.length !== 4) { q('#cErr').textContent = 'Codul clasei are 4 caractere; îl vezi pe tablă.'; return; }
        if (!name) { q('#cErr').textContent = 'Scrie-ți numele, ca profesorul să știe cine trimite.'; return; }
        joined = false;
        try { await cls.join(code, name); } catch (e) { q('#cErr').textContent = 'Nu m-am putut conecta. Verifică internetul și încearcă din nou.'; return; }
        openClass();
        clearTimeout(joinTimer);
        joinTimer = setTimeout(() => {
          if (!joined && cls.info.role === 'student') { cls.leave(); openClass({ code }); const e = $('#cErr'); if (e) e.textContent = 'Nu am găsit clasa ' + code + '. Verifică codul de pe tablă.'; }
        }, 6000);
      });
      if (q('#cPush')) q('#cPush').addEventListener('click', () => { cls.pushToAll(); ui.toast('Secvența a fost trimisă pe toate tabletele.'); });
      root.querySelectorAll('[data-grant]').forEach((b) => b.addEventListener('click', () => { cls.grant(b.dataset.grant); ui.closeSheet(); }));
      root.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', () => cls.revoke()));
      root.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { cls.showInbox(b.dataset.show); ui.closeSheet(); }));
      if (q('#cClose')) q('#cClose').addEventListener('click', async () => {
        if (await ui.ask('Închizi clasa? Tabletele se deconectează, dar fiecare elev își păstrează lucrul.', 'Închide clasa')) { cls.leave(); ui.closeSheet(); }
      });
      if (q('#cSend')) q('#cSend').addEventListener('click', () => { cls.sendToBoard(); ui.toast('Secvența a fost trimisă pe tablă.'); });
      if (q('#cRelease')) q('#cRelease').addEventListener('click', () => cls.releaseControl());
      if (q('#cLeave')) q('#cLeave').addEventListener('click', () => { cls.leave(); ui.closeSheet(); });
    }

    /* --- bara de sus și banda de stare --- */
    function refreshBar() {
      const I = cls.info;
      const b = $('#btnClass');
      b.classList.toggle('on', !!I.role);
      b.textContent = !I.role ? 'Clasă' : I.role === 'host' ? 'Clasă ' + I.room + ' · ' + I.roster.length : 'Clasa ' + I.room;
      $('#btnSendBoard').hidden = !(I.role === 'student' && !I.controlling);
      const bn = $('#classBanner');
      let html = '';
      if (I.role === 'host' && I.controller) html = `<span><b>${esc(I.controller.name)}</b> controlează tabla</span><button class="btn" id="bnRevoke">Ia înapoi controlul</button>`;
      else if (I.role === 'host' && I.guestFrom) html = `<span>Afișezi secvența trimisă de <b>${esc(I.guestFrom)}</b></span><button class="btn" id="bnBack">Revino la secvența ta</button>`;
      else if (I.role === 'student' && I.controlling) html = `<span><b>Controlezi tabla.</b> Tot ce faci apare pe ecranul mare.</span><button class="btn" id="bnRelease">Renunță</button>`;
      bn.hidden = !html;
      bn.innerHTML = html;
      if ($('#bnRevoke')) $('#bnRevoke').addEventListener('click', () => cls.revoke());
      if ($('#bnBack')) $('#bnBack').addEventListener('click', () => cls.backToOwn());
      if ($('#bnRelease')) $('#bnRelease').addEventListener('click', () => cls.releaseControl());
    }
    $('#btnClass').addEventListener('click', () => openClass());
    $('#btnSendBoard').addEventListener('click', () => { cls.sendToBoard(); ui.toast('Secvența a fost trimisă pe tablă.'); });

    cls.on((ev) => {
      switch (ev.kind) {
        case 'joined':
          joined = true; clearTimeout(joinTimer);
          if (isOpen()) ui.closeSheet();
          ui.toast('Ai intrat în clasa ' + cls.info.room + '.');
          refreshBar();
          return;
        case 'inbox': ui.toast(ev.name + ' a trimis o secvență pe tablă.'); break;
        case 'pushed': ui.toast(ev.quiet ? 'Ai primit secvența „' + ev.name + '” de la profesor.' : 'Profesorul a trimis secvența „' + ev.name + '”.'); break;
        case 'control':
          if (cls.info.role === 'student' && isOpen()) ui.closeSheet();
          if (cls.info.role === 'student') ui.toast(ev.on ? 'Profesorul ți-a dat controlul tablei.' : 'Controlul tablei a revenit profesorului. Ți-ai recuperat secvența.');
          else if (ev.name) ui.toast(ev.name + ' controlează acum tabla.');
          break;
        case 'closed': ui.toast('Profesorul a închis clasa. Lucrul tău rămâne pe tabletă.'); break;
        case 'ui':
          if ('compare' in ev.patch) ui.setCompare(ev.patch.compare);
          if ('compareMode' in ev.patch) document.querySelectorAll('#cmpMode button').forEach((x) => x.classList.toggle('on', x.dataset.mode === ev.patch.compareMode));
          if ('compareS' in ev.patch) $('#cmpS').value = ev.patch.compareS;
          if ('grid' in ev.patch) $('#btnGrid').classList.toggle('on', !!ev.patch.grid);
          break;
      }
      refreshBar();
      if (isOpen() && ev.kind !== 'ui') openClass();
    });

    // intrare directă din codul QR: ?clasa=K7MP
    const m = location.search.match(/[?&]clasa=([A-Za-z0-9]{4})/);
    if (m) setTimeout(() => { openClass({ code: m[1].toUpperCase() }); const n = $('#cName'); if (n && !n.value) n.focus(); }, 300);
    refreshBar();
    return { openClass, refreshBar };
  };
})();
