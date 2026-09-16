/* ============================================================
   App: wires synth + pixel machine + pads + loops + keyboard +
   sequencer + live recording + saving + i18n together.
   ============================================================ */
(() => {
  const $ = s => document.querySelector(s);

  /* ---------- sound registry ---------- */
  const PADS = [
    { id: 'stone',   key: '1', color: '#9aa08c', fn: Synth.stone },
    { id: 'pipe',    key: '2', color: '#7fa7c9', fn: Synth.pipe },
    { id: 'impact',  key: '3', color: '#e8792b', fn: Synth.impact },
    { id: 'bell',    key: '4', color: '#e4c04a', fn: Synth.bell },
    { id: 'cymbal',  key: '5', color: '#f0d890', fn: Synth.cymbal },
    { id: 'cowbell', key: '6', color: '#9fb3c8', fn: Synth.cowbell },
    { id: 'steam',   key: '7', color: '#cfd6e0', fn: Synth.steam },
    { id: 'anvil',   key: 'Q', color: '#b9c3cf', fn: Synth.anvil },
    { id: 'chain',   key: 'W', color: '#8d97a3', fn: Synth.chain },
    { id: 'press',   key: 'E', color: '#c85a2a', fn: Synth.press },
    { id: 'drum',    key: 'R', color: '#b0623a', fn: Synth.drum },
    { id: 'sheet',   key: 'T', color: '#a8b4c2', fn: Synth.sheet },
    { id: 'whistle', key: 'Y', color: '#e0c060', fn: Synth.whistle },
    { id: 'welder',  key: 'U', color: '#9fd0ff', fn: Synth.welder },
    { id: 'bolts',   key: 'I', color: '#c0c6ce', fn: Synth.bolts },
  ];
  const LOOPS = [
    { id: 'rotation', key: '8', start: Synth.startRotation, param: { key: 'speed',  min: 0.4, max: 2.4, step: 0.05, value: 1 } },
    { id: 'drone',    key: '9', start: Synth.startDrone,    param: { key: 'muffle', min: 0,   max: 1,   step: 0.01, value: 0.55 } },
    { id: 'conveyor', key: '0', start: Synth.startConveyor, param: { key: 'speed',  min: 0.4, max: 2.5, step: 0.05, value: 1 } },
  ];
  const padById = Object.fromEntries(PADS.map(p => [p.id, p]));
  const loopById = Object.fromEntries(LOOPS.map(l => [l.id, l]));

  /* ---------- i18n ---------- */
  function detectLang() {
    try { const s = localStorage.getItem('ism-lang'); if (s && I18N[s]) return s; } catch (e) { /* ignore */ }
    const nav = (navigator.language || 'zh').toLowerCase();
    for (const code of I18N_ORDER) if (nav.startsWith(code)) return code;
    return 'zh';
  }
  let lang = detectLang();
  const T = () => I18N[lang];
  function applyLang() {
    const t = T();
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
    document.title = t.title;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const k = el.dataset.i18n;
      if (el.dataset.i18nAttr) el.setAttribute(el.dataset.i18nAttr, t[k]);
      else el.textContent = t[k];
    });
    PADS.forEach(p => {
      const el = document.querySelector(`.pad[data-id="${p.id}"]`);
      if (!el) return;
      el.querySelector('.name').textContent = t.pads[p.id];
      el.querySelector('.sub').textContent = lang === 'en' ? I18N.zh.pads[p.id] : I18N.en.pads[p.id];
      el.querySelector('.wav').title = t.wavTitle;
      const lab = document.querySelector(`.seq-label[data-id="${p.id}"] span:last-child`);
      if (lab) lab.textContent = t.pads[p.id];
    });
    LOOPS.forEach(l => {
      const el = document.querySelector(`.loop[data-id="${l.id}"]`);
      if (!el) return;
      el.querySelector('.loop-name').textContent = t.loops[l.id];
      el.querySelector('.loop-sub').textContent = lang === 'en' ? I18N.zh.loops[l.id] : I18N.en.loops[l.id];
      el.querySelector('.param-label').textContent = t.params[l.id];
      el.querySelector('.wav').title = t.loopWavTitle;
    });
    $('#seqPlay').textContent = seq.playing ? t.stop : t.play;
    if (!rec.active) $('#recBtn').textContent = t.record;
    $('#lang').value = lang;
  }
  const langSel = $('#lang');
  I18N_ORDER.forEach(code => {
    const o = document.createElement('option');
    o.value = code; o.textContent = I18N[code].label;
    langSel.appendChild(o);
  });
  langSel.addEventListener('change', e => {
    lang = e.target.value;
    try { localStorage.setItem('ism-lang', lang); } catch (err) { /* ignore */ }
    applyLang();
  });

  /* ---------- audio state ---------- */
  let ctx = null, bus = null, recorder = null;
  const active = {};
  const pix = new PixelMachine($('#pixel'));

  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { toast(T().noAudio); return false; }
    ctx = new AC({ latencyHint: 'interactive' });
    bus = Synth.buildMaster(ctx);
    bus.master.gain.value = parseFloat($('#masterVol').value);
    bus.wet.gain.value = parseFloat($('#reverbWet').value);
    setInterval(tick, 40);
    $('#startOverlay').classList.add('hidden');
    return true;
  }

  function playPad(id, when) {
    if (!ensureAudio()) return;
    const p = padById[id];
    const t = when ?? ctx.currentTime;
    p.fn(ctx, bus.input, t, {});
    const delay = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => { pix.trigger(id); flashPad(id); }, delay);
  }
  function flashPad(id) {
    const el = document.querySelector(`.pad[data-id="${id}"]`);
    if (!el) return;
    el.classList.add('hit');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('hit'), 110);
  }

  function syncLoopVisual(id) {
    const l = loopById[id], on = !!active[id];
    if (id === 'rotation') pix.setRotation(on, l.param.value);
    if (id === 'drone') pix.setDrone(on);
    if (id === 'conveyor') pix.setConveyor(on, l.param.value);
  }
  function toggleLoop(id, force) {
    if (!ensureAudio()) return;
    const l = loopById[id];
    const on = force ?? !active[id];
    const btn = document.querySelector(`.loop[data-id="${id}"] .toggle`);
    if (on && !active[id]) {
      const opts = {}; opts[l.param.key] = l.param.value;
      active[id] = l.start(ctx, bus.input, ctx.currentTime, opts);
      active[id].scheduleUntil(ctx.currentTime + 0.4);
      btn.classList.add('on');
    } else if (!on && active[id]) {
      active[id].stop(ctx.currentTime);
      delete active[id];
      btn.classList.remove('on');
    }
    syncLoopVisual(id);
  }

  /* ---------- scheduler tick ---------- */
  function tick() {
    const ahead = ctx.currentTime + 0.35;
    for (const id in active) active[id].scheduleUntil(ahead);
    if (seq.playing) {
      while (seq.nextTime < ctx.currentTime + 0.14) {
        scheduleStep(seq.cur, seq.nextTime);
        seq.nextTime += 60 / seq.bpm / 4;
        seq.cur = (seq.cur + 1) % seq.steps;
      }
    }
  }

  /* ---------- saving (hosted viewer vs plain page) ---------- */
  const hosted = !!(window.claude && typeof window.claude.use === 'function');
  const downloadsReady = hosted ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
  async function saveBlob(blob, filename) {
    const t = T();
    if (hosted) {
      const dl = await downloadsReady;
      if (!dl) { toast(t.saveFailed); return; }
      // the viewer's allowlist has no .wav, so ship the WAV inside a stored ZIP
      const data = new Uint8Array(await blob.arrayBuffer());
      const zip = Synth.makeZip([{ name: filename, data }]);
      try {
        await dl.save({ filename: filename.replace(/\.wav$/i, '.zip'), data: zip });
        toast(t.saved + ' · ' + t.zipNote);
      } catch (err) {
        toast(err && err.code === 'declined' ? t.declined : t.saveFailed + (err && err.message ? ': ' + err.message : ''));
      }
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
    toast(t.saved);
  }
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  async function exportWav(btn, filename, render) {
    const t = T();
    btn.classList.add('busy'); const old = btn.textContent; btn.textContent = '…';
    toast(t.rendering);
    try {
      const buf = await render();
      await saveBlob(Synth.encodeWAV(buf), filename);
    } catch (err) {
      console.error(err); toast(t.saveFailed + ': ' + err.message);
    } finally {
      btn.classList.remove('busy'); btn.textContent = old;
    }
  }

  /* ---------- live recording ---------- */
  const rec = { active: false, timer: null };
  const recBtn = $('#recBtn');
  recBtn.addEventListener('click', async () => {
    if (!ensureAudio()) return;
    if (!recorder) recorder = Synth.createRecorder(ctx, bus.master);
    if (!rec.active) {
      recorder.start();
      rec.active = true;
      recBtn.classList.add('rec');
      const tickRec = () => {
        const s = Math.floor(recorder.seconds);
        recBtn.textContent = `■ ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      };
      tickRec();
      rec.timer = setInterval(tickRec, 250);
    } else {
      clearInterval(rec.timer);
      rec.active = false;
      recBtn.classList.remove('rec');
      recBtn.textContent = T().recSaving;
      const { chans, sampleRate, frames } = recorder.stop();
      if (frames > 0) {
        const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        await saveBlob(Synth.encodeWAVChannels(chans, sampleRate), `industrial-take-${stamp}.wav`);
      }
      recBtn.textContent = T().record;
    }
  });

  /* ---------- pads UI ---------- */
  const padsEl = $('#pads');
  PADS.forEach(p => {
    const el = document.createElement('div');
    el.className = 'pad px'; el.dataset.id = p.id; el.style.setProperty('--pad-color', p.color);
    el.innerHTML = `<span class="key">${p.key}</span><div class="bar"></div>
      <div class="name"></div><p class="sub"></p>
      <button class="wav px"></button>`;
    el.querySelector('.wav').textContent = '↓ WAV';
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.wav')) return;
      e.preventDefault();
      playPad(p.id);
    });
    el.querySelector('.wav').addEventListener('click', e => {
      e.stopPropagation();
      exportWav(e.currentTarget, `${p.id}.wav`, () => Synth.renderOneShot(p.fn, {}));
    });
    padsEl.appendChild(el);
  });

  /* ---------- loops UI ---------- */
  const loopsEl = $('#loops');
  LOOPS.forEach(l => {
    const el = document.createElement('div');
    el.className = 'loop px'; el.dataset.id = l.id;
    el.innerHTML = `
      <button class="btn toggle px"><span class="loop-name"></span><span class="keycap">${l.key}</span><small class="loop-sub"></small></button>
      <label><span class="param-label"></span>
        <input type="range" id="param-${l.id}" min="${l.param.min}" max="${l.param.max}" step="${l.param.step}" value="${l.param.value}">
      </label>
      <button class="wav px">↓ WAV</button>`;
    el.querySelector('.toggle').addEventListener('click', () => toggleLoop(l.id));
    el.querySelector('input').addEventListener('input', e => {
      l.param.value = parseFloat(e.target.value);
      if (active[l.id]) { active[l.id].setParam(l.param.value); syncLoopVisual(l.id); }
    });
    el.querySelector('.wav').addEventListener('click', e => {
      const opts = {}; opts[l.param.key] = l.param.value;
      exportWav(e.currentTarget, `${l.id}.wav`, () => Synth.renderLoop(l.start, opts, 6));
    });
    loopsEl.appendChild(el);
  });

  /* ---------- pixel machine clicks ---------- */
  pix.onHit = id => {
    if (padById[id]) playPad(id);
    else if (loopById[id]) toggleLoop(id);
  };

  /* ---------- master controls ---------- */
  $('#masterVol').addEventListener('input', e => { if (bus) bus.master.gain.setTargetAtTime(parseFloat(e.target.value), ctx.currentTime, 0.02); });
  $('#reverbWet').addEventListener('input', e => { if (bus) bus.wet.gain.setTargetAtTime(parseFloat(e.target.value), ctx.currentTime, 0.02); });
  $('#startBtn').addEventListener('click', () => { ensureAudio(); playPad('steam'); });
  $('#panic').addEventListener('click', () => {
    if (!ctx) return;
    LOOPS.forEach(l => toggleLoop(l.id, false));
    stopSeq();
    const now = ctx.currentTime, v = parseFloat($('#masterVol').value);
    bus.master.gain.cancelScheduledValues(now);
    bus.master.gain.setValueAtTime(0, now);
    bus.master.gain.setTargetAtTime(v, now + 0.25, 0.05);
  });

  /* ---------- sequencer ---------- */
  const seq = {
    steps: 16, bpm: 124, playing: false, cur: 0, nextTime: 0,
    pattern: Object.fromEntries(PADS.map(p => [p.id, new Array(16).fill(false)])),
  };
  const PRESET = {
    impact:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    press:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0],
    stone:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,1,0,1],
    pipe:    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
    anvil:   [0,0,0,1, 0,0,0,0, 0,0,0,1, 0,0,0,0],
    cowbell: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    cymbal:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    bell:    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
    drum:    [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    chain:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,1,0],
    bolts:   [0,0,0,0, 0,0,0,1, 0,0,0,0, 0,0,0,0],
    welder:  [0,0,0,0, 0,0,0,0, 0,1,0,0, 0,0,0,0],
    steam:   [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,1],
  };
  for (const id in PRESET) seq.pattern[id] = PRESET[id].map(Boolean);

  const grid = $('#seqGrid');
  function buildGrid() {
    grid.innerHTML = '';
    grid.appendChild(document.createElement('div'));
    for (let s = 0; s < seq.steps; s++) {
      const h = document.createElement('div');
      h.className = 'seq-head' + (s % 4 === 0 ? ' beat' : ''); h.dataset.step = s;
      grid.appendChild(h);
    }
    PADS.forEach(p => {
      const lab = document.createElement('div');
      lab.className = 'seq-label'; lab.dataset.id = p.id; lab.style.setProperty('--pad-color', p.color);
      lab.innerHTML = `<span class="dot"></span><span></span>`;
      lab.addEventListener('click', () => playPad(p.id));
      grid.appendChild(lab);
      for (let s = 0; s < seq.steps; s++) {
        const b = document.createElement('button');
        b.className = 'step' + (s % 4 === 0 ? ' beat' : '') + (seq.pattern[p.id][s] ? ' on' : '');
        b.style.setProperty('--pad-color', p.color);
        b.dataset.id = p.id; b.dataset.step = s;
        b.setAttribute('aria-label', `${p.id} ${s + 1}`);
        b.addEventListener('click', () => {
          seq.pattern[p.id][s] = !seq.pattern[p.id][s];
          b.classList.toggle('on', seq.pattern[p.id][s]);
          if (seq.pattern[p.id][s] && !seq.playing) playPad(p.id);
        });
        grid.appendChild(b);
      }
    });
  }
  buildGrid();

  function scheduleStep(step, t) {
    PADS.forEach(p => { if (seq.pattern[p.id][step]) playPad(p.id, t); });
    const delay = Math.max(0, (t - ctx.currentTime) * 1000);
    setTimeout(() => highlightStep(step), delay);
  }
  function highlightStep(step) {
    grid.querySelectorAll('.cur').forEach(el => el.classList.remove('cur'));
    if (step < 0) return;
    grid.querySelectorAll(`[data-step="${step}"]`).forEach(el => el.classList.add('cur'));
  }
  function startSeq() {
    if (!ensureAudio()) return;
    seq.playing = true; seq.cur = 0; seq.nextTime = ctx.currentTime + 0.05;
    $('#seqPlay').textContent = T().stop; $('#seqPlay').classList.add('on');
  }
  function stopSeq() {
    seq.playing = false;
    $('#seqPlay').textContent = T().play; $('#seqPlay').classList.remove('on');
    setTimeout(() => highlightStep(-1), 200);
  }
  $('#seqPlay').addEventListener('click', () => seq.playing ? stopSeq() : startSeq());
  $('#seqClear').addEventListener('click', () => { PADS.forEach(p => seq.pattern[p.id].fill(false)); buildGrid(); applyLang(); });
  $('#seqRandom').addEventListener('click', () => {
    const density = { impact: 0.18, press: 0.06, stone: 0.28, pipe: 0.3, anvil: 0.14, cowbell: 0.18, cymbal: 0.06, bell: 0.06,
                      drum: 0.12, chain: 0.08, bolts: 0.08, welder: 0.05, steam: 0.06, whistle: 0.03, sheet: 0.05 };
    PADS.forEach(p => {
      for (let s = 0; s < seq.steps; s++) {
        let d = density[p.id];
        if (p.id === 'impact' && s % 8 === 0) d = 0.95;
        if (p.id === 'stone' && s % 4 === 2) d += 0.35;
        seq.pattern[p.id][s] = Math.random() < d;
      }
    });
    buildGrid(); applyLang();
  });
  const syncBpm = v => {
    v = Math.min(220, Math.max(50, Math.round(v) || 124));
    seq.bpm = v; $('#bpm').value = v; $('#bpmRange').value = v;
  };
  $('#bpm').addEventListener('change', e => syncBpm(parseFloat(e.target.value)));
  $('#bpmRange').addEventListener('input', e => syncBpm(parseFloat(e.target.value)));

  /* ---------- keyboard (by physical key code, layout independent) ---------- */
  const codeMap = {};
  const codeOf = k => /^[0-9]$/.test(k) ? `Digit${k}` : `Key${k}`;
  PADS.forEach(p => codeMap[codeOf(p.key)] = () => playPad(p.id));
  LOOPS.forEach(l => codeMap[codeOf(l.key)] = () => toggleLoop(l.id));
  window.addEventListener('keydown', e => {
    if (e.repeat || e.target.matches('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); seq.playing ? stopSeq() : startSeq(); return; }
    const fn = codeMap[e.code];
    if (fn) { e.preventDefault(); fn(); }
  });

  document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { passive: true });

  applyLang();
})();
