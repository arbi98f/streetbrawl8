'use strict';
// Configuración: controles por defecto, arenas, luchadores, colores y perfiles de sonido

// =========================================================================
// MAPEO DE CONTROLES RECONFIGURABLES
// =========================================================================
const DEFAULT_GAMEPAD_BINDS = {
    lp: 2,      // X  puño débil
    mp: 3,      // Y  puño medio
    hp: 4,      // LB puño fuerte
    lk: 0,      // A  patada débil
    mk: 1,      // B  patada media
    hk: 5,      // RB patada fuerte
    t1: 6,      // LT  } LT + RT a la vez = SÚPER
    t2: 7       // RT  }
};

const DEFAULT_KEYBOARD_BINDS = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    lp: ['KeyU'],
    mp: ['KeyI'],
    hp: ['KeyO'],
    lk: ['KeyJ'],
    mk: ['KeyK'],
    hk: ['KeyL']
};

// Posiciones del táctil: x e y = centro del control en % del ancho / alto de la pantalla; s = escala (1 = tamaño normal)
const DEFAULT_TOUCH_LAYOUT = {
    move:  { x: 14, y: 72, s: 1 },   // cruceta o analógico (según el modo elegido)
    super: { x: 64, y: 64, s: 1 },
    grab:  { x: 64, y: 84, s: 1 },
    lp: { x: 74, y: 64, s: 1 }, mp: { x: 83, y: 64, s: 1 }, hp: { x: 92, y: 64, s: 1 },
    lk: { x: 74, y: 84, s: 1 }, mk: { x: 83, y: 84, s: 1 }, hk: { x: 92, y: 84, s: 1 }
};

// Perfiles de controles INDEPENDIENTES por modo (versus / cooperativo): teclado, mando y táctil.
const CONTROL_MODES = ['versus', 'coop'];
const CtrlProfiles = {
    KEY: 'ctrl_profiles_v4',
    playMode: 'versus',   // modo de la partida en curso (lo usa el motor)
    editMode: 'versus',   // modo que se está editando en Ajustes
    data: null,
    defaults() {
        return {
            gp: { ...DEFAULT_GAMEPAD_BINDS },
            kb: JSON.parse(JSON.stringify(DEFAULT_KEYBOARD_BINDS)),
            pause: { gp: 9, kb: ['KeyP'] },   // Start / P por defecto (Esc siempre pausa también)
            touch: { mode: 'dpad', layout: JSON.parse(JSON.stringify(DEFAULT_TOUCH_LAYOUT)) }
        };
    },
    merge(base, saved) {
        const out = base;
        if (!saved || typeof saved !== 'object') return out;
        if (saved.gp) out.gp = { ...out.gp, ...saved.gp };
        if (saved.kb) out.kb = { ...out.kb, ...saved.kb };
        if (saved.pause && typeof saved.pause === 'object') {
            if (Number.isInteger(saved.pause.gp)) out.pause.gp = saved.pause.gp;
            if (Array.isArray(saved.pause.kb)) out.pause.kb = saved.pause.kb.filter(k => typeof k === 'string').slice(0, 2);
        }
        // La pausa no puede compartir botón/tecla con otra acción (perfiles guardados antes de que fuera reasignable)
        if (Object.values(out.gp).includes(out.pause.gp)) out.pause.gp = -1;
        const kbUsed = Object.values(out.kb).flat();
        out.pause.kb = out.pause.kb.filter(k => !kbUsed.includes(k));
        if (saved.touch) {
            if (saved.touch.mode === 'stick' || saved.touch.mode === 'dpad') out.touch.mode = saved.touch.mode;
            const L = saved.touch.layout || {};
            for (const k of Object.keys(out.touch.layout)) {
                const v = L[k];
                if (v && isFinite(v.x) && isFinite(v.y) && isFinite(v.s)) out.touch.layout[k] = { x: +v.x, y: +v.y, s: +v.s };
            }
        }
        return out;
    },
    load() {
        let saved = null, legacyGp = null, legacyKb = null;
        try { saved = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) {}
        try { legacyGp = JSON.parse(localStorage.getItem('gamepad_binds_v3')); } catch (e) {}
        try { legacyKb = JSON.parse(localStorage.getItem('keyboard_binds_v3')); } catch (e) {}
        this.data = {};
        for (const m of CONTROL_MODES) {
            const d = this.defaults();
            // Migración: los ajustes antiguos (v3) pasan a ambos modos la primera vez
            if (!saved) this.merge(d, { gp: legacyGp || undefined, kb: legacyKb || undefined });
            else this.merge(d, saved[m]);
            this.data[m] = d;
        }
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {} },
    reset(mode) { this.data[mode] = this.defaults(); },
    gp(mode) { return this.data[mode || this.playMode].gp; },
    kb(mode) { return this.data[mode || this.playMode].kb; },
    pause(mode) { return this.data[mode || this.playMode].pause; },
    touch(mode) { return this.data[mode || this.playMode].touch; }
};
CtrlProfiles.load();

const GAMEPAD_BUTTON_NAMES = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Back', 9: 'Start', 10: 'L3', 11: 'R3',
    12: 'Cruz ↑', 13: 'Cruz ↓', 14: 'Cruz ←', 15: 'Cruz →'
};

const BIND_LABELS = {
    lp: 'Puño débil', mp: 'Puño medio', hp: 'Puño fuerte',
    lk: 'Patada débil', mk: 'Patada media', hk: 'Patada fuerte',
    t1: 'Súper: gatillo 1 (LT)', t2: 'Súper: gatillo 2 (RT)', up: 'Saltar', down: 'Agacharse (↓↓ baja de plataforma)',
    left: 'Mover Izquierda', right: 'Mover Derecha', pause: 'Pausa'
};

// En cooperativo cambian los nombres: puño débil = salto corto, patada débil = salto largo, ↑↓ = fondo/frente
const BIND_LABELS_COOP = { lp: 'Salto corto', lk: 'Salto largo', up: 'Ir al fondo (↑)', down: 'Ir al frente (↓)' };
function bindLabel(action, mode) {
    if ((mode || CtrlProfiles.editMode) === 'coop' && BIND_LABELS_COOP[action]) return BIND_LABELS_COOP[action];
    return BIND_LABELS[action];
}

let activeRebindAction = null;
let activeRebindType = null;

// =========================================================================
// 1. DEFINICIÓN DE 8 MAPAS TEMÁTICOS ÚNICOS
// =========================================================================
const ARENAS = {
    suzaku: {
        id: 'suzaku', name: 'Santuario Ancestral', icon: '🏯',
        bgGradient: ['#060814', '#161e38', '#3b1c54'],
        moonColor: 'rgba(250, 204, 21, 0.2)', floorColor: '#334155', accentColor: '#facc15',
        soundType: 'wind',
        platforms: [{ x: 260, y: 455, w: 320 }, { x: 1170, y: 455, w: 320 }, { x: 715, y: 345, w: 320 }]
    },
    volcano: {
        id: 'volcano', name: 'Cráter Ígneo', icon: '🌋',
        bgGradient: ['#120303', '#3d0808', '#7c2d12'],
        moonColor: 'rgba(249, 115, 22, 0.3)', floorColor: '#451a03', accentColor: '#f97316',
        soundType: 'rumble',
        platforms: [{ x: 150, y: 470, w: 280 }, { x: 520, y: 360, w: 240 }, { x: 1000, y: 440, w: 300 }, { x: 1380, y: 340, w: 220 }]
    },
    eclipse: {
        id: 'eclipse', name: 'Cúpula del Eclipse', icon: '🌑',
        bgGradient: ['#030206', '#1a0b2e', '#3b0764'],
        moonColor: 'rgba(239, 68, 68, 0.4)', floorColor: '#2e1065', accentColor: '#c084fc',
        soundType: 'dark',
        platforms: [{ x: 140, y: 460, w: 220 }, { x: 520, y: 370, w: 220 }, { x: 1010, y: 370, w: 220 }, { x: 1390, y: 460, w: 220 }, { x: 765, y: 270, w: 220 }]
    },
    cyber: {
        id: 'cyber', name: 'Ciudad Neón', icon: '🌃',
        bgGradient: ['#020617', '#0f172a', '#1e1b4b'],
        moonColor: 'rgba(34, 211, 238, 0.25)', floorColor: '#0f172a', accentColor: '#22d3ee',
        soundType: 'cyber',
        platforms: [{ x: 100, y: 480, w: 240 }, { x: 420, y: 400, w: 220 }, { x: 1110, y: 400, w: 220 }, { x: 1410, y: 480, w: 240 }, { x: 745, y: 300, w: 260 }]
    },
    lab: {
        id: 'lab', name: 'Laboratorio Cuántico', icon: '🧪',
        bgGradient: ['#021217', '#062c38', '#084b5c'],
        moonColor: 'rgba(56, 189, 248, 0.3)', floorColor: '#0e3a47', accentColor: '#38bdf8',
        soundType: 'tech',
        platforms: [{ x: 60, y: 455, w: 470 }, { x: 1220, y: 455, w: 470 }, { x: 700, y: 335, w: 350 }]
    },
    emerald: {
        id: 'emerald', name: 'Templo Esmeralda', icon: '🎋',
        bgGradient: ['#02140a', '#06371e', '#045c30'],
        moonColor: 'rgba(52, 211, 153, 0.25)', floorColor: '#064e3b', accentColor: '#34d399',
        soundType: 'bamboo',
        platforms: [{ x: 170, y: 480, w: 220 }, { x: 1360, y: 480, w: 220 }, { x: 600, y: 480, w: 550 }, { x: 770, y: 360, w: 210 }]
    },
    seismic: {
        id: 'seismic', name: 'Abismo Sísmico', icon: '🪨',
        bgGradient: ['#140f06', '#38270f', '#573a11'],
        moonColor: 'rgba(217, 119, 6, 0.25)', floorColor: '#451a03', accentColor: '#d97706',
        soundType: 'earth',
        platforms: [{ x: 220, y: 485, w: 200 }, { x: 520, y: 395, w: 190 }, { x: 1040, y: 395, w: 190 }, { x: 1330, y: 485, w: 200 }, { x: 780, y: 300, w: 190 }]
    },
    toxic: {
        id: 'toxic', name: 'Foso Tóxico', icon: '☣️',
        bgGradient: ['#0c1402', '#1f3805', '#365314'],
        moonColor: 'rgba(163, 230, 53, 0.3)', floorColor: '#1a2e05', accentColor: '#a3e635',
        soundType: 'acid',
        platforms: [{ x: 120, y: 500, w: 200 }, { x: 1430, y: 500, w: 200 }, { x: 420, y: 420, w: 280 }, { x: 1050, y: 420, w: 280 }, { x: 700, y: 320, w: 350 }]
    }
};

// =========================================================================
// 2. ROSTER DE 8 LUCHADORES ÚNICOS (4 H / 4 M)
// =========================================================================
const FIGHTER_ARCHETYPES = [
    {
        id: 'ronin', name: 'RONIN', gender: 'male', element: 'Energía Azul',
        powerName: 'Onda Azul', superName: 'Nova Estelar', homeArena: 'suzaku',
        primary: '#38bdf8', secondary: '#0284c7', giColor: '#f8fafc', bandColor: '#ef4444', skin: '#f1c27d', icon: '🔵',
        accessory: 'scarf', stats: { atk: 4, spd: 4, pwr: 5 }, speed: 5.3, jumpForce: -14.4, projSpeed: 9.8, projColor: '#38bdf8',
        build: { s: 1.0, torso: 36, arm: 10, leg: 14, fist: 6.5, head: 13 },
        look: { top: '#f1f5f9', upperArm: '#f1c27d', foreArm: '#e5e7eb', glove: '#38bdf8', pants: '#1e293b', boot: '#0f172a' },
        trait: 'Samurái errante · katana a la espalda y bufanda carmesí'
    },
    {
        id: 'blaze', name: 'BLAZE', gender: 'female', element: 'Fuego Carmesí',
        powerName: 'Orbe Ígneo', superName: 'Erupción Solar', homeArena: 'volcano',
        primary: '#f97316', secondary: '#dc2626', giColor: '#dc2626', bandColor: '#facc15', skin: '#f1c27d', icon: '🔥',
        accessory: 'flameAura', stats: { atk: 5, spd: 4, pwr: 4 }, speed: 5.5, jumpForce: -14.6, projSpeed: 10.2, projColor: '#f97316',
        build: { s: 0.95, torso: 30, arm: 8.5, leg: 11, fist: 5.5, head: 12 },
        look: { top: '#991b1b', upperArm: '#f1c27d', foreArm: '#7c2d12', glove: '#f97316', pants: '#dc2626', shin: '#b91c1c', boot: '#450a0a' },
        trait: 'Melena de fuego viva · puños envueltos en llamas'
    },
    {
        id: 'storm', name: 'STORM', gender: 'male', element: 'Rayo Celeste',
        powerName: 'Pulso Eléctrico', superName: 'Tormenta Voltio', homeArena: 'lab',
        primary: '#60a5fa', secondary: '#fde047', giColor: '#2563eb', bandColor: '#f8fafc', skin: '#f5cba7', icon: '⚡',
        accessory: 'pauldrons', stats: { atk: 3, spd: 5, pwr: 4 }, speed: 6.1, jumpForce: -15.2, projSpeed: 11.2, projColor: '#fde047',
        build: { s: 1.03, torso: 40, arm: 11.5, leg: 14, fist: 7, head: 13.5 },
        look: { top: '#2563eb', upperArm: '#2563eb', foreArm: '#f5cba7', glove: '#fde047', pants: '#1e3a8a', boot: '#1e293b' },
        trait: 'Hombreras de acero · chispas eléctricas en los puños'
    },
    {
        id: 'vixen', name: 'VIXEN', gender: 'female', element: 'Oscuridad Satsui',
        powerName: 'Espectro Oscuro', superName: 'Eclipse Total', homeArena: 'eclipse',
        primary: '#c084fc', secondary: '#581c87', giColor: '#1e1b4b', bandColor: '#ef4444', skin: '#d2a679', icon: '🌑',
        accessory: 'energyWings', stats: { atk: 5, spd: 4, pwr: 5 }, speed: 5.4, jumpForce: -14.3, projSpeed: 10.0, projColor: '#a855f7',
        build: { s: 0.97, torso: 29, arm: 8.5, leg: 11, fist: 5.5, head: 12 },
        look: { top: '#1e1b4b', upperArm: '#1e1b4b', foreArm: '#312e81', glove: '#7e22ce', pants: '#1e1b4b', shin: '#312e81', boot: '#0f0a1f' },
        trait: 'Kitsune sombría · tres colas espectrales y máscara'
    },
    {
        id: 'cyborg', name: 'CYBORG', gender: 'male', element: 'Plasma Neón',
        powerName: 'Láser Cuántico', superName: 'Cañón Satelital', homeArena: 'cyber',
        primary: '#22d3ee', secondary: '#ec4899', giColor: '#0f172a', bandColor: '#22d3ee', skin: '#94a3b8', icon: '🤖',
        accessory: 'visor', stats: { atk: 4, spd: 5, pwr: 4 }, speed: 5.8, jumpForce: -14.7, projSpeed: 12.0, projColor: '#22d3ee',
        build: { s: 1.04, torso: 40, arm: 11.5, leg: 14, fist: 7, head: 13 },
        look: { top: '#334155', upperArm: '#94a3b8', foreArm: '#64748b', glove: '#475569', pants: '#475569', shin: '#64748b', boot: '#1e293b', metal: true },
        trait: 'Cuerpo blindado · visor de escaneo, núcleo de plasma y jetpack'
    },
    {
        id: 'zephyra', name: 'ZEPHYRA', gender: 'female', element: 'Tornado Esmeralda',
        powerName: 'Cuchilla de Viento', superName: 'Huracán Cortante', homeArena: 'emerald',
        primary: '#34d399', secondary: '#059669', giColor: '#065f46', bandColor: '#a7f3d0', skin: '#f1c27d', icon: '🌪️',
        accessory: 'ribbons', stats: { atk: 3, spd: 5, pwr: 4 }, speed: 6.3, jumpForce: -15.6, projSpeed: 11.5, projColor: '#34d399',
        build: { s: 0.93, torso: 27, arm: 8, leg: 10, fist: 5, head: 12 },
        look: { top: '#065f46', upperArm: '#f1c27d', foreArm: '#a7f3d0', glove: '#34d399', pants: '#047857', boot: '#064e3b' },
        trait: 'Coletas y cintas al viento · falda de hojas cortantes'
    },
    {
        id: 'titan', name: 'TITAN', gender: 'male', element: 'Roca Sísmica',
        powerName: 'Meteoro Telúrico', superName: 'Cataclismo Pétreo', homeArena: 'seismic',
        primary: '#d97706', secondary: '#78350f', giColor: '#78350f', bandColor: '#fbbf24', skin: '#c68642', icon: '🪨',
        accessory: 'spikes', stats: { atk: 5, spd: 3, pwr: 5 }, speed: 4.5, jumpForce: -13.6, projSpeed: 8.8, projColor: '#f59e0b',
        build: { s: 1.18, torso: 50, arm: 15, leg: 17, fist: 9.5, head: 12 },
        look: { top: '#c68642', upperArm: '#c68642', foreArm: '#78716c', glove: '#57534e', pants: '#451a03', shin: '#78716c', boot: '#292524' },
        trait: 'Coloso de piedra · hombreras de roca y barba de granito'
    },
    {
        id: 'viper', name: 'VIPER', gender: 'female', element: 'Ácido Venenoso',
        powerName: 'Orbe Corrosivo', superName: 'Lluvia Tóxica', homeArena: 'toxic',
        primary: '#a3e635', secondary: '#4d7c0f', giColor: '#365314', bandColor: '#bef264', skin: '#d9f99d', icon: '☣️',
        accessory: 'toxicGlow', stats: { atk: 4, spd: 4, pwr: 5 }, speed: 5.3, jumpForce: -14.4, projSpeed: 9.6, projColor: '#a3e635',
        build: { s: 0.96, torso: 28, arm: 8.5, leg: 10.5, fist: 5.5, head: 12 },
        look: { top: '#365314', upperArm: '#365314', foreArm: '#4d7c0f', glove: '#a3e635', pants: '#1a2e05', shin: '#365314', boot: '#0c1402' },
        trait: 'Capucha de cobra · trenza serpiente y colmillos tóxicos'
    }
];

const BOT_NAMES = ['UNIT_ALPHA', 'BOT_BETA', 'CYBER_01', 'MECHA_X', 'NEXUS_BOT', 'GRID_AI', 'PULSE_99', 'CORE_BOT'];

// MODOS POR EQUIPOS
const TEAM_COLORS = [
    { name: 'ROJO', c: '#ef4444' },
    { name: 'AZUL', c: '#3b82f6' },
    { name: 'VERDE', c: '#22c55e' },
    { name: 'AMARILLO', c: '#eab308' }
];
const MODE_LABELS = { ffa: 'TODOS CONTRA TODOS', duos: 'DÚOS', squads: 'ESCUADRAS 4 VS 4', dm: 'COMBATE A MUERTE', coop: 'COOPERATIVO' };

// MODO COOPERATIVO (etapa 1: interfaz, sala y red; el motor llega en la etapa 2)
const VERSUS_MAX_PLAYERS = 8;
const COOP_MAX_PLAYERS = 4;
const COOP_MIN_PLAYERS = 1;
const COOP_FULL_MESSAGE = 'Sala llena (Máx. 4 jugadores en Cooperativo)';
const COOP_ENGINE_READY = true;   // motor cooperativo disponible (etapa 2A)
const COOP_ONLINE_READY = true;   // sincronización online del cooperativo (etapa 2C)
function isCoopRoom(room) { return !!room && room.mode === 'coop'; }
function getRoomMaxPlayers(room) { return isCoopRoom(room) ? COOP_MAX_PLAYERS : VERSUS_MAX_PLAYERS; }
function computeTeams(mode, count) {
    // Dúos: parejas consecutivas (P1+P2, P3+P4...). Escuadras: patrón que reparte por igual el roster 4H/4M.
    if (mode === 'duos') return Array.from({ length: count }, (_, i) => Math.floor(i / 2));
    if (mode === 'squads') { const pat = [0, 1, 1, 0, 0, 1, 1, 0]; return Array.from({ length: count }, (_, i) => pat[i % 8]); }
    return null;
}

// PERFILES DE SONIDO POR PERSONAJE
const SFX_PROFILES = {
    ronin: { pitch: 1.0, wave: 'square', special: 'wave' },
    blaze: { pitch: 1.12, wave: 'sawtooth', special: 'fire' },
    storm: { pitch: 1.05, wave: 'square', special: 'zap', ping: 1800 },
    vixen: { pitch: 1.2, wave: 'triangle', special: 'dark' },
    cyborg: { pitch: 0.92, wave: 'square', special: 'laser', ping: 2400 },
    zephyra: { pitch: 1.3, wave: 'triangle', special: 'wind' },
    titan: { pitch: 0.62, wave: 'sawtooth', special: 'rock' },
    viper: { pitch: 1.1, wave: 'triangle', special: 'acid' }
};
