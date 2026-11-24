'use strict';
// =========================================================================
// MODO PRACTICE: tu luchador contra un muñeco de entrenamiento.
//   - Muñeco configurable: quieto, agachado, bloquea (de pie / agachado), salta o ataca (IA)
//   - Vida y barra de súper infinitas (se pueden apagar)
//   - Contador de combo y daño, con tu mejor combo
//   - Comandos en pantalla (lo que estás pulsando, relativo a hacia dónde miras)
//   - Reiniciar posiciones
// =========================================================================
const DUMMY_MODES = [
    { id: 'idle', label: 'QUIETO' },
    { id: 'crouch', label: 'AGACHADO' },
    { id: 'block', label: 'BLOQUEA DE PIE' },
    { id: 'blocklow', label: 'BLOQUEA AGACHADO' },
    { id: 'jump', label: 'SALTA' },
    { id: 'ai', label: 'ATACA (IA)' }
];
const PRACTICE_BTN_LABEL = { lp: 'P1', mp: 'P2', hp: 'P3', lk: 'K1', mk: 'K2', hk: 'K3', t1: 'T1', t2: 'T2' };

class PracticeEngine extends BattleArenaEngine {
    constructor(canvas, room, localUserId) {
        super(canvas, room, localUserId);
        this.isPractice = true;
        this.cfg = { dummy: 'idle', infHp: true, infMeter: true, showInputs: true };
        this.stats = { hits: 0, dmg: 0, lastT: -99, shown: null, best: { hits: 0, dmg: 0 } };
        this.inputLog = [];
        this._lastSig = '';
        this._lastHud = '';
        this.reviveAt = null;
    }

    get player() { return this.fighters[0]; }
    get dummy() { return this.fighters[1]; }

    // Nunca termina: no hay ganador ni tiempo
    checkWinCondition() { /* sin fin */ }
    endMatchByTimeout() { /* sin fin */ }

    // ----- Muñeco -----
    computeBotInput(bot) {
        if (bot !== this.dummy) return super.computeBotInput(bot);
        const cmd = this.emptyInput();
        switch (this.cfg.dummy) {
            case 'crouch': cmd.down = true; break;
            case 'block': cmd.back = true; break;
            case 'blocklow': cmd.back = true; cmd.down = true; break;
            case 'jump':
                if (bot.aiJump > 0) { cmd.upHeld = true; if (bot.aiJump === 16) cmd.jump = true; bot.aiJump--; }
                else if (bot.onGround && Math.random() < 0.015) bot.aiJump = 16;
                break;
            case 'ai': return super.computeBotInput(bot);
            default: break;
        }
        return cmd;
    }

    // ----- Daño: contador de combo y vida infinita -----
    applyDamage(attacker, target, ...rest) {
        const p = this.player, d = this.dummy;
        if (this.cfg.infHp && target === d && d.hp < d.maxHp * 0.4) d.hp = d.maxHp;   // nunca llega a morir
        const before = target.hp;
        const r = super.applyDamage(attacker, target, ...rest);
        if (attacker === p && target === d && r) {
            const dealt = Math.max(0, before - target.hp);
            if (dealt > 0) {
                if (this.time - this.stats.lastT > 1.0) { this.stats.hits = 0; this.stats.dmg = 0; }
                this.stats.hits++; this.stats.dmg += dealt; this.stats.lastT = this.time;
                this.stats.shown = null;
            }
        }
        return r;
    }

    // ----- Lo que estás pulsando (para la lista de comandos) -----
    getLocalInputMap() {
        const raw = super.getLocalInputMap();
        this.trackInputs(raw);
        return raw;
    }
    trackInputs(raw) {
        const p = this.player;
        if (!p) return;
        const fwd = p.facing === 1 ? raw.right : raw.left;
        const back = p.facing === 1 ? raw.left : raw.right;
        let dir = '•';
        if (raw.down && fwd) dir = '↘'; else if (raw.down && back) dir = '↙'; else if (raw.up && fwd) dir = '↗'; else if (raw.up && back) dir = '↖';
        else if (raw.down) dir = '↓'; else if (raw.up) dir = '↑'; else if (fwd) dir = '→'; else if (back) dir = '←';
        const btns = Object.keys(PRACTICE_BTN_LABEL).filter(b => raw[b]).map(b => PRACTICE_BTN_LABEL[b]).join(' ');
        const sig = dir + '|' + btns;
        if (sig === this._lastSig) return;
        this._lastSig = sig;
        if (dir !== '•' || btns) {
            this.inputLog.push({ dir, btns, t: this.time });
            if (this.inputLog.length > 9) this.inputLog.shift();
        }
    }

    // ----- Bucle: vida/barra infinitas, revivir, cierre de combo y HUD de práctica -----
    update(dt) {
        super.update(dt);
        const p = this.player, d = this.dummy;
        if (!p || !d || this.paused) return;
        if (this.cfg.infMeter) p.mp = p.maxMp;
        if (this.cfg.infHp) {
            p.hp = p.maxHp;
            const calm = d.alive && d.stunTimer <= 0 && !d.inJuggle && d.onGround && d.state === 'idle';
            if (calm && d.hp < d.maxHp && this.time - this.stats.lastT > 1.2) d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.02);
        }
        // si por lo que sea cae uno, vuelve a levantarse
        if (!p.alive || !d.alive) {
            if (this.reviveAt === null) this.reviveAt = this.time + 1.2;
            else if (this.time >= this.reviveAt) { this.reviveAt = null; this.resetPositions(true); }
        }
        // el combo termina cuando pasa 1 s sin golpear
        if (this.stats.hits > 0 && this.time - this.stats.lastT > 1.0 && !this.stats.shown) {
            this.stats.shown = { hits: this.stats.hits, dmg: Math.round(this.stats.dmg) };
            if (this.stats.hits > this.stats.best.hits || (this.stats.hits === this.stats.best.hits && this.stats.dmg > this.stats.best.dmg)) {
                this.stats.best = { hits: this.stats.hits, dmg: Math.round(this.stats.dmg) };
            }
            this.stats.hits = 0; this.stats.dmg = 0;
        }
        this.renderPracticeHud();
    }

    resetPositions(revive) {
        const p = this.player, d = this.dummy, cx = this.worldWidth / 2;
        for (const [f, x, face] of [[p, cx - 170, 1], [d, cx + 170, -1]]) {
            if (revive) { f.alive = true; f.hp = f.maxHp; f.knockdown = false; f.invuln = 40; }
            f.x = x; f.y = this.groundY; f.vx = 0; f.vy = 0; f.facing = face;
            f.state = 'idle'; f.stateTimer = 0; f.stunTimer = 0; f.blockStun = 0; f.inJuggle = false; f.juggleHits = 0; f.juggleImmune = false;
            f.onGround = true; f.onPlat = null; f.blocking = false; f.crouching = false; f.hitBoxActive = false; f.grabTarget = null; f.heldBy = null; f.comboTaken = 0;
            f.attackCooldown = 0;
        }
        this.projectiles.length = 0;
        this.stats.hits = 0; this.stats.dmg = 0; this.stats.shown = null;
    }

    renderPracticeHud() {
        const s = this.stats;
        const live = s.hits > 0 ? `${s.hits} HIT${s.hits > 1 ? 'S' : ''}|${Math.round(s.dmg)} DAÑO` : (s.shown ? `ÚLTIMO: ${s.shown.hits} HITS|${s.shown.dmg} DAÑO` : '');
        const inputs = this.cfg.showInputs ? this.inputLog.map(e => e.dir + (e.btns ? ' ' + e.btns : '')).join('\n') : '';
        const sig = live + '#' + s.best.hits + '/' + s.best.dmg + '#' + inputs;
        if (sig === this._lastHud) return;
        this._lastHud = sig;
        const c = document.getElementById('pr-combo');
        if (c) {
            const [a, b] = live.split('|');
            c.innerHTML = live ? `<span class="pr-c-hits${s.hits > 0 ? ' live' : ''}">${a}</span><span class="pr-c-dmg">${b}</span>` : '';
        }
        const best = document.getElementById('pr-best');
        if (best) best.textContent = s.best.hits ? `MEJOR COMBO: ${s.best.hits} HITS · ${s.best.dmg} DAÑO` : '';
        const inp = document.getElementById('pr-inputs');
        if (inp) inp.innerHTML = this.cfg.showInputs ? this.inputLog.slice().reverse().map((e, i) => `<div class="pr-in" style="opacity:${Math.max(0.25, 1 - i * 0.11)}"><b>${e.dir}</b>${e.btns ? `<span>${e.btns}</span>` : ''}</div>`).join('') : '';
    }
}

const Practice = (function () {
    const $ = id => document.getElementById(id);

    function refreshBar() {
        const e = state.gameInstance;
        if (!e || !e.isPractice) return;
        const mode = DUMMY_MODES.find(m => m.id === e.cfg.dummy);
        $('pr-dummy').textContent = 'MUÑECO: ' + mode.label;
        const on = (el, flag, txt) => { $(el).textContent = txt + (flag ? ': ON' : ': OFF'); $(el).classList.toggle('on', flag); };
        on('pr-hp', e.cfg.infHp, 'VIDA ∞');
        on('pr-mp', e.cfg.infMeter, 'BARRA ∞');
        on('pr-show', e.cfg.showInputs, 'COMANDOS');
    }

    function start() {
        sfx.init(); sfx.sfxSelect();
        net.leaveRoom();
        const arenaSel = $('select-practice-arena').value;
        const others = FIGHTER_ARCHETYPES.filter(a => a.id !== state.selectedArchetypeId);
        const dummyArch = others[Math.floor(Math.random() * others.length)];
        const arena = arenaSel === 'random' ? Object.keys(ARENAS)[Math.floor(Math.random() * Object.keys(ARENAS).length)] : arenaSel;
        const profile = getPlayerProfile();
        const room = {
            code: 'PRÁCTICA', hostId: net.userId, arena, resolvedArena: arena, difficulty: 'normal', timerMode: 'infinite', mode: 'ffa',
            status: 'playing', isLocal: true, matchSeed: 4242,
            slots: [
                { id: net.userId, name: profile.name, archetypeId: profile.archetypeId, look: profile.look, isBot: false, isHost: true },
                { id: 'bot_dummy', name: 'MUÑECO', archetypeId: dummyArch.id, isBot: true, isHost: false }
            ],
            updatedAt: Date.now()
        };
        state.currentRoom = null;
        if (state.gameInstance) state.gameInstance.destroy();
        switchScreen('game');
        document.getElementById('screen-game').classList.add('practice-mode');
        CtrlProfiles.playMode = 'versus';
        TouchPad.applyProfile();
        const e = new PracticeEngine($('game-canvas'), room, net.userId);
        state.gameInstance = e;
        e.start();
        e.resetPositions(false);
        $('practice-hud').classList.remove('hidden');
        refreshBar();
    }

    function leave() {
        $('practice-hud').classList.add('hidden');
        document.getElementById('screen-game').classList.remove('practice-mode');
    }

    // Botones de la barra de práctica
    $('btn-start-practice').onclick = start;
    $('pr-dummy').onclick = () => { const e = state.gameInstance; if (!e || !e.isPractice) return; sfx.sfxSelect(); const i = DUMMY_MODES.findIndex(m => m.id === e.cfg.dummy); e.cfg.dummy = DUMMY_MODES[(i + 1) % DUMMY_MODES.length].id; e.dummy.aiJump = 0; refreshBar(); };
    $('pr-hp').onclick = () => { const e = state.gameInstance; if (!e || !e.isPractice) return; sfx.sfxSelect(); e.cfg.infHp = !e.cfg.infHp; if (e.cfg.infHp) { e.player.hp = e.player.maxHp; e.dummy.hp = e.dummy.maxHp; } refreshBar(); };
    $('pr-mp').onclick = () => { const e = state.gameInstance; if (!e || !e.isPractice) return; sfx.sfxSelect(); e.cfg.infMeter = !e.cfg.infMeter; refreshBar(); };
    $('pr-show').onclick = () => { const e = state.gameInstance; if (!e || !e.isPractice) return; sfx.sfxSelect(); e.cfg.showInputs = !e.cfg.showInputs; e._lastHud = ''; refreshBar(); };
    $('pr-reset').onclick = () => { const e = state.gameInstance; if (!e || !e.isPractice) return; sfx.sfxSelect(); e.resetPositions(true); };

    return { start, leave, refreshBar };
})();
