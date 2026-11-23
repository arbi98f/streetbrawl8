'use strict';
// Motor de combate (BattleArenaEngine)

class BattleArenaEngine {
    constructor(canvas, room, localUserId) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.room = room;
        this.localUserId = localUserId;
        this.isHost = room.hostId === localUserId;

        // Resolución del mundo (el modo cooperativo la redefine en setupWorld)
        this.setupWorld();

        // Selección de Escenario (Random o Específico)
        let selectedArenaKey = room.resolvedArena || room.arena || 'random';
        if (selectedArenaKey === 'random' || !ARENAS[selectedArenaKey]) {
            const keys = Object.keys(ARENAS);
            selectedArenaKey = keys[Math.floor(Math.random() * keys.length)];
        }
        this.arena = ARENAS[selectedArenaKey] || ARENAS.suzaku;
        this.difficulty = room.difficulty || 'normal';
        this.timerMode = room.timerMode || '99';
        this.mode = room.mode || 'ffa';
        this.teamMode = this.mode !== 'ffa';
        this.evQueue = [];
        this.slowMo = 0;
        this.slowTick = 0;
        this.tense = false;

        const platRng = mulberry32(this.arena.id.length * 977 + 13);
        this.platforms = this.arena.platforms.map(p => ({ ...p, h: 18, jag: Array.from({ length: 8 }, () => platRng() * 26) }));
        this.scenery = this.buildScenery(this.arena.id);
        this.ambient = [];
        this.time = 0;
        this.superFlash = null;
        this.tremorTimer = 7;

        this.fighters = [];
        this.projectiles = [];
        this.particles = [];
        this.floatingTexts = [];
        this.keys = {};
        this.remoteInputs = {};
        this.gamepadConnected = false;
        this.gamepadIndex = null;

        this.camera = { x: this.worldWidth / 2, y: this.worldHeight / 2, zoom: 1, shake: 0, kick: 0, focus: null };
        this.hitStopFrames = 0;
        this.timer = this.timerMode === 'infinite' ? 999 : 99;
        this.timerAccum = 0;
        this.matchState = 'intro';
        this.running = false;
        this.paused = false;
        this.lastTime = 0;
        this.syncAccum = 0;

        this.initArenaHazards();
        this.initFighters();
        this.buildHUD();
        this.bindInputs();
        this.resize();

        sfx.startAmbientSound(this.arena.id);
    }

    // Dimensiones del mundo. depthTol = tolerancia de profundidad (eje z) para golpear:
    // en versus z siempre vale 0, así que Infinity no cambia nada.
    setupWorld() {
        this.worldWidth = 1750;
        this.worldHeight = 720;
        this.groundY = 615;
        this.depthTol = Infinity;
    }

    sameLane(a, b, extra = 0) {
        return Math.abs((a.z || 0) - (b.z || 0)) <= this.depthTol + extra;
    }

    // Orden de dibujo de los luchadores (el cooperativo lo ordena además por profundidad)
    orderForDraw(list) {
        return [...list].sort((a, b) => (a.alive === b.alive ? 0 : a.alive ? 1 : -1));
    }

    initFighters() {
        const count = this.room.slots.length;
        const teams = computeTeams(this.mode, count);
        const order = this.room.slots.map((_, i) => i);
        // Posiciones de salida sorteadas (misma semilla en host y clientes): nadie empieza siempre en el borde
        const rng = mulberry32((this.room.matchSeed || 12345) >>> 0);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        if (teams) {
            const teamOrder = [...new Set(teams)];
            for (let i = teamOrder.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [teamOrder[i], teamOrder[j]] = [teamOrder[j], teamOrder[i]]; }
            order.sort((a, b) => teamOrder.indexOf(teams[a]) - teamOrder.indexOf(teams[b]));
        }
        const spacing = (this.worldWidth - 360) / Math.max(1, count - 1);
        const spawnOf = {};
        order.forEach((idx, pos) => { spawnOf[idx] = count === 1 ? this.worldWidth / 2 : 180 + pos * spacing; });

        this.fighters = this.room.slots.map((slot, idx) => {
            const arch = FIGHTER_ARCHETYPES.find(a => a.id === slot.archetypeId) || FIGHTER_ARCHETYPES[idx % 8];
            const spawnX = spawnOf[idx];
            return {
                id: slot.id,
                slotIndex: idx,
                name: slot.name,
                isBot: slot.isBot,
                archetype: (typeof Look !== 'undefined' && slot.look) ? Look.resolve(arch, slot.look) : arch,
                team: teams ? teams[idx] : idx,
                x: spawnX,
                y: this.groundY,
                vx: 0,
                vy: 0,
                width: 54,
                height: 108,
                facing: spawnX < this.worldWidth / 2 ? 1 : -1,
                hp: 1000,
                maxHp: 1000,
                mp: 15,
                maxMp: 100,
                alive: true,
                onGround: true,
                isJumping: false,
                inJuggle: false,
                stunTimer: 0,
                crouching: false,
                blocking: false,
                state: 'idle',
                stateTimer: 0,
                stateMax: 0,
                hitFlash: 0,
                pendingShot: null,
                attackCooldown: 0,
                hitBoxActive: false,
                hasHitThisSwing: false,
                comboCount: 0,
                comboTimer: 0,
                focusedTargetId: null,
                focusTimer: 0,
                kos: 0,
                damageDealt: 0,
                animFrame: 0,
                invuln: 0,
                knockdown: false,
                heldBy: null,
                heldTimer: 0,
                grabTarget: null,
                rollDir: 0,
                rollCooldown: 0,
                blockStun: 0,
                guardShow: false,
                airDir: 'f',
                airUsed: false,
                hazardCd: 0,
                bounced: false,
                onPlat: null,
                net: null,
                aiTimer: 20 + Math.random() * 30,
                aiReact: 0,
                aiJump: 0,
                aiDecision: 'approach'
            };
        });
    }

    isEnemy(a, b) {
        return a.id !== b.id && (!this.teamMode || a.team !== b.team);
    }

    buildHUD() {
        document.getElementById('hud-room-code').textContent = `SALA: ${this.room.code}`;
        document.getElementById('hud-arena-name').textContent = `${this.arena.icon} ${this.arena.name.toUpperCase()}${this.teamMode ? ' • ' + MODE_LABELS[this.mode] : ''}`;
        const grid = document.getElementById('hud-players-grid');
        grid.innerHTML = '';
        grid.style.setProperty('--n', Math.max(1, Math.min(8, this.fighters.length)));

        const list = this.teamMode ? [...this.fighters].sort((a, b) => a.team - b.team) : this.fighters;
        list.forEach((f) => {
            const isMe = f.id === this.localUserId;
            const teamCol = this.teamMode ? TEAM_COLORS[f.team].c : null;
            const card = document.createElement('div');
            card.id = `hud-card-${f.id}`;
            card.className = `hud-card${isMe ? ' me' : ''}`;
            if (teamCol) card.style.borderLeft = `4px solid ${teamCol}`;
            card.innerHTML = `
                <div class="hud-card-top">
                    <span class="hud-name">${f.archetype.icon} ${escapeHtml(f.name)}</span>
                    <span class="hud-ko">KO:${f.kos}</span>
                </div>
                <div class="hud-hp"><div id="hud-hp-${f.id}" style="width: 100%; background: linear-gradient(90deg, #ef4444, #facc15, #22c55e);"></div></div>
                <div class="hud-mp"><div id="hud-mp-${f.id}" style="width: 15%; background-color: ${f.archetype.primary};"></div></div>
            `;
            grid.appendChild(card);
        });
    }

    updateHUD() {
        let aliveCount = 0;
        this.fighters.forEach(f => {
            if (f.alive) aliveCount++;
            const hpBar = document.getElementById(`hud-hp-${f.id}`);
            const mpBar = document.getElementById(`hud-mp-${f.id}`);
            const card = document.getElementById(`hud-card-${f.id}`);
            if (hpBar) hpBar.style.width = `${Math.max(0, (f.hp / f.maxHp) * 100)}%`;
            if (mpBar) {
                mpBar.style.width = `${Math.min(100, f.mp)}%`;
                if (f.mp >= 100) mpBar.classList.add('super-ready');
                else mpBar.classList.remove('super-ready');
            }
            if (card) {
                card.style.opacity = f.alive ? '1' : '0.4';
                const koSpan = card.querySelector('.hud-ko');
                if (koSpan) koSpan.textContent = `KO:${f.kos}`;
            }
        });
        document.getElementById('hud-alive-count').textContent = `VIVOS: ${aliveCount}/${this.fighters.length}`;
        document.getElementById('hud-timer').textContent = this.timerMode === 'infinite' ? '∞' : String(Math.ceil(this.timer)).padStart(2, '0');
    }

    bindInputs() {
        this._onKeyDown = (e) => {
            if (activeRebindType) return;
            // Pausa: Esc, o P si el jugador no lo tiene asignado a una acción (en pantalla completa Esc sale del modo)
            if (e.code === 'Escape' || (e.code === 'KeyP' && !Object.values(CtrlProfiles.kb()).flat().includes('KeyP'))) {
                if (!e.repeat) this.togglePause();
                e.preventDefault();
                return;
            }
            if (this.paused) return;
            this.keys[e.code] = true;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        };
        this._onKeyUp = (e) => {
            if (activeRebindType) return;
            this.keys[e.code] = false;
        };
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        this._onGamepadConnected = (e) => {
            this.gamepadIndex = e.gamepad.index;
            this.gamepadConnected = true;
            showToast('Mando Xbox detectado: ' + (e.gamepad.id || 'Mando'));
        };
        this._onGamepadDisconnected = (e) => {
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
                this.gamepadConnected = false;
            }
        };
        window.addEventListener('gamepadconnected', this._onGamepadConnected);
        window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

        TouchPad.init();
        TouchPad.releaseAll();
        this._onBlur = () => { this.keys = {}; };
        window.addEventListener('blur', this._onBlur);
        this._onViewport = () => this.resize();
        window.addEventListener('orientationchange', this._onViewport);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onViewport);
        if (window.ResizeObserver) {
            this._ro = new ResizeObserver(() => this.resize());
            this._ro.observe(this.canvas.parentElement);
        }
    }

    // =====================================================================
    // PAUSA: offline la puede usar cualquiera; online solo el anfitrión (avisa a los invitados)
    // =====================================================================
    canPause() {
        return this.isHost && (this.matchState === 'fighting' || this.matchState === 'transition');
    }

    togglePause() {
        if (!this.running) return;
        if (this.paused) {
            if (this.isHost) this.setPaused(false);
        } else if (this.canPause()) {
            this.setPaused(true);
        } else if (!this.isHost && this.matchState === 'fighting') {
            showToast('Solo el anfitrión puede pausar la partida.', 'info');
        }
    }

    setPaused(flag, remote = false) {
        flag = !!flag;
        if (!this.running || this.paused === flag) return;
        this.paused = flag;
        this.keys = {};
        TouchPad.releaseAll();
        this.accum = 0;
        this.lastTime = performance.now();
        const overlay = document.getElementById('pause-overlay');
        if (overlay) {
            overlay.classList.toggle('hidden', !flag);
            const resume = document.getElementById('btn-pause-resume');
            const msg = document.getElementById('pause-msg');
            if (resume) resume.classList.toggle('hidden', !this.isHost);
            if (msg) msg.textContent = this.isHost ? 'Partida en pausa' : 'El anfitrión pausó la partida';
        }
        const hudBtn = document.getElementById('btn-hud-pause');
        if (hudBtn) hudBtn.textContent = flag ? '▶' : '⏸';
        try { if (sfx.ctx) { if (flag) sfx.ctx.suspend(); else sfx.ctx.resume(); } } catch (e) { /* ignorar */ }
        if (this.isHost && !remote) net.broadcastPause(flag);
    }

    pollPauseInput() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const startUsed = Object.values(CtrlProfiles.gp()).includes(9);   // Start asignado a una acción: no pausa
        let down = false;
        if (!startUsed) for (const p of pads) if (p && p.connected && p.buttons[9] && p.buttons[9].pressed) down = true;
        if (down && !this._startHeld) this.togglePause();
        this._startHeld = down;
    }

    destroy() {
        this.running = false;
        if (this.paused) {
            this.paused = false;
            const overlay = document.getElementById('pause-overlay');
            if (overlay) overlay.classList.add('hidden');
            const hudBtn = document.getElementById('btn-hud-pause');
            if (hudBtn) hudBtn.textContent = '⏸';
            try { if (sfx.ctx) sfx.ctx.resume(); } catch (e) { /* ignorar */ }
        }
        sfx.stopAmbientSound();
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        window.removeEventListener('gamepadconnected', this._onGamepadConnected);
        window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);
        window.removeEventListener('blur', this._onBlur);
        window.removeEventListener('orientationchange', this._onViewport);
        if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onViewport);
        if (this._ro) { this._ro.disconnect(); this._ro = null; }
        if (this._stopBg) this._stopBg();
        if (this._onVisibility && typeof document.removeEventListener === 'function') document.removeEventListener('visibilitychange', this._onVisibility);
        TouchPad.releaseAll();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const w = Math.max(2, Math.round(rect.width));
        const h = Math.max(2, Math.round(rect.height));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
    }

    showBanner(text, duration = 1200) {
        const banner = document.getElementById('arena-banner');
        const label = document.getElementById('arena-banner-text');
        label.textContent = text;
        banner.classList.remove('hidden');
        if (duration > 0) {
            setTimeout(() => banner.classList.add('hidden'), duration);
        }
    }

    start() {
        this.running = true;
        this.matchState = 'intro';
        this.showBanner(this.teamMode ? `${MODE_LABELS[this.mode]} • ${this.arena.name.toUpperCase()}` : `ROUND 1 • ${this.arena.name.toUpperCase()}`, 1100);
        setTimeout(() => {
            if (!this.running) return;
            this.showBanner('¡FIGHT!', 850);
            sfx.sfxFight();
            this.matchState = 'fighting';
        }, 1150);

        // Paso fijo de 60 actualizaciones/seg: la lógica del juego cuenta "frames", así que
        // sin esto iba 2.75x más rápido en 165 Hz y 2x en celulares de 120 Hz.
        this.lastTime = performance.now();
        this.accum = 0;
        const STEP = 1 / 60;
        const tick = (now, draw) => {
            if (!this.running) return;
            let frameDt = Math.max(0, (now - this.lastTime) / 1000);
            this.lastTime = now;
            if (frameDt > 0.25) frameDt = 0.25; // tirón largo
            this.accum += frameDt;
            let steps = 0;
            while (this.accum >= STEP - 0.002 && steps < 5) {
                this.update(STEP);
                this.accum -= STEP;
                steps++;
            }
            if (steps === 5) this.accum = 0;
            if (draw) this.render();
        };
        const loop = (now) => {
            if (!this.running) return;
            tick(now, true);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);

        // Pestaña en segundo plano: el navegador detiene requestAnimationFrame y el juego se congelaba
        // (el anfitrión pausaba a todos los invitados). Un Worker marca el ritmo mientras la pestaña está oculta.
        this.bgWorker = null;
        const stopBg = () => { if (this.bgWorker) { this.bgWorker.terminate(); this.bgWorker = null; } };
        this._onVisibility = () => {
            if (document.hidden && this.running && typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
                if (this.bgWorker) return;
                try {
                    const url = URL.createObjectURL(new Blob(['setInterval(function(){postMessage(0)},16)'], { type: 'text/javascript' }));
                    this.bgWorker = new Worker(url);
                    this.bgWorker.onmessage = () => tick(performance.now(), false);
                } catch (e) { this.bgWorker = null; }
            } else {
                stopBg();
                this.lastTime = performance.now();
            }
        };
        this._stopBg = stopBg;
        if (typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', this._onVisibility);
    }

    emptyInput() {
        return { left: false, right: false, back: false, upHeld: false, jump: false, down: false, drop: false, turn: false, dodge: 0, atk: null, aim: 0, airDir: 'f' };
    }

    emptyRaw() {
        return { left: false, right: false, up: false, down: false, lp: false, mp: false, hp: false, lk: false, mk: false, hk: false, t1: false, t2: false, pc: {} };
    }


    getLocalInputMap() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let pad = this.gamepadIndex !== null ? pads[this.gamepadIndex] : null;
        if (!pad) {
            for (const candidate of pads) {
                if (candidate && candidate.connected) { pad = candidate; this.gamepadIndex = candidate.index; break; }
            }
        }
        const button = (index) => !!(pad && pad.buttons[index] && (pad.buttons[index].pressed || pad.buttons[index].value > 0.5));
        const axisX = pad && pad.axes.length > 0 ? pad.axes[0] : 0;
        const axisY = pad && pad.axes.length > 1 ? pad.axes[1] : 0;
        const deadZone = 0.35;
        const isKbKey = (action) => (CtrlProfiles.kb()[action] || []).some(k => !!this.keys[k]);
        const isGpBtn = (action) => {
            const btnIdx = CtrlProfiles.gp()[action];
            return btnIdx !== undefined && button(btnIdx);
        };

        const raw = {
            left: isKbKey('left') || (!!pad && (button(14) || axisX < -deadZone)),
            right: isKbKey('right') || (!!pad && (button(15) || axisX > deadZone)),
            up: isKbKey('up') || (!!pad && (button(12) || axisY < -deadZone)),
            down: isKbKey('down') || (!!pad && (button(13) || axisY > deadZone)),
            t1: isGpBtn('t1'),
            t2: isGpBtn('t2')
        };
        for (const b of ATTACK_BUTTONS) raw[b] = isKbKey(b) || isGpBtn(b);

        // Controles táctiles (no dependen de los controles reasignados del teclado)
        if (TouchPad.isDown('ArrowLeft')) raw.left = true;
        if (TouchPad.isDown('ArrowRight')) raw.right = true;
        if (TouchPad.isDown('ArrowUp')) raw.up = true;
        if (TouchPad.isDown('ArrowDown')) raw.down = true;
        if (TouchPad.isDown('KeyU')) raw.lp = true;
        if (TouchPad.isDown('KeyI')) raw.mp = true;
        if (TouchPad.isDown('KeyO')) raw.hp = true;
        if (TouchPad.isDown('KeyJ')) raw.lk = true;
        if (TouchPad.isDown('KeyK')) raw.mk = true;
        if (TouchPad.isDown('KeyL')) raw.hk = true;
        if (TouchPad.isDown('Super')) { raw.t1 = true; raw.t2 = true; }
        if (TouchPad.isDown('Grab')) { raw.mp = true; raw.hp = true; }

        // Contadores de pulsación: así la red nunca pierde un toque rápido
        this._pc = this._pc || {};
        this._prevRaw = this._prevRaw || {};
        for (const b of INPUT_EDGES) {
            if (raw[b] && !this._prevRaw[b]) this._pc[b] = (this._pc[b] || 0) + 1;
            this._prevRaw[b] = raw[b];
        }
        raw.pc = { ...this._pc };
        return raw;
    }

    // =====================================================================
    // INTÉRPRETE DE COMANDOS
    // carga ←, ↓↑, ↓↓, atrás-atrás (girar), ↘ (rueda), botones simultáneos
    // =====================================================================
    interpretInput(f, raw) {
        const ib = f.ib || (f.ib = { fr: 0, prev: {}, pc: {}, charge: 0, chargeReady: 0, lastDown: -99, lastDownTap: -99, lastBackTap: -99, jumpDelay: 0, launchWin: 0, pend: null, drop: 0, rollWait: 0, prevDiag: false });
        ib.fr++;
        raw = raw || this.emptyRaw();
        const cmd = this.emptyInput();
        cmd.upHeld = !!raw.up;
        cmd.left = !!raw.left;
        cmd.right = !!raw.right;

        const edge = (b) => {
            if (raw.pc && raw.pc[b] !== undefined) {
                const e = raw.pc[b] !== (ib.pc[b] || 0);
                ib.pc[b] = raw.pc[b];
                return e;
            }
            return !!raw[b] && !ib.prev[b];
        };
        const edges = {};
        for (const b of INPUT_EDGES) edges[b] = edge(b);
        for (const b of INPUT_EDGES) ib.prev[b] = !!raw[b];

        const back = f.facing === 1 ? raw.left : raw.right;
        const fwd = f.facing === 1 ? raw.right : raw.left;
        const backEdge = f.facing === 1 ? edges.left : edges.right;
        cmd.back = !!back && !fwd;

        // Atrás, atrás rápido = girarse (pierde la carga)
        if (backEdge) {
            if (ib.fr - ib.lastBackTap <= 15) { cmd.turn = true; ib.lastBackTap = -99; ib.charge = 0; ib.chargeReady = 0; }
            else ib.lastBackTap = ib.fr;
        }

        // Carga hacia atrás (1 s), caminando o bloqueando. Al soltar queda lista 12 frames
        if (back && !cmd.turn) ib.charge++;
        else {
            if (ib.charge >= CHARGE_FRAMES) ib.chargeReady = 12;
            ib.charge = 0;
        }
        if (ib.chargeReady > 0) ib.chargeReady--;
        const charged = ib.charge >= CHARGE_FRAMES || ib.chargeReady > 0;
        f.chargeLevel = Math.min(1, ib.charge / CHARGE_FRAMES);

        // ↓ ↓ = bajar de la plataforma; ↓ mantenido = agacharse
        if (raw.down) ib.lastDown = ib.fr;
        if (edges.down) {
            if (ib.fr - ib.lastDownTap <= 15) ib.drop = 14;
            ib.lastDownTap = ib.fr;
        }
        if (ib.drop > 0) { ib.drop--; cmd.drop = true; }
        cmd.down = !!raw.down && !cmd.drop;

        if (edges.up) cmd.jump = true;

        const pressed = [...ATTACK_BUTTONS, 't1', 't2'].filter(b => edges[b]);

        // ↘ (↓ + adelante): rueda si en 3 frames no llega ningún golpe
        const diag = !!raw.down && !!fwd && f.onGround;
        if (diag && !ib.prevDiag) ib.rollWait = 3;
        ib.prevDiag = diag;
        if (ib.rollWait > 0) {
            if (pressed.length || !diag) ib.rollWait = 0;
            else if (--ib.rollWait === 0) cmd.dodge = f.facing;
        }

        // Botones casi simultáneos (3 frames): agarre I+O, súper O+L o LT+RT
        if (pressed.length) {
            if (!ib.pend) ib.pend = { btns: new Set(), t: 0 };
            pressed.forEach(b => ib.pend.btns.add(b));
        }
        if (ib.pend) {
            ib.pend.t++;
            const B = ib.pend.btns;
            const candidate = B.has('mp') || B.has('hp') || B.has('hk') || B.has('t1') || B.has('t2');
            const complete = (B.has('hp') && B.has('hk')) || (B.has('mp') && B.has('hp')) || (B.has('t1') && B.has('t2'));
            if (!candidate || complete || ib.pend.t >= 3) {
                cmd.atk = this.resolveButtons(f, B, { fwd: !!fwd, charged, down: !!raw.down });
                cmd.aim = raw.left ? -1 : (raw.right ? 1 : f.facing);
                cmd.airDir = raw.down && fwd ? 'df' : (raw.down ? 'd' : 'f');
                ib.pend = null;
                if (cmd.atk && cmd.atk.startsWith('special')) { ib.charge = 0; ib.chargeReady = 0; }
            }
        }
        return cmd;
    }

    resolveButtons(f, B, c) {
        const has = b => B.has(b);
        if ((has('t1') && has('t2')) || (has('hp') && has('hk'))) {
            if (f.mp >= 100) return 'super';
            if (!has('hp')) return null;
        }
        if (has('mp') && has('hp') && ((c.fwd && f.onGround && !c.down) || f.state === 'held')) return 'grab';
        const punch = has('hp') ? 'hp' : (has('mp') ? 'mp' : (has('lp') ? 'lp' : null));
        const kick = has('hk') ? 'hk' : (has('mk') ? 'mk' : (has('lk') ? 'lk' : null));
        if (punch && c.fwd && c.charged && f.onGround) return 'special' + { lp: 1, mp: 2, hp: 3 }[punch];
        if (punch === 'hp' && c.down && f.onGround) return 'launcher';
        const btn = punch || kick;
        if (!btn) return null;
        if (!f.onGround) return 'j' + btn;   // golpe ALTO (en el aire)
        if (c.down) return 'c' + btn;        // golpe BAJO (agachado)
        return btn;                          // golpe MEDIO (de pie)
    }

    // =====================================================================
    // INTÉRPRETE DE COMANDOS: carga, ↓↑, ↓↓ y botones simultáneos
    // =====================================================================


    autoFace(f) {
        let best = null, bd = Infinity;
        for (const o of this.fighters) {
            if (!o.alive || !this.isEnemy(f, o)) continue;
            const d = Math.abs(o.x - f.x) + Math.abs(o.y - f.y) * 0.5;
            if (d < bd) { bd = d; best = o; }
        }
        if (!best || Math.abs(best.x - f.x) < 6) return null;
        return best.x > f.x ? 1 : -1;
    }

    // SISTEMA DE ENFOQUE DE BLANCO (Target Lock)
    // 1 vs 1 (un solo rival vivo): siempre mira al rival.
    // 3+ luchadores: orientación libre; solo se enfoca 1,5 s al atacante tras recibir un golpe cuerpo a cuerpo.
    getFocusTarget(f) {
        let only = null, n = 0;
        for (const o of this.fighters) {
            if (o === f || !o.alive || !this.isEnemy(f, o)) continue;
            only = o; n++;
        }
        if (n === 1) return only;
        if (f.focusTimer > 0 && f.focusedTargetId != null) {
            const t = this.fighters.find(o => o.id === f.focusedTargetId);
            if (t && t.alive && this.isEnemy(f, t) && Math.abs(t.x - f.x) <= FOCUS_BREAK_DIST) return t;
            // el atacante murió o se alejó demasiado: se suelta el enfoque
            f.focusedTargetId = null; f.focusTimer = 0;
        }
        return null;
    }

    enemyInReach(f, reach) {
        return this.fighters.some(o => o.alive && this.isEnemy(f, o) && Math.abs(o.x - (f.x + f.facing * reach * 0.5)) < reach * 0.7 && Math.abs(o.y - f.y) < 80);
    }

    // =====================================================================
    // IA: OBJETIVO ENEMIGO, ESQUIVA, AGARRES Y PELIGROS
    // =====================================================================
    hazardDangerAt(x) {
        const c = this.cycle || {};
        if (c.beam && c.beam !== 'off' && Math.abs(x - 875) < 75) return x < 875 ? -1 : 1;
        if (c.acid && x > c.acid.x - 30 && x < c.acid.x + c.acid.w + 30) return (x - c.acid.x < c.acid.x + c.acid.w - x) ? -1 : 1;
        for (const h of this.hazards) if (h.delay <= 0 && Math.abs(h.x - x) < 95 && h.y > -200) return x < h.x ? -1 : 1;
        return 0;
    }

    computeBotInput(bot) {
        const cmd = this.emptyInput();
        const isHardcore = this.difficulty === 'hardcore';
        const isEasy = this.difficulty === 'easy';

        if (bot.state === 'held') {
            if (bot.heldTimer < 14 && Math.random() < (isHardcore ? 0.14 : (isEasy ? 0.01 : 0.05))) cmd.atk = 'grab';
            return cmd;
        }
        if (bot.aiCrouch > 0) { bot.aiCrouch--; cmd.down = true; return cmd; }
        if (bot.aiBlock > 0) { bot.aiBlock--; cmd.back = true; cmd.down = !!bot.aiBlockLow; return cmd; }

        let nearest = null, minDist = Infinity;
        for (const other of this.fighters) {
            if (!other.alive || !this.isEnemy(bot, other) || other.state === 'held') continue;
            const d = Math.hypot(other.x - bot.x, other.y - bot.y);
            if (d < minDist) { minDist = d; nearest = other; }
        }
        if (!nearest) return cmd;

        const dx = nearest.x - bot.x;
        const absDx = Math.abs(dx);
        const dir = dx >= 0 ? 1 : -1;
        const reactionMult = isHardcore ? 0.4 : (isEasy ? 1.8 : 1.0);
        const readP = isHardcore ? 0.8 : (isEasy ? 0.2 : 0.5);

        // Cadenas: si el golpe conectó, sigue con uno más fuerte de la misma familia
        const cur = MOVE_DATA[bot.state];
        if (cur && cur.rank && bot.hasHitThisSwing && !bot.aiChained) {
            bot.aiChained = true;
            if (cur.rank < 3 && !cur.air && Math.random() < (isHardcore ? 0.8 : (isEasy ? 0.05 : 0.35))) {
                const pre = cur.low ? 'c' : '';
                if (cur.rank === 2 && !cur.low && bot.mp >= 25 && Math.random() < 0.4) cmd.atk = 'special2';
                else cmd.atk = pre + (cur.cat === 'punch' ? (cur.rank === 1 ? 'mp' : 'hp') : (cur.rank === 1 ? 'mk' : 'hk'));
                return cmd;
            }
        }

        // Ataque aéreo cuando cae cerca del rival
        if (!bot.onGround && !bot.airUsed && absDx < 110 && bot.vy > -3 && nearest.y >= bot.y - 20 && Math.random() < 0.25) {
            cmd.atk = Math.random() < 0.5 ? 'jmk' : 'jhp';
            cmd.airDir = nearest.y > bot.y + 30 ? 'df' : 'f';
            return cmd;
        }

        // Reacción: proyectiles y golpes cercanos (lee la altura del golpe)
        if (bot.onGround && --bot.aiReact <= 0) {
            bot.aiReact = isHardcore ? 4 : (isEasy ? 16 : 8);
            const threat = this.projectiles.find(p => {
                const owner = this.fighters.find(f => f.id === p.ownerId);
                return owner && this.isEnemy(bot, owner) && Math.sign(bot.x - p.x) === Math.sign(p.vx) && Math.abs(bot.x - p.x) < 210 && Math.abs((bot.y - 70) - p.y) < 90;
            });
            if (threat && Math.random() < (isHardcore ? 0.75 : (isEasy ? 0.1 : 0.35))) {
                if (!threat.isSuper && Math.random() < 0.55) { bot.aiCrouch = 16; cmd.down = true; }
                else { bot.aiBlock = 16; bot.aiBlockLow = false; cmd.back = true; }
                return cmd;
            }
            const md = MOVE_DATA[nearest.state];
            if (md && md.rank && absDx < 140 && Math.random() < readP * 0.8) {
                // Bloqueo correcto según altura (con margen de error según dificultad)
                const right = Math.random() < readP;
                bot.aiBlockLow = right ? !!md.low : !md.low;
                if (md.air) bot.aiBlockLow = right ? false : true;
                bot.aiBlock = 14;
                cmd.back = true; cmd.down = bot.aiBlockLow;
                return cmd;
            }
        }

        if (!isEasy || Math.random() < 0.3) {
            const esc = this.hazardDangerAt(bot.x);
            if (esc) { if (esc > 0) cmd.right = true; else cmd.left = true; return cmd; }
        }

        if (bot.aiJump > 0) { cmd.upHeld = true; if (bot.aiJump === 16) cmd.jump = true; bot.aiJump--; }
        if (bot.aiDrop > 0) { bot.aiDrop--; cmd.drop = true; }

        bot.aiTimer--;
        if (bot.aiTimer <= 0) {
            bot.aiTimer = Math.floor((30 + Math.random() * 35) * reactionMult);
            const roll = Math.random();
            let d = 'approach';
            const low = Math.random() < (nearest.blocking && !nearest.crouching ? 0.6 : 0.3) ? 'c' : '';
            if (isHardcore && nearest.inJuggle && absDx < 90) d = roll < 0.5 ? 'mp' : 'lp';
            else if (bot.mp >= 100 && absDx < 450 && roll < (isHardcore ? 0.75 : 0.4)) d = 'super';
            else if (absDx < 70 && nearest.onGround && ((nearest.blocking && roll < 0.45) || roll < 0.06)) d = 'grab';
            else if (absDx < 150 && nearest.blocking && nearest.crouching && roll < 0.5 && bot.onGround) { d = 'approach'; bot.aiJump = 16; }
            else if (absDx < 85) {
                if (isHardcore && roll < 0.3) d = 'launcher';
                else d = roll < 0.85 ? low + ['lp', 'mp', 'hp', 'lk', 'mk'][Math.floor(Math.random() * 5)] : 'block';
            } else if (absDx < 120 && roll < 0.45) d = low ? 'chk' : (roll < 0.25 ? 'hk' : 'mk');
            else if (absDx < 420 && roll < 0.35 && bot.mp >= 20) d = bot.mp >= 30 && roll < 0.12 ? 'special3' : (bot.mp >= 25 ? 'special2' : 'special1');
            else if (absDx < 220 && roll > 0.9 && bot.rollCooldown === 0) d = 'roll';
            bot.aiDecision = d;
            if (nearest.y < bot.y - 60 && absDx < 220 && bot.onGround && roll < 0.6) bot.aiJump = 16;
            if (nearest.y > bot.y + 60 && bot.onPlat && roll < 0.5) bot.aiDrop = 12;
        }

        const d = bot.aiDecision;
        if (d === 'approach') {
            if (dx > 70) cmd.right = true;
            else if (dx < -70) cmd.left = true;
        } else if (d === 'block') {
            cmd.back = true;
            cmd.down = Math.random() < 0.5;
        } else if (d === 'roll') {
            cmd.dodge = bot.facing;
            bot.aiDecision = 'approach';
        } else {
            cmd.atk = d;
            cmd.aim = dir;
            bot.aiChained = false;
            bot.aiDecision = 'approach';
        }
        return cmd;
    }

    // =====================================================================
    // BUCLE PRINCIPAL: HOST AUTORITATIVO / CLIENTE CON PREDICCIÓN
    // =====================================================================
    update(dt) {
        this.pollPauseInput();
        if (this.paused) return;
        this.time += dt;
        if (this.superFlash && --this.superFlash.timer <= 0) this.superFlash = null;
        if (this.camera.kick > 0.001) this.camera.kick *= 0.86; else this.camera.kick = 0;
        if (this.hitStopFrames > 0) {
            this.hitStopFrames--;
            this.updateCamera();
            return;
        }
        if (this.slowMo > 0) {
            this.slowMo--;
            this.slowTick = (this.slowTick + 1) % 3;
            if (this.slowTick !== 0) { this.updateParticles(); this.updateCamera(); return; }
        }

        if (!this.isHost) {
            const inp = this.getLocalInputMap();
            const key = JSON.stringify(inp);
            this.inputSendTick = (this.inputSendTick || 0) + 1;
            if (key !== this.lastInputKey || this.inputSendTick >= 6) {
                net.sendClientInput(inp);
                this.lastInputKey = key;
                this.inputSendTick = 0;
            }
        }

        if (this.matchState === 'fighting' && this.timerMode !== 'infinite') {
            this.timerAccum += dt;
            if (this.timerAccum >= 1) {
                this.timerAccum -= 1;
                this.timer = Math.max(0, this.timer - 1);
                if (this.timer === 0) this.endMatchByTimeout();
            }
        }

        this.updateHazards(dt);
        if (this.isHost) this.updateHost(); else this.updateClient();

        this.updateParticles();
        this.updateFloatingTexts();
        this.updateAmbient();
        this.updateCamera();
        this.updateHUD();
        this.updateMusicIntensity();
        this.checkWinCondition();

        if (this.isHost) {
            this.syncAccum += dt;
            if (this.syncAccum >= 0.05) {
                this.syncAccum = 0;
                this.broadcastSnapshot();
            }
        }
    }

    tickFighterTimers(f) {
        f.animFrame += 0.18;
        if (f.comboTimer > 0 && --f.comboTimer === 0) f.comboCount = 0;
        if (f.focusTimer > 0 && --f.focusTimer === 0) f.focusedTargetId = null;
        if (f.stunTimer > 0) f.stunTimer--;
        if (f.attackCooldown > 0) f.attackCooldown--;
        if (f.hitFlash > 0) f.hitFlash--;
        if (f.rollCooldown > 0) f.rollCooldown--;
        if (f.hazardCd > 0) f.hazardCd--;
    }

    updateHost() {
        // Orden de proceso alterno cada frame: nadie tiene ventaja por su posición en la lista
        this._flip = !this._flip;
        const list = this._flip ? this.fighters : [...this.fighters].reverse();
        // Un jugador que abandonó la sala pasa a ser controlado por la IA y la pelea sigue
        // (en coop lo hace además el motor cooperativo; aquí cubrimos el versus)
        if (this.room && this.room.slots && this.matchState === 'fighting') {
            for (const f of this.fighters) {
                if (!f.isBot && f.id !== this.localUserId && !String(f.id).startsWith('enemy_') && !this.room.slots.some(sl => sl.id === f.id)) {
                    f.isBot = true;
                    if (f.ib) f.ib.pend = null;
                }
            }
        }
        for (const f of list) {
            this.tickFighterTimers(f);
            if (!f.alive) { this.updateDeadBody(f); continue; }
            let cmd;
            if (this.matchState !== 'fighting') cmd = this.emptyInput();
            else if (f.id === this.localUserId) cmd = this.interpretInput(f, this.getLocalInputMap());
            else if (f.isBot) cmd = this.computeBotInput(f);
            else cmd = this.interpretInput(f, this.remoteInputs[f.id]);
            this.processFighterLogic(f, cmd);
        }
        this.updateProjectiles();
    }

    updateClient() {
        for (const f of this.fighters) {
            this.tickFighterTimers(f);
            const isLocal = f.id === this.localUserId;
            if (!f.alive) {
                if (f.net) this.lerpToNet(f, 0.3, false); else this.updateDeadBody(f);
                continue;
            }
            if (isLocal && this.matchState === 'fighting' && !CLIENT_FORCED.has(f.state)) {
                // PREDICCIÓN LOCAL: respondemos al instante a los controles
                this.processFighterLogic(f, this.interpretInput(f, this.getLocalInputMap()));
                if (f.net) {
                    const ex = f.net.x - f.x, ey = f.net.y - f.y;
                    if (Math.abs(ex) > 140 || Math.abs(ey) > 160) { f.x = f.net.x; f.y = f.net.y; }
                    else {
                        f.x += ex * 0.08;
                        if (f.onGround === f.net.onGround) f.y += ey * 0.08;
                    }
                }
            } else if (f.net) {
                // INTERPOLACIÓN de rivales (y del local cuando el host impone estado)
                this.lerpToNet(f, 0.35, true);
                if (f.stateTimer > 0) f.stateTimer--;
            }
        }
        for (const p of this.projectiles) {
            p.x += p.vx;
            p.age = (p.age || 0) + 1;
            if (p.netX !== undefined) { p.netX += p.vx; p.x += (p.netX - p.x) * 0.25; }
            if (Math.random() < 0.5) this.particles.push({ x: p.x - Math.sign(p.vx) * 10, y: p.y + (Math.random() - 0.5) * p.radius, vx: -p.vx * 0.2, vy: (Math.random() - 0.5) * 1.5, radius: p.isSuper ? 8 : 4, color: p.color, alpha: 0.9, decay: 0.06 });
        }
    }

    lerpToNet(f, k, extrapolate) {
        const n = f.net;
        if (extrapolate && n.age < 6) { n.x += n.vx; n.age++; }
        if (Math.abs(n.x - f.x) > 220 || Math.abs(n.y - f.y) > 220) { f.x = n.x; f.y = n.y; return; }
        f.x += (n.x - f.x) * k;
        f.y += (n.y - f.y) * k;
    }

    updateDeadBody(f) {
        f.vy += 0.75;
        f.x += f.vx;
        f.vx *= 0.97;
        f.y += f.vy;
        f.x = Math.max(55, Math.min(this.worldWidth - 55, f.x));
        const deadGround = this.groundY + (f.z || 0);
        if (f.y >= deadGround) {
            f.y = deadGround;
            if (!f.bounced && f.vy > 4) {
                f.vy = -f.vy * 0.38;
                f.bounced = true;
                this.spawnDust(f.x, f.y, 12);
                this.camera.shake = Math.max(this.camera.shake, 7);
                sfx.named('thud');
            } else {
                f.vy = 0;
                f.vx *= 0.75;
            }
        }
    }

    // =====================================================================
    // LÓGICA DEL LUCHADOR
    // =====================================================================
    processFighterLogic(f, cmd) {
        const arch = f.archetype;
        if (f.invuln > 0) f.invuln--;
        if (f.blockStun > 0) f.blockStun--;
        if (f.state === 'held') { this.updateHeld(f, cmd); return; }

        if (f.stateTimer > 0) {
            f.stateTimer--;
            if (f.stateTimer === 0) this.onStateEnd(f);
        }

        // Disparo del poder en el frame exacto de la animación (solo el host crea el proyectil)
        if (f.pendingShot) {
            if (f.state === f.pendingShot) {
                const md = MOVE_DATA[f.state];
                if ((f.stateMax || md.dur) - f.stateTimer >= md.release) {
                    if (this.isHost) this.spawnProjectile(f, f.state === 'super');
                    f.pendingShot = null;
                }
            } else {
                f.pendingShot = null;
            }
        }

        if (f.state === 'throw' && this.isHost) this.updateThrow(f);

        let canAct = !LOCKED_STATES.has(f.state) && f.stunTimer === 0 && f.blockStun === 0;

        // Los bots se giran solos hacia el rival; los jugadores giran con atrás-atrás
        if (f.isBot) {
            const face = this.autoFace(f);
            if (canAct && f.onGround && face) f.facing = face;
        } else {
            const ft = this.getFocusTarget(f);
            if (ft) {
                if (canAct && f.onGround && Math.abs(ft.x - f.x) > 6) f.facing = ft.x > f.x ? 1 : -1;
            } else if (cmd.turn && canAct && f.onGround) {
                f.facing = -f.facing;
            }
        }

        if (canAct && f.onGround && cmd.dodge && f.rollCooldown === 0) {
            this.triggerRoll(f, cmd.dodge);
            canAct = false;
        }

        // BLOQUEO = mantener atrás (de pie) o ↓ + atrás (agachado). Durante el bloqueo-stun se mantiene.
        const midAttack = MOVE_DATA[f.state] && MOVE_DATA[f.state].rank;
        if (f.blockStun > 0) {
            // conserva postura de guardia
        } else {
            f.blocking = canAct && f.onGround && cmd.back;
            f.crouching = f.onGround && ((canAct && cmd.down) || (midAttack && MOVE_DATA[f.state].low));
        }
        f.guardShow = f.blocking && (f.blockStun > 0 || this.threatNear(f));

        if (canAct && !f.crouching) {
            if ((cmd.left || cmd.right) && !f.guardShow) {
                const dir = cmd.left ? -1 : 1;
                const backwards = dir !== f.facing;
                f.vx = dir * arch.speed * (backwards && f.onGround ? 0.8 : 1);
                if (f.onGround) f.state = 'walk';
            } else {
                f.vx *= 0.72;
                if (Math.abs(f.vx) < 0.2) f.vx = 0;
                if (f.onGround && f.state === 'walk') f.state = 'idle';
            }
            if (cmd.jump && f.onGround) {
                f.vy = arch.jumpForce * 1.15;
                f.onGround = false;
                f.onPlat = null;
                f.isJumping = true;
                f.blocking = false;
                f.state = 'jump';
                this.spawnDust(f.x, f.y, 6);
            }
        } else if (f.state === 'roll') {
            f.vx = f.rollDir * 8.2;
        } else if (f.state === 'hurt' || f.state === 'stun' || !f.onGround || f.blockStun > 0) {
            f.vx *= f.onGround ? 0.86 : 0.985;
        } else {
            f.vx *= 0.6;
            if (Math.abs(f.vx) < 0.2) f.vx = 0;
        }
        if (canAct && f.crouching && f.state === 'walk') f.state = 'idle';
        // Salto cooperativo comprometido: la velocidad horizontal del aire queda fija (airVx solo existe en coop)
        if (f.airVx !== undefined && !f.onGround && canAct) f.vx = f.airVx;

        if (f.isJumping && !cmd.upHeld && f.vy < -4.5) {
            f.vy *= 0.52;
            f.isJumping = false;
        }

        if (cmd.atk) this.tryAttack(f, cmd, canAct);

        if (this.isHost && f.hitBoxActive && !f.hasHitThisSwing && this.isActiveFrame(f)) {
            if (f.state === 'grab') this.checkGrab(f);
            else this.checkMeleeHits(f);
        }

        // ----- FÍSICA -----
        const prevY = f.y;
        if (f.onGround && f.onPlat) f.x += f.onPlat.dx || 0;
        const wind = this.windForce ? this.windForce * (f.blocking ? 0.35 : 1) * (f.onGround ? 1 : 1.3) : 0;
        f.x += f.vx + wind;
        f.vy += (f.inJuggle ? 0.38 : 0.72) * this.gravityScale;
        f.y += f.vy;
        f.x = Math.max(55, Math.min(this.worldWidth - 55, f.x));

        let landed = false, landedPlat = null;
        if (f.vy >= 0 && !cmd.drop) {
            for (const plat of this.platforms) {
                if (f.x >= plat.x - 15 && f.x <= plat.x + plat.w + 15) {
                    const tol = 6 + Math.abs(plat.dy || 0) * 2;
                    if (prevY <= plat.y + tol && f.y >= plat.y) {
                        f.y = plat.y;
                        f.vy = 0;
                        landed = true;
                        landedPlat = plat;
                        break;
                    }
                }
            }
        }
        const laneGround = this.groundY + (f.z || 0);
        if (!landed && f.y >= laneGround) {
            f.y = laneGround;
            f.vy = 0;
            landed = true;
        }

        if (landed) {
            if (!f.onGround) {
                // Un golpe aéreo se corta al aterrizar
                const am = MOVE_DATA[f.state];
                if (am && am.air) { f.state = 'idle'; f.stateTimer = 0; f.hitBoxActive = false; f.attackCooldown = 4; }
                if (f.knockdown) { f.knockdown = false; this.knockDown(f); }
                else {
                    this.spawnDust(f.x, f.y, 5);
                    if (f.state === 'jump') f.state = 'idle';
                }
            }
            f.isJumping = false;
            f.inJuggle = false;
            f.juggleHits = 0;
            f.juggleImmune = false;
            f.airUsed = false;
        }
        f.onPlat = landedPlat;
        f.onGround = landed;

        f.mp = Math.min(f.maxMp, f.mp + 0.015);
    }

    threatNear(f) {
        for (const o of this.fighters) {
            if (!o.alive || !this.isEnemy(f, o)) continue;
            if (Math.abs(o.x - f.x) > 170 || Math.abs(o.y - f.y) > 160) continue;
            const md = MOVE_DATA[o.state];
            if ((md && (md.rank || md.release)) || o.state === 'grab') return true;
        }
        for (const p of this.projectiles) {
            if (Math.abs(p.x - f.x) < 240 && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs((f.y - 60) - p.y) < 100) return true;
        }
        return false;
    }

    tryAttack(f, cmd, canAct) {
        const atk = cmd.atk;
        const key = atk.startsWith('special') ? 'special' : atk;
        const nxt = MOVE_DATA[key];
        let allowed = canAct && f.attackCooldown === 0;
        const cur = MOVE_DATA[f.state];
        if (!allowed && cur && cur.rank && f.stunTimer === 0 && f.blockStun === 0) {
            // Cadenas: solo de menor a mayor y solo si el golpe tocó al rival
            const el = (f.stateMax || cur.dur) - f.stateTimer;
            const contact = f.hasHitThisSwing || (!this.isHost && this.enemyInReach(f, cur.reach + 25));
            if (contact && el >= cur.active[0] && !!cur.air === !!(nxt && nxt.air)) {
                if (nxt && nxt.rank && nxt.rank > cur.rank && key !== 'launcher') allowed = true;
                else if ((key === 'special' || key === 'super' || key === 'launcher') && cur.rank >= 2 && !cur.air) allowed = true;
            }
        }
        if (!allowed) return;
        if (nxt && nxt.air && (f.onGround || f.airUsed)) return;
        if (nxt && nxt.low && !f.onGround) return;
        f.blocking = false;
        switch (key) {
            case 'super':
                if (f.mp >= 100) this.triggerSuperAttack(f, cmd.aim || f.facing);
                break;
            case 'special': {
                const lvl = Number(atk.slice(-1)) || 2;
                if (f.mp >= SPECIAL_LEVELS[lvl - 1].cost) this.triggerSpecialProjectile(f, lvl);
                else this.triggerNormal(f, ['lp', 'mp', 'hp'][lvl - 1]);
                break;
            }
            case 'grab':
                if (f.onGround) this.triggerGrab(f);
                break;
            case 'launcher':
                if (f.onGround) this.triggerLauncherAttack(f); else this.triggerNormal(f, 'jhp');
                break;
            default:
                if (nxt && nxt.rank) {
                    if (nxt.air) { f.airDir = cmd.airDir || 'f'; f.airUsed = true; }
                    this.triggerNormal(f, key);
                }
        }
    }

    triggerNormal(f, atk) {
        this.setMove(f, atk);
        sfx.charSwing(f.archetype.id, atk);
    }

    onStateEnd(f) {
        if (f.state === 'down') {
            f.state = 'getup';
            f.stateTimer = f.stateMax = MOVE_DATA.getup.dur;
            f.invuln = Math.max(f.invuln, MOVE_DATA.getup.dur + 6);
            return;
        }
        if (f.state === 'throw' && f.grabTarget) {
            const t = this.fighters.find(x => x.id === f.grabTarget);
            if (t && t.state === 'held') { t.state = 'hurt'; t.stateTimer = t.stateMax = 10; t.heldBy = null; }
            f.grabTarget = null;
        }
        f.state = f.onGround ? 'idle' : 'jump';
        f.hitBoxActive = false;
        f.hasHitThisSwing = false;
    }

    knockDown(f) {
        f.state = 'down';
        f.stateTimer = f.stateMax = MOVE_DATA.down.dur;
        f.vx *= 0.3;
        f.invuln = MOVE_DATA.down.dur + 2;
        f.blocking = false;
        f.crouching = false;
        this.spawnDust(f.x, f.y, 14);
        if (this.isHost) {
            this.fx({ k: 'shake', v: 6 });
            this.fx({ k: 'snd', n: 'thud' });
        }
    }

    setMove(f, move) {
        const md = MOVE_DATA[move];
        f.state = move;
        f.stateTimer = md.dur;
        f.stateMax = md.dur;
        f.attackCooldown = md.cd;
        f.hitBoxActive = !!md.active;
        f.hasHitThisSwing = false;
    }

    isActiveFrame(f) {
        const md = MOVE_DATA[f.state];
        if (!md || !md.active) return false;
        const el = (f.stateMax || md.dur) - f.stateTimer;
        return el >= md.active[0] && el <= md.active[1];
    }

    triggerLauncherAttack(f) {
        this.setMove(f, 'launcher');
        sfx.charSwing(f.archetype.id, 'launcher');
        this.addFloatingText(f.x, f.y - 130 * f.archetype.build.s, '¡LAUNCHER!', '#facc15', 18, f.id);
    }

    triggerMeleeAttack(f, type) {
        this.triggerNormal(f, type === 'kick' ? 'mk' : 'mp');
    }

    triggerGrab(f) {
        this.setMove(f, 'grab');
        sfx.charSwing(f.archetype.id, 'grab');
    }

    triggerRoll(f, dir) {
        dir = f.facing;   // solo se rueda hacia adelante
        f.state = 'roll';
        f.stateTimer = f.stateMax = MOVE_DATA.roll.dur;
        f.rollDir = dir;
        f.invuln = 16;
        f.rollCooldown = MOVE_DATA.roll.cd;
        f.blocking = false;
        f.crouching = false;
        f.hitBoxActive = false;
        this.spawnDust(f.x, f.y, 6);
        sfx.named('roll');
    }

    triggerSpecialProjectile(f, lvl = 2) {
        f.mp -= SPECIAL_LEVELS[lvl - 1].cost;
        this.setMove(f, 'special');
        f.pendingShot = 'special';
        f.specialLevel = lvl;
        sfx.charCharge(f.archetype.id);
    }

    triggerSuperAttack(f, aim) {
        f.mp = 0;
        if (aim) f.facing = aim;
        this.setMove(f, 'super');
        f.pendingShot = 'super';
        this.camera.shake = Math.max(this.camera.shake, 8);
        sfx.sfxSuper();
        this.addFloatingText(f.x, f.y - 140 * f.archetype.build.s, `¡${f.archetype.superName.toUpperCase()}!`, '#facc15', 20, f.id);
        this.startSuperFlash(f);
    }

    spawnProjectile(f, isSuper) {
        const arch = f.archetype;
        const s = arch.build.s;
        const lv = SPECIAL_LEVELS[(f.specialLevel || 2) - 1];
        const x = f.x + f.facing * (isSuper ? 64 : 50) * s;
        const y = f.y - 74 * s;
        this.projectiles.push({
            id: Math.random().toString(36).slice(2),
            ownerId: f.id,
            ownerName: f.name,
            team: f.team,
            kind: arch.id,
            x, y, z: f.z || 0,
            vx: f.facing * arch.projSpeed * (isSuper ? 1.25 : lv.speed),
            radius: isSuper ? 44 : lv.r,
            damage: isSuper ? 230 : lv.dmg,
            isSuper,
            color: arch.projColor,
            life: isSuper ? 150 : 140,
            age: 0,
            hitIds: []
        });
        sfx.charSpecial(arch.id, isSuper);
        if (isSuper) {
            this.camera.shake = Math.max(this.camera.shake, 12);
            this.spawnBurst(x, y, '#facc15', 18);
        }
        this.spawnBurst(x, y, arch.projColor, 10);
    }

    // =====================================================================
    // AGARRES
    // =====================================================================
    checkGrab(f) {
        // Zona de agarre: de 20 px detrás a 84 px delante (antes 0–84 exclusivo, que dejaba fuera al rival superpuesto)
        const reachX = f.x + f.facing * 32;
        const byDist = [...this.fighters].sort((a, b) => Math.abs(a.x - f.x) - Math.abs(b.x - f.x));
        for (const t of byDist) {
            if (!t.alive || !this.isEnemy(f, t) || !t.onGround || t.inJuggle || t.invuln > 0) continue;
            if (['held', 'down', 'getup', 'roll', 'throw'].includes(t.state)) continue;
            if (Math.abs(t.x - reachX) >= 52 || Math.abs((t.y - (t.z || 0)) - (f.y - (f.z || 0))) >= 30 || !this.sameLane(f, t)) continue;

            const wasBlocking = t.blocking;
            f.hasHitThisSwing = true;
            f.hitBoxActive = false;
            // Los dos agarran a la vez: se repelen
            if (t.state === 'grab' && (t.stateMax - t.stateTimer) < 10) {
                for (const [a, d] of [[f, -f.facing], [t, f.facing]]) { a.state = 'hurt'; a.stateTimer = a.stateMax = 10; a.vx = d * 7; a.hitBoxActive = false; }
                this.addFloatingText((f.x + t.x) / 2, f.y - 130, '¡CHOQUE DE AGARRES!', '#38bdf8', 16);
                this.fx({ k: 'snd', n: 'block' });
                return;
            }
            f.state = 'throw';
            f.stateTimer = f.stateMax = MOVE_DATA.throw.dur;
            f.grabTarget = t.id;
            f.attackCooldown = MOVE_DATA.throw.cd;
            t.state = 'held';
            t.heldBy = f.id;
            t.heldTimer = 0;
            t.blocking = false;
            t.crouching = false;
            t.pendingShot = null;
            t.hitBoxActive = false;
            t.stateTimer = 0;
            t.vx = 0; t.vy = 0;
            t.facing = -f.facing;
            this.fx({ k: 'snd', n: 'grab' });
            this.addFloatingText(t.x, t.y - 125, wasBlocking ? '¡AGARRE ROMPEGUARDIA!' : '¡AGARRE!', '#f472b6', 16);
            return;
        }
    }

    updateHeld(t, cmd) {
        const g = this.fighters.find(x => x.id === t.heldBy);
        t.heldTimer++;
        if (!g || !g.alive || g.state !== 'throw') {
            t.state = 'hurt';
            t.stateTimer = t.stateMax = 10;
            t.heldBy = null;
            return;
        }
        // Romper el agarre con → + I + O en los primeros 14 frames
        if (this.isHost && t.heldTimer <= 14 && cmd.atk === 'grab') {
            g.state = 'hurt'; g.stateTimer = g.stateMax = 12; g.grabTarget = null; g.vx = -g.facing * 7;
            t.state = 'hurt'; t.stateTimer = t.stateMax = 12; t.heldBy = null; t.vx = g.facing * 7;
            this.addFloatingText((g.x + t.x) / 2, t.y - 130, '¡AGARRE ROTO!', '#38bdf8', 17);
            this.fx({ k: 'snd', n: 'block' });
            return;
        }
        const k = clamp01((g.stateMax - g.stateTimer) / MOVE_DATA.throw.releaseAt);
        t.x = g.x + g.facing * (34 - k * 22);
        t.y = g.y - k * 62 * g.archetype.build.s;
        t.vx = 0; t.vy = 0;
        t.onGround = k < 0.05;
    }

    updateThrow(f) {
        const el = f.stateMax - f.stateTimer;
        if (el !== MOVE_DATA.throw.releaseAt || !f.grabTarget) return;
        const t = this.fighters.find(x => x.id === f.grabTarget);
        f.grabTarget = null;
        if (!t || t.state !== 'held') return;
        t.state = 'hurt';
        t.heldBy = null;
        t.onGround = false;
        this.fx({ k: 'snd', n: 'throw' });
        this.applyDamage(f, t, 110, f.facing * 8, -10, { unblockable: true, knockdown: true, kind: 'heavy' });
    }

    // =====================================================================
    // GOLPES, DAÑO E IMPACTO
    // =====================================================================
    checkMeleeHits(attacker) {
        const md = MOVE_DATA[attacker.state];
        if (!md || !md.reach) return;
        const reach = md.reach;
        const fc = attacker.facing;
        // Zona de impacto según altura y dirección del golpe
        // BACK_PAD: la zona también cubre unos px detrás del atacante, para que un rival superpuesto
        // (mismo x, p. ej. pegados a la pared) pueda ser golpeado. El alcance frontal no cambia.
        const BACK_PAD = 24;
        let hitX = attacker.x + fc * (reach * 0.65 - BACK_PAD / 2), hitY = attacker.y - 55, halfW = reach * 0.65 + BACK_PAD / 2, halfH = 62;
        if (md.low) { hitY = attacker.y - 28; halfH = 50; }
        if (md.air) {
            const dir = attacker.airDir || 'f';
            if (dir === 'df') { hitX = attacker.x + fc * reach * 0.5; hitY = attacker.y - 5; halfH = 70; }
            else if (dir === 'd') { hitX = attacker.x + fc * 6; hitY = attacker.y + 25; halfW = 38; halfH = 60; }
            else { hitY = attacker.y - 40; halfH = 80; }
        }
        const level = md.air ? 'high' : (md.low ? 'low' : 'mid');

        // Golpea al rival MÁS CERCANO dentro de la zona (no al primero de la lista)
        let best = null, bestD = Infinity;
        for (const t of this.fighters) {
            if (!t.alive || !this.isEnemy(attacker, t) || t.invuln > 0 || t.juggleImmune) continue;
            if (t.state === 'held' && t.heldBy === attacker.id) continue;
            if (!this.sameLane(attacker, t)) continue;
            const tCenter = t.y - (t.crouching ? 34 : 54);
            const dx = Math.abs(t.x - hitX);
            const dy = Math.abs((tCenter - (t.z || 0)) - (hitY - (attacker.z || 0)));
            const dist = Math.abs(t.x - attacker.x) + Math.abs(t.y - attacker.y);
            if (dx < halfW && dy < halfH && dist < bestD) { bestD = dist; best = t; }
        }
        if (!best) return;
        const target = best;
        attacker.hasHitThisSwing = true;
        if (attacker.state === 'launcher') {
            if (!(target.state === 'super' && target.pendingShot) && !target.blocking) {
                target.inJuggle = true;
                target.onGround = false;
                target.juggleHits = 0;
            }
            this.applyDamage(attacker, target, md.dmg, fc * 4, -16.5, { kind: 'heavy', knockdown: true, level });
        } else if (target.inJuggle) {
            // Máximo 4 golpes en el aire; después cae sin poder ser golpeado
            target.juggleHits = (target.juggleHits || 0) + 1;
            if (target.juggleHits >= 4) target.juggleImmune = true;
            this.fx({ k: 'snd', n: 'juggle' });
            this.applyDamage(attacker, target, md.dmg, fc * 6, -6.5, { kind: md.kind, knockdown: true, level });
        } else {
            const kbY = md.air && attacker.airDir === 'd' ? -2 : md.kby;
            this.applyDamage(attacker, target, md.dmg, fc * md.kb, kbY, { kind: md.kind, knockdown: !!md.knockdown, level });
        }
    }

    applyDamage(attacker, target, rawDamage, knockbackX, knockbackY = -4.5, opts = {}) {
        if (!target.alive || target.invuln > 0) return false;
        const kind = opts.kind || 'light';
        const hazard = !attacker;

        if (attacker && target.blocking && !opts.unblockable) {
            const isFacingAttacker = (attacker.x > target.x && target.facing === 1) || (attacker.x < target.x && target.facing === -1);
            const level = opts.level || 'mid';
            // ALTO: solo de pie · MEDIO: de pie o agachado · BAJO: solo agachado
            const rightHeight = level === 'mid' || (level === 'high' && !target.crouching) || (level === 'low' && target.crouching);
            if (isFacingAttacker && !rightHeight) {
                this.addFloatingText(target.x, target.y - 140, level === 'low' ? '¡BAJO!' : '¡ALTO!', level === 'low' ? '#f472b6' : '#fb923c', 18);
            }
            if (isFacingAttacker && rightHeight) {
                target.blockStun = { light: 9, medium: 12, heavy: 16, super: 20 }[kind] || 10;
                target.guardShow = true;
                const chipDamage = Math.round(rawDamage * 0.15);
                target.hp = Math.max(1, target.hp - chipDamage);
                target.vx = knockbackX * 0.4;
                // El golpe fuerte bloqueado empuja también al atacante hacia atrás
                attacker.vx = -attacker.facing * (kind === 'heavy' ? 5 : 2);
                this.fx({ k: 'snd', n: 'block' });
                this.fx({ k: 'hit', x: target.x + target.facing * 20, y: target.y - 60, h: 'chip', c: '#38bdf8', d: -target.facing });
                this.addFloatingText(target.x, target.y - 110, '¡BLOQUEO!', '#38bdf8', 14);
                return false;
            }
            if (!isFacingAttacker) {
                this.fx({ k: 'snd', n: 'guard' });
                target.blocking = false;
                target.stunTimer = 35;
                target.state = 'stun';
                this.addFloatingText(target.x, target.y - 120, '¡ROMPEGUARDIA (ESPALDA)!', '#ef4444', 16);
            }
        }

        // Escalado de combo (desde el 4.º golpe seguido) y ±8 % por la estadística de fuerza
        if (attacker && !opts.chip) {
            const inStun = target.state === 'hurt' || target.state === 'stun' || target.inJuggle || target.state === 'held';
            target.comboTaken = inStun ? (target.comboTaken || 0) + 1 : 1;
            const n = target.comboTaken;
            const scale = n >= 4 ? Math.max(0.5, 1 - 0.1 * (n - 3)) : 1;
            const atkMult = 1 + ((attacker.archetype.stats.atk || 4) - 4) * 0.05;
            rawDamage = Math.max(1, Math.round(rawDamage * scale * atkMult));
        }

        target.hp = Math.max(0, target.hp - rawDamage);
        target.hitFlash = 6;
        const superArmor = !hazard && target.state === 'super' && !!target.pendingShot;
        if (!superArmor && !opts.chip) {
            target.vx = knockbackX;
            target.vy = knockbackY;
            target.pendingShot = null;
            target.hitBoxActive = false;
            target.grabTarget = null;
            if (target.state === 'held') target.heldBy = null;
            if (target.state !== 'stun') target.state = 'hurt';
            target.stateTimer = 16;
            target.stateMax = 16;
            if (opts.knockdown) target.knockdown = true;
        } else if (superArmor) {
            this.addFloatingText(target.x, target.y - 150, 'ARMADURA', '#e0f2fe', 13);
        }

        // Golpe cuerpo a cuerpo recibido: gira y enfoca (o re-enfoca) al atacante 1,5 s. Los proyectiles NO cambian el objetivo.
        if (attacker && attacker !== target && !opts.projectile && !opts.chip && !superArmor) {
            target.focusedTargetId = attacker.id;
            target.focusTimer = FOCUS_FRAMES;
            if (Math.abs(attacker.x - target.x) > 6) target.facing = attacker.x > target.x ? 1 : -1;
        }

        target.mp = Math.min(target.maxMp, target.mp + (hazard ? 4 : 8));
        if (attacker) {
            attacker.damageDealt += rawDamage;
            attacker.mp = Math.min(attacker.maxMp, attacker.mp + ({ light: 8, medium: 12, heavy: 16 }[kind] || 6));
            attacker.comboCount++;
            attacker.comboTimer = 100;
        }

        // Efectos SOLO visuales: nada congela la partida
        const fxKind = opts.chip ? 'chip' : (hazard ? 'hazard' : kind);
        this.fx({ k: 'shake', v: HIT_SHAKE[fxKind] || 3 });
        if (fxKind === 'super') this.fx({ k: 'kick', v: 0.06 });
        this.fx({ k: 'hit', x: target.x, y: target.y - 60 * target.archetype.build.s, h: fxKind, c: attacker ? attacker.archetype.primary : '#f97316', d: Math.sign(knockbackX) || 1 });
        this.fx({ k: 'snd', n: 'hit', a: attacker ? `${attacker.archetype.id}:${fxKind}` : 'hazard' });

        const combo = attacker && target.comboTaken > 1 ? ` (COMBO x${target.comboTaken})` : '';
        this.addFloatingText(target.x, target.y - 115, `-${rawDamage}${combo}`, hazard ? '#fb923c' : (target.inJuggle ? '#c084fc' : '#facc15'), combo ? 17 : 14);

        if (target.hp <= 0 && target.alive) {
            target.alive = false;
            target.state = 'ko';
            target.vy = -12;
            target.vx = (knockbackX || (Math.random() < 0.5 ? -6 : 6)) * 1.5;
            target.bounced = false;
            target.heldBy = null;
            if (target.grabTarget) {
                const held = this.fighters.find(x => x.id === target.grabTarget);
                if (held && held.state === 'held') { held.state = 'hurt'; held.stateTimer = held.stateMax = 10; held.heldBy = null; }
                target.grabTarget = null;
            }
            if (attacker) attacker.kos++;
            this.fx({ k: 'shake', v: 12 });
            const teamsLeft = new Set(this.fighters.filter(x => x.alive).map(x => x.team));
            if (teamsLeft.size <= 1) this.fx({ k: 'ko', x: target.x, y: target.y - 60 });
            this.fx({ k: 'snd', n: 'ko' });
            this.fx({ k: 'burst', x: target.x, y: target.y - 50, c: '#ef4444', n: 22 });
            this.addFloatingText(target.x, target.y - 130, hazard ? '¡K.O. AMBIENTAL!' : '¡K.O.!', '#ef4444', 26);
        }
        return true;
    }

    updateProjectiles() {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx;
            p.life--;
            p.age = (p.age || 0) + 1;

            if (Math.random() < 0.7) {
                this.particles.push({
                    x: p.x - Math.sign(p.vx) * 10,
                    y: p.y + (Math.random() - 0.5) * p.radius,
                    vx: -p.vx * 0.2,
                    vy: (Math.random() - 0.5) * 1.5,
                    radius: p.isSuper ? 8 : 4,
                    color: p.color,
                    alpha: 0.9,
                    decay: 0.06
                });
            }

            let destroyed = false;
            for (let j = i - 1; j >= 0; j--) {
                const p2 = this.projectiles[j];
                if (p.ownerId === p2.ownerId) continue;
                if (this.teamMode && p.team === p2.team) continue;
                if (Math.hypot(p.x - p2.x, p.y - p2.y) < p.radius + p2.radius) {
                    this.fx({ k: 'snd', n: 'clash' });
                    this.fx({ k: 'shake', v: 10 });
                    this.fx({ k: 'hit', x: (p.x + p2.x) / 2, y: (p.y + p2.y) / 2, h: 'heavy', c: '#ffffff', d: 1 });
                    this.addFloatingText((p.x + p2.x) / 2, p.y - 30, '¡CHOQUE!', '#38bdf8', 15);
                    if (!p.isSuper && p2.isSuper) {
                        destroyed = true;
                    } else if (p.isSuper && !p2.isSuper) {
                        this.projectiles.splice(j, 1);
                        i--;
                    } else {
                        this.projectiles.splice(j, 1);
                        i--;
                        destroyed = true;
                    }
                    break;
                }
            }
            if (destroyed) { this.projectiles.splice(i, 1); continue; }

            const owner = this.fighters.find(f => f.id === p.ownerId);
            for (const target of this.fighters) {
                if (!target.alive || target.id === p.ownerId || target.invuln > 0) continue;
                if (!p.isSuper && target.crouching) continue;   // agacharse esquiva el poder (no el súper)
                if (owner && !this.isEnemy(owner, target)) continue;
                if (p.hitIds && p.hitIds.includes(target.id)) continue;
                if (Math.abs((target.z || 0) - (p.z || 0)) > this.depthTol + 12) continue;
                const dx = Math.abs(target.x - p.x);
                const dy = Math.abs(((target.y - (target.z || 0)) - 54) - (p.y - (p.z || 0)));
                if (dx < p.radius + 22 && dy < p.radius + 45) {
                    if (owner) {
                        this.applyDamage(owner, target, p.damage, Math.sign(p.vx) * (p.isSuper ? 15 : 8), p.isSuper ? -9 : -4.5, { kind: p.isSuper ? 'super' : 'medium', knockdown: p.isSuper, projectile: true });
                    }
                    if (p.hitIds) p.hitIds.push(target.id);
                    if (!p.isSuper) { destroyed = true; break; }
                }
            }

            if (destroyed || p.life <= 0 || p.x < -50 || p.x > this.worldWidth + 50) {
                this.projectiles.splice(i, 1);
            }
        }
    }

    spawnBurst(x, y, color, count = 12) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 2 + Math.random() * 7;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                radius: 3 + Math.random() * 5,
                color,
                alpha: 1,
                decay: 0.03 + Math.random() * 0.03
            });
        }
    }

    spawnHitFx(x, y, kind, color, dir = 1) {
        const crowd = this.fighters.filter(x => x.alive).length > 4 ? 0.55 : 1;
        const n = Math.ceil(({ light: 6, medium: 10, heavy: 14, super: 22, hazard: 9, chip: 4 }[kind] || 6) * crowd);
        for (let i = 0; i < n; i++) {
            const a = (Math.random() - 0.5) * 2.4 + (dir > 0 ? 0 : Math.PI);
            const spd = (kind === 'light' ? 5 : 7) + Math.random() * 8;
            this.particles.push({ type: 'spark', x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, len: 8 + Math.random() * (kind === 'super' ? 22 : 12), color: i % 2 ? '#ffffff' : (kind === 'light' ? '#fde047' : color), alpha: 1, decay: 0.075, radius: 2 });
        }
        if (kind !== 'chip') {
            this.particles.push({ type: 'ring', x, y, vx: 0, vy: 0, r: 6, grow: { light: 3, medium: 4.5, heavy: 6, super: 9, hazard: 5 }[kind] || 4, color: kind === 'super' ? '#ffffff' : color, alpha: 0.9, decay: kind === 'super' ? 0.035 : 0.07, width: kind === 'super' ? 6 : 3, radius: 1 });
        }
        if (kind === 'heavy' || kind === 'super' || kind === 'hazard') {
            this.particles.push({ type: 'ring', x, y, vx: 0, vy: 0, r: 2, grow: kind === 'super' ? 5 : 3, color: '#fde047', alpha: 0.8, decay: 0.05, width: 2, radius: 1 });
            this.spawnBurst(x, y, color, kind === 'super' ? 20 : 8);
        }
    }

    spawnDust(x, y, count = 5) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 24,
                y: y - 4,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2,
                radius: 4 + Math.random() * 4,
                color: this.arena.accentColor,
                alpha: 0.6,
                decay: 0.04
            });
        }
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const pt = this.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            if (pt.type === 'ring') pt.r += pt.grow;
            else if (pt.type === 'spark') { pt.vx *= 0.86; pt.vy *= 0.86; }
            pt.alpha -= pt.decay;
            if (pt.alpha <= 0) this.particles.splice(i, 1);
        }
        const pq = Settings.get('gfx', 'particles');
        const pmax = pq === 'off' ? 0 : (pq === 'low' ? 70 : 350);
        if (this.particles.length > pmax) this.particles.splice(0, this.particles.length - pmax);
    }

    addFloatingText(x, y, text, color = '#fff', size = 15, owner = null) {
        if (this.isHost) this.fx({ k: 'txt', x, y, s: text, c: color, z: size, o: owner });
        else this.pushFloatingText({ x, y, text, color, size, vy: -1.4, life: 55 });
    }

    // Inserta un texto flotante apilándolo hacia arriba si choca con otro reciente (evita que se pisen)
    pushFloatingText(ft) {
        if (!Settings.get('hud', 'dmg') && /^-\d/.test(String(ft.text))) return;   // números de daño desactivados
        const wOf = (t) => Math.max(1, String(t.text).length) * t.size * 0.5;
        for (let pass = 0; pass < 5; pass++) {
            const clash = this.floatingTexts.find(o =>
                Math.abs(o.x - ft.x) < (wOf(o) + wOf(ft)) / 2 && Math.abs(o.y - ft.y) < Math.max(o.size, ft.size) * 1.1);
            if (!clash) break;
            ft.y = clash.y - Math.max(clash.size, ft.size) * 1.15;
        }
        this.floatingTexts.push(ft);
        if (this.floatingTexts.length > 24) this.floatingTexts.shift();
    }

    updateFloatingTexts() {
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const ft = this.floatingTexts[i];
            ft.y += ft.vy;
            ft.life--;
            if (ft.life <= 0) this.floatingTexts.splice(i, 1);
        }
    }

    // =====================================================================
    // EVENTOS DE EFECTOS (el host los ejecuta y los reenvía a los clientes)
    // =====================================================================
    fx(ev) {
        if (this.isHost) this.evQueue.push(ev);
        this.playEvent(ev);
    }

    playEvent(e) {
        switch (e.k) {
            case 'txt':
                if (!this.isHost && e.o && e.o === this.localUserId) return;
                this.pushFloatingText({ x: e.x, y: e.y, text: e.s, color: e.c, size: e.z, vy: -1.4, life: 55 });
                break;
            case 'hit': this.spawnHitFx(e.x, e.y, e.h, e.c, e.d); break;
            case 'burst': this.spawnBurst(e.x, e.y, e.c, e.n); break;
            case 'snd': sfx.named(e.n, e.a); break;
            case 'shake': this.camera.shake = Math.max(this.camera.shake, e.v); break;
            case 'stop': break;
            case 'kick': this.camera.kick = Math.max(this.camera.kick, e.v); break;
            case 'ko':
                this.camera.focus = { x: e.x, y: e.y, frames: 45 };
                break;
            case 'boom':
                this.spawnHitFx(e.x, e.y - 20, 'super', '#f97316', 1);
                this.spawnBurst(e.x, e.y - 10, '#fde047', 16);
                this.spawnDust(e.x, e.y, 12);
                this.camera.shake = Math.max(this.camera.shake, 12);
                sfx.named('boom');
                break;
        }
    }

    playStateSound(f, st) {
        const id = f.archetype.id;
        const md = MOVE_DATA[st];
        if (md && (md.rank || st === 'grab')) sfx.charSwing(id, st);
        else if (st === 'special') sfx.charCharge(id);
        else if (st === 'super') sfx.sfxSuper();
        else if (st === 'roll') sfx.named('roll');
    }

    // =====================================================================
    // PELIGROS DE ARENA
    // =====================================================================
    initArenaHazards() {
        this.hazards = [];
        this.arenaState = { tremorId: 0 };
        this.gravityScale = 1;
        this.windForce = 0;
        this.cycle = null;
        this.tremorTimer = 8;
        this.lastEruption = 0;
        this.platforms.forEach(p => { p.dx = 0; p.dy = 0; });
        if (this.arena.id === 'cyber') {
            const amp = [[60, 0], [0, 40], [0, 40], [60, 0], [110, 0]];
            this.platforms.forEach((p, i) => {
                p.bx = p.x; p.by = p.y;
                p.ax = (amp[i] || [0, 0])[0]; p.ay = (amp[i] || [0, 0])[1];
                p.ph = i * 1.3;
            });
        }
    }

    arenaCycle() {
        const t = this.time, id = this.arena.id;
        const c = { beam: 'off', acid: null, wind: 0, lowGrav: false };
        if (id === 'lab') { const m = t % 13; c.beam = m < 8 ? 'off' : (m < 10 ? 'warn' : 'on'); }
        if (id === 'toxic') {
            const k = Math.floor(t / 12), m = t % 12;
            if (m >= 6.5) {
                const w = 420;
                const r = mulberry32(k * 7919 + 3)();
                c.acid = { x: 80 + r * (this.worldWidth - 160 - w), w, on: m >= 8 };
            }
        }
        if (id === 'emerald') { const k = Math.floor(t / 10), m = t % 10; if (m >= 7) c.wind = k % 2 ? 1 : -1; }
        if (id === 'eclipse') c.lowGrav = (t % 16) >= 10;
        return c;
    }

    updateHazards(dt) {
        const id = this.arena.id;
        const c = this.arenaCycle();
        const prev = this.cycle || c;
        this.cycle = c;

        if (id === 'cyber') {
            for (const p of this.platforms) {
                const nx = p.bx + Math.sin(this.time * 0.55 + p.ph) * p.ax;
                const ny = p.by + Math.sin(this.time * 0.7 + p.ph) * p.ay;
                p.dx = nx - p.x; p.dy = ny - p.y;
                p.x = nx; p.y = ny;
            }
        }
        this.gravityScale = c.lowGrav ? 0.55 : 1;
        this.windForce = c.wind * 2.1;

        const say = (txt, col) => this.floatingTexts.push({ x: this.camera.x, y: this.camera.y - 200, text: txt, color: col, size: 24, vy: -0.5, life: 95 });
        if (c.beam === 'warn' && prev.beam === 'off') { say('⚠ REACTOR CARGANDO', '#38bdf8'); sfx.charCharge('cyborg'); }
        if (c.beam === 'on' && prev.beam === 'warn') { say('¡HAZ CUÁNTICO!', '#67e8f9'); sfx.named('zap'); this.camera.shake = Math.max(this.camera.shake, 8); }
        if (c.acid && !prev.acid) say('⚠ LLUVIA ÁCIDA', '#a3e635');
        if (c.acid && c.acid.on && !(prev.acid && prev.acid.on)) sfx.named('acid');
        if (c.wind && !prev.wind) { say(c.wind > 0 ? '¡RÁFAGA →!' : '¡← RÁFAGA!', '#6ee7b7'); sfx.named('wind'); }
        if (c.lowGrav && !prev.lowGrav) { say('¡GRAVEDAD LUNAR!', '#c084fc'); sfx.named('dark'); }
        if (c.wind) {
            for (let i = 0; i < 2; i++) {
                this.ambient.push({ k: 'leaf', x: c.wind > 0 ? -300 : this.worldWidth + 300, y: 80 + Math.random() * 520, vx: c.wind * (9 + Math.random() * 5), vy: (Math.random() - 0.5) * 1.2, r: 5, ph: Math.random() * 6, life: 320 });
            }
        }

        // Meteoros y rocas (todos los avanzan; solo el host decide el impacto)
        for (let i = this.hazards.length - 1; i >= 0; i--) {
            const h = this.hazards[i];
            h.age = (h.age || 0) + 1;
            if (h.delay > 0) { h.delay--; continue; }
            h.vy = (h.vy || 0) + 0.35;
            h.y += h.vy;
            h.x += h.vx || 0;
            if (Math.random() < 0.6) this.particles.push({ x: h.x, y: h.y - 10, vx: (Math.random() - 0.5), vy: -1, radius: 4 + Math.random() * 4, color: h.type === 'meteor' ? '#f97316' : '#a8a29e', alpha: 0.8, decay: 0.05 });
            if (this.isHost) {
                let hit = h.y >= this.groundY - 4;
                if (!hit) {
                    for (const f of this.fighters) {
                        if (f.alive && f.invuln === 0 && Math.abs(f.x - h.x) < h.r + 18 && h.y > f.y - 120 * f.archetype.build.s && h.y < f.y) { hit = true; break; }
                    }
                }
                if (hit) { this.explodeHazard(h); this.hazards.splice(i, 1); }
            } else if (h.y >= this.groundY + 20) {
                this.hazards.splice(i, 1);
            }
        }

        if (!this.isHost || this.matchState !== 'fighting') return;

        if (id === 'volcano') {
            const k = Math.floor(this.time / 7);
            if (k !== this.lastEruption) {
                this.lastEruption = k;
                if (k % 2 === 1) this.spawnMeteors('meteor', 5);
            }
        }
        if (id === 'seismic') {
            this.tremorTimer -= dt;
            if (this.tremorTimer <= 0) {
                this.tremorTimer = 8 + Math.random() * 5;
                this.doTremor();
            }
        }

        for (const f of this.fighters) {
            if (!f.alive || f.invuln > 0 || f.state === 'held' || f.hazardCd > 0) continue;
            if (c.beam === 'on' && Math.abs(f.x - 875) < 44) {
                f.hazardCd = 6;
                this.applyDamage(null, f, 14, (f.x < 875 ? -1 : 1) * 7, -5, { kind: 'hazard' });
            } else if (c.acid && c.acid.on && f.x > c.acid.x && f.x < c.acid.x + c.acid.w) {
                f.hazardCd = 10;
                this.applyDamage(null, f, 7, 0, 0, { kind: 'hazard', chip: true });
            }
        }
    }

    spawnMeteors(type, n) {
        for (let i = 0; i < n; i++) {
            this.hazards.push({
                id: Math.random().toString(36).slice(2), type,
                x: 90 + Math.random() * (this.worldWidth - 180),
                y: -380 - Math.random() * 200,
                vx: (Math.random() - 0.5) * 1.5, vy: 2,
                r: type === 'meteor' ? 22 : 16,
                delay: i * 14, age: 0
            });
        }
        this.addFloatingText(this.camera.x, this.camera.y - 170, type === 'meteor' ? '¡LLUVIA DE METEOROS!' : '¡DESPRENDIMIENTO!', type === 'meteor' ? '#f97316' : '#d97706', 22);
        this.fx({ k: 'snd', n: 'meteor' });
    }

    explodeHazard(h) {
        const y = Math.min(h.y, this.groundY);
        this.fx({ k: 'boom', x: h.x, y });
        for (const f of this.fighters) {
            if (!f.alive || f.invuln > 0) continue;
            if (Math.abs(f.x - h.x) < 85 && Math.abs((f.y - 50) - y) < 115) {
                this.applyDamage(null, f, h.type === 'meteor' ? 75 : 55, (Math.sign(f.x - h.x) || 1) * 9, -10, { kind: 'hazard', knockdown: true });
            }
        }
    }

    doTremor() {
        this.arenaState.tremorId++;
        this.tremorFx();
        for (const f of this.fighters) {
            if (!f.alive || f.invuln > 0 || !f.onGround || f.y < this.groundY - 1) continue;
            this.applyDamage(null, f, 30, 0, -6, { kind: 'hazard' });
            f.stunTimer = Math.max(f.stunTimer, 16);
        }
        this.addFloatingText(this.camera.x, this.camera.y - 200, '¡TEMBLOR! ¡SUBE A LAS PLATAFORMAS!', '#d97706', 20);
        this.spawnMeteors('rock', 4);
    }

    tremorFx() {
        this.camera.shake = Math.max(this.camera.shake, 12);
        sfx.named('tremor');
        for (let i = 0; i < 40; i++) {
            this.ambient.push({ k: 'dust', x: -300 + Math.random() * (this.worldWidth + 600), y: -220 - Math.random() * 200, vx: (Math.random() - 0.5) * 0.6, vy: 2 + Math.random() * 3, r: 2 + Math.random() * 3, ph: 0, life: 600 });
        }
    }

    updateArenaEvents() { }

    drawHazards(ctx, layer) {
        const c = this.cycle || {};
        const gy = this.groundY, t = this.time, W = this.worldWidth;
        if (layer === 'back') {
            for (const h of this.hazards) {
                const k = clamp01(1 - (gy - h.y) / 700);
                ctx.save();
                ctx.globalAlpha = 0.3 + 0.45 * k * (0.6 + 0.4 * Math.sin(t * 20));
                ctx.fillStyle = h.type === 'meteor' ? '#ef4444' : '#f59e0b';
                ctx.beginPath(); ctx.ellipse(h.x, gy + 2, 30 + 45 * k, 7 + 5 * k, 0, 0, TAU); ctx.fill();
                ctx.restore();
            }
            if (c.acid) {
                const { x, w, on } = c.acid;
                ctx.save();
                if (!on) {
                    ctx.globalAlpha = 0.3 + 0.25 * Math.sin(t * 14);
                    ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]);
                    ctx.strokeRect(x, -300, w, gy + 300); ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(163,230,53,0.08)'; ctx.fillRect(x, -300, w, gy + 300);
                } else {
                    const g = ctx.createLinearGradient(0, -300, 0, gy);
                    g.addColorStop(0, 'rgba(163,230,53,0.12)'); g.addColorStop(1, 'rgba(163,230,53,0.42)');
                    ctx.strokeStyle = 'rgba(190,242,100,0.6)'; ctx.lineWidth = 2; ln(ctx, x, -300, x, gy); ln(ctx, x + w, -300, x + w, gy);
                    ctx.fillStyle = g; ctx.fillRect(x, -300, w, gy + 300);
                    softGlow(ctx, x + w / 2, gy, w * 0.6, 'rgba(163,230,53,0.45)');
                }
                ctx.restore();
            }
            if (c.beam === 'warn') {
                ctx.save();
                ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 30);
                ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ln(ctx, 875, -500, 875, gy);
                ctx.strokeStyle = 'rgba(103,232,249,0.55)'; ctx.setLineDash([10, 8]); ctx.strokeRect(831, -500, 88, gy + 500); ctx.setLineDash([]);
                ctx.restore();
            }
            return;
        }
        if (c.beam === 'on') {
            const bw = 46 + Math.sin(t * 40) * 4;
            const g = ctx.createLinearGradient(875 - bw, 0, 875 + bw, 0);
            g.addColorStop(0, 'rgba(34,211,238,0)'); g.addColorStop(0.3, 'rgba(34,211,238,0.55)'); g.addColorStop(0.5, 'rgba(240,253,255,0.95)'); g.addColorStop(0.7, 'rgba(34,211,238,0.55)'); g.addColorStop(1, 'rgba(34,211,238,0)');
            ctx.fillStyle = g; ctx.fillRect(875 - bw, -600, bw * 2, gy + 600);
            softGlow(ctx, 875, gy, 90, 'rgba(103,232,249,0.6)');
            if (Math.random() < 0.6) this.particles.push({ type: 'spark', x: 875 + (Math.random() - 0.5) * 60, y: gy - 4, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 8, len: 10, color: '#a5f3fc', alpha: 1, decay: 0.08, radius: 2 });
        }
        if (c.acid && c.acid.on) {
            ctx.save();
            ctx.strokeStyle = 'rgba(190,242,100,0.75)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            for (let i = 0; i < 46; i++) {
                const xx = c.acid.x + ((i * 53.7) % c.acid.w);
                const yy = ((((t * 720 + i * 97) % (gy + 320)) + (gy + 320)) % (gy + 320)) - 320;
                ln(ctx, xx, yy, xx - 3, yy + 18);
            }
            ctx.fillStyle = 'rgba(217,249,157,0.7)';
            for (let i = 0; i < 10; i++) circ(ctx, c.acid.x + ((i * 47 + t * 90) % c.acid.w), gy - 2, 2 + (i % 3));
            ctx.restore();
        }
        for (const h of this.hazards) {
            if (h.delay > 0) continue;
            ctx.save(); ctx.translate(h.x, h.y);
            if (h.type === 'meteor') {
                softGlow(ctx, 0, 0, h.r * 2.6, 'rgba(249,115,22,0.55)');
                const cols = ['#b91c1c', '#f97316', '#fde047'];
                for (let i = 0; i < 3; i++) FighterArt.flameTongue(ctx, 0, 0, h.r * (2.8 - i * 0.6) + Math.sin(t * 30 + i) * 4, h.r * (0.8 - i * 0.2), -Math.PI / 2 - (h.vx || 0) * 0.05, cols[i]);
            }
            ctx.rotate(h.age * 0.1);
            const pts = [1, 0.82, 1.05, 0.9, 1.1, 0.78, 0.98, 0.88];
            ctx.fillStyle = FighterArt.OUT;
            ctx.beginPath(); pts.forEach((f, i) => { const a = i / pts.length * TAU; const x = Math.cos(a) * h.r * f * 1.12, y = Math.sin(a) * h.r * f * 1.12; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill();
            ctx.fillStyle = h.type === 'meteor' ? '#44403c' : '#78716c';
            ctx.beginPath(); pts.forEach((f, i) => { const a = i / pts.length * TAU; const x = Math.cos(a) * h.r * f, y = Math.sin(a) * h.r * f; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = h.type === 'meteor' ? '#fb923c' : '#a8a29e'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-h.r * 0.5, 0); ctx.lineTo(0, -h.r * 0.2); ctx.lineTo(h.r * 0.4, h.r * 0.3); ctx.stroke();
            ctx.restore();
        }
        if (this.windForce) {
            const dir = Math.sign(this.windForce);
            ctx.save(); ctx.strokeStyle = 'rgba(236,253,245,0.38)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
            const span = W + 900;
            for (let i = 0; i < 28; i++) {
                const yy = ((i * 41) % 720) - 80;
                const raw = t * 950 * dir + i * 137;
                const xx = (((raw % span) + span) % span) - 450;
                ln(ctx, xx, yy, xx - dir * 130, yy);
            }
            ctx.restore();
        }
        if (this.gravityScale < 1) {
            ctx.fillStyle = 'rgba(147,51,234,0.10)';
            ctx.fillRect(-2600, -2200, W + 5200, 4400);
        }
    }

    // =====================================================================
    // CÁMARA, MÚSICA, VICTORIA Y RESULTADOS
    // =====================================================================
    updateCamera() {
        const alive = this.fighters.filter(f => f.alive);
        const targets = alive.length > 0 ? alive : this.fighters;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const f of targets) {
            minX = Math.min(minX, f.x - 140);
            maxX = Math.max(maxX, f.x + 140);
            minY = Math.min(minY, f.y - 180);
            maxY = Math.max(maxY, f.y + 70);
        }
        let centerX = (minX + maxX) / 2;
        let centerY = (minY + maxY) / 2;
        const viewW = this.canvas.width;
        // Con controles táctiles en pantalla, sube la acción para que no quede tapada
        const tOff = document.body.classList.contains('touch-on') ? (this.canvas.height * 0.13) / Math.max(0.3, this.camera.zoom) : 0;
        centerY += tOff;
        const spanX = Math.max(680, maxX - minX);
        // Nunca alejar más de lo que mide la arena
        const minZoom = viewW / (this.worldWidth + 40);
        const viewH = this.canvas.height;
        const spanY = Math.max(320, maxY - minY) + 70;
        let targetZoom = Math.max(minZoom, Math.max(0.5, Math.min(1.08, viewW / spanX, viewH / spanY)));

        const fc = this.camera.focus;
        if (fc && fc.frames > 0) {
            fc.frames--;
            centerX = lerp(centerX, fc.x, 0.5);
            centerY = lerp(centerY, fc.y, 0.5);
            targetZoom = Math.min(1.35, targetZoom * 1.2);
        }

        this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
        // Limitar a los bordes: lo que se ve nunca sale de la arena
        const halfW = viewW / 2 / this.camera.zoom;
        const lo = halfW - 20, hi = this.worldWidth + 20 - halfW;
        const tx = lo > hi ? this.worldWidth / 2 : Math.max(lo, Math.min(hi, centerX));
        const maxCamY = this.groundY + 150 + tOff - (this.canvas.height / 2) / Math.max(0.3, this.camera.zoom);
        this.camera.x += (tx - this.camera.x) * 0.1;
        this.camera.x = lo > hi ? this.camera.x : Math.max(lo, Math.min(hi, this.camera.x));
        this.camera.y += (Math.min(centerY, maxCamY) - this.camera.y) * 0.1;
        if (this.camera.shake > 0) this.camera.shake *= 0.78;
        if (this.camera.shake > 14) this.camera.shake = 14;
    }

    updateMusicIntensity() {
        if (this.tense || this.matchState !== 'fighting') return;
        const alive = this.fighters.filter(f => f.alive);
        const teams = new Set(alive.map(f => f.team));
        const finale = this.teamMode ? (teams.size === 2 && alive.length <= 3) : (alive.length === 2 && this.fighters.length > 2);
        const lowTime = this.timerMode !== 'infinite' && this.timer <= 15;
        if (finale || lowTime) {
            this.tense = true;
            sfx.setIntensity(1);
            this.floatingTexts.push({ x: this.camera.x, y: this.camera.y - 220, text: lowTime && !finale ? '¡ÚLTIMOS SEGUNDOS!' : (alive.length === 2 ? '¡DUELO FINAL!' : '¡ÚLTIMOS EN PIE!'), color: '#f43f5e', size: 26, vy: -0.5, life: 100 });
        }
    }

    checkWinCondition() {
        if (this.matchState !== 'fighting') return;
        const alive = this.fighters.filter(f => f.alive);
        const teamsAlive = new Set(alive.map(f => f.team));
        if (teamsAlive.size > 1) return;
        this.matchState = 'ended';
        if (this.teamMode) {
            const team = alive.length ? alive[0].team : this.fighters[0].team;
            this.showBanner(`¡GANA EQUIPO ${TEAM_COLORS[team].name}!`, 1800);
            setTimeout(() => this.openResultsModal({ team }), 1900);
        } else {
            const winner = alive[0] || this.fighters[0];
            this.showBanner(`¡${winner.name} GANA!`, 1800);
            setTimeout(() => this.openResultsModal({ fighter: winner }), 1900);
        }
    }

    endMatchByTimeout() {
        if (this.matchState !== 'fighting') return;
        this.matchState = 'ended';
        this.showBanner('¡TIEMPO AGOTADO!', 1600);
        if (this.teamMode) {
            const totals = {};
            this.fighters.forEach(f => { totals[f.team] = (totals[f.team] || 0) + (f.alive ? f.hp : 0); });
            const team = Number(Object.keys(totals).sort((a, b) => totals[b] - totals[a])[0]);
            setTimeout(() => this.openResultsModal({ team }), 1700);
        } else {
            const winner = [...this.fighters].sort((a, b) => b.hp - a.hp)[0];
            setTimeout(() => this.openResultsModal({ fighter: winner }), 1700);
        }
    }

    openResultsModal(res) {
        this.running = false;
        sfx.stopAmbientSound();
        const teamWin = res.team !== undefined;
        const title = document.getElementById('winner-title');
        title.textContent = teamWin ? `🏆 ¡GANA EQUIPO ${TEAM_COLORS[res.team].name}!` : `🏆 ¡GANADOR: ${res.fighter ? res.fighter.name : '---'}!`;
        const sorted = [...this.fighters].sort((a, b) => {
            if (teamWin && (a.team === res.team) !== (b.team === res.team)) return a.team === res.team ? -1 : 1;
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            if (b.kos !== a.kos) return b.kos - a.kos;
            return b.damageDealt - a.damageDealt;
        });

        const board = document.getElementById('results-leaderboard');
        board.innerHTML = '';
        sorted.forEach((f, idx) => {
            const isWinner = teamWin ? f.team === res.team : idx === 0;
            const chip = this.teamMode ? `<span class="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background:${TEAM_COLORS[f.team].c}"></span>` : '';
            const row = document.createElement('div');
            row.className = `grid grid-cols-12 px-3 py-2.5 text-xs sm:text-sm items-center ${isWinner ? 'bg-yellow-500/10 font-bold text-yellow-300' : 'text-slate-200'}`;
            row.innerHTML = `
                <div class="col-span-1 font-arcade text-xs">${idx + 1}</div>
                <div class="col-span-5 flex items-center gap-2 truncate">
                    ${chip}
                    <span>${f.archetype.icon}</span>
                    <span class="truncate">${escapeHtml(f.name)}</span>
                </div>
                <div class="col-span-3 text-center font-bold text-red-400">${f.kos} K.O.</div>
                <div class="col-span-3 text-right font-bold text-sky-400">${f.damageDealt} DMG</div>
            `;
            board.appendChild(row);
        });
        document.getElementById('screen-results').classList.remove('hidden');
    }

    // =====================================================================
    // RED: SNAPSHOT DEL HOST Y APLICACIÓN SUAVIZADA EN EL CLIENTE
    // =====================================================================
    broadcastSnapshot() {
        const r1 = v => Math.round(v * 10) / 10;
        net.broadcastCombatSnapshot({
            timer: this.timer,
            t: r1(this.time * 10) / 10,
            as: this.arenaState,
            hz: this.hazards.map(h => ({ id: h.id, type: h.type, x: r1(h.x), y: r1(h.y), vx: h.vx, vy: h.vy, r: h.r, delay: h.delay, age: h.age })),
            fighters: this.fighters.map(f => ({
                id: f.id, x: r1(f.x), y: r1(f.y), vx: r1(f.vx), vy: r1(f.vy),
                facing: f.facing, hp: f.hp, mp: Math.round(f.mp), alive: f.alive,
                inJuggle: f.inJuggle, stunTimer: f.stunTimer,
                state: f.state, stateTimer: f.stateTimer, stateMax: f.stateMax, hitFlash: f.hitFlash,
                onGround: f.onGround, blocking: f.blocking, crouching: f.crouching,
                kos: f.kos, damageDealt: f.damageDealt, team: f.team,
                invuln: f.invuln, heldBy: f.heldBy, rollDir: f.rollDir,
                blockStun: f.blockStun, guardShow: f.guardShow, airDir: f.airDir,
                focusedTargetId: f.focusedTargetId, focusTimer: f.focusTimer
            })),
            projectiles: this.projectiles.map(p => ({ id: p.id, ownerId: p.ownerId, team: p.team, kind: p.kind, x: r1(p.x), y: r1(p.y), vx: p.vx, radius: p.radius, isSuper: p.isSuper, color: p.color, life: p.life, age: p.age })),
            ev: this.evQueue.splice(0)
        });
    }

    applyRemoteSnapshot(payload) {
        if (this.isHost || !payload) return;
        this.timer = payload.timer;
        if (payload.t !== undefined) {
            const d = payload.t - this.time;
            if (Math.abs(d) > 0.3) this.time = payload.t; else this.time += d * 0.2;
        }
        if (payload.as) {
            if (payload.as.tremorId !== this.arenaState.tremorId) this.tremorFx();
            this.arenaState = payload.as;
        }
        if (payload.hz) this.hazards = payload.hz;

        if (payload.fighters) {
            payload.fighters.forEach(rf => {
                const f = this.fighters.find(x => x.id === rf.id);
                if (!f) return;
                const isLocal = f.id === this.localUserId;
                const prevState = f.state;
                if (rf.state === 'super' && f.state !== 'super' && (!this.superFlash || this.superFlash.ref !== f)) this.startSuperFlash(f);

                f.net = { x: rf.x + (isLocal ? rf.vx * 4 : 0), y: rf.y, vx: rf.vx, vy: rf.vy, onGround: rf.onGround, age: 0 };
                f.hp = rf.hp; f.mp = rf.mp; f.alive = rf.alive; f.kos = rf.kos; f.damageDealt = rf.damageDealt;
                f.team = rf.team; f.invuln = rf.invuln; f.stunTimer = rf.stunTimer; f.inJuggle = rf.inJuggle; f.heldBy = rf.heldBy;
                f.blockStun = rf.blockStun || 0; f.airDir = rf.airDir;
                f.focusedTargetId = rf.focusedTargetId != null ? rf.focusedTargetId : null; f.focusTimer = rf.focusTimer || 0;
                if (f.blockStun > 0 || !isLocal) { f.blocking = rf.blocking; f.crouching = rf.crouching; f.guardShow = rf.guardShow; }

                const forced = CLIENT_FORCED.has(rf.state) || !rf.alive;
                if (!isLocal || forced || CLIENT_FORCED.has(f.state)) {
                    f.state = rf.state; f.stateTimer = rf.stateTimer; f.stateMax = rf.stateMax;
                    f.facing = rf.facing; f.onGround = rf.onGround; f.blocking = rf.blocking; f.crouching = rf.crouching;
                    f.vx = rf.vx; f.vy = rf.vy; f.rollDir = rf.rollDir;
                    f.hitFlash = Math.max(f.hitFlash, rf.hitFlash);
                }
                if (!isLocal && rf.state !== prevState) this.playStateSound(f, rf.state);
            });
        }

        if (payload.projectiles) {
            const map = new Map(this.projectiles.map(p => [p.id, p]));
            this.projectiles = payload.projectiles.map(sp => {
                const lp = map.get(sp.id);
                if (lp) { lp.netX = sp.x; lp.y = sp.y; lp.life = sp.life; return lp; }
                sfx.charSpecial(sp.kind, sp.isSuper);
                return { ...sp, netX: sp.x };
            });
        }

        if (payload.ev) payload.ev.forEach(e => this.playEvent(e));
    }

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
