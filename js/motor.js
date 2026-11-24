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
        this.dm = this.mode === 'dm';                       // Combate a muerte: todos reviven, gana quien más KO tenga al acabar el tiempo
        this.teamMode = this.mode !== 'ffa' && !this.dm;
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
        this.zones = [];
        this.particles = [];
        this.floatingTexts = [];
        this.keys = {};
        this.remoteInputs = {};
        this.gamepadConnected = false;
        this.gamepadIndex = null;

        this.camera = { x: this.worldWidth / 2, y: this.worldHeight / 2, zoom: 1, shake: 0, kick: 0, focus: null };
        this.hitStopFrames = 0;
        this.timer = this.dm ? (parseInt(this.timerMode, 10) > 99 ? parseInt(this.timerMode, 10) : 300) : (this.timerMode === 'infinite' ? 999 : 99);
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
                deaths: 0,
                respawnT: 0,         // cuadros que faltan para reaparecer (Combate a muerte)
                rs: 0,               // contador de reapariciones (para que el cliente sepa que hubo teletransporte)
                lastHitBy: null,
                lastHitAt: -99,
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
        document.getElementById('hud-arena-name').textContent = `${this.arena.icon} ${this.arena.name.toUpperCase()}${(this.teamMode || this.dm) ? ' • ' + MODE_LABELS[this.mode] : ''}`;
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
                    <span class="hud-ping" id="hud-ping-${f.id}"></span>
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
        if (this.dm) {
            const lead = this.dmLeader();
            this.fighters.forEach(f => {
                const nm = document.querySelector(`#hud-card-${f.id} .hud-name`);
                if (nm) { const want = (lead && lead.id === f.id) ? '👑 ' : ''; if (nm.dataset.crown !== want) { nm.dataset.crown = want; nm.textContent = want + f.archetype.icon + ' ' + f.name; } }
            });
            document.getElementById('hud-alive-count').textContent = lead ? `👑 ${lead.name}: ${lead.kos} KO` : 'SIN KO AÚN';
            const t = Math.max(0, Math.ceil(this.timer));
            document.getElementById('hud-timer').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
            return;
        }
        document.getElementById('hud-alive-count').textContent = `VIVOS: ${aliveCount}/${this.fighters.length}`;
        document.getElementById('hud-timer').textContent = this.timerMode === 'infinite' ? '∞' : String(Math.ceil(this.timer)).padStart(2, '0');
    }

    bindInputs() {
        this._onKeyDown = (e) => {
            if (activeRebindType) return;
            // Pausa: Esc siempre, y la tecla que el jugador haya elegido en Controles (P por defecto)
            if (e.code === 'Escape' || CtrlProfiles.pause().kb.includes(e.code)) {
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
        const hint = document.getElementById('pause-hint');
        if (hint) {
            const pc = CtrlProfiles.pause();
            const kb = pc.kb.map(k => k.replace('Key', '').replace('Digit', '')).join('/');
            const gp = pc.gp >= 0 ? (GAMEPAD_BUTTON_NAMES[pc.gp] || 'Botón ' + pc.gp) : '';
            hint.textContent = ['Esc', kb, gp ? gp + ' (mando)' : ''].filter(Boolean).join(' · ') + ' para pausar / reanudar';
        }
        const hudBtn = document.getElementById('btn-hud-pause');
        if (hudBtn) hudBtn.textContent = flag ? '▶' : '⏸';
        try { if (sfx.ctx) { if (flag) sfx.ctx.suspend(); else sfx.ctx.resume(); } } catch (e) { /* ignorar */ }
        if (this.isHost && !remote) net.broadcastPause(flag);
    }

    pollPauseInput() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pauseBtn = CtrlProfiles.pause().gp;   // botón elegido en Controles (Start por defecto); -1 = sin asignar
        let down = false;
        if (pauseBtn >= 0) for (const p of pads) if (p && p.connected && p.buttons[pauseBtn] && p.buttons[pauseBtn].pressed) down = true;
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
        this.showBanner((this.teamMode || this.dm) ? `${MODE_LABELS[this.mode]} • ${this.arena.name.toUpperCase()}` : `ROUND 1 • ${this.arena.name.toUpperCase()}`, 1100);
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
        // Sin otros humanos conectados (offline, Práctica, Historia): al salir de la pestaña o apagar la pantalla
        // la partida se pausa sola. Con jugadores online no se pausa para no congelar a los demás.
        const soloLocal = () => !(this.fighters || []).some(f => !f.isBot && f.id !== this.localUserId && !String(f.id).startsWith('enemy_'));
        this._onVisibility = () => {
            if (document.hidden && this.running && !this.paused && soloLocal() && this.canPause()) { this.setPaused(true); return; }
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
                cmd.atk = this.resolveButtons(f, B, { fwd: !!fwd, charged, down: !!raw.down || (ib.fr - ib.lastDown <= COMBO_DOWN_GRACE && !cmd.drop) });
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
            const nk = Combos.next(bot, isHardcore ? 0.97 : (isEasy ? 0.5 : 0.88));
            if (nk) {
                cmd.atk = nk; cmd.aim = dir;
                if ((bot.cseq || []).length + 1 >= bot.aiPlan.seq.length) { bot.aiChained = true; bot.aiPlan = null; }
                return cmd;
            }
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
                const plan = Combos.pick(bot, isHardcore ? 0.6 : (isEasy ? 0.05 : 0.35));
                if (plan) { bot.aiPlan = plan; d = plan.seq[0]; }
                else if (isHardcore && roll < 0.3) d = 'launcher';
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
        if (this.dm && this.isHost) this.updateRespawns();

        this.updateParticles();
        this.updateFloatingTexts();
        this.updateAmbient();
        this.updateCamera();
        this.updateHUD();
        this.updateMusicIntensity();
        this.checkWinCondition();

        if (this.isHost) {
            this.syncAccum += dt;
            if (this.syncAccum >= this.snapEvery()) {
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
                if (f.id === this.localUserId || String(f.id).startsWith('enemy_')) continue;
                const sl = this.room.slots.find(s => s.id === f.id);
                if (!f.isBot && (!sl || sl.away)) {
                    f.isBot = true;
                    f.awayBot = !!sl;   // sigue en la sala: puede volver y recuperar su luchador
                    if (f.ib) f.ib.pend = null;
                } else if (f.isBot && f.awayBot && sl && !sl.away) {
                    f.isBot = false; f.awayBot = false;
                }
            }
        }
        for (const f of list) {
            this.tickFighterTimers(f);
            if (!f.alive) { this.updateDeadBody(f); continue; }
            let cmd;
            if (this.matchState !== 'fighting') cmd = this.emptyInput();
            else if (f.id === this.localUserId) cmd = this.interpretInput(f, this.getLocalInputMap());
            else if (f.isBot) { cmd = this.computeBotInput(f); SuperMoves.botHint(this, f, cmd); }
            else cmd = this.interpretInput(f, this.remoteInputs[f.id]);
            this.processFighterLogic(f, cmd);
        }
        this.updateProjectiles();
        SuperMoves.update(this);
        this.pushHist();
    }

    updateClient() {
        SuperMoves.tickClient(this);
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
                this.interpNet(f);
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

    netNow() { return performance.now(); }

    // Interpolación entre snapshots con un pequeño colchón: movimiento fluido de los rivales aunque lleguen a ráfagas
    interpNet(f) {
        const nb = f.nb;
        if (this.interpOff) { this.lerpToNet(f, 0.35, true); return; }
        if (!nb || nb.length < 2) { this.lerpToNet(f, 0.35, true); return; }
        const T = this.netNow() - NET_INTERP_MS;
        let tx, ty, k = 0.6;
        const last = nb[nb.length - 1];
        if (T >= last.t) { tx = last.x; ty = last.y; k = 0.35; }
        else if (T <= nb[0].t) { tx = nb[0].x; ty = nb[0].y; k = 0.35; }
        else {
            for (let i = 0; i < nb.length - 1; i++) {
                const a = nb[i], b = nb[i + 1];
                if (T >= a.t && T <= b.t) { const r = (T - a.t) / Math.max(1, b.t - a.t); tx = a.x + (b.x - a.x) * r; ty = a.y + (b.y - a.y) * r; break; }
            }
        }
        if (tx === undefined) { tx = last.x; ty = last.y; }
        if (Math.abs(tx - f.x) > 220 || Math.abs(ty - f.y) > 220) { f.x = tx; f.y = ty; return; }
        f.x += (tx - f.x) * k;
        f.y += (ty - f.y) * k;
    }

    // Historial de posiciones del anfitrión (20 cuadros) para compensar el lag de los golpes de invitados
    pushHist() {
        const h = this.hist || (this.hist = []);
        const m = {};
        for (const f of this.fighters) m[f.id] = { x: f.x, y: f.y };
        h.push(m);
        if (h.length > 20) h.shift();
    }
    histPos(id, back) {
        const h = this.hist;
        if (!h || !back) return null;
        const e = h[Math.max(0, h.length - 1 - back)];
        return e ? e[id] : null;
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
                    if (this.isHost) { if (f.state === 'super' && SuperMoves.has(f)) SuperMoves.spawn(this, f); else this.spawnProjectile(f, f.state === 'super'); }
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

        Combos.run(this, f, cmd, canAct);

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
        let chained = false, comboLink = false;
        const cur = MOVE_DATA[f.state];
        if (!allowed && cur && cur.rank && f.stunTimer === 0 && f.blockStun === 0) {
            // Cadenas: solo de menor a mayor y solo si el golpe tocó al rival
            const el = (f.stateMax || cur.dur) - f.stateTimer;
            const contact = f.hasHitThisSwing || (!this.isHost && this.enemyInReach(f, cur.reach + 25));
            if (contact && el >= cur.active[0] && !!cur.air === !!(nxt && nxt.air)) {
                if (nxt && nxt.rank && nxt.rank > cur.rank && key !== 'launcher') { allowed = true; chained = true; }
                else if ((key === 'special' || key === 'super' || key === 'launcher') && cur.rank >= 2 && !cur.air) { allowed = true; chained = true; }
                if (nxt && nxt.rank && Combos.link(f, key)) { allowed = true; chained = true; comboLink = true; }
            }
        }
        if (!allowed) return;
        if (nxt && nxt.air && (f.onGround || (f.airUsed && !comboLink))) return;
        if (nxt && nxt.low && !f.onGround) return;
        f.blocking = false;
        const mv0 = f._mv;
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
        if (f._mv !== mv0 && nxt && nxt.rank) Combos.note(f, key, chained);
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
        f._mv = (f._mv || 0) + 1;
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
        // Compensación de lag: para un invitado, el rival se evalúa donde él lo veía (ping + colchón de interpolación)
        const back = (this.lagComp !== false && !attacker.isBot && attacker.id !== this.localUserId && ((this.room && !this.room.isLocal) || this.forceLagComp)) ? NetQuality.rewindFrames(attacker.id) : 0;
        let best = null, bestD = Infinity;
        for (const t of this.fighters) {
            if (!t.alive || !this.isEnemy(attacker, t) || t.invuln > 0 || t.juggleImmune) continue;
            if (t.state === 'held' && t.heldBy === attacker.id) continue;
            if (!this.sameLane(attacker, t)) continue;
            const rp = back ? this.histPos(t.id, back) : null;
            const tx = rp ? rp.x : t.x, ty = rp ? rp.y : t.y;
            const tCenter = ty - (t.crouching ? 34 : 54);
            const dx = Math.abs(tx - hitX);
            const dy = Math.abs((tCenter - (t.z || 0)) - (hitY - (attacker.z || 0)));
            const dist = Math.abs(tx - attacker.x) + Math.abs(ty - attacker.y);
            if (dx < halfW && dy < halfH && dist < bestD) { bestD = dist; best = t; }
        }
        if (!best) return;
        const target = best;
        attacker.hasHitThisSwing = true;
        const fin = Combos.finisher(attacker, md, target);
        const fb = fin ? fin.dmg : 0, fk = fin ? fin.kbm : Combos.kbScale(attacker), fo = fin && fin.unblock ? { unblockable: true } : null;
        let res = false;
        if (attacker.state === 'launcher') {
            if (!(target.state === 'super' && target.pendingShot) && !target.blocking) {
                target.inJuggle = true;
                target.onGround = false;
                target.juggleHits = 0;
            }
            res = this.applyDamage(attacker, target, md.dmg + fb, fc * 4 * fk, -16.5, { kind: 'heavy', knockdown: true, level, ...fo });
        } else if (target.inJuggle) {
            // Máximo 4 golpes en el aire; después cae sin poder ser golpeado
            target.juggleHits = (target.juggleHits || 0) + 1;
            if (target.juggleHits >= 4) target.juggleImmune = true;
            this.fx({ k: 'snd', n: 'juggle' });
            res = this.applyDamage(attacker, target, md.dmg + fb, fc * 6 * fk, -6.5, { kind: md.kind, knockdown: true, level, ...fo });
        } else {
            const kbY = md.air && attacker.airDir === 'd' ? -2 : md.kby;
            res = this.applyDamage(attacker, target, md.dmg + fb, fc * md.kb * fk, kbY, { kind: md.kind, knockdown: !!md.knockdown || !!(fin && fin.knock), level, ...fo });
        }
        if (fin) { if (res) Combos.after(this, attacker, target, fin); attacker.comboFin = null; }
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
        if (attacker && attacker !== target) { target.lastHitBy = attacker.id; target.lastHitAt = this.time; }
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
            if (this.dm) this.dmOnDeath(target, attacker);
            else if (attacker) attacker.kos++;
            this.fx({ k: 'shake', v: 12 });
            const teamsLeft = new Set(this.fighters.filter(x => x.alive).map(x => x.team));
            if (!this.dm && teamsLeft.size <= 1) this.fx({ k: 'ko', x: target.x, y: target.y - 60 });
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
        const finale = this.dm ? false : (this.teamMode ? (teams.size === 2 && alive.length <= 3) : (alive.length === 2 && this.fighters.length > 2));
        const lowTime = this.dm ? this.timer <= 30 : (this.timerMode !== 'infinite' && this.timer <= 15);
        if (finale || lowTime) {
            this.tense = true;
            sfx.setIntensity(1);
            this.floatingTexts.push({ x: this.camera.x, y: this.camera.y - 220, text: lowTime && !finale ? '¡ÚLTIMOS SEGUNDOS!' : (alive.length === 2 ? '¡DUELO FINAL!' : '¡ÚLTIMOS EN PIE!'), color: '#f43f5e', size: 26, vy: -0.5, life: 100 });
        }
    }

    // =====================================================================
    // COMBATE A MUERTE: reaparición, KO y clasificación
    // =====================================================================
    dmRanking() {
        return [...this.fighters].sort((a, b) => (b.kos - a.kos) || (a.deaths - b.deaths) || (b.damageDealt - a.damageDealt));
    }

    dmLeader() {
        const top = this.dmRanking()[0];
        return top && top.kos > 0 ? top : null;
    }

    // Al caer: el KO es de quien golpeó último en los 5 s previos (también si lo tiran a un peligro del mapa)
    dmOnDeath(target, attacker) {
        let killer = attacker;
        if (!killer && target.lastHitBy != null && this.time - target.lastHitAt <= 5) killer = this.fighters.find(x => x.id === target.lastHitBy);
        if (killer && killer !== target) killer.kos++;
        target.deaths++;
        target.respawnT = 180;   // 3 s
        target.lastHitBy = null;
    }

    updateRespawns() {
        if (this.matchState !== 'fighting') return;
        for (const f of this.fighters) {
            if (f.alive || f.respawnT <= 0) continue;
            f.respawnT--;
            if (f.respawnT > 0 && f.respawnT % 60 === 0) this.addFloatingText(f.x, f.y - 150, String(f.respawnT / 60), '#facc15', 24);
            if (f.respawnT === 0) this.respawnFighter(f);
        }
    }

    // Punto de reaparición: el más alejado de los rivales vivos (suelo y plataformas)
    pickRespawnSpot(f) {
        const cands = [];
        for (let x = 140; x <= this.worldWidth - 140; x += 140) cands.push({ x, y: this.groundY });
        this.platforms.forEach(p => cands.push({ x: p.x + p.w / 2, y: p.y }));
        const foes = this.fighters.filter(o => o !== f && o.alive);
        let best = cands[0], bestScore = -1;
        for (const c of cands) {
            let d = 99999;
            for (const o of foes) d = Math.min(d, Math.abs(o.x - c.x) + Math.abs(o.y - c.y) * 0.6);
            const score = d + Math.random() * 40;
            if (score > bestScore) { bestScore = score; best = c; }
        }
        return best;
    }

    respawnFighter(f) {
        const spot = this.pickRespawnSpot(f);
        Object.assign(f, {
            alive: true, hp: f.maxHp, mp: 15, x: spot.x, y: spot.y, vx: 0, vy: 0,
            state: 'idle', stateTimer: 0, stateMax: 0, stunTimer: 0, inJuggle: false, knockdown: false,
            blocking: false, crouching: false, blockStun: 0, heldBy: null, heldTimer: 0, grabTarget: null,
            hitFlash: 0, pendingShot: null, attackCooldown: 0, hitBoxActive: false, hasHitThisSwing: false,
            comboCount: 0, comboTimer: 0, comboTaken: 0, juggleHits: 0, focusedTargetId: null, focusTimer: 0,
            rollDir: 0, rollCooldown: 0, juggleImmune: false, airUsed: false, bounced: false, hazardCd: 0, onPlat: null,
            onGround: true, invuln: 120, respawnT: 0, rs: f.rs + 1, aiDecision: 'approach', aiReact: 0
        });
        f.facing = f.x < this.worldWidth / 2 ? 1 : -1;
        this.fx({ k: 'burst', x: f.x, y: f.y - 50, c: f.archetype.primary, n: 24 });
        this.addFloatingText(f.x, f.y - 130, '¡REVIVE!', '#22c55e', 22);
    }

    checkWinCondition() {
        if (this.matchState !== 'fighting' || this.dm) return;   // en Combate a muerte solo termina el reloj
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
        if (this.dm) {
            const ranked = this.dmRanking();
            const tops = ranked.filter(f => f.kos === ranked[0].kos && f.deaths === ranked[0].deaths);
            setTimeout(() => this.openResultsModal({ fighter: ranked[0], tie: tops.length > 1 ? tops : null }), 1700);
            return;
        }
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
        title.textContent = teamWin ? `🏆 ¡GANA EQUIPO ${TEAM_COLORS[res.team].name}!`
            : (res.tie ? (res.tie.length <= 3 ? `🏆 ¡EMPATE: ${res.tie.map(f => f.name).join(' y ')}!` : `🏆 ¡EMPATE A ${res.fighter.kos} K.O.!`) : `🏆 ¡GANADOR: ${res.fighter ? res.fighter.name : '---'}!`);
        const sorted = this.dm ? this.dmRanking() : [...this.fighters].sort((a, b) => {
            if (teamWin && (a.team === res.team) !== (b.team === res.team)) return a.team === res.team ? -1 : 1;
            if (a.alive !== b.alive) return a.alive ? -1 : 1;
            if (b.kos !== a.kos) return b.kos - a.kos;
            return b.damageDealt - a.damageDealt;
        });

        const board = document.getElementById('results-leaderboard');
        board.innerHTML = '';
        sorted.forEach((f, idx) => {
            const isWinner = teamWin ? f.team === res.team : (this.dm && res.tie ? res.tie.includes(f) : idx === 0);
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
                <div class="col-span-3 text-center font-bold text-red-400">${f.kos} K.O.${this.dm ? ` <span class="text-slate-400">· ${f.deaths}☠</span>` : ''}</div>
                <div class="col-span-3 text-right font-bold text-sky-400">${f.damageDealt} DMG</div>
            `;
            board.appendChild(row);
        });
        document.getElementById('screen-results').classList.remove('hidden');
    }

    // =====================================================================
    // RED: SNAPSHOT DEL HOST Y APLICACIÓN SUAVIZADA EN EL CLIENTE
    // =====================================================================
    // 30 Hz con pocos invitados; 20 Hz con muchos para no saturar la subida del anfitrión
    snapEvery() {
        let n = 0;
        for (const f of this.fighters) if (!f.isBot && f.id !== this.localUserId && !String(f.id).startsWith('enemy_')) n++;
        return n <= 2 ? 1 / 30 : 1 / 20;
    }

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
                kos: f.kos, deaths: f.deaths, rt: f.respawnT, rs: f.rs, damageDealt: f.damageDealt, team: f.team,
                invuln: f.invuln, heldBy: f.heldBy, rollDir: f.rollDir,
                blockStun: f.blockStun, guardShow: f.guardShow, airDir: f.airDir,
                focusedTargetId: f.focusedTargetId, focusTimer: f.focusTimer
            })),
            projectiles: this.projectiles.map(p => ({ id: p.id, ownerId: p.ownerId, team: p.team, kind: p.kind, x: r1(p.x), y: r1(p.y), vx: p.vx, radius: p.radius, isSuper: p.isSuper, color: p.color, life: p.life, age: p.age })),
            zn: SuperMoves.pack(this),
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
                if (!isLocal) { const nb = f.nb || (f.nb = []); nb.push({ t: this.netNow(), x: rf.x, y: rf.y }); if (nb.length > 8) nb.shift(); }
                f.hp = rf.hp; f.mp = rf.mp; f.alive = rf.alive; f.kos = rf.kos; f.damageDealt = rf.damageDealt;
                f.deaths = rf.deaths || 0; f.respawnT = rf.rt || 0;
                if (rf.rs !== undefined && rf.rs !== f.rs) { f.rs = rf.rs; f.x = rf.x; f.y = rf.y; f.vx = 0; f.vy = 0; f.state = 'idle'; f.stateTimer = 0; f.heldBy = null; }   // reapareció: sin deslizarse hasta allí
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

        if (payload.zn) SuperMoves.unpack(this, payload.zn); else if (this.zones && this.zones.length) this.zones = [];

        if (payload.ev) payload.ev.forEach(e => this.playEvent(e));
    }
}
