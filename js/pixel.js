/* ============================================================
   PixelMachine — a 160×90 pixel-art factory scene.
   Steam puffs from the vent, gears turn, sparks fly, the
   gauge jumps. Everything is drawn at logical resolution and
   scaled up with image-rendering: pixelated.
   ============================================================ */
class PixelMachine {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.W = canvas.width; this.H = canvas.height;
    this.parts = [];
    this.t = 0;
    this.last = performance.now();
    this.shake = 0;
    this.flash = {};          // id -> remaining seconds
    this.pressure = 0.25;     // gauge 0..1
    this.gearAngle = 0;
    this.gearSpeed = 0;       // rad/s target
    this.gearVel = 0;
    this.rotationOn = false;
    this.droneOn = false;
    this.droneLevel = 0;
    this.pistonPhase = 0;
    this.bellSwing = 0; this.bellVel = 0;
    this.cowSwing = 0; this.cowVel = 0;
    this.cymTilt = 0; this.cymVel = 0;
    this.stoneJump = 0;
    this.ventOpen = 0;
    this.idleTimer = 2;
    this.spawnQueue = [];
    this.onHit = null;        // callback(id) when the user clicks a machine part
    this.hitZones = [
      { id: 'steam',   x: 88, y: 2,  w: 26, h: 30 },
      { id: 'bell',    x: 8,  y: 6,  w: 14, h: 18 },
      { id: 'cowbell', x: 24, y: 6,  w: 12, h: 18 },
      { id: 'cymbal',  x: 36, y: 6,  w: 14, h: 18 },
      { id: 'stone',   x: 4,  y: 60, w: 18, h: 16 },
      { id: 'rotation',x: 118,y: 40, w: 42, h: 40 },
      { id: 'pipe',    x: 112,y: 18, w: 48, h: 12 },
      { id: 'impact',  x: 44, y: 30, w: 68, h: 42 },
    ];
    canvas.addEventListener('pointerdown', e => this._click(e));
    requestAnimationFrame(now => this._frame(now));
  }

  /* ---------- public triggers ---------- */
  trigger(id, strength = 1) {
    switch (id) {
      case 'steam':   this.vent(strength); break;
      case 'impact':  this.shake = Math.max(this.shake, 0.22); this.flash.panel = 0.12;
                      this.sparks(78, 31, 14); this.pressure = Math.min(1, this.pressure + 0.25); break;
      case 'pipe':    this.flash.pipe = 0.15; this.sparks(128, 23, 6); break;
      case 'stone':   this.stoneJump = 1; this.dust(13, 72, 8); break;
      case 'bell':    this.bellVel += 9; break;
      case 'cowbell': this.cowVel += 8; break;
      case 'cymbal':  this.cymVel += 12; this.flash.cym = 0.2; break;
      case 'rotation': break;
      case 'drone':   break;
    }
    this.pressure = Math.min(1, this.pressure + 0.05);
  }
  setRotation(on, speed = 1) {
    this.rotationOn = on;
    this.gearSpeed = on ? speed * 2.6 : 0;
  }
  setDrone(on) { this.droneOn = on; }
  vent(strength = 1) {
    this.ventOpen = 1;
    this.pressure = Math.max(0.05, this.pressure - 0.35 * strength);
    const n = Math.round(14 * strength);
    for (let i = 0; i < n; i++) {
      this.spawnQueue.push({ at: this.t + i * 0.025, big: true });
    }
    this.sparks(100, 12, 2, true);
  }

  /* ---------- particles ---------- */
  puff(big) {
    const spread = big ? 1.2 : 0.4;
    this.parts.push({
      type: 'steam',
      x: 100 + (Math.random() * 4 - 2), y: 11,
      vx: (Math.random() - 0.5) * spread * 18 + (big ? 10 : 4),
      vy: -(big ? 13 : 7) - Math.random() * 7,
      life: 0, max: big ? 1.5 + Math.random() * 0.9 : 1.8 + Math.random() * 0.7,
      grow: big ? 7 : 4,
    });
  }
  sparks(x, y, n, white = false) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type: 'spark', white,
        x, y,
        vx: (Math.random() - 0.5) * 70,
        vy: -Math.random() * 60 - 10,
        life: 0, max: 0.35 + Math.random() * 0.4,
      });
    }
  }
  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.parts.push({
        type: 'dust',
        x: x + (Math.random() - 0.5) * 10, y,
        vx: (Math.random() - 0.5) * 30,
        vy: -Math.random() * 25 - 5,
        life: 0, max: 0.4 + Math.random() * 0.4,
      });
    }
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
    // spawn queue
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.t) {
      this.puff(this.spawnQueue.shift().big);
    }
    // idle wisps
    this.idleTimer -= dt;
    if (this.idleTimer <= 0) {
      this.puff(false);
      if (Math.random() < 0.4) this.spawnQueue.push({ at: this.t + 0.15, big: false });
      this.idleTimer = 2.5 + Math.random() * 3;
      if (this.rotationOn || this.droneOn) this.idleTimer *= 0.5;
    }
    // particles
    for (const p of this.parts) {
      p.life += dt;
      if (p.type === 'steam') {
        p.vy += 4 * dt;               // slows its rise
        p.vx *= (1 - 0.9 * dt); p.vy *= (1 - 0.7 * dt);
        p.x += p.vx * dt + 3 * dt + Math.sin(this.t * 3 + p.y) * 4 * dt; // gentle draft to the right
        p.y += p.vy * dt;
      } else {
        p.vy += (p.type === 'spark' ? 160 : 90) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > 73 && p.type === 'dust') { p.y = 73; p.vy = 0; p.vx *= 0.5; }
        if (p.y > 75 && p.type === 'spark') { p.y = 75; p.vy *= -0.4; }
      }
    }
    this.parts = this.parts.filter(p => p.life < p.max && p.y > -10);
    if (this.parts.length > 400) this.parts.splice(0, this.parts.length - 400);

    // mechanics
    this.shake = Math.max(0, this.shake - dt);
    for (const k in this.flash) this.flash[k] = Math.max(0, this.flash[k] - dt);
    this.pressure += ((this.rotationOn ? 0.55 : 0.25) - this.pressure) * dt * 0.6;
    this.gearVel += (this.gearSpeed - this.gearVel) * dt * 1.5;
    this.gearAngle += this.gearVel * dt;
    this.pistonPhase += this.gearVel * dt;
    this.droneLevel += ((this.droneOn ? 1 : 0) - this.droneLevel) * dt * 2;
    this.ventOpen = Math.max(0, this.ventOpen - dt * 1.2);
    this.stoneJump = Math.max(0, this.stoneJump - dt * 5);
    // pendulums
    const pend = (a, v, k, damp) => { v -= a * k * dt; v *= (1 - damp * dt); return [a + v * dt, v]; };
    [this.bellSwing, this.bellVel] = pend(this.bellSwing, this.bellVel, 60, 1.6);
    [this.cowSwing, this.cowVel] = pend(this.cowSwing, this.cowVel, 80, 2.2);
    [this.cymTilt, this.cymVel] = pend(this.cymTilt, this.cymVel, 140, 3.5);
  }

  /* ---------- drawing ---------- */
  _draw() {
    const g = this.g, W = this.W, H = this.H;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    // background wall
    g.fillStyle = '#171a21'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d212a';
    for (let y = 0; y < 72; y += 6) {
      for (let x = ((y / 6) % 2) * 6; x < W; x += 12) g.fillRect(x, y, 11, 5);
    }
    // faint window light
    g.fillStyle = '#232a36'; g.fillRect(126, 4, 22, 10); g.fillStyle = '#2c3545'; g.fillRect(128, 6, 18, 6);
    g.fillStyle = '#1d212a'; g.fillRect(136, 4, 2, 10); g.fillRect(126, 9, 22, 1);

    let ox = 0, oy = 0;
    if (this.shake > 0) { ox = Math.round((Math.random() - 0.5) * 3); oy = Math.round((Math.random() - 0.5) * 3); }
    const vib = this.droneLevel > 0.3 ? Math.round(Math.sin(this.t * 40) * 0.6 * this.droneLevel) : 0;
    g.translate(ox, oy);

    // floor
    g.fillStyle = '#2a2e36'; g.fillRect(-4, 72, W + 8, H);
    g.fillStyle = '#3a3f49'; g.fillRect(-4, 72, W + 8, 1);
    g.fillStyle = '#20242b';
    for (let x = 0; x < W; x += 16) g.fillRect(x + 4, 80, 8, 1);

    this._drawRail(g);
    this._drawPiston(g, vib);
    this._drawMachine(g, vib);
    this._drawVent(g);
    this._drawPipe(g);
    this._drawGears(g);
    this._drawStone(g);
    this._drawParticles(g);
    g.restore();
  }

  _drawRail(g) {
    g.fillStyle = '#4c5159'; g.fillRect(4, 5, 46, 2); g.fillRect(4, 5, 2, 8); g.fillRect(48, 5, 2, 8);
    // bell
    const bx = 15, by = 8;
    const sw = Math.round(this.bellSwing * 1.5);
    g.fillStyle = '#6b6f78'; g.fillRect(bx, 7, 1, 3);
    g.fillStyle = '#c9a23a';
    g.fillRect(bx - 1 + sw, by + 2, 3, 2);
    g.fillRect(bx - 2 + sw, by + 4, 5, 3);
    g.fillRect(bx - 3 + sw, by + 7, 7, 3);
    g.fillStyle = '#8f7020'; g.fillRect(bx - 3 + sw, by + 10, 7, 1);
    g.fillStyle = '#f0d070'; g.fillRect(bx - 1 + sw, by + 4, 1, 4);
    g.fillStyle = '#333'; g.fillRect(bx + Math.round(this.bellSwing * 3), by + 11, 1, 1);
    // cowbell
    const cx = 30, cy = 8;
    const cs = Math.round(this.cowSwing * 1.5);
    g.fillStyle = '#6b6f78'; g.fillRect(cx, 7, 1, 2);
    g.fillStyle = '#5f6670';
    g.fillRect(cx - 1 + cs, cy + 1, 3, 2);
    g.fillRect(cx - 2 + cs, cy + 3, 5, 4);
    g.fillRect(cx - 3 + cs, cy + 7, 7, 4);
    g.fillStyle = '#8a929c'; g.fillRect(cx - 1 + cs, cy + 3, 1, 7);
    g.fillStyle = '#2d3138'; g.fillRect(cx - 3 + cs, cy + 11, 7, 1);
    // cymbal
    const mx = 43, my = 12;
    g.fillStyle = '#6b6f78'; g.fillRect(mx, 7, 1, 5);
    const tilt = this.cymTilt;
    const bright = this.flash.cym > 0;
    g.fillStyle = bright ? '#ffe9a0' : '#d2a83c';
    for (let i = -5; i <= 5; i++) {
      const yy = my + Math.round(tilt * i * 0.25);
      g.fillRect(mx + i, yy, 1, 1);
      if (Math.abs(i) < 3) g.fillRect(mx + i, yy + 1, 1, 1);
    }
    g.fillStyle = bright ? '#fff8d0' : '#f0cc6a'; g.fillRect(mx, my, 1, 1);
  }

  _drawPiston(g, vib) {
    // housing
    g.fillStyle = '#3f444d'; g.fillRect(22, 40 + vib, 16, 32);
    g.fillStyle = '#585e68'; g.fillRect(22, 40 + vib, 16, 2); g.fillRect(22, 40 + vib, 2, 32); g.fillRect(36, 40 + vib, 2, 32);
    g.fillStyle = '#20242a'; g.fillRect(25, 44 + vib, 10, 26);
    // piston head
    const ph = 48 + Math.round((Math.sin(this.pistonPhase) + 1) * 6);
    g.fillStyle = '#8a929c'; g.fillRect(25, ph, 10, 4);
    g.fillStyle = '#c4ccd6'; g.fillRect(25, ph, 10, 1);
    g.fillStyle = '#6b737d'; g.fillRect(29, 44 + vib, 2, ph - 44 - vib);
    // connector pipe to machine
    g.fillStyle = '#4c5159'; g.fillRect(38, 50 + vib, 6, 4);
    g.fillStyle = '#626873'; g.fillRect(38, 50 + vib, 6, 1);
    // rivets
    g.fillStyle = '#8a9098';
    [[23, 41], [36, 41], [23, 70], [36, 70]].forEach(([x, y]) => g.fillRect(x, y + vib, 1, 1));
  }

  _drawMachine(g, vib) {
    const y0 = 30 + vib;
    g.fillStyle = '#545a63'; g.fillRect(44, y0, 68, 42);
    g.fillStyle = '#727a85'; g.fillRect(44, y0, 68, 2);
    g.fillStyle = '#3b4048'; g.fillRect(44, y0 + 40, 68, 2); g.fillRect(110, y0, 2, 42);
    // panel
    g.fillStyle = this.flash.panel > 0 ? '#5e6570' : '#3d424a';
    g.fillRect(50, y0 + 10, 56, 26);
    g.fillStyle = '#2a2e35'; g.fillRect(50, y0 + 10, 56, 1); g.fillRect(50, y0 + 10, 1, 26);
    // rivets
    g.fillStyle = '#8f96a0';
    for (let x = 46; x < 112; x += 8) { g.fillRect(x, y0 + 4, 1, 1); g.fillRect(x, y0 + 38, 1, 1); }
    for (let y = y0 + 4; y < y0 + 40; y += 8) { g.fillRect(46, y, 1, 1); g.fillRect(108, y, 1, 1); }
    // gauge
    const gx = 62, gy = y0 + 22;
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
    // indicator lamp
    const lamp = this.droneLevel * (0.6 + 0.4 * Math.sin(this.t * 2.4));
    g.fillStyle = '#20242a'; g.fillRect(77, y0 + 13, 5, 5);
    g.fillStyle = lamp > 0.3 ? (lamp > 0.7 ? '#ff5a2e' : '#c8381a') : '#4a1c12';
    g.fillRect(78, y0 + 14, 3, 3);
    if (lamp > 0.7) { g.fillStyle = '#ffb090'; g.fillRect(79, y0 + 15, 1, 1); }
    // lamp for rotation
    g.fillStyle = '#20242a'; g.fillRect(85, y0 + 13, 5, 5);
    g.fillStyle = this.rotationOn ? (Math.sin(this.t * 6) > 0 ? '#5cff7a' : '#2fa04a') : '#123818';
    g.fillRect(86, y0 + 14, 3, 3);
    // buttons
    ['#c9a23a', '#3a7bd5', '#c9a23a', '#a03030'].forEach((c, i) => {
      g.fillStyle = '#20242a'; g.fillRect(78 + i * 6, y0 + 24, 4, 4);
      g.fillStyle = c; g.fillRect(79 + i * 6, y0 + 25, 2, 2);
    });
    // vents on panel
    g.fillStyle = '#2a2e35';
    for (let i = 0; i < 4; i++) g.fillRect(96, y0 + 14 + i * 3, 8, 1);
    // label plate
    g.fillStyle = '#8b8f96'; g.fillRect(54, y0 + 33, 20, 2);
    g.fillStyle = '#c9a23a'; g.fillRect(54, y0 + 33, 4, 2); g.fillRect(62, y0 + 33, 4, 2); g.fillRect(70, y0 + 33, 4, 2);
  }

  _drawVent(g) {
    // vertical stack
    g.fillStyle = '#4a4f58'; g.fillRect(96, 14, 8, 17);
    g.fillStyle = '#6a717c'; g.fillRect(96, 14, 2, 17);
    g.fillStyle = '#33373e'; g.fillRect(102, 14, 2, 17);
    // bands
    g.fillStyle = '#5e6570'; g.fillRect(95, 18, 10, 2); g.fillRect(95, 26, 10, 2);
    // cap
    g.fillStyle = '#5e6570'; g.fillRect(94, 11, 12, 3);
    g.fillStyle = '#7a828e'; g.fillRect(94, 11, 12, 1);
    // flap
    const open = Math.round(this.ventOpen * 3);
    g.fillStyle = '#8a929c';
    g.fillRect(96, 10 - open, 8, 1);
    if (open > 0) { g.fillStyle = '#5e6570'; g.fillRect(96, 10 - open, 1, open); g.fillRect(103, 10 - open, 1, open); }
    // pressure glow inside when high
    if (this.pressure > 0.7) {
      g.fillStyle = this.pressure > 0.9 ? '#ff7a3a' : '#a04a2a';
      g.fillRect(98, 10 - open, 4, 1);
    }
  }

  _drawPipe(g) {
    const lit = this.flash.pipe > 0;
    g.fillStyle = lit ? '#8f9aa8' : '#4c5159'; g.fillRect(112, 21, 48, 6);
    g.fillStyle = lit ? '#c8d2de' : '#6a717c'; g.fillRect(112, 21, 48, 1);
    g.fillStyle = lit ? '#5b6573' : '#2f333a'; g.fillRect(112, 26, 48, 1);
    // joints
    g.fillStyle = lit ? '#b0bac6' : '#5e6570';
    g.fillRect(112, 20, 3, 8); g.fillRect(128, 20, 3, 8); g.fillRect(150, 20, 3, 8);
    // elbow down to machine
    g.fillStyle = '#4c5159'; g.fillRect(112, 21, 4, 10);
    // valve wheel
    g.fillStyle = '#a03030'; g.fillRect(139, 17, 5, 1); g.fillRect(141, 15, 1, 5); g.fillRect(140, 16, 3, 3);
    g.fillStyle = '#5e6570'; g.fillRect(141, 18, 1, 3);
  }

  _drawGears(g) {
    this._gear(g, 134, 58, 11, 8, this.gearAngle, '#7a6a4c', '#5a4c34');
    this._gear(g, 151, 71, 6, 6, -this.gearAngle * (11 / 6) + 0.3, '#6e6350', '#4c4436');
    // axle bracket
    g.fillStyle = '#3b4048'; g.fillRect(116, 66, 6, 6); g.fillRect(116, 44, 4, 28);
    g.fillStyle = '#9a8a60'; g.fillRect(134, 58, 1, 1); g.fillRect(151, 71, 1, 1);
    // belt to machine
    g.fillStyle = '#2a2521';
    g.fillRect(112, 47, 12, 1); g.fillRect(112, 69, 12, 1);
  }
  _gear(g, cx, cy, r, teeth, angle, col, dark) {
    g.fillStyle = col;
    g.beginPath(); g.arc(cx + 0.5, cy + 0.5, r - 1.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark;
    for (let i = 0; i < teeth; i++) {
      const a = angle + (i / teeth) * Math.PI * 2;
      const tx = cx + Math.cos(a) * (r - 1), ty = cy + Math.sin(a) * (r - 1);
      g.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 3);
    }
    g.fillStyle = dark;
    g.beginPath(); g.arc(cx + 0.5, cy + 0.5, Math.max(1.5, r * 0.35), 0, Math.PI * 2); g.fill();
    // spokes
    g.fillStyle = '#3a3128';
    for (let i = 0; i < 4; i++) {
      const a = angle + (i / 4) * Math.PI * 2;
      for (let rr = 2; rr < r - 3; rr++) {
        g.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), 1, 1);
      }
    }
  }

  _drawStone(g) {
    const j = Math.round(this.stoneJump * 2);
    g.fillStyle = '#6f7368'; g.fillRect(8, 66 - j, 10, 6);
    g.fillRect(10, 64 - j, 6, 2);
    g.fillStyle = '#8d9184'; g.fillRect(10, 64 - j, 4, 1); g.fillRect(9, 66 - j, 2, 1);
    g.fillStyle = '#4e514a'; g.fillRect(8, 70 - j, 10, 2); g.fillRect(14, 67 - j, 3, 1);
    // hammer leaning
    g.fillStyle = '#6b4a2a'; g.fillRect(20, 58, 1, 14);
    g.fillStyle = '#7d848f'; g.fillRect(18, 56, 5, 3);
  }

  _drawParticles(g) {
    const steamPal = ['#ffffff', '#e4e8ee', '#c1c7d1', '#98a0ab', '#6d747f'];
    for (const p of this.parts) {
      const a = p.life / p.max;
      if (p.type === 'steam') {
        const s = Math.max(1, Math.round(1 + a * p.grow));
        const col = steamPal[Math.min(steamPal.length - 1, Math.floor(a * steamPal.length))];
        g.fillStyle = col;
        const x0 = Math.round(p.x - s / 2), y0 = Math.round(p.y - s / 2);
        const dither = a > 0.55;
        for (let yy = 0; yy < s; yy++) {
          for (let xx = 0; xx < s; xx++) {
            // rounded blob: skip corners
            const dx = xx - (s - 1) / 2, dy = yy - (s - 1) / 2;
            if (dx * dx + dy * dy > (s / 2) * (s / 2) + 0.5) continue;
            if (dither && ((xx + yy + Math.floor(p.y)) & 1)) continue;
            g.fillRect(x0 + xx, y0 + yy, 1, 1);
          }
        }
      } else if (p.type === 'spark') {
        g.fillStyle = p.white ? (a < 0.5 ? '#fff' : '#bcd') : (a < 0.3 ? '#fff4c0' : a < 0.7 ? '#ffb030' : '#c04a10');
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else {
        g.fillStyle = a < 0.5 ? '#9a9a90' : '#5f6058';
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
  }
}
