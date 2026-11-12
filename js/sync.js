/* Etapa 2 — legătura dintre tablă și tablete.
   Transportul e interschimbabil:
   - LocalTransport: BroadcastChannel, între ferestre pe același dispozitiv (test și demonstrație);
   - FirebaseTransport: Firebase Realtime Database, între tablete și tablă (se activează în Etapa 3,
     completând SIM.config.firebase în js/config.js).
   Canale: 'host' (spre tablă), 'all' (spre toate tabletele), 'live' (fluxul continuu al elevului care
   controlează tabla; îl ascultă doar tabla). */
(function () {
  const SIM = (window.SIM = window.SIM || {});

  /* ---------- transport local ---------- */
  function LocalTransport() {
    let bc = null;
    return {
      kind: 'local',
      async connect(room, role, onMsg) {
        bc = new BroadcastChannel('sim-clasa-' + room);
        bc.onmessage = (e) => {
          const { ch, msg } = e.data || {};
          if (role === 'host' && (ch === 'host' || ch === 'live')) onMsg(ch, msg);
          if (role === 'student' && ch === 'all') onMsg(ch, msg);
        };
      },
      send(ch, msg) { if (bc) bc.postMessage({ ch, msg }); },
      close() { if (bc) bc.close(); bc = null; },
    };
  }

  /* ---------- transport Firebase (Etapa 3) ---------- */
  const FB_VER = '9.23.0';
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Nu s-a putut încărca ' + src));
      document.head.appendChild(s);
    });
  }
  /* Firebase pornit o singură dată, folosit de clasă și de sesiuni. */
  let fbPromise = null;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Conexiunea durează prea mult.')), ms))]);
  SIM.firebaseApp = function () {
    const cfg = SIM.config && SIM.config.firebase;
    if (!cfg || !cfg.apiKey || /[?&]local=1\b/.test(location.search)) return Promise.reject(new Error('Fără conexiune online configurată.'));
    if (!fbPromise) {
      fbPromise = withTimeout((async () => {
        await loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-auth-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-database-compat.js');
        const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(cfg);
        // cont anonim: dispozitivul intră fără cont, dar baza de date acceptă doar aplicația
        if (!app.auth().currentUser) await app.auth().signInAnonymously();
        return app;
      })(), 15000);
      fbPromise.catch(() => { fbPromise = null; });
    }
    return fbPromise;
  };

  function FirebaseTransport(config) {
    let db = null, refs = [], base = null, myRole = null;
    return {
      kind: 'firebase',
      async connect(room, role, onMsg) {
        myRole = role;
        const app = await SIM.firebaseApp();
        db = app.database();
        base = db.ref('clase/' + room);
        if (role === 'host') await base.remove(); // camera clasei pornește curată
        const listen = (ch) => {
          const r = base.child(ch);
          const q = r.orderByKey().startAt(r.push().key); // doar mesajele noi
          q.on('child_added', (snap) => onMsg(ch, snap.val()));
          refs.push(q);
        };
        if (role === 'host') {
          listen('host');
          const live = base.child('live');
          live.on('value', (snap) => { const v = snap.val(); if (v) onMsg('live', v); });
          refs.push(live);
        } else {
          listen('all');
        }
      },
      send(ch, msg) {
        if (!base) return;
        if (ch === 'live') base.child('live').set(msg);
        else base.child(ch).push(msg);
      },
      close() {
        refs.forEach((r) => r.off()); refs = [];
        // la închiderea clasei, tabla șterge datele clasei (după ce tabletele au primit anunțul)
        if (myRole === 'host' && base) { const b = base; setTimeout(() => b.remove().catch(() => {}), 2000); }
        base = null;
      },
    };
  }

  SIM.createTransport = function () {
    const cfg = SIM.config && SIM.config.firebase;
    // ?local=1 în adresă: test între ferestre pe același dispozitiv, fără internet
    if (/[?&]local=1\b/.test(location.search)) return LocalTransport();
    return cfg && cfg.apiKey ? FirebaseTransport(cfg) : LocalTransport();
  };

  /* ---------- clasa ---------- */
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const LIVE_TYPES = new Set(['live/camera', 'time/set']);
  const MIRROR_UI = ['compare', 'compareMode', 'compareS', 'grid'];
  const sess = {
    get(k) { try { return sessionStorage.getItem('sim-clasa:' + k); } catch (e) { return null; } },
    set(k, v) { try { v == null ? sessionStorage.removeItem('sim-clasa:' + k) : sessionStorage.setItem('sim-clasa:' + k, v); } catch (e) {} },
  };

  SIM.createClassroom = function (store, engine) {
    const st = store.state;
    const M = SIM.model;
    let t = null; // transport
    let role = null, room = null, myName = '';
    const myId = sess.get('id') || 'e' + Math.random().toString(36).slice(2, 9);
    sess.set('id', myId);
    const roster = new Map(); // id -> {name, last}
    const inbox = []; // trimiterile elevilor
    let controller = null; // elevul care controlează tabla (pe tablă)
    let controlling = false; // eu (elev) controlez tabla
    let ownDoc = null; // secvența proprie, păstrată cât timp e afișată altă secvență
    let guestFrom = null; // pe tablă: numele elevului a cărui secvență e afișată
    let lastPush = null;
    let pingTimer = null, liveTimer = null, pendingLive = null;
    let target = null; // pe tablă: camera țintă primită în flux, pentru mișcare lină
    const listeners = new Set();
    const emit = (ev) => listeners.forEach((fn) => fn(ev));

    /* --- oglindirea acțiunilor elevului care controlează tabla --- */
    store.use((a, next) => {
      next(a);
      if (!controlling || a.__remote) return;
      if (LIVE_TYPES.has(a.type)) { pendingLive = true; return; }
      if (a.type === 'ui/set') {
        const patch = {};
        MIRROR_UI.forEach((k) => { if (k in a.patch) patch[k] = a.patch[k]; });
        if (Object.keys(patch).length) send('host', { type: 'act', from: myId, action: { type: 'ui/set', patch } });
        return;
      }
      if (store.isDocAction(a) || ['shot/select', 'play/set', 'rec/set', 'select'].includes(a.type)) {
        send('host', { type: 'act', from: myId, action: a });
      }
    });

    function send(ch, msg) { if (t) t.send(ch, msg); }
    function flushLive() {
      if (!controlling || !pendingLive) return;
      pendingLive = false;
      send('live', { from: myId, camera: M.pickCam(st.live.camera), time: st.time, shotId: st.shotId, n: Date.now() });
    }

    function snapshot() { return { doc: store.getDoc(), shotId: st.shotId, time: st.time, camera: M.pickCam(st.live.camera) }; }
    function loadSnapshot(s) {
      store.applyRemote({ type: 'doc/load', doc: s.doc });
      if (s.shotId) store.applyRemote({ type: 'shot/select', id: s.shotId });
      if (s.time) store.applyRemote({ type: 'time/set', time: s.time });
      if (s.camera) store.applyRemote({ type: 'live/camera', camera: s.camera });
    }
    function keepOwn() { if (!ownDoc) ownDoc = snapshot(); }
    function restoreOwn() {
      if (ownDoc) { loadSnapshot(ownDoc); ownDoc = null; }
    }

    /* --- mesaje --- */
    function onMsg(ch, m) {
      if (!m) return;
      if (role === 'host') {
        if (ch === 'live') {
          if (m.from !== controller) return;
          if (m.shotId && m.shotId !== st.shotId) store.applyRemote({ type: 'shot/select', id: m.shotId });
          store.applyRemote({ type: 'time/set', time: m.time });
          target = m.camera;
          return;
        }
        if (m.from && m.from !== 'host') {
          const r = roster.get(m.from);
          if (r) r.last = Date.now();
        }
        switch (m.type) {
          case 'hello':
            roster.set(m.from, { name: m.name, last: Date.now() });
            send('all', { type: 'welcome', to: m.from, push: lastPush });
            emit({ kind: 'roster' });
            break;
          case 'ping':
            if (!roster.has(m.from)) { roster.set(m.from, { name: m.name, last: Date.now() }); emit({ kind: 'roster' }); }
            break;
          case 'bye':
            roster.delete(m.from);
            if (controller === m.from) revoke(true);
            emit({ kind: 'roster' });
            break;
          case 'send':
            inbox.unshift({ id: M.uid('t'), from: m.from, name: m.name, at: Date.now(), snap: m.snap });
            if (inbox.length > 40) inbox.pop();
            emit({ kind: 'inbox', name: m.name });
            break;
          case 'act': {
            if (m.from !== controller) return;
            const a = Object.assign({}, m.action, { __remote: true });
            store.applyRemote(a);
            if (a.type === 'ui/set') emit({ kind: 'ui', patch: a.patch });
            if (a.type === 'doc/load') emit({ kind: 'docload' });
            break;
          }
          case 'release':
            if (m.from === controller) revoke(true);
            break;
        }
        return;
      }
      // elev
      if (m.to && m.to !== myId) return;
      switch (m.type) {
        case 'welcome':
          emit({ kind: 'joined' });
          if (m.push) receivePush(m.push, true);
          break;
        case 'push':
          receivePush(m.push, false);
          break;
        case 'grant':
          keepOwn();
          loadSnapshot(m.snap);
          controlling = true;
          clearInterval(liveTimer);
          liveTimer = setInterval(flushLive, 50);
          emit({ kind: 'control', on: true });
          break;
        case 'revoke':
          if (!controlling) return;
          controlling = false;
          clearInterval(liveTimer);
          restoreOwn();
          emit({ kind: 'control', on: false });
          break;
        case 'closed':
          leave(true);
          emit({ kind: 'closed' });
          break;
      }
    }

    function receivePush(push, quiet) {
      if (controlling) return;
      if (st.dirty) { try { SIM.presets.save(Object.assign(store.getDoc(), { id: M.uid('s'), name: st.doc.name + ' (înainte de ' + new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) + ')' })); } catch (e) {} }
      store.applyRemote({ type: 'doc/load', doc: push.doc });
      emit({ kind: 'pushed', name: push.doc.name, quiet });
    }

    /* --- tabla --- */
    async function host() {
      await leave(true);
      role = 'host'; room = newCode();
      t = SIM.createTransport();
      await t.connect(room, 'host', onMsg);
      pingTimer = setInterval(() => {
        const now = Date.now(); let changed = false;
        roster.forEach((r, id) => { if (now - r.last > 30000) { roster.delete(id); changed = true; if (controller === id) revoke(true); } });
        if (changed) emit({ kind: 'roster' });
      }, 5000);
      emit({ kind: 'state' });
      return room;
    }
    function pushToAll() {
      if (role !== 'host') return;
      const doc = guestFrom && ownDoc ? ownDoc.doc : store.getDoc();
      lastPush = { doc };
      send('all', { type: 'push', push: lastPush });
    }
    function grant(id) {
      if (role !== 'host' || !roster.has(id)) return;
      if (controller) send('all', { type: 'revoke', to: controller });
      controller = id; target = null;
      st.remoteDriven = true;
      if (st.playing) engine.pause();
      send('all', { type: 'grant', to: id, snap: snapshot() });
      emit({ kind: 'control', name: roster.get(id).name });
    }
    function revoke(silent) {
      if (!controller) return;
      if (!silent) send('all', { type: 'revoke', to: controller });
      else send('all', { type: 'revoke', to: controller });
      controller = null; target = null;
      st.remoteDriven = false;
      store.applyRemote({ type: 'play/set', playing: false });
      store.applyRemote({ type: 'rec/set', recording: false });
      emit({ kind: 'control', name: null });
    }
    function showInbox(itemId) {
      const it = inbox.find((x) => x.id === itemId);
      if (!it) return;
      if (controller) revoke();
      keepOwn();
      loadSnapshot(it.snap);
      guestFrom = it.name;
      emit({ kind: 'guest' });
    }
    function backToOwn() {
      restoreOwn();
      guestFrom = null;
      emit({ kind: 'guest' });
    }

    /* --- elev --- */
    async function join(code, name) {
      await leave(true);
      role = 'student'; room = String(code || '').trim().toUpperCase(); myName = String(name || '').trim() || 'Elev';
      sess.set('room', room); sess.set('name', myName);
      t = SIM.createTransport();
      await t.connect(room, 'student', onMsg);
      send('host', { type: 'hello', from: myId, name: myName });
      pingTimer = setInterval(() => send('host', { type: 'ping', from: myId, name: myName }), 8000);
      emit({ kind: 'state' });
    }
    function sendToBoard() {
      if (role !== 'student') return;
      send('host', { type: 'send', from: myId, name: myName, snap: snapshot() });
    }
    function releaseControl() {
      if (!controlling) return;
      send('host', { type: 'release', from: myId });
    }

    async function leave(quiet) {
      if (role === 'student') send('host', { type: 'bye', from: myId });
      if (role === 'host') { if (controller) revoke(); send('all', { type: 'closed' }); }
      if (controlling) { controlling = false; restoreOwn(); }
      if (guestFrom) { restoreOwn(); guestFrom = null; }
      clearInterval(pingTimer); clearInterval(liveTimer);
      if (t) t.close();
      t = null; role = null; room = null; controller = null; target = null;
      st.remoteDriven = false;
      roster.clear(); inbox.length = 0;
      if (!quiet) { sess.set('room', null); }
      emit({ kind: 'state' });
    }
    window.addEventListener('pagehide', () => { if (role === 'student') send('host', { type: 'bye', from: myId }); });

    return {
      on(fn) { listeners.add(fn); },
      host, join, leave, pushToAll, grant, revoke, showInbox, backToOwn, sendToBoard, releaseControl,
      /* pe tablă: camera se apropie lin de ultima poziție primită */
      tick(dt) {
        if (role !== 'host' || !controller || !target) return false;
        const c = st.live.camera, k = 1 - Math.exp(-dt * 18);
        const out = {
          x: c.x + (target.x - c.x) * k, y: c.y + (target.y - c.y) * k, z: c.z + (target.z - c.z) * k,
          yaw: M.wrapDeg(c.yaw + M.wrapDeg(target.yaw - c.yaw) * k), tilt: c.tilt + (target.tilt - c.tilt) * k,
          roll: c.roll + (target.roll - c.roll) * k, focal: Math.exp(Math.log(c.focal) + (Math.log(target.focal) - Math.log(c.focal)) * k),
        };
        store.applyRemote({ type: 'live/camera', camera: out, __remote: true });
        return true;
      },
      get info() {
        return {
          role, room, name: myName, controlling, guestFrom, transport: t ? t.kind : SIM.createTransport().kind,
          controller: controller ? { id: controller, name: (roster.get(controller) || {}).name } : null,
          roster: Array.from(roster, ([id, r]) => ({ id, name: r.name })).sort((a, b) => a.name.localeCompare(b.name, 'ro')),
          inbox: inbox.slice(),
          savedRoom: sess.get('room'), savedName: sess.get('name'),
        };
      },
    };
  };
})();
