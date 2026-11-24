'use strict';
// Motor: dibujo del combate (escenario, plataformas, partículas, luchadores y proyectiles).
// Estos métodos pertenecen a BattleArenaEngine (motor.js); se escriben como clase aparte para no tener
// un archivo de 3.600 líneas y se acoplan al prototipo del motor al cargar. No cambia el comportamiento.

class BattleArenaRender {
    // =====================================================================
    // ESCENARIO: DATOS PROCEDURALES DETERMINISTAS POR ARENA
    // =====================================================================
    buildScenery(id) {
        const r = mulberry32(id.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7));
        const W = this.worldWidth, gy = this.groundY;
        const pick = arr => arr[Math.floor(r() * arr.length)];
        const sc = { stars: [], clouds: [] };
        for (let i = 0; i < 170; i++) sc.stars.push({ x: -900 + r() * (W + 1800), y: -650 + r() * 720, s: 0.6 + r() * 1.8, p: r() * 6.28 });
        for (let i = 0; i < 7; i++) sc.clouds.push({ x: r() * 2600, y: -160 + r() * 260, w: 170 + r() * 230, v: 6 + r() * 10 });
        const ridge = (base, amp, step) => { const pts = []; for (let x = -1500; x <= W + 1500; x += step) pts.push({ x, y: base - r() * amp }); return pts; };
        const cracks = (n, yMin, yMax) => Array.from({ length: n }, () => {
            let x = -400 + r() * (W + 800), y = gy + yMin + r() * (yMax - yMin);
            const pts = [{ x, y }];
            for (let i = 0; i < 4; i++) { x += 25 + r() * 55; y += (r() - 0.5) * 22; pts.push({ x, y }); }
            return { pts, ph: r() * 6 };
        });
        switch (id) {
            case 'suzaku':
                sc.ridgeFar = ridge(330, 170, 110);
                sc.ridgeNear = ridge(450, 110, 80);
                sc.trees = [{ x: 15, s: 1.15 }, { x: 1735, s: 1.2 }].map(tr => ({
                    ...tr,
                    blooms: Array.from({ length: 30 }, () => ({ dx: (r() - 0.5) * 250, dy: -235 - r() * 110, r: 15 + r() * 20, c: pick(['rgba(249,168,212,0.9)', 'rgba(244,114,182,0.85)', 'rgba(251,207,232,0.95)', 'rgba(236,72,153,0.75)']) }))
                }));
                break;
            case 'volcano':
                sc.spires = [{ x: 110, w: 130, h: 270 }, { x: 470, w: 90, h: 190 }, { x: 1300, w: 110, h: 230 }, { x: 1660, w: 150, h: 310 }].map(sp => {
                    const left = [], right = [];
                    for (let i = 0; i <= 6; i++) {
                        const k = i / 6;
                        left.push({ x: sp.x - (sp.w / 2) * (1 - k) + (r() - 0.5) * 16, y: gy - sp.h * k });
                        right.push({ x: sp.x + (sp.w / 2) * (1 - k) + (r() - 0.5) * 16, y: gy - sp.h * k });
                    }
                    return { ...sp, pts: left.concat(right.reverse()), ph: r() * 6 };
                });
                sc.cracks = cracks(18, 8, 100);
                sc.lavaStreams = [-1, 1, -1, 1].map(s => {
                    let x = 1050 + s * (40 + r() * 60), y = 162;
                    const pts = [{ x, y }];
                    while (y < gy - 60) { y += 50; x += s * (26 + r() * 24); pts.push({ x, y }); }
                    return { pts, w: 3 + r() * 3, ph: r() * 6 };
                });
                break;
            case 'eclipse':
                sc.ruins = Array.from({ length: 7 }, (_, i) => ({ x: 80 + i * 260 + r() * 80, y: 60 + r() * 210, w: 26 + r() * 20, h: 70 + r() * 90, rot: (r() - 0.5) * 0.9, ph: r() * 6 }));
                sc.crystals = [-60, 30, 120, 560, 1200, 1590, 1690, 1790].map(x => ({ x, h: (x > 300 && x < 1400) ? 40 + r() * 30 : 70 + r() * 120, w: 16 + r() * 16, lean: (r() - 0.5) * 30 }));
                break;
            case 'cyber':
                sc.far = [];
                for (let x = -1400; x < W + 1400; x += 55 + r() * 70) {
                    const w = 60 + r() * 80, h = 170 + r() * 300;
                    sc.far.push({ x, w, h, win: Array.from({ length: 6 + Math.floor(r() * 14) }, () => ({ x: r() * (w - 6), y: 8 + r() * (h - 16) })), ant: r() < 0.3 });
                }
                sc.mid = [];
                for (let x = -1100; x < W + 1100; x += 150 + r() * 120) {
                    const w = 110 + r() * 80, h = 260 + r() * 260, win = [];
                    for (let c = 0; c < Math.floor((w - 20) / 18); c++) for (let rr = 0; rr < Math.floor((h - 30) / 24); rr++) {
                        if (r() < 0.3) win.push({ x: 10 + c * 18, y: 20 + rr * 24, c: r() < 0.55 ? 'rgba(250,204,21,0.75)' : 'rgba(34,211,238,0.65)', fl: r() < 0.08 });
                    }
                    sc.mid.push({ x, w, h, neon: pick(['#ec4899', '#22d3ee', '#a855f7', '#facc15']), win });
                }
                sc.signs = sc.mid.filter((_, i) => i % 3 === 1).map(b => {
                    const text = pick(['BRAWL', 'NEO', '24H', 'RAMEN', '8', 'ARCADE', 'K.O.']);
                    return { x: b.x + 10, y: gy - b.h + 30 + r() * 70, text, color: pick(['#f472b6', '#22d3ee', '#facc15', '#c084fc']), flicker: r() < 0.4 };
                });
                sc.cars = Array.from({ length: 6 }, () => ({ off: r() * 3400, v: 70 + r() * 110, y: 90 + r() * 230, dir: r() < 0.5 ? 1 : -1, c: pick(['#22d3ee', '#f472b6', '#facc15']) }));
                sc.puddles = Array.from({ length: 7 }, () => ({ x: -200 + r() * (W + 400), y: gy + 30 + r() * 60, w: 60 + r() * 120 }));
                break;
            case 'lab':
                sc.tubes = [{ x: 170, c: '34,211,238', h: 270 }, { x: 390, c: '74,222,128', h: 235 }, { x: 1360, c: '167,139,250', h: 235 }, { x: 1580, c: '34,211,238', h: 270 }];
                sc.cables = Array.from({ length: 7 }, () => { const x1 = -300 + r() * (W + 600); return { x1, x2: x1 + 120 + r() * 260, sag: 10 + r() * 90 }; });
                break;
            case 'emerald': {
                sc.ridge1 = ridge(300, 140, 120);
                sc.ridge2 = ridge(400, 110, 90);
                const bamboo = (x, front) => {
                    const h = front ? 760 + r() * 200 : 520 + r() * 320;
                    const leaves = [];
                    for (let y = -140 - r() * 60; y > -h; y -= 80 + r() * 70) leaves.push({ y, dir: r() < 0.5 ? -1 : 1 });
                    return { x, h, w: front ? 16 + r() * 8 : 9 + r() * 6, seg: 48 + r() * 26, ph: r() * 6, c: front ? '#65a30d' : pick(['#4d7c0f', '#3f6212', '#5b8a1a']), leaves };
                };
                sc.bambooBack = [];
                for (let x = -700; x < W + 700; x += 45 + r() * 55) if (x < 520 || x > 1230 || r() < 0.25) sc.bambooBack.push(bamboo(x, false));
                sc.bambooFront = [];
                for (let x = -320; x < 230; x += 40 + r() * 40) sc.bambooFront.push(bamboo(x, true));
                for (let x = 1530; x < W + 330; x += 40 + r() * 40) sc.bambooFront.push(bamboo(x, true));
                sc.moss = Array.from({ length: 14 }, () => ({ x: -300 + r() * (W + 600), y: gy + 14 + r() * 70, w: 30 + r() * 70, h: 6 + r() * 8 }));
                sc.grass = Array.from({ length: 70 }, () => ({ x: -400 + r() * (W + 800), h: 6 + r() * 10, ph: r() * 6 }));
                break;
            }
            case 'seismic': {
                sc.mesas = [{ x: -250, w: 420, h: 200 }, { x: 480, w: 300, h: 150 }, { x: 1150, w: 380, h: 235 }, { x: 1950, w: 500, h: 185 }];
                const edge = xb => { const pts = []; for (let y = -760; y <= gy; y += 45) pts.push({ x: xb + Math.sin(y * 0.012) * 30 + (r() - 0.5) * 40, y }); return pts; };
                sc.wallL = edge(250); sc.wallR = edge(1500);
                sc.wallCrystals = [{ x: 130, y: 300 }, { x: 40, y: 110 }, { x: 1620, y: 250 }, { x: 1730, y: 430 }, { x: 180, y: -80 }];
                sc.chasmTop = []; sc.chasmBot = [];
                for (let x = -1600; x <= W + 1600; x += 70) { sc.chasmTop.push({ x, y: gy - 50 + (r() - 0.5) * 16 }); sc.chasmBot.push({ x, y: gy - 22 + (r() - 0.5) * 10 }); }
                sc.boulders = [{ x: 290, y: 175 }, { x: 760, y: 105 }, { x: 1210, y: 150 }, { x: 1530, y: 215 }, { x: 990, y: 20 }].map(b => ({ ...b, r: 30 + r() * 26, pts: Array.from({ length: 9 }, () => 0.75 + r() * 0.4), ph: r() * 6, crystal: r() < 0.6 }));
                sc.cracks = cracks(20, 8, 105);
                break;
            }
            case 'toxic':
                sc.stacks = [{ x: 90, w: 60, h: 390 }, { x: 250, w: 44, h: 300 }, { x: 860, w: 56, h: 350 }, { x: 1400, w: 72, h: 420 }, { x: 1590, w: 50, h: 320 }];
                sc.leaks = [{ x: 620 }, { x: 1180 }];
                sc.barrels = [{ x: 35, tip: false }, { x: 82, tip: false }, { x: 58, tip: false, stack: true }, { x: 1715, tip: true }, { x: 1655, tip: false }];
                sc.puddles = Array.from({ length: 6 }, () => ({ x: -200 + r() * (W + 400), y: gy + 25 + r() * 60, w: 60 + r() * 110, ph: r() * 6 }));
                sc.rust = Array.from({ length: 12 }, () => ({ x: -300 + r() * (W + 600), y: gy + 10 + r() * 80, w: 30 + r() * 80, h: 8 + r() * 14 }));
                break;
        }
        return sc;
    }

    // =====================================================================
    // PARTÍCULAS AMBIENTALES Y EVENTOS DE ARENA
    // =====================================================================
    updateAmbient() {
        const A = this.ambient, W = this.worldWidth, gy = this.groundY, R = Math.random;
        const spawn = o => { if (A.length < 180) A.push(o); };
        const rx = () => -300 + R() * (W + 600);
        switch (this.arena.id) {
            case 'suzaku':
                if (R() < 0.3) spawn({ k: 'petal', x: rx() - 200, y: -220, vx: 0.4 + R() * 0.9, vy: 0.7 + R() * 0.7, r: 3 + R() * 2.5, ph: R() * 6, life: 1400 });
                break;
            case 'volcano':
                if (R() < 0.55) spawn({ k: 'ember', x: rx(), y: gy - R() * 30, vx: (R() - 0.5) * 0.8, vy: -(0.6 + R() * 1.8), r: 1.2 + R() * 2.4, ph: R() * 6, life: 260 + R() * 220 });
                if (R() < 0.1) spawn({ k: 'ash', x: rx(), y: -220, vx: 0.3, vy: 0.5 + R() * 0.5, r: 1.5 + R() * 2, ph: R() * 6, life: 1400 });
                break;
            case 'eclipse':
                if (R() < 0.25) spawn({ k: 'mote', x: rx(), y: gy - R() * 60, vx: (R() - 0.5) * 0.4, vy: -(0.3 + R() * 0.6), r: 1.5 + R() * 2.5, ph: R() * 6, life: 500 + R() * 300 });
                break;
            case 'cyber':
                for (let i = 0; i < 3; i++) spawn({ k: 'rain', x: -400 + R() * (W + 900), y: -320 - R() * 200, vx: -2.5, vy: 15 + R() * 4, r: 1, ph: 0, life: 200 });
                break;
            case 'lab':
                if (R() < 0.2) spawn({ k: 'data', x: rx(), y: gy - R() * 20, vx: 0, vy: -(0.4 + R() * 0.8), r: 2 + R() * 2, ph: R() * 6, life: 420 });
                break;
            case 'emerald':
                if (R() < 0.08 && A.length < 60) spawn({ k: 'firefly', x: rx(), y: gy - 40 - R() * 320, vx: 0, vy: 0, r: 2.2, ph: R() * 6, life: 900 });
                if (R() < 0.06) spawn({ k: 'leaf', x: rx() - 200, y: -220, vx: 0.6 + R() * 0.6, vy: 0.8 + R() * 0.5, r: 5, ph: R() * 6, life: 1400 });
                break;
            case 'seismic':
                if (R() < 0.15) spawn({ k: 'dust', x: rx(), y: -220, vx: (R() - 0.5) * 0.3, vy: 1 + R() * 1.5, r: 1.5 + R() * 2.5, ph: R() * 6, life: 900 });
                break;
            case 'toxic':
                if (R() < 0.3) spawn({ k: 'bubble', x: rx(), y: gy - 2, vx: (R() - 0.5) * 0.3, vy: -(0.4 + R() * 0.9), r: 2 + R() * 4, ph: R() * 6, life: 120 + R() * 160 });
                if (R() < 0.02) spawn({ k: 'fog', x: -700, y: gy - 60 - R() * 220, vx: 0.4 + R() * 0.4, vy: 0, r: 130 + R() * 90, ph: 0, life: 4000 });
                break;
        }
        for (let i = A.length - 1; i >= 0; i--) {
            const a = A[i];
            a.life--;
            if (a.k === 'petal' || a.k === 'leaf') a.x += Math.sin(a.ph + a.life * 0.04) * 0.6;
            if (a.k === 'firefly') { a.vx = (a.vx + (R() - 0.5) * 0.15) * 0.96; a.vy = (a.vy + (R() - 0.5) * 0.15) * 0.96; }
            a.x += a.vx; a.y += a.vy;
            let dead = a.life <= 0 || a.y < -650 || a.x > W + 1000;
            if (a.k === 'rain' && a.y >= gy) {
                dead = true;
                if (R() < 0.35) spawn({ k: 'splash', x: a.x, y: gy, vx: 0, vy: 0, r: 1, ph: 0, life: 10 });
            }
            if ((a.k === 'petal' || a.k === 'ash' || a.k === 'dust' || a.k === 'leaf') && a.y > gy) dead = true;
            if (dead) A.splice(i, 1);
        }
    }

    // =====================================================================
    // RENDER PRINCIPAL
    // =====================================================================
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.save();
        const shk = Settings.get('gfx', 'shake') ? this.camera.shake : 0;
        const shakeX = (Math.random() - 0.5) * shk;
        const shakeY = (Math.random() - 0.5) * shk;
        ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
        const zoom = this.camera.zoom * (1 + (this.camera.kick || 0));
        ctx.scale(zoom, zoom);
        ctx.translate(-this.camera.x, -this.camera.y);

        this.drawArenaBackground(ctx);
        this.drawPlatforms(ctx);
        this.drawHazards(ctx, 'back');
        if (this.superFlash) this.drawSuperFlashWorld(ctx);

        const ordered = this.orderForDraw(this.fighters);
        for (const f of ordered) this.drawFighter(ctx, f);
        this.drawHazards(ctx, 'front');

        this.drawAmbient(ctx);
        this.drawProjectiles(ctx);
        SuperMoves.drawAll(ctx, this);
        this.drawParticles(ctx);
        this.drawFloatingTexts(ctx);
        ctx.restore();

        if (this.superFlash) this.drawSuperCutIn(ctx, w, h);
        HudExtras.frame(this);
    }

    par(ctx, factor, fn) {
        ctx.save();
        ctx.translate((this.camera.x - this.worldWidth / 2) * factor, (this.camera.y - this.worldHeight / 2) * factor * 0.5);
        fn();
        ctx.restore();
    }
    skyFill(ctx, stops) {
        const g = ctx.createLinearGradient(0, -700, 0, this.groundY);
        stops.forEach(([o, c]) => g.addColorStop(o, c));
        ctx.fillStyle = g;
        ctx.fillRect(-2600, -2200, this.worldWidth + 5200, this.groundY + 2200);
    }
    floorFill(ctx, top, bottom, accent) {
        const gy = this.groundY;
        const g = ctx.createLinearGradient(0, gy, 0, gy + 160);
        g.addColorStop(0, top); g.addColorStop(1, bottom);
        ctx.fillStyle = bottom; ctx.fillRect(-2600, gy, this.worldWidth + 5200, 1400);
        ctx.fillStyle = g; ctx.fillRect(-2600, gy, this.worldWidth + 5200, 160);
        this._floorAccent = accent;
    }
    floorEdge(ctx) {
        ctx.fillStyle = this._floorAccent || this.arena.accentColor;
        ctx.fillRect(-2600, this.groundY, this.worldWidth + 5200, 4);
    }
    drawStars(ctx, stars, t, color) {
        ctx.fillStyle = color;
        for (const s of stars) { ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.5 + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
        ctx.globalAlpha = 1;
    }
    cloud(ctx, x, y, w) {
        ctx.beginPath(); ctx.ellipse(x, y, w * 0.5, w * 0.11, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x - w * 0.18, y - w * 0.06, w * 0.24, w * 0.1, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + w * 0.16, y - w * 0.07, w * 0.2, w * 0.1, 0, 0, TAU); ctx.fill();
    }
    ridge(ctx, pts, color) {
        ctx.fillStyle = color; ctx.beginPath();
        ctx.moveTo(pts[0].x, this.groundY + 60);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.lineTo(pts[pts.length - 1].x, this.groundY + 60);
        ctx.closePath(); ctx.fill();
    }
    poly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); }

    drawArenaBackground(ctx) {
        const fn = this['bg_' + this.arena.id] || this.bg_suzaku;
        fn.call(this, ctx, this.time, this.scenery);
    }

    // ---------------------------------------------------------------- SANTUARIO
    bg_suzaku(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#04050d'], [0.45, '#141a3a'], [0.78, '#3d2257'], [1, '#a1456b']]);
        this.par(ctx, 0.85, () => {
            this.drawStars(ctx, sc.stars, t, '#fef9c3');
            softGlow(ctx, 1230, 70, 240, 'rgba(254,243,199,0.32)');
            ctx.fillStyle = '#fef3c7'; circ(ctx, 1230, 70, 78);
            ctx.fillStyle = 'rgba(253,230,138,0.55)'; circ(ctx, 1205, 55, 14); circ(ctx, 1258, 92, 10); circ(ctx, 1250, 40, 7);
            ctx.fillStyle = 'rgba(30,20,60,0.75)';
            sc.clouds.forEach(c => this.cloud(ctx, ((c.x + t * c.v) % 2600) - 500, c.y, c.w));
        });
        this.par(ctx, 0.62, () => this.ridge(ctx, sc.ridgeFar, '#2a2350'));
        this.par(ctx, 0.48, () => this.ridge(ctx, sc.ridgeNear, '#1c1838'));
        this.par(ctx, 0.32, () => {
            this.drawPagoda(ctx, 875, gy, 1.0, '#7f1d1d', '#1f1530', 'rgba(251,191,36,0.85)');
            this.drawPagoda(ctx, 320, gy, 0.55, '#5f1717', '#1a1228', 'rgba(251,191,36,0.55)');
            this.drawPagoda(ctx, 1440, gy, 0.6, '#5f1717', '#1a1228', 'rgba(251,191,36,0.55)');
        });
        this.par(ctx, 0.12, () => {
            this.drawTorii(ctx, 150, gy, 1.1, '#b91c1c');
            this.drawTorii(ctx, 1600, gy, 1.1, '#b91c1c');
        });
        sc.trees.forEach(tr => this.drawCherryTree(ctx, tr));
        [560, 1190].forEach(x => this.drawStoneLantern(ctx, x, gy, t));
        this.floorFill(ctx, '#5c3a22', '#1a0f08', '#facc15');
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
        for (let x = -2400; x < this.worldWidth + 2400; x += 70) ln(ctx, x, gy + 6, x - 22, gy + 150);
        ln(ctx, -2600, gy + 34, this.worldWidth + 2600, gy + 34);
        ln(ctx, -2600, gy + 78, this.worldWidth + 2600, gy + 78);
        this.floorEdge(ctx);
    }
    drawPagoda(ctx, cx, base, s, roof, wall, glow) {
        let y = base;
        const w = 220 * s;
        ctx.fillStyle = '#2b2140'; ctx.fillRect(cx - w * 0.6, y - 30 * s, w * 1.2, 30 * s);
        y -= 30 * s;
        for (let i = 0; i < 4; i++) {
            const tw = w * (1 - i * 0.18), th = 52 * s * (1 - i * 0.08);
            ctx.fillStyle = wall; ctx.fillRect(cx - tw * 0.38, y - th, tw * 0.76, th);
            ctx.fillStyle = glow;
            for (let k = -1; k <= 1; k++) ctx.fillRect(cx + k * tw * 0.2 - 6 * s, y - th * 0.72, 12 * s, th * 0.45);
            const ry = y - th;
            ctx.fillStyle = roof;
            ctx.beginPath();
            ctx.moveTo(cx - tw * 0.64, ry + 8 * s);
            ctx.quadraticCurveTo(cx - tw * 0.45, ry - 3 * s, cx - tw * 0.3, ry - 16 * s);
            ctx.lineTo(cx + tw * 0.3, ry - 16 * s);
            ctx.quadraticCurveTo(cx + tw * 0.45, ry - 3 * s, cx + tw * 0.64, ry + 8 * s);
            ctx.lineTo(cx + tw * 0.5, ry + 2 * s); ctx.lineTo(cx - tw * 0.5, ry + 2 * s);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#facc15'; ctx.fillRect(cx - tw * 0.5, ry + 1 * s, tw, 2 * s);
            y = ry - 16 * s;
        }
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3 * s; ln(ctx, cx, y, cx, y - 46 * s);
        ctx.fillStyle = '#facc15'; for (let i = 1; i < 5; i++) ctx.fillRect(cx - 5 * s, y - i * 9 * s, 10 * s, 2.5 * s);
    }
    drawTorii(ctx, x, base, s, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x - 62 * s, base - 175 * s, 15 * s, 175 * s);
        ctx.fillRect(x + 47 * s, base - 175 * s, 15 * s, 175 * s);
        ctx.fillRect(x - 74 * s, base - 145 * s, 148 * s, 11 * s);
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.moveTo(x - 96 * s, base - 186 * s);
        ctx.quadraticCurveTo(x, base - 172 * s, x + 96 * s, base - 186 * s);
        ctx.lineTo(x + 88 * s, base - 172 * s);
        ctx.quadraticCurveTo(x, base - 162 * s, x - 88 * s, base - 172 * s);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = color; ctx.fillRect(x - 82 * s, base - 170 * s, 164 * s, 9 * s);
        ctx.fillStyle = '#facc15'; ctx.fillRect(x - 10 * s, base - 168 * s, 20 * s, 22 * s);
        ctx.fillStyle = '#111827'; ctx.fillRect(x - 64 * s, base - 14 * s, 19 * s, 14 * s); ctx.fillRect(x + 45 * s, base - 14 * s, 19 * s, 14 * s);
    }
    drawCherryTree(ctx, tr) {
        const { x, s } = tr, base = this.groundY;
        ctx.strokeStyle = '#2b1a14'; ctx.lineCap = 'round';
        ctx.lineWidth = 20 * s;
        ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 24 * s, base - 120 * s, x - 8 * s, base - 225 * s); ctx.stroke();
        ctx.lineWidth = 9 * s;
        ln(ctx, x - 4 * s, base - 185 * s, x - 95 * s, base - 255 * s);
        ln(ctx, x, base - 205 * s, x + 85 * s, base - 275 * s);
        ln(ctx, x - 6 * s, base - 220 * s, x - 20 * s, base - 300 * s);
        for (const b of tr.blooms) { ctx.fillStyle = b.c; circ(ctx, x + b.dx * s, base + b.dy * s, b.r * s); }
    }
    drawStoneLantern(ctx, x, base, t) {
        ctx.fillStyle = '#3f3f46';
        ctx.fillRect(x - 22, base - 14, 44, 14);
        ctx.fillRect(x - 7, base - 72, 14, 58);
        ctx.fillRect(x - 21, base - 80, 42, 8);
        ctx.fillRect(x - 15, base - 106, 30, 26);
        ctx.beginPath(); ctx.moveTo(x - 28, base - 106); ctx.lineTo(x, base - 126); ctx.lineTo(x + 28, base - 106); ctx.closePath(); ctx.fill();
        const fl = 0.75 + Math.sin(t * 9 + x) * 0.12 + Math.sin(t * 23 + x) * 0.06;
        softGlow(ctx, x, base - 93, 70 * fl, 'rgba(251,191,36,0.35)');
        ctx.fillStyle = `rgba(253,224,71,${fl})`; ctx.fillRect(x - 9, base - 102, 18, 17);
    }

    // ---------------------------------------------------------------- VOLCÁN
    bg_volcano(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#0d0202'], [0.4, '#3b0707'], [0.78, '#7c1d0a'], [1, '#ea580c']]);
        this.par(ctx, 0.85, () => {
            ctx.fillStyle = 'rgba(20,8,6,0.75)';
            sc.clouds.forEach(c => this.cloud(ctx, ((c.x + t * c.v * 0.6) % 2600) - 500, c.y, c.w * 1.2));
        });
        this.par(ctx, 0.6, () => {
            const cx = 1050, top = 150;
            for (let i = 0; i < 6; i++) {
                const p = ((t * 0.08 + i / 6) % 1);
                ctx.fillStyle = `rgba(40,20,16,${0.55 * (1 - p)})`;
                circ(ctx, cx + Math.sin(t * 0.5 + i) * 30, top - p * 380, 40 + p * 110);
            }
            ctx.fillStyle = '#1a0805';
            ctx.beginPath(); ctx.moveTo(250, gy); ctx.lineTo(cx - 115, top); ctx.lineTo(cx - 50, top + 12); ctx.lineTo(cx + 40, top + 6); ctx.lineTo(cx + 115, top); ctx.lineTo(1900, gy); ctx.closePath(); ctx.fill();
            softGlow(ctx, cx, top, 170, 'rgba(249,115,22,0.6)');
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            for (const s of sc.lavaStreams) {
                ctx.strokeStyle = `rgba(251,146,60,${0.55 + Math.sin(t * 3 + s.ph) * 0.25})`; ctx.lineWidth = s.w;
                ctx.beginPath(); s.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
            }
            const ph = (t % 7) / 7;
            if (ph < 0.45) {
                const k = ph / 0.45;
                softGlow(ctx, cx, top, 120 * (1 - k) + 40, 'rgba(253,224,71,0.5)');
                for (let i = 0; i < 18; i++) {
                    const a = -Math.PI / 2 + (i - 8.5) * 0.085;
                    const v = 380 + ((i * 37) % 90);
                    ctx.globalAlpha = 1 - k * 0.6;
                    ctx.fillStyle = i % 2 ? '#fdba74' : '#f97316';
                    circ(ctx, cx + Math.cos(a) * v * k * 0.7, top + Math.sin(a) * v * k + 430 * k * k, 7 - k * 3);
                }
                ctx.globalAlpha = 1;
            }
        });
        this.par(ctx, 0.3, () => {
            for (const sp of sc.spires) {
                ctx.fillStyle = '#120604'; this.poly(ctx, sp.pts); ctx.fill();
                ctx.strokeStyle = `rgba(249,115,22,${0.45 + Math.sin(t * 2 + sp.ph) * 0.3})`; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(sp.x - 6, gy - 10); ctx.lineTo(sp.x + 4, gy - sp.h * 0.35); ctx.lineTo(sp.x - 3, gy - sp.h * 0.6); ctx.stroke();
            }
        });
        this.par(ctx, 0.12, () => {
            const ly = gy - 36;
            const lg = ctx.createLinearGradient(0, ly, 0, gy);
            lg.addColorStop(0, '#fde047'); lg.addColorStop(0.3, '#f97316'); lg.addColorStop(1, '#7c2d12');
            ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(-2600, gy + 20);
            for (let x = -2600; x <= this.worldWidth + 2600; x += 60) ctx.lineTo(x, ly + Math.sin(x * 0.02 + t * 2) * 4);
            ctx.lineTo(this.worldWidth + 2600, gy + 20); ctx.closePath(); ctx.fill();
        });
        this.floorFill(ctx, '#2a1d19', '#0c0606', '#f97316');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const c of sc.cracks) {
            ctx.strokeStyle = `rgba(249,115,22,${0.45 + 0.4 * Math.sin(t * 2.5 + c.ph)})`; ctx.lineWidth = 3;
            ctx.beginPath(); c.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        }
        this.floorEdge(ctx);
    }

    // ---------------------------------------------------------------- ECLIPSE
    bg_eclipse(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#010003'], [0.5, '#0e0520'], [1, '#2d0a4e']]);
        this.par(ctx, 0.9, () => {
            this.drawStars(ctx, sc.stars, t, '#e9d5ff');
            const ex = 875, ey = 50;
            softGlow(ctx, ex, ey, 280, 'rgba(239,68,68,0.45)');
            ctx.save(); ctx.translate(ex, ey); ctx.rotate(t * 0.08);
            for (let i = 0; i < 32; i++) {
                const a = (i / 32) * TAU;
                const len = 125 + Math.sin(t * 2 + i * 1.7) * 25 + (i % 3) * 22;
                ctx.fillStyle = i % 2 ? 'rgba(251,146,60,0.38)' : 'rgba(239,68,68,0.32)';
                ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.05) * 88, Math.sin(a - 0.05) * 88); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.lineTo(Math.cos(a + 0.05) * 88, Math.sin(a + 0.05) * 88); ctx.fill();
            }
            ctx.restore();
            ctx.fillStyle = '#000000'; circ(ctx, ex, ey, 88);
            ctx.strokeStyle = '#fecaca'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex, ey, 88, 0, TAU); ctx.stroke();
        });
        this.par(ctx, 0.55, () => {
            for (const r of sc.ruins) {
                const by = r.y + Math.sin(t * 0.8 + r.ph) * 12;
                ctx.save(); ctx.translate(r.x, by); ctx.rotate(r.rot + Math.sin(t * 0.5 + r.ph) * 0.05);
                ctx.fillStyle = '#2e1f4a'; ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
                ctx.fillStyle = '#3d2a63'; ctx.fillRect(-r.w / 2 - 6, r.h / 2 - 8, r.w + 12, 8);
                ctx.strokeStyle = 'rgba(15,5,30,0.6)'; ctx.lineWidth = 2;
                for (let i = 1; i < 3; i++) ln(ctx, -r.w / 2 + i * r.w / 3, -r.h / 2, -r.w / 2 + i * r.w / 3, r.h / 2 - 8);
                ctx.fillStyle = '#2e1f4a';
                ctx.beginPath(); ctx.moveTo(-r.w / 2, -r.h / 2); ctx.lineTo(-r.w / 4, -r.h / 2 - 10); ctx.lineTo(0, -r.h / 2 - 3); ctx.lineTo(r.w / 3, -r.h / 2 - 12); ctx.lineTo(r.w / 2, -r.h / 2); ctx.fill();
                ctx.fillStyle = `rgba(216,180,254,${0.5 + Math.sin(t * 2 + r.ph) * 0.4})`; ctx.fillRect(-2, -6, 4, 12);
                ctx.restore();
            }
        });
        this.par(ctx, 0.3, () => {
            const cx = 875, cy = gy + 260;
            ctx.strokeStyle = '#1e1236'; ctx.lineWidth = 26;
            for (const R of [990, 830]) { ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke(); }
            ctx.lineWidth = 12;
            for (let i = 0; i < 9; i++) {
                const a = Math.PI * (1.08 + i * 0.105);
                ln(ctx, cx + Math.cos(a) * 300, cy + Math.sin(a) * 300, cx + Math.cos(a) * 990, cy + Math.sin(a) * 990);
            }
            for (let i = 0; i < 24; i++) {
                const a = Math.PI * (1.08 + i * 0.036);
                ctx.fillStyle = `rgba(192,132,252,${0.35 + 0.5 * Math.abs(Math.sin(t * 1.5 + i * 0.6))})`;
                circ(ctx, cx + Math.cos(a) * 990, cy + Math.sin(a) * 990, 4);
            }
            for (const px of [40, 1710]) {
                ctx.fillStyle = '#1a1030'; ctx.fillRect(px - 35, gy - 430, 70, 430);
                ctx.fillStyle = '#2a1846'; ctx.fillRect(px - 45, gy - 440, 90, 18);
                softGlow(ctx, px, gy - 470, 60, 'rgba(192,132,252,0.5)');
                ctx.fillStyle = '#c084fc'; ctx.beginPath(); ctx.moveTo(px - 14, gy - 440); ctx.lineTo(px, gy - 500); ctx.lineTo(px + 14, gy - 440); ctx.closePath(); ctx.fill();
            }
        });
        this.par(ctx, 0.08, () => {
            for (const c of sc.crystals) {
                softGlow(ctx, c.x, gy - 6, c.w * 2.2, 'rgba(168,85,247,0.4)');
                const g = ctx.createLinearGradient(0, gy, 0, gy - c.h);
                g.addColorStop(0, '#581c87'); g.addColorStop(1, '#e9d5ff');
                ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(c.x - c.w / 2, gy); ctx.lineTo(c.x + c.lean - c.w * 0.15, gy - c.h * 0.85); ctx.lineTo(c.x + c.lean, gy - c.h); ctx.lineTo(c.x + c.lean + c.w * 0.15, gy - c.h * 0.85); ctx.lineTo(c.x + c.w / 2, gy); ctx.closePath(); ctx.fill();
            }
        });
        this.floorFill(ctx, '#1f1236', '#05020c', '#c084fc');
        ctx.save(); ctx.translate(875, gy + 50); ctx.scale(1, 0.09);
        ctx.strokeStyle = `rgba(192,132,252,${0.45 + 0.3 * Math.sin(t * 2)})`; ctx.lineWidth = 34;
        ctx.beginPath(); ctx.arc(0, 0, 440, 0, TAU); ctx.stroke();
        ctx.setLineDash([40, 28]); ctx.lineDashOffset = -t * 70; ctx.lineWidth = 22;
        ctx.strokeStyle = 'rgba(232,121,249,0.6)'; ctx.beginPath(); ctx.arc(0, 0, 350, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.fillStyle = 'rgba(192,132,252,0.07)';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(((t * 20 + i * 700) % 2600) - 400, gy - 20 - i * 14, 420, 26, 0, 0, TAU); ctx.fill(); }
        this.floorEdge(ctx);
    }

    // ---------------------------------------------------------------- CIUDAD NEÓN
    bg_cyber(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#020617'], [0.5, '#140f3a'], [0.85, '#4a1257'], [1, '#86198f']]);
        this.par(ctx, 0.85, () => {
            for (const b of sc.far) {
                ctx.fillStyle = '#0d0a26'; ctx.fillRect(b.x, gy - b.h, b.w, b.h);
                ctx.fillStyle = 'rgba(129,140,248,0.45)';
                for (const w of b.win) ctx.fillRect(b.x + w.x, gy - b.h + w.y, 3, 4);
                if (b.ant) {
                    ctx.strokeStyle = '#0d0a26'; ctx.lineWidth = 2; ln(ctx, b.x + b.w / 2, gy - b.h, b.x + b.w / 2, gy - b.h - 40);
                    ctx.fillStyle = Math.sin(t * 3 + b.x) > 0 ? '#ef4444' : '#450a0a'; circ(ctx, b.x + b.w / 2, gy - b.h - 40, 2.5);
                }
            }
        });
        this.par(ctx, 0.55, () => {
            for (const b of sc.mid) {
                ctx.fillStyle = '#0b1020'; ctx.fillRect(b.x, gy - b.h, b.w, b.h);
                for (const w of b.win) {
                    if (w.fl && Math.sin(t * 11 + w.x * 3) < 0) continue;
                    ctx.fillStyle = w.c; ctx.fillRect(b.x + w.x, gy - b.h + w.y, 8, 12);
                }
                ctx.strokeStyle = b.neon; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(b.x, gy); ctx.lineTo(b.x, gy - b.h); ctx.lineTo(b.x + b.w, gy - b.h); ctx.stroke();
                ctx.globalAlpha = 1;
            }
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            for (const s of sc.signs) {
                const on = !s.flicker || Math.sin(t * 13 + s.x) > -0.55;
                const bw = s.text.length * 16 + 18;
                ctx.fillStyle = 'rgba(2,6,23,0.85)'; ctx.fillRect(s.x, s.y, bw, 34);
                if (on) {
                    ctx.strokeStyle = s.color; ctx.globalAlpha = 0.3; ctx.lineWidth = 8; ctx.strokeRect(s.x, s.y, bw, 34);
                    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeRect(s.x, s.y, bw, 34);
                    ctx.font = '15px "Press Start 2P", monospace'; ctx.fillStyle = s.color;
                    ctx.fillText(s.text, s.x + 9, s.y + 18);
                }
            }
            const span = this.worldWidth + 1800;
            for (const c of sc.cars) {
                let x = ((c.off + t * c.v) % span) - 900;
                if (c.dir < 0) x = this.worldWidth - x;
                ctx.save(); ctx.translate(x, c.y); ctx.scale(c.dir, 1);
                ctx.strokeStyle = c.c; ctx.globalAlpha = 0.35; ctx.lineWidth = 2; ln(ctx, -70, 2, -20, 2);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.roundRect(-20, -6, 40, 11, 4); ctx.fill();
                ctx.fillStyle = '#334155'; ctx.fillRect(-8, -10, 16, 5);
                ctx.fillStyle = '#fef9c3'; ctx.fillRect(17, -3, 4, 3);
                ctx.fillStyle = '#ef4444'; ctx.fillRect(-21, -3, 3, 3);
                ctx.fillStyle = c.c; ctx.globalAlpha = 0.6; ctx.fillRect(-16, 5, 32, 2); ctx.globalAlpha = 1;
                ctx.restore();
            }
        });
        this.par(ctx, 0.22, () => {
            const hx = 875, hy = 120, hw = 440, hh = 120;
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 6; ln(ctx, hx - 150, hy + hh / 2, hx - 150, gy); ln(ctx, hx + 150, hy + hh / 2, hx + 150, gy);
            const flick = Math.sin(t * 17) > 0.92 ? 0.4 : 1;
            ctx.globalAlpha = flick;
            ctx.fillStyle = 'rgba(34,211,238,0.08)'; ctx.fillRect(hx - hw / 2, hy - hh / 2, hw, hh);
            ctx.strokeStyle = 'rgba(34,211,238,0.12)'; ctx.lineWidth = 1;
            for (let y = hy - hh / 2; y < hy + hh / 2; y += 6) ln(ctx, hx - hw / 2, y, hx + hw / 2, y);
            ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.strokeRect(hx - hw / 2, hy - hh / 2, hw, hh);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = '22px "Press Start 2P", monospace'; ctx.fillStyle = '#67e8f9';
            ctx.fillText('STREET BRAWL 8', hx + Math.sin(t * 40) * (flick < 1 ? 4 : 0), hy - 14);
            ctx.font = '11px "Press Start 2P", monospace'; ctx.fillStyle = '#f472b6';
            ctx.fillText('ARCADE ROYALE • TONIGHT', hx, hy + 24);
            ctx.globalAlpha = 1;
        });
        for (const lx of [300, 1450]) {
            ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 7; ln(ctx, lx, gy, lx, gy - 230);
            ln(ctx, lx, gy - 230, lx + 40, gy - 240);
            ctx.fillStyle = 'rgba(244,114,182,0.12)';
            ctx.beginPath(); ctx.moveTo(lx + 32, gy - 236); ctx.lineTo(lx + 100, gy); ctx.lineTo(lx - 30, gy); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#f9a8d4'; ctx.fillRect(lx + 26, gy - 240, 18, 5);
        }
        this.floorFill(ctx, '#111a33', '#03050b', '#22d3ee');
        ctx.save();
        ctx.beginPath(); ctx.rect(-2600, gy, this.worldWidth + 5200, 400); ctx.clip();
        for (const s of sc.signs) {
            const g = ctx.createLinearGradient(0, gy, 0, gy + 140);
            g.addColorStop(0, s.color + '44'); g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g; ctx.fillRect(s.x + (this.camera.x - this.worldWidth / 2) * 0.55, gy, s.text.length * 16 + 18, 140);
        }
        ctx.strokeStyle = 'rgba(34,211,238,0.18)'; ctx.lineWidth = 1;
        for (let x = -2600; x < this.worldWidth + 2600; x += 110) ln(ctx, 875 + (x - 875) * 0.3, gy, x, gy + 300);
        for (const y of [gy + 18, gy + 44, gy + 82, gy + 135]) ln(ctx, -2600, y, this.worldWidth + 2600, y);
        ctx.setLineDash([46, 34]); ctx.strokeStyle = 'rgba(250,204,21,0.5)'; ctx.lineWidth = 3;
        ln(ctx, -2600, gy + 62, this.worldWidth + 2600, gy + 62); ctx.setLineDash([]);
        for (const p of sc.puddles) {
            ctx.fillStyle = 'rgba(76,29,149,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.w, 7, 0, 0, TAU); ctx.fill();
            ctx.fillStyle = 'rgba(244,114,182,0.25)'; ctx.beginPath(); ctx.ellipse(p.x - p.w * 0.2, p.y - 1, p.w * 0.4, 2, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
        this.floorEdge(ctx);
    }

    // ---------------------------------------------------------------- LABORATORIO
    bg_lab(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#020c10'], [0.5, '#042029'], [1, '#063341']]);
        this.par(ctx, 0.2, () => {
            ctx.strokeStyle = 'rgba(56,189,248,0.12)'; ctx.lineWidth = 2;
            for (let x = -1300; x < this.worldWidth + 1300; x += 120) for (let y = -420; y < gy; y += 100) ctx.strokeRect(x + 4, y + 4, 112, 92);
            ctx.fillStyle = 'rgba(56,189,248,0.2)';
            for (let x = -1300; x < this.worldWidth + 1300; x += 120) for (let y = -420; y < gy; y += 100) { ctx.fillRect(x + 8, y + 8, 3, 3); ctx.fillRect(x + 109, y + 8, 3, 3); }
            for (let x = 60; x < this.worldWidth; x += 300) {
                ctx.fillStyle = 'rgba(224,242,254,0.07)';
                ctx.beginPath(); ctx.moveTo(x, -50); ctx.lineTo(x + 120, -50); ctx.lineTo(x + 200, 420); ctx.lineTo(x - 80, 420); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#e0f2fe'; ctx.fillRect(x, -60, 120, 9);
            }
            for (const [mx, my] of [[200, 30], [1410, 30]]) {
                ctx.fillStyle = '#0f172a'; ctx.fillRect(mx, my, 170, 100);
                ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, 170, 100);
                ctx.fillStyle = '#022c22'; ctx.fillRect(mx + 8, my + 8, 154, 84);
                ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.beginPath();
                for (let i = 0; i <= 40; i++) { const x = mx + 10 + i * 3.75, y = my + 40 + Math.sin(i * 0.5 + t * 6 + mx) * 14 * Math.sin(t + i * 0.1); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
                ctx.stroke();
                ctx.fillStyle = '#22d3ee';
                for (let i = 0; i < 6; i++) ctx.fillRect(mx + 14 + i * 24, my + 86 - (8 + Math.abs(Math.sin(t * 3 + i)) * 18), 14, 8 + Math.abs(Math.sin(t * 3 + i)) * 18);
            }
            ctx.strokeStyle = '#0b1f26'; ctx.lineWidth = 6;
            for (const c of sc.cables) { ctx.beginPath(); ctx.moveTo(c.x1, -90); ctx.quadraticCurveTo((c.x1 + c.x2) / 2, -90 + c.sag * 2, c.x2, -90); ctx.stroke(); }
        });
        this.par(ctx, 0.1, () => {
            const rx = 875, ry = 205;
            ctx.fillStyle = '#0b2a33'; ctx.strokeStyle = 'rgba(34,211,238,0.4)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(rx - 150, gy); ctx.lineTo(rx - 70, ry + 110); ctx.lineTo(rx + 70, ry + 110); ctx.lineTo(rx + 150, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
            const bw = 24 + Math.sin(t * 20) * 4;
            const bg = ctx.createLinearGradient(rx - bw, 0, rx + bw, 0);
            bg.addColorStop(0, 'rgba(103,232,249,0)'); bg.addColorStop(0.5, 'rgba(103,232,249,0.35)'); bg.addColorStop(1, 'rgba(103,232,249,0)');
            ctx.fillStyle = bg; ctx.fillRect(rx - bw, -500, bw * 2, ry + 500);
            for (let i = 0; i < 3; i++) {
                ctx.save(); ctx.translate(rx, ry); ctx.rotate(t * (0.6 + i * 0.35) * (i % 2 ? -1 : 1));
                ctx.strokeStyle = i === 1 ? '#22d3ee' : '#0ea5e9'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.ellipse(0, 0, 150 - i * 28, 34 + i * 10, 0, 0, TAU); ctx.stroke();
                ctx.fillStyle = '#e0f2fe';
                for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; circ(ctx, Math.cos(a) * (150 - i * 28), Math.sin(a) * (34 + i * 10), 4); }
                ctx.restore();
            }
            const pr = 46 + Math.sin(t * 4) * 6;
            softGlow(ctx, rx, ry, pr * 3, 'rgba(103,232,249,0.4)');
            const cg = ctx.createRadialGradient(rx, ry, 0, rx, ry, pr);
            cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.5, '#67e8f9'); cg.addColorStop(1, 'rgba(14,165,233,0.2)');
            ctx.fillStyle = cg; circ(ctx, rx, ry, pr);
            for (const tb of sc.tubes) this.drawTube(ctx, tb, t);
        });
        this.floorFill(ctx, '#123a47', '#040d11', '#38bdf8');
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
        for (let x = -2600; x < this.worldWidth + 2600; x += 160) ln(ctx, x, gy + 16, x, gy + 160);
        ln(ctx, -2600, gy + 80, this.worldWidth + 2600, gy + 80);
        ctx.fillStyle = 'rgba(148,163,184,0.4)';
        for (let x = -2600; x < this.worldWidth + 2600; x += 160) { ctx.fillRect(x + 6, gy + 22, 3, 3); ctx.fillRect(x + 6, gy + 70, 3, 3); }
        ctx.save(); ctx.beginPath(); ctx.rect(-2600, gy, this.worldWidth + 5200, 14); ctx.clip();
        ctx.fillStyle = '#111827'; ctx.fillRect(-2600, gy, this.worldWidth + 5200, 14);
        ctx.fillStyle = '#facc15';
        for (let x = -2600; x < this.worldWidth + 2600; x += 28) { ctx.beginPath(); ctx.moveTo(x, gy + 14); ctx.lineTo(x + 14, gy); ctx.lineTo(x + 24, gy); ctx.lineTo(x + 10, gy + 14); ctx.closePath(); ctx.fill(); }
        ctx.restore();
        this.floorEdge(ctx);
    }
    drawTube(ctx, tb, t) {
        const gy = this.groundY, top = gy - tb.h - 30, x0 = tb.x - 40, w = 80;
        ctx.fillStyle = `rgba(${tb.c},0.28)`; ctx.fillRect(x0, top, w, tb.h);
        const by = top + tb.h * 0.45 + Math.sin(t * 1.2 + tb.x) * 6;
        ctx.fillStyle = 'rgba(2,6,23,0.5)';
        circ(ctx, tb.x, by - 36, 12);
        ctx.beginPath(); ctx.ellipse(tb.x, by, 13, 25, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(2,6,23,0.5)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ln(ctx, tb.x - 10, by - 14, tb.x - 22, by + 12); ln(ctx, tb.x + 10, by - 14, tb.x + 22, by + 12);
        ln(ctx, tb.x - 6, by + 22, tb.x - 8, by + 52); ln(ctx, tb.x + 6, by + 22, tb.x + 8, by + 52);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
            const yy = top + tb.h - ((t * 45 + i * 41 + tb.x) % tb.h);
            ctx.beginPath(); ctx.arc(x0 + 12 + ((i * 23) % (w - 24)), yy, 2 + (i % 3), 0, TAU); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x0 + 8, top, 6, tb.h);
        ctx.strokeStyle = 'rgba(186,230,253,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(x0, top, w, tb.h);
        ctx.fillStyle = '#1e293b'; ctx.fillRect(x0 - 8, gy - 30, w + 16, 30); ctx.fillRect(x0 - 8, top - 22, w + 16, 22);
        ctx.fillStyle = Math.sin(t * 4 + tb.x) > 0 ? '#4ade80' : '#14532d'; circ(ctx, tb.x, gy - 15, 4);
        ctx.fillStyle = `rgb(${tb.c})`; ctx.fillRect(x0, top - 6, w, 3);
    }

    // ---------------------------------------------------------------- TEMPLO ESMERALDA
    bg_emerald(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#0a1f17'], [0.45, '#1d4d3b'], [0.8, '#5f9e7f'], [1, '#c8e6c9']]);
        this.par(ctx, 0.88, () => {
            softGlow(ctx, 480, 110, 200, 'rgba(236,252,203,0.4)');
            ctx.fillStyle = 'rgba(236,252,203,0.85)'; circ(ctx, 480, 110, 58);
        });
        this.par(ctx, 0.7, () => this.ridge(ctx, sc.ridge1, 'rgba(47,107,85,0.85)'));
        this.par(ctx, 0.55, () => {
            this.ridge(ctx, sc.ridge2, 'rgba(36,84,66,0.92)');
            const wx = 1390, wTop = 110, wBot = gy - 40;
            ctx.fillStyle = '#1a3f31';
            ctx.beginPath(); ctx.moveTo(wx - 150, gy); ctx.lineTo(wx - 110, wTop - 20); ctx.lineTo(wx - 40, wTop - 50); ctx.lineTo(wx + 60, wTop - 40); ctx.lineTo(wx + 170, wTop + 10); ctx.lineTo(wx + 220, gy); ctx.closePath(); ctx.fill();
            const wg = ctx.createLinearGradient(0, wTop, 0, wBot);
            wg.addColorStop(0, 'rgba(224,242,254,0.9)'); wg.addColorStop(1, 'rgba(186,230,253,0.7)');
            ctx.fillStyle = wg; ctx.fillRect(wx - 30, wTop, 60, wBot - wTop);
            ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2; ctx.setLineDash([28, 18]);
            for (let i = 0; i < 9; i++) { ctx.lineDashOffset = -t * 230 - i * 13; ln(ctx, wx - 26 + i * 6.5, wTop, wx - 26 + i * 6.5, wBot); }
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            for (let i = 0; i < 6; i++) circ(ctx, wx - 50 + i * 20, wBot + Math.sin(t * 3 + i) * 5, 18 + Math.sin(t * 2 + i * 2) * 6);
        });
        this.par(ctx, 0.35, () => this.drawJadeTemple(ctx, 760, gy, t));
        this.par(ctx, 0.15, () => sc.bambooBack.forEach(b => this.drawBamboo(ctx, b, t, 0.8)));
        sc.bambooFront.forEach(b => this.drawBamboo(ctx, b, t, 1));
        ctx.fillStyle = 'rgba(220,252,231,0.09)';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(((t * 15 + i * 800) % 2800) - 500, gy - 25 - i * 12, 480, 28, 0, 0, TAU); ctx.fill(); }
        this.floorFill(ctx, '#3d4a3b', '#0e150e', '#34d399');
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
        ln(ctx, -2600, gy + 28, this.worldWidth + 2600, gy + 28); ln(ctx, -2600, gy + 66, this.worldWidth + 2600, gy + 66);
        for (let x = -2600; x < this.worldWidth + 2600; x += 90) { ln(ctx, x, gy, x, gy + 28); ln(ctx, x + 45, gy + 28, x + 45, gy + 66); }
        for (const m of sc.moss) { ctx.fillStyle = 'rgba(63,98,18,0.6)'; ctx.beginPath(); ctx.ellipse(m.x, m.y, m.w, m.h, 0, 0, TAU); ctx.fill(); }
        this.floorEdge(ctx);
        ctx.strokeStyle = '#65a30d'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (const g of sc.grass) {
            const s = Math.sin(t * 2 + g.ph) * 2;
            ln(ctx, g.x, gy + 2, g.x - 3 + s, gy - g.h); ln(ctx, g.x + 2, gy + 2, g.x + 4 + s, gy - g.h * 0.8);
        }
    }
    drawBamboo(ctx, b, t, alpha) {
        ctx.save(); ctx.translate(b.x, this.groundY); ctx.rotate(Math.sin(t * 0.8 + b.ph) * 0.015);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h, b.w, b.h);
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(-b.w / 2 + 2, -b.h, 3, b.h);
        ctx.fillStyle = '#365314';
        for (let y = -40; y > -b.h; y -= b.seg) ctx.fillRect(-b.w / 2 - 1, y, b.w + 2, 4);
        ctx.fillStyle = '#4d7c0f';
        for (const lf of b.leaves) {
            ctx.save(); ctx.translate(0, lf.y); ctx.rotate(lf.dir * (0.6 + Math.sin(t * 1.5 + b.ph + lf.y) * 0.08));
            ctx.beginPath(); ctx.ellipse(lf.dir * 20, 0, 22, 4.5, 0, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(lf.dir * 16, 8, 18, 3.5, lf.dir * 0.3, 0, TAU); ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }
    drawJadeTemple(ctx, cx, base, t) {
        ctx.fillStyle = '#2f3b2f';
        for (let i = 0; i < 5; i++) ctx.fillRect(cx - 210 + i * 16, base - 10 * (i + 1), 420 - i * 32, 10);
        const fy = base - 50;
        ctx.fillStyle = '#3a4a3a'; ctx.fillRect(cx - 240, fy - 12, 480, 12);
        ctx.fillStyle = 'rgba(10,20,15,0.88)'; ctx.fillRect(cx - 165, fy - 165, 330, 153);
        ctx.fillStyle = `rgba(251,191,36,${0.45 + Math.sin(t * 2) * 0.1})`; ctx.fillRect(cx - 32, fy - 112, 64, 100);
        ctx.fillStyle = '#7f1d1d';
        for (const k of [-180, -90, 90, 180]) ctx.fillRect(cx + k - 9, fy - 175, 18, 163);
        const roof = (y, w, h) => {
            ctx.fillStyle = '#047857';
            ctx.beginPath();
            ctx.moveTo(cx - w / 2 - 24, y + 8);
            ctx.quadraticCurveTo(cx - w * 0.36, y - h * 0.15, cx - w * 0.28, y - h);
            ctx.lineTo(cx + w * 0.28, y - h);
            ctx.quadraticCurveTo(cx + w * 0.36, y - h * 0.15, cx + w / 2 + 24, y + 8);
            ctx.lineTo(cx + w / 2, y + 12); ctx.lineTo(cx - w / 2, y + 12); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#065f46'; ctx.lineWidth = 2;
            for (let x = cx - w * 0.42; x < cx + w * 0.42; x += 14) ln(ctx, x, y + 8, x + (x - cx) * 0.12, y - h + 4);
            ctx.fillStyle = '#facc15'; ctx.fillRect(cx - w / 2, y + 9, w, 3); ctx.fillRect(cx - w * 0.28, y - h - 3, w * 0.56, 4);
            circ(ctx, cx - w * 0.28, y - h - 6, 5); circ(ctx, cx + w * 0.28, y - h - 6, 5);
        };
        roof(fy - 175, 540, 52);
        ctx.fillStyle = 'rgba(10,20,15,0.9)'; ctx.fillRect(cx - 120, fy - 270, 240, 55);
        ctx.fillStyle = '#7f1d1d'; ctx.fillRect(cx - 120, fy - 270, 12, 55); ctx.fillRect(cx + 108, fy - 270, 12, 55);
        roof(fy - 268, 380, 44);
    }

    // ---------------------------------------------------------------- ABISMO SÍSMICO
    bg_seismic(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#140c04'], [0.45, '#40260c'], [0.8, '#8a5420'], [1, '#d6924a']]);
        this.par(ctx, 0.88, () => {
            softGlow(ctx, 1200, 170, 280, 'rgba(253,186,116,0.35)');
            ctx.fillStyle = 'rgba(253,186,116,0.6)'; circ(ctx, 1200, 170, 70);
            ctx.fillStyle = 'rgba(64,38,12,0.5)';
            sc.clouds.forEach(c => this.cloud(ctx, ((c.x + t * c.v * 0.4) % 2600) - 500, c.y + 80, c.w));
        });
        this.par(ctx, 0.68, () => {
            ctx.fillStyle = '#4a2c10';
            for (const m of sc.mesas) {
                ctx.beginPath(); ctx.moveTo(m.x - m.w / 2 - 50, gy); ctx.lineTo(m.x - m.w / 2, gy - m.h); ctx.lineTo(m.x + m.w / 2, gy - m.h); ctx.lineTo(m.x + m.w / 2 + 50, gy); ctx.closePath(); ctx.fill();
            }
        });
        this.par(ctx, 0.45, () => {
            ctx.fillStyle = '#5a3714'; ctx.fillRect(-2000, gy - 75, this.worldWidth + 4000, 80);
            ctx.fillStyle = '#120802';
            ctx.beginPath();
            sc.chasmTop.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            for (let i = sc.chasmBot.length - 1; i >= 0; i--) ctx.lineTo(sc.chasmBot[i].x, sc.chasmBot[i].y);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = `rgba(234,88,12,${0.35 + Math.sin(t * 1.5) * 0.2})`; ctx.lineWidth = 3;
            ctx.beginPath(); sc.chasmBot.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - 6) : ctx.moveTo(p.x, p.y - 6))); ctx.stroke();
            this.drawStrataWall(ctx, sc.wallL, -1, t);
            this.drawStrataWall(ctx, sc.wallR, 1, t);
            for (const c of sc.wallCrystals) {
                softGlow(ctx, c.x, c.y, 34, 'rgba(251,191,36,0.5)');
                ctx.fillStyle = '#fbbf24';
                ctx.beginPath(); ctx.moveTo(c.x - 8, c.y + 6); ctx.lineTo(c.x - 3, c.y - 14); ctx.lineTo(c.x + 2, c.y + 4); ctx.lineTo(c.x + 7, c.y - 10); ctx.lineTo(c.x + 10, c.y + 6); ctx.closePath(); ctx.fill();
            }
            this.drawScaffold(ctx, 370, gy - 75, t);
        });
        this.par(ctx, 0.3, () => {
            for (const b of sc.boulders) {
                const by = b.y + Math.sin(t * 0.9 + b.ph) * 10;
                ctx.fillStyle = 'rgba(214,146,74,0.25)';
                for (let i = 0; i < 3; i++) circ(ctx, b.x - 14 + i * 14, by + b.r + 10 + ((t * 30 + i * 13) % 30), 2);
                ctx.fillStyle = '#5b3a1a'; ctx.strokeStyle = '#2a1708'; ctx.lineWidth = 3;
                ctx.beginPath();
                b.pts.forEach((f, i) => { const a = (i / b.pts.length) * TAU; const x = b.x + Math.cos(a) * b.r * f, y = by + Math.sin(a) * b.r * f * 0.8; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = 'rgba(138,90,43,0.8)'; ctx.lineWidth = 2;
                ln(ctx, b.x - b.r * 0.7, by - 4, b.x + b.r * 0.6, by - 8);
                if (b.crystal) {
                    softGlow(ctx, b.x + b.r * 0.3, by + b.r * 0.6, 20, 'rgba(251,191,36,0.6)');
                    ctx.fillStyle = '#fcd34d';
                    ctx.beginPath(); ctx.moveTo(b.x + b.r * 0.15, by + b.r * 0.5); ctx.lineTo(b.x + b.r * 0.3, by + b.r * 0.95); ctx.lineTo(b.x + b.r * 0.45, by + b.r * 0.5); ctx.closePath(); ctx.fill();
                }
            }
        });
        this.floorFill(ctx, '#5a381a', '#1a0e05', '#d97706');
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const c of sc.cracks) {
            ctx.strokeStyle = 'rgba(26,14,5,0.9)'; ctx.lineWidth = 4;
            ctx.beginPath(); c.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
            ctx.strokeStyle = `rgba(251,191,36,${0.15 + 0.2 * Math.sin(t * 2 + c.ph)})`; ctx.lineWidth = 1.5; ctx.stroke();
        }
        this.floorEdge(ctx);
    }
    drawStrataWall(ctx, edge, side, t) {
        const outer = side < 0 ? -2600 : this.worldWidth + 2600;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(outer, edge[0].y);
        edge.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(outer, this.groundY); ctx.closePath();
        ctx.fillStyle = '#6b3f17'; ctx.fill();
        ctx.clip();
        const cols = ['#7c4a1c', '#5a3412', '#8a5524', '#6b3f17', '#4a2a0e'];
        for (let y = -760, i = 0; y < this.groundY; y += 38, i++) {
            ctx.fillStyle = cols[i % cols.length];
            ctx.beginPath(); ctx.moveTo(-2600, y + 30);
            for (let x = -2600; x <= this.worldWidth + 2600; x += 120) ctx.lineTo(x, y + Math.sin(x * 0.01 + i) * 8);
            ctx.lineTo(this.worldWidth + 2600, y + 46); ctx.lineTo(-2600, y + 46); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = '#2a1708'; ctx.lineWidth = 4;
        ctx.beginPath(); edge.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
    }
    drawScaffold(ctx, x, base, t) {
        ctx.strokeStyle = '#3b2412'; ctx.lineWidth = 7; ctx.lineCap = 'butt';
        ln(ctx, x - 50, base, x - 50, base - 230); ln(ctx, x + 50, base, x + 50, base - 230);
        ctx.lineWidth = 4;
        for (let y = base; y > base - 230; y -= 76) { ln(ctx, x - 50, y, x + 50, y - 76); ln(ctx, x + 50, y, x - 50, y - 76); ln(ctx, x - 55, y - 76, x + 55, y - 76); }
        const sw = Math.sin(t * 1.6) * 0.25;
        const lx = x + Math.sin(sw) * 30, ly = base - 230 + Math.cos(sw) * 30;
        ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 1.5; ln(ctx, x, base - 230, lx, ly);
        softGlow(ctx, lx, ly + 8, 46, 'rgba(251,191,36,0.45)');
        ctx.fillStyle = '#fde68a'; ctx.fillRect(lx - 5, ly, 10, 14);
        ctx.fillStyle = '#292524'; ctx.fillRect(lx - 7, ly - 3, 14, 4);
    }

    // ---------------------------------------------------------------- FOSO TÓXICO
    bg_toxic(ctx, t, sc) {
        const gy = this.groundY;
        this.skyFill(ctx, [[0, '#070b02'], [0.45, '#1d2b06'], [0.8, '#4d5e12'], [1, '#a3b324']]);
        this.par(ctx, 0.85, () => {
            softGlow(ctx, 420, 150, 210, 'rgba(217,249,157,0.25)');
            ctx.fillStyle = 'rgba(217,249,157,0.35)'; circ(ctx, 420, 150, 55);
        });
        this.par(ctx, 0.65, () => {
            ctx.fillStyle = '#10170a'; ctx.fillRect(500, gy - 210, 760, 210);
            ctx.fillStyle = 'rgba(163,230,53,0.35)';
            for (let x = 520; x < 1240; x += 40) for (let y = gy - 190; y < gy - 30; y += 36) if ((x + y) % 3) ctx.fillRect(x, y, 18, 14);
            for (const s of sc.stacks) {
                for (let i = 0; i < 5; i++) {
                    const p = ((t * 0.12 + i / 5 + s.x * 0.001) % 1);
                    ctx.fillStyle = `rgba(132,204,22,${0.22 * (1 - p)})`;
                    circ(ctx, s.x + Math.sin(t + i) * 12 + p * 60, gy - s.h - p * 260, 14 + p * 50);
                }
                ctx.fillStyle = '#141c06'; ctx.fillRect(s.x - s.w / 2, gy - s.h, s.w, s.h);
                ctx.fillStyle = '#2a3a0c'; ctx.fillRect(s.x - s.w / 2, gy - s.h + 14, s.w, 8); ctx.fillRect(s.x - s.w / 2, gy - s.h + 34, s.w, 6);
                ctx.fillStyle = Math.sin(t * 3 + s.x) > 0 ? '#ef4444' : '#450a0a'; circ(ctx, s.x, gy - s.h - 4, 3);
            }
        });
        this.par(ctx, 0.42, () => {
            const fy1 = gy - 190, fy2 = gy - 40;
            ctx.save(); ctx.beginPath(); ctx.rect(-2000, fy1, this.worldWidth + 4000, fy2 - fy1); ctx.clip();
            ctx.strokeStyle = 'rgba(132,150,70,0.4)'; ctx.lineWidth = 1.5;
            for (let x = -2200; x < this.worldWidth + 2200; x += 18) { ln(ctx, x, fy1, x + 150, fy2); ln(ctx, x, fy2, x + 150, fy1); }
            ctx.restore();
            ctx.fillStyle = '#1a1f0c';
            for (let x = -2000; x < this.worldWidth + 2000; x += 220) ctx.fillRect(x, fy1 - 10, 8, fy2 - fy1 + 10);
            ctx.strokeStyle = '#2a2f18'; ctx.lineWidth = 2; ctx.beginPath();
            for (let x = -2000, i = 0; x < this.worldWidth + 2000; x += 10, i++) ctx.lineTo(x, fy1 - 8 + (i % 2) * 6);
            ctx.stroke();
            for (const x of [300, 1450]) {
                ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(x, fy1 + 20); ctx.lineTo(x + 34, fy1 + 78); ctx.lineTo(x - 34, fy1 + 78); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#111'; ctx.fillRect(x - 3, fy1 + 40, 6, 22); ctx.fillRect(x - 3, fy1 + 66, 6, 6);
            }
        });
        this.par(ctx, 0.25, () => {
            const py = 205;
            const pipeH = (x1, x2, y, h) => {
                ctx.fillStyle = '#3f4a1f'; ctx.fillRect(x1, y - h / 2, x2 - x1, h);
                ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x1, y - h / 2 + 4, x2 - x1, 5);
                ctx.fillStyle = '#2a3312'; for (let x = x1; x < x2; x += 200) ctx.fillRect(x, y - h / 2 - 5, 14, h + 10);
            };
            pipeH(-2000, this.worldWidth + 2000, py, 36);
            for (const vx of [250, 1500]) {
                ctx.fillStyle = '#3f4a1f'; ctx.fillRect(vx - 16, py, 32, gy - py);
                ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(vx - 10, py, 5, gy - py);
                ctx.fillStyle = '#2a3312'; ctx.fillRect(vx - 21, py + 120, 42, 12); ctx.fillRect(vx - 21, py + 260, 42, 12);
            }
            const ly = gy - 34;
            const lg = ctx.createLinearGradient(0, ly, 0, gy);
            lg.addColorStop(0, '#d9f99d'); lg.addColorStop(0.35, '#84cc16'); lg.addColorStop(1, '#365314');
            ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(-2000, gy + 10);
            for (let x = -2000; x <= this.worldWidth + 2000; x += 50) ctx.lineTo(x, ly + Math.sin(x * 0.03 + t * 1.6) * 3);
            ctx.lineTo(this.worldWidth + 2000, gy + 10); ctx.closePath(); ctx.fill();
            for (const L of sc.leaks) {
                const fg = ctx.createLinearGradient(0, py, 0, gy);
                fg.addColorStop(0, 'rgba(190,242,100,0.9)'); fg.addColorStop(1, 'rgba(101,163,13,0.7)');
                ctx.fillStyle = fg; ctx.fillRect(L.x - 6, py + 18, 12, ly - py - 18);
                ctx.strokeStyle = 'rgba(236,252,203,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([16, 14]); ctx.lineDashOffset = -t * 160;
                ln(ctx, L.x - 2, py + 18, L.x - 2, ly); ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(217,249,157,0.6)';
                for (let i = 0; i < 5; i++) { const a = t * 4 + i * 1.3; circ(ctx, L.x + Math.cos(a) * 18, ly - 3 - Math.abs(Math.sin(a)) * 10, 3); }
                ctx.fillStyle = '#2a3312'; ctx.fillRect(L.x - 14, py + 10, 28, 12);
            }
            for (let i = 0; i < 14; i++) {
                const x = ((i * 173 + 50) % (this.worldWidth + 900)) - 450;
                const ph = (t * 0.7 + i * 0.37) % 1;
                ctx.strokeStyle = `rgba(236,252,203,${1 - ph})`; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(x, gy - 20, 3 + ph * 9, Math.PI, TAU); ctx.stroke();
            }
        });
        for (const b of sc.barrels) this.drawBarrel(ctx, b, t);
        this.floorFill(ctx, '#3a3216', '#0d0b05', '#a3e635');
        for (const r of sc.rust) { ctx.fillStyle = 'rgba(124,45,18,0.35)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
        for (let x = -2600; x < this.worldWidth + 2600; x += 24) ln(ctx, x, gy + 4, x, gy + 110);
        for (let y = gy + 24; y < gy + 115; y += 24) ln(ctx, -2600, y, this.worldWidth + 2600, y);
        for (const p of sc.puddles) {
            const a = 0.45 + Math.sin(t * 2 + p.ph) * 0.15;
            softGlow(ctx, p.x, p.y, p.w * 0.9, `rgba(163,230,53,${a * 0.5})`);
            ctx.fillStyle = `rgba(163,230,53,${a})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.w * 0.6, 6, 0, 0, TAU); ctx.fill();
        }
        this.floorEdge(ctx);
    }
    drawBarrel(ctx, b, t) {
        const gy = this.groundY;
        ctx.save();
        if (b.tip) {
            ctx.translate(b.x, gy - 20); ctx.rotate(Math.PI / 2);
            ctx.fillStyle = 'rgba(163,230,53,0.55)'; ctx.beginPath(); ctx.ellipse(6, -50, 8, 46, 0, 0, TAU); ctx.fill();
        } else {
            ctx.translate(b.x, b.stack ? gy - 56 : gy);
        }
        ctx.fillStyle = '#ca8a04'; ctx.fillRect(-20, -56, 40, 56);
        ctx.fillStyle = '#854d0e'; ctx.fillRect(-20, -48, 40, 4); ctx.fillRect(-20, -12, 40, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(-14, -56, 5, 56);
        ctx.fillStyle = '#111';
        circ(ctx, 0, -30, 11);
        ctx.fillStyle = '#ca8a04';
        for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + Math.PI / 6; ctx.beginPath(); ctx.moveTo(0, -30); ctx.arc(0, -30, 11.5, a, a + 0.55); ctx.closePath(); ctx.fill(); }
        circ(ctx, 0, -30, 3);
        ctx.restore();
    }

    // =====================================================================
    // PLATAFORMAS TEMÁTICAS
    // =====================================================================
    drawPlatforms(ctx) {
        const id = this.arena.id, t = this.time;
        for (const p of this.platforms) {
            ctx.save();
            const fn = this['plat_' + id] || this.plat_suzaku;
            fn.call(this, ctx, p, t);
            ctx.restore();
        }
    }
    plat_suzaku(ctx, p) {
        ctx.fillStyle = '#3b2314'; ctx.fillRect(p.x + 10, p.y + 8, p.w - 20, 14);
        ctx.fillStyle = '#22140b';
        for (let x = p.x + 20; x < p.x + p.w - 10; x += 40) ctx.fillRect(x, p.y + 14, 6, 12);
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath(); ctx.moveTo(p.x - 16, p.y + 12);
        ctx.quadraticCurveTo(p.x - 4, p.y - 1, p.x + 10, p.y - 4); ctx.lineTo(p.x + p.w - 10, p.y - 4);
        ctx.quadraticCurveTo(p.x + p.w + 4, p.y - 1, p.x + p.w + 16, p.y + 12);
        ctx.lineTo(p.x + p.w, p.y + 9); ctx.lineTo(p.x, p.y + 9); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#450a0a'; ctx.lineWidth = 2;
        for (let x = p.x + 8; x < p.x + p.w - 4; x += 13) ln(ctx, x, p.y - 3, x, p.y + 9);
        ctx.fillStyle = '#facc15'; ctx.fillRect(p.x + 6, p.y - 5, p.w - 12, 3);
    }
    plat_volcano(ctx, p, t) {
        ctx.fillStyle = '#140807'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y);
        for (let i = p.jag.length - 1; i >= 0; i--) ctx.lineTo(p.x + (i / (p.jag.length - 1)) * p.w, p.y + 14 + p.jag[i]);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = `rgba(249,115,22,${0.5 + 0.3 * Math.sin(t * 3 + p.x)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x + 20, p.y + 8);
        for (let i = 1; i < 6; i++) ctx.lineTo(p.x + 20 + i * (p.w - 40) / 5, p.y + 8 + (i % 2) * 9);
        ctx.stroke();
        ctx.fillStyle = '#f97316'; ctx.fillRect(p.x, p.y, p.w, 3);
        for (let i = 0; i < 3; i++) {
            const ph = (t * 0.8 + i * 0.33 + p.x * 0.001) % 1;
            ctx.fillStyle = `rgba(251,146,60,${1 - ph})`; circ(ctx, p.x + p.w * (0.2 + 0.3 * i), p.y + 22 + ph * 80, 3);
        }
    }
    plat_eclipse(ctx, p, t) {
        softGlow(ctx, p.x + p.w / 2, p.y + 46, 46, 'rgba(192,132,252,0.45)');
        ctx.fillStyle = '#2a1c45'; ctx.strokeStyle = '#4c3575'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.w, p.y); ctx.lineTo(p.x + p.w - 25, p.y + 18);
        ctx.lineTo(p.x + p.w / 2 + 12, p.y + 44); ctx.lineTo(p.x + p.w / 2 - 12, p.y + 44); ctx.lineTo(p.x + 25, p.y + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = `rgba(216,180,254,${0.5 + 0.4 * Math.sin(t * 2 + p.x)})`; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            const rx = p.x + 30 + i * (p.w - 60) / 4;
            ctx.beginPath(); ctx.moveTo(rx - 4, p.y + 6); ctx.lineTo(rx, p.y + 12); ctx.lineTo(rx + 4, p.y + 6); ctx.moveTo(rx, p.y + 12); ctx.lineTo(rx, p.y + 17); ctx.stroke();
        }
        ctx.fillStyle = '#c084fc'; ctx.fillRect(p.x, p.y, p.w, 3);
    }
    plat_cyber(ctx, p, t) {
        const g = ctx.createLinearGradient(0, p.y + 16, 0, p.y + 56);
        g.addColorStop(0, 'rgba(34,211,238,0.35)'); g.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = g; ctx.fillRect(p.x + 10, p.y + 16, p.w - 20, 40);
        ctx.fillStyle = '#111827'; ctx.fillRect(p.x, p.y, p.w, 16);
        for (const sx of [p.x, p.x + p.w - 24]) {
            ctx.save(); ctx.beginPath(); ctx.rect(sx, p.y + 3, 24, 13); ctx.clip();
            ctx.fillStyle = '#facc15'; ctx.fillRect(sx, p.y + 3, 24, 13);
            ctx.fillStyle = '#111';
            for (let x = sx - 14; x < sx + 24; x += 10) { ctx.beginPath(); ctx.moveTo(x, p.y + 16); ctx.lineTo(x + 5, p.y + 16); ctx.lineTo(x + 18, p.y + 3); ctx.lineTo(x + 13, p.y + 3); ctx.closePath(); ctx.fill(); }
            ctx.restore();
        }
        ctx.fillStyle = '#ec4899'; ctx.fillRect(p.x, p.y, p.w, 3);
        const n = Math.floor((p.w - 60) / 16);
        for (let i = 0; i < n; i++) {
            ctx.fillStyle = (Math.floor(t * 8) + i) % 6 === 0 ? '#67e8f9' : '#164e63';
            ctx.fillRect(p.x + 30 + i * 16, p.y + 10, 6, 3);
        }
    }
    plat_lab(ctx, p) {
        ctx.strokeStyle = '#164e63'; ctx.lineWidth = 3;
        for (let x = p.x + 6; x <= p.x + p.w - 4; x += 60) ln(ctx, x, p.y, x, p.y - 34);
        ln(ctx, p.x, p.y - 34, p.x + p.w, p.y - 34);
        ctx.lineWidth = 1.5; ln(ctx, p.x, p.y - 17, p.x + p.w, p.y - 17);
        ctx.fillStyle = '#0f2f38'; ctx.fillRect(p.x, p.y, p.w, 10);
        ctx.strokeStyle = 'rgba(56,189,248,0.35)'; ctx.lineWidth = 1;
        for (let x = p.x + 5; x < p.x + p.w; x += 10) ln(ctx, x, p.y + 1, x, p.y + 9);
        ctx.strokeStyle = '#0b2a33'; ctx.lineWidth = 3;
        for (let x = p.x; x + 80 <= p.x + p.w + 1; x += 80) { ctx.beginPath(); ctx.moveTo(x, p.y + 10); ctx.lineTo(x + 40, p.y + 30); ctx.lineTo(x + 80, p.y + 10); ctx.stroke(); }
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(p.x, p.y, p.w, 2);
    }
    plat_emerald(ctx, p, t) {
        ctx.strokeStyle = '#3f6212'; ctx.lineWidth = 2;
        for (let x = p.x + 30; x < p.x + p.w; x += 70) {
            const s = Math.sin(t * 1.5 + x) * 4;
            ctx.beginPath(); ctx.moveTo(x, p.y + 20); ctx.quadraticCurveTo(x + s, p.y + 40, x + s * 1.5, p.y + 55 + (x % 3) * 8); ctx.stroke();
        }
        const cols = ['#84cc16', '#65a30d', '#4d7c0f'];
        for (let k = 0; k < 3; k++) { ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.roundRect(p.x - 6, p.y + 1 + k * 6.5, p.w + 12, 7, 3.5); ctx.fill(); }
        ctx.fillStyle = '#3f6212';
        for (let x = p.x + 20; x < p.x + p.w; x += 45) ctx.fillRect(x, p.y + 1, 2, 20);
        ctx.fillStyle = '#d6b77a';
        for (let x = p.x + 8; x < p.x + p.w; x += 90) { ctx.fillRect(x, p.y, 7, 21); }
        ctx.fillStyle = '#34d399'; ctx.fillRect(p.x, p.y, p.w, 2);
    }
    plat_seismic(ctx, p, t) {
        ctx.fillStyle = 'rgba(214,146,74,0.3)';
        for (let i = 0; i < 4; i++) circ(ctx, p.x + p.w * (0.2 + i * 0.2), p.y + 34 + ((t * 25 + i * 11) % 40), 2);
        ctx.fillStyle = '#6b4220'; ctx.strokeStyle = '#2a1708'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + p.w + 4, p.y);
        for (let i = p.jag.length - 1; i >= 0; i--) ctx.lineTo(p.x + (i / (p.jag.length - 1)) * p.w, p.y + 12 + p.jag[i]);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(138,90,43,0.9)'; ctx.lineWidth = 2;
        ln(ctx, p.x + 6, p.y + 8, p.x + p.w - 6, p.y + 10);
        softGlow(ctx, p.x + p.w - 30, p.y + 22, 18, 'rgba(251,191,36,0.6)');
        ctx.fillStyle = '#fcd34d';
        ctx.beginPath(); ctx.moveTo(p.x + p.w - 38, p.y + 14); ctx.lineTo(p.x + p.w - 32, p.y + 32); ctx.lineTo(p.x + p.w - 26, p.y + 14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d97706'; ctx.fillRect(p.x, p.y, p.w, 3);
    }
    plat_toxic(ctx, p, t) {
        ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 3;
        ln(ctx, p.x + 12, p.y, p.x + 40, -500); ln(ctx, p.x + p.w - 12, p.y, p.x + p.w - 40, -500);
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(p.x, p.y, p.w, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        for (let x = p.x + 4; x < p.x + p.w - 8; x += 12) ctx.fillRect(x + 2, p.y + 4, 6, 6);
        ctx.fillStyle = 'rgba(154,52,18,0.5)'; ctx.fillRect(p.x + p.w * 0.3, p.y + 2, 30, 10); ctx.fillRect(p.x + p.w * 0.7, p.y + 4, 18, 8);
        ctx.fillStyle = '#a3e635'; ctx.fillRect(p.x, p.y, p.w, 3);
        for (let i = 0; i < 3; i++) {
            const ph = (t * 0.9 + i * 0.37 + p.x * 0.002) % 1;
            ctx.fillStyle = `rgba(163,230,53,${1 - ph})`; circ(ctx, p.x + p.w * (0.25 + 0.25 * i), p.y + 18 + ph * 70, 2.5);
        }
    }

    // =====================================================================
    // PARTÍCULAS AMBIENTALES (DIBUJO)
    // =====================================================================
    drawAmbient(ctx) {
        const t = this.time;
        for (const a of this.ambient) {
            switch (a.k) {
                case 'petal':
                    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ph + t * 2);
                    ctx.fillStyle = '#f9a8d4'; ctx.beginPath(); ctx.ellipse(0, 0, a.r, a.r * 0.55, 0, 0, TAU); ctx.fill();
                    ctx.restore(); break;
                case 'leaf':
                    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ph + t * 1.5);
                    ctx.fillStyle = '#84cc16'; ctx.beginPath(); ctx.ellipse(0, 0, a.r, a.r * 0.4, 0, 0, TAU); ctx.fill();
                    ctx.restore(); break;
                case 'ember':
                    ctx.fillStyle = `rgba(253,186,116,${Math.min(1, a.life / 120)})`; circ(ctx, a.x, a.y, a.r); break;
                case 'ash':
                    ctx.fillStyle = 'rgba(120,113,108,0.6)'; circ(ctx, a.x, a.y, a.r); break;
                case 'mote':
                    ctx.fillStyle = `rgba(216,180,254,${0.4 + 0.4 * Math.sin(t * 4 + a.ph)})`; circ(ctx, a.x, a.y, a.r); break;
                case 'rain':
                    ctx.strokeStyle = 'rgba(165,180,252,0.45)'; ctx.lineWidth = 1.5; ln(ctx, a.x, a.y, a.x + a.vx * 1.6, a.y + a.vy * 1.6); break;
                case 'splash':
                    ctx.strokeStyle = `rgba(165,180,252,${a.life / 10})`; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.ellipse(a.x, a.y, 10 - a.life, 2, 0, Math.PI, TAU); ctx.stroke(); break;
                case 'data':
                    ctx.fillStyle = `rgba(103,232,249,${Math.min(0.8, a.life / 200)})`; ctx.fillRect(a.x, a.y, a.r, a.r); break;
                case 'firefly': {
                    const al = 0.35 + 0.65 * Math.abs(Math.sin(t * 3 + a.ph));
                    softGlow(ctx, a.x, a.y, 10, `rgba(217,249,157,${al * 0.6})`);
                    ctx.fillStyle = `rgba(254,249,195,${al})`; circ(ctx, a.x, a.y, a.r); break;
                }
                case 'dust':
                    ctx.fillStyle = 'rgba(214,146,74,0.55)'; circ(ctx, a.x, a.y, a.r); break;
                case 'bubble':
                    ctx.strokeStyle = `rgba(190,242,100,${Math.min(0.8, a.life / 60)})`; ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, TAU); ctx.stroke(); break;
                case 'fog':
                    ctx.fillStyle = 'rgba(190,242,100,0.05)'; ctx.beginPath(); ctx.ellipse(a.x, a.y, a.r * 2, a.r * 0.35, 0, 0, TAU); ctx.fill(); break;
            }
        }
    }

    // =====================================================================
    // SÚPER: OSCURECER ESCENA + CUT-IN DEL PERSONAJE
    // =====================================================================
    startSuperFlash(f) {
        this.superFlash = { timer: 54, max: 54, x: f.x, y: f.y - 60, color: f.archetype.primary, name: f.archetype.superName, who: f.name, ref: f, seed: Math.random() * 6 };
    }
    drawSuperFlashWorld(ctx) {
        const sf = this.superFlash;
        const k = sf.timer / sf.max;
        const a = Math.min(1, (1 - k) * 6) * Math.min(1, k * 3);
        ctx.fillStyle = `rgba(2,4,12,${0.62 * a})`;
        ctx.fillRect(-2600, -2200, this.worldWidth + 5200, 4400);
        ctx.save(); ctx.translate(sf.x, sf.y);
        ctx.globalAlpha = 0.55 * a; ctx.strokeStyle = sf.color; ctx.lineCap = 'round';
        for (let i = 0; i < 30; i++) {
            const an = (i / 30) * TAU + sf.seed;
            const r1 = 70 + ((this.time * 900 + i * 53) % 520);
            ctx.lineWidth = 2 + (i % 3);
            ln(ctx, Math.cos(an) * r1, Math.sin(an) * r1, Math.cos(an) * (r1 + 70), Math.sin(an) * (r1 + 70));
        }
        ctx.restore();
    }
    drawSuperCutIn(ctx, w, h) {
        const sf = this.superFlash;
        const k = 1 - sf.timer / sf.max;
        const slide = Math.min(1, k * 5);
        const out = k > 0.8 ? (k - 0.8) / 0.2 : 0;
        const bandH = Math.max(80, Math.min(130, h * 0.17));
        const x0 = -w * 1.2 + slide * w * 1.2;
        ctx.save();
        ctx.globalAlpha = 1 - out;
        ctx.translate(0, h * 0.6);
        ctx.transform(1, -0.05, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(0,0,0,0.82)'; ctx.fillRect(x0 - 40, -bandH / 2, w * 1.4, bandH);
        ctx.fillStyle = sf.color; ctx.fillRect(x0 - 40, -bandH / 2, w * 1.4, 5); ctx.fillRect(x0 - 40, bandH / 2 - 5, w * 1.4, 5);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 - 40, -bandH / 2 + 5, w * 1.4, bandH - 10); ctx.clip();
        ctx.strokeStyle = sf.color; ctx.globalAlpha = 0.25 * (1 - out); ctx.lineWidth = 3;
        for (let i = 0; i < 24; i++) { const yy = -bandH / 2 + ((i * 37 + this.time * 600) % bandH); ln(ctx, x0 + ((i * 97) % w), yy, x0 + ((i * 97) % w) + 120, yy); }
        ctx.globalAlpha = 1 - out;
        const ref = sf.ref;
        const portrait = { ...ref, facing: 1, onGround: true, alive: true, vx: 0, vy: 0, blocking: false, crouching: false, inJuggle: false, stunTimer: 0, hitFlash: 0, mp: 100 };
        if (!MOVE_DATA[portrait.state]) { portrait.state = 'super'; portrait.stateMax = 44; portrait.stateTimer = 44 * (1 - Math.min(1, k * 1.2)); }
        const bs = portrait.archetype.build.s;
        const ps = (bandH / 95) * 1.3;
        ctx.translate(x0 + Math.min(200, w * 0.2), -bandH / 2 + 130 * ps * bs + 6);
        ctx.scale(ps * bs, ps * bs);
        FighterArt.draw(ctx, portrait, this.time);
        ctx.restore();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const fs = Math.round(bandH * 0.24);
        ctx.font = `${fs}px "Press Start 2P", monospace`;
        ctx.lineWidth = 6; ctx.strokeStyle = '#000';
        const tx = x0 + w * 0.58;
        ctx.strokeText(sf.name.toUpperCase(), tx, -bandH * 0.08);
        ctx.fillStyle = '#fde047'; ctx.fillText(sf.name.toUpperCase(), tx, -bandH * 0.08);
        ctx.font = `bold ${Math.round(bandH * 0.18)}px Rajdhani, sans-serif`;
        ctx.fillStyle = sf.color; ctx.fillText(`${sf.who} • SÚPER ARTE`, tx, bandH * 0.26);
        ctx.restore();
    }

    // =====================================================================
    // LUCHADORES
    // =====================================================================
    drawFighter(ctx, f) {
        const arch = f.archetype;
        const s = arch.build.s;
        ctx.save();
        ctx.translate(f.x, f.y);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath(); ctx.ellipse(0, 2, 30 * s, 8, 0, 0, TAU); ctx.fill();
        const teamCol = this.teamMode ? TEAM_COLORS[f.team].c : null;
        if (teamCol && f.alive) {
            ctx.strokeStyle = teamCol; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.ellipse(0, 2, 27 * s, 7, 0, 0, TAU); ctx.stroke();
            ctx.globalAlpha = 1;
        }

        if (f.alive) {
            const isMe = f.id === this.localUserId;
            const top = -132 * s;
            ctx.font = 'bold 12px Rajdhani, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = isMe ? '#facc15' : (teamCol || '#ffffff');
            ctx.fillText(isMe ? `▼ ${f.name}` : f.name, 0, top);
            ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(-26, top + 6, 52, 5);
            ctx.fillStyle = f.hp > 300 ? '#22c55e' : '#ef4444';
            ctx.fillRect(-25, top + 7, 50 * (f.hp / f.maxHp), 3);
        }

        ctx.save();
        ctx.scale(f.facing * s, s);
        if (!f.alive || f.state === 'down') { ctx.translate(0, -12); ctx.rotate(-Math.PI / 2); }
        else if (f.state === 'roll') {
            const k = 1 - (f.stateTimer || 0) / (f.stateMax || 22);
            ctx.translate(0, -34); ctx.rotate(k * TAU * (f.rollDir || 1) * f.facing); ctx.translate(0, 34);
        }
        if (f.alive && f.invuln > 0 && f.state !== 'roll' && Math.floor(this.time * 20) % 2 === 0) ctx.globalAlpha = 0.5;
        FighterArt.draw(ctx, f, this.time);
        if (f.hitFlash > 0) {
            ctx.globalAlpha = 0.6 * (f.hitFlash / 6);
            softGlow(ctx, 0, -62, 58, 'rgba(255,255,255,0.95)');
        }
        ctx.restore();
        if (f.alive && f.id === this.localUserId && f.chargeLevel > 0.05) {
            const full = f.chargeLevel >= 1;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-24, 10, 48, 5);
            ctx.fillStyle = full ? (Math.floor(this.time * 12) % 2 ? '#fde047' : '#ffffff') : f.archetype.primary;
            ctx.fillRect(-23, 11, 46 * f.chargeLevel, 3);
        }

        if (f.alive && f.stunTimer > 0) {
            for (let i = 0; i < 3; i++) {
                const a = this.time * 6 + i * 2.09;
                const x = Math.cos(a) * 18, y = -128 * s + Math.sin(a) * 5;
                ctx.fillStyle = '#fde047'; ctx.beginPath();
                for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2.2 : 5.5, an = k * Math.PI / 5 - Math.PI / 2; ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
                ctx.closePath(); ctx.fill();
            }
        }

        if (f.blocking && f.guardShow) {
            ctx.save(); ctx.scale(f.facing, 1);
            if (f.crouching) { ctx.translate(0, 26 * s); ctx.scale(1, 0.75); }
            const pulse = 0.22 + Math.sin(this.time * 12) * 0.06;
            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4;
            ctx.fillStyle = `rgba(56, 189, 248, ${pulse})`;
            ctx.beginPath(); ctx.arc(10 * s, -62 * s, 48 * s, -Math.PI * 0.42, Math.PI * 0.42); ctx.stroke(); ctx.fill();
            ctx.strokeStyle = 'rgba(224,242,254,0.6)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(10 * s, -62 * s, 40 * s, -Math.PI * 0.3, Math.PI * 0.3); ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    // =====================================================================
    // PROYECTILES ÚNICOS POR PERSONAJE
    // =====================================================================
    drawProjectiles(ctx) {
        for (const p of this.projectiles) {
            const R = p.radius, age = p.age || 0, c = p.color;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(Math.sign(p.vx) || 1, 1);
            if (p.isSuper) {
                ctx.save();
                ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.5 + Math.sin(age * 0.5) * 0.25; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(0, 0, R * (1.3 + Math.sin(age * 0.4) * 0.08), 0, TAU); ctx.stroke();
                ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.globalAlpha = 0.4;
                ctx.beginPath(); ctx.arc(0, 0, R * 1.55, -0.9, 0.9); ctx.stroke();
                ctx.restore();
            }
            switch (p.kind) {
                case 'ronin': {
                    softGlow(ctx, 0, 0, R * 1.7, 'rgba(56,189,248,0.55)');
                    ctx.strokeStyle = c; ctx.lineWidth = 3;
                    for (let i = 1; i <= 3; i++) { ctx.globalAlpha = 0.6 - i * 0.15; ctx.beginPath(); ctx.ellipse(-i * R * 0.6, 0, R * 0.32, R * (1 - i * 0.15), 0, 0, TAU); ctx.stroke(); }
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#e0f2fe';
                    ctx.beginPath(); ctx.arc(0, 0, R, -1.3, 1.3); ctx.arc(-R * 0.45, 0, R * 0.85, 1.15, -1.15, true); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#ffffff'; circ(ctx, R * 0.15, 0, R * 0.3);
                    break;
                }
                case 'blaze': {
                    const cols = ['#b91c1c', '#ea580c', '#f97316', '#fbbf24'];
                    for (let i = 0; i < 5; i++) {
                        const fl = Math.sin(age * 0.9 + i * 1.7);
                        FighterArt.flameTongue(ctx, R * 0.2, (i - 2) * R * 0.25, R * (1.9 + fl * 0.35) - i * 2, R * 0.38, Math.PI + (i - 2) * 0.16, cols[i % 4]);
                    }
                    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
                    g.addColorStop(0, '#fefce8'); g.addColorStop(0.45, '#fde047'); g.addColorStop(0.8, '#f97316'); g.addColorStop(1, 'rgba(234,88,12,0)');
                    ctx.fillStyle = g; circ(ctx, 0, 0, R * (1 + Math.sin(age * 0.6) * 0.06));
                    break;
                }
                case 'storm': {
                    softGlow(ctx, 0, 0, R * 1.9, 'rgba(96,165,250,0.5)');
                    ctx.lineCap = 'round';
                    for (let i = 0; i < 7; i++) {
                        const a = Math.random() * TAU;
                        FighterArt.bolt(ctx, Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, R * (0.9 + Math.random() * 0.8), a, Math.random() * 99, i % 2 ? '#fde047' : '#ffffff', 2.4);
                    }
                    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.7);
                    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#fef08a'); g.addColorStop(1, 'rgba(250,204,21,0)');
                    ctx.fillStyle = g; circ(ctx, 0, 0, R * 0.7);
                    break;
                }
                case 'vixen': {
                    softGlow(ctx, 0, 0, R * 1.9, 'rgba(168,85,247,0.55)');
                    ctx.save(); ctx.rotate(age * 0.15);
                    ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 3; ctx.lineCap = 'round';
                    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, R * (0.8 + i * 0.12), i * 1.57, i * 1.57 + 1.2); ctx.stroke(); }
                    ctx.restore();
                    ctx.fillStyle = '#0f0518'; circ(ctx, 0, 0, R * 0.62);
                    ctx.fillStyle = '#4c1d95';
                    ctx.beginPath(); ctx.moveTo(-R * 0.45, -R * 0.35); ctx.lineTo(-R * 0.3, -R * 0.95); ctx.lineTo(-R * 0.05, -R * 0.45); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(R * 0.05, -R * 0.45); ctx.lineTo(R * 0.3, -R * 0.95); ctx.lineTo(R * 0.45, -R * 0.35); ctx.fill();
                    ctx.fillStyle = '#f87171'; ctx.fillRect(-R * 0.3, -R * 0.08, R * 0.18, R * 0.1); ctx.fillRect(R * 0.12, -R * 0.08, R * 0.18, R * 0.1);
                    break;
                }
                case 'cyborg': {
                    softGlow(ctx, -R, 0, R * 2, 'rgba(34,211,238,0.35)');
                    ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.roundRect(-R * 2.8, -R * 0.38, R * 3.4, R * 0.76, R * 0.38); ctx.fill();
                    ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.roundRect(-R * 2.6, -R * 0.24, R * 3.1, R * 0.48, R * 0.24); ctx.fill();
                    ctx.fillStyle = '#ffffff'; ctx.fillRect(-R * 2.4, -R * 0.07, R * 2.8, R * 0.14);
                    ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.ellipse(R * 0.4, 0, R * 0.18, R * (0.6 + Math.sin(age * 0.8) * 0.15), 0, 0, TAU); ctx.stroke();
                    break;
                }
                case 'zephyra': {
                    ctx.save(); ctx.rotate(-age * 0.45);
                    ctx.fillStyle = 'rgba(167,243,208,0.18)'; circ(ctx, 0, 0, R * 1.1);
                    softGlow(ctx, 0, 0, R * 1.5, 'rgba(52,211,153,0.4)');
                    ctx.lineCap = 'round';
                    for (let i = 0; i < 3; i++) {
                        ctx.rotate(TAU / 3);
                        ctx.strokeStyle = '#34d399'; ctx.lineWidth = R * 0.3;
                        ctx.beginPath(); ctx.arc(0, 0, R * 0.78, -0.1, 1.5); ctx.stroke();
                        ctx.strokeStyle = '#ecfdf5'; ctx.lineWidth = R * 0.12;
                        ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, 1.4); ctx.stroke();
                    }
                    ctx.fillStyle = '#ecfdf5'; circ(ctx, 0, 0, R * 0.18);
                    ctx.restore();
                    ctx.strokeStyle = 'rgba(167,243,208,0.6)'; ctx.lineWidth = 2;
                    for (let i = 0; i < 3; i++) ln(ctx, -R * (1.2 + i * 0.4), (i - 1) * R * 0.4, -R * (2 + i * 0.4), (i - 1) * R * 0.4);
                    break;
                }
                case 'titan': {
                    ctx.fillStyle = 'rgba(168,162,158,0.35)';
                    for (let i = 1; i <= 4; i++) circ(ctx, -R * (0.8 + i * 0.5), Math.sin(age * 0.3 + i) * R * 0.3, R * (0.35 - i * 0.05));
                    ctx.save(); ctx.rotate(age * 0.12);
                    const pts = [1, 0.82, 1.05, 0.9, 1.1, 0.78, 0.98, 0.88];
                    ctx.fillStyle = FighterArt.OUT; ctx.beginPath();
                    pts.forEach((f, i) => { const a = i / pts.length * TAU; const x = Math.cos(a) * R * f * 1.08, y = Math.sin(a) * R * f * 1.08; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#78716c'; ctx.beginPath();
                    pts.forEach((f, i) => { const a = i / pts.length * TAU; const x = Math.cos(a) * R * f, y = Math.sin(a) * R * f; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = '#a8a29e'; circ(ctx, -R * 0.3, -R * 0.3, R * 0.25);
                    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5;
                    ctx.beginPath(); ctx.moveTo(-R * 0.6, R * 0.1); ctx.lineTo(-R * 0.1, -R * 0.1); ctx.lineTo(R * 0.2, R * 0.35); ctx.lineTo(R * 0.6, R * 0.15); ctx.stroke();
                    ctx.restore();
                    break;
                }
                case 'viper': {
                    softGlow(ctx, 0, 0, R * 1.6, 'rgba(163,230,53,0.45)');
                    for (let i = 0; i < 3; i++) { const d = (age * 2 + i * 9) % 26; ctx.fillStyle = `rgba(163,230,53,${1 - d / 26})`; circ(ctx, -R * (0.4 + i * 0.4), R * 0.6 + d, R * 0.12); }
                    const wob = Math.sin(age * 0.4) * 0.12;
                    const g = ctx.createRadialGradient(-R * 0.2, -R * 0.2, 0, 0, 0, R);
                    g.addColorStop(0, '#ecfccb'); g.addColorStop(0.4, '#a3e635'); g.addColorStop(1, '#3f6212');
                    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, R * (1 + wob), R * (1 - wob), 0, 0, TAU); ctx.fill();
                    ctx.strokeStyle = 'rgba(236,252,203,0.8)'; ctx.lineWidth = 1.5;
                    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(Math.cos(age * 0.2 + i * 2) * R * 0.45, Math.sin(age * 0.25 + i * 2) * R * 0.45, R * 0.13, 0, TAU); ctx.stroke(); }
                    break;
                }
                default: {
                    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, R * 1.4);
                    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, c); g.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = g; circ(ctx, 0, 0, R * 1.4);
                }
            }
            ctx.restore();
        }
    }

    drawParticles(ctx) {
        ctx.save();
        ctx.lineCap = 'round';
        for (const pt of this.particles) {
            ctx.globalAlpha = Math.max(0, Math.min(1, pt.alpha));
            if (pt.type === 'ring') {
                ctx.strokeStyle = pt.color; ctx.lineWidth = pt.width || 3;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2); ctx.stroke();
            } else if (pt.type === 'spark') {
                const sp = Math.hypot(pt.vx, pt.vy) || 1;
                ctx.strokeStyle = pt.color; ctx.lineWidth = 3;
                ln(ctx, pt.x, pt.y, pt.x - pt.vx / sp * pt.len, pt.y - pt.vy / sp * pt.len);
            } else {
                ctx.fillStyle = pt.color;
                ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.restore();
    }

    drawFloatingTexts(ctx) {
        // Rectángulo visible en coordenadas del mundo: los textos se mantienen dentro del encuadre
        const zoom = Math.max(0.2, this.camera.zoom * (1 + (this.camera.kick || 0)));
        const halfW = this.canvas.width / 2 / zoom, halfH = this.canvas.height / 2 / zoom;
        const m = 10 / zoom;
        const visL = this.camera.x - halfW + m, visR = this.camera.x + halfW - m;
        const visT = this.camera.y - halfH + m, visB = this.camera.y + halfH - m;
        for (const ft of this.floatingTexts) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, ft.life / 20);
            ctx.font = `900 ${ft.size}px "Rajdhani", sans-serif`;
            ctx.textAlign = 'center';
            const tw = ctx.measureText(ft.text).width;
            let x = ft.x, y = ft.y;
            if (visR - visL > tw) x = Math.max(visL + tw / 2, Math.min(visR - tw / 2, x));
            y = Math.max(visT + ft.size, Math.min(visB, y));
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 4;
            ctx.strokeText(ft.text, x, y);
            ctx.fillStyle = ft.color;
            ctx.fillText(ft.text, x, y);
            ctx.restore();
        }
    }
}

(function attachBattleArenaRender() {
    for (const name of Object.getOwnPropertyNames(BattleArenaRender.prototype)) {
        if (name === 'constructor') continue;
        Object.defineProperty(BattleArenaEngine.prototype, name, Object.getOwnPropertyDescriptor(BattleArenaRender.prototype, name));
    }
})();
