/* Starea aplicației. Orice schimbare trece prin store.dispatch(action).
   - acțiunile cu scope 'doc' modifică secvența (se salvează; în Etapa 2 se sincronizează)
   - acțiunile cu scope 'live' modifică starea de lucru (camera curentă, timpul, selecția)
   Etapa 2 se conectează prin store.use(middleware) și store.applyRemote(action),
   fără să schimbe restul aplicației. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;

  const DOC_ACTIONS = new Set([
    'doc/load', 'doc/update', 'doc/setStartCamera',
    'set/update', 'prop/add', 'prop/update', 'prop/remove',
    'char/add', 'char/update', 'char/remove', 'char/translate',
    'path/add', 'path/move', 'path/pop', 'path/clear',
    'track/set', 'track/addKey', 'track/removeKey', 'track/clear',
    'shot/add', 'shot/update', 'shot/remove', 'shot/move',
  ]);
  // acțiuni care privesc un cadru anume: primesc automat shotId (ca să se aplice la fel pe orice dispozitiv)
  const SHOT_SCOPED = new Set(['doc/setStartCamera', 'track/set', 'track/addKey', 'track/removeKey', 'track/clear']);

  function findById(list, id) {
    return list.find((o) => o.id === id);
  }

  function reduce(s, a) {
    const d = s.doc;
    const sh = (a.shotId && findById(d.shots, a.shotId)) || s.shot;
    switch (a.type) {
      /* ----- secvența ----- */
      case 'doc/load':
        s.doc = M.normalizeDoc(a.doc);
        s.shotId = s.doc.shots[0].id;
        s.live.camera = M.camAt(s.shot.track, 0) || M.clone(s.shot.camera);
        s.time = 0; s.playing = false; s.recording = false;
        s.selected = null; s.pathMode = false; s.follow = false; s.aim = false;
        s.dirty = false;
        break;
      case 'doc/update':
        Object.assign(d, a.patch);
        break;
      case 'doc/setStartCamera':
        sh.camera = M.pickCam(a.camera);
        break;
      case 'shot/add': {
        const i = a.index == null ? d.shots.length : M.clamp(a.index, 0, d.shots.length);
        d.shots.splice(i, 0, M.makeShot(a.shot));
        break;
      }
      case 'shot/update': {
        const k = findById(d.shots, a.id);
        if (k) Object.assign(k, a.patch);
        break;
      }
      case 'shot/remove':
        if (d.shots.length > 1) {
          const i = d.shots.findIndex((k) => k.id === a.id);
          d.shots = d.shots.filter((k) => k.id !== a.id);
          if (s.shotId === a.id) { s.shotId = d.shots[Math.max(0, i - 1)].id; s.time = 0; s.playing = false; }
        }
        break;
      case 'shot/move': {
        const i = d.shots.findIndex((k) => k.id === a.id), j = i + a.dir;
        if (i >= 0 && j >= 0 && j < d.shots.length) { const t = d.shots[i]; d.shots[i] = d.shots[j]; d.shots[j] = t; }
        break;
      }
      case 'shot/select': {
        const k = findById(d.shots, a.id);
        if (k) {
          s.shotId = k.id; s.time = 0; s.playing = false; s.recording = false;
          s.follow = false; s.aim = false; // urmărirea ține de cadrul în care a fost pornită
          s.live.camera = M.camAt(k.track, 0) || M.clone(k.camera);
        }
        break;
      }
      case 'set/update':
        Object.assign(d.set, a.patch);
        break;
      case 'prop/add':
        d.set.props.push(a.prop);
        break;
      case 'prop/update': {
        const p = findById(d.set.props, a.id);
        if (p) Object.assign(p, a.patch);
        break;
      }
      case 'prop/remove':
        d.set.props = d.set.props.filter((p) => p.id !== a.id);
        if (s.selected && s.selected.id === a.id) s.selected = null;
        break;
      case 'char/add':
        d.characters.push(a.char);
        break;
      case 'char/update': {
        const c = findById(d.characters, a.id);
        if (c) Object.assign(c, a.patch);
        break;
      }
      case 'char/translate': {
        const c = findById(d.characters, a.id);
        if (c) {
          c.x += a.dx; c.z += a.dz;
          c.path.forEach((p) => { p.x += a.dx; p.z += a.dz; });
        }
        break;
      }
      case 'char/remove':
        d.characters = d.characters.filter((c) => c.id !== a.id);
        if (s.selected && s.selected.id === a.id) { s.selected = null; s.pathMode = false; s.follow = false; s.aim = false; }
        break;
      case 'path/add': {
        const c = findById(d.characters, a.id);
        if (c) c.path.push({ x: a.x, z: a.z });
        break;
      }
      case 'path/move': {
        const c = findById(d.characters, a.id);
        if (c) {
          if (a.index === 0) { c.x = a.x; c.z = a.z; } else if (c.path[a.index - 1]) { c.path[a.index - 1].x = a.x; c.path[a.index - 1].z = a.z; }
        }
        break;
      }
      case 'path/pop': {
        const c = findById(d.characters, a.id);
        if (c) c.path.pop();
        break;
      }
      case 'path/clear': {
        const c = findById(d.characters, a.id);
        if (c) c.path = [];
        break;
      }
      case 'track/set':
        sh.track = M.clone(a.track);
        sh.track.keys.sort((x, y) => x.t - y.t);
        break;
      case 'track/addKey': {
        const k = sh.track.keys.filter((x) => Math.abs(x.t - a.key.t) > 0.05);
        k.push(a.key);
        k.sort((x, y) => x.t - y.t);
        sh.track.keys = k;
        break;
      }
      case 'track/removeKey':
        sh.track.keys = sh.track.keys.filter((x) => !(x.kind === 'key' && Math.abs(x.t - a.t) < 1e-3));
        break;
      case 'track/clear':
        sh.track = { keys: [], log: [] };
        break;

      /* ----- starea de lucru ----- */
      case 'live/camera':
        Object.assign(s.live.camera, a.camera);
        break;
      case 'time/set':
        s.time = M.clamp(a.time, 0, s.shot.duration);
        break;
      case 'play/set':
        s.playing = !!a.playing;
        break;
      case 'rec/set':
        s.recording = !!a.recording;
        break;
      case 'select':
        s.selected = a.sel; // {kind:'char'|'prop', id} | null
        if (!a.sel || a.sel.kind !== 'char') { s.pathMode = false; }
        break;
      case 'ui/set':
        Object.assign(s, a.patch); // pathMode, follow, aim, compare, etc.
        break;
      default:
        console.warn('Acțiune necunoscută', a.type);
    }
  }

  SIM.createStore = function (doc) {
    const listeners = new Set();
    const middleware = [];
    const state = {
      doc: M.normalizeDoc(doc),
      shotId: null,
      // cadrul activ și timpul în acțiunea scenei (personajele se mișcă după timpul scenei)
      get shot() { return this.doc.shots.find((k) => k.id === this.shotId) || this.doc.shots[0]; },
      get shotIndex() { return Math.max(0, this.doc.shots.findIndex((k) => k.id === this.shotId)); },
      get sceneTime() { return (this.shot.start || 0) + this.time; },
      live: { camera: null },
      time: 0, playing: false, recording: false, playSpeed: 1,
      selected: null, pathMode: false, follow: false, aim: false,
      compare: false, compareMode: 'tf', compareS: 0.5,
      grid: false, dirty: false,
    };
    state.shotId = state.doc.shots[0].id;
    state.live.camera = M.camAt(state.shot.track, 0) || M.clone(state.shot.camera);

    function commit(action, meta) {
      reduce(state, action);
      if (/^shot\/(add|update|remove|move)$/.test(action.type)) M.linkShots(state.doc.shots);
      if (DOC_ACTIONS.has(action.type) && action.type !== 'doc/load') state.dirty = true;
      listeners.forEach((fn) => fn(action, state, meta || {}));
    }

    return {
      state,
      isDocAction: (a) => DOC_ACTIONS.has(a.type),
      dispatch(action) {
        if (SHOT_SCOPED.has(action.type) && !action.shotId) action = Object.assign({ shotId: state.shotId }, action);
        // middleware: (action, next) => next(action) — Etapa 2 interceptează aici
        let i = 0;
        const next = (a) => (i < middleware.length ? middleware[i++](a, next) : commit(a, { local: true }));
        next(action);
      },
      // aplică o acțiune venită de la alt dispozitiv (fără a o retrimite)
      applyRemote(action) {
        commit(action, { remote: true });
      },
      use(fn) { middleware.push(fn); },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      getDoc: () => M.clone(state.doc),
      markSaved() { state.dirty = false; },
    };
  };
})();
