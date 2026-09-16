/* ============================================================
   App: wires the synth, the pixel machine, pads, loops,
   keyboard, sequencer and WAV export together.
   ============================================================ */
(() => {
  const $ = s => document.querySelector(s);

  /* ---------- sound registry ---------- */
  const PADS = [
    { id: 'stone',   name: '敲石头',   sub: 'STONE HIT',      key: '1', color: '#9aa08c', fn: Synth.stone },
    { id: 'pipe',    name: '敲管道',   sub: 'PIPE HIT',       key: '2', color: '#7fa7c9', fn: Synth.pipe },
    { id: 'impact',  name: '机器撞击', sub: 'MACHINE IMPACT', key: '3', color: '#e8792b', fn: Synth.impact },
    { id: 'bell',    name: '敲铃铛',   sub: 'BELL',           key: '4', color: '#e4c04a', fn: Synth.bell },
    { id: 'cymbal',  name: '敲镲',     sub: 'CYMBAL',         key: '5', color: '#f0d890', fn: Synth.cymbal },
    { id: 'cowbell', name: '牛铃',     sub: 'COWBELL',        key: '6', color: '#9fb3c8', fn: Synth.cowbell },
    { id: 'steam',   name: '机器喷气', sub: 'STEAM VENT',     key: '7', color: '#cfd6e0', fn: Synth.steam },
  ];
  const LOOPS = [
    { id: 'rotation', name: '机器转动', sub: 'MACHINE ROTATION', key: '8', start: Synth.startRotation,
      param: { key: 'speed', label: '转速', min: 0.4, max: 2.4, step: 0.05, value: 1 } },
    { id: 'drone', name: '沉闷的机器声', sub: 'DULL MACHINE DRONE', key: '9', start: Synth.startDrone,
      param: { key: 'muffle', label: '沉闷', min: 0, max: 1, step: 0.01, value: 0.55 } },
  ];
  const padById = Object.fromEntries(PADS.map(p => [p.id, p]));
  const loopById = Object.fromEntries(LOOPS.map(l => [l.id, l]));

  /* ---------- audio state ---------- */
  let ctx = null, bus = null;
  const active = {};              // loop id -> handle
  const pix = new PixelMachine($('#pixel'));

  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { alert('此浏览器不支持 Web Audio。'); return false; }
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
    setTimeout(() => {
      pix.trigger(id);
      flashPad(id);
    }, delay);
  }
  function flashPad(id) {
    const el = document.querySelector(`.pad[data-id="${id}"]`);
    if (!el) return;
    el.classList.add('hit');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('hit'), 110);
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
    if (id === 'rotation') pix.setRotation(!!active[id], l.param.value);
    if (id === 'drone') pix.setDrone(!!active[id]);
  }

  /* ---------- scheduler tick (loops + sequencer) ---------- */
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

  /* ---------- pads UI ---------- */
  const padsEl = $('#pads');
  PADS.forEach(p => {
    const el = document.createElement('div');
    el.className = 'pad'; el.dataset.id = p.id; el.style.setProperty('--pad-color', p.color);
    el.innerHTML = `<span class="key">${p.key}</span><div class="bar"></div>
      <div class="name">${p.name}</div><p class="sub">${p.sub}</p>
      <button class="wav" title="离线渲染并下载 WAV 采样">↓ WAV</button>`;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('.wav')) return;
      e.preventDefault();
      playPad(p.id);
    });
    el.querySelector('.wav').addEventListener('click', e => {
      e.stopPropagation();
      exportWav(e.target, `${p.id}.wav`, () => Synth.renderOneShot(p.fn, {}));
    });
    padsEl.appendChild(el);
  });

  /* ---------- loops UI ---------- */
  const loopsEl = $('#loops');
  LOOPS.forEach(l => {
    const el = document.createElement('div');
    el.className = 'loop'; el.dataset.id = l.id;
    el.innerHTML = `
      <button class="btn toggle">${l.name}<span class="keycap">${l.key}</span><small>${l.sub}</small></button>
      <label>${l.param.label}
        <input type="range" min="${l.param.min}" max="${l.param.max}" step="${l.param.step}" value="${l.param.value}">
      </label>
      <button class="wav" title="渲染 6 秒循环并下载 WAV">↓ WAV</button>`;
    el.querySelector('.toggle').addEventListener('click', () => toggleLoop(l.id));
    el.querySelector('input').addEventListener('input', e => {
      l.param.value = parseFloat(e.target.value);
      if (active[l.id]) active[l.id].setParam(l.param.value);
      if (l.id === 'rotation' && active[l.id]) pix.setRotation(true, l.param.value);
    });
    el.querySelector('.wav').addEventListener('click', e => {
      const opts = {}; opts[l.param.key] = l.param.value;
      exportWav(e.target, `${l.id}.wav`, () => Synth.renderLoop(l.start, opts, 6));
    });
    loopsEl.appendChild(el);
  });

  /* ---------- WAV export ---------- */
  async function exportWav(btn, filename, render) {
    btn.classList.add('busy'); const old = btn.textContent; btn.textContent = '…';
    try {
      const buf = await render();
      const blob = Synth.encodeWAV(buf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (err) {
      console.error(err); alert('渲染失败：' + err.message);
    } finally {
      btn.classList.remove('busy'); btn.textContent = old;
    }
  }

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
    impact:  [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    stone:   [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
    pipe:    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,0,0],
    cowbell: [0,0,0,0, 0,0,1,0, 0,0,0,0, 0,0,1,0],
    cymbal:  [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    bell:    [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0],
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
      lab.className = 'seq-label'; lab.style.setProperty('--pad-color', p.color);
      lab.innerHTML = `<span class="dot"></span>${p.name}`;
      lab.addEventListener('click', () => playPad(p.id));
      grid.appendChild(lab);
      for (let s = 0; s < seq.steps; s++) {
        const b = document.createElement('button');
        b.className = 'step' + (s % 4 === 0 ? ' beat' : '') + (seq.pattern[p.id][s] ? ' on' : '');
        b.style.setProperty('--pad-color', p.color);
        b.dataset.id = p.id; b.dataset.step = s;
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
    $('#seqPlay').textContent = '■ 停止'; $('#seqPlay').classList.add('on');
  }
  function stopSeq() {
    seq.playing = false;
    $('#seqPlay').textContent = '▶ 播放'; $('#seqPlay').classList.remove('on');
    setTimeout(() => highlightStep(-1), 200);
  }
  $('#seqPlay').addEventListener('click', () => seq.playing ? stopSeq() : startSeq());
  $('#seqClear').addEventListener('click', () => {
    PADS.forEach(p => seq.pattern[p.id].fill(false)); buildGrid();
  });
  $('#seqRandom').addEventListener('click', () => {
    const density = { impact: 0.2, stone: 0.3, pipe: 0.35, cowbell: 0.2, cymbal: 0.08, bell: 0.08, steam: 0.08 };
    PADS.forEach(p => {
      for (let s = 0; s < seq.steps; s++) {
        let d = density[p.id];
        if (p.id === 'impact' && s % 8 === 0) d = 0.95;
        if (p.id === 'stone' && s % 4 === 2) d += 0.35;
        seq.pattern[p.id][s] = Math.random() < d;
      }
    });
    buildGrid();
  });
  const syncBpm = v => {
    v = Math.min(220, Math.max(50, Math.round(v) || 124));
    seq.bpm = v; $('#bpm').value = v; $('#bpmRange').value = v;
  };
  $('#bpm').addEventListener('change', e => syncBpm(parseFloat(e.target.value)));
  $('#bpmRange').addEventListener('input', e => syncBpm(parseFloat(e.target.value)));

  /* ---------- keyboard ---------- */
  const keyMap = {};
  PADS.forEach(p => keyMap[p.key] = () => playPad(p.id));
  LOOPS.forEach(l => keyMap[l.key] = () => toggleLoop(l.id));
  window.addEventListener('keydown', e => {
    if (e.repeat || e.target.matches('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); seq.playing ? stopSeq() : startSeq(); return; }
    const fn = keyMap[e.key];
    if (fn) { e.preventDefault(); fn(); }
  });

  // any first click anywhere unlocks audio
  document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') ctx.resume(); }, { passive: true });
})();
