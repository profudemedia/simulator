/* Scena 3D și imaginea camerei (un singur context WebGL, pentru tablete). */
(function () {
  const SIM = (window.SIM = window.SIM || {});
  const M = SIM.model;
  const T = SIM.T;
  const DEG = M.DEG;

  function lambert(color) {
    return new THREE.MeshLambertMaterial({ color });
  }
  function box(w, h, d, mat) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  }
  function cyl(rt, rb, h, mat, seg) {
    return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), mat);
  }
  function shade(hex, k) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(k);
    return c;
  }

  function canvasTexture(draw, size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    draw(cv.getContext('2d'), size);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  /* ---------- obiecte ---------- */
  function buildProp(p) {
    const g = new THREE.Group();
    const m = lambert(p.color);
    const dark = lambert(shade(p.color, 0.7));
    const { w, d, h } = p;
    switch (p.type) {
      case 'perete': { const b = box(w, h, d, m); b.position.y = h / 2; g.add(b); break; }
      case 'masa': {
        const top = box(w, 0.06, d, m); top.position.y = h - 0.03; g.add(top);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          const l = box(0.07, h - 0.06, 0.07, dark); l.position.set(sx * (w / 2 - 0.08), (h - 0.06) / 2, sz * (d / 2 - 0.08)); g.add(l);
        });
        break;
      }
      case 'scaun': {
        const sh = h * 0.5;
        const seat = box(w, 0.05, d, m); seat.position.y = sh; g.add(seat);
        const back = box(w, h - sh, 0.05, m); back.position.set(0, sh + (h - sh) / 2, d / 2 - 0.025); g.add(back);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          const l = box(0.04, sh, 0.04, dark); l.position.set(sx * (w / 2 - 0.04), sh / 2, sz * (d / 2 - 0.04)); g.add(l);
        });
        break;
      }
      case 'canapea': {
        const base = box(w, h * 0.5, d, m); base.position.y = h * 0.25; g.add(base);
        const back = box(w, h * 0.5, d * 0.25, dark); back.position.set(0, h * 0.75, d / 2 - d * 0.125); g.add(back);
        [-1, 1].forEach((s) => { const a = box(0.18, h * 0.3, d, dark); a.position.set(s * (w / 2 - 0.09), h * 0.65, 0); g.add(a); });
        break;
      }
      case 'coloana': { const c = cyl(w / 2, w / 2, h, m, 18); c.position.y = h / 2; g.add(c); break; }
      case 'copac': {
        const tr = cyl(0.12, 0.16, h * 0.45, lambert('#6b4f3a'), 10); tr.position.y = h * 0.225; g.add(tr);
        const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(w / 2, 1), m); cr.position.y = h * 0.45 + w * 0.42; cr.scale.y = (h * 0.55) / w; g.add(cr);
        break;
      }
      case 'lampa': {
        const base = cyl(0.15, 0.18, 0.04, dark); base.position.y = 0.02; g.add(base);
        const pole = cyl(0.02, 0.02, h - 0.3, dark, 8); pole.position.y = (h - 0.3) / 2; g.add(pole);
        const sh = cyl(w * 0.3, w / 2, 0.32, new THREE.MeshBasicMaterial({ color: p.color }), 16); sh.position.y = h - 0.16; g.add(sh);
        break;
      }
      case 'obiect': {
        let o;
        if (p.shape === 'cilindru') o = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24), m);
        else if (p.shape === 'sfera') o = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), m);
        else o = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
        o.scale.set(w, h, d); o.position.y = h / 2; g.add(o);
        break;
      }
      default: { const b = box(w, h, d, m); b.position.y = h / 2; g.add(b); }
    }
    return g;
  }

  const SKIN = '#e0b48c';
  function buildChar(c) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const cloth = lambert(c.color), pants = lambert('#34495e'), skin = lambert(SKIN), hair = lambert('#3b2a20');
    const parts = {};
    ['L', 'R'].forEach((s, i) => {
      const sx = i ? 0.1 : -0.1;
      const hip = new THREE.Group(); hip.position.set(sx, 0.88, 0);
      const thigh = box(0.15, 0.44, 0.17, pants); thigh.position.y = -0.22; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.43; hip.add(knee);
      const shin = box(0.14, 0.43, 0.16, pants); shin.position.y = -0.215; knee.add(shin);
      const shoe = box(0.15, 0.08, 0.26, lambert('#222')); shoe.position.set(0, -0.41, -0.05); knee.add(shoe);
      body.add(hip); parts['leg' + s] = hip; parts['knee' + s] = knee;
      const sh = new THREE.Group(); sh.position.set(i ? 0.29 : -0.29, 1.43, 0);
      const arm = box(0.11, 0.6, 0.13, cloth); arm.position.y = -0.3; sh.add(arm);
      const hand = box(0.09, 0.1, 0.1, skin); hand.position.y = -0.63; sh.add(hand);
      body.add(sh); parts['arm' + s] = sh;
    });
    const torso = box(0.46, 0.6, 0.26, cloth); torso.position.y = 1.18; body.add(torso);
    const neck = cyl(0.05, 0.05, 0.08, skin, 8); neck.position.y = 1.52; body.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin); head.position.y = 1.63; head.scale.set(1, 1.1, 1); body.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hair); cap.position.set(0, 1.65, 0.01); cap.scale.set(1, 1.1, 1.05); body.add(cap);
    const nose = box(0.03, 0.04, 0.04, lambert('#c99872')); nose.position.set(0, 1.62, -0.12); body.add(nose);
    [-1, 1].forEach((s) => { const e = box(0.025, 0.025, 0.01, lambert('#1a1a1a')); e.position.set(s * 0.04, 1.66, -0.112); body.add(e); });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.005; g.add(shadow);
    body.scale.setScalar(c.height / 1.75);
    g.userData.parts = parts;
    g.userData.body = body;
    g.userData.scale = c.height / 1.75;
    return g;
  }

  SIM.createView3D = function (container, store) {
    const st = store.state;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setScissorTest(true);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#9fb4c7');
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5048, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75);
    sun.position.set(6, 12, 4);
    scene.add(sun);

    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
    cam.rotation.order = 'YXZ';
    const camB = cam.clone();
    camB.rotation.order = 'YXZ';

    const floorTex = canvasTexture((g, s) => {
      g.fillStyle = '#b9b19f'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#a39a87'; g.fillRect(0, 0, s / 2, s / 2); g.fillRect(s / 2, s / 2, s / 2, s / 2);
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s);
    }, 256);
    floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const wallTex = canvasTexture((g, s) => {
      g.fillStyle = '#d8d0bf'; g.fillRect(0, 0, s, s);
      g.fillStyle = '#c2b8a3'; g.fillRect(0, 0, s / 2, s);
      g.fillStyle = '#8a7f6c'; g.fillRect(0, s * 0.78, s, s * 0.05);
    }, 128);

    const world = new THREE.Group(); scene.add(world);
    const setGroup = new THREE.Group(); world.add(setGroup);
    const propGroup = new THREE.Group(); world.add(propGroup);
    const charGroup = new THREE.Group(); world.add(charGroup);
    const propObjs = new Map(), charObjs = new Map();
    let setSig = '';

    function buildSet() {
      const s = st.doc.set;
      const sig = [s.w, s.d, s.backdrop].join('|');
      if (sig === setSig) return;
      setSig = sig;
      setGroup.children.slice().forEach((o) => setGroup.remove(o));
      const ft = floorTex.clone(); ft.needsUpdate = true; ft.repeat.set(s.w / 2, s.d / 2);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), new THREE.MeshLambertMaterial({ map: ft }));
      floor.rotation.x = -Math.PI / 2; setGroup.add(floor);
      if (s.backdrop === 'pereti') {
        scene.background = new THREE.Color('#2b2b30');
        const H = 4.5;
        [[0, -s.d / 2, s.w, 0], [0, s.d / 2, s.w, Math.PI], [-s.w / 2, 0, s.d, Math.PI / 2], [s.w / 2, 0, s.d, -Math.PI / 2]].forEach(([x, z, len, ry]) => {
          const t = wallTex.clone(); t.needsUpdate = true; t.repeat.set(len / 1, 1);
          const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshLambertMaterial({ map: t }));
          wall.position.set(x, H / 2, z); wall.rotation.y = ry; setGroup.add(wall);
        });
      } else if (s.backdrop === 'exterior') {
        scene.background = new THREE.Color('#9fc3e0');
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), lambert('#7d8f62'));
        ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; setGroup.add(ground);
        // clădiri îndepărtate, pentru paralaxă
        const R = Math.max(s.w, s.d) / 2 + 22;
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2 + (i % 3) * 0.05;
          const h = 6 + ((i * 37) % 11) * 1.4, w = 5 + ((i * 13) % 5);
          const b = box(w, h, 5, lambert(['#b7a99a', '#a3b1bf', '#c9b79c', '#9aa59a'][i % 4]));
          b.position.set(Math.sin(a) * R, h / 2, -Math.cos(a) * R); b.rotation.y = -a; setGroup.add(b);
        }
      } else {
        scene.background = new THREE.Color('#5d6670');
      }
    }

    function syncObjects() {
      buildSet();
      const seenP = new Set();
      const bases = M.propBases(st.doc.set.props);
      st.doc.set.props.forEach((p) => {
        seenP.add(p.id);
        const sig = [p.type, p.w, p.d, p.h, p.color, p.shape].join('|');
        let o = propObjs.get(p.id);
        if (!o || o.sig !== sig) {
          if (o) propGroup.remove(o.obj);
          o = { sig, obj: buildProp(p) }; propObjs.set(p.id, o); propGroup.add(o.obj);
        }
        o.obj.position.set(p.x, bases[p.id] || 0, p.z); o.obj.rotation.y = -p.yaw * DEG;
      });
      propObjs.forEach((o, id) => { if (!seenP.has(id)) { propGroup.remove(o.obj); propObjs.delete(id); } });

      const seenC = new Set();
      st.doc.characters.forEach((c) => {
        seenC.add(c.id);
        const sig = [c.color, c.height].join('|');
        let o = charObjs.get(c.id);
        if (!o || o.sig !== sig) {
          if (o) charGroup.remove(o.obj);
          o = { sig, obj: buildChar(c) }; charObjs.set(c.id, o); charGroup.add(o.obj);
        }
      });
      charObjs.forEach((o, id) => { if (!seenC.has(id)) { charGroup.remove(o.obj); charObjs.delete(id); } });
    }

    function poseChars(t) {
      if (t == null) t = st.sceneTime;
      st.doc.characters.forEach((c) => {
        const o = charObjs.get(c.id);
        if (!o) return;
        const p = M.charPose(c, t);
        o.obj.position.set(p.x, 0, p.z);
        o.obj.rotation.y = -p.yaw * DEG;
        const sw = p.walking ? Math.sin(p.dist * 3.4) * 0.55 : 0;
        const P = o.obj.userData.parts, U = o.obj.userData;
        if (p.seated) {
          // așezat: coapsele înainte, gambele în jos, mâinile în poală
          U.body.position.y = M.SEAT_H - 0.88 * U.scale;
          P.legL.rotation.x = P.legR.rotation.x = Math.PI / 2;
          P.kneeL.rotation.x = P.kneeR.rotation.x = -Math.PI / 2;
          P.armL.rotation.x = P.armR.rotation.x = 0.55;
        } else {
          U.body.position.y = 0;
          P.legL.rotation.x = sw; P.legR.rotation.x = -sw;
          P.kneeL.rotation.x = P.kneeR.rotation.x = p.walking ? -Math.max(0, Math.sin(p.dist * 3.4 + 1.2)) * 0.5 : 0;
          P.armL.rotation.x = -sw * 0.8; P.armR.rotation.x = sw * 0.8;
        }
      });
    }

    function applyCam(c3, c) {
      c3.position.set(c.x, c.y, c.z);
      c3.rotation.set(c.tilt * DEG, -c.yaw * DEG, -c.roll * DEG);
      c3.fov = M.vFov(c.focal);
      c3.updateProjectionMatrix();
      c3.updateMatrixWorld();
    }

    /* ---------- încadratura și unghiul ---------- */
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();
    function shotFor(c3, camState, t) {
      if (t == null) t = st.sceneTime;
      let best = null;
      const selId = st.selected && st.selected.kind === 'char' ? st.selected.id : null;
      st.doc.characters.forEach((c) => {
        const p = M.charPose(c, t);
        const top = M.charTop(c, p.seated);
        v1.set(p.x, top, p.z).project(c3); // creștet
        v2.set(p.x, 0, p.z).project(c3); // tălpi
        v3.set(p.x, top - c.height * 0.1, p.z).project(c3); // cap
        // în fața aparatului?
        const fw = M.camForward(camState);
        const ahead = (p.x - camState.x) * fw.x + (c.height * 0.6 - camState.y) * fw.y + (p.z - camState.z) * fw.z;
        if (ahead <= 0.05) return;
        const yTop = Math.max(v1.y, v2.y), yBot = Math.min(v1.y, v2.y);
        const span = yTop - yBot;
        if (span <= 1e-4) return;
        const visTop = Math.min(yTop, 1), visBot = Math.max(yBot, -1);
        if (visTop <= visBot) return; // nu se vede deloc pe verticală
        const xs = Math.abs(v3.x);
        if (xs > 1.05) return;
        const score = (c.id === selId ? -10 : 0) + xs;
        if (!best || score < best.score) best = { score, c, yTop, yBot, span };
      });
      if (!best) return { label: T.shots.none, name: '' };
      const { yTop, yBot, span, c } = best;
      const S = T.shots, TH = T.shotThresholds;
      let label;
      if (yTop <= 1.02 && yBot >= -1.02) {
        const r = 2 / span;
        label = r > T.shotWide.general ? S.ansamblu : r > T.shotWide.intreg ? S.general : S.intreg;
      } else if (yTop <= 1.08) {
        const cut = (yTop + 1) / span; // cât se vede din personaj, de la creștet în jos
        label = cut >= TH.americanSub ? S.americanSub : cut >= TH.americanPeste ? S.americanPeste : cut >= TH.mediu ? S.mediu
          : cut >= TH.prim ? S.prim : cut >= TH.primStrans ? S.primStrans : S.detaliu;
      } else {
        const vis = 2 / span;
        label = vis < TH.primStrans ? S.detaliu : vis < TH.prim ? S.primStrans : vis < TH.mediu ? S.prim : S.mediu;
      }
      return { label, name: c.name, id: c.id };
    }

    function angleFor(c) {
      const th = T.angleThreshold;
      return c.tilt < -th ? T.angles.plonjeu : c.tilt > th ? T.angles.contraplonjeu : T.angles.normal;
    }

    /* ---------- dimensiuni ---------- */
    let W = 1, H = 1;
    function resize() {
      const r = container.getBoundingClientRect();
      W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
      renderer.setSize(W, H, false);
      renderer.domElement.style.width = W + 'px';
      renderer.domElement.style.height = H + 'px';
    }
    function fit(w, h) {
      // cel mai mare dreptunghi 16:9 în w×h
      let fw = w, fh = (w * 9) / 16;
      if (fh > h) { fh = h; fw = (h * 16) / 9; }
      return { w: Math.floor(fw), h: Math.floor(fh) };
    }
    function frames() {
      if (!st.compare) {
        const f = fit(W, H);
        return [{ x: Math.floor((W - f.w) / 2), y: Math.floor((H - f.h) / 2), w: f.w, h: f.h }];
      }
      const gap = 10;
      const side = fit((W - gap) / 2, H), stack = fit(W, (H - gap) / 2);
      if (side.w * side.h >= stack.w * stack.h) {
        const x0 = Math.floor((W - side.w * 2 - gap) / 2), y0 = Math.floor((H - side.h) / 2);
        return [{ x: x0, y: y0, w: side.w, h: side.h }, { x: x0 + side.w + gap, y: y0, w: side.w, h: side.h }];
      }
      const x0 = Math.floor((W - stack.w) / 2), y0 = Math.floor((H - stack.h * 2 - gap) / 2);
      return [{ x: x0, y: y0, w: stack.w, h: stack.h }, { x: x0, y: y0 + stack.h + gap, w: stack.w, h: stack.h }];
    }

    function drawView(c3, f) {
      // în WebGL, originea viewport-ului e jos-stânga
      const y = H - f.y - f.h;
      renderer.setViewport(f.x, y, f.w, f.h);
      renderer.setScissor(f.x, y, f.w, f.h);
      c3.aspect = 16 / 9; c3.updateProjectionMatrix();
      renderer.render(scene, c3);
    }

    let compareCache = null;
    return {
      resize,
      syncObjects,
      /* desenează și întoarce informațiile pentru suprapunerile HUD */
      render() {
        poseChars();
        renderer.setScissor(0, 0, W, H);
        renderer.setViewport(0, 0, W, H);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        const fr = frames();
        if (!st.compare) {
          const c = st.live.camera;
          applyCam(cam, c);
          drawView(cam, fr[0]);
          return { frames: fr, cams: [c], shots: [shotFor(cam, c)], angle: angleFor(c) };
        }
        const subj = SIM.engine.subject(st.live.camera);
        const cc = M.compareCams(st.live.camera, subj, st.compareMode, st.compareS);
        compareCache = cc;
        applyCam(cam, cc.left); drawView(cam, fr[0]);
        applyCam(camB, cc.right); drawView(camB, fr[1]);
        return { frames: fr, cams: [cc.left, cc.right], shots: [shotFor(cam, cc.left), shotFor(camB, cc.right)], angle: angleFor(st.live.camera), k: cc.k };
      },
      getCompare: () => compareCache,
      /* o imagine fixă: camera camState, personajele la momentul t din acțiune.
         Se randează într-o țintă separată, deci imaginea de pe ecran nu clipește. */
      renderStill(camState, t, w, h, type) {
        w = w || 640; h = h || 360;
        const rt = new THREE.WebGLRenderTarget(w, h, { samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
        rt.texture.encoding = THREE.sRGBEncoding;
        const c3 = cam.clone(); c3.rotation.order = 'YXZ';
        poseChars(t);
        applyCam(c3, camState);
        c3.aspect = w / h; c3.updateProjectionMatrix();
        const prevScissor = renderer.getScissorTest();
        renderer.setScissorTest(false);
        renderer.setRenderTarget(rt);
        renderer.setViewport(0, 0, w, h);
        renderer.clear();
        renderer.render(scene, c3);
        const px = new Uint8Array(w * h * 4);
        renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
        renderer.setRenderTarget(null);
        renderer.setScissorTest(prevScissor);
        rt.dispose();
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d');
        const img = g.createImageData(w, h);
        for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4); // întoarce pe verticală
        g.putImageData(img, 0, 0);
        const info = { shot: shotFor(c3, camState, t), angle: angleFor(camState) };
        poseChars();
        return { canvas: cv, url: cv.toDataURL(type || 'image/jpeg', 0.86), shot: info.shot, angle: info.angle };
      },
      canvas: renderer.domElement,
    };
  };
})();
