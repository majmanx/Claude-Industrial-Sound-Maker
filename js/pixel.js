/* ============================================================
   PixelMachine — a 208×117 pixel-art factory floor.
   Everything is drawn at logical resolution and scaled up with
   image-rendering: pixelated. Each instrument has a physical
   counterpart in the scene that reacts when it is played, and
   clicking a part plays it.
   ============================================================ */
class PixelMachine {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.W = canvas.width; this.H = canvas.height;
    this.FLOOR = 90;
    this.parts = [];
    this.t = 0;
    this.last = performance.now();
    this.shake = 0;
    this.flash = {};
    this.pressure = 0.25;
    this.gearAngle = 0; this.gearSpeed = 0; this.gearVel = 0;
    this.rotationOn = false;
    this.droneOn = false; this.droneLevel = 0;
    this.chipOn = false;
    this.beltOn = false; this.beltSpeed = 1; this.beltVel = 0; this.beltOffset = 0;
    this.pistonPhase = 0;
    this.pressT = -1;
    this.bellSwing = 0; this.bellVel = 0;
    this.cowSwing = 0; this.cowVel = 0;
    this.cymTilt = 0; this.cymVel = 0;
    this.chainSwing = 0; this.chainVel = 0; this.chainJitter = 0;
    this.sheetWob = 0; this.sheetVel = 0;
    this.drumTilt = 0; this.drumVel = 0;
    this.stoneJump = 0;
    this.ventOpen = 0;
    this.whistleT = 0; this.whistleTimer = 0;
    this.weldT = 0;
    this.idleTimer = 2;
    this.spawnQueue = [];
    this.onHit = null;
    this.hitZones = [
      { id: 'steam',    x: 106, y: 24, w: 20, h: 26 },
      { id: 'whistle',  x: 62,  y: 34, w: 10, h: 14 },
      { id: 'bell',     x: 24,  y: 24, w: 14, h: 20 },
      { id: 'cowbell',  x: 40,  y: 24, w: 12, h: 20 },
      { id: 'cymbal',   x: 52,  y: 24, w: 15, h: 20 },
      { id: 'chain',    x: 70,  y: 5,  w: 14, h: 41 },
      { id: 'welder',   x: 140, y: 5,  w: 12, h: 33 },
      { id: 'sheet',    x: 152, y: 6,  w: 30, h: 30 },
      { id: 'pipe',     x: 128, y: 36, w: 80, h: 12 },
      { id: 'anvil',    x: 0,   y: 74, w: 20, h: 18 },
      { id: 'stone',    x: 20,  y: 76, w: 16, h: 16 },
      { id: 'bolts',    x: 34,  y: 52, w: 24, h: 8 },
      { id: 'press',    x: 36,  y: 58, w: 20, h: 34 },
      { id: 'drone',    x: 92,  y: 60, w: 8,  h: 7 },
      { id: 'impact',   x: 60,  y: 46, w: 70, h: 46 },
      { id: 'rotation', x: 130, y: 56, w: 50, h: 40 },
      { id: 'drum',     x: 184, y: 64, w: 20, h: 28 },
      { id: 'conveyor', x: 0,   y: 94, w: 208, h: 18 },
    ];
    canvas.addEventListener('pointerdown', e => this._click(e));
    this._fitToInteger();
    requestAnimationFrame(now => this._frame(now));
  }

  /* snap the CSS size to an integer multiple of the logical size so pixels stay square */
  _fitToInteger() {
    const parent = this.cv.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      const avail = parent.clientWidth - 6;
      if (avail <= 0) return;
      const scale = Math.max(1, Math.floor(avail / this.W));
      let w = scale * this.W;
      // on narrow screens an integer fit wastes too much width; fill instead
      if (w > avail || w < avail * 0.75) w = avail;
      this.cv.style.width = w + 'px';
      this.cv.style.height = 'auto';
    };
    new ResizeObserver(apply).observe(parent);
    apply();
  }

  /* ---------- public triggers ---------- */
  trigger(id, strength = 1) {
    switch (id) {
      case 'steam':   this.vent(strength); break;
      case 'impact':  this.shake = Math.max(this.shake, 0.22); this.flash.panel = 0.12;
                      this.sparks(94, 49, 14); this.pressure = Math.min(1, this.pressure + 0.25); break;
      case 'pipe':    this.flash.pipe = 0.15; this.sparks(160, 41, 6); break;
      case 'stone':   this.stoneJump = 1; this.dust(29, 90, 8); break;
      case 'bell':    this.bellVel += 9; break;
      case 'cowbell': this.cowVel += 8; break;
      case 'cymbal':  this.cymVel += 12; this.flash.cym = 0.2; break;
      case 'anvil':   this.flash.anvil = 0.1; this.sparks(10, 79, 12); this.shake = Math.max(this.shake, 0.05); break;
      case 'chain':   this.chainVel += 7; this.chainJitter = 0.6; break;
      case 'press':   this.pressT = 0; break;
      case 'drum':    this.drumVel += 9; this.flash.drum = 0.15; this.dust(194, 90, 4); break;
      case 'sheet':   this.sheetVel += 11; this.flash.sheet = 0.1; break;
      case 'whistle': this.whistleT = 1.1; this.pressure = Math.max(0.05, this.pressure - 0.15); break;
      case 'welder':  this.weldT = 0.7; break;
      case 'bolts': {
        const n = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.spawnQueue.push({ at: this.t + i * 0.06, kind: 'bolt' });
        break;
      }
    }
    this.pressure = Math.min(1, this.pressure + 0.04);
  }
  setRotation(on, speed = 1) { this.rotationOn = on; this.gearSpeed = on ? speed * 2.6 : 0; }
  setDrone(on) { this.droneOn = on; }
  setChip(on) { this.chipOn = on; }
  setConveyor(on, speed = 1) { this.beltOn = on; this.beltSpeed = on ? speed : 0; }
  vent(strength = 1) {
    this.ventOpen = 1;
    this.pressure = Math.max(0.05, this.pressure - 0.35 * strength);
    const n = Math.round(14 * strength);
    for (let i = 0; i < n; i++) this.spawnQueue.push({ at: this.t + i * 0.025, kind: 'steam', big: true });
    this.sparks(116, 30, 2, true);
  }

  /* ---------- particles ---------- */
  puff(big, x = 116, y = 29, scale = 1) {
    const spread = big ? 1.2 : 0.4;
    this.parts.push({
      type: 'steam',
      x: x + (Math.random() * 4 - 2), y,
      vx: ((Math.random() - 0.5) * spread * 18 + (big ? 10 : 4)) * scale,
      vy: (-(big ? 13 : 7) - Math.random() * 7) * scale,
      life: 0, max: (big ? 1.5 + Math.random() * 0.9 : 1.8 + Math.random() * 0.7) * (0.6 + 0.4 * scale),
      grow: (big ? 7 : 4) * scale,
    });
  }
  sparks(x, y, n, white = false, down = false) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type: 'spark', white, x, y,
        vx: (Math.random() - 0.5) * 70,
        vy: down ? Math.random() * 40 + 10 : -Math.random() * 60 - 10,
        life: 0, max: 0.35 + Math.random() * 0.4,
      });
    }
  }
  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type: 'dust', x: x + (Math.random() - 0.5) * 10, y,
        vx: (Math.random() - 0.5) * 30, vy: -Math.random() * 25 - 5,
        life: 0, max: 0.4 + Math.random() * 0.4,
      });
    }
  }
  bolt() {
    this.parts.push({
      type: 'bolt', x: 40 + Math.random() * 12, y: 55,
      vx: -20 - Math.random() * 30, vy: -10 - Math.random() * 10,
      bounces: 0, life: 0, max: 2.2,
    });
  }

  /* ---------- interaction ---------- */
  _click(e) {
    const r = this.cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * this.W;
    const y = (e.clientY - r.top) / r.height * this.H;
    for (const z of this.hitZones) {
      if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) {
        if (this.onHit) this.onHit(z.id);
        return;
      }
    }
  }

  /* ---------- loop ---------- */
  _frame(now) {
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.t += dt;
    this._update(dt);
    this._draw();
    requestAnimationFrame(n => this._frame(n));
  }
  _update(dt) {
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.t) {
      const s = this.spawnQueue.shift();
      if (s.kind === 'bolt') this.bolt();
      else this.puff(s.big);
    }
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.puff(false);
      if (Math.random() < 0.4) this.spawnQueue.push({ at: this.t + 0.15, kind: 'steam', big: false });
      this.idleTimer = 2.5 + Math.random() * 3;
      if (this.rotationOn || this.droneOn || this.beltOn) this.idleTimer *= 0.5;
    }
    // whistle steam
    if (this.whistleT > 0) {
      this.whistleT -= dt;
      this.whistleTimer -= dt;
      if (this.whistleTimer <= 0) { this.puff(false, 67, 37, 0.7); this.whistleTimer = 0.07; }
    }
    // welding sparks
    if (this.weldT > 0) {
      this.weldT -= dt;
      if (Math.random() < 0.8) this.sparks(145, 38, 2, false, true);
      if (Math.random() < 0.3) this.sparks(145, 38, 1, true, true);
    }
    // press timeline
    if (this.pressT >= 0) {
      const prev = this.pressT;
      this.pressT += dt;
      if (prev < 0.26 && this.pressT >= 0.26) {
        this.shake = Math.max(this.shake, 0.2);
        this.flash.press = 0.12;
        this.dust(46, 88, 10);
        this.sparks(46, 86, 5);
        this.pressure = Math.min(1, this.pressure + 0.2);
      }
      if (this.pressT > 1.1) this.pressT = -1;
    }
    // particles
    for (const p of this.parts) {
      p.life += dt;
      if (p.type === 'steam') {
        p.vy += 4 * dt;
        p.vx *= (1 - 0.9 * dt); p.vy *= (1 - 0.7 * dt);
        p.x += p.vx * dt + 3 * dt + Math.sin(this.t * 3 + p.y) * 4 * dt;
        p.y += p.vy * dt;
      } else if (p.type === 'bolt') {
        p.vy += 220 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y >= this.FLOOR - 1 && p.vy > 0) {
          p.y = this.FLOOR - 1; p.vy *= -0.5; p.vx *= 0.6; p.bounces++;
          if (Math.abs(p.vy) < 12) p.vy = 0;
        }
        if (p.x < 1) { p.x = 1; p.vx = Math.abs(p.vx) * 0.5; }
      } else {
        p.vy += (p.type === 'spark' ? 160 : 90) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > this.FLOOR + 1 && p.type === 'dust') { p.y = this.FLOOR + 1; p.vy = 0; p.vx *= 0.5; }
        if (p.y > this.FLOOR + 3 && p.type === 'spark') { p.y = this.FLOOR + 3; p.vy *= -0.4; }
      }
    }
    this.parts = this.parts.filter(p => p.life < p.max && p.y > -10);
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);

    // mechanics
    this.shake = Math.max(0, this.shake - dt);
    for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt);
    this.pressure += ((this.rotationOn ? 0.55 : 0.25) - this.pressure) * dt * 0.6;
    this.gearVel += (this.gearSpeed - this.gearVel) * dt * 1.5;
    this.gearAngle += this.gearVel * dt;
    this.pistonPhase += this.gearVel * dt;
    this.beltVel += (this.beltSpeed - this.beltVel) * dt * 2;
    this.beltOffset = (this.beltOffset + this.beltVel * 18 * dt) % 1000;
    this.droneLevel += ((this.droneOn ? 1 : 0) - this.droneLevel) * dt * 2;
    this.ventOpen = Math.max(0, this.ventOpen - dt * 1.2);
    this.stoneJump = Math.max(0, this.stoneJump - dt * 5);
    this.chainJitter = Math.max(0, this.chainJitter - dt * 1.5);
    const pend = (a, v, k, damp) => { v -= a * k * dt; v *= (1 - damp * dt); return [a + v * dt, v]; };
    [this.bellSwing, this.bellVel] = pend(this.bellSwing, this.bellVel, 60, 1.6);
    [this.cowSwing, this.cowVel] = pend(this.cowSwing, this.cowVel, 80, 2.2);
    [this.cymTilt, this.cymVel] = pend(this.cymTilt, this.cymVel, 140, 3.5);
    [this.chainSwing, this.chainVel] = pend(this.chainSwing, this.chainVel, 30, 1.2);
    [this.sheetWob, this.sheetVel] = pend(this.sheetWob, this.sheetVel, 200, 4);
    [this.drumTilt, this.drumVel] = pend(this.drumTilt, this.drumVel, 120, 5);
  }

  /* ---------- drawing ---------- */
  _draw() {
    const g = this.g, W = this.W, H = this.H;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#171a21'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d212a';
    for (let y = 6; y < this.FLOOR; y += 6) {
      for (let x = ((y / 6) % 2) * 6; x < W; x += 12) g.fillRect(x, y, 11, 5);
    }
    // window
    g.fillStyle = '#232a36'; g.fillRect(182, 14, 22, 14);
    g.fillStyle = '#2c3545'; g.fillRect(184, 16, 18, 10);
    g.fillStyle = '#1d212a'; g.fillRect(192, 14, 2, 14); g.fillRect(182, 21, 22, 1);
    // welding light on the wall
    if (this.weldT > 0 && Math.random() < 0.7) {
      g.fillStyle = 'rgba(160,200,255,0.10)'; g.fillRect(120, 5, 70, 60);
    }

    let ox = 0, oy = 0;
    if (this.shake > 0) { ox = Math.round((Math.random() - 0.5) * 3); oy = Math.round((Math.random() - 0.5) * 3); }
    const vib = this.droneLevel > 0.3 ? Math.round(Math.sin(this.t * 40) * 0.6 * this.droneLevel) : 0;
    g.translate(ox, oy);

    // ceiling beam
    g.fillStyle = '#3a3f49'; g.fillRect(-4, 0, W + 8, 5);
    g.fillStyle = '#4c5159'; g.fillRect(-4, 1, W + 8, 1);
    g.fillStyle = '#2a2e36'; for (let x = 2; x < W; x += 10) g.fillRect(x, 2, 2, 2);

    // floor
    g.fillStyle = '#2a2e36'; g.fillRect(-4, this.FLOOR, W + 8, H);
    g.fillStyle = '#3a3f49'; g.fillRect(-4, this.FLOOR, W + 8, 1);
    g.fillStyle = '#20242b';
    for (let x = 0; x < W; x += 16) g.fillRect(x + 4, this.FLOOR + 6, 8, 1);
    g.fillStyle = '#23272f'; g.fillRect(-4, 111, W + 8, 1);

    this._drawRail(g);
    this._drawChain(g);
    this._drawSheet(g);
    this._drawWelder(g);
    this._drawPress(g, vib);
    this._drawMachine(g, vib);
    this._drawWhistle(g);
    this._drawVent(g);
    this._drawPipe(g);
    this._drawGears(g);
    this._drawAnvil(g);
    this._drawStone(g);
    this._drawDrum(g);
    this._drawConveyor(g);
    this._drawParticles(g);
    if (this.weldT > 0) {
      g.fillStyle = Math.random() < 0.6 ? '#ffffff' : '#9fd0ff';
      g.fillRect(144, 37, 3, 2); g.fillRect(145, 36, 1, 4);
    }
    g.restore();
  }

  _drawRail(g) {
    g.fillStyle = '#4c5159'; g.fillRect(20, 23, 47, 2); g.fillRect(20, 23, 2, 8); g.fillRect(65, 23, 2, 8);
    g.fillStyle = '#3a3f49'; g.fillRect(20, 5, 2, 18); g.fillRect(65, 5, 2, 18);
    // bell
    const bx = 31, by = 26, sw = Math.round(this.bellSwing * 1.5);
    g.fillStyle = '#6b6f78'; g.fillRect(bx, 25, 1, 3);
    g.fillStyle = '#c9a23a';
    g.fillRect(bx - 1 + sw, by + 2, 3, 2); g.fillRect(bx - 2 + sw, by + 4, 5, 3); g.fillRect(bx - 3 + sw, by + 7, 7, 3);
    g.fillStyle = '#8f7020'; g.fillRect(bx - 3 + sw, by + 10, 7, 1);
    g.fillStyle = '#f0d070'; g.fillRect(bx - 1 + sw, by + 4, 1, 4);
    g.fillStyle = '#333'; g.fillRect(bx + Math.round(this.bellSwing * 3), by + 11, 1, 1);
    // cowbell
    const cx = 46, cy = 26, cs = Math.round(this.cowSwing * 1.5);
    g.fillStyle = '#6b6f78'; g.fillRect(cx, 25, 1, 2);
    g.fillStyle = '#5f6670';
    g.fillRect(cx - 1 + cs, cy + 1, 3, 2); g.fillRect(cx - 2 + cs, cy + 3, 5, 4); g.fillRect(cx - 3 + cs, cy + 7, 7, 4);
    g.fillStyle = '#8a929c'; g.fillRect(cx - 1 + cs, cy + 3, 1, 7);
    g.fillStyle = '#2d3138'; g.fillRect(cx - 3 + cs, cy + 11, 7, 1);
    // cymbal
    const mx = 59, my = 30;
    g.fillStyle = '#6b6f78'; g.fillRect(mx, 25, 1, 5);
    const tilt = this.cymTilt, bright = this.flash.cym > 0;
    g.fillStyle = bright ? '#ffe9a0' : '#d2a83c';
    for (let i = -5; i <= 5; i++) {
      const yy = my + Math.round(tilt * i * 0.25);
      g.fillRect(mx + i, yy, 1, 1);
      if (Math.abs(i) < 3) g.fillRect(mx + i, yy + 1, 1, 1);
    }
    g.fillStyle = bright ? '#fff8d0' : '#f0cc6a'; g.fillRect(mx, my, 1, 1);
  }

  _drawChain(g) {
    const x0 = 76;
    const links = 17;
    for (let i = 0; i < links; i++) {
      const depth = i / links;
      const dx = Math.round(this.chainSwing * depth * 2.2 + (this.chainJitter > 0 ? (Math.random() - 0.5) * this.chainJitter * 2 : 0));
      const y = 5 + i * 2;
      g.fillStyle = i % 2 ? '#7a828e' : '#4c5159';
      if (i % 2) g.fillRect(x0 + dx, y, 2, 2); else g.fillRect(x0 - 1 + dx, y, 4, 2);
    }
    const dx = Math.round(this.chainSwing * 2.2);
    g.fillStyle = '#8a929c'; g.fillRect(x0 - 1 + dx, 39, 4, 1); g.fillRect(x0 - 2 + dx, 40, 2, 3); g.fillRect(x0 - 1 + dx, 43, 3, 1);
  }

  _drawSheet(g) {
    g.fillStyle = '#3a3f49'; g.fillRect(158, 5, 1, 6); g.fillRect(176, 5, 1, 6);
    const lit = this.flash.sheet > 0;
    for (let row = 0; row < 24; row++) {
      const dx = Math.round(Math.sin(row * 0.6 + this.t * 30) * this.sheetWob * 0.4);
      g.fillStyle = lit ? '#b8c2cf' : (row % 6 === 0 ? '#5e6570' : '#6a717c');
      g.fillRect(154 + dx, 10 + row, 26, 1);
      if (row === 0 || row === 23) { g.fillStyle = lit ? '#e0e8f0' : '#8a929c'; g.fillRect(154 + dx, 10 + row, 26, 1); }
    }
    g.fillStyle = '#2f333a';
    [[157, 13], [177, 13], [157, 30], [177, 30]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  }

  _drawWelder(g) {
    g.fillStyle = '#4c5159'; g.fillRect(146, 5, 3, 23);
    g.fillStyle = '#6a717c'; g.fillRect(146, 5, 1, 23);
    g.fillStyle = '#3a3f49'; g.fillRect(144, 28, 7, 4);
    g.fillStyle = '#a03030'; g.fillRect(146, 29, 3, 2);
    g.fillStyle = '#5e6570'; g.fillRect(145, 32, 2, 5);
    g.fillStyle = '#b08040'; g.fillRect(145, 36, 1, 2);
  }

  _drawPress(g, vib) {
    // housing
    g.fillStyle = '#3f444d'; g.fillRect(38, 58 + vib, 16, 32);
    g.fillStyle = '#585e68'; g.fillRect(38, 58 + vib, 16, 2); g.fillRect(38, 58 + vib, 2, 32); g.fillRect(52, 58 + vib, 2, 32);
    g.fillStyle = '#20242a'; g.fillRect(41, 62 + vib, 10, 26);
    // hydraulic cylinder on top + bolt tray
    g.fillStyle = '#4c5159'; g.fillRect(43, 52, 6, 6);
    g.fillStyle = '#6a717c'; g.fillRect(43, 52, 6, 1);
    g.fillStyle = '#2f333a'; g.fillRect(36, 55, 7, 3); g.fillRect(49, 55, 7, 3);
    g.fillStyle = '#8a929c'; g.fillRect(37, 55, 2, 1); g.fillRect(40, 55, 2, 1); g.fillRect(51, 55, 2, 1); g.fillRect(54, 55, 1, 1);
    // piston head position
    let ph = 66 + Math.round((Math.sin(this.pistonPhase) + 1) * 6);
    if (this.pressT >= 0) {
      const p = this.pressT;
      if (p < 0.26) ph = 63 - Math.round(p * 8);
      else if (p < 0.3) ph = 63 + Math.round((p - 0.26) / 0.04 * 21);
      else if (p < 0.6) ph = 84;
      else ph = 84 - Math.round((p - 0.6) / 0.5 * 18);
    }
    g.fillStyle = this.flash.press > 0 ? '#e8ecf2' : '#8a929c'; g.fillRect(41, ph, 10, 4);
    g.fillStyle = '#c4ccd6'; g.fillRect(41, ph, 10, 1);
    g.fillStyle = '#6b737d'; g.fillRect(45, 62 + vib, 2, Math.max(0, ph - 62 - vib));
    // die plate at the bottom
    g.fillStyle = '#5e6570'; g.fillRect(41, 86, 10, 2);
    // connector pipe to machine
    g.fillStyle = '#4c5159'; g.fillRect(54, 68 + vib, 6, 4);
    g.fillStyle = '#626873'; g.fillRect(54, 68 + vib, 6, 1);
    g.fillStyle = '#8a9098';
    [[39, 59], [52, 59], [39, 88], [52, 88]].forEach(([x, y]) => g.fillRect(x, y + vib, 1, 1));
  }

  _drawMachine(g, vib) {
    const y0 = 48 + vib;
    g.fillStyle = '#545a63'; g.fillRect(60, y0, 68, 42);
    g.fillStyle = '#727a85'; g.fillRect(60, y0, 68, 2);
    g.fillStyle = '#3b4048'; g.fillRect(60, y0 + 40, 68, 2); g.fillRect(126, y0, 2, 42);
    g.fillStyle = this.flash.panel > 0 ? '#5e6570' : '#3d424a';
    g.fillRect(66, y0 + 10, 56, 26);
    g.fillStyle = '#2a2e35'; g.fillRect(66, y0 + 10, 56, 1); g.fillRect(66, y0 + 10, 1, 26);
    g.fillStyle = '#8f96a0';
    for (let x = 62; x < 128; x += 8) { g.fillRect(x, y0 + 4, 1, 1); g.fillRect(x, y0 + 38, 1, 1); }
    for (let y = y0 + 4; y < y0 + 40; y += 8) { g.fillRect(62, y, 1, 1); g.fillRect(124, y, 1, 1); }
    // gauge
    const gx = 78, gy = y0 + 22;
    g.fillStyle = '#20242a'; g.fillRect(gx - 8, gy - 8, 17, 17);
    g.fillStyle = '#d9d2b4'; g.fillRect(gx - 7, gy - 7, 15, 15);
    g.fillStyle = '#c33'; g.fillRect(gx + 3, gy - 6, 4, 2); g.fillRect(gx + 5, gy - 4, 2, 3);
    g.fillStyle = '#444';
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.85 + i * Math.PI * 0.425;
      g.fillRect(gx + Math.round(Math.cos(a) * 5.5), gy + Math.round(Math.sin(a) * 5.5), 1, 1);
    }
    const na = -Math.PI * 0.85 + this.pressure * Math.PI * 1.7 + (this.shake > 0 ? (Math.random() - 0.5) * 0.4 : 0);
    g.fillStyle = '#a02020';
    for (let r = 0; r < 6; r++) g.fillRect(gx + Math.round(Math.cos(na) * r), gy + Math.round(Math.sin(na) * r), 1, 1);
    g.fillStyle = '#222'; g.fillRect(gx, gy, 1, 1);
    // lamps
    const lamp = this.droneLevel * (0.6 + 0.4 * Math.sin(this.t * 2.4));
    g.fillStyle = '#20242a'; g.fillRect(93, y0 + 13, 5, 5);
    g.fillStyle = lamp > 0.3 ? (lamp > 0.7 ? '#ff5a2e' : '#c8381a') : '#4a1c12';
    g.fillRect(94, y0 + 14, 3, 3);
    if (lamp > 0.7) { g.fillStyle = '#ffb090'; g.fillRect(95, y0 + 15, 1, 1); }
    g.fillStyle = '#20242a'; g.fillRect(101, y0 + 13, 5, 5);
    g.fillStyle = this.rotationOn ? (Math.sin(this.t * 6) > 0 ? '#5cff7a' : '#2fa04a') : '#123818';
    g.fillRect(102, y0 + 14, 3, 3);
    ['#c9a23a', '#3a7bd5', '#c9a23a', '#a03030'].forEach((c, i) => {
      g.fillStyle = '#20242a'; g.fillRect(94 + i * 6, y0 + 24, 4, 4);
      g.fillStyle = c; g.fillRect(95 + i * 6, y0 + 25, 2, 2);
    });
    g.fillStyle = '#20242a'; g.fillRect(109, y0 + 13, 5, 5);
    g.fillStyle = this.chipOn ? (Math.floor(this.t * 4) % 2 ? '#ff5af0' : '#a030a0') : '#3a1a3a';
    g.fillRect(110, y0 + 14, 3, 3);
    g.fillStyle = '#2a2e35';
    for (let i = 0; i < 4; i++) g.fillRect(116, y0 + 14 + i * 3, 6, 1);
    g.fillStyle = '#8b8f96'; g.fillRect(70, y0 + 33, 20, 2);
    g.fillStyle = '#c9a23a'; g.fillRect(70, y0 + 33, 4, 2); g.fillRect(78, y0 + 33, 4, 2); g.fillRect(86, y0 + 33, 4, 2);
  }

  _drawWhistle(g) {
    const hot = this.whistleT > 0;
    g.fillStyle = '#8f7020'; g.fillRect(65, 40, 5, 8);
    g.fillStyle = hot ? '#ffe090' : '#c9a23a'; g.fillRect(65, 40, 2, 8);
    g.fillStyle = '#6b5418'; g.fillRect(64, 38, 7, 2);
    g.fillStyle = hot ? '#fff4c0' : '#e0c060'; g.fillRect(64, 38, 7, 1);
    g.fillStyle = '#4c5159'; g.fillRect(66, 36, 3, 2);
  }

  _drawVent(g) {
    g.fillStyle = '#4a4f58'; g.fillRect(112, 32, 8, 17);
    g.fillStyle = '#6a717c'; g.fillRect(112, 32, 2, 17);
    g.fillStyle = '#33373e'; g.fillRect(118, 32, 2, 17);
    g.fillStyle = '#5e6570'; g.fillRect(111, 36, 10, 2); g.fillRect(111, 44, 10, 2);
    g.fillStyle = '#5e6570'; g.fillRect(110, 29, 12, 3);
    g.fillStyle = '#7a828e'; g.fillRect(110, 29, 12, 1);
    const open = Math.round(this.ventOpen * 3);
    g.fillStyle = '#8a929c'; g.fillRect(112, 28 - open, 8, 1);
    if (open > 0) { g.fillStyle = '#5e6570'; g.fillRect(112, 28 - open, 1, open); g.fillRect(119, 28 - open, 1, open); }
    if (this.pressure > 0.7) {
      g.fillStyle = this.pressure > 0.9 ? '#ff7a3a' : '#a04a2a';
      g.fillRect(114, 28 - open, 4, 1);
    }
  }

  _drawPipe(g) {
    const lit = this.flash.pipe > 0;
    g.fillStyle = lit ? '#8f9aa8' : '#4c5159'; g.fillRect(128, 39, 84, 6);
    g.fillStyle = lit ? '#c8d2de' : '#6a717c'; g.fillRect(128, 39, 84, 1);
    g.fillStyle = lit ? '#5b6573' : '#2f333a'; g.fillRect(128, 44, 84, 1);
    g.fillStyle = lit ? '#b0bac6' : '#5e6570';
    [128, 144, 166, 190].forEach(x => g.fillRect(x, 38, 3, 8));
    g.fillStyle = '#4c5159'; g.fillRect(128, 39, 4, 10);
    g.fillStyle = '#a03030'; g.fillRect(155, 35, 5, 1); g.fillRect(157, 33, 1, 5); g.fillRect(156, 34, 3, 3);
    g.fillStyle = '#5e6570'; g.fillRect(157, 36, 1, 3);
  }

  _drawGears(g) {
    g.fillStyle = '#3b4048'; g.fillRect(132, 84, 6, 6); g.fillRect(132, 62, 4, 28);
    g.fillStyle = '#2a2521'; g.fillRect(128, 65, 12, 1); g.fillRect(128, 87, 12, 1);
    this._gear(g, 150, 76, 11, 8, this.gearAngle, '#7a6a4c', '#5a4c34');
    this._gear(g, 167, 89, 6, 6, -this.gearAngle * (11 / 6) + 0.3, '#6e6350', '#4c4436');
    g.fillStyle = '#9a8a60'; g.fillRect(150, 76, 1, 1); g.fillRect(167, 89, 1, 1);
  }
  _gear(g, cx, cy, r, teeth, angle, col, dark) {
    g.fillStyle = col;
    g.beginPath(); g.arc(cx + 0.5, cy + 0.5, r - 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark;
    for (let i = 0; i < teeth; i++) {
      const a = angle + (i / teeth) * Math.PI * 2;
      g.fillRect(Math.round(cx + Math.cos(a) * (r - 1)) - 1, Math.round(cy + Math.sin(a) * (r - 1)) - 1, 3, 3);
    }
    g.beginPath(); g.arc(cx + 0.5, cy + 0.5, Math.max(1.5, r * 0.35), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a3128';
    for (let i = 0; i < 4; i++) {
      const a = angle + (i / 4) * Math.PI * 2;
      for (let rr = 2; rr < r - 3; rr++) g.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1);
    }
  }

  _drawAnvil(g) {
    const lit = this.flash.anvil > 0;
    g.fillStyle = lit ? '#e6ecf4' : '#5e6570';
    g.fillRect(2, 79, 16, 3); g.fillRect(0, 80, 3, 2);
    g.fillStyle = lit ? '#ffffff' : '#8a929c'; g.fillRect(2, 79, 16, 1);
    g.fillStyle = '#4c5159'; g.fillRect(6, 82, 8, 5);
    g.fillStyle = '#3b4048'; g.fillRect(4, 87, 12, 3);
    g.fillStyle = '#5a4838'; g.fillRect(3, 89, 14, 1);
  }

  _drawStone(g) {
    const j = Math.round(this.stoneJump * 2);
    g.fillStyle = '#6f7368'; g.fillRect(24, 84 - j, 10, 6); g.fillRect(26, 82 - j, 6, 2);
    g.fillStyle = '#8d9184'; g.fillRect(26, 82 - j, 4, 1); g.fillRect(25, 84 - j, 2, 1);
    g.fillStyle = '#4e514a'; g.fillRect(24, 88 - j, 10, 2); g.fillRect(30, 85 - j, 3, 1);
    g.fillStyle = '#6b4a2a'; g.fillRect(35, 76, 1, 14);
    g.fillStyle = '#7d848f'; g.fillRect(33, 74, 5, 3);
  }

  _drawDrum(g) {
    const tilt = Math.round(this.drumTilt * 1.2);
    const lit = this.flash.drum > 0;
    const x = 186, y = 68;
    for (let row = 0; row < 22; row++) {
      const dx = Math.round(tilt * (1 - row / 22));
      const rib = row === 6 || row === 15;
      g.fillStyle = rib ? '#3f444d' : (lit && row < 10 ? '#b56a3a' : '#8a4a2a');
      g.fillRect(x + dx, y + row, 16, 1);
      g.fillStyle = rib ? '#5e6570' : (lit && row < 10 ? '#d08a55' : '#a85e38');
      g.fillRect(x + 2 + dx, y + row, 3, 1);
      g.fillStyle = '#5a2e18'; g.fillRect(x + 13 + dx, y + row, 3, 1);
    }
    g.fillStyle = '#5e6570'; g.fillRect(x + tilt, y, 16, 2);
    g.fillStyle = '#8a929c'; g.fillRect(x + tilt, y, 16, 1);
    g.fillStyle = '#c9a23a'; g.fillRect(x + 6 + tilt, y + 9, 4, 4);
    g.fillStyle = '#2f333a'; g.fillRect(x + 7 + tilt, y + 10, 2, 2);
  }

  _drawConveyor(g) {
    const y = 98;
    // legs
    g.fillStyle = '#2f333a'; [50, 100, 150, 190].forEach(x => g.fillRect(x, y + 8, 2, 8));
    // belt body
    g.fillStyle = '#1b1d22'; g.fillRect(30, y, 172, 8);
    g.fillStyle = '#3a3128'; g.fillRect(30, y + 1, 172, 1); g.fillRect(30, y + 6, 172, 1);
    // moving tread marks
    g.fillStyle = '#4a4034';
    const off = Math.floor(this.beltOffset) % 8;
    for (let x = 30 + off; x < 200; x += 8) g.fillRect(x, y + 1, 3, 1);
    for (let x = 30 + ((8 - off) % 8); x < 200; x += 8) g.fillRect(x, y + 6, 3, 1);
    // rollers
    [[34, y + 4], [198, y + 4]].forEach(([cx, cy]) => {
      g.fillStyle = '#5e6570'; g.beginPath(); g.arc(cx + 0.5, cy + 0.5, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a929c';
      const a = this.beltOffset * 0.25;
      g.fillRect(Math.round(cx + Math.cos(a) * 2), Math.round(cy + Math.sin(a) * 2), 1, 1);
      g.fillRect(Math.round(cx - Math.cos(a) * 2), Math.round(cy - Math.sin(a) * 2), 1, 1);
    });
    // motor
    g.fillStyle = '#3f444d'; g.fillRect(18, y - 2, 12, 12);
    g.fillStyle = '#585e68'; g.fillRect(18, y - 2, 12, 1);
    g.fillStyle = this.beltOn ? (Math.sin(this.t * 8) > 0 ? '#5cff7a' : '#2fa04a') : '#123818';
    g.fillRect(21, y + 1, 2, 2);
    g.fillStyle = '#2a2e35'; for (let i = 0; i < 3; i++) g.fillRect(20, y + 5 + i * 2, 8, 1);
    // items riding the belt
    const items = [
      { w: 6, h: 5, draw: (x, yy) => { g.fillStyle = '#8a6a3a'; g.fillRect(x, yy, 6, 5); g.fillStyle = '#b08a4a'; g.fillRect(x, yy, 6, 1); g.fillStyle = '#5a4020'; g.fillRect(x + 2, yy + 1, 2, 4); } },
      { w: 6, h: 3, draw: (x, yy) => { g.fillStyle = '#c9a23a'; g.fillRect(x, yy, 6, 3); g.fillStyle = '#f0d070'; g.fillRect(x + 1, yy, 4, 1); } },
      { w: 5, h: 5, draw: (x, yy) => { g.fillStyle = '#7a6a4c'; g.fillRect(x + 1, yy, 3, 5); g.fillRect(x, yy + 1, 5, 3); g.fillStyle = '#3a3128'; g.fillRect(x + 2, yy + 2, 1, 1); } },
      { w: 4, h: 6, draw: (x, yy) => { g.fillStyle = '#8a4a2a'; g.fillRect(x, yy, 4, 6); g.fillStyle = '#a85e38'; g.fillRect(x + 1, yy, 1, 6); g.fillStyle = '#5e6570'; g.fillRect(x, yy, 4, 1); } },
      { w: 7, h: 3, draw: (x, yy) => { g.fillStyle = '#6a717c'; g.fillRect(x, yy, 7, 3); g.fillStyle = '#8a929c'; g.fillRect(x, yy, 7, 1); g.fillStyle = '#2f333a'; g.fillRect(x + 1, yy + 1, 1, 1); g.fillRect(x + 5, yy + 1, 1, 1); } },
    ];
    const span = 160, gap = 36;
    for (let i = 0; i < 5; i++) {
      const it = items[i];
      const px = 36 + ((i * gap + this.beltOffset) % span);
      if (px + it.w > 200) continue;
      it.draw(Math.round(px), y - it.h);
    }
  }

  _drawParticles(g) {
    const steamPal = ['#ffffff', '#e4e8ee', '#c1c7d1', '#98a0ab', '#6d747f'];
    for (const p of this.parts) {
      const a = p.life / p.max;
      if (p.type === 'steam') {
        const s = Math.max(1, Math.round(1 + a * p.grow));
        g.fillStyle = steamPal[Math.min(steamPal.length - 1, Math.floor(a * steamPal.length))];
        const x0 = Math.round(p.x - s / 2), y0 = Math.round(p.y - s / 2);
        const dither = a > 0.55;
        for (let yy = 0; yy < s; yy++) {
          for (let xx = 0; xx < s; xx++) {
            const dx = xx - (s - 1) / 2, dy = yy - (s - 1) / 2;
            if (dx * dx + dy * dy > (s / 2) * (s / 2) + 0.5) continue;
            if (dither && ((xx + yy + Math.floor(p.y)) & 1)) continue;
            g.fillRect(x0 + xx, y0 + yy, 1, 1);
          }
        }
      } else if (p.type === 'spark') {
        g.fillStyle = p.white ? (a < 0.5 ? '#fff' : '#bcd') : (a < 0.3 ? '#fff4c0' : a < 0.7 ? '#ffb030' : '#c04a10');
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else if (p.type === 'bolt') {
        if (a > 0.75 && Math.floor(this.t * 12) % 2) continue;   // blink out
        g.fillStyle = '#9aa2ac'; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
        g.fillStyle = '#5e6570'; g.fillRect(Math.round(p.x), Math.round(p.y) + 1, 1, 1);
      } else {
        g.fillStyle = a < 0.5 ? '#9a9a90' : '#5f6058';
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
  }
}
