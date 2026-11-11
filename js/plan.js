/* Imaginea de sus: plan 2D editabil prin atingere (personaje, decor, cameră, traiectorii). */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;
  const DEG = M.DEG;

  SIM.createPlan = function (canvas, store, engine) {
    const st = store.state;
    const ctx = canvas.getContext('2d');
    let W = 1, H = 1, dpr = 1;
    const view = { cx: 0, cz: 0, scale: 30 }; // px pe metru
    let needsFit = true;
    let onChange = () => {};

    /* ---------- transformări ---------- */
    const toScreen = (x, z) => ({ x: W / 2 + (x - view.cx) * view.scale, y: H / 2 + (z - view.cz) * view.scale });
    const toWorld = (sx, sy) => ({ x: view.cx + (sx - W / 2) / view.scale, z: view.cz + (sy - H / 2) / view.scale });

    function fitView() {
      const s = st.doc.set;
      const c = st.live.camera;
      let minX = -s.w / 2, maxX = s.w / 2, minZ = -s.d / 2, maxZ = s.d / 2;
      minX = Math.min(minX, c.x - 1); maxX = Math.max(maxX, c.x + 1); minZ = Math.min(minZ, c.z - 1); maxZ = Math.max(maxZ, c.z + 1);
      view.cx = (minX + maxX) / 2; view.cz = (minZ + maxZ) / 2;
      view.scale = Math.min(W / (maxX - minX + 1.5), H / (maxZ - minZ + 1.5));
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      if (needsFit) { fitView(); needsFit = false; }
    }

    /* ---------- desen ---------- */
    const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

    function drawPropShape(p, sel) {
      const s = view.scale;
      ctx.save();
      const o = toScreen(p.x, p.z);
      ctx.translate(o.x, o.y); ctx.rotate(p.yaw * DEG);
      ctx.fillStyle = p.color; ctx.strokeStyle = sel ? '#ffd166' : 'rgba(0,0,0,.55)'; ctx.lineWidth = sel ? 3 : 1.2;
      const w = Math.max(3, p.w * s), d = Math.max(3, p.d * s);
      if (p.type === 'coloana' || p.type === 'copac' || p.type === 'lampa' || (p.type === 'obiect' && p.shape !== 'cutie')) {
        ctx.beginPath(); ctx.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (p.type === 'copac') { ctx.fillStyle = '#6b4f3a'; ctx.beginPath(); ctx.arc(0, 0, Math.max(2, 0.14 * s), 0, 7); ctx.fill(); }
      } else {
        ctx.fillRect(-w / 2, -d / 2, w, d); ctx.strokeRect(-w / 2, -d / 2, w, d);
        if (p.type === 'scaun' || p.type === 'canapea') { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-w / 2, d / 2 - d * 0.25, w, d * 0.25); }
      }
      ctx.restore();
      if (p.type === 'obiect' && p.label) {
        ctx.font = '600 11.5px system-ui, sans-serif'; ctx.textAlign = 'center';
        const y = o.y - d / 2 - 6;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(p.label, o.x, y);
        ctx.fillStyle = '#fff'; ctx.fillText(p.label, o.x, y);
      }
    }

    function drawCone(c, color, alpha, len) {
      const half = (M.hFov(c.focal) / 2) * DEG;
      const o = toScreen(c.x, c.z);
      const y = c.yaw * DEG;
      const L = len * view.scale;
      const a1 = y - half, a2 = y + half;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(o.x + Math.sin(a1) * L, o.y - Math.cos(a1) * L);
      ctx.lineTo(o.x + Math.sin(a2) * L, o.y - Math.cos(a2) * L);
      ctx.closePath();
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fill();
      ctx.globalAlpha = Math.min(1, alpha * 4); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawCameraIcon(c, color, withKnob) {
      const o = toScreen(c.x, c.z);
      const s = Math.max(14, Math.min(26, view.scale * 0.5));
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(c.yaw * DEG);
      ctx.fillStyle = color; ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-s * 0.55, -s * 0.2, s * 1.1, s * 0.9, 3) : ctx.rect(-s * 0.55, -s * 0.2, s * 1.1, s * 0.9); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2); ctx.lineTo(-s * 0.45, -s * 0.65); ctx.lineTo(s * 0.45, -s * 0.65); ctx.lineTo(s * 0.3, -s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      if (withKnob) {
        const k = knobPos(c.x, c.z, c.yaw, 1.6);
        ctx.strokeStyle = color; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(k.x, k.y); ctx.stroke(); ctx.setLineDash([]);
        knob(k, color);
      }
    }

    // distanța aparat–subiect: linie punctată spre personaj + etichetă în spatele aparatului
    function drawDistance(c, color) {
      const subj = engine.subject(c);
      if (!subj.char) return;
      const d = Math.hypot(subj.x - c.x, subj.z - c.z);
      const o = toScreen(c.x, c.z), p = toScreen(subj.x, subj.z);
      ctx.save();
      ctx.strokeStyle = color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.restore();
      const txt = d.toFixed(1).replace('.', ',') + ' m';
      const back = Math.max(30, view.scale * 0.5 + 18);
      const y = c.yaw * DEG;
      const lx = o.x - Math.sin(y) * back, ly = o.y + Math.cos(y) * back;
      ctx.font = '700 13px system-ui, sans-serif';
      const w = ctx.measureText(txt).width + 12;
      ctx.fillStyle = 'rgba(10,12,16,.85)'; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(lx - w / 2, ly - 10, w, 20, 6); else ctx.rect(lx - w / 2, ly - 10, w, 20);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(txt, lx, ly + 0.5);
      ctx.textBaseline = 'alphabetic';
    }

    function ghostCams() {
      return st.doc.shots.map((k, i) => ({ id: k.id, n: i + 1, cam: M.camAt(k.track, 0) || k.camera })).filter((g) => g.id !== st.shotId);
    }

    function knobPos(x, z, yaw, metersMin) {
      const o = toScreen(x, z);
      const L = Math.max(42, metersMin * view.scale);
      return { x: o.x + Math.sin(yaw * DEG) * L, y: o.y - Math.cos(yaw * DEG) * L };
    }
    function knob(k, color) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(k.x, k.y, 10, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(k.x, k.y, 3.5, 0, 7); ctx.fill();
    }

    function draw() {
      const accent = css('--accent') || '#ffb020';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = css('--plan-bg') || '#1d2026';
      ctx.fillRect(0, 0, W, H);
      const s = st.doc.set;

      // podea + grilă de 1 m
      const a = toScreen(-s.w / 2, -s.d / 2), b = toScreen(s.w / 2, s.d / 2);
      ctx.fillStyle = css('--plan-floor') || '#2a2e36';
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = Math.ceil(-s.w / 2); x <= s.w / 2; x++) { const p = toScreen(x, 0); ctx.moveTo(p.x, a.y); ctx.lineTo(p.x, b.y); }
      for (let z = Math.ceil(-s.d / 2); z <= s.d / 2; z++) { const p = toScreen(0, z); ctx.moveTo(a.x, p.y); ctx.lineTo(b.x, p.y); }
      ctx.stroke();
      ctx.strokeStyle = s.backdrop === 'pereti' ? '#c9c2b3' : 'rgba(255,255,255,.25)';
      ctx.lineWidth = s.backdrop === 'pereti' ? 4 : 1.5;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);

      // conul de vedere (sub obiecte)
      const live = st.live.camera;
      if (st.compare) {
        const cc = SIM.view3d && SIM.view3d.getCompare();
        if (cc) {
          const colA = st.compareMode === 'vertigo' ? '#4cc9f0' : '#4cc9f0', colB = '#80ed99';
          drawCone(cc.left, colA, 0.08, 40); drawCone(cc.right, colB, 0.08, 40);
        }
      } else {
        drawCone(live, accent, 0.1, 40);
      }

      // traseul înregistrat al camerei
      const keys = st.shot.track.keys;
      if (keys.length > 1) {
        ctx.strokeStyle = 'rgba(255,90,90,.75)'; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath();
        keys.forEach((k, i) => { const p = toScreen(k.x, k.z); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.stroke();
      }
      keys.forEach((k) => {
        if (k.kind !== 'key') return;
        const p = toScreen(k.x, k.z);
        ctx.fillStyle = '#ff5a5a'; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 4); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
      });

      // decor
      const bases = M.propBases(s.props);
      s.props.slice().sort((a, b) => bases[a.id] - bases[b.id] || b.w * b.d - a.w * a.d)
        .forEach((p) => drawPropShape(p, st.selected && st.selected.id === p.id));

      // traiectorii
      st.doc.characters.forEach((c) => {
        const sel = st.selected && st.selected.id === c.id;
        const pts = M.pathPoints(c);
        if (pts.length > 1) {
          ctx.strokeStyle = c.color; ctx.globalAlpha = sel ? 0.95 : 0.55; ctx.lineWidth = sel ? 3 : 2; ctx.setLineDash([8, 6]);
          ctx.beginPath();
          pts.forEach((p, i) => { const q = toScreen(p.x, p.z); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
          ctx.stroke(); ctx.setLineDash([]);
          // săgeată la final
          const p1 = toScreen(pts[pts.length - 2].x, pts[pts.length - 2].z), p2 = toScreen(pts[pts.length - 1].x, pts[pts.length - 1].z);
          const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          ctx.fillStyle = c.color; ctx.beginPath();
          ctx.moveTo(p2.x, p2.y); ctx.lineTo(p2.x - Math.cos(ang - 0.45) * 14, p2.y - Math.sin(ang - 0.45) * 14);
          ctx.lineTo(p2.x - Math.cos(ang + 0.45) * 14, p2.y - Math.sin(ang + 0.45) * 14); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
          if (sel) pts.forEach((p, i) => {
            const q = toScreen(p.x, p.z);
            ctx.fillStyle = i === 0 ? '#fff' : c.color; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(q.x, q.y, i === 0 ? 7 : 9, 0, 7); ctx.fill(); ctx.stroke();
          });
        }
      });

      // personaje (poziția la momentul curent)
      const r = Math.max(9, 0.28 * view.scale);
      st.doc.characters.forEach((c) => {
        const sel = st.selected && st.selected.id === c.id;
        const p = M.charPose(c, st.sceneTime);
        const o = toScreen(p.x, p.z);
        if (sel) { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(o.x, o.y, r + 6, 0, 7); ctx.stroke(); }
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(p.yaw * DEG);
        ctx.fillStyle = c.color; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(0, -r - 7); ctx.lineTo(-6, -r + 3); ctx.lineTo(6, -r + 3); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(c.name, o.x, o.y + r + 17);
        ctx.fillStyle = '#fff'; ctx.fillText(c.name, o.x, o.y + r + 17);
        if (sel && p.phase !== 'walk') knob(knobPos(p.x, p.z, p.yaw, 0.9), '#ffd166');
      });

      // mânerul de rotire al obiectului selectat
      const sp = selectedProp();
      if (sp) knob(knobPos(sp.x, sp.z, sp.yaw, Math.max(sp.w, sp.d) / 2 + 0.5), '#ffd166');

      // celelalte cadre: aparatul la începutul fiecărui cadru, numerotat (planul de filmare)
      if (!st.compare && st.doc.shots.length > 1) ghostCams().forEach((g) => {
        ctx.globalAlpha = 0.5; drawCameraIcon(g.cam, '#c9cfdb', false); ctx.globalAlpha = 1;
        const o = toScreen(g.cam.x, g.cam.z);
        ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#c9cfdb'; ctx.beginPath(); ctx.arc(o.x + 15, o.y - 15, 10, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillText(String(g.n), o.x + 15, o.y - 14.5); ctx.textBaseline = 'alphabetic';
      });

      // camera
      drawCameraIcon(live, accent, !st.compare);
      if (!st.compare && st.doc.shots.length > 1) {
        const o = toScreen(live.x, live.z);
        ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(o.x + 15, o.y - 15, 10, 0, 7); ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillText(String(st.shotIndex + 1), o.x + 15, o.y - 14.5); ctx.textBaseline = 'alphabetic';
      }
      if (st.compare) {
        const cc = SIM.view3d && SIM.view3d.getCompare();
        if (cc) {
          drawCameraIcon(cc.left, '#4cc9f0', false); drawCameraIcon(cc.right, '#80ed99', false);
          drawDistance(cc.left, '#4cc9f0'); drawDistance(cc.right, '#80ed99');
        }
      } else {
        drawDistance(live, accent);
      }

      // scară
      const m = view.scale >= 40 ? 1 : view.scale >= 15 ? 2 : 5;
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fillRect(14, H - 16, m * view.scale, 3);
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(m + ' m', 14, H - 22);

      if (st.pathMode) {
        ctx.fillStyle = 'rgba(255,209,102,.95)'; ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Atinge podeaua pentru a adăuga puncte la traiectorie', W / 2, 22);
      }
    }

    function selectedProp() {
      return st.selected && st.selected.kind === 'prop' ? st.doc.set.props.find((p) => p.id === st.selected.id) : null;
    }
    function selectedChar() {
      return st.selected && st.selected.kind === 'char' ? st.doc.characters.find((c) => c.id === st.selected.id) : null;
    }

    /* ---------- atingeri ---------- */
    const pointers = new Map();
    let drag = null; // {kind, ...}
    let pinch = null;
    const TOL = 26; // px, toleranță pentru degete

    function near(sx, sy, p, tol) { return Math.hypot(sx - p.x, sy - p.y) <= tol; }

    function hitTest(sx, sy) {
      const cam = st.live.camera;
      if (!st.compare && near(sx, sy, knobPos(cam.x, cam.z, cam.yaw, 1.6), TOL)) return { kind: 'camRot' };
      const sp = selectedProp();
      if (sp && near(sx, sy, knobPos(sp.x, sp.z, sp.yaw, Math.max(sp.w, sp.d) / 2 + 0.5), TOL)) return { kind: 'propRot', id: sp.id };
      const sc = selectedChar();
      if (sc) {
        const p = M.charPose(sc, st.sceneTime);
        if (p.phase !== 'walk' && near(sx, sy, knobPos(p.x, p.z, p.yaw, 0.9), TOL)) return { kind: 'charRot', id: sc.id, phase: p.phase, cx: p.x, cz: p.z };
        const pts = M.pathPoints(sc);
        for (let i = pts.length - 1; i >= 1; i--) if (near(sx, sy, toScreen(pts[i].x, pts[i].z), TOL)) return { kind: 'wp', id: sc.id, index: i };
      }
      if (near(sx, sy, toScreen(cam.x, cam.z), TOL + 4)) return { kind: 'cam' };
      if (!st.compare && st.doc.shots.length > 1) {
        const g = ghostCams().find((g) => near(sx, sy, toScreen(g.cam.x, g.cam.z), TOL));
        if (g) return { kind: 'ghost', id: g.id };
      }
      const r = Math.max(9, 0.28 * view.scale) + 10;
      for (let i = st.doc.characters.length - 1; i >= 0; i--) {
        const c = st.doc.characters[i];
        const p = M.charPose(c, st.sceneTime);
        if (near(sx, sy, toScreen(p.x, p.z), Math.max(r, TOL))) return { kind: 'char', id: c.id };
      }
      if (sc) { const q = toScreen(sc.x, sc.z); if (near(sx, sy, q, TOL)) return { kind: 'wp', id: sc.id, index: 0 }; }
      const w = toWorld(sx, sy);
      const bases = M.propBases(st.doc.set.props);
      const order = st.doc.set.props.slice().sort((a, b) => bases[b.id] - bases[a.id] || a.w * a.d - b.w * b.d);
      for (let i = 0; i < order.length; i++) {
        const p = order[i];
        const dx = w.x - p.x, dz = w.z - p.z, a = -p.yaw * DEG;
        const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
        const pad = 8 / view.scale;
        if (Math.abs(lx) <= p.w / 2 + pad && Math.abs(lz) <= p.d / 2 + pad) return { kind: 'prop', id: p.id };
      }
      return null;
    }

    function localXY(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    const snap = (v) => Math.round(v * 10) / 10;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      const p = localXY(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        drag = null;
        const [a, b] = Array.from(pointers.values());
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, scale: view.scale, cx: view.cx, cz: view.cz };
        return;
      }
      if (pointers.size > 2) return;
      const hit = hitTest(p.x, p.y);
      const w = toWorld(p.x, p.y);
      if (!hit) {
        drag = { kind: 'pan', start: p, cx: view.cx, cz: view.cz, moved: false };
        return;
      }
      if (hit.kind === 'ghost') { store.dispatch({ type: 'shot/select', id: hit.id }); drag = null; return; }
      if (hit.kind === 'char' || hit.kind === 'prop') {
        if (!st.selected || st.selected.id !== hit.id) store.dispatch({ type: 'select', sel: { kind: hit.kind, id: hit.id } });
      }
      drag = Object.assign({ last: w, moved: false, start: p }, hit);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      const p = localXY(e);
      pointers.set(e.pointerId, p);
      if (pinch && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        view.scale = M.clamp(pinch.scale * (d / Math.max(1, pinch.d)), 4, 200);
        view.cx = pinch.cx - (mid.x - pinch.mid.x) / view.scale - (pinch.mid.x - W / 2) * (1 / view.scale - 1 / pinch.scale);
        view.cz = pinch.cz - (mid.y - pinch.mid.y) / view.scale - (pinch.mid.y - H / 2) * (1 / view.scale - 1 / pinch.scale);
        onChange();
        return;
      }
      if (!drag) return;
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 6) return;
      drag.moved = true;
      const w = toWorld(p.x, p.y);
      switch (drag.kind) {
        case 'pan':
          view.cx = drag.cx - (p.x - drag.start.x) / view.scale;
          view.cz = drag.cz - (p.y - drag.start.y) / view.scale;
          onChange();
          break;
        case 'cam':
          store.dispatch({ type: 'live/camera', camera: { x: snap(w.x), z: snap(w.z) } });
          break;
        case 'camRot': {
          const c = st.live.camera;
          store.dispatch({ type: 'live/camera', camera: { yaw: Math.round(Math.atan2(w.x - c.x, -(w.z - c.z)) / DEG) } });
          break;
        }
        case 'char': {
          const dx = w.x - drag.last.x, dz = w.z - drag.last.z;
          store.dispatch({ type: 'char/translate', id: drag.id, dx, dz });
          drag.last = w;
          break;
        }
        case 'charRot': {
          const c = selectedChar();
          // la final (după ce a ajuns) se setează orientarea de la final, altfel cea de la început
          const deg = Math.round(Math.atan2(w.x - drag.cx, -(w.z - drag.cz)) / DEG / 15) * 15;
          if (c) store.dispatch({ type: 'char/update', id: c.id, patch: drag.phase === 'end' && c.path.length ? { endYaw: M.wrapDeg(deg) } : { yaw: M.wrapDeg(deg) } });
          break;
        }
        case 'wp':
          store.dispatch({ type: 'path/move', id: drag.id, index: drag.index, x: snap(w.x), z: snap(w.z) });
          break;
        case 'prop':
          store.dispatch({ type: 'prop/update', id: drag.id, patch: { x: snap(w.x), z: snap(w.z) } });
          break;
        case 'propRot': {
          const sp = selectedProp();
          if (sp) store.dispatch({ type: 'prop/update', id: sp.id, patch: { yaw: Math.round(Math.atan2(w.x - sp.x, -(w.z - sp.z)) / DEG / 15) * 15 } });
          break;
        }
      }
    });

    function end(e) {
      if (!pointers.has(e.pointerId)) return;
      const p = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
      if (drag && !drag.moved && e.type === 'pointerup') {
        // atingere simplă
        if (drag.kind === 'pan') {
          if (st.pathMode && selectedChar()) {
            const w = toWorld(p.x, p.y);
            store.dispatch({ type: 'path/add', id: selectedChar().id, x: snap(w.x), z: snap(w.z) });
          } else if (st.selected) {
            store.dispatch({ type: 'select', sel: null });
          }
        }
      }
      drag = null;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = localXY(e);
      const before = toWorld(p.x, p.y);
      view.scale = M.clamp(view.scale * Math.exp(-e.deltaY * 0.0015), 4, 200);
      const after = toWorld(p.x, p.y);
      view.cx += before.x - after.x; view.cz += before.z - after.z;
      onChange();
    }, { passive: false });

    return {
      resize, draw,
      fit() { fitView(); onChange(); },
      requestFit() { needsFit = true; },
      onChange(fn) { onChange = fn; },
      center() { return { x: view.cx, z: view.cz }; },
      toScreen,
    };
  };
})();
