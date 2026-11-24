'use strict';
// =====================================================================
// COMBOS POR LUCHADOR
// Un combo es una secuencia de golpes que CONECTAN seguidos (cadena). El último golpe
// recibe un remate propio. Claves = nombre del estado: lp/mp/hp, lk/mk/hk, c* (agachado),
// j* (aire) y 'launcher' (↓ + puño fuerte).
//   dmg: daño extra · kbm: multiplicador de empuje · knock: derriba · unblock: no se bloquea
//   launch: lanza al aire · stun: aturde n cuadros · dot: [tipo, cuadros] · crouch: daño extra si el rival está agachado
// =====================================================================
const COMBO_DEFS = {
    ronin: [
        { name: 'TRIPLE CORTE', seq: ['lp', 'lp', 'hp'], dmg: 25, launch: true },
        { name: 'GIRO DE KATANA', seq: ['lk', 'mk', 'hk'], dmg: 20, kbm: 1.4 },
        { name: 'CONTRA DE SAMURÁI', seq: ['cmp', 'hp'], dmg: 25, knock: true }
    ],
    blaze: [
        { name: 'RÁFAGA ARDIENTE', seq: ['lp', 'lp', 'mp'], dmg: 15, dot: ['burn', 90] },
        { name: 'PUÑO CARMESÍ', seq: ['mp', 'hp'], dmg: 20, kbm: 1.8 },
        { name: 'PATADA BRASA', seq: ['lk', 'mk'], dmg: 20, knock: true, dot: ['burn', 90] }
    ],
    storm: [
        { name: 'CHISPA TRIPLE', seq: ['lp', 'lk', 'mp'], dmg: 15, stun: 26 },
        { name: 'DESCARGA EN CADENA', seq: ['lk', 'lk', 'mk'], dmg: 10, stun: 20 },
        { name: 'TRUENO CERRADO', seq: ['mp', 'hp'], dmg: 25, kbm: 1.6, shake: 8 }
    ],
    vixen: [
        { name: 'COLAS VELOCES', seq: ['lk', 'lk', 'mk'], dmg: 20, launch: true },
        { name: 'BARRIDO SOMBRA', seq: ['clk', 'cmk', 'hk'], dmg: 15, knock: true },
        { name: 'ZARPA ESPECTRAL', seq: ['lp', 'mk', 'hp'], dmg: 20, unblock: true }
    ],
    cyborg: [
        { name: 'PROTOCOLO GOLPE', seq: ['lp', 'mp', 'hp'], dmg: 20, kbm: 1.4 },
        { name: 'IMPACTO HIDRÁULICO', seq: ['mp', 'hk'], dmg: 20, kbm: 1.8, shake: 7 },
        { name: 'BARRIDO TÁCTICO', seq: ['lk', 'mk', 'launcher'], dmg: 15, launch: true }
    ],
    zephyra: [
        { name: 'CUATRO VIENTOS', seq: ['lp', 'lp', 'mp', 'hp'], dmg: 20, knock: true },
        { name: 'CORTE ASCENDENTE', seq: ['mp', 'launcher'], dmg: 15, launch: true },
        { name: 'GIRO CORTANTE', seq: ['jlk', 'jhk'], dmg: 20, knock: true }
    ],
    titan: [
        { name: 'DOBLE MARTILLO', seq: ['mp', 'hp'], dmg: 30, kbm: 1.5, shake: 8 },
        { name: 'PUÑO ROCA', seq: ['lp', 'hp'], dmg: 20, kbm: 2, shake: 8 },
        { name: 'PISOTÓN DOBLE', seq: ['mk', 'hk'], dmg: 25, knock: true, shake: 9 }
    ],
    viper: [
        { name: 'COLA RASTRERA', seq: ['clk', 'cmk', 'hk'], dmg: 15, knock: true },
        { name: 'MORDIDA DOBLE', seq: ['lp', 'lk', 'mp'], dmg: 15, dot: ['poison', 150] },
        { name: 'COLMILLO', seq: ['mk', 'hp'], dmg: 15, crouch: 30, dot: ['poison', 90] }
    ]
};
const COMBO_BUFFER = 12;   // cuadros (0,2 s) que se recuerda un golpe pulsado antes de poder encadenar
const COMBO_KB_MID = 0.35;    // empuje que conservan los golpes intermedios
const COMBO_LUNGE = 3.2;      // empujón hacia delante al encadenar
const COMBO_DOWN_GRACE = 5; // cuadros que sigue contando el ↓ después de soltarlo

const Combos = {
    defs: id => COMBO_DEFS[id] || [],

    // ¿Es [...cadena actual, key] el comienzo de algún combo del luchador?
    link(f, key) {
        const seq = (f.cseq || []).concat(key);
        return Combos.defs(f.archetype.id).some(d => d.seq.length >= seq.length && seq.every((k, i) => d.seq[i] === k));
    },

    // Se llama al empezar un golpe normal: reinicia o amplía la cadena y marca el remate si la secuencia completa coincide
    note(f, key, chained) {
        f.cseq = chained ? (f.cseq || []).concat(key).slice(-5) : [key];
        // Avance en cada eslabón: el golpe anterior empuja al rival y así el siguiente sigue alcanzándolo
        if (chained && f.onGround) f.vx = (f.vx || 0) + f.facing * COMBO_LUNGE;
        f.comboFin = null;
        for (const d of Combos.defs(f.archetype.id)) {
            if (d.seq.length === f.cseq.length && d.seq.every((k, i) => f.cseq[i] === k)) { f.comboFin = { def: d, key }; break; }
        }
    },

    // Golpes intermedios de un combo en curso: empujan poco para que el siguiente siga alcanzando al rival
    kbScale(a) {
        const seq = a.cseq || [];
        if (!seq.length) return 1;
        return Combos.defs(a.archetype.id).some(d => d.seq.length > seq.length && seq.every((k, i) => d.seq[i] === k)) ? COMBO_KB_MID : 1;
    },

    // Remate pendiente para el golpe que está conectando (o null)
    finisher(a, md, target) {
        const c = a.comboFin;
        if (!c || a.state !== c.key) return null;
        const d = c.def;
        return {
            def: d,
            dmg: (d.dmg || 0) + (d.crouch && target.crouching ? d.crouch : 0),
            kbm: d.kbm || 1,
            knock: !!d.knock || !!d.launch,
            unblock: !!d.unblock
        };
    },

    // Efectos del remate una vez aplicado el daño
    after(e, a, t, fin) {
        const d = fin.def;
        e.addFloatingText(a.x, a.y - 150 * (a.archetype.build.s || 1), `¡${d.name}!`, a.archetype.primary || '#facc15', 18, a.id);
        if (d.shake) e.camera.shake = Math.max(e.camera.shake, d.shake);
        if (!t.alive) return;
        if (d.launch) { t.inJuggle = true; t.onGround = false; t.juggleHits = 0; t.vy = -15; e.fx({ k: 'snd', n: 'juggle' }); }
        if (d.stun) { t.state = 'stun'; t.stunTimer = d.stun; t.stateTimer = t.stateMax = d.stun; }
        if (d.dot) { t.poison = d.dot[1]; t.dotK = d.dot[0]; }
    },

    // IA: con probabilidad p elige un combo de tierra del luchador para abrirlo
    pick(bot, p) {
        if (Math.random() >= p) return null;
        const list = Combos.defs(bot.archetype.id).filter(d => d.seq[0][0] !== 'j');
        return list.length ? list[Math.floor(Math.random() * list.length)] : null;
    },

    // IA: siguiente golpe del plan si la cadena actual sigue su secuencia, o null
    next(bot, p) {
        const plan = bot.aiPlan, cs = bot.cseq || [];
        if (!plan || !cs.length || cs.length >= plan.seq.length || !cs.every((k, i) => plan.seq[i] === k)) return null;
        if (Math.random() >= p) { bot.aiPlan = null; return null; }
        return plan.seq[cs.length];
    },

    // Entrada: recuerda un golpe pulsado un poco antes y vuelve a intentarlo (cómodo en pantalla táctil)
    run(e, f, cmd, canAct) {
        if (f.stunTimer > 0 || f.state === 'hurt' || f.blockStun > 0) f.atkBuf = null;
        let fromBuf = false;
        if (!cmd.atk && f.atkBuf) {
            if (--f.atkBuf.t > 0) { cmd.atk = f.atkBuf.atk; cmd.aim = f.atkBuf.aim; cmd.airDir = f.atkBuf.airDir; fromBuf = true; }
            else f.atkBuf = null;
        }
        if (!cmd.atk) return;
        const mv = f._mv;
        e.tryAttack(f, cmd, canAct);
        if (f._mv !== mv) { f.atkBuf = null; return; }
        const md = MOVE_DATA[cmd.atk];
        const cur = MOVE_DATA[f.state];
        if (!fromBuf && md && md.rank && ((cur && cur.rank) || f.attackCooldown > 0)) {
            f.atkBuf = { atk: cmd.atk, aim: cmd.aim, airDir: cmd.airDir, t: COMBO_BUFFER };
        }
    }
};
