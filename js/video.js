/* Exportul video al storyboard-ului: toate cadrele, unul după altul, cu informațiile de pe imagine
   (ca la „Redă toate cadrele”). Cadrele se desenează pe rând, nu în timp real, deci video-ul iese
   fluid și pe o tabletă lentă. MP4 prin WebCodecs + mp4-muxer; altfel, înregistrare în timp real. */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model, T = SIM.T;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const FPS = 25;
  const SIZES = { hd: [1280, 720], fhd: [1920, 1080] };
  const CODECS = {
    hd: ['avc1.4d401f', 'avc1.42001f', 'avc1.640028', 'avc1.4d0028'],
    fhd: ['avc1.640028', 'avc1.4d0028', 'avc1.42002a', 'avc1.640032'],
  };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms || 0));

  /* ---------- informațiile de pe imagine (aceleași ca în imaginea camerei) ---------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function tag(g, s, o) {
    // o: { x, y, ax ('l'|'r'|'c'), ay ('t'|'b'), main, sub, size, bg, fg, subFg, weight, maxW }
    const size = (o.size || 21) * s, subSize = (o.subSize || 16) * s;
    const padX = (o.padX || 13) * s, padY = (o.padY || 8) * s;
    g.font = (o.weight || 600) + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    let wMain = g.measureText(o.main).width;
    let wSub = 0;
    if (o.sub) { g.font = (o.subWeight || 500) + ' ' + subSize + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; wSub = g.measureText(o.sub).width; }
    const bw = Math.min(Math.max(wMain, wSub) + padX * 2, o.maxW || 1e9);
    const lh = size * 1.25, slh = subSize * 1.3;
    const bh = padY * 2 + lh + (o.sub ? slh : 0);
    const bx = o.ax === 'r' ? o.x - bw : o.ax === 'c' ? o.x - bw / 2 : o.x;
    const by = o.ay === 'b' ? o.y - bh : o.y;
    g.fillStyle = o.bg || 'rgba(10,12,16,.72)';
    roundRect(g, bx, by, bw, bh, (o.radius || 10) * s); g.fill();
    g.textBaseline = 'middle';
    const tx = o.ax === 'r' ? bx + bw - padX : o.ax === 'c' ? bx + bw / 2 : bx + padX;
    g.textAlign = o.ax === 'r' ? 'right' : o.ax === 'c' ? 'center' : 'left';
    g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
    g.font = (o.weight || 600) + ' ' + size + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillStyle = o.fg || '#fff';
    g.fillText(o.main, tx, by + padY + lh / 2);
    if (o.sub) {
      g.font = (o.subWeight || 500) + ' ' + subSize + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      g.fillStyle = o.subFg || '#c7cdd9';
      g.fillText(o.sub, tx, by + padY + lh + slh / 2);
    }
    g.restore();
    g.textAlign = 'left';
  }
  function drawInfo(g, w, h, f) {
    const s = h / 720, m = 14 * s;
    const c = f.cam;
    tag(g, s, { x: m, y: m, ax: 'l', ay: 't', main: Math.round(c.focal) + ' mm · ' + M.lensType(c.focal, T), sub: T.lens.fov + ': ' + Math.round(M.hFov(c.focal)) + '°' });
    if (f.count > 1) tag(g, s, { x: w - m, y: m, ax: 'r', ay: 't', main: 'Cadrul ' + (f.index + 1), sub: 'din ' + f.count });
    const roll = Math.abs(c.roll) > 0.5 ? 'Unghi olandez ' + Math.round(Math.abs(c.roll)) + '°' : '';
    tag(g, s, { x: w - m, y: h - m, ax: 'r', ay: 'b', main: f.angle, sub: roll, maxW: w * 0.4 });
    tag(g, s, { x: m, y: h - m, ax: 'l', ay: 'b', main: f.shot.label, sub: f.shot.name || '', size: 25, maxW: w * 0.55 });
    if (f.moves.length) {
      const one = f.moves.length === 1;
      tag(g, s, {
        x: w / 2, y: h - 76 * s, ax: 'c', ay: 'b', main: one ? f.moves[0] : T.combined, sub: one ? '' : f.moves.join(' + '),
        size: 28, subSize: 20, weight: 800, subWeight: 600, padX: 20, padY: 10, radius: 12,
        bg: 'rgba(255,176,32,.92)', fg: '#1a1200', subFg: '#1a1200', maxW: w * 0.92,
      });
    }
  }

  /* ---------- planul video-ului: ce se vede în fiecare cadru al filmului ---------- */
  function plan(doc) {
    const out = [];
    doc.shots.forEach((k, i) => {
      const n = Math.max(1, Math.round(k.duration * FPS));
      for (let j = 0; j < n; j++) out.push({ k, i, tau: j / FPS });
    });
    return out;
  }
  function frameAt(view3d, doc, p, w, h, info) {
    const cam = M.camAt(p.k.track, p.tau) || p.k.camera;
    const r = view3d.renderFrame(cam, p.k.start + p.tau, w, h);
    if (info) {
      drawInfo(r.canvas.getContext('2d'), w, h, {
        cam, angle: r.angle, shot: r.shot, index: p.i, count: doc.shots.length, moves: M.logLabelsAt(p.k.track, p.tau),
      });
    }
    return r.canvas;
  }

  /* ---------- codare ---------- */
  async function pickCodec(size, w, h) {
    if (!('VideoEncoder' in window) || !window.Mp4Muxer) return null;
    for (const codec of CODECS[size]) {
      const cfg = { codec, width: w, height: h, bitrate: size === 'fhd' ? 8e6 : 5e6, framerate: FPS };
      try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return cfg; } catch (e) { /* următorul */ }
    }
    return null;
  }

  async function encodeMp4(cfg, frames, draw, progress, cancelled) {
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: cfg.width, height: cfg.height, frameRate: FPS },
      fastStart: 'in-memory',
    });
    let err = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { err = e; } });
    enc.configure(Object.assign({ avc: { format: 'avc' } }, cfg));
    const dur = Math.round(1e6 / FPS);
    for (let i = 0; i < frames.length; i++) {
      if (cancelled()) { try { enc.close(); } catch (e) {} return null; }
      if (err) throw err;
      const cv = draw(frames[i]);
      const vf = new VideoFrame(cv, { timestamp: i * dur, duration: dur });
      enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 4) await pause(4);
      if (i % 3 === 0) { progress(i / frames.length); await pause(); }
    }
    await enc.flush();
    if (err) throw err;
    enc.close();
    muxer.finalize();
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4' };
  }

  // rezervă: înregistrare în timp real a unei pânze (durează cât filmul)
  async function encodeRecorder(w, h, frames, draw, progress, cancelled) {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
    const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const type = types.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } });
    if (!type) return null;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const stream = cv.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: w >= 1920 ? 8e6 : 5e6 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise((r) => { rec.onstop = r; });
    rec.start(1000);
    const t0 = performance.now();
    for (let i = 0; i < frames.length; i++) {
      if (cancelled()) { rec.stop(); await done; return null; }
      g.drawImage(draw(frames[i]), 0, 0);
      if (track.requestFrame) track.requestFrame();
      progress(i / frames.length);
      const wait = t0 + ((i + 1) * 1000) / FPS - performance.now();
      await pause(Math.max(0, wait));
    }
    rec.stop(); await done;
    const mime = type.split(';')[0];
    const slow = performance.now() - t0 > (frames.length * 1000 / FPS) * 1.25; // dispozitivul n-a ținut pasul
    return { blob: new Blob(parts, { type: mime }), ext: mime === 'video/mp4' ? 'mp4' : 'webm', slow };
  }

  function slug(name) {
    const s = String(name || 'secventa').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    return s || 'secventa';
  }

  /* ---------- fereastra de export ---------- */
  SIM.createVideoExport = function (store, ui) {
    const st = store.state;
    const $ = (q) => document.querySelector(q);
    let lastUrl = null;
    let job = 0;
    const opts = { size: 'hd', info: true };

    function open() {
      if (st.playing) SIM.engine.pause();
      if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
      const shots = st.doc.shots, total = shots.reduce((s, k) => s + k.duration, 0);
      const seg = (id, items, cur) => `<div class="seg" id="${id}">${items.map(([v, l]) => `<button data-v="${v}" class="${v === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
      ui.openSheet('Exportă video', `<div class="vx">
        <p class="hint">Toate cadrele, unul după altul, ca la „Redă toate cadrele”: ${shots.length} ${shots.length === 1 ? 'cadru' : 'cadre'} · ${(Math.round(total * 10) / 10).toString().replace('.', ',')} s.</p>
        <div class="vx-row"><span>Calitate</span>${seg('vxSize', [['hd', 'HD 720p'], ['fhd', 'Full HD 1080p']], opts.size)}</div>
        <div class="vx-row"><span>Informații pe imagine</span>${seg('vxInfo', [['true', 'Da'], ['false', 'Nu']], opts.info)}</div>
        <div class="btns"><button class="btn primary" id="vxGo">Creează video-ul</button></div>
      </div>`, (root) => {
        root.querySelectorAll('#vxSize button').forEach((b) => b.addEventListener('click', () => { opts.size = b.dataset.v; root.querySelectorAll('#vxSize button').forEach((x) => x.classList.toggle('on', x === b)); }));
        root.querySelectorAll('#vxInfo button').forEach((b) => b.addEventListener('click', () => { opts.info = b.dataset.v === 'true'; root.querySelectorAll('#vxInfo button').forEach((x) => x.classList.toggle('on', x === b)); }));
        root.querySelector('#vxGo').addEventListener('click', () => run(root));
      });
    }

    async function run(root) {
      const my = ++job;
      const doc = st.doc;
      const [w, h] = SIZES[opts.size];
      const frames = plan(doc);
      const view3d = SIM.view3d;
      const cancelled = () => my !== job || $('#sheet').hidden;
      const draw = (p) => frameAt(view3d, doc, p, w, h, opts.info);
      const cfg = await pickCodec(opts.size, w, h);
      root.innerHTML = `<div class="vx">
        <p id="vxMsg">${cfg ? 'Se creează video-ul…' : 'Se înregistrează video-ul (durează cât filmul)…'}</p>
        <div class="vx-bar"><div id="vxBar"></div></div>
        <div class="btns"><button class="btn" id="vxStop">Renunță</button></div>
      </div>`;
      root.querySelector('#vxStop').addEventListener('click', () => { job++; ui.closeSheet(); });
      const bar = root.querySelector('#vxBar'), msg = root.querySelector('#vxMsg');
      const progress = (k) => { bar.style.width = Math.round(k * 100) + '%'; msg.textContent = (cfg ? 'Se creează video-ul… ' : 'Se înregistrează… ') + Math.round(k * 100) + '%'; };
      let out = null;
      try {
        out = cfg ? await encodeMp4(cfg, frames, draw, progress, cancelled) : await encodeRecorder(w, h, frames, draw, progress, cancelled);
        if (!out && !cancelled() && cfg) out = await encodeRecorder(w, h, frames, draw, progress, cancelled);
      } catch (e) {
        console.warn('export video', e);
        try { if (!cancelled()) out = await encodeRecorder(w, h, frames, draw, progress, cancelled); } catch (e2) { out = null; }
      } finally {
        view3d.releaseFrames();
      }
      if (cancelled()) return;
      if (!out) {
        root.innerHTML = '<p>Exportul video nu merge în acest browser. Încearcă în Google Chrome (pe tabletă sau pe calculator).</p>';
        return;
      }
      showResult(root, out, doc);
    }

    function showResult(root, out, doc) {
      lastUrl = URL.createObjectURL(out.blob);
      const name = slug(doc.name) + '.' + out.ext;
      const file = typeof File === 'function' ? new File([out.blob], name, { type: out.blob.type }) : null;
      const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
      const mb = (out.blob.size / 1048576).toFixed(1).replace('.', ',');
      root.innerHTML = `<div class="vx">
        <video class="vx-video" src="${lastUrl}" controls playsinline></video>
        <p class="hint">${esc(name)} · ${mb} MB${out.ext === 'webm' ? ' · Browserul acesta nu poate crea .mp4, așa că fișierul e .webm (se deschide în VLC, DaVinci Resolve, Premiere).' : ''}${out.slow ? '<br>Atenție: dispozitivul a desenat mai încet decât rulează filmul, așa că mișcarea din video poate fi încetinită. Pentru un rezultat corect, exportă din Google Chrome sau alege HD 720p.' : ''}</p>
        <div class="btns">
          ${canShare ? '<button class="btn" id="vxShare">Trimite…</button>' : ''}
          <button class="btn primary" id="vxDl">Descarcă video-ul</button>
        </div>
      </div>`;
      root.querySelector('#vxDl').addEventListener('click', () => {
        const a = document.createElement('a'); a.href = lastUrl; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
      });
      if (canShare) root.querySelector('#vxShare').addEventListener('click', () => {
        navigator.share({ files: [file], title: doc.name }).catch(() => {});
      });
    }

    const btn = $('#bVideo');
    if (btn) btn.addEventListener('click', open);
    return { open };
  };
})();
