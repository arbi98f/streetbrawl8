'use strict';
// Arte de los luchadores: esqueleto, poses, animaciones y datos de ataques

// =========================================================================
// 5.5 ARTE DE LUCHADORES: ESQUELETO ARTICULADO + POSES POR KEYFRAMES
// =========================================================================
const TAU = Math.PI * 2;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = v => Math.max(0, Math.min(1, v));
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function shadeColor(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((f - r) * p + r); g = Math.round((f - g) * p + g); b = Math.round((f - b) * p + b);
    return `rgb(${r},${g},${b})`;
}
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
function ln(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
const _clearCache = {};
function transparentOf(color) {
    if (_clearCache[color]) return _clearCache[color];
    let out = 'rgba(0,0,0,0)';
    if (color[0] === '#' && color.length === 7) {
        const n = parseInt(color.slice(1), 16);
        out = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
    } else {
        const m = color.match(/rgba?\(([^,]+),([^,]+),([^,)]+)/);
        if (m) out = `rgba(${m[1]},${m[2]},${m[3]},0)`;
    }
    return (_clearCache[color] = out);
}
function softGlow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
    g.addColorStop(0, color);
    g.addColorStop(1, transparentOf(color));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, TAU); ctx.fill();
}

// Ángulos: 0 = hacia abajo, +PI/2 = hacia delante, PI = hacia arriba.
// Pierna [muslo, flexión rodilla]; Brazo [hombro, flexión codo].
const BASE_POSE = { lean: 0.05, lift: 0, head: 0, legF: [0.25, -0.25], legB: [-0.28, 0.05], armF: [0.9, 1.7], armB: [0.5, 2.0] };
const mkPose = o => ({ ...BASE_POSE, ...o });
function lerpPose(A, B, k) {
    const l2 = (p, q) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
    return {
        lean: lerp(A.lean, B.lean, k), lift: lerp(A.lift, B.lift, k), head: lerp(A.head, B.head, k),
        legF: l2(A.legF, B.legF), legB: l2(A.legB, B.legB), armF: l2(A.armF, B.armF), armB: l2(A.armB, B.armB)
    };
}
function samplePose(frames, t) {
    if (t <= frames[0][0]) return frames[0][1];
    for (let i = 1; i < frames.length; i++) {
        if (t <= frames[i][0]) {
            const [t0, p0] = frames[i - 1];
            const [t1, p1] = frames[i];
            return lerpPose(p0, p1, easeInOut((t - t0) / Math.max(0.0001, t1 - t0)));
        }
    }
    return frames[frames.length - 1][1];
}

const P_PUNCH = mkPose({ lean: 0.2, head: 0.05, legF: [0.45, -0.35], legB: [-0.45, 0.05], armF: [1.57, 0.03], armB: [-0.25, 2.3] });
const P_KICK = mkPose({ lean: -0.42, head: -0.1, legF: [1.6, -0.04], legB: [-0.18, 0.02], armF: [1.1, 1.2], armB: [-0.7, 1.1] });
const P_LAUNCH = mkPose({ lean: -0.12, lift: 16, head: -0.15, legF: [0.35, -0.5], legB: [-0.25, -0.15], armF: [3.05, 0.15], armB: [-0.4, 1.9] });
const P_SPECIAL = mkPose({ lean: 0.22, legF: [0.6, -0.6], legB: [-0.6, -0.1], armF: [1.25, 0.12], armB: [1.12, 0.22] });
const P_SUPER = mkPose({ lean: 0.28, legF: [0.7, -0.7], legB: [-0.7, -0.05], armF: [1.25, 0.1], armB: [1.15, 0.18] });

const ANIMS = {
    punch: [[0, BASE_POSE], [0.2, mkPose({ lean: -0.05, armF: [0.6, 2.3], armB: [0.6, 1.9] })], [0.42, P_PUNCH], [0.62, P_PUNCH], [1, BASE_POSE]],
    kick: [[0, BASE_POSE], [0.25, mkPose({ lean: -0.1, legF: [1.45, -2.1], legB: [-0.08, -0.05], armF: [0.8, 1.9], armB: [0.2, 1.8] })], [0.48, P_KICK], [0.68, P_KICK], [1, BASE_POSE]],
    launcher: [[0, BASE_POSE], [0.25, mkPose({ lean: 0.35, legF: [0.95, -1.55], legB: [-0.35, -1.25], armF: [0.25, 0.5], armB: [0.6, 2.0] })], [0.52, P_LAUNCH], [0.75, P_LAUNCH], [1, BASE_POSE]],
    special: [[0, BASE_POSE], [0.33, mkPose({ lean: -0.12, legF: [0.6, -0.6], legB: [-0.6, -0.1], armF: [-0.45, 2.1], armB: [-0.65, 2.2] })], [0.45, P_SPECIAL], [0.8, P_SPECIAL], [1, BASE_POSE]],
    super: [[0, BASE_POSE], [0.16, mkPose({ lean: -0.15, head: -0.2, legF: [0.55, -0.5], legB: [-0.55, -0.15], armF: [2.5, 0.3], armB: [2.3, 0.4] })], [0.36, mkPose({ lean: -0.18, legF: [0.65, -0.75], legB: [-0.65, -0.1], armF: [-0.6, 2.1], armB: [-0.8, 2.2] })], [0.46, P_SUPER], [0.85, P_SUPER], [1, BASE_POSE]]
};

// Duración, enfriamiento, frames activos del golpe y frame de disparo del poder
// 3 puños y 3 patadas: mismo daño por segundo, distinto riesgo (sale / activo / recupera)
const FOCUS_FRAMES = 90;        // ≈ 1500 ms de enfoque temporal tras recibir un golpe
const FOCUS_BREAK_DIST = 340;    // si el atacante se aleja más de esto, se pierde el enfoque
const MOVE_DATA = {
    lp: { dur: 13, cd: 14, active: [3, 5], dmg: 35, reach: 70, kb: 4, kby: -3.5, kind: 'light', rank: 1, cat: 'punch' },
    mp: { dur: 22, cd: 23, active: [6, 9], dmg: 60, reach: 82, kb: 6, kby: -4.5, kind: 'medium', rank: 2, cat: 'punch' },
    hp: { dur: 35, cd: 36, active: [11, 14], dmg: 95, reach: 90, kb: 11, kby: -6, kind: 'heavy', rank: 3, cat: 'punch' },
    lk: { dur: 16, cd: 17, active: [4, 6], dmg: 40, reach: 88, kb: 4, kby: -3, kind: 'light', rank: 1, cat: 'kick' },
    mk: { dur: 26, cd: 27, active: [8, 11], dmg: 70, reach: 100, kb: 8, kby: -4.5, kind: 'medium', rank: 2, cat: 'kick' },
    hk: { dur: 41, cd: 42, active: [14, 18], dmg: 110, reach: 112, kb: 10, kby: -8, kind: 'heavy', rank: 3, cat: 'kick', knockdown: true },
    launcher: { dur: 35, cd: 36, active: [9, 12], dmg: 95, reach: 82, kind: 'heavy', rank: 3, cat: 'punch' },
    // BAJOS (↓ + golpe): solo se bloquean agachado
    clp: { dur: 12, cd: 13, active: [3, 5], dmg: 30, reach: 68, kb: 3, kby: -2.5, kind: 'light', rank: 1, cat: 'punch', low: true },
    cmp: { dur: 21, cd: 22, active: [6, 9], dmg: 55, reach: 80, kb: 5, kby: -3.5, kind: 'medium', rank: 2, cat: 'punch', low: true },
    chp: { dur: 33, cd: 34, active: [10, 13], dmg: 85, reach: 84, kb: 7, kby: -9, kind: 'heavy', rank: 3, cat: 'punch', low: true },
    clk: { dur: 15, cd: 16, active: [4, 6], dmg: 35, reach: 92, kb: 3, kby: -2, kind: 'light', rank: 1, cat: 'kick', low: true },
    cmk: { dur: 25, cd: 26, active: [7, 10], dmg: 60, reach: 106, kb: 6, kby: -3, kind: 'medium', rank: 2, cat: 'kick', low: true },
    chk: { dur: 44, cd: 45, active: [12, 16], dmg: 90, reach: 118, kb: 4, kby: -4, kind: 'heavy', rank: 3, cat: 'kick', low: true, knockdown: true },
    // ALTOS (en el aire, con dirección → ↘ ↓): solo se bloquean de pie
    jlp: { dur: 18, cd: 18, active: [4, 9], dmg: 40, reach: 80, kb: 4, kby: -3, kind: 'light', rank: 1, cat: 'punch', air: true },
    jmp: { dur: 24, cd: 24, active: [6, 12], dmg: 65, reach: 86, kb: 6, kby: -4, kind: 'medium', rank: 2, cat: 'punch', air: true },
    jhp: { dur: 30, cd: 30, active: [8, 15], dmg: 90, reach: 90, kb: 9, kby: -5, kind: 'heavy', rank: 3, cat: 'punch', air: true },
    jlk: { dur: 18, cd: 18, active: [4, 9], dmg: 45, reach: 92, kb: 4, kby: -3, kind: 'light', rank: 1, cat: 'kick', air: true },
    jmk: { dur: 24, cd: 24, active: [6, 12], dmg: 70, reach: 100, kb: 7, kby: -4, kind: 'medium', rank: 2, cat: 'kick', air: true },
    jhk: { dur: 30, cd: 30, active: [8, 15], dmg: 95, reach: 106, kb: 10, kby: -5, kind: 'heavy', rank: 3, cat: 'kick', air: true },
    special: { dur: 30, cd: 42, release: 13 },
    super: { dur: 44, cd: 58, release: 20 },
    grab: { dur: 26, cd: 40, active: [5, 9] },
    throw: { dur: 32, cd: 34, releaseAt: 16 },
    roll: { dur: 22, cd: 36 },
    down: { dur: 36 },
    getup: { dur: 16 }
};
const LOCKED_STATES = new Set(['hurt', 'stun', 'lp', 'mp', 'hp', 'lk', 'mk', 'hk', 'clp', 'cmp', 'chp', 'clk', 'cmk', 'chk', 'jlp', 'jmp', 'jhp', 'jlk', 'jmk', 'jhk', 'launcher', 'special', 'super', 'grab', 'throw', 'roll', 'down', 'getup', 'held']);
const ATTACK_BUTTONS = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk'];
const INPUT_EDGES = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 't1', 't2', 'up', 'down', 'left', 'right'];
const CHARGE_FRAMES = 42;   // 0,7 s cargando hacia atrás
const SPECIAL_LEVELS = [
    { cost: 20, dmg: 60, speed: 0.8, r: 18 },
    { cost: 25, dmg: 70, speed: 1.0, r: 22 },
    { cost: 30, dmg: 80, speed: 1.25, r: 24 }
];
const CLIENT_FORCED = new Set(['hurt', 'stun', 'held', 'down', 'getup', 'ko', 'throw']);
const HIT_STOP = { light: 3, medium: 5, heavy: 8, super: 11, hazard: 2, chip: 0 };
const HIT_SHAKE = { light: 2, medium: 4, heavy: 7, super: 10, hazard: 5, chip: 1 };

const POSE_JUMP_UP = mkPose({ lean: 0.05, legF: [1.1, -1.7], legB: [0.25, -1.3], armF: [1.2, 1.5], armB: [0.9, 1.7] });
const POSE_JUMP_DOWN = mkPose({ lean: 0, legF: [0.45, -0.6], legB: [-0.25, -0.35], armF: [1.3, 1.2], armB: [0.6, 1.5] });
const POSE_CROUCH = mkPose({ lean: 0.22, legF: [1.1, -1.6], legB: [0.6, -1.5], armF: [1.1, 1.5], armB: [0.8, 1.8] });
const POSE_BLOCK = mkPose({ lean: 0.08, head: 0.1, legF: [0.45, -0.6], legB: [-0.45, -0.25], armF: [1.25, 2.4], armB: [1.05, 2.6] });
const POSE_HURT = mkPose({ lean: -0.42, head: -0.35, legF: [0.4, -0.3], legB: [-0.2, -0.2], armF: [0.4, 0.5], armB: [-0.3, 0.7] });
const POSE_KO = mkPose({ lean: 0, head: 0.1, legF: [0.08, 0], legB: [-0.08, 0], armF: [2.7, 0.3], armB: [2.9, 0.2] });
const P_GRAB = mkPose({ lean: 0.28, legF: [0.6, -0.55], legB: [-0.45, 0.0], armF: [1.62, 0.15], armB: [1.45, 0.3] });
const P_LIFT = mkPose({ lean: -0.32, head: -0.2, legF: [0.45, -0.45], legB: [-0.5, -0.05], armF: [2.95, 0.25], armB: [2.75, 0.35] });
const P_SLAM = mkPose({ lean: 0.4, legF: [0.7, -0.75], legB: [-0.6, 0.0], armF: [1.15, 0.25], armB: [0.95, 0.35] });
const P_TUCK = mkPose({ lean: 0.5, head: 0.4, legF: [1.7, -2.6], legB: [1.4, -2.5], armF: [1.7, 1.7], armB: [1.4, 1.9] });
const P_KNEEL = mkPose({ lean: 0.5, legF: [1.3, -2.2], legB: [0.9, -2.0], armF: [0.9, 0.6], armB: [0.6, 0.8] });
const cp = o => ({ ...POSE_CROUCH, ...o });
const POSE_CBLOCK = cp({ lean: 0.18, armF: [1.25, 2.4], armB: [1.05, 2.6], head: 0.1 });
function strikeAnimFrom(base, md, windup, strike) {
    const s = md.active[0] / md.dur, e = (md.active[1] + 1) / md.dur;
    return [[0, base], [Math.max(0.04, s * 0.6), windup], [s, strike], [Math.min(0.95, e + 0.06), strike], [1, base]];
}
// Golpes aéreos: misma fuerza, pose según dirección (→ recto, ↘ diagonal, ↓ pisotón)
const AIR_BASE = mkPose({ lean: 0.05, legF: [1.0, -1.6], legB: [0.3, -1.25], armF: [1.2, 1.5], armB: [0.9, 1.7] });
const AIR_POSES = {
    punch: {
        f: mkPose({ lean: 0.12, legF: [1.0, -1.6], legB: [0.3, -1.2], armF: [1.57, 0.05], armB: [0.6, 1.9] }),
        df: mkPose({ lean: 0.32, legF: [0.9, -1.5], legB: [0.2, -1.2], armF: [0.85, 0.05], armB: [0.7, 1.9] }),
        d: mkPose({ lean: 0.15, legF: [1.1, -1.8], legB: [0.5, -1.6], armF: [0.12, 0.0], armB: [0.5, 1.8] })
    },
    kick: {
        f: mkPose({ lean: -0.32, legF: [1.6, -0.05], legB: [0.4, -1.4], armF: [1.2, 1.2], armB: [-0.4, 1.2] }),
        df: mkPose({ lean: -0.12, legF: [0.85, -0.05], legB: [0.55, -1.6], armF: [1.4, 1.2], armB: [0.2, 1.5] }),
        d: mkPose({ lean: 0.0, legF: [0.12, -0.05], legB: [-0.12, -0.05], armF: [2.4, 0.3], armB: [2.2, 0.4] })
    }
};
const AIR_ANIMS = {};
for (const st of ['jlp', 'jmp', 'jhp', 'jlk', 'jmk', 'jhk']) {
    for (const d of ['f', 'df', 'd']) {
        const md = { jlp: { dur: 18, active: [4, 9] }, jmp: { dur: 24, active: [6, 12] }, jhp: { dur: 30, active: [8, 15] } }[st.replace('k', 'p')];
        const cat = st.endsWith('k') ? 'kick' : 'punch';
        AIR_ANIMS[st + '_' + d] = strikeAnimFrom(AIR_BASE, md, AIR_BASE, AIR_POSES[cat][d]);
    }
}
function strikeAnim(md, windup, strike) {
    const s = md.active[0] / md.dur, e = (md.active[1] + 1) / md.dur;
    return [[0, BASE_POSE], [Math.max(0.04, s * 0.6), windup], [s, strike], [Math.min(0.95, e + 0.06), strike], [1, BASE_POSE]];
}
const P_JAB = mkPose({ lean: 0.1, armF: [1.57, 0.05], armB: [0.5, 2.05] });
const P_HPUNCH = mkPose({ lean: 0.36, head: 0.1, legF: [0.7, -0.6], legB: [-0.7, 0.15], armF: [1.6, 0.0], armB: [-0.5, 2.4] });
const P_LKICK = mkPose({ lean: -0.18, legF: [1.1, -0.05], legB: [-0.15, 0.0], armF: [1.0, 1.6], armB: [0.3, 1.9] });
const P_HKICK = mkPose({ lean: -0.62, head: -0.15, legF: [2.05, -0.08], legB: [-0.2, 0.04], armF: [1.3, 0.9], armB: [-0.9, 1.0] });
Object.assign(ANIMS, {
    lp: strikeAnim(MOVE_DATA.lp, mkPose({ lean: 0.02, armF: [0.9, 1.9] }), P_JAB),
    mp: strikeAnim(MOVE_DATA.mp, mkPose({ lean: -0.05, armF: [0.6, 2.3], armB: [0.6, 1.9] }), P_PUNCH),
    hp: strikeAnim(MOVE_DATA.hp, mkPose({ lean: -0.18, head: -0.05, legF: [0.4, -0.4], legB: [-0.5, 0.05], armF: [0.1, 2.5], armB: [0.9, 1.6] }), P_HPUNCH),
    lk: strikeAnim(MOVE_DATA.lk, mkPose({ lean: -0.05, legF: [0.7, -1.2] }), P_LKICK),
    mk: strikeAnim(MOVE_DATA.mk, mkPose({ lean: -0.1, legF: [1.45, -2.1], legB: [-0.08, -0.05], armF: [0.8, 1.9], armB: [0.2, 1.8] }), P_KICK),
    hk: strikeAnim(MOVE_DATA.hk, mkPose({ lean: -0.2, legF: [1.7, -2.3], legB: [-0.1, -0.05], armF: [0.9, 1.5], armB: [-0.4, 1.4] }), P_HKICK),
    launcher: strikeAnim(MOVE_DATA.launcher, mkPose({ lean: 0.35, legF: [0.95, -1.55], legB: [-0.35, -1.25], armF: [0.25, 0.5], armB: [0.6, 2.0] }), P_LAUNCH),
    grab: [[0, BASE_POSE], [0.22, P_GRAB], [0.45, P_GRAB], [1, BASE_POSE]],
    clp: strikeAnimFrom(POSE_CROUCH, MOVE_DATA.clp, cp({ lean: 0.2, armF: [1.0, 1.8] }), cp({ lean: 0.28, armF: [1.57, 0.05], armB: [0.7, 2.0] })),
    cmp: strikeAnimFrom(POSE_CROUCH, MOVE_DATA.cmp, cp({ lean: 0.15, armF: [0.6, 2.2] }), cp({ lean: 0.4, armF: [1.68, 0.0], armB: [0.4, 2.3] })),
    chp: strikeAnimFrom(POSE_CROUCH, MOVE_DATA.chp, cp({ lean: 0.4, armF: [0.3, 0.6] }), cp({ lean: -0.1, legF: [0.7, -1.0], legB: [0.3, -1.1], armF: [2.75, 0.15], armB: [0.4, 2.0] })),
    clk: strikeAnimFrom(POSE_CROUCH, MOVE_DATA.clk, cp({ legF: [1.0, -1.8] }), cp({ lean: 0.1, legF: [1.42, 0.0], legB: [0.7, -1.6], armF: [1.0, 1.5] })),
    cmk: strikeAnimFrom(POSE_CROUCH, MOVE_DATA.cmk, cp({ lean: 0.1, legF: [1.2, -2.0] }), cp({ lean: -0.12, legF: [1.52, -0.02], legB: [0.75, -1.7], armF: [1.1, 1.3] })),
    chk: strikeAnimFrom(POSE_CROUCH, MOVE_DATA.chk, cp({ lean: 0.45, legF: [0.9, -1.9], armB: [0.2, 0.5] }), cp({ lean: 0.55, head: 0.3, legF: [1.62, 0.02], legB: [1.0, -2.3], armF: [0.3, 0.4], armB: [-0.2, 0.3] })),
    throw: [[0, P_GRAB], [0.4, P_LIFT], [0.52, P_LIFT], [0.68, P_SLAM], [0.85, P_SLAM], [1, BASE_POSE]],
    roll: [[0, P_TUCK], [1, P_TUCK]],
    down: [[0, POSE_KO], [1, POSE_KO]],
    getup: [[0, P_KNEEL], [1, BASE_POSE]]
});

function getFighterPose(f) {
    if (!f.alive) return POSE_KO;
    const anim = AIR_ANIMS[f.state + '_' + (f.airDir || 'f')] || ANIMS[f.state];
    if (anim) return samplePose(anim, clamp01(1 - (f.stateTimer || 0) / (f.stateMax || 1)));
    const a = f.animFrame || 0;
    if (f.stunTimer > 0 || f.state === 'stun') {
        const w = Math.sin(a * 1.4) * 0.22;
        return mkPose({ lean: -0.1 + w, head: w, legF: [0.2, -0.45], legB: [-0.15, -0.4], armF: [0.15 + w, 0.25], armB: [-0.1 + w, 0.3] });
    }
    if (f.state === 'hurt' || f.state === 'held' || f.inJuggle) return POSE_HURT;
    if (f.blocking && f.guardShow) return f.crouching ? POSE_CBLOCK : POSE_BLOCK;
    if (f.crouching) return f.blocking ? POSE_CBLOCK : POSE_CROUCH;
    if (!f.onGround) return f.vy < 0 ? POSE_JUMP_UP : POSE_JUMP_DOWN;
    if (f.state === 'walk' || Math.abs(f.vx || 0) > 0.6) {
        // Caminar de espaldas: las piernas se mueven al revés
        const backwards = (f.vx || 0) * (f.facing || 1) < 0;
        const p = a * 1.7 * (backwards ? -1 : 1), s = Math.sin(p), c = Math.cos(p);
        return mkPose({
            lean: 0.12,
            legF: [0.05 + 0.5 * s, -0.15 - 0.7 * Math.max(0, -c)],
            legB: [0.05 - 0.5 * s, -0.15 - 0.7 * Math.max(0, c)],
            armF: [0.95 - 0.2 * s, 1.6], armB: [0.55 + 0.2 * s, 1.9]
        });
    }
    return mkPose({ armF: [0.9 + Math.sin(a) * 0.06, 1.7], armB: [0.5 + Math.sin(a + 1) * 0.06, 2.0] });
}

const FighterArt = {
    OUT: '#0a0e1a',
    L: { thigh: 25, shin: 25, upper: 19, fore: 18, torso: 40 },

    dark(arch, c) {
        arch._dk = arch._dk || {};
        return arch._dk[c] || (arch._dk[c] = shadeColor(c, -0.32));
    },
    joints(x, y, ang, L1, L2) {
        const a1 = ang[0], a2 = ang[0] + ang[1];
        const kx = x + Math.sin(a1) * L1, ky = y + Math.cos(a1) * L1;
        return { x, y, kx, ky, ex: kx + Math.sin(a2) * L2, ey: ky + Math.cos(a2) * L2, a1, a2 };
    },
    drawJ(ctx, j, w1, w2, c1, c2) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = this.OUT; ctx.lineWidth = Math.max(w1, w2) + 3.5;
        ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(j.kx, j.ky); ctx.lineTo(j.ex, j.ey); ctx.stroke();
        ctx.strokeStyle = c1; ctx.lineWidth = w1;
        ctx.beginPath(); ctx.moveTo(j.x, j.y); ctx.lineTo(j.kx, j.ky); ctx.stroke();
        ctx.strokeStyle = c2; ctx.lineWidth = w2;
        ctx.beginPath(); ctx.moveTo(j.kx, j.ky); ctx.lineTo(j.ex, j.ey); ctx.stroke();
    },
    stroke2(ctx, x1, y1, x2, y2, w, color) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.OUT; ctx.lineWidth = w + 3; ln(ctx, x1, y1, x2, y2);
        ctx.strokeStyle = color; ctx.lineWidth = w; ln(ctx, x1, y1, x2, y2);
    },
    outlinedCircle(ctx, x, y, r, color) {
        ctx.fillStyle = this.OUT; circ(ctx, x, y, r + 1.6);
        ctx.fillStyle = color; circ(ctx, x, y, r);
    },
    foot(ctx, j, w, color) {
        const dx = Math.cos(j.a2), dy = -Math.sin(j.a2);
        const sx = j.ex - dx * 2, sy = j.ey - dy * 2, fx = j.ex + dx * 9, fy = j.ey + dy * 9;
        ctx.lineCap = 'round';
        ctx.strokeStyle = this.OUT; ctx.lineWidth = w + 3.5; ln(ctx, sx, sy, fx, fy);
        ctx.strokeStyle = color; ctx.lineWidth = w; ln(ctx, sx, sy, fx, fy);
    },
    jointCap(ctx, x, y, r, c1, c2) {
        this.outlinedCircle(ctx, x, y, r, c1);
        ctx.fillStyle = c2; circ(ctx, x, y, r * 0.4);
    },
    streamer(ctx, x, y, len, amp, phase, w, color, ang) {
        const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
        const N = 10;
        let prevX = x, prevY = y;
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        for (let i = 1; i <= N; i++) {
            const k = i / N;
            const off = Math.sin(phase - k * 4) * amp * k;
            const nx = x + dx * len * k + px * off, ny = y + dy * len * k + py * off;
            ctx.lineWidth = Math.max(1, w * (1 - k * 0.65));
            ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(nx, ny); ctx.stroke();
            prevX = nx; prevY = ny;
        }
        return { x: prevX, y: prevY };
    },
    flameTongue(ctx, x, y, len, w, ang, color) {
        const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + px * w, y + py * w);
        ctx.quadraticCurveTo(x + dx * len * 0.5 + px * w * 1.1, y + dy * len * 0.5 + py * w * 1.1, x + dx * len, y + dy * len);
        ctx.quadraticCurveTo(x + dx * len * 0.5 - px * w * 1.1, y + dy * len * 0.5 - py * w * 1.1, x - px * w, y - py * w);
        ctx.closePath(); ctx.fill();
    },
    flameShape(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(x - w / 2, y);
        ctx.quadraticCurveTo(x - w * 0.7, y - h * 0.55, x, y - h);
        ctx.quadraticCurveTo(x + w * 0.7, y - h * 0.55, x + w / 2, y);
        ctx.closePath(); ctx.fill();
    },
    fluffyTail(ctx, x0, y0, ang, len, sway, wMax, c1, c2) {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const cx = x0 + dx * len * 0.55 - dy * sway, cy = y0 + dy * len * 0.55 + dx * sway;
        const ex = x0 + Math.cos(ang + 0.45) * len, ey = y0 + Math.sin(ang + 0.45) * len;
        const pts = [];
        for (let i = 0; i <= 14; i++) {
            const k = i / 14, u = 1 - k;
            pts.push({ x: u * u * x0 + 2 * u * k * cx + k * k * ex, y: u * u * y0 + 2 * u * k * cy + k * k * ey, r: (wMax * Math.sin(Math.PI * Math.min(1, k * 1.0 + 0.1))) / 2 + 1.5, k });
        }
        ctx.fillStyle = this.OUT;
        for (const p of pts) circ(ctx, p.x, p.y, p.r + 1.6);
        for (const p of pts) { ctx.fillStyle = p.k > 0.72 ? c2 : c1; circ(ctx, p.x, p.y, p.r); }
    },
    bolt(ctx, x, y, len, ang, seed, color, w = 2) {
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'miter';
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 1; i <= 5; i++) {
            const k = i / 5;
            const j = Math.sin(seed * 13.7 + i * 7.1) * 6;
            ctx.lineTo(x + Math.cos(ang) * len * k - Math.sin(ang) * j, y + Math.sin(ang) * len * k + Math.cos(ang) * j);
        }
        ctx.stroke();
    },
    eye(ctx, x, y, color = '#0a0e1a') {
        ctx.fillStyle = color; ctx.fillRect(x - 1.5, y - 2.2, 3.2, 4.4);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x, y - 2, 1.2, 1.4);
    },
    headPos(C) {
        const r = C.b.head, dx = 2, dy = -42 - r;
        const c = Math.cos(C.P.lean), s = Math.sin(C.P.lean);
        return { x: C.H.x + dx * c - dy * s, y: C.H.y + dx * s + dy * c };
    },
    inTorso(ctx, C, fn) {
        ctx.save(); ctx.translate(C.H.x, C.H.y); ctx.rotate(C.P.lean); fn(); ctx.restore();
    },
    layer(name, C) {
        const part = this.parts[C.arch.id];
        if (part && part[name]) part[name].call(this, C.ctx, C);
    },

    draw(ctx, f, t) {
        const rc = f.archetype._recolor;
        if (rc && typeof Look !== 'undefined') return Look.withRecolor(ctx, rc, () => this._draw(ctx, f, t));
        return this._draw(ctx, f, t);
    },
    _draw(ctx, f, t) {
        const arch = f.archetype, look = arch.look, b = arch.build, L = this.L;
        const P = getFighterPose(f);
        const footY = leg => Math.cos(leg[0]) * L.thigh + Math.cos(leg[0] + leg[1]) * L.shin;
        let hipY = -52;
        if (f.alive && f.onGround) hipY = -(Math.max(footY(P.legF), footY(P.legB)) + 4) - P.lift;
        const bob = (f.alive && f.onGround && (f.state === 'idle' || !f.state)) ? Math.sin(f.animFrame || 0) * 1.4 : 0;
        const H = { x: 0, y: hipY };
        const S = { x: H.x + Math.sin(P.lean) * L.torso, y: H.y - Math.cos(P.lean) * L.torso + bob };
        const tw = b.torso / 2, cl = Math.cos(P.lean), sl = Math.sin(P.lean);
        const shF = { x: S.x + tw * 0.3 * cl - 4 * sl, y: S.y + tw * 0.3 * sl + 4 * cl };
        const shB = { x: S.x - tw * 0.3 * cl - 4 * sl, y: S.y - tw * 0.3 * sl + 4 * cl };
        const C = { ctx, f, arch, look, b, P, H, S, t };
        C.armF = this.joints(shF.x, shF.y, P.armF, L.upper, L.fore);
        C.armB = this.joints(shB.x, shB.y, P.armB, L.upper, L.fore);
        C.legF = this.joints(H.x + tw * 0.28, H.y, P.legF, L.thigh, L.shin);
        C.legB = this.joints(H.x - tw * 0.28, H.y, P.legB, L.thigh, L.shin);

        if (f.alive && f.mp >= 100) this.superAura(ctx, C);
        this.layer('back', C);
        this.drawArm(ctx, C, C.armB, true);
        this.layer('armB', C);
        this.drawLeg(ctx, C, C.legB, true);
        this.drawTorso(ctx, C);
        this.drawLeg(ctx, C, C.legF, false);
        this.drawHead(ctx, C);
        this.drawArm(ctx, C, C.armF, false);
        this.layer('armF', C);
        this.layer('front', C);
        this.fx(ctx, C);
    },

    drawArm(ctx, C, j, back) {
        const { look, b, arch } = C;
        const d = c => (back ? this.dark(arch, c) : c);
        this.drawJ(ctx, j, b.arm, b.arm * 0.92, d(look.upperArm), d(look.foreArm));
        if (look.metal) this.jointCap(ctx, j.kx, j.ky, b.arm * 0.42, d('#cbd5e1'), d(arch.primary));
        this.outlinedCircle(ctx, j.ex, j.ey, b.fist, d(look.glove));
    },
    drawLeg(ctx, C, j, back) {
        const { look, b, arch } = C;
        const d = c => (back ? this.dark(arch, c) : c);
        this.drawJ(ctx, j, b.leg, b.leg * 0.85, d(look.pants), d(look.shin || look.pants));
        if (look.metal) this.jointCap(ctx, j.kx, j.ky, b.leg * 0.42, d('#cbd5e1'), d(arch.primary));
        this.foot(ctx, j, b.leg * 0.72, d(look.boot));
    },
    drawTorso(ctx, C) {
        const { look, b, arch, P, H } = C;
        const female = arch.gender === 'female';
        const tw = b.torso / 2;
        ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(P.lean);
        ctx.fillStyle = look.metal ? '#64748b' : arch.skin;
        ctx.fillRect(-4, -48, 9, 10);
        ctx.beginPath();
        if (female) {
            ctx.moveTo(-tw, -40); ctx.lineTo(tw, -40);
            ctx.quadraticCurveTo(tw * 0.98, -30, tw * 0.64, -17);
            ctx.quadraticCurveTo(tw * 0.98, -5, tw * 0.88, 3);
            ctx.lineTo(-tw * 0.88, 3);
            ctx.quadraticCurveTo(-tw * 0.98, -5, -tw * 0.64, -17);
            ctx.quadraticCurveTo(-tw * 0.98, -30, -tw, -40);
        } else {
            ctx.moveTo(-tw, -42); ctx.lineTo(tw, -42);
            ctx.lineTo(tw * 0.84, -14); ctx.lineTo(tw * 0.74, 3);
            ctx.lineTo(-tw * 0.74, 3); ctx.lineTo(-tw * 0.84, -14);
        }
        ctx.closePath();
        ctx.fillStyle = look.top; ctx.fill();
        ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = this.OUT; ctx.stroke();
        ctx.save(); ctx.clip();
        this.layer('torso', C);
        ctx.restore();
        ctx.restore();
    },
    drawHead(ctx, C) {
        const { look, b, arch, P, H } = C;
        const r = b.head;
        ctx.save(); ctx.translate(H.x, H.y); ctx.rotate(P.lean);
        ctx.translate(2, -42 - r);
        ctx.rotate(P.head - P.lean * 0.6);
        this.layer('headBack', C);
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
        ctx.fillStyle = look.metal ? '#94a3b8' : arch.skin; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = this.OUT; ctx.stroke();
        this.layer('head', C);
        ctx.restore();
    },
    superAura(ctx, C) {
        const { t, arch } = C;
        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(t * 10) * 0.08;
        for (let i = 0; i < 7; i++) {
            const x = -24 + i * 8;
            const h = 98 + Math.sin(t * 9 + i * 1.7) * 18 + (i % 2) * 14;
            this.flameShape(ctx, x, 4, 18, h, arch.primary);
        }
        ctx.globalAlpha = 0.5;
        for (let i = 0; i < 4; i++) {
            const y = -((t * 120 + i * 37) % 130);
            ctx.fillStyle = '#ffffff'; circ(ctx, Math.sin(t * 3 + i * 2) * 22, y, 1.8);
        }
        ctx.restore();
    },
    glowBall(ctx, x, y, r, color) {
        softGlow(ctx, x, y, r * 2.2, color);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, color); g.addColorStop(1, transparentOf(color));
        ctx.fillStyle = g; circ(ctx, x, y, r);
    },
    fx(ctx, C) {
        const { f, arch, t } = C;
        const md = MOVE_DATA[f.state];
        if (!md || !f.alive) return;
        const max = f.stateMax || md.dur;
        const el = max - (f.stateTimer || 0);
        const k = el / max;
        const hx = (C.armF.ex + C.armB.ex) / 2 + 4, hy = (C.armF.ey + C.armB.ey) / 2;
        if (md.release !== undefined) {
            if (el < md.release) {
                const g = el / md.release;
                const R = (f.state === 'super' ? 24 : 12) * g + 4;
                this.glowBall(ctx, hx, hy, R, arch.projColor);
                ctx.save();
                ctx.strokeStyle = arch.projColor; ctx.globalAlpha = 0.8; ctx.lineWidth = 2; ctx.lineCap = 'round';
                for (let i = 0; i < 7; i++) {
                    const an = i * 0.9 + t * 7;
                    const d1 = 46 * (1 - g) + R + 5;
                    ln(ctx, hx + Math.cos(an) * d1, hy + Math.sin(an) * d1, hx + Math.cos(an) * (d1 + 12), hy + Math.sin(an) * (d1 + 12));
                }
                ctx.restore();
            } else if (el < md.release + 7) {
                const g = (el - md.release) / 7;
                ctx.save(); ctx.globalAlpha = 1 - g;
                this.glowBall(ctx, hx + 10, hy, 10 + g * 14, arch.projColor);
                ctx.restore();
            }
            return;
        }
        ctx.save();
        ctx.strokeStyle = arch.primary; ctx.lineCap = 'round';
        if (md.active && md.rank) {
            const a0 = md.active[0] / max - 0.04, a1 = (md.active[1] + 3) / max;
            if (k > a0 && k < a1) {
                const mid = (a0 + a1) / 2, half = (a1 - a0) / 2;
                const fade = 1 - Math.abs(k - mid) / half;
                const big = md.rank === 3;
                if (f.state === 'launcher') {
                    ctx.globalAlpha = 0.65 * fade; ctx.lineWidth = 7;
                    ctx.beginPath(); ctx.arc(C.S.x, C.S.y + 4, 40, -1.7, 0.7); ctx.stroke();
                    ctx.lineWidth = 2; ctx.strokeStyle = '#fde047';
                    ctx.beginPath(); ctx.arc(C.S.x, C.S.y + 4, 40, -1.6, 0.2); ctx.stroke();
                } else if (md.cat === 'punch') {
                    ctx.globalAlpha = (big ? 0.85 : 0.6) * fade; ctx.lineWidth = big ? 4 : 2.5;
                    const fx = C.armF.ex, fy = C.armF.ey, L = big ? 52 : (md.rank === 2 ? 40 : 28);
                    ln(ctx, fx - L, fy - 7, fx - 10, fy - 5);
                    ln(ctx, fx - L - 6, fy, fx - 12, fy);
                    ln(ctx, fx - L, fy + 7, fx - 10, fy + 5);
                    if (big) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ln(ctx, fx - L + 8, fy, fx - 14, fy); }
                } else {
                    const arcs = { 1: [0.35, 1.2], 2: [-0.15, 1.05], 3: [-0.75, 0.95] }[md.rank];
                    ctx.globalAlpha = (big ? 0.7 : 0.55) * fade; ctx.lineWidth = big ? 9 : 6;
                    ctx.beginPath(); ctx.arc(C.H.x, C.H.y, big ? 58 : 50, arcs[0], arcs[1]); ctx.stroke();
                    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
                    ctx.beginPath(); ctx.arc(C.H.x, C.H.y, big ? 58 : 50, arcs[0] + 0.05, arcs[1] - 0.35); ctx.stroke();
                }
            }
        }
        ctx.restore();
    },

    // ------------------------------------------------------------------
    // RASGOS ÚNICOS POR PERSONAJE
    // ------------------------------------------------------------------
    parts: {
        ronin: {
            back(ctx, C) {
                const { S, t, f } = C;
                this.inTorso(ctx, C, () => {
                    this.stroke2(ctx, -17, -50, 12, -4, 6, '#7f1d1d');
                    this.stroke2(ctx, -17, -50, -27, -65, 4.5, '#e5e7eb');
                    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.5;
                    for (let i = 1; i < 4; i++) ln(ctx, -17 - i * 2.5 - 2, -50 - i * 3.75 + 2, -17 - i * 2.5 + 2, -50 - i * 3.75 - 2);
                    ctx.fillStyle = '#facc15'; ctx.fillRect(-21, -53, 8, 5);
                });
                const lift = Math.min(0.55, Math.abs(f.vx || 0) * 0.09 + (f.onGround ? 0 : 0.3));
                const ang = Math.PI - 0.55 + lift;
                this.streamer(ctx, S.x - 3, S.y + 3, 58, 7, t * 9, 9, '#991b1b', ang + 0.12);
                this.streamer(ctx, S.x - 3, S.y + 3, 44, 6, t * 9 + 1.3, 6.5, '#ef4444', ang - 0.08);
                const hp = this.headPos(C);
                this.streamer(ctx, hp.x - C.b.head + 1, hp.y - 4, 26, 4, t * 11, 4, '#ef4444', Math.PI - 0.15 + lift * 0.5);
                this.streamer(ctx, hp.x - C.b.head + 1, hp.y - 2, 20, 3, t * 11 + 1, 3.5, '#dc2626', Math.PI + 0.1 + lift * 0.5);
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2;
                ctx.fillStyle = C.arch.skin;
                ctx.beginPath(); ctx.moveTo(-7, -44); ctx.lineTo(9, -44); ctx.lineTo(2, -24); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(-8, -44); ctx.lineTo(2, -24); ctx.lineTo(10, -44); ctx.stroke();
                ctx.strokeStyle = 'rgba(15,23,42,0.18)'; ctx.lineWidth = 2;
                ln(ctx, -tw + 5, -32, -tw + 9, -14); ln(ctx, tw - 6, -30, tw - 8, -15);
                ctx.fillStyle = '#111827'; ctx.fillRect(-tw - 2, -12, tw * 2 + 4, 7);
                ctx.fillStyle = '#374151'; ctx.fillRect(3, -12, 7, 7);
                ctx.fillStyle = '#e2e8f0';
                for (const sx of [-tw, tw - 9]) {
                    ctx.beginPath(); ctx.moveTo(sx, -42); ctx.lineTo(sx + 3, -36); ctx.lineTo(sx + 6, -41); ctx.lineTo(sx + 9, -35); ctx.lineTo(sx + 9, -42); ctx.closePath(); ctx.fill();
                }
            },
            head(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#111827';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.92, Math.PI * 2.02); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.ellipse(-5, -r - 2, 5.5, 4.5, -0.4, 0, TAU); ctx.fill();
                ctx.fillStyle = '#374151'; ctx.fillRect(-7, -r - 1, 5, 3);
                ctx.fillStyle = '#ef4444'; ctx.fillRect(-r, -6, r * 2, 4.5);
                this.eye(ctx, r * 0.5, -0.5);
                ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.6; ln(ctx, r * 0.25, -3.2, r * 0.8, -2.2);
                ctx.strokeStyle = 'rgba(15,23,42,0.6)'; ctx.lineWidth = 1.4; ln(ctx, r * 0.45, r * 0.5, r * 0.85, r * 0.45);
            },
            front(ctx, C) {
                this.inTorso(ctx, C, () => {
                    this.stroke2(ctx, 6, -7, 11, 7, 3, '#111827');
                    this.stroke2(ctx, 8, -7, 4, 8, 3, '#111827');
                });
            }
        },
        blaze: {
            back(ctx, C) {
                const hp = this.headPos(C), t = C.t;
                const cols = ['#b91c1c', '#f97316', '#fde047'];
                for (let i = 0; i < 3; i++) {
                    const len = 40 - i * 10 + Math.sin(t * 14 + i) * 6;
                    this.flameTongue(ctx, hp.x - 7, hp.y - 5 + i * 2, len, 9 - i * 2.2, Math.PI + 0.28 + Math.sin(t * 6 + i) * 0.14, cols[i]);
                }
            },
            headBack(ctx, C) {
                const r = C.b.head, t = C.t;
                for (let i = 0; i < 5; i++) {
                    const len = 13 + Math.sin(t * 16 + i * 2) * 4 + (i % 2) * 4;
                    this.flameTongue(ctx, -8 + i * 4, -r + 4, len, 4, -Math.PI / 2 - 0.55 + i * 0.12, i % 2 ? '#fde047' : '#f97316');
                }
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2;
                ctx.fillStyle = C.arch.skin; ctx.fillRect(-tw - 2, -24, tw * 2 + 4, 14);
                ctx.fillStyle = '#facc15'; ctx.fillRect(-tw - 2, -25.5, tw * 2 + 4, 2.5);
                ctx.strokeStyle = 'rgba(120,53,15,0.35)'; ctx.lineWidth = 1.5; ln(ctx, 1, -22, 1, -13);
                ctx.fillStyle = '#facc15'; ctx.fillRect(-tw - 2, -10, tw * 2 + 4, 5);
                ctx.fillStyle = '#fde047'; circ(ctx, 3, -7.5, 3);
                this.flameTongue(ctx, 2, -28, 10, 3, -Math.PI / 2, '#fbbf24');
            },
            head(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#c2410c';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.88, Math.PI * 2.05); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(-r, -2); ctx.quadraticCurveTo(-r * 1.15, r * 0.6, -r * 0.6, r * 0.9); ctx.lineTo(-r * 0.5, 0); ctx.closePath(); ctx.fill();
                this.eye(ctx, r * 0.5, 0);
                ctx.strokeStyle = '#0a0e1a'; ctx.lineWidth = 1.4; ln(ctx, r * 0.35, -2.6, r * 0.85, -3.4);
                ctx.fillStyle = '#be123c'; ctx.fillRect(r * 0.55, r * 0.48, 4, 1.8);
            },
            front(ctx, C) {
                const t = C.t;
                for (const j of [C.armF, C.armB]) {
                    const s = Math.sin(t * 18 + j.ex);
                    this.flameTongue(ctx, j.ex, j.ey - 2, 14 + s * 4, 5, -Math.PI / 2 + Math.sin(t * 5) * 0.25, '#f97316');
                    this.flameTongue(ctx, j.ex, j.ey - 2, 8 + s * 2, 2.6, -Math.PI / 2 + Math.sin(t * 5) * 0.25, '#fde047');
                }
            }
        },
        storm: {
            headBack(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#e0f2fe'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 2;
                for (let i = 0; i < 6; i++) {
                    const a = -Math.PI / 2 - 0.1 - i * 0.32;
                    const tip = r + 11 + (i % 2) * 6;
                    ctx.beginPath();
                    ctx.moveTo(Math.cos(a - 0.3) * r * 0.85, Math.sin(a - 0.3) * r * 0.85);
                    ctx.lineTo(Math.cos(a - 0.12) * tip, Math.sin(a - 0.12) * tip);
                    ctx.lineTo(Math.cos(a + 0.3) * r * 0.85, Math.sin(a + 0.3) * r * 0.85);
                    ctx.closePath(); ctx.fill(); ctx.stroke();
                }
            },
            head(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#e0f2fe';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.95, Math.PI * 1.98); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#1f2937'; ctx.fillRect(-r, -r * 0.62, r * 2, 4.5);
                ctx.fillStyle = '#fde047'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(r * 0.55, -r * 0.62 + 2, 3.8, 0, TAU); ctx.fill(); ctx.stroke();
                this.eye(ctx, r * 0.5, 2);
                ctx.strokeStyle = '#0a0e1a'; ctx.lineWidth = 1.6; ln(ctx, r * 0.3, -0.5, r * 0.85, 0.3);
                ln(ctx, r * 0.45, r * 0.6, r * 0.85, r * 0.6);
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2;
                ctx.fillStyle = '#fde047'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-1, -38); ctx.lineTo(8, -38); ctx.lineTo(3, -30); ctx.lineTo(9, -30);
                ctx.lineTo(-4, -17); ctx.lineTo(0, -27); ctx.lineTo(-5, -27); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#1e40af'; ctx.fillRect(-tw, -42, 4, 40); ctx.fillRect(tw - 4, -42, 4, 40);
                ctx.fillStyle = '#f8fafc'; ctx.fillRect(-tw - 2, -11, tw * 2 + 4, 7);
            },
            armB(ctx, C) { this.parts.storm.pauldron.call(this, ctx, C, C.armB, true); },
            armF(ctx, C) { this.parts.storm.pauldron.call(this, ctx, C, C.armF, false); },
            pauldron(ctx, C, j, back) {
                const col = back ? '#64748b' : '#94a3b8';
                ctx.save(); ctx.translate(j.x, j.y); ctx.rotate(-C.P.lean * 0.5);
                ctx.fillStyle = this.OUT; ctx.beginPath(); ctx.ellipse(0, -1, 11.5, 9, 0, Math.PI, TAU); ctx.lineTo(11.5, 4); ctx.lineTo(-11.5, 4); ctx.closePath(); ctx.fill();
                ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -1, 10, 7.5, 0, Math.PI, TAU); ctx.lineTo(10, 2.5); ctx.lineTo(-10, 2.5); ctx.closePath(); ctx.fill();
                ctx.fillStyle = back ? '#a16207' : '#fde047'; ctx.fillRect(-2, -8, 4, 10);
                ctx.restore();
            },
            front(ctx, C) {
                const t = C.t, f = C.f;
                const tick = Math.floor(t * 14) + (f.slotIndex || 0);
                if (tick % 3 !== 0) return;
                ctx.save(); ctx.lineCap = 'round';
                for (const j of [C.armF, C.armB]) {
                    this.bolt(ctx, j.ex, j.ey, 16, -Math.PI / 2 + Math.sin(tick) * 1.2, tick + j.ex, '#fde047', 2.2);
                    this.bolt(ctx, j.ex, j.ey, 10, Math.cos(tick) * 2, tick * 3, '#ffffff', 1.2);
                }
                ctx.restore();
            }
        },
        vixen: {
            back(ctx, C) {
                const { H, t } = C;
                for (let i = 2; i >= 0; i--) {
                    this.fluffyTail(ctx, H.x - 8, H.y - 4, Math.PI + 0.35 + i * 0.32, 56 - i * 3, Math.sin(t * 3 + i * 1.3) * 9, 15, '#4c1d95', '#f5d0fe');
                }
            },
            headBack(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#3b0764'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-r * 0.2, -r);
                ctx.quadraticCurveTo(-r * 1.7, -r * 0.4, -r * 1.4, r * 1.6);
                ctx.quadraticCurveTo(-r * 1.0, r * 2.6, -r * 0.4, r * 2.2);
                ctx.lineTo(-r * 0.1, r * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
                for (const [bx, tx] of [[-r * 0.55, -r * 0.8], [r * 0.15, r * 0.2]]) {
                    ctx.fillStyle = '#6b21a8';
                    ctx.beginPath(); ctx.moveTo(bx - 5, -r * 0.75); ctx.lineTo(tx, -r * 2.0); ctx.lineTo(bx + 6, -r * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke();
                    ctx.fillStyle = '#f0abfc';
                    ctx.beginPath(); ctx.moveTo(bx - 2, -r * 0.85); ctx.lineTo(tx + 0.5, -r * 1.65); ctx.lineTo(bx + 3, -r * 0.9); ctx.closePath(); ctx.fill();
                }
            },
            head(ctx, C) {
                const r = C.b.head, t = C.t;
                ctx.fillStyle = '#3b0764';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.9, Math.PI * 2.05); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(r * 0.1, -r); ctx.lineTo(r * 1.0, -r * 0.2); ctx.lineTo(r * 0.3, -r * 0.35); ctx.closePath(); ctx.fill();
                ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 0.5, 0, TAU); ctx.clip();
                ctx.fillStyle = '#0f0a1f'; ctx.fillRect(-r * 0.1, r * 0.28, r * 1.3, r);
                ctx.fillStyle = '#c084fc'; ctx.fillRect(-r * 0.1, r * 0.28, r * 1.3, 1.5);
                ctx.restore();
                softGlow(ctx, r * 0.5, -1, 7, `rgba(239,68,68,${0.45 + Math.sin(t * 5) * 0.15})`);
                ctx.fillStyle = '#f87171'; ctx.fillRect(r * 0.5 - 2, -2.5, 5, 2.6);
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2;
                ctx.strokeStyle = '#7e22ce'; ctx.lineWidth = 6; ln(ctx, -tw, -40, tw, -8);
                ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 1.5; ln(ctx, -tw, -43, tw, -11);
                ctx.fillStyle = '#c084fc'; ctx.fillRect(-tw, -42, tw * 2, 2.5);
                ctx.fillStyle = '#6b21a8'; ctx.fillRect(-tw - 2, -8, tw * 2 + 4, 5);
            },
            front(ctx, C) {
                ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(C.t * 6) * 0.2;
                for (const j of [C.armF, C.armB]) softGlow(ctx, j.ex, j.ey, 11, 'rgba(192,132,252,0.75)');
                ctx.restore();
            }
        },
        cyborg: {
            back(ctx, C) {
                const f = C.f, t = C.t;
                this.inTorso(ctx, C, () => {
                    const tw = C.b.torso / 2;
                    if (!f.onGround && f.alive) {
                        for (let i = 0; i < 2; i++) {
                            const len = 22 + Math.sin(t * 30 + i) * 6;
                            this.flameTongue(ctx, -tw - 2 + i * 7, -10, len, 4, Math.PI / 2, '#ec4899');
                            this.flameTongue(ctx, -tw - 2 + i * 7, -10, len * 0.6, 2, Math.PI / 2, '#a5f3fc');
                        }
                    }
                    ctx.fillStyle = this.OUT; ctx.fillRect(-tw - 8, -40, 18, 32);
                    ctx.fillStyle = '#475569'; ctx.fillRect(-tw - 6.5, -38.5, 15, 29);
                    ctx.fillStyle = '#22d3ee'; ctx.fillRect(-tw - 4, -34, 3, 18);
                    ctx.fillStyle = '#1e293b'; ctx.fillRect(-tw - 6, -11, 6, 4); ctx.fillRect(-tw + 1, -11, 6, 4);
                });
            },
            headBack(ctx, C) {
                const r = C.b.head;
                ctx.strokeStyle = this.OUT; ctx.lineWidth = 3.5; ln(ctx, -r * 0.4, -r * 0.7, -r * 0.9, -r * 1.9);
                ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.8; ln(ctx, -r * 0.4, -r * 0.7, -r * 0.9, -r * 1.9);
                ctx.fillStyle = Math.sin(C.t * 6) > 0 ? '#ec4899' : '#831843'; circ(ctx, -r * 0.9, -r * 1.9, 2.6);
            },
            head(ctx, C) {
                const r = C.b.head, t = C.t;
                ctx.fillStyle = '#475569';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 1.0, Math.PI * 2.0); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#334155';
                ctx.beginPath(); ctx.arc(0, 0, r, 0.15, Math.PI * 0.85); ctx.closePath(); ctx.fill();
                ctx.fillStyle = this.OUT; ctx.fillRect(-r * 0.15, -r * 0.42, r * 1.25, 7);
                ctx.fillStyle = '#22d3ee'; ctx.fillRect(-r * 0.1, -r * 0.42 + 1.3, r * 1.15, 4.4);
                const sx = r * 0.45 + Math.sin(t * 4) * r * 0.45;
                ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, -r * 0.42 + 1.3, 3, 4.4);
                softGlow(ctx, r * 0.5, -r * 0.3, 10, 'rgba(34,211,238,0.45)');
                ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-r * 0.25, r * 0.05, r * 0.32, 0, TAU); ctx.stroke();
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2, t = C.t;
                ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
                ln(ctx, -tw, -24, tw, -24); ln(ctx, 0, -24, 0, -4);
                ctx.fillStyle = '#475569'; ctx.fillRect(-tw + 3, -21, tw - 5, 6); ctx.fillRect(2, -21, tw - 5, 6);
                ctx.fillRect(-tw + 4, -13, tw - 6, 6); ctx.fillRect(2, -13, tw - 6, 6);
                const pulse = 0.6 + Math.sin(t * 5) * 0.3;
                softGlow(ctx, 3, -33, 14, `rgba(236,72,153,${pulse})`);
                ctx.fillStyle = '#fbcfe8'; circ(ctx, 3, -33, 4.5);
                ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(3, -33, 7, 0, TAU); ctx.stroke();
                ctx.fillStyle = '#1e293b'; ctx.fillRect(-tw - 2, -5, tw * 2 + 4, 6);
                ctx.fillStyle = '#22d3ee'; for (let i = -2; i <= 2; i++) ctx.fillRect(i * 6 - 1, -3.5, 2.5, 2.5);
            },
            front(ctx, C) {
                ctx.fillStyle = '#22d3ee';
                for (const j of [C.armF]) { circ(ctx, j.ex + 2, j.ey - 2, 1.8); circ(ctx, j.ex + 2, j.ey + 2, 1.8); }
            }
        },
        zephyra: {
            headBack(ctx, C) {
                const r = C.b.head, t = C.t, f = C.f;
                const lift = Math.min(0.5, Math.abs(f.vx || 0) * 0.08);
                this.streamer(ctx, -r * 0.6, -r * 0.55, 54, 7, t * 7, 8, '#cbd5e1', Math.PI + 0.25 - lift);
                this.streamer(ctx, -r * 0.6, -r * 0.55, 54, 7, t * 7, 6, '#f1f5f9', Math.PI + 0.25 - lift);
                this.streamer(ctx, -r * 0.5, -r * 0.1, 50, 7, t * 7 + 1.4, 8, '#cbd5e1', Math.PI - 0.3 + lift);
                this.streamer(ctx, -r * 0.5, -r * 0.1, 50, 7, t * 7 + 1.4, 6, '#f1f5f9', Math.PI - 0.3 + lift);
                ctx.fillStyle = '#10b981'; circ(ctx, -r * 0.65, -r * 0.55, 3); circ(ctx, -r * 0.55, -r * 0.1, 3);
            },
            head(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#e2e8f0';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.92, Math.PI * 2.02); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(r * 0.2, -r); ctx.quadraticCurveTo(r * 1.1, -r * 0.6, r * 0.95, -r * 0.05); ctx.lineTo(r * 0.45, -r * 0.45); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#10b981'; ctx.fillRect(-r, -r * 0.6, r * 1.6, 3.5);
                ctx.save(); ctx.translate(-r * 0.75, -r * 0.65); ctx.rotate(-2.3);
                ctx.fillStyle = '#6ee7b7'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.ellipse(0, -9, 3.5, 10, 0, 0, TAU); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = '#047857'; ln(ctx, 0, 0, 0, -18);
                ctx.restore();
                this.eye(ctx, r * 0.5, 0.5, '#064e3b');
                ctx.fillStyle = '#e11d48'; ctx.fillRect(r * 0.6, r * 0.5, 3, 1.5);
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2;
                ctx.fillStyle = '#6ee7b7';
                ctx.beginPath(); ctx.moveTo(-tw, -40); ctx.lineTo(-2, -26); ctx.lineTo(-tw * 0.3, -40); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(tw, -40); ctx.lineTo(4, -26); ctx.lineTo(tw * 0.35, -40); ctx.closePath(); ctx.fill();
                ctx.fillStyle = C.arch.skin; ctx.beginPath(); ctx.moveTo(-tw * 0.3, -40); ctx.lineTo(1, -30); ctx.lineTo(tw * 0.35, -40); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#a7f3d0'; ctx.fillRect(-tw - 2, -12, tw * 2 + 4, 6);
                ctx.fillStyle = '#34d399'; ctx.fillRect(-tw - 2, -7, tw * 2 + 4, 1.5);
            },
            front(ctx, C) {
                const t = C.t, f = C.f;
                this.inTorso(ctx, C, () => {
                    const tw = C.b.torso / 2;
                    ctx.strokeStyle = this.OUT; ctx.lineWidth = 2;
                    for (let i = 0; i < 3; i++) {
                        const x = -tw * 0.8 + i * tw * 0.75;
                        const fl = Math.sin(t * 9 + i * 1.7) * 4;
                        ctx.fillStyle = i === 1 ? '#a7f3d0' : '#34d399';
                        ctx.beginPath(); ctx.moveTo(x - 6, -6); ctx.lineTo(x + 6, -6); ctx.lineTo(x + 2 + fl, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
                    }
                });
                const lift = Math.min(0.5, Math.abs(f.vx || 0) * 0.08);
                this.streamer(ctx, C.armB.ex, C.armB.ey, 38, 6, t * 10, 3.5, 'rgba(167,243,208,0.85)', Math.PI - 0.2 + lift);
                this.streamer(ctx, C.armF.ex, C.armF.ey, 42, 6, t * 10 + 1.5, 3.5, '#a7f3d0', Math.PI - 0.35 + lift);
                if (f.onGround && f.alive) {
                    ctx.save(); ctx.strokeStyle = 'rgba(167,243,208,0.45)'; ctx.lineWidth = 2;
                    for (let i = 0; i < 2; i++) {
                        const a0 = t * 4 + i * Math.PI;
                        ctx.beginPath(); ctx.ellipse(0, -4, 26 + i * 6, 5, 0, a0, a0 + 2.2); ctx.stroke();
                    }
                    ctx.restore();
                }
            }
        },
        titan: {
            back(ctx, C) { this.parts.titan.pebbles.call(this, ctx, C, false); },
            pebbles(ctx, C, front) {
                const t = C.t;
                for (let i = 0; i < 3; i++) {
                    const a = t * 2 + i * 2.1;
                    if ((Math.sin(a) > 0) !== front) continue;
                    const x = Math.cos(a) * 40, y = C.H.y - 18 + Math.sin(a) * 9;
                    ctx.fillStyle = this.OUT;
                    ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 1, y - 5.5); ctx.lineTo(x + 5, y - 2); ctx.lineTo(x + 3, y + 4.5); ctx.lineTo(x - 3, y + 4); ctx.closePath(); ctx.fill();
                    ctx.fillStyle = front ? '#a8a29e' : '#78716c';
                    ctx.beginPath(); ctx.moveTo(x - 3.5, y); ctx.lineTo(x - 1, y - 4); ctx.lineTo(x + 3.5, y - 1.5); ctx.lineTo(x + 2, y + 3); ctx.lineTo(x - 2, y + 2.8); ctx.closePath(); ctx.fill();
                }
            },
            head(ctx, C) {
                const r = C.b.head;
                ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2.5; ln(ctx, r * 0.15, -r * 0.35, r * 0.95, -r * 0.2);
                this.eye(ctx, r * 0.55, -1);
                ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.5; ln(ctx, -r * 0.5, -r * 0.8, -r * 0.1, -r * 0.3);
                ctx.fillStyle = '#1c1917'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-r * 0.35, r * 0.1); ctx.lineTo(r * 1.0, r * 0.15);
                ctx.lineTo(r * 0.75, r * 1.0); ctx.lineTo(r * 0.3, r * 1.55); ctx.lineTo(-r * 0.15, r * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#c68642'; ctx.fillRect(r * 0.45, r * 0.38, 5, 2);
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2, t = C.t;
                ctx.strokeStyle = 'rgba(69,26,3,0.45)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(-tw * 0.35, -34, tw * 0.42, 0.3, 2.6); ctx.stroke();
                ctx.beginPath(); ctx.arc(tw * 0.35, -34, tw * 0.42, 0.55, 2.85); ctx.stroke();
                ln(ctx, 0, -24, 0, -12); ln(ctx, -6, -20, 6, -20);
                ctx.fillStyle = '#78716c'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(-tw - 2, -44); ctx.lineTo(-tw * 0.1, -44); ctx.lineTo(tw * 0.15, -34); ctx.lineTo(-tw * 0.3, -22); ctx.lineTo(-tw - 2, -26); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.strokeStyle = `rgba(251,191,36,${0.6 + Math.sin(t * 3) * 0.3})`; ctx.lineWidth = 1.6;
                ctx.beginPath(); ctx.moveTo(-tw * 0.7, -40); ctx.lineTo(-tw * 0.45, -33); ctx.lineTo(-tw * 0.6, -27); ctx.stroke();
                ctx.fillStyle = '#57534e'; ctx.fillRect(-tw - 2, -11, tw * 2 + 4, 9);
                ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(3, -11); ctx.lineTo(8, -6.5); ctx.lineTo(3, -2); ctx.lineTo(-2, -6.5); ctx.closePath(); ctx.fill(); ctx.stroke();
            },
            boulder(ctx, j, back, t) {
                ctx.save(); ctx.translate(j.x, j.y - 2);
                const pts = [[-13, 2], [-12, -7], [-5, -12], [5, -11], [13, -5], [12, 4]];
                ctx.fillStyle = this.OUT; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * 1.12, y * 1.12) : ctx.moveTo(x * 1.12, y * 1.12))); ctx.closePath(); ctx.fill();
                ctx.fillStyle = back ? '#57534e' : '#78716c'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
                ctx.strokeStyle = `rgba(251,191,36,${back ? 0.4 : 0.6 + Math.sin(t * 3) * 0.3})`; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-1, -3); ctx.lineTo(5, -6); ctx.stroke();
                ctx.restore();
            },
            armB(ctx, C) { this.parts.titan.boulder.call(this, ctx, C.armB, true, C.t); },
            armF(ctx, C) { this.parts.titan.boulder.call(this, ctx, C.armF, false, C.t); },
            front(ctx, C) {
                this.parts.titan.pebbles.call(this, ctx, C, true);
                ctx.strokeStyle = 'rgba(251,191,36,0.65)'; ctx.lineWidth = 1.2;
                const j = C.armF; ln(ctx, j.ex - 4, j.ey - 3, j.ex + 2, j.ey + 3);
            }
        },
        viper: {
            back(ctx, C) {
                const hp = this.headPos(C), t = C.t, r = C.b.head;
                const end = this.streamer(ctx, hp.x - r * 0.8, hp.y + r * 0.2, 54, 6, t * 5, 7, '#14532d', Math.PI * 0.68);
                this.streamer(ctx, hp.x - r * 0.8, hp.y + r * 0.2, 54, 6, t * 5, 4, '#4d7c0f', Math.PI * 0.68);
                ctx.save(); ctx.translate(end.x, end.y); ctx.rotate(Math.PI * 0.68 + Math.sin(t * 5 - 4) * 0.3);
                ctx.fillStyle = '#365314'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(9, -3); ctx.lineTo(12, 0); ctx.lineTo(9, 3); ctx.lineTo(-2, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#facc15'; circ(ctx, 7, -1.5, 1.3);
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ln(ctx, 12, 0, 16, Math.sin(t * 20) * 2);
                ctx.restore();
            },
            headBack(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#4d7c0f'; ctx.strokeStyle = this.OUT; ctx.lineWidth = 2.5;
                ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.9);
                ctx.quadraticCurveTo(-r * 2.1, r * 0.4, -r * 1.6, -r * 0.9);
                ctx.quadraticCurveTo(-r * 1.0, -r * 1.9, r * 0.2, -r * 1.35);
                ctx.lineTo(r * 0.3, -r * 0.4); ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#365314';
                ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.6); ctx.quadraticCurveTo(-r * 1.6, r * 0.2, -r * 1.25, -r * 0.7); ctx.quadraticCurveTo(-r * 0.8, -r * 1.4, 0, -r * 1.05); ctx.closePath(); ctx.fill();
                for (const [x, y] of [[-r * 1.15, -r * 0.35], [-r * 0.6, -r * 1.0]]) {
                    ctx.fillStyle = '#bef264'; circ(ctx, x, y, 3.2);
                    ctx.fillStyle = '#1a2e05'; circ(ctx, x, y, 1.4);
                }
            },
            head(ctx, C) {
                const r = C.b.head;
                ctx.fillStyle = '#14532d';
                ctx.beginPath(); ctx.arc(0, 0, r, Math.PI * 0.9, Math.PI * 2.02); ctx.closePath(); ctx.fill();
                ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r - 0.5, 0, TAU); ctx.clip();
                ctx.fillStyle = '#1a2e05'; ctx.fillRect(-r * 0.05, r * 0.3, r * 1.3, r);
                ctx.restore();
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath(); ctx.moveTo(r * 0.45, r * 0.32); ctx.lineTo(r * 0.55, r * 0.7); ctx.lineTo(r * 0.65, r * 0.32); ctx.fill();
                ctx.beginPath(); ctx.moveTo(r * 0.75, r * 0.3); ctx.lineTo(r * 0.84, r * 0.66); ctx.lineTo(r * 0.93, r * 0.28); ctx.fill();
                ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(r * 0.52, -1, 2.8, 2.2, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = '#0a0e1a'; ctx.fillRect(r * 0.52 - 0.6, -3, 1.3, 4);
            },
            torso(ctx, C) {
                const tw = C.b.torso / 2;
                ctx.strokeStyle = 'rgba(163,230,53,0.35)'; ctx.lineWidth = 1.2;
                for (let row = 0; row < 7; row++) {
                    const y = -38 + row * 5.5;
                    for (let x = -tw - 4 + (row % 2) * 3; x < tw + 4; x += 6) { ctx.beginPath(); ctx.arc(x, y, 3, 0.2, Math.PI - 0.2); ctx.stroke(); }
                }
                ctx.strokeStyle = '#bef264'; ctx.lineWidth = 2.2;
                ctx.beginPath(); ctx.moveTo(-tw * 0.55, -42); ctx.lineTo(1, -30); ctx.lineTo(tw * 0.6, -42); ctx.stroke();
                ctx.fillStyle = '#bef264'; ctx.fillRect(-tw - 2, -9, tw * 2 + 4, 4.5);
                ctx.fillStyle = '#365314'; ctx.beginPath(); ctx.ellipse(2, -6.8, 4, 3, 0, 0, TAU); ctx.fill();
            },
            front(ctx, C) {
                const t = C.t;
                ctx.strokeStyle = '#d9f99d'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
                const j = C.armF;
                for (let i = -1; i <= 1; i++) ln(ctx, j.ex + 3, j.ey + i * 3, j.ex + 8, j.ey + i * 3.5);
                for (const h of [C.armF, C.armB]) {
                    const d = (t * 40 + h.ex * 3) % 22;
                    ctx.fillStyle = `rgba(163,230,53,${1 - d / 22})`;
                    circ(ctx, h.ex, h.ey + 5 + d, 2);
                }
            }
        }
    }
};
