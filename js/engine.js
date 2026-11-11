/* Motorul de mișcare: butoane ținute apăsat, redare, înregistrare, urmărire. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;
  const T = SIM.T;
  const DEG = M.DEG;

  // viteze de bază (pe secundă) la nivelul "Normal"
  const RATE = { pan: 25, tilt: 20, roll: 20, zoom: 0.55, dolly: 1.2, truck: 1.2, ped: 0.7, arc: 22, boom: 14, swing: 16, transtrav: 0.9 };
  const CRANE_PIVOT_Y = 1.2;

  // etichete pentru jurnalul mișcărilor
  const AXIS_INFO = {};
  T.moves.forEach((m) => (m.axes || []).forEach((ax) => {
    AXIS_INFO[ax.key] = { move: m, ax };
  }));

  function rot(vx, vz, deg) {
    const a = deg * DEG, c = Math.cos(a), s = Math.sin(a);
    return { x: vx * c - vz * s, z: vx * s + vz * c };
  }

  SIM.createEngine = function (store) {
    const st = store.state;
    const inputs = new Map(); // pointerId -> {key, dir}
    let speedLevel = 1;
    let followOffset = null;
    let rec = null; // {t0, buf, segs, open: Map(label->t0), last}
    let notice = () => {};

    /* ---------- subiectul (personajul de referință) ---------- */
    function poses() {
      const out = {};
      st.doc.characters.forEach((c) => (out[c.id] = M.charPose(c, st.sceneTime)));
      return out;
    }
    function selectedChar() {
      if (!st.selected || st.selected.kind !== 'char') return null;
      return st.doc.characters.find((c) => c.id === st.selected.id) || null;
    }
    function charPoint(c) {
      const p = M.charPose(c, st.sceneTime);
      return { x: p.x, y: M.charTop(c, p.seated) * 0.88, z: p.z, char: c };
    }
    // personajul selectat; altfel cel mai apropiat de centrul cadrului; altfel un punct la 5 m
    function subject(cam) {
      cam = cam || st.live.camera;
      const sel = selectedChar();
      if (sel) return charPoint(sel);
      const f = M.flatForward(cam);
      let best = null, bestA = M.hFov(cam.focal) * 0.6;
      st.doc.characters.forEach((c) => {
        const p = M.charPose(c, st.sceneTime);
        const dx = p.x - cam.x, dz = p.z - cam.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) return;
        const a = Math.acos(M.clamp((dx * f.x + dz * f.z) / d, -1, 1)) / DEG;
        if (a < bestA) { bestA = a; best = c; }
      });
      if (best) return charPoint(best);
      const fw = M.camForward(cam);
      return { x: cam.x + fw.x * 5, y: cam.y + fw.y * 5, z: cam.z + fw.z * 5, char: null };
    }

    /* ---------- aplicarea unei mișcări ---------- */
    function applyAxis(cam, key, dir, dt) {
      const k = speedLevel * dt * dir;
      switch (key) {
        case 'pan': cam.yaw = M.wrapDeg(cam.yaw + RATE.pan * k); break;
        case 'tilt': cam.tilt = M.clamp(cam.tilt + RATE.tilt * k, -85, 85); break;
        case 'roll': cam.roll = M.clamp(cam.roll + RATE.roll * k, -45, 45); break;
        case 'zoom': cam.focal = M.clamp(cam.focal * Math.exp(RATE.zoom * k), 10, 300); break;
        case 'dolly': { const f = M.flatForward(cam); cam.x += f.x * RATE.dolly * k; cam.z += f.z * RATE.dolly * k; break; }
        case 'truck': { const r = M.flatRight(cam); cam.x += r.x * RATE.truck * k; cam.z += r.z * RATE.truck * k; break; }
        case 'ped': cam.y = M.clamp(cam.y + RATE.ped * k, 0.2, 10); break;
        case 'arc': {
          const p = subject(cam);
          const th = -RATE.arc * k; // dreapta = aparatul se deplasează spre dreapta lui
          const v = rot(cam.x - p.x, cam.z - p.z, th);
          cam.x = p.x + v.x; cam.z = p.z + v.z; cam.yaw = M.wrapDeg(cam.yaw + th);
          break;
        }
        case 'boom': {
          const L = Math.max(3.5, Math.abs(cam.y - CRANE_PIVOT_Y) / 0.95);
          const f = M.flatForward(cam);
          let phi = Math.asin(M.clamp((cam.y - CRANE_PIVOT_Y) / L, -1, 1));
          const bx = cam.x - f.x * L * Math.cos(phi), bz = cam.z - f.z * L * Math.cos(phi);
          phi = M.clamp(phi + RATE.boom * DEG * k, Math.asin(Math.max(-1, (0.25 - CRANE_PIVOT_Y) / L)), 75 * DEG);
          cam.x = bx + f.x * L * Math.cos(phi); cam.z = bz + f.z * L * Math.cos(phi);
          cam.y = CRANE_PIVOT_Y + L * Math.sin(phi);
          break;
        }
        case 'swing': {
          const L = Math.max(3.5, Math.abs(cam.y - CRANE_PIVOT_Y) / 0.95);
          const f = M.flatForward(cam);
          const phi = Math.asin(M.clamp((cam.y - CRANE_PIVOT_Y) / L, -1, 1));
          const bx = cam.x - f.x * L * Math.cos(phi), bz = cam.z - f.z * L * Math.cos(phi);
          const th = RATE.swing * k; // brațul se rotește în jurul bazei
          const v = rot(cam.x - bx, cam.z - bz, th);
          cam.x = bx + v.x; cam.z = bz + v.z; cam.yaw = M.wrapDeg(cam.yaw + th);
          break;
        }
        case 'transtrav': {
          const p = subject(cam);
          const d = Math.hypot(p.x - cam.x, p.z - cam.z);
          const step = RATE.transtrav * k;
          const dNew = d - step;
          const fNew = cam.focal * dNew / Math.max(0.01, d);
          if (dNew < 0.8 || fNew < 8 || fNew > 400) { notice('Transtrav: s-a atins limita obiectivului.'); break; }
          const f = M.flatForward(cam);
          cam.x += f.x * step; cam.z += f.z * step; cam.focal = fNew;
          break;
        }
      }
    }

    function aimAt(cam, p, dt, smooth) {
      const dx = p.x - cam.x, dz = p.z - cam.z, dy = p.y - cam.y;
      const yaw = Math.atan2(dx, -dz) / DEG;
      const tilt = Math.atan2(dy, Math.hypot(dx, dz)) / DEG;
      const k = smooth ? 1 - Math.exp(-dt * 6) : 1;
      cam.yaw = M.wrapDeg(M.lerpAngle(cam.yaw, yaw, k));
      cam.tilt = cam.tilt + (tilt - cam.tilt) * k;
    }

    function trackDriven() {
      return st.shot.track.keys.length > 0 && st.playing && !st.recording;
    }

    /* ---------- jurnalul mișcărilor în timpul înregistrării ---------- */
    function currentLabels() {
      const labels = new Set();
      inputs.forEach(({ key, dir }) => {
        const info = AXIS_INFO[key];
        if (!info) return;
        const dirWord = info.ax.dirs[dir > 0 ? 1 : 0].toLowerCase();
        const extra = info.move.axes.length > 1 ? (key === 'boom' ? '' : ' lateral') : '';
        labels.add(info.move.label + extra + ' (' + dirWord + ')');
      });
      if (st.follow) labels.add(T.follow.label);
      if (st.aim) labels.add(T.aim.label);
      return labels;
    }
    function logStep() {
      if (!rec) return;
      const now = currentLabels();
      rec.open.forEach((t0, label) => {
        if (!now.has(label)) { rec.segs.push({ t0, t1: st.time, label }); rec.open.delete(label); }
      });
      now.forEach((label) => { if (!rec.open.has(label)) rec.open.set(label, st.time); });
    }

    /* ---------- API ---------- */
    const api = {
      onNotice(fn) { notice = fn; },
      setSpeed(v) { speedLevel = v; },
      getSpeed: () => speedLevel,
      subject,
      poses,
      press(key, dir, pid) {
        if (st.remoteDriven) { notice('Un elev controlează acum tabla. Ia înapoi controlul ca să miști aparatul.'); return false; }
        if (trackDriven()) {
          notice('Camera urmează înregistrarea. Oprește redarea sau apasă ● ca să înregistrezi din nou.');
          return false;
        }
        inputs.set(pid, { key, dir });
        return true;
      },
      release(pid) { inputs.delete(pid); },
      releaseAll() { inputs.clear(); },
      activeLabels() { return Array.from(currentLabels()); },
      isMoving() { return inputs.size > 0 || st.follow || st.aim; },

      toggleFollow(on) {
        const c = selectedChar();
        if (on && !c) { notice('Selectează mai întâi un personaj (atinge-l în imaginea de sus).'); return; }
        store.dispatch({ type: 'ui/set', patch: { follow: on } });
        if (on) { const p = M.charPose(c, st.sceneTime); followOffset = { x: st.live.camera.x - p.x, z: st.live.camera.z - p.z }; }
      },
      toggleAim(on) {
        if (on && !selectedChar()) { notice('Selectează mai întâi un personaj (atinge-l în imaginea de sus).'); return; }
        store.dispatch({ type: 'ui/set', patch: { aim: on } });
      },

      play() {
        if (st.time >= st.shot.duration - 0.01) store.dispatch({ type: 'time/set', time: 0 });
        store.dispatch({ type: 'play/set', playing: true });
      },
      playAll() {
        if (st.recording) api.stopRecording();
        store.dispatch({ type: 'shot/select', id: st.doc.shots[0].id });
        store.dispatch({ type: 'ui/set', patch: { playAll: true } });
        store.dispatch({ type: 'play/set', playing: true });
      },
      pause() {
        if (st.playAll) store.dispatch({ type: 'ui/set', patch: { playAll: false } });
        if (st.recording) api.stopRecording();
        store.dispatch({ type: 'play/set', playing: false });
      },
      rewind() {
        if (st.playAll) store.dispatch({ type: 'ui/set', patch: { playAll: false } });
        if (st.recording) api.stopRecording();
        store.dispatch({ type: 'play/set', playing: false });
        api.seek(0);
        if (!st.shot.track.keys.length) store.dispatch({ type: 'live/camera', camera: M.clone(st.shot.camera) });
      },
      seek(t) {
        store.dispatch({ type: 'time/set', time: t });
        const c = M.camAt(st.shot.track, st.time);
        if (c && !st.recording) store.dispatch({ type: 'live/camera', camera: c });
      },
      startRecording() {
        if (st.time >= st.shot.duration - 0.05) api.seek(0);
        rec = { t0: st.time, buf: [], segs: [], open: new Map(), last: -1 };
        store.dispatch({ type: 'rec/set', recording: true });
        store.dispatch({ type: 'play/set', playing: true });
        sample(true);
      },
      stopRecording() {
        if (!rec) return;
        sample(true);
        rec.open.forEach((t0, label) => rec.segs.push({ t0, t1: st.time, label }));
        const t0 = rec.t0, t1 = st.time;
        const old = st.shot.track;
        const keys = old.keys.filter((k) => k.t < t0 - 1e-3 || k.t > t1 + 1e-3).concat(rec.buf);
        const log = old.log.filter((g) => g.t1 < t0 || g.t0 > t1)
          .concat(rec.segs.filter((g) => g.t1 - g.t0 > 0.15))
          .sort((a, b) => a.t0 - b.t0);
        rec = null;
        store.dispatch({ type: 'rec/set', recording: false });
        store.dispatch({ type: 'play/set', playing: false });
        store.dispatch({ type: 'track/set', track: { keys, log } });
      },
      addKeyframe() {
        const c = M.pickCam(st.live.camera);
        store.dispatch({ type: 'track/addKey', key: Object.assign({ t: Math.round(st.time * 100) / 100, kind: 'key' }, c) });
      },

      /* un pas al buclei principale; întoarce true dacă ceva s-a schimbat */
      tick(dt) {
        if (st.remoteDriven) return false; // pe tablă, când un elev controlează: timpul și camera vin de la el
        let changed = false;
        if (st.playing) {
          let t = st.time + dt * (st.recording ? 1 : st.playSpeed);
          if (t >= st.shot.duration) {
            if (st.recording) { store.dispatch({ type: 'time/set', time: st.shot.duration }); api.stopRecording(); return true; }
            if (st.playAll) {
              const i = st.shotIndex, shots = st.doc.shots;
              const next = i < shots.length - 1 ? shots[i + 1] : st.doc.loop ? shots[0] : null;
              if (next) { store.dispatch({ type: 'shot/select', id: next.id }); store.dispatch({ type: 'play/set', playing: true }); return true; }
              store.dispatch({ type: 'ui/set', patch: { playAll: false } });
              store.dispatch({ type: 'time/set', time: st.shot.duration }); store.dispatch({ type: 'play/set', playing: false }); return true;
            }
            if (st.doc.loop) t = 0; else { store.dispatch({ type: 'time/set', time: st.shot.duration }); store.dispatch({ type: 'play/set', playing: false }); return true; }
          }
          store.dispatch({ type: 'time/set', time: t });
          changed = true;
        }

        if (trackDriven()) {
          const c = M.camAt(st.shot.track, st.time);
          if (c) store.dispatch({ type: 'live/camera', camera: c });
          return true;
        }

        if (!inputs.size && !st.follow && !st.aim) {
          if (rec) { sample(false); logStep(); }
          return changed;
        }

        const cam = M.clone(st.live.camera);
        const sel = selectedChar();
        if (st.follow && sel && followOffset) {
          const p = M.charPose(sel, st.sceneTime);
          cam.x = p.x + followOffset.x; cam.z = p.z + followOffset.z;
        }
        if (st.aim && sel) aimAt(cam, charPoint(sel), dt, true);
        inputs.forEach(({ key, dir }) => applyAxis(cam, key, dir, dt));
        if (st.follow && sel) { const p = M.charPose(sel, st.sceneTime); followOffset = { x: cam.x - p.x, z: cam.z - p.z }; }
        store.dispatch({ type: 'live/camera', camera: cam });
        if (rec) { sample(false); logStep(); }
        return true;
      },
    };

    function sample(force) {
      if (!rec) return;
      if (!force && st.time - rec.last < 1 / 20) return;
      rec.last = st.time;
      rec.buf = rec.buf.filter((k) => Math.abs(k.t - st.time) > 1e-4);
      rec.buf.push(Object.assign({ t: st.time, kind: 'rec' }, M.pickCam(st.live.camera)));
    }

    // dacă se schimbă personajul selectat, urmărirea se oprește
    store.subscribe((a) => {
      if (a.type === 'select' && (st.follow || st.aim)) {
        store.dispatch({ type: 'ui/set', patch: { follow: false, aim: false } });
      }
    });

    return api;
  };
})();
