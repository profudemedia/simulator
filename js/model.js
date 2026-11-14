/* Modelul de date al unei secvențe (documentul JSON) și funcțiile pure de calcul.
   Tot ce ține de o secvență încape într-un singur obiect serializabil, ca să poată
   fi salvat, exportat și (în Etapa 2) trimis între tablete și tablă. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const FORMAT = 'sim-miscari-aparat';
  const VERSION = 1;

  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DEG = Math.PI / 180;

  const CHAR_COLORS = ['#e4572e', '#2e86de', '#17a589', '#f4c430', '#9b59b6', '#e67e22', '#ec407a', '#26c6da'];
  const PROP_COLORS = ['#c9c2b3', '#8b5a2b', '#6d4c41', '#4a6fa5', '#d4a373', '#e8e2d6', '#4f772d', '#f2cc8f', '#a23b3b', '#3d405b'];

  const PROP_DEFAULTS = {
    perete: { w: 4, d: 0.15, h: 2.6, color: '#c9c2b3' },
    masa: { w: 1.4, d: 0.8, h: 0.75, color: '#8b5a2b' },
    scaun: { w: 0.45, d: 0.45, h: 0.9, color: '#6d4c41' },
    canapea: { w: 2, d: 0.9, h: 0.85, color: '#4a6fa5' },
    cutie: { w: 0.6, d: 0.6, h: 0.6, color: '#d4a373' },
    coloana: { w: 0.5, d: 0.5, h: 3, color: '#e8e2d6' },
    copac: { w: 1.6, d: 1.6, h: 3.5, color: '#4f772d' },
    lampa: { w: 0.4, d: 0.4, h: 1.7, color: '#f2cc8f' },
    obiect: { w: 0.3, d: 0.3, h: 0.3, color: '#e07a5f', shape: 'cutie', label: 'Obiect' },
  };
  const SEAT_H = 0.45; // înălțimea șezutului pentru poziția „așezat”

  function defaultCamera() {
    return { x: 0, y: 1.6, z: 6, yaw: 0, tilt: 0, roll: 0, focal: 35 };
  }

  function makeCharacter(o, index) {
    const i = index || 0;
    return Object.assign(
      { id: uid('c'), name: 'Personaj ' + (i + 1), color: CHAR_COLORS[i % CHAR_COLORS.length],
        x: 0, z: 0, yaw: 180, endYaw: null, pose: 'stand', height: 1.75, speed: 1.2, delay: 0, path: [] },
      o || {}
    );
  }

  function makeProp(type, o) {
    return Object.assign({ id: uid('p'), type, x: 0, z: 0, yaw: 0 }, clone(PROP_DEFAULTS[type] || PROP_DEFAULTS.cutie), o || {});
  }

  function makeShot(o) {
    const s = Object.assign({ id: uid('k'), camera: defaultCamera(), track: { keys: [], log: [] }, duration: 8, start: 0, continues: true, notes: '' }, clone(o || {}));
    s.camera = Object.assign(defaultCamera(), s.camera || {});
    s.track = Object.assign({ keys: [], log: [] }, s.track || {});
    s.track.keys.sort((a, b) => a.t - b.t);
    return s;
  }

  /* Cadrele care „continuă acțiunea” încep exact unde se termină cadrul anterior.
     Se recalculează după orice schimbare a cadrelor, deci tăieturile rămân racordate. */
  function linkShots(shots) {
    for (let i = 1; i < shots.length; i++) {
      if (shots[i].continues !== false) shots[i].start = Math.round((shots[i - 1].start + shots[i - 1].duration) * 100) / 100;
    }
    return shots;
  }

  function newDoc() {
    return {
      format: FORMAT, version: VERSION, id: uid('s'),
      name: 'Secvență nouă', challenge: '', showChallenge: true, loop: false,
      set: { w: 16, d: 16, backdrop: 'pereti', props: [] },
      characters: [makeCharacter({ x: 0, z: 0 }, 0)],
      shots: [makeShot({ duration: 12 })],
    };
  }

  /* Validează și completează un document încărcat (fișier sau memorie locală). */
  function normalizeDoc(d) {
    if (!d || typeof d !== 'object' || d.format !== FORMAT) throw new Error('Fișierul nu este o secvență a simulatorului.');
    const base = newDoc();
    const out = Object.assign(base, clone(d));
    out.set = Object.assign({ w: 16, d: 16, backdrop: 'pereti', props: [] }, out.set || {});
    out.set.props = (out.set.props || []).map((p) => makeProp(p.type, p));
    out.characters = (out.characters || []).map((c, i) => makeCharacter(c, i));
    // secvențele vechi (un singur cadru) devin o secvență cu un cadru
    if (!Array.isArray(d.shots) || !d.shots.length) {
      out.shots = [makeShot({ camera: d.camera, track: d.track, duration: d.duration || 12, start: 0 })];
    } else {
      out.shots = d.shots.map((s) => makeShot(s));
      // secvențele salvate înainte de această opțiune: un cadru „continuă” dacă începea exact unde se termina cel anterior
      out.shots.forEach((k, i) => {
        if (d.shots[i].continues === undefined) {
          const p = out.shots[i - 1];
          k.continues = !p || Math.abs(k.start - (p.start + p.duration)) < 0.01;
        }
      });
    }
    delete out.camera; delete out.track; delete out.duration;
    linkShots(out.shots);
    return out;
  }

  /* ---------- Personaje în timp ---------- */
  function pathPoints(c) {
    return [{ x: c.x, z: c.z }].concat(c.path || []);
  }
  function pathLength(c) {
    const p = pathPoints(c);
    let L = 0;
    for (let i = 1; i < p.length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    return L;
  }
  const yawOf = (dx, dz) => Math.atan2(dx, -dz) / DEG;
  /* Drumul personajului pe porțiuni, cu momentul plecării și al sosirii fiecăreia.
     Un punct poate avea `go` = momentul din acțiune în care personajul pleacă spre el
     (dacă ajunge mai devreme la punctul anterior, așteaptă acolo). */
  function charLegs(c) {
    const pts = pathPoints(c), sp = Math.max(0.05, c.speed), out = [];
    let t = c.delay || 0, d = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1e-6) continue;
      const t0 = Math.max(t, b.go || 0), t1 = t0 + L / sp;
      out.push({ a, b, L, t0, t1, d0: d, dir: yawOf(b.x - a.x, b.z - a.z) });
      t = t1; d += L;
    }
    return out;
  }
  function charEndTime(c) {
    const legs = charLegs(c);
    return legs.length ? legs[legs.length - 1].t1 : c.delay || 0;
  }

  /* Poziția personajului la momentul t: {x, z, yaw, walking, seated, dist, phase}
     phase: 'start' (n-a plecat), 'walk', 'wait' (oprit între două porțiuni), 'end' (a ajuns).
     Înainte să plece privește spre c.yaw, pe drum în direcția de mers, iar după ce ajunge
     se întoarce (lin) spre c.endYaw, dacă e setat. */
  function charPose(c, t) {
    const sit = c.pose === 'sit';
    const legs = charLegs(c);
    if (!legs.length || t <= legs[0].t0) return { x: c.x, z: c.z, yaw: c.yaw, walking: false, seated: sit, phase: 'start', dist: 0 };
    for (let i = 0; i < legs.length; i++) {
      const g = legs[i];
      if (t < g.t0) { // așteaptă la capătul porțiunii anterioare
        const p = legs[i - 1];
        return { x: p.b.x, z: p.b.z, yaw: p.dir, walking: false, seated: false, phase: 'wait', dist: p.d0 + p.L };
      }
      if (t <= g.t1) {
        const k = (t - g.t0) / Math.max(1e-6, g.t1 - g.t0), walked = k * g.L;
        const from = i === 0 ? c.yaw : legs[i - 1].dir;
        return { x: g.a.x + (g.b.x - g.a.x) * k, z: g.a.z + (g.b.z - g.a.z) * k,
          yaw: lerpAngle(from, g.dir, Math.min(1, walked / 0.5)), // primul jumătate de metru: se întoarce spre direcția de mers
          walking: true, seated: false, phase: 'walk', dist: g.d0 + walked };
      }
    }
    const last = legs[legs.length - 1];
    const since = t - last.t1; // secunde de când a ajuns
    const yaw = c.endYaw == null ? last.dir : lerpAngle(last.dir, c.endYaw, Math.min(1, since / 0.6));
    return { x: last.b.x, z: last.b.z, yaw, walking: false, seated: sit, phase: 'end', dist: last.d0 + last.L };
  }
  // creștetul personajului (în picioare sau așezat)
  function charTop(c, seated) {
    return seated ? SEAT_H + c.height * (1 - 0.88 / 1.75) : c.height;
  }

  /* Obiectele așezate pe altele: o ceașcă pusă peste masă stă pe blat.
     Întoarce {id: înălțimea bazei}. Obiectele mari sunt „suprafețe” pentru cele mai mici. */
  const SURFACE = { masa: 1, cutie: 1, obiect: 1, scaun: 0.5, canapea: 0.5 };
  function propBases(props) {
    const area = (p) => p.w * p.d;
    const order = props.slice().sort((a, b) => area(b) - area(a));
    const base = {};
    const inside = (p, q) => {
      const dx = p.x - q.x, dz = p.z - q.z, an = -q.yaw * DEG;
      const lx = dx * Math.cos(an) - dz * Math.sin(an), lz = dx * Math.sin(an) + dz * Math.cos(an);
      return Math.abs(lx) <= q.w / 2 && Math.abs(lz) <= q.d / 2;
    };
    order.forEach((p, i) => {
      let b = 0;
      for (let j = 0; j < i; j++) {
        const q = order[j];
        const f = SURFACE[q.type];
        if (!f || (q.type === 'obiect' && q.shape === 'sfera')) continue;
        if (inside(p, q)) b = Math.max(b, base[q.id] + q.h * f);
      }
      base[p.id] = b;
    });
    return base;
  }

  function lerpAngle(a, b, k) {
    return a + wrapDeg(b - a) * k;
  }

  function suggestedDuration(doc) {
    let m = 0;
    doc.characters.forEach((c) => (m = Math.max(m, charEndTime(c))));
    return m;
  }

  /* ---------- Camera ---------- */
  function camForward(c) {
    // direcția în care privește aparatul (cu înclinare)
    const y = c.yaw * DEG, t = c.tilt * DEG;
    return { x: Math.sin(y) * Math.cos(t), y: Math.sin(t), z: -Math.cos(y) * Math.cos(t) };
  }
  const flatForward = (c) => ({ x: Math.sin(c.yaw * DEG), z: -Math.cos(c.yaw * DEG) });
  const flatRight = (c) => ({ x: Math.cos(c.yaw * DEG), z: Math.sin(c.yaw * DEG) });

  const hFov = (f) => (2 * Math.atan(18 / f)) / DEG; // senzor 36 mm, format 16:9
  const vFov = (f) => (2 * Math.atan(10.125 / f)) / DEG;

  function wrapDeg(a) {
    a = ((a + 180) % 360 + 360) % 360 - 180;
    return a;
  }
  function camLerp(a, b, k) {
    return {
      x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
      yaw: lerpAngle(a.yaw, b.yaw, k), tilt: a.tilt + (b.tilt - a.tilt) * k, roll: a.roll + (b.roll - a.roll) * k,
      focal: Math.exp(Math.log(a.focal) + (Math.log(b.focal) - Math.log(a.focal)) * k),
    };
  }

  /* Mișcările din jurnalul înregistrării care au loc la momentul t */
  function logLabelsAt(track, t) {
    const out = [];
    (track.log || []).forEach((g) => { if (g.t0 <= t + 1e-3 && t < g.t1 && !out.includes(g.label)) out.push(g.label); });
    return out;
  }

  /* Camera înregistrată la momentul t (null dacă nu există înregistrare) */
  function camAt(track, t) {
    const k = track.keys;
    if (!k.length) return null;
    if (t <= k[0].t) return pickCam(k[0]);
    if (t >= k[k.length - 1].t) return pickCam(k[k.length - 1]);
    let lo = 0, hi = k.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (k[m].t <= t) lo = m; else hi = m;
    }
    const a = k[lo], b = k[hi];
    const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
    // keyframe-urile manuale au tranziție lină (ease in-out); înregistrarea live e liniară
    const smooth = a.kind === 'key' && b.kind === 'key' ? u * u * (3 - 2 * u) : u;
    return camLerp(a, b, smooth);
  }
  function pickCam(o) {
    return { x: o.x, y: o.y, z: o.z, yaw: o.yaw, tilt: o.tilt, roll: o.roll, focal: o.focal };
  }

  function lensType(f, T) {
    if (f < T.lens.wideMax) return T.lens.wide;
    if (f <= T.lens.normalMax) return T.lens.normal;
    return T.lens.tele;
  }

  /* ---------- Comparație: transfocare vs. travling / transtrav ---------- */
  // subject: {x, y, z}. s: 0..1. Întoarce {left, right, info}
  function compareCams(base, subject, mode, s) {
    const dx = subject.x - base.x, dz = subject.z - base.z;
    const d0 = Math.max(0.5, Math.hypot(dx, dz));
    const ux = dx / d0, uz = dz / d0;
    const kMax = mode === 'vertigo' ? 3 : 4;
    let k = 1 + (kMax - 1) * s;
    const dMin = 0.8;
    k = Math.min(k, d0 / dMin);
    const dNew = d0 / k;
    const move = d0 - dNew;
    const dolly = Object.assign({}, base, { x: base.x + ux * move, z: base.z + uz * move });
    if (mode === 'vertigo') {
      const tt = Object.assign({}, dolly, { focal: clamp(base.focal / k, 8, 400) });
      return { left: dolly, right: tt, k };
    }
    const zoom = Object.assign({}, base, { focal: clamp(base.focal * k, 8, 400) });
    return { left: zoom, right: dolly, k };
  }

  SIM.model = {
    FORMAT, VERSION, uid, clone, clamp, DEG, CHAR_COLORS, PROP_COLORS, PROP_DEFAULTS,
    defaultCamera, makeCharacter, makeProp, makeShot, linkShots, newDoc, normalizeDoc,
    pathPoints, pathLength, charLegs, charEndTime, charPose, charTop, propBases, SEAT_H, suggestedDuration,
    camForward, flatForward, flatRight, hFov, vFov, wrapDeg, lerpAngle, camLerp, camAt, pickCam, logLabelsAt,
    lensType, compareCams,
  };
})();
