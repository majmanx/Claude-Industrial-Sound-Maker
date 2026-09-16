/* ============================================================
   Industrial Sound Synth
   All sounds are generated with the Web Audio API — no samples.
   Every sound function has the signature
       fn(ctx, dest, t, opts) -> durationSeconds
   so it works both live (AudioContext) and offline
   (OfflineAudioContext) for WAV export.
   Loop sounds (rotation / drone) return a handle:
       { stop(t), scheduleUntil(t), setParam(v) }
   ============================================================ */
const Synth = (() => {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const MIN = 0.0001;

  /* ---------- shared buffers ---------- */
  const noiseCache = new WeakMap();
  function noiseBuffer(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      const len = ctx.sampleRate * 2;
      b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, b);
    }
    return b;
  }
  function noiseSrc(ctx, t, dur) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(ctx);
    s.loop = true;
    s.loopStart = 0;
    s.loopEnd = 2;
    // random offset so successive hits don't sound identical
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }
  function impulse(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const x = i / len;
        // early metallic reflections + exponential tail
        let v = (Math.random() * 2 - 1) * Math.pow(1 - x, decay);
        if (i % 1471 < 8 && x < 0.2) v *= 3;
        d[i] = v;
      }
    }
    return b;
  }
  const curveCache = new WeakMap();
  function distCurve(ctx, k) {
    let m = curveCache.get(ctx);
    if (!m) { m = {}; curveCache.set(ctx, m); }
    if (!m[k]) {
      const n = 1024, c = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        c[i] = Math.tanh(x * k) / Math.tanh(k);
      }
      m[k] = c;
    }
    return m[k];
  }

  /* ---------- helpers ---------- */
  function env(ctx, t, peak, attack, decay, floor = MIN) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, MIN), t + attack);
    g.gain.exponentialRampToValueAtTime(floor, t + attack + decay);
    return g;
  }
  function osc(ctx, type, f, t, dur) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t);
    o.stop(t + dur);
    return o;
  }
  function filt(ctx, type, f, q) {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    return b;
  }

  /* ---------- master bus ---------- */
  function buildMaster(ctx) {
    const input = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const master = ctx.createGain();
    master.gain.value = 0.8;

    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.2, 3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    const wetHp = filt(ctx, 'highpass', 180);

    input.connect(comp);
    input.connect(wetHp).connect(conv).connect(wet).connect(comp);
    comp.connect(master).connect(ctx.destination);
    return { input, wet, master, comp };
  }

  /* ============================================================
     ONE-SHOTS
     ============================================================ */

  /** 敲石头 — stone hit: dry crack + low knock + debris grit */
  function stone(ctx, dest, t, o = {}) {
    const f = o.pitch || rnd(0.85, 1.15);
    const out = ctx.createGain(); out.gain.value = (o.gain ?? 1) * 1.6; out.connect(dest);

    const n = noiseSrc(ctx, t, 0.25);
    const bp = filt(ctx, 'bandpass', 2600 * f, 0.9);
    bp.frequency.setValueAtTime(2600 * f, t);
    bp.frequency.exponentialRampToValueAtTime(650 * f, t + 0.08);
    n.connect(bp).connect(env(ctx, t, 0.9, 0.002, 0.09)).connect(out);

    const k = osc(ctx, 'sine', 220 * f, t, 0.15);
    k.frequency.setValueAtTime(230 * f, t);
    k.frequency.exponentialRampToValueAtTime(65 * f, t + 0.05);
    k.connect(env(ctx, t, 0.75, 0.001, 0.07)).connect(out);

    const n2 = noiseSrc(ctx, t + 0.012, 0.22);
    const lp = filt(ctx, 'lowpass', 1300 * f, 0.5);
    n2.connect(lp).connect(env(ctx, t + 0.012, 0.35, 0.005, 0.16)).connect(out);

    // tiny secondary chip bouncing off
    if (Math.random() < 0.6) {
      const dt = rnd(0.07, 0.14);
      const n3 = noiseSrc(ctx, t + dt, 0.08);
      const bp3 = filt(ctx, 'bandpass', 3400 * f, 2);
      n3.connect(bp3).connect(env(ctx, t + dt, 0.25, 0.001, 0.04)).connect(out);
    }
    return 0.45;
  }

  /** 敲管道 — hollow metal pipe: free-bar modal partials with beating + clank */
  function pipe(ctx, dest, t, o = {}) {
    const f0 = o.f0 || rnd(170, 430);
    const ratios = [1, 2.756, 5.404, 8.933, 13.34];
    const amps = [1, 0.62, 0.42, 0.24, 0.12];
    const out = ctx.createGain(); out.gain.value = (o.gain ?? 1) * 0.45;
    const hp = filt(ctx, 'highpass', 110);
    out.connect(hp).connect(dest);

    ratios.forEach((r, i) => {
      const dec = 1.5 / (1 + i * 0.7);
      [-1.6, 1.6].forEach(det => {
        const oo = osc(ctx, 'sine', f0 * r * (1 + det / 1000), t, dec + 0.1);
        oo.connect(env(ctx, t, amps[i] * 0.5, 0.002, dec)).connect(out);
      });
    });
    // pipe resonance (air column) — hollow tone
    const air = osc(ctx, 'triangle', f0 * 0.5, t, 0.5);
    air.connect(filt(ctx, 'lowpass', 900)).connect(env(ctx, t, 0.35, 0.003, 0.35)).connect(out);

    // clank excitation
    const n = noiseSrc(ctx, t, 0.1);
    const bp = filt(ctx, 'bandpass', f0 * 4, 2);
    n.connect(bp).connect(env(ctx, t, 0.9, 0.001, 0.045)).connect(out);
    return 2.0;
  }

  /** 机器撞击 — heavy machine impact: sub thud + distorted clang + slam noise */
  function impact(ctx, dest, t, o = {}) {
    const out = ctx.createGain(); out.gain.value = o.gain ?? 1; out.connect(dest);

    const s = osc(ctx, 'sine', 110, t, 0.7);
    s.frequency.setValueAtTime(115, t);
    s.frequency.exponentialRampToValueAtTime(31, t + 0.18);
    s.connect(env(ctx, t, 1.0, 0.003, 0.5)).connect(out);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distCurve(ctx, 6);
    shaper.oversample = '2x';
    const cl = ctx.createGain(); cl.gain.value = 0.45;
    [151, 387, 612, 1023, 1580, 2210].forEach((f, i) => {
      const oo = osc(ctx, i < 2 ? 'triangle' : 'sine', f * rnd(0.98, 1.02), t, 1.3);
      oo.connect(env(ctx, t, 0.55 / (1 + i * 0.5), 0.002, 0.95 - i * 0.1)).connect(shaper);
    });
    shaper.connect(cl).connect(filt(ctx, 'highpass', 90)).connect(out);

    const n = noiseSrc(ctx, t, 0.3);
    const lp = filt(ctx, 'lowpass', 5000, 0.7);
    lp.frequency.setValueAtTime(5500, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.22);
    n.connect(lp).connect(env(ctx, t, 0.9, 0.002, 0.24)).connect(out);

    // rattling aftermath
    for (let i = 0; i < 3; i++) {
      const dt = 0.12 + i * rnd(0.05, 0.09);
      const nr = noiseSrc(ctx, t + dt, 0.06);
      nr.connect(filt(ctx, 'bandpass', rnd(900, 2200), 3))
        .connect(env(ctx, t + dt, 0.18 / (i + 1), 0.001, 0.035)).connect(out);
    }
    return 1.6;
  }

  /** 敲铃铛 — bell: inharmonic partials with independent decays */
  function bell(ctx, dest, t, o = {}) {
    const f0 = o.f0 || rnd(380, 640);
    //           ratio  amp  decay
    const P = [[0.5, 0.6, 4.0], [1, 1, 3.3], [1.183, 0.5, 2.6], [1.506, 0.5, 2.3],
               [2, 0.4, 1.9], [2.514, 0.3, 1.5], [2.662, 0.25, 1.4], [3.011, 0.2, 1.2],
               [4.166, 0.12, 0.9], [5.433, 0.08, 0.7]];
    const out = ctx.createGain(); out.gain.value = (o.gain ?? 1) * 0.32; out.connect(dest);
    P.forEach(([r, a, d]) => {
      const oo = osc(ctx, 'sine', f0 * r * rnd(0.999, 1.001), t, d + 0.1);
      oo.connect(env(ctx, t, a, 0.002, d)).connect(out);
    });
    const n = noiseSrc(ctx, t, 0.05);
    n.connect(filt(ctx, 'bandpass', f0 * 3, 3)).connect(env(ctx, t, 0.5, 0.001, 0.03)).connect(out);
    return 4.3;
  }

  /** 敲镲 — cymbal (808-style): 6 detuned squares + noise, clipped, hi-passed, dual envelope */
  function cymbal(ctx, dest, t, o = {}) {
    const decay = o.decay || rnd(1.6, 2.2);
    const out = ctx.createGain(); out.gain.value = (o.gain ?? 1) * 1.3; out.connect(dest);
    const mix = ctx.createGain(); mix.gain.value = 0.18;
    [205.3, 304.4, 369.6, 522.7, 540, 800].forEach(f => {
      osc(ctx, 'square', f * rnd(0.99, 1.01), t, decay + 0.3).connect(mix);
    });
    const n = noiseSrc(ctx, t, decay + 0.3);
    const ng = ctx.createGain(); ng.gain.value = 0.7;
    n.connect(ng).connect(mix);

    const shaper = ctx.createWaveShaper();
    shaper.curve = distCurve(ctx, 3);
    const hp = filt(ctx, 'highpass', 6500, 0.5);
    const bp = filt(ctx, 'bandpass', 9500, 0.7);
    const bp2 = filt(ctx, 'bandpass', 3800, 1.2);
    mix.connect(shaper).connect(hp);
    hp.connect(env(ctx, t, 0.9, 0.001, 0.28)).connect(out);                 // bright edge
    hp.connect(bp).connect(env(ctx, t, 0.5, 0.008, decay)).connect(out);     // shimmering body
    hp.connect(bp2).connect(env(ctx, t, 0.25, 0.02, decay * 0.7)).connect(out); // metal wash
    return decay + 0.6;
  }

  /** 牛铃 — cowbell (808-style): two squares 587/845 Hz, bandpass, quick-decay */
  function cowbell(ctx, dest, t, o = {}) {
    const f = o.pitch || rnd(0.97, 1.03);
    const out = ctx.createGain(); out.gain.value = (o.gain ?? 1) * 0.6; out.connect(dest);
    const bp = filt(ctx, 'bandpass', 1850 * f, 1.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.035);
    g.gain.exponentialRampToValueAtTime(MIN, t + 0.42);
    [587, 845].forEach(fr => {
      const oo = osc(ctx, 'square', fr * f, t, 0.5);
      oo.frequency.setValueAtTime(fr * f * 1.03, t);
      oo.frequency.exponentialRampToValueAtTime(fr * f, t + 0.02);
      oo.connect(bp);
    });
    const shaper = ctx.createWaveShaper();
    shaper.curve = distCurve(ctx, 2);
    bp.connect(g).connect(shaper).connect(out);
    // stick click
    const n = noiseSrc(ctx, t, 0.03);
    n.connect(filt(ctx, 'highpass', 3000)).connect(env(ctx, t, 0.4, 0.001, 0.015)).connect(out);
    return 0.6;
  }

  /** 机器喷气 — pressurised steam vent: valve pop + swept hiss */
  function steam(ctx, dest, t, o = {}) {
    const dur = o.dur || rnd(0.9, 1.3);
    const out = ctx.createGain(); out.gain.value = o.gain ?? 1; out.connect(dest);

    const n = noiseSrc(ctx, t, dur + 0.1);
    const hp = filt(ctx, 'highpass', 600, 0.7);
    hp.frequency.setValueAtTime(500, t);
    hp.frequency.exponentialRampToValueAtTime(3800, t + 0.15);
    hp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const bp = filt(ctx, 'bandpass', 3000, 0.6);
    bp.frequency.setValueAtTime(2800, t);
    bp.frequency.exponentialRampToValueAtTime(6500, t + 0.2);
    bp.frequency.exponentialRampToValueAtTime(2200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.03);
    g.gain.setValueAtTime(0.85, t + 0.25);
    g.gain.exponentialRampToValueAtTime(MIN, t + dur);
    n.connect(hp).connect(bp).connect(g).connect(out);

    // low pressure body under the hiss
    const n2 = noiseSrc(ctx, t, dur);
    n2.connect(filt(ctx, 'bandpass', 450, 1.5)).connect(env(ctx, t, 0.3, 0.04, dur * 0.8)).connect(out);

    // valve pop
    const p = osc(ctx, 'square', 400, t, 0.1);
    p.frequency.setValueAtTime(420, t);
    p.frequency.exponentialRampToValueAtTime(70, t + 0.03);
    p.connect(filt(ctx, 'lowpass', 1500)).connect(env(ctx, t, 0.28, 0.001, 0.045)).connect(out);
    return dur + 0.3;
  }

  /* ============================================================
     LOOPS
     ============================================================ */

  /** 机器转动 — rotating machinery: motor hum + whir + rhythmic clanks */
  function startRotation(ctx, dest, t, o = {}) {
    let speed = o.speed || 1;                 // revolutions per second
    const out = ctx.createGain();
    out.gain.setValueAtTime(MIN, t);
    out.gain.exponentialRampToValueAtTime(0.75, t + 0.9);
    out.connect(dest);

    // motor
    const motor = ctx.createOscillator(); motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(28, t);
    motor.frequency.exponentialRampToValueAtTime(52 * speed, t + 1.6);
    const mlp = filt(ctx, 'lowpass', 340, 4);
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(2.2 * speed, t);
    const lfoG = ctx.createGain(); lfoG.gain.value = 140;
    lfo.connect(lfoG).connect(mlp.frequency);
    const mg = ctx.createGain(); mg.gain.value = 0.5;
    motor.connect(mlp).connect(mg).connect(out);

    // belt whir
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true;
    const wbp = filt(ctx, 'bandpass', 1200, 5);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.setValueAtTime(speed * 1.1, t);
    const l2g = ctx.createGain(); l2g.gain.value = 550;
    lfo2.connect(l2g).connect(wbp.frequency);
    const wg = ctx.createGain(); wg.gain.value = 0.22;
    n.connect(wbp).connect(wg).connect(out);

    // gear grind (lower noise, pulsing)
    const n2 = ctx.createBufferSource(); n2.buffer = noiseBuffer(ctx); n2.loop = true;
    const gbp = filt(ctx, 'bandpass', 380, 3);
    const gg = ctx.createGain(); gg.gain.value = 0.18;
    const lfo3 = ctx.createOscillator(); lfo3.type = 'square'; lfo3.frequency.setValueAtTime(speed * 4, t);
    const l3g = ctx.createGain(); l3g.gain.value = 0.1;
    lfo3.connect(l3g).connect(gg.gain);
    n2.connect(gbp).connect(gg).connect(out);

    [motor, lfo, lfo2, lfo3, n, n2].forEach(x => x.start(t));

    // rhythmic clanks — scheduled ahead in chunks
    let nextClank = t + 0.4;
    let clankIndex = 0;
    function clank(at, accent) {
      const c = noiseSrc(ctx, at, 0.09);
      c.connect(filt(ctx, 'bandpass', accent ? 900 : 1400, 6))
        .connect(env(ctx, at, accent ? 0.5 : 0.28, 0.001, 0.06)).connect(out);
      const k = osc(ctx, 'sine', accent ? 140 : 210, at, 0.12);
      k.connect(env(ctx, at, accent ? 0.45 : 0.2, 0.001, 0.07)).connect(out);
    }
    function scheduleUntil(until) {
      while (nextClank < until) {
        clank(nextClank, clankIndex % 2 === 0);
        clankIndex++;
        nextClank += 0.5 / speed;
      }
    }
    function setParam(v) {
      speed = v;
      const now = ctx.currentTime;
      motor.frequency.cancelScheduledValues(now);
      motor.frequency.setTargetAtTime(52 * speed, now, 0.4);
      lfo.frequency.setTargetAtTime(2.2 * speed, now, 0.3);
      lfo2.frequency.setTargetAtTime(1.1 * speed, now, 0.3);
      lfo3.frequency.setTargetAtTime(4 * speed, now, 0.3);
    }
    function stop(at) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(out.gain.value || 0.75, at);
      out.gain.exponentialRampToValueAtTime(MIN, at + 0.7);
      motor.frequency.cancelScheduledValues(at);
      motor.frequency.setTargetAtTime(20, at, 0.35);
      [motor, lfo, lfo2, lfo3, n, n2].forEach(x => x.stop(at + 0.8));
      nextClank = Infinity;
    }
    return { stop, scheduleUntil, setParam };
  }

  /** 沉闷的机器声 — dull, muffled machine room drone */
  function startDrone(ctx, dest, t, o = {}) {
    let muffle = o.muffle ?? 0.5;             // 0 = brighter, 1 = very muffled
    const cutoff = () => 900 - muffle * 720;  // 900 → 180 Hz
    const out = ctx.createGain();
    out.gain.setValueAtTime(MIN, t);
    out.gain.exponentialRampToValueAtTime(0.85, t + 1.6);
    const lp = filt(ctx, 'lowpass', cutoff(), 0.8);
    lp.connect(out); out.connect(dest);

    // mains hum stack
    const hum = ctx.createGain(); hum.gain.value = 0.55;
    const h1 = osc0(ctx, 'sine', 50);
    const h2 = osc0(ctx, 'triangle', 100); const h2g = ctx.createGain(); h2g.gain.value = 0.35;
    const h3 = osc0(ctx, 'sine', 149.3);    const h3g = ctx.createGain(); h3g.gain.value = 0.12;
    h1.connect(hum); h2.connect(h2g).connect(hum); h3.connect(h3g).connect(hum);
    const am = osc0(ctx, 'sine', 0.37); const amg = ctx.createGain(); amg.gain.value = 0.2;
    am.connect(amg).connect(hum.gain);
    hum.connect(lp);

    // heavy rumble
    const rum = osc0(ctx, 'sawtooth', 27.5);
    const rlp = filt(ctx, 'lowpass', 85, 1);
    const rg = ctx.createGain(); rg.gain.value = 0.45;
    rum.connect(rlp).connect(rg).connect(lp);

    // brown-ish noise floor
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true;
    const nl1 = filt(ctx, 'lowpass', 140); const nl2 = filt(ctx, 'lowpass', 160);
    const ng = ctx.createGain(); ng.gain.value = 1.4;
    n.connect(nl1).connect(nl2).connect(ng).connect(lp);

    // ventilation swoosh, slowly wandering
    const v = ctx.createBufferSource(); v.buffer = noiseBuffer(ctx); v.loop = true;
    const vbp = filt(ctx, 'bandpass', 320, 2.5);
    const vlfo = osc0(ctx, 'sine', 0.11); const vlg = ctx.createGain(); vlg.gain.value = 120;
    vlfo.connect(vlg).connect(vbp.frequency);
    const vg = ctx.createGain(); vg.gain.value = 0.16;
    v.connect(vbp).connect(vg).connect(lp);

    const srcs = [h1, h2, h3, am, rum, n, v, vlfo];
    srcs.forEach(x => x.start(t));

    // periodic muffled thud + random clunks
    let nextThud = t + 0.8;
    let nextClunk = t + rnd(2, 4);
    function thud(at) {
      const s = osc(ctx, 'sine', 62, at, 0.5);
      s.frequency.setValueAtTime(66, at);
      s.frequency.exponentialRampToValueAtTime(38, at + 0.2);
      s.connect(env(ctx, at, 0.6, 0.005, 0.38)).connect(lp);
    }
    function clunk(at) {
      const c = noiseSrc(ctx, at, 0.2);
      c.connect(filt(ctx, 'lowpass', 320)).connect(env(ctx, at, 0.45, 0.004, 0.16)).connect(lp);
      const k = osc(ctx, 'triangle', rnd(90, 160), at, 0.3);
      k.connect(env(ctx, at, 0.25, 0.003, 0.22)).connect(lp);
    }
    function scheduleUntil(until) {
      while (nextThud < until) { thud(nextThud); nextThud += 0.8; }
      while (nextClunk < until) { clunk(nextClunk); nextClunk += rnd(1.8, 5); }
    }
    function setParam(v) {
      muffle = v;
      lp.frequency.setTargetAtTime(cutoff(), ctx.currentTime, 0.2);
    }
    function stop(at) {
      out.gain.cancelScheduledValues(at);
      out.gain.setValueAtTime(out.gain.value || 0.85, at);
      out.gain.exponentialRampToValueAtTime(MIN, at + 1.0);
      srcs.forEach(x => x.stop(at + 1.1));
      nextThud = Infinity; nextClunk = Infinity;
    }
    return { stop, scheduleUntil, setParam };
  }
  function osc0(ctx, type, f) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o;
  }

  /* ============================================================
     OFFLINE RENDER → WAV
     ============================================================ */
  async function renderOneShot(fn, opts = {}, sampleRate = 44100) {
    const probe = new OfflineAudioContext(2, sampleRate, sampleRate);
    // dry run to learn duration (cheap: nodes only)
    const dur = fn(probe, probe.createGain(), 0, opts) + 1.2; // + reverb tail
    const oc = new OfflineAudioContext(2, Math.ceil(sampleRate * dur), sampleRate);
    const m = buildMaster(oc);
    fn(oc, m.input, 0.02, opts);
    return oc.startRendering();
  }
  async function renderLoop(startFn, opts = {}, seconds = 6, sampleRate = 44100) {
    const oc = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate);
    const m = buildMaster(oc);
    const h = startFn(oc, m.input, 0.02, opts);
    h.scheduleUntil(seconds - 1.2);
    h.stop(seconds - 1.2);
    return oc.startRendering();
  }
  function encodeWAV(buf) {
    const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const bytes = 44 + len * ch * 2;
    const ab = new ArrayBuffer(bytes);
    const v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true);
    v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, len * ch * 2, true);
    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(buf.getChannelData(c));
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        const s = Math.max(-1, Math.min(1, chans[c][i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  return {
    buildMaster,
    stone, pipe, impact, bell, cymbal, cowbell, steam,
    startRotation, startDrone,
    renderOneShot, renderLoop, encodeWAV,
  };
})();
