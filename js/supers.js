'use strict';
// =====================================================================
// SÚPER ÚNICOS POR LUCHADOR
// Cada súper es una "zona" (engine.zones) que el host simula y envía en el snapshot (zn).
// Cyborg conserva su láser (proyectil); los jefes/enemigos sin entrada aquí también.
// =====================================================================
const SuperMoves = (() => {
    const KIND = { ronin: 'slash', blaze: 'lava', storm: 'bolts', vixen: 'spectre', zephyra: 'tornado', titan: 'spikes', viper: 'whip' };
    const LIFE = { slash: 18, lava: 270, bolts: 76, spectre: 30, tornado: 110, spikes: 62, whip: 66 };
    const BOLT_LOCK = [4, 22, 40];
    const BOLT_HIT = [18, 36, 54];
    const SPIKES = 7;
    const POISON_FRAMES = 150;
    const LAVA_START = 30;
    const LAVA_TICK = 20;

    const has = f => !!KIND[f && f.archetype && f.archetype.id];
    const rid = () => Math.random().toString(36).slice(2);
    const clampX = (e, x) => Math.max(40, Math.min(e.worldWidth - 40, x));
    const ownerOf = (e, z) => e.fighters.find(f => f.id === z.o);
    const foes = (e, o) => e.fighters.filter(t => t.alive && t.id !== o.id && e.isEnemy(o, t) && e.sameLane(o, t));

    // Daño de súper (bloqueable salvo que se indique). Devuelve true si conectó.
    function hit(e, o, t, dmg, kx, ky, opts) {
        return e.applyDamage(o, t, dmg, kx, ky, Object.assign({ kind: 'super', projectile: true }, opts || {}));
    }
    // Daño continuo: no aturde ni da barra a nadie
    function tickDamage(e, o, t, dmg) {
        const mpT = t.mp, mpO = o.mp;
        e.applyDamage(o, t, dmg, 0, 0, { kind: 'light', chip: true, unblockable: true, projectile: true });
        t.mp = mpT; o.mp = mpO;
    }

    function spawn(e, f) {
        const k = KIND[f.archetype.id];
        const d = f.facing || 1;
        const z = { id: rid(), k, o: f.id, team: f.team, x: f.x, y: f.y, d, a: 0, l: LIFE[k], hits: {}, c: {}, xs: [] };
        z.x0 = f.x;
        if (k === 'spectre') {
            let best = null, bd = 520;
            for (const t of foes(e, f)) {
                const dx = (t.x - f.x) * d;
                if (dx > 0 && dx < bd) { bd = dx; best = t; }
            }
            z.sx = f.x;
            z.hasT = !!best;
            z.ex = clampX(e, best ? best.x + d * 110 : f.x + d * 380);
            f.invuln = Math.max(f.invuln || 0, 28);
        } else if (k === 'tornado') {
            z.x = clampX(e, f.x + d * 80);
            z.vx = d * 3.4;
        }
        (e.zones = e.zones || []).push(z);
        e.camera.shake = Math.max(e.camera.shake, 10);
        e.spawnBurst(f.x + d * 40, f.y - 70, f.archetype.projColor || '#facc15', 16);
    }

    function update(e) {
        const zones = e.zones = e.zones || [];
        // Veneno: 10 de vida cada 0,5 s durante 2,5 s; nunca mata
        for (const t of e.fighters) {
            if (!(t.poison > 0)) continue;
            if (!t.alive) { t.poison = 0; continue; }
            t.poison--;
            if (t.poison % 30 === 0) {
                const burn = t.dotK === 'burn', n = burn ? 8 : 10, col = burn ? '#f97316' : '#84cc16';
                t.hp = Math.max(1, t.hp - n);
                e.addFloatingText(t.x, t.y - 120, `-${n}`, col, 13);
                e.spawnBurst(t.x, t.y - 60, col, 5);
            }
        }
        e.lavaOn = false;
        for (let i = zones.length - 1; i >= 0; i--) {
            const z = zones[i];
            const o = ownerOf(e, z);
            if (!o || !o.alive && z.k !== 'lava') { zones.splice(i, 1); continue; }
            z.a++;
            STEP[z.k](e, z, o);
            if (z.k === 'lava' && z.a >= LAVA_START) e.lavaOn = true;
            if (z.a >= z.l) zones.splice(i, 1);
        }
    }

    const STEP = {
        // RONIN · tajo ancho de katana
        slash(e, z, o) {
            if (z.a !== 2) return;
            const d = z.d;
            for (const t of foes(e, o)) {
                const dx = (t.x - o.x) * d;
                if (dx > -30 && dx < 205 && Math.abs((t.y - 54) - (o.y - 70)) < 125) {
                    hit(e, o, t, 185, d * 12, -8, { knockdown: true });
                }
            }
        },
        // STORM · tres rayos con aviso en el suelo
        bolts(e, z, o) {
            const d = z.d;
            for (let i = 0; i < 3; i++) {
                if (z.a === BOLT_LOCK[i]) {
                    let best = null, bd = 1e9;
                    for (const t of foes(e, o)) { const dist = Math.abs(t.x - o.x); if (dist < bd) { bd = dist; best = t; } }
                    z.xs[i] = clampX(e, best ? best.x : o.x + d * 220);
                }
                if (z.a === BOLT_HIT[i] && z.xs[i] !== undefined) {
                    e.camera.shake = Math.max(e.camera.shake, 7);
                    e.spawnBurst(z.xs[i], z.y - 10, '#fde047', 10);
                    for (const t of foes(e, o)) {
                        if (Math.abs(t.x - z.xs[i]) < 62) hit(e, o, t, i === 2 ? 90 : 70, 0, -7, { knockdown: i === 2 });
                    }
                }
            }
        },
        // VIXEN · atraviesa al rival en forma de espectro (no se bloquea)
        spectre(e, z, o) {
            if (z.a !== 8) return;
            const lo = Math.min(z.sx, z.ex) - 40, hi = Math.max(z.sx, z.ex) + 40;
            o.x = z.ex; o.vx = 0;
            e.spawnBurst(z.ex, o.y - 60, '#a855f7', 14);
            if (!z.hasT) return;
            for (const t of foes(e, o)) {
                if (t.x >= lo && t.x <= hi) hit(e, o, t, 180, z.d * 6, -9, { knockdown: true, unblockable: true });
            }
        },
        // ZEPHYRA · tornado que atrapa y lanza por el aire
        tornado(e, z, o) {
            z.x += z.vx;
            if (z.x < 40 || z.x > e.worldWidth - 40) { z.x = clampX(e, z.x); z.l = Math.min(z.l, z.a + 8); }
            for (const t of foes(e, o)) {
                if (z.hits[t.id] || t.invuln > 0) continue;
                if (Math.abs(t.x - z.x) > 75 && !z.c[t.id]) continue;
                const n = z.c[t.id] = (z.c[t.id] || 0) + 1;
                if (Math.abs(t.x - z.x) > 120) { delete z.c[t.id]; continue; }
                t.state = 'hurt'; t.stateTimer = t.stateMax = 6;
                t.blocking = false; t.crouching = false; t.onGround = false;
                t.vy = -3.5; t.vx = (z.x - t.x) * 0.15;
                if (n % 10 === 0 && n < 40) tickDamage(e, o, t, 15);
                if (n === 40) {
                    t.inJuggle = true; t.juggleHits = 0;
                    hit(e, o, t, 140, z.d * 5, -17, { knockdown: true, unblockable: true });
                    z.hits[t.id] = 1;
                }
            }
        },
        // TITAN · pisotón: picos de roca en cadena, solo golpean a quien está en el suelo
        spikes(e, z, o) {
            for (let i = 1; i <= SPIKES; i++) {
                if (z.a !== 5 + i * 4) continue;
                const sx = z.x0 + z.d * (70 + i * 88);
                if (sx < 30 || sx > e.worldWidth - 30) continue;
                e.spawnBurst(sx, z.y - 10, '#a8a29e', 6);
                if (i % 2) e.camera.shake = Math.max(e.camera.shake, 6);
                for (const t of foes(e, o)) {
                    if (z.hits[t.id] || !t.onGround || t.inJuggle) continue;
                    if (Math.abs(t.x - sx) < 52) {
                        if (hit(e, o, t, 165, z.d * 2, -15, { knockdown: true })) z.hits[t.id] = 1;
                    }
                }
            }
        },
        // VIPER · látigo que dura y envenena
        whip(e, z, o) {
            z.x = o.x; z.y = o.y;
            if (z.a % 16 !== 8) return;
            for (const t of foes(e, o)) {
                const dx = (t.x - o.x) * z.d;
                if (dx < -10 || dx > 295 || Math.abs((t.y - 54) - (o.y - 80)) > 115) continue;
                if ((z.hits[t.id] || 0) >= 4) continue;
                if (hit(e, o, t, 35, z.d * 2, -3)) {
                    z.hits[t.id] = (z.hits[t.id] || 0) + 1;
                    t.poison = POISON_FRAMES; t.dotK = 'poison';
                }
            }
        },
        // BLAZE · el suelo es lava: daño creciente a quien se quede en tierra
        lava(e, z, o) {
            if (z.a < LAVA_START || (z.a - LAVA_START) % LAVA_TICK !== 0) return;
            for (const t of e.fighters) {
                if (!t.alive || t.id === o.id || !e.isEnemy(o, t) || !e.sameLane(o, t)) continue;
                if (t.onGround && !t.inJuggle && t.invuln <= 0) {
                    const st = z.hits[t.id] = (z.hits[t.id] || 0) + 1;
                    tickDamage(e, o, t, Math.min(36, 8 + 3 * st));
                    e.spawnBurst(t.x, t.y - 20, '#f97316', 5);
                } else if (z.hits[t.id]) {
                    z.hits[t.id] = Math.max(0, z.hits[t.id] - 1);
                }
            }
        }
    };

    // Los bots saltan para salir de la lava ajena
    function botHint(e, f, cmd) {
        if (!e.lavaOn || !f.onGround || Math.random() > 0.1) return;
        const z = (e.zones || []).find(q => q.k === 'lava' && q.a >= LAVA_START);
        if (!z) return;
        const o = ownerOf(e, z);
        if (o && o.id !== f.id && e.isEnemy(o, f)) cmd.up = true;
    }

    function tickClient(e) { for (const z of (e.zones || [])) z.a++; }
    function pack(e) { return (e.zones || []).map(z => ({ id: z.id, k: z.k, o: z.o, x: Math.round(z.x), y: Math.round(z.y), d: z.d, a: z.a, l: z.l, x0: Math.round(z.x0), sx: z.sx, ex: z.ex, xs: z.xs, hasT: z.hasT })); }
    function unpack(e, list) {
        const mine = new Map((e.zones || []).map(z => [z.id, z]));
        e.zones = (list || []).map(s => { const lz = mine.get(s.id); if (lz) { lz.a = s.a; lz.x = s.x; lz.xs = s.xs; return lz; } return Object.assign({}, s); });
    }

    // ------------------------------------------------------------ dibujo
    const ease = p => 1 - (1 - p) * (1 - p);
    function drawAll(ctx, e) {
        for (const z of (e.zones || [])) {
            ctx.save();
            try { DRAW[z.k](ctx, e, z); } finally { ctx.restore(); }
        }
    }
    const DRAW = {
        slash(ctx, e, z) {
            const p = Math.min(1, z.a / z.l), d = z.d;
            if (z.a < 1) return;
            ctx.translate(z.x + d * 60, z.y - 74); ctx.scale(d, 1);
            const sweep = Math.min(1, z.a / 6);
            ctx.lineCap = 'round';
            for (const [w, col, al] of [[34, '#38bdf8', 0.35], [20, '#e0f2fe', 0.8], [8, '#ffffff', 1]]) {
                ctx.globalAlpha = (1 - p) * al; ctx.strokeStyle = col; ctx.lineWidth = w * (1 - p * 0.5);
                ctx.beginPath(); ctx.arc(-70, 0, 175, -1.05, -1.05 + 2.1 * sweep); ctx.stroke();
            }
        },
        bolts(ctx, e, z) {
            for (let i = 0; i < 3; i++) {
                const x = z.xs[i]; if (x === undefined) continue;
                const hitA = BOLT_HIT[i];
                if (z.a < hitA) {
                    const k = (z.a - BOLT_LOCK[i]) / (hitA - BOLT_LOCK[i]);
                    ctx.globalAlpha = 0.25 + k * 0.6; ctx.strokeStyle = '#fde047'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.ellipse(x, z.y, 62 * (1.1 - k * 0.3), 12, 0, 0, TAU); ctx.stroke();
                    ctx.globalAlpha = 0.18 + k * 0.2; ctx.fillStyle = '#facc15';
                    ctx.beginPath(); ctx.ellipse(x, z.y, 40 * k, 8 * k, 0, 0, TAU); ctx.fill();
                } else if (z.a < hitA + 10) {
                    const k = (z.a - hitA) / 10;
                    softGlow(ctx, x, z.y - 40, 130, 'rgba(250,204,21,' + (0.55 * (1 - k)) + ')');
                    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                    for (const [w, col] of [[16, 'rgba(96,165,250,0.6)'], [7, '#fef08a'], [3, '#ffffff']]) {
                        ctx.globalAlpha = 1 - k; ctx.strokeStyle = col; ctx.lineWidth = w;
                        ctx.beginPath(); ctx.moveTo(x + Math.sin(i * 9 + z.a) * 14, z.y - 900);
                        for (let s = 1; s <= 9; s++) ctx.lineTo(x + Math.sin(i * 13 + s * 5.1 + z.a * 0.7) * (22 - s), z.y - 900 + s * ((900) / 9));
                        ctx.stroke();
                    }
                }
            }
        },
        spectre(ctx, e, z) {
            const k = Math.min(1, z.a / z.l);
            const a = Math.min(z.sx, z.ex), b = Math.max(z.sx, z.ex);
            const y = z.y - 62;
            if (z.a < 8) {
                ctx.globalAlpha = 0.35 + z.a * 0.05; softGlow(ctx, z.sx, y, 90, 'rgba(168,85,247,0.7)');
                return;
            }
            const f = 1 - (z.a - 8) / (z.l - 8);
            const g = ctx.createLinearGradient(a, 0, b, 0);
            g.addColorStop(0, 'rgba(168,85,247,0)'); g.addColorStop(0.5, 'rgba(232,121,249,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
            ctx.globalAlpha = Math.max(0, f); ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(a, y); ctx.quadraticCurveTo((a + b) / 2, y - 26, b, y - 4); ctx.quadraticCurveTo((a + b) / 2, y + 26, a, y + 4); ctx.closePath(); ctx.fill();
            for (let i = 0; i < 5; i++) {
                const x = z.sx + (z.ex - z.sx) * (i / 4);
                ctx.globalAlpha = Math.max(0, f) * 0.35; ctx.fillStyle = '#c084fc';
                ctx.beginPath(); ctx.ellipse(x, y, 22, 54, 0, 0, TAU); ctx.fill();
            }
            softGlow(ctx, z.ex, y, 110 * f, 'rgba(232,121,249,0.6)');
        },
        tornado(ctx, e, z) {
            const f = z.a > z.l - 14 ? (z.l - z.a) / 14 : Math.min(1, z.a / 8);
            ctx.translate(z.x, z.y);
            for (let i = 0; i < 9; i++) {
                const w = 26 + i * 11, yy = -i * 19 - 8;
                ctx.globalAlpha = f * (0.75 - i * 0.05);
                ctx.strokeStyle = i % 2 ? '#a7f3d0' : '#34d399'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.ellipse(Math.sin(z.a * 0.4 + i) * 7, yy, w, 9, 0, 0, TAU); ctx.stroke();
            }
            ctx.globalAlpha = f * 0.25; ctx.fillStyle = '#d1fae5';
            ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-110, -178); ctx.lineTo(110, -178); ctx.lineTo(26, 0); ctx.closePath(); ctx.fill();
        },
        spikes(ctx, e, z) {
            for (let i = 1; i <= SPIKES; i++) {
                const sx = z.x0 + z.d * (70 + i * 88), ea = 5 + i * 4;
                if (z.a < ea - 3 || sx < 30 || sx > e.worldWidth - 30) continue;
                if (z.a < ea) { ctx.globalAlpha = 0.6; ctx.fillStyle = '#44403c'; ctx.fillRect(sx - 30, z.y - 3, 60, 4); continue; }
                const up = Math.min(1, (z.a - ea) / 4), down = z.a > ea + 22 ? Math.max(0, 1 - (z.a - ea - 22) / 14) : 1;
                const h = 125 * ease(up) * down; if (h < 2) continue;
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#78716c'; ctx.beginPath(); ctx.moveTo(sx - 30, z.y); ctx.lineTo(sx + 4, z.y - h); ctx.lineTo(sx + 30, z.y); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#d6d3d1'; ctx.beginPath(); ctx.moveTo(sx - 30, z.y); ctx.lineTo(sx + 4, z.y - h); ctx.lineTo(sx - 6, z.y); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 30, z.y); ctx.lineTo(sx + 4, z.y - h); ctx.lineTo(sx + 30, z.y); ctx.stroke();
            }
        },
        whip(ctx, e, z) {
            const f = z.a > z.l - 8 ? (z.l - z.a) / 8 : 1;
            const len = Math.min(290, z.a * 48) * f;
            if (len < 6) return;
            const d = z.d, y0 = z.y - 82;
            ctx.translate(z.x + d * 24, y0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const pts = [];
            for (let s = 0; s <= 14; s++) { const t = s / 14; pts.push([d * len * t, Math.sin(t * Math.PI * 3 - z.a * 0.55) * 20 * (0.3 + t * 0.7) - t * 12]); }
            for (const [w, col, al] of [[14, '#365314', 0.5], [7, '#84cc16', 1], [3, '#d9f99d', 1]]) {
                ctx.globalAlpha = al * f; ctx.strokeStyle = col; ctx.lineWidth = w;
                ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
            }
            const tip = pts[pts.length - 1]; ctx.globalAlpha = f; softGlow(ctx, tip[0], tip[1], 26, 'rgba(163,230,53,0.7)');
        },
        lava(ctx, e, z) {
            const gy = z.y, W = e.worldWidth + 100;
            const f = z.a > z.l - 24 ? (z.l - z.a) / 24 : 1;
            if (z.a < LAVA_START) {
                const k = z.a / LAVA_START;
                ctx.globalAlpha = k * 0.55; ctx.fillStyle = '#dc2626'; ctx.fillRect(-50, gy - 4, W, 10);
                ctx.globalAlpha = k * 0.9; ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3;
                ctx.beginPath(); for (let x = -50; x < W; x += 70) { ctx.moveTo(x, gy + 2); ctx.lineTo(x + 28, gy + 14); ctx.lineTo(x + 50, gy + 4); } ctx.stroke();
                return;
            }
            const g = ctx.createLinearGradient(0, gy - 26, 0, gy + 70);
            g.addColorStop(0, 'rgba(251,191,36,0.9)'); g.addColorStop(0.35, 'rgba(239,68,68,0.75)'); g.addColorStop(1, 'rgba(127,29,29,0.65)');
            ctx.globalAlpha = f; ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(-50, gy + 70); ctx.lineTo(-50, gy - 8);
            for (let x = -50; x <= W; x += 24) ctx.lineTo(x, gy - 10 + Math.sin(x * 0.05 + z.a * 0.2) * 7);
            ctx.lineTo(W, gy + 70); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fde047';
            for (let i = 0; i < 14; i++) { const bx = ((i * 137 + z.a * 3) % W) - 50, by = gy - 4 + ((i * 53 + z.a) % 40); ctx.globalAlpha = f * 0.7; ctx.beginPath(); ctx.arc(bx, by, 3 + (i % 3), 0, TAU); ctx.fill(); }
        }
    };

    return { has, spawn, update, botHint, tickClient, pack, unpack, drawAll, POISON_FRAMES };
})();
