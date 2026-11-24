'use strict';
// Datos del modo cooperativo: parámetros, niveles (uno por mapa), esbirros temáticos, jefes y objetos.
// No toca el versus: solo define datos y capas de arte nuevas para los esbirros.

// =========================================================================
// PARÁMETROS
// =========================================================================
const COOP = {
    LEVEL_W: 5600,         // ancho de cada nivel (≈ 4 pantallas)
    GROUND_Y: 560,         // borde trasero del suelo (z = 0)
    Z_MAX: 150,            // fondo → frente: carril de profundidad en píxeles
    DEPTH_TOL: 22,         // diferencia de profundidad máxima para que un golpe conecte
    PLAYER_TEAM: 2,        // verde
    ENEMY_TEAM: 0,         // rojo
    JUMP_SHORT: 3.4,       // velocidad horizontal del salto corto (X)
    JUMP_LONG: 6.8,        // velocidad horizontal del salto largo (A)
    EDGE_MARGIN: 45,       // los jugadores no pueden salir de la pantalla
    ENEMY_EDGE_MARGIN: 30, // pared invisible de los enemigos una vez dentro de la pantalla
    GHOST_HP_FRACTION: 1 / 3,  // vida del fantasma rival respecto a la vida máxima del personaje caído
    REVIVE_HP_FRACTION: 1 / 2, // vida con la que revive el aliado al derrotar a su fantasma
    MEDAL_REACH_X: 44,     // distancia horizontal para recoger una medalla
    MEDAL_REACH_Z: 30,     // distancia de profundidad para recoger una medalla
    MEDAL_ARM: 45,         // frames hasta que una medalla se puede recoger
    BOSS_SCALE: 1.55,      // el jefe es un personaje del roster, más grande
    BOSS_SWEEPS: 3,        // barridas necesarias para tumbar a un jefe
    BOSS_PRESSURE: 3,      // golpes seguidos (≈3 s) que lo enfurecen
    BOSS_SHOVE_DMG: 30, BOSS_SHOVE_KB: 15, BOSS_SHOVE_CD: 210,
    LEVEL_BONUS: 0.5,      // entre niveles: +50 puntos de vida máxima (tope 100 %)
    LEVEL_REVIVE: 0.5,     // entre niveles: los caídos reviven con el 50 %
    RETRY_MAX: 2,          // reintentos guardados como máximo
    RETRY_AWARD_LEVELS: [1, 3, 5, 7],   // al superar estos niveles (1-8) se gana +1 reintento
    ITEM_REACH_X: 40, ITEM_REACH_Z: 30, ITEM_TTL: 600,   // objetos: alcance y vida (10 s)
    ENERGY_FRAMES: 600,    // bebida energética: 10 s
    ENERGY_BOOST: 0.3      // +30 % de velocidad de movimiento y de ataque
};

// Escalado según el número de jugadores (1 a 4): vida, cantidad de esbirros, activos a la vez y turnos de ataque
const COOP_SCALE = {
    1: { hp: 0.8, count: 0.7, active: 2, engage: 1 },
    2: { hp: 0.95, count: 0.9, active: 3, engage: 2 },
    3: { hp: 1.1, count: 1.1, active: 4, engage: 2 },
    4: { hp: 1.25, count: 1.3, active: 5, engage: 3 }
};

// =========================================================================
// ESBIRROS: tres tipos de combate (rápido / medio / pesado) con aspecto propio por mapa
// =========================================================================
const COOP_ENEMY_TYPES = {
    grunt: { role: 'mid', hp: 220, speed: 2.7, atk: 2, range: 74, think: [55, 105], moves: ['mp', 'mp', 'mk'],
        build: { s: 0.98, torso: 34, arm: 10, leg: 13, fist: 6, head: 12.5 } },
    punk: { role: 'fast', hp: 160, speed: 3.9, atk: 2, range: 70, think: [40, 80], moves: ['mp', 'mk', 'mk', 'lp'],
        build: { s: 0.92, torso: 30, arm: 8.5, leg: 12, fist: 5.5, head: 12 } },
    brute: { role: 'heavy', hp: 520, speed: 1.9, atk: 3, range: 86, think: [75, 130], moves: ['hp', 'hk', 'mp'],
        build: { s: 1.2, torso: 42, arm: 12.5, leg: 16, fist: 8, head: 14 } },
    // El jefe usa el arquetipo de un personaje del roster (ver buildBossArchetype); aquí solo su comportamiento
    boss: { role: 'boss', name: 'JEFE', boss: true, hp: 2400, range: 104, think: [42, 88], moves: ['mp', 'hp', 'hk', 'mk', 'hp', 'mp', 'hk'] }
};

// Temas: cada mapa tiene sus tres esbirros. hc = color del detalle de la cabeza
const COOP_THEMES = {
    suzaku: {
        fast: { name: 'NINJA', icon: '🥷', head: 'ninja', hc: '#6366f1', primary: '#6366f1', skin: '#e8b98a', top: '#111827', glove: '#111827', pants: '#1f2937', boot: '#0f172a' },
        mid: { name: 'SAMURÁI', icon: '⚔️', head: 'samurai', hc: '#dc2626', primary: '#dc2626', skin: '#e8b98a', top: '#7f1d1d', glove: '#1f2937', pants: '#1e293b', boot: '#0f172a' },
        heavy: { name: 'MONJE GUERRERO', icon: '🧘', head: 'monk', hc: '#f59e0b', primary: '#f59e0b', skin: '#b9794a', top: '#c2410c', glove: '#78350f', pants: '#78350f', boot: '#292524' }
    },
    volcano: {
        fast: { name: 'SAQUEADOR', icon: '🔥', head: 'bandana', hc: '#f97316', primary: '#f97316', skin: '#c98b5b', top: '#292524', glove: '#7c2d12', pants: '#44403c', boot: '#1c1917' },
        mid: { name: 'MINERO', icon: '⛏️', head: 'hardhat', hc: '#facc15', primary: '#facc15', skin: '#c98b5b', top: '#9a3412', glove: '#44403c', pants: '#292524', boot: '#1c1917' },
        heavy: { name: 'GOLEM DE MAGMA', icon: '🌋', head: 'horns', hc: '#ef4444', primary: '#ef4444', skin: '#7c2d12', top: '#450a0a', glove: '#b91c1c', pants: '#3f1d1d', boot: '#1c0a0a' }
    },
    eclipse: {
        fast: { name: 'EXPLORADOR LUNAR', icon: '🧑‍🚀', head: 'astro', hc: '#e0f2fe', primary: '#38bdf8', skin: '#e8b98a', top: '#e2e8f0', glove: '#94a3b8', pants: '#cbd5e1', boot: '#64748b' },
        mid: { name: 'ASTRONAUTA', icon: '👨‍🚀', head: 'astro', hc: '#f1f5f9', primary: '#f8fafc', skin: '#e8b98a', top: '#f1f5f9', glove: '#cbd5e1', pants: '#e2e8f0', boot: '#475569' },
        heavy: { name: 'TRAJE PESADO', icon: '🤖', head: 'astroHeavy', hc: '#fde047', primary: '#facc15', skin: '#94a3b8', top: '#64748b', glove: '#334155', pants: '#475569', boot: '#1e293b', metal: true }
    },
    cyber: {
        fast: { name: 'PANDILLERO NEÓN', icon: '🛹', head: 'visor', hc: '#f0abfc', primary: '#d946ef', skin: '#e8b98a', top: '#1e1b4b', glove: '#d946ef', pants: '#312e81', boot: '#0f172a' },
        mid: { name: 'GUARDIA', icon: '🛡️', head: 'cap', hc: '#1d4ed8', primary: '#38bdf8', skin: '#e8b98a', top: '#1e3a8a', glove: '#0f172a', pants: '#172554', boot: '#0f172a' },
        heavy: { name: 'ROBOT', icon: '🤖', head: 'visor', hc: '#22d3ee', primary: '#22d3ee', skin: '#94a3b8', top: '#475569', glove: '#0e7490', pants: '#334155', boot: '#0f172a', metal: true }
    },
    lab: {
        fast: { name: 'CIENTÍFICO MUTADO', icon: '🧪', head: 'labmask', hc: '#4ade80', primary: '#4ade80', skin: '#a7c957', top: '#f1f5f9', glove: '#4ade80', pants: '#cbd5e1', boot: '#475569' },
        mid: { name: 'GUARDIA DE SEGURIDAD', icon: '🦺', head: 'cap', hc: '#0f172a', primary: '#f59e0b', skin: '#e8b98a', top: '#f59e0b', glove: '#1f2937', pants: '#1e293b', boot: '#0f172a' },
        heavy: { name: 'EXPERIMENTO', icon: '🧬', head: 'rockbrow', hc: '#86efac', primary: '#22c55e', skin: '#6ee7b7', top: '#14532d', glove: '#22c55e', pants: '#166534', boot: '#052e16' }
    },
    emerald: {
        fast: { name: 'DISCÍPULO', icon: '🍃', head: 'leafband', hc: '#22c55e', primary: '#22c55e', skin: '#e8b98a', top: '#14532d', glove: '#166534', pants: '#052e16', boot: '#1c1917' },
        mid: { name: 'GUERRERO DE JADE', icon: '🐉', head: 'jade', hc: '#34d399', primary: '#10b981', skin: '#e8b98a', top: '#065f46', glove: '#047857', pants: '#064e3b', boot: '#022c22' },
        heavy: { name: 'GUARDIÁN DE JADE', icon: '🗿', head: 'rockbrow', hc: '#6ee7b7', primary: '#34d399', skin: '#4d7c6a', top: '#064e3b', glove: '#059669', pants: '#052e2b', boot: '#022c22' }
    },
    seismic: {
        fast: { name: 'ESPELEÓLOGO', icon: '🔦', head: 'hardhat', hc: '#f97316', primary: '#f97316', skin: '#d9a066', top: '#57534e', glove: '#292524', pants: '#44403c', boot: '#1c1917' },
        mid: { name: 'MINERO', icon: '⛏️', head: 'hardhat', hc: '#facc15', primary: '#facc15', skin: '#b9794a', top: '#78716c', glove: '#44403c', pants: '#292524', boot: '#0c0a09' },
        heavy: { name: 'GOLEM DE ROCA', icon: '🪨', head: 'rockbrow', hc: '#a8a29e', primary: '#a8a29e', skin: '#78716c', top: '#57534e', glove: '#44403c', pants: '#44403c', boot: '#1c1917' }
    },
    toxic: {
        fast: { name: 'OPERARIO', icon: '☣️', head: 'gasmask', hc: '#a3e635', primary: '#a3e635', skin: '#d9a066', top: '#365314', glove: '#a3e635', pants: '#1a2e05', boot: '#0c1402' },
        mid: { name: 'MUTANTE', icon: '🧟', head: 'bandana', hc: '#84cc16', primary: '#84cc16', skin: '#9bbf5a', top: '#3f6212', glove: '#65a30d', pants: '#1a2e05', boot: '#0c1402' },
        heavy: { name: 'ABOMINACIÓN', icon: '👹', head: 'horns', hc: '#bef264', primary: '#84cc16', skin: '#7aa33a', top: '#1a2e05', glove: '#4d7c0f', pants: '#14210a', boot: '#0c1402' }
    }
};

// Detalles de cabeza (se dibujan sobre la cabeza del luchador; +x = hacia donde mira)
const COOP_HEADS = {
    bandana(ctx, C, col) {
        const r = C.b.head;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
        ctx.fillStyle = col; ctx.fillRect(-r, -r, r * 2, r * 0.62);
        ctx.restore();
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(-r * 0.85, -r * 0.4); ctx.lineTo(-r * 1.75, -r * 0.05); ctx.lineTo(-r * 1.25, -r * 0.75); ctx.closePath(); ctx.fill();
    },
    mohawk(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = col;
        for (let i = 0; i < 4; i++) {
            const x = -r * 0.6 + i * r * 0.4;
            ctx.beginPath(); ctx.moveTo(x - r * 0.22, -r * 0.8); ctx.lineTo(x, -r * (1.7 + (i % 2) * 0.35)); ctx.lineTo(x + r * 0.22, -r * 0.8); ctx.closePath(); ctx.fill();
        }
    },
    visor(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = '#0a0e1a'; ctx.fillRect(r * 0.05, -r * 0.3, r * 0.95, r * 0.34);
        ctx.fillStyle = col; ctx.fillRect(r * 0.2, -r * 0.2, r * 0.75, r * 0.14);
    },
    ninja(ctx, C, col) {
        const r = C.b.head;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
        ctx.fillStyle = '#0b1020'; ctx.fillRect(-r, r * 0.05, r * 2, r);
        ctx.fillStyle = col; ctx.fillRect(-r, -r * 0.55, r * 2, r * 0.3);
        ctx.restore();
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(-r * 0.9, -r * 0.5); ctx.lineTo(-r * 1.9, -r * 0.2); ctx.lineTo(-r * 1.2, -r * 0.7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e5e7eb'; ctx.fillRect(r * 0.3, -r * 0.2, r * 0.5, r * 0.12);
    },
    samurai(ctx, C, col) {
        const r = C.b.head;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, TAU); ctx.clip();
        ctx.fillStyle = col; ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 1.05);
        ctx.restore();
        ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.8, r * 0.95, Math.PI * 1.05, Math.PI * 1.9); ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.fillRect(-r * 0.15, -r * 1.15, r * 0.3, r * 0.45);
    },
    monk(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = col; ctx.fillRect(-r * 0.95, -r * 0.45, r * 1.9, r * 0.22);
        ctx.fillStyle = '#7c2d12';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-r * 0.7 + i * r * 0.35, r * 1.15, r * 0.2, 0, TAU); ctx.fill(); }
    },
    hardhat(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 1.12, Math.PI, TAU); ctx.fill();
        ctx.fillRect(-r * 1.2, -r * 0.15, r * 2.6, r * 0.22);
        ctx.fillStyle = '#fef9c3'; ctx.beginPath(); ctx.arc(r * 0.95, -r * 0.55, r * 0.22, 0, TAU); ctx.fill();
    },
    astro(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = 'rgba(186,230,253,0.22)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.32, 0, TAU); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, 0, r * 1.32, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-r * 0.45, -r * 0.6, r * 0.25, r * 0.12, -0.6, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(-r * 0.9, r * 1.1, r * 1.8, r * 0.3);
    },
    astroHeavy(ctx, C, col) {
        COOP_HEADS.astro(ctx, C, '#cbd5e1');
        const r = C.b.head;
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 1.2); ctx.lineTo(-r * 0.9, -r * 2); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-r * 0.9, -r * 2, r * 0.2, 0, TAU); ctx.fill();
    },
    cap(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 1.1, Math.PI, TAU); ctx.fill();
        ctx.fillRect(r * 0.2, -r * 0.2, r * 1.1, r * 0.2);
    },
    labmask(ctx, C, col) {
        const r = C.b.head;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
        ctx.fillStyle = '#bae6fd'; ctx.fillRect(-r, r * 0.1, r * 2, r);
        ctx.restore();
        ctx.fillStyle = col;
        for (let i = 0; i < 5; i++) { const x = -r * 0.8 + i * r * 0.4; ctx.beginPath(); ctx.moveTo(x - r * 0.2, -r * 0.8); ctx.lineTo(x + (i % 2 ? 4 : -4), -r * 1.6); ctx.lineTo(x + r * 0.2, -r * 0.8); ctx.closePath(); ctx.fill(); }
    },
    gasmask(ctx, C, col) {
        const r = C.b.head;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
        ctx.fillStyle = '#374151'; ctx.fillRect(-r * 0.2, r * 0.05, r * 1.4, r);
        ctx.restore();
        ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(r * 0.95, r * 0.4, r * 0.34, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(r * 0.95, r * 0.4, r * 0.16, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.fillRect(r * 0.1, -r * 0.28, r * 0.8, r * 0.26);
    },
    leafband(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = '#14532d'; ctx.fillRect(-r * 0.95, -r * 0.5, r * 1.9, r * 0.2);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(-r * 1.1, -r * 0.35, r * 0.55, r * 0.2, -0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-r * 1.25, -r * 0.1, r * 0.5, r * 0.18, 0.4, 0, TAU); ctx.fill();
    },
    jade(ctx, C, col) {
        const r = C.b.head;
        ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r * 1.06, 0, TAU); ctx.clip();
        ctx.fillStyle = col; ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 1.0);
        ctx.restore();
        ctx.fillStyle = '#a7f3d0'; ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 1.05); ctx.lineTo(r * 0.15, -r * 1.9); ctx.lineTo(r * 0.5, -r * 1.05); ctx.closePath(); ctx.fill();
    },
    horns(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = col;
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(s * r * 0.45, -r * 0.8); ctx.quadraticCurveTo(s * r * 1.5, -r * 1.1, s * r * 1.1, -r * 2); ctx.quadraticCurveTo(s * r * 0.8, -r * 1.2, s * r * 0.1, -r * 0.95);
            ctx.closePath(); ctx.fill();
        }
    },
    rockbrow(ctx, C, col) {
        const r = C.b.head;
        ctx.fillStyle = col; ctx.fillRect(-r * 0.2, -r * 0.45, r * 1.25, r * 0.28);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.9); ctx.lineTo(-r * 0.3, -r * 0.5); ctx.lineTo(-r * 0.5, -r * 0.1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(r * 0.2, -r * 1.0); ctx.lineTo(r * 0.45, -r * 0.7); ctx.stroke();
    }
};

const _coopEnemyArchCache = {};
function coopEnemyArchetype(arenaId, typeKey) {
    const base = COOP_ENEMY_TYPES[typeKey];
    const themeSet = COOP_THEMES[arenaId] || COOP_THEMES.suzaku;
    const th = themeSet[base.role];
    const id = 'thug_' + arenaId + '_' + base.role;
    if (_coopEnemyArchCache[id]) return _coopEnemyArchCache[id];
    const head = COOP_HEADS[th.head] || COOP_HEADS.bandana;
    FighterArt.parts[id] = { head(ctx, C) { head(ctx, C, th.hc || th.primary); } };
    return (_coopEnemyArchCache[id] = {
        id, name: th.name, gender: 'male', element: 'Calle', powerName: '-', superName: '-', homeArena: arenaId,
        primary: th.primary, secondary: th.primary, giColor: th.top, bandColor: th.primary, skin: th.skin, icon: th.icon,
        accessory: 'none', stats: { atk: base.atk, spd: 2, pwr: 1 }, speed: base.speed, jumpForce: -13, projSpeed: 8, projColor: th.primary,
        build: base.build,
        look: { top: th.top, upperArm: th.arm || th.skin, foreArm: th.arm || th.skin, glove: th.glove, pants: th.pants, boot: th.boot, metal: !!th.metal },
        trait: 'Esbirro'
    });
}

// =========================================================================
// JEFES: el personaje del mapa, más grande, con colores invertidos y aspecto infectado
// =========================================================================
function coopParseHex(c) {
    if (typeof c !== 'string' || c[0] !== '#') return null;
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// Invierte el color y lo oscurece un poco: el contagio apaga los tonos originales
function coopInvert(c, dark = 0.82) {
    const rgb = coopParseHex(c);
    if (!rgb) return c;
    return '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round((255 - v) * dark))).toString(16).padStart(2, '0')).join('');
}
const _coopBossCache = {};
function buildBossArchetype(baseId) {
    if (_coopBossCache[baseId]) return _coopBossCache[baseId];
    const base = FIGHTER_ARCHETYPES.find(a => a.id === baseId) || FIGHTER_ARCHETYPES[0];
    const look = {};
    for (const k of Object.keys(base.look)) look[k] = typeof base.look[k] === 'string' ? coopInvert(base.look[k]) : base.look[k];
    look.upperArm = look.foreArm = '#8f7aa6';   // piel enferma
    return (_coopBossCache[baseId] = {
        ...base,
        name: base.name + ' INFECTADO',
        primary: coopInvert(base.primary), secondary: coopInvert(base.secondary),
        giColor: coopInvert(base.giColor), bandColor: coopInvert(base.bandColor),
        skin: '#8f7aa6', projColor: coopInvert(base.projColor),
        look,
        speed: Math.min(4.1, base.speed * 0.8),
        build: { ...base.build, s: base.build.s * COOP.BOSS_SCALE },
        infected: true, isBossArch: true
    });
}

// Escala toda la opacidad que se pinte a continuación (el dibujado base reescribe globalAlpha = 1 en varios puntos)
function coopScaleAlpha(ctx, k) {
    let proto = Object.getPrototypeOf(ctx), desc = null;
    while (proto && !desc) { desc = Object.getOwnPropertyDescriptor(proto, 'globalAlpha'); proto = Object.getPrototypeOf(proto); }
    if (!desc || !desc.get || !desc.set) { ctx.globalAlpha = k; return () => {}; }
    desc.set.call(ctx, desc.get.call(ctx) * k);
    Object.defineProperty(ctx, 'globalAlpha', { configurable: true, get() { return desc.get.call(ctx) / k; }, set(v) { desc.set.call(ctx, v * k); } });
    return () => { delete ctx.globalAlpha; };
}

// Aura oscura y ojos rojos del jefe: se añaden a las capas del arte existente sin modificar arte-luchadores.js
const _coopLayer = FighterArt.layer;
FighterArt.layer = function (name, C) {
    const inf = C.arch && C.arch.infected;
    if (inf && name === 'back') {
        const ctx = C.ctx, t = C.t || 0;
        softGlow(ctx, 0, -62, 78, 'rgba(76,29,149,0.55)');
        softGlow(ctx, 0, -40, 52, 'rgba(10,0,20,0.5)');
        for (let i = 0; i < 6; i++) {
            const k = (t * 38 + i * 21) % 120;
            const x = Math.sin(t * 2.2 + i * 1.9) * (20 + i * 2);
            ctx.fillStyle = `rgba(${i % 2 ? '30,0,50' : '88,28,135'},${0.55 * (1 - k / 120)})`;
            ctx.beginPath(); ctx.ellipse(x, -10 - k, 4.5 - k * 0.025, 8 - k * 0.04, 0, 0, TAU); ctx.fill();
        }
    }
    _coopLayer.call(this, name, C);
    if (inf && name === 'front') {
        const ctx = C.ctx, hp = this.headPos(C), r = C.b.head;
        const ex = hp.x + r * 0.42, ey = hp.y - r * 0.08;
        softGlow(ctx, ex, ey, 11, 'rgba(255,30,30,0.85)');
        ctx.fillStyle = '#ff1a1a'; ctx.fillRect(ex - 2.4, ey - 2.4, 5, 4.4);
        ctx.fillStyle = '#fff'; ctx.fillRect(ex + 0.4, ey - 1.6, 1.4, 1.4);
        ctx.strokeStyle = '#1a0a24'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5.5); ctx.lineTo(ex + 4, ey - 2.6); ctx.stroke();
        ctx.strokeStyle = 'rgba(167,60,220,0.7)'; ctx.lineWidth = 1.1;      // venas del contagio
        ctx.beginPath(); ctx.moveTo(hp.x - r * 0.5, hp.y - r * 0.7); ctx.lineTo(hp.x - r * 0.1, hp.y - r * 0.1); ctx.lineTo(hp.x - r * 0.4, hp.y + r * 0.35); ctx.stroke();
    }
};

// =========================================================================
// NIVELES: uno por mapa (8). Cuatro tramos + el jefe. La dificultad sube con el número de nivel.
// =========================================================================
const COOP_ARENA_ORDER = ['suzaku', 'volcano', 'eclipse', 'cyber', 'lab', 'emerald', 'seismic', 'toxic'];

function buildCoopLevel(i) {
    const arenaId = COOP_ARENA_ORDER[i];
    const boss = FIGHTER_ARCHETYPES.find(a => a.homeArena === arenaId) || FIGHTER_ARCHETYPES[i % FIGHTER_ARCHETYPES.length];
    const ATS = [1300, 2300, 3300, 4100];   // posición de la cámara donde se bloquea cada tramo
    const segments = ATS.map((at, k) => {
        const total = 3 + k + Math.floor(i / 2);
        const heavy = k === 0 ? 0 : Math.min(3, Math.floor((k + i) / 3) + (k === 3 ? 1 : 0));
        const mid = Math.floor((total - heavy) * 0.45);
        const fast = total - heavy - mid;
        const pools = [Array(mid).fill('grunt'), Array(fast).fill('punk'), Array(heavy).fill('brute')];
        const enemies = [];
        while (pools.some(p => p.length)) pools.forEach(p => { if (p.length) enemies.push(p.shift()); });
        return { at, enemies };
    });
    segments.push({ at: 5200, boss: true, enemies: ['boss', 'grunt', 'punk'].concat(i >= 4 ? ['brute'] : []) });
    return { index: i, arenaId, bossId: boss.id, hpMul: 1 + 0.12 * i, bossHpMul: 1 + 0.15 * i, bossDmgMul: 1.18 + 0.04 * i, segments };
}
const COOP_LEVELS = COOP_ARENA_ORDER.map((_, i) => buildCoopLevel(i));

// Reduce o amplía una lista de esbirros según el número de jugadores (el jefe no se toca)
function coopScaleList(list, n) {
    const sc = COOP_SCALE[Math.max(1, Math.min(4, n))];
    const bossItems = list.filter(k => k === 'boss');
    const rest = list.filter(k => k !== 'boss');
    const target = Math.max(2, Math.round(rest.length * sc.count));
    const out = [];
    if (target <= rest.length) for (let k = 0; k < target; k++) out.push(rest[Math.floor(k * rest.length / target)]);
    else for (let k = 0; k < target; k++) out.push(rest[k % rest.length]);
    return bossItems.concat(out);
}

// =========================================================================
// OBJETOS: comida (cura), bebida energética y cristal de poder
// =========================================================================
const COOP_ITEMS = {
    chips: { label: '10%', heal: 0.10 },
    turron: { label: '25%', heal: 0.25 },
    pollo: { label: '40%', heal: 0.40 },
    energy: { label: '+30%' },
    crystal: { label: 'SÚPER' }
};
// Probabilidad de que un esbirro suelte algo al caer (los pesados sueltan más y mejor)
const COOP_DROPS = {
    light: { food: 0.12, energy: 0.05, crystal: 0.04, mix: { chips: 0.7, turron: 0.25, pollo: 0.05 } },
    heavy: { food: 0.45, energy: 0.15, crystal: 0.12, mix: { chips: 0.2, turron: 0.45, pollo: 0.35 } }
};
function coopRollDrop(typeKey, rnd = Math.random) {
    const d = COOP_DROPS[typeKey === 'brute' ? 'heavy' : 'light'];
    const r = rnd();
    if (r < d.food) {
        const q = rnd();
        let acc = 0;
        for (const k of ['chips', 'turron', 'pollo']) { acc += d.mix[k]; if (q < acc) return k; }
        return 'pollo';
    }
    if (r < d.food + d.energy) return 'energy';
    if (r < d.food + d.energy + d.crystal) return 'crystal';
    return null;
}

// Dibujo de cada objeto con formas simples (nombres y envases inventados, sin marcas reales)
function drawCoopItem(ctx, it, t) {
    const bob = Math.sin(t * 4 + it.x) * 3;
    ctx.save();
    ctx.translate(it.x, it.gy);
    if (it.ttl < 180 && Math.floor(it.ttl / 6) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 14, 4, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -22 + bob);
    ctx.lineWidth = 2; ctx.strokeStyle = '#1c1917';
    switch (it.kind) {
        case 'chips':   // bolsa de papas
            ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.moveTo(-11, 12); ctx.lineTo(-13, -10); ctx.lineTo(13, -10); ctx.lineTo(11, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#dc2626'; ctx.fillRect(-11, -2, 22, 7);
            ctx.fillStyle = '#fde68a'; for (let i = -12; i <= 8; i += 6) ctx.fillRect(i, -14, 4, 4);
            break;
        case 'turron':  // barra de turrón
            ctx.fillStyle = '#fde68a'; ctx.fillRect(-15, -7, 30, 15); ctx.strokeRect(-15, -7, 30, 15);
            ctx.fillStyle = '#92400e'; ctx.fillRect(-15, -2, 30, 4);
            ctx.fillStyle = '#f472b6'; ctx.fillRect(-9, -5, 3, 3); ctx.fillRect(2, -5, 3, 3); ctx.fillRect(9, 3, 3, 3);
            break;
        case 'pollo':   // pollo a la brasa
            ctx.fillStyle = '#b45309'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, -0.2, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#d97706'; ctx.beginPath(); ctx.ellipse(-3, -3, 8, 4, -0.2, 0, TAU); ctx.fill();
            ctx.fillStyle = '#fef3c7'; ctx.fillRect(12, 4, 8, 4); ctx.beginPath(); ctx.arc(21, 6, 3, 0, TAU); ctx.fill();
            break;
        case 'energy':  // lata energética
            ctx.fillStyle = '#1d4ed8'; ctx.fillRect(-8, -13, 16, 26); ctx.strokeRect(-8, -13, 16, 26);
            ctx.fillStyle = '#cbd5e1'; ctx.fillRect(-8, -13, 16, 4);
            ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(1, -7); ctx.lineTo(-5, 2); ctx.lineTo(0, 2); ctx.lineTo(-2, 10); ctx.lineTo(5, -1); ctx.lineTo(0, -1); ctx.closePath(); ctx.fill();
            softGlow(ctx, 0, 0, 26, 'rgba(250,204,21,0.35)');
            break;
        case 'crystal': // cristal de poder
            softGlow(ctx, 0, 0, 30, 'rgba(34,211,238,0.5)');
            ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(11, -2); ctx.lineTo(0, 15); ctx.lineTo(-11, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#a5f3fc'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-11, -2); ctx.lineTo(-2, -2); ctx.closePath(); ctx.fill();
            break;
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 11px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000'; ctx.fillText(COOP_ITEMS[it.kind].label, 1, 30);
    ctx.fillStyle = '#fef08a'; ctx.fillText(COOP_ITEMS[it.kind].label, 0, 29);
    ctx.restore();
}
