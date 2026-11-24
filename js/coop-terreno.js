'use strict';
// =========================================================================
// COOPERATIVO · TERRENO DE CADA NIVEL (estilo Double Dragon)
//   lake   → río / lago / abismo que cruza TODOS los carriles: caminando no se pasa, hay que SALTAR (salto largo,
//            o salto corto + piedra intermedia). Caer dentro = daño y vuelves a la orilla más cercana.
//   puddle → charco peligroso (lava, ácido, descarga, espinas, fuego…) que hay que esquivar o saltar.
//   plat   → plataforma / cajas / escalones a los que se sube saltando (de un solo sentido, se camina por debajo).
// Los lagos se colocan SOLO en los pasillos entre combates: las zonas de pelea (cámara bloqueada) no tienen lagos.
// Todo el terreno es determinista (sale de COOP_LEVELS), así que el invitado no necesita sincronizarlo.
// =========================================================================
const COOP_TERRAIN_THEME = {
    suzaku:  { lake: 'water',  pud: 'fire',     plat: 'wood',  lakeName: 'ESTANQUE',  hint: 'Salta el estanque' },
    volcano: { lake: 'lava',   pud: 'lava',     plat: 'rock',  lakeName: 'RÍO DE LAVA', hint: 'Salta la lava' },
    eclipse: { lake: 'void',   pud: 'void',     plat: 'stone', lakeName: 'ABISMO',    hint: 'Salta el abismo' },
    cyber:   { lake: 'data',   pud: 'electric', plat: 'metal', lakeName: 'VACÍO DIGITAL', hint: 'Salta el vacío' },
    lab:     { lake: 'acid',   pud: 'electric', plat: 'metal', lakeName: 'TANQUE DE ÁCIDO', hint: 'Salta el tanque' },
    emerald: { lake: 'water',  pud: 'spikes',   plat: 'wood',  lakeName: 'LAGO',      hint: 'Salta el lago' },
    seismic: { lake: 'chasm',  pud: 'spikes',   plat: 'rock',  lakeName: 'GRIETA',    hint: 'Salta la grieta' },
    toxic:   { lake: 'acid',   pud: 'acid',     plat: 'metal', lakeName: 'LAGO TÓXICO', hint: 'Salta el lago' }
};
// Aspecto de cada líquido / charco: [superficie, fondo, brillo]
const COOP_TERRAIN_LOOK = {
    water:    { a: '#38bdf8', b: '#0c4a6e', glow: 'rgba(125,211,252,.5)', bank: '#64748b' },
    lava:     { a: '#fb923c', b: '#7c1d09', glow: 'rgba(251,146,60,.65)', bank: '#44160a' },
    void:     { a: '#6d28d9', b: '#0b0220', glow: 'rgba(167,139,250,.5)', bank: '#2e1065' },
    data:     { a: '#22d3ee', b: '#020b1f', glow: 'rgba(34,211,238,.55)', bank: '#0e7490' },
    acid:     { a: '#a3e635', b: '#1a3a05', glow: 'rgba(190,242,100,.5)', bank: '#3f6212' },
    chasm:    { a: '#f97316', b: '#050202', glow: 'rgba(249,115,22,.4)', bank: '#292524' },
    fire:     { a: '#fbbf24', b: '#b91c1c', glow: 'rgba(251,146,60,.6)', bank: '#7c2d12' },
    electric: { a: '#67e8f9', b: '#1e3a8a', glow: 'rgba(103,232,249,.6)', bank: '#334155' },
    spikes:   { a: '#d6d3d1', b: '#44403c', glow: 'rgba(214,211,209,.3)', bank: '#292524' }
};
const COOP_PLAT_LOOK = {
    wood:  { top: '#a16207', face: '#713f12', edge: '#fde68a' },
    rock:  { top: '#78716c', face: '#44403c', edge: '#d6d3d1' },
    stone: { top: '#6b5b95', face: '#3b2f63', edge: '#c4b5fd' },
    metal: { top: '#64748b', face: '#334155', edge: '#e2e8f0' }
};
COOP.LAKE_DMG = 70;        // caer a un lago
COOP.PUDDLE_DMG = 16;      // por pisada en un charco
COOP.PUDDLE_TICK = 38;     // fotogramas entre daños
COOP.LAKE_EDGE = 14;       // margen del muro invisible dentro del lago
COOP.PLAT_Z = 150;         // las plataformas cubren todos los carriles

function buildTerrain(i, arenaId) {
    const th = COOP_TERRAIN_THEME[arenaId] || COOP_TERRAIN_THEME.suzaku;
    const items = [];
    const s = ((i * 37) % 70) - 20;          // pequeño desplazamiento distinto por nivel
    const pw = arenaId === 'volcano' || arenaId === 'toxic' ? 1.35 : 1;
    const lake = (x, w, stone) => {
        items.push({ k: 'lake', style: th.lake, x, w, name: th.lakeName });
        if (stone) items.push({ k: 'plat', style: th.plat, x: x + w / 2 - 45, w: 90, ph: 38, stone: 1 });
    };
    const pud = (x, w, z0, z1) => items.push({ k: 'puddle', style: th.pud, x: x + s, w: Math.round(w * pw), z0, z1, pulse: th.pud === 'electric' ? 1 : 0 });
    const crate = (x, w, ph = 48) => items.push({ k: 'plat', style: th.plat, x: x + s, w, ph });
    const stairs = (x) => { [40, 80, 120, 80, 40].forEach((ph, n) => items.push({ k: 'plat', style: th.plat, x: x + n * 74, w: 74, ph, step: 1 })); };
    const ledges = (x) => { [[0, 55], [170, 95], [340, 55]].forEach(([dx, ph]) => items.push({ k: 'plat', style: th.plat, x: x + dx, w: 120, ph })); };

    // Zona de combate 1 (cámara 650–1950)
    pud(900, 190, 15, 105); crate(1620, 170);
    // Pasillo 1: lago + escalones
    lake(2170 + (i % 4) * 5, 220 + (i % 4) * 10, false);
    stairs(2520);
    // Zona 2 (2650–3950)
    pud(3000, 220, 40, 140); crate(3560, 180);
    // Pasillo 2: lago ancho con piedra intermedia (salto corto + salto corto) y charco
    lake(4140, 320, true);
    pud(4560, 150, 20, 150);
    // Zona 3 (4650–5950)
    pud(5000, 200, 0, 80); pud(5420, 160, 70, 150); crate(5700, 200);
    // Pasillo 3: lago + plataformas
    lake(6080, 240, false);
    if (i % 2) ledges(6430); else stairs(6430);
    // Zona 4 (6450–7750)
    pud(6900, 200, 25, 120); crate(7400, 180);
    // Pasillo 4 y arena del jefe (8250–9550)
    stairs(7800); pud(8130, 130, 30, 120);
    pud(8620, 150, 0, 60); pud(9080, 150, 90, 150);
    // Firma de cada nivel
    if (arenaId === 'eclipse') ledges(3700);
    if (arenaId === 'cyber' || arenaId === 'lab') pud(1980, 160, 60, 150);
    if (arenaId === 'seismic') pud(2980, 160, 0, 60);
    return items;
}
COOP_LEVELS.forEach((lv, i) => { lv.terrain = buildTerrain(i, lv.arenaId); });

// =========================================================================
// Física y dibujo del terreno dentro del motor cooperativo
// =========================================================================
Object.assign(CoopArenaEngine.prototype, {
    terrainSetup() {
        const t = (this.level && this.level.terrain) || [];
        this.lakes = t.filter(o => o.k === 'lake');
        this.puddles = t.filter(o => o.k === 'puddle');
        this.plats = t.filter(o => o.k === 'plat');
    },
    // ¿Está x dentro de un lago? (con margen)
    lakeAt(x, pad = 0) { return (this.lakes || []).find(l => x > l.x - pad && x < l.x + l.w + pad) || null; },
    // Saca una posición de un lago (aparición de enemigos, medallas): a la orilla más cercana
    safeX(x) {
        const l = this.lakeAt(x, 30);
        if (!l) return x;
        return x < l.x + l.w / 2 ? l.x - 40 : l.x + l.w + 40;
    },
    // Plataformas de un luchador: la altura es relativa a su carril de profundidad (z)
    platsFor(f) {
        const out = [];
        const gy = this.groundY + (f.z || 0);
        for (const p of (this.plats || [])) {
            if (f.x < p.x - 80 || f.x > p.x + p.w + 80) continue;
            out.push({ x: p.x, w: p.w, y: gy - p.ph, ph: p.ph, h: 12, dx: 0, dy: 0 });
        }
        return out;
    },
    terrainPre(f, cmd) { this.platforms = this.platsFor(f); },
    // (se llama al inicio de processFighterLogic, antes de leer el salto)
    botHop(f, cmd) {
        // Aliados controlados por la IA: cruzan los lagos (salto largo, o dos cortos usando la piedra intermedia)
        if (!f.isBot || !f.alive || !this.isPlayerSide(f) || cmd.jumpType || !(cmd.left || cmd.right)) return;
        if (LOCKED_STATES.has(f.state) || f.stunTimer > 0 || f.blockStun > 0) return;
        const dir = cmd.right ? 1 : -1, E = COOP.LAKE_EDGE;
        if (f.onGround && f.onPlat) {
            // sobre la piedra: avanza hasta su borde y salta corto
            const l = this.lakeAt(f.x, 0);
            if (!l) return;
            const st = this.plats.find(o => o.stone && o.x >= l.x && o.x + o.w <= l.x + l.w + 1);
            if (st && (dir > 0 ? f.x > st.x + st.w - 26 : f.x < st.x + 26)) { f.facing = dir; cmd.jumpType = 'short'; }
            return;
        }
        if (!f.onGround) return;
        const l = (this.lakes || []).find(o => dir > 0 ? (f.x <= o.x + E + 1 && o.x - f.x < 60) : (f.x >= o.x + o.w - E - 1 && f.x - (o.x + o.w) < 60));
        if (!l) return;
        const gap = dir > 0 ? l.x + E - f.x : f.x - (l.x + l.w - E);
        if (gap > 24) return;                               // se acerca primero a la orilla
        const stone = this.plats.some(o => o.stone && o.x >= l.x && o.x + o.w <= l.x + l.w + 1);
        f.facing = dir; cmd.jumpType = stone ? 'short' : 'long';
    },
    // Tras la física base: muros del lago, caída al agua y charcos
    terrainPost(f, wasGround, prevX) {
        this.platforms = [];
        if (!f.alive) return;
        if (f.onGround && !this.lakeAt(f.x, -COOP.LAKE_EDGE)) f.lastGroundX = f.x;      // de dónde viene (para volver si cae)
        const lane = this.groundY + (f.z || 0);
        const E = COOP.LAKE_EDGE;
        for (const l of (this.lakes || [])) {
            if (f.x <= l.x + E || f.x >= l.x + l.w - E) continue;
            if (f.onPlat || f.y < lane - 3) continue;         // sobre la piedra o saltando por encima
            if (f.onGround && wasGround && f.state !== 'down' && f.state !== 'hurt') {
                // andando contra el borde: muro invisible
                f.x = prevX <= l.x + l.w / 2 ? l.x + E : l.x + l.w - E;
                f.vx = 0;
            } else if (f.onGround) {
                // aterrizó dentro (salto corto), o lo lanzaron / tumbaron dentro: cae
                this.fallInLake(f, l);
            }
            break;
        }
        // Charcos: daño periódico a quien los pisa
        if (f.puddleCd > 0) f.puddleCd--;
        if (f.onGround && !f.onPlat && this.isHost && !(f.puddleCd > 0) && f.invuln <= 0) {
            for (const p of (this.puddles || [])) {
                if (f.x < p.x - 6 || f.x > p.x + p.w + 6) continue;
                const z = f.z || 0;
                if (z < p.z0 - 8 || z > p.z1 + 8) continue;
                if (p.pulse && !this.puddleOn(p)) continue;
                f.puddleCd = COOP.PUDDLE_TICK;
                const dir = f.x < p.x + p.w / 2 ? -1 : 1;
                const dmg = Math.round(COOP.PUDDLE_DMG * (f.boss ? 0.6 : 1));
                this.applyDamage(null, f, dmg, dir * 5, -6.5, { kind: 'hazard' });
                break;
            }
        }
    },
    puddleOn(p) { return ((this.time * 0.7 + p.x * 0.013) % 2) < 1.25; },
    fallInLake(f, l) {
        const ref = f.lastGroundX !== undefined ? f.lastGroundX : f.x;
        const left = ref < l.x + l.w / 2;
        const look = COOP_TERRAIN_LOOK[l.style] || COOP_TERRAIN_LOOK.water;
        f.x = left ? l.x - 26 : l.x + l.w + 26;
        f.y = this.groundY + (f.z || 0);
        f.vx = 0; f.vy = 0; f.airVx = undefined; f.onGround = true; f.knockdown = false; f.inJuggle = false;
        f.state = 'idle'; f.stateTimer = 0;
        if (this.isHost) {
            f.hp = Math.max(1, f.hp - COOP.LAKE_DMG);
            f.invuln = Math.max(f.invuln || 0, 70);
            this.addFloatingText(f.x, f.y - 120, `¡${l.style === 'void' || l.style === 'chasm' || l.style === 'data' ? 'CAÍSTE' : 'AL ' + (l.style === 'water' ? 'AGUA' : l.style === 'lava' ? 'FUEGO' : 'ÁCIDO')}! -${COOP.LAKE_DMG}`, look.a, 17);
            this.fx({ k: 'burst', x: f.x, y: f.y - 20, c: look.a, n: 16 });
            this.fx({ k: 'snd', n: 'thud' });
            this.fx({ k: 'shake', v: 5 });
        }
    },

    // ----- Dibujo -----
    drawTerrain(ctx) {
        const halfW = this.halfView(), cx = this.camera.x, gy = this.groundY, Z = COOP.Z_MAX, t = this.time;
        const vis = (x, w) => x + w > cx - halfW - 40 && x < cx + halfW + 40;
        for (const l of (this.lakes || [])) if (vis(l.x, l.w)) this.drawLake(ctx, l, gy, Z, t);
        for (const p of (this.puddles || [])) if (vis(p.x, p.w)) this.drawPuddle(ctx, p, gy, t);
        for (const p of (this.plats || [])) if (vis(p.x, p.w)) this.drawPlat(ctx, p, gy, Z);
    },
    drawLake(ctx, l, gy, Z, t) {
        const L = COOP_TERRAIN_LOOK[l.style] || COOP_TERRAIN_LOOK.water;
        const y0 = gy - 2, y1 = gy + Z + 70;
        ctx.save();
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, L.a); g.addColorStop(0.35, L.b); g.addColorStop(1, L.b);
        ctx.fillStyle = g; ctx.fillRect(l.x, y0, l.w, y1 - y0);
        ctx.beginPath(); ctx.rect(l.x, y0, l.w, y1 - y0); ctx.clip();
        // olas / destellos
        ctx.lineWidth = 2;
        for (let r = 0; r < 7; r++) {
            const yy = y0 + 14 + r * ((y1 - y0) / 7);
            ctx.strokeStyle = r % 2 ? 'rgba(255,255,255,.18)' : L.glow;
            ctx.beginPath();
            for (let x = l.x; x <= l.x + l.w; x += 12) { const y = yy + Math.sin(x * 0.045 + t * 2.2 + r * 1.3) * 3; if (x === l.x) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
            ctx.stroke();
        }
        if (l.style === 'lava' || l.style === 'chasm') {
            for (let k = 0; k < 6; k++) { const bx = l.x + ((k * 53 + (t * 14) % 53) % l.w), by = y0 + 20 + ((k * 37 + t * 10) % (y1 - y0 - 30)); ctx.fillStyle = 'rgba(253,224,71,.6)'; ctx.beginPath(); ctx.arc(bx, by, 3 + (k % 3), 0, TAU); ctx.fill(); }
        }
        if (l.style === 'data') {
            ctx.strokeStyle = 'rgba(34,211,238,.35)'; ctx.lineWidth = 1;
            for (let x = l.x; x < l.x + l.w; x += 26) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
        }
        ctx.restore();
        // orillas
        ctx.save();
        ctx.fillStyle = L.bank;
        ctx.fillRect(l.x - 8, y0 - 3, 10, y1 - y0 + 3); ctx.fillRect(l.x + l.w - 2, y0 - 3, 10, y1 - y0 + 3);
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(l.x, y0); ctx.lineTo(l.x, y1); ctx.moveTo(l.x + l.w, y0); ctx.lineTo(l.x + l.w, y1); ctx.stroke();
        softGlow(ctx, l.x + l.w / 2, gy + Z / 2, l.w * 0.8, L.glow.replace(/[\d.]+\)$/, '0.18)'));
        ctx.restore();
    },
    drawPuddle(ctx, p, gy, t) {
        const L = COOP_TERRAIN_LOOK[p.style] || COOP_TERRAIN_LOOK.lava;
        const on = !p.pulse || this.puddleOn(p);
        const cy = gy + (p.z0 + p.z1) / 2 + 6, rx = p.w / 2, ry = Math.max(16, (p.z1 - p.z0) / 2 + 12);
        ctx.save();
        ctx.translate(p.x + rx, cy);
        softGlow(ctx, 0, 0, rx * 1.1, on ? L.glow : 'rgba(0,0,0,.2)');
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, rx);
        g.addColorStop(0, on ? L.a : L.bank); g.addColorStop(1, L.b);
        ctx.fillStyle = g; ctx.strokeStyle = on ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.12)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); ctx.stroke();
        if (p.style === 'spikes') {
            ctx.fillStyle = '#e7e5e4'; ctx.strokeStyle = '#1c1917'; ctx.lineWidth = 1;
            for (let k = 0; k < Math.floor(p.w / 22); k++) for (let r = 0; r < 2; r++) {
                const sx = -rx + 14 + k * 22 + (r ? 11 : 0), sy = (r ? 8 : -8) * (ry / 28);
                ctx.beginPath(); ctx.moveTo(sx - 6, sy + 5); ctx.lineTo(sx, sy - 14); ctx.lineTo(sx + 6, sy + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
            }
        } else if (on) {
            ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5;
            for (let k = 0; k < 4; k++) { const a = t * 1.5 + k * 1.6; ctx.beginPath(); ctx.ellipse(Math.cos(a) * rx * 0.4, Math.sin(a * 1.2) * ry * 0.4, 10 + 4 * Math.sin(a * 2), 4, 0, 0, TAU); ctx.stroke(); }
            if (p.style === 'electric') { ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 2; ctx.beginPath(); let x = -rx * 0.7; ctx.moveTo(x, 0); for (let k = 0; k < 6; k++) { x += rx * 0.25; ctx.lineTo(x, (((t * 30 + k * 7) | 0) % 5 - 2) * 6); } ctx.stroke(); }
            if (p.style === 'fire' || p.style === 'lava') { for (let k = 0; k < 3; k++) { const fx = -rx * 0.5 + k * rx * 0.5, h = 14 + 8 * Math.sin(t * 6 + k * 2); ctx.fillStyle = 'rgba(253,224,71,.7)'; ctx.beginPath(); ctx.moveTo(fx - 7, 0); ctx.quadraticCurveTo(fx, -h * 1.6, fx + 7, 0); ctx.fill(); } }
        }
        ctx.restore();
    },
    drawPlat(ctx, p, gy, Z) {
        const L = COOP_PLAT_LOOK[p.style] || COOP_PLAT_LOOK.wood;
        const yb = gy - p.ph, yf = gy + Z - p.ph;
        ctx.save();
        // sombra en el suelo
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(p.x + 4, gy + 2, p.w, Z);
        // soportes
        ctx.fillStyle = L.face;
        if (!p.step) { ctx.fillRect(p.x + 6, yf, 10, p.ph); ctx.fillRect(p.x + p.w - 16, yf, 10, p.ph); }
        else { ctx.fillRect(p.x, yf, p.w, p.ph); }
        // cara superior (plano inclinado en profundidad) y canto frontal
        ctx.fillStyle = L.top;
        ctx.beginPath(); ctx.moveTo(p.x, yb); ctx.lineTo(p.x + p.w, yb); ctx.lineTo(p.x + p.w, yf); ctx.lineTo(p.x, yf); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1;
        for (let z = 0; z <= Z; z += 30) { ctx.beginPath(); ctx.moveTo(p.x, yb + z); ctx.lineTo(p.x + p.w, yb + z); ctx.stroke(); }
        ctx.fillStyle = L.face; ctx.fillRect(p.x, yf, p.w, 12);
        ctx.strokeStyle = L.edge; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.x, yb); ctx.lineTo(p.x + p.w, yb); ctx.moveTo(p.x, yf + 0.5); ctx.lineTo(p.x + p.w, yf + 0.5); ctx.stroke();
        ctx.restore();
    }
});
