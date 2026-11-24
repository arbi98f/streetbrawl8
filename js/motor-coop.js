'use strict';
// Motor cooperativo: extiende BattleArenaEngine sin tocar el versus.
// Campaña de 8 niveles (uno por mapa) con profundidad (z), saltos corto/largo, cámara con scroll bloqueado por tramos,
// esbirros temáticos y jefes, IA aliada con prioridades, medallas + fantasma rival para revivir, comida y objetos.
// Los datos (niveles, esbirros, objetos) están en coop-datos.js.

class CoopArenaEngine extends BattleArenaEngine {
    constructor(canvas, room, localUserId) {
        super(canvas, room, localUserId);
        this.timerMode = 'infinite';   // el cooperativo no usa el reloj de 99 s
        this.placeCamera();
        this.relabelTouchButtons();
    }

    // ----- Mundo -------------------------------------------------------
    setupWorld() {
        this.worldWidth = COOP.LEVEL_W;
        this.worldHeight = 720;
        this.groundY = COOP.GROUND_Y;
        this.depthTol = COOP.DEPTH_TOL;
        this.coop = true;
    }

    // Sin plataformas ni peligros de arena: solo se reutilizan los fondos
    initArenaHazards() {
        this.hazards = [];
        this.arenaState = { tremorId: 0 };
        this.gravityScale = 1;
        this.windForce = 0;
        this.cycle = null;
        this.tremorTimer = 8;
        this.lastEruption = 0;
        this.platforms = [];
    }
    updateHazards() {}
    drawPlatforms() {}
    updateMusicIntensity() {}
    endMatchByTimeout() {}
    // ----- Red: el host simula todo; los invitados reciben instantáneas y predicen solo su propio luchador -----
    broadcastSnapshot() {
        const r1 = v => Math.round(v * 10) / 10;
        const cs = this.cs, tr = this.trans;
        net.broadcastCombatSnapshot({
            coop: 1, t: r1(this.time * 10) / 10, ms: this.matchState, lv: this.levelIdx, bolsa: this.camp.bolsa, n: this.coopN,
            cs: { seg: cs.seg, locked: cs.locked, go: cs.go, camX: r1(cs.camX), camLimit: cs.camLimit, finished: cs.finished, qn: cs.queue.length },
            tr: tr ? { t: tr.t, summary: tr.summary, gained: tr.gained, next: tr.next } : null,
            end: this.endWin === undefined ? -1 : (this.endWin ? 1 : 0),
            fighters: this.fighters.map(f => ({
                id: f.id, x: r1(f.x), y: r1(f.y), z: r1(f.z || 0), vx: r1(f.vx), vy: r1(f.vy),
                facing: f.facing, hp: Math.round(f.hp), mp: Math.round(f.mp), alive: f.alive,
                inJuggle: f.inJuggle, stunTimer: f.stunTimer,
                state: f.state, stateTimer: f.stateTimer, stateMax: f.stateMax, hitFlash: f.hitFlash,
                onGround: f.onGround, blocking: f.blocking, crouching: f.crouching,
                kos: f.kos, damageDealt: Math.round(f.damageDealt), team: f.team,
                invuln: f.invuln, heldBy: f.heldBy, rollDir: f.rollDir, blockStun: f.blockStun, guardShow: f.guardShow, airDir: f.airDir,
                // datos para crear enemigos / fantasmas en el invitado
                ty: f.type, bo: f.boss ? 1 : 0, gh: f.ghost ? 1 : 0, ow: f.ownerId, mh: f.maxHp, nm: f.name, bg: f.bodyGone ? 1 : 0,
                be: f.buffEnergy || 0, dt: f.deadTimer || 0
            })),
            md: this.medals.map(m => ({ o: m.ownerId, x: r1(m.x), z: m.z, u: m.used ? 1 : 0, t: m.t })),
            it: this.items.map(i => ({ k: i.kind, x: r1(i.x), z: i.z, ttl: i.ttl })),
            projectiles: this.projectiles.map(p => ({ id: p.id, ownerId: p.ownerId, team: p.team, kind: p.kind, x: r1(p.x), y: r1(p.y), vx: p.vx, radius: p.radius, isSuper: p.isSuper, color: p.color, life: p.life, age: p.age })),
            zn: SuperMoves.pack(this),
            ev: this.evQueue.splice(0)
        });
    }

    makeRemoteFighter(rf) {
        let arch;
        if (rf.gh) { const o = this.fighters.find(x => x.id === rf.ow); arch = o ? o.archetype : this.fighters[0].archetype; }
        else if (rf.bo) arch = buildBossArchetype(this.level.bossId);
        else arch = coopEnemyArchetype(this.level.arenaId, rf.ty);
        return {
            ...this._fighterTemplate, id: rf.id, name: rf.nm, isBot: true, type: rf.ty, boss: !!rf.bo, ghost: !!rf.gh, ownerId: rf.ow,
            entered: true, archetype: arch, team: rf.team, x: rf.x, y: rf.y, z: rf.z, hp: rf.hp, maxHp: rf.mh, mp: rf.mp, maxMp: rf.bo || rf.gh ? 100 : 0,
            width: 54 * arch.build.s, height: 108 * arch.build.s, alive: rf.alive, state: rf.state, facing: rf.facing, net: null, ai: null
        };
    }

    applyRemoteSnapshot(payload) {
        if (this.isHost || !payload || !payload.coop) return;
        // Nivel nuevo (el host ya cargó otro mapa)
        if (payload.lv !== this.levelIdx) { this.camp.level = payload.lv; this.enterLevel(payload.lv); }
        this.camp.bolsa = payload.bolsa; this.coopN = payload.n;
        const prevMs = this.matchState;
        this.matchState = payload.ms;
        if (prevMs === 'transition' && payload.ms === 'fighting') {
            this.showBanner(`NIVEL ${this.levelIdx + 1} • ${this.arena.name.toUpperCase()}`, 1200);
            sfx.sfxFight();
        }
        const c = payload.cs, cs = this.cs;
        Object.assign(cs, { seg: c.seg, locked: c.locked, go: c.go, goTimer: c.go ? 99999 : 0, camLimit: c.camLimit, finished: c.finished, queue: new Array(c.qn) });
        cs.camX = Math.max(cs.camX, c.camX);
        this.trans = payload.tr ? { ...payload.tr, loaded: true } : null;

        // Lista de luchadores: crear los nuevos (enemigos, fantasmas) y quitar los que el host ya retiró
        const ids = new Set(payload.fighters.map(rf => rf.id));
        for (const rf of payload.fighters) {
            if (!this.fighters.some(x => x.id === rf.id)) this.fighters.push(this.makeRemoteFighter(rf));
        }
        this.fighters = this.fighters.filter(f => ids.has(f.id));

        // Reutiliza la aplicación suavizada del motor base (posición, estados, proyectiles, eventos)
        const local = this.fighters.find(f => f.id === this.localUserId);
        super.applyRemoteSnapshot({ timer: this.timer, t: payload.t, fighters: payload.fighters, projectiles: payload.projectiles, zn: payload.zn, ev: payload.ev });
        for (const rf of payload.fighters) {
            const f = this.fighters.find(x => x.id === rf.id);
            if (!f) continue;
            if (f === local) { if (Math.abs((f.z || 0) - rf.z) > 30) f.z = rf.z; } else f.z = rf.z;
            f.bodyGone = !!rf.bg; f.buffEnergy = rf.be; f.deadTimer = rf.dt;
        }
        this.medals = payload.md.map(m => {
            const o = this.fighters.find(x => x.id === m.o);
            return { ownerId: m.o, arch: o ? o.archetype : this.fighters[0].archetype, name: o ? o.name : '', x: m.x, z: m.z, used: !!m.u, t: m.t };
        });
        this.items = payload.it.map(i => ({ kind: i.k, x: i.x, z: i.z, gy: this.groundY + i.z, ttl: i.ttl, t: 0 }));

        if ((payload.end === 0 || payload.end === 1) && !this.endShown) {
            this.endShown = true;
            this.matchState = 'ended';
            this.showBanner(payload.end ? '¡CAMPAÑA COMPLETADA!' : '¡DERROTA!', 1800);
            setTimeout(() => this.openCoopResults(!!payload.end), 1900);
        }
    }

    // Invitado: predice solo a su luchador; el resto se interpola (lo hace el motor base)
    updateClient() {
        super.updateClient();
        this.updateSpectate();
    }
    getFocusTarget() { return null; }

    coopZoom() {
        return Math.max(0.5, Math.min(1.08, this.canvas.width / 1300));
    }
    halfView() { return this.canvas.width / 2 / this.camera.zoom; }

    placeCamera() {
        this.camera.zoom = this.coopZoom();
        const halfW = this.halfView();
        const camMax = this.worldWidth + 20 - halfW;
        this.cs.camX = halfW - 20;
        this.cs.camLimit = Math.min(this.level.segments[0].at, camMax);
        this.camera.x = this.cs.camX;
        this.camera.y = this.groundY - 30;
    }

    // ----- Luchadores y campaña -------------------------------------------
    initFighters() {
        super.initFighters();
        this._fighterTemplate = { ...this.fighters[0] };
        this.coopN = this.fighters.length;     // nº de jugadores (1 a 4): escala la dificultad
        this.frames = 0; this.revives = 0; this.ghostSeq = 0;
        this.spec = { id: null, prevL: false, prevR: false };
        this.cs = { enemySeq: 0 };

        // Campaña guardada en la sala: sobrevive a las revanchas (se reinicia al volver al lobby)
        let camp = this.room.coopCamp;
        if (!camp) camp = this.room.coopCamp = { level: 0, bolsa: 0, pendingRetry: false, summaries: [], startHp: null, startStats: null };
        if (camp.pendingRetry) { camp.pendingRetry = false; camp.bolsa = Math.max(0, camp.bolsa - 1); }
        this.camp = camp;
        const prevHp = camp.startHp, prevStats = camp.startStats;

        this.fighters.forEach(f => { f.team = COOP.PLAYER_TEAM; });
        this.enterLevel(camp.level);
        // Revancha: el equipo vuelve como estaba al empezar el nivel
        if (prevHp) this.fighters.forEach(f => { if (prevHp[f.id] !== undefined) f.hp = Math.max(1, Math.round(f.maxHp * prevHp[f.id])); });
        if (prevStats) this.fighters.forEach(f => { const s = prevStats[f.id]; if (s) { f.kos = s.kos; f.damageDealt = s.dmg; } });
        this.snapshotLevelStart();
    }

    isPlayerSide(f) { return f.team === COOP.PLAYER_TEAM; }
    players() { return this.fighters.filter(f => this.isPlayerSide(f) && !f.ghost); }

    // Carga un nivel dentro del mismo motor (fondo, tramos y posiciones); los jugadores se conservan
    enterLevel(idx) {
        const lv = COOP_LEVELS[idx];
        this.levelIdx = idx;
        this.level = lv;
        this.arena = ARENAS[lv.arenaId];
        this.scenery = this.buildScenery(lv.arenaId);
        this.terrainSetup();
        this.ambient = [];
        if (this.started) { try { sfx.startAmbientSound(lv.arenaId); } catch (e) { /* sin audio */ } }

        this.fighters = this.players();
        this.projectiles = [];
        this.zones = [];
        this.medals = [];
        this.items = [];
        this.floatingTexts = [];
        this.particles = [];
        this.cs = {
            seg: 0, locked: false, queue: [], spawnCd: 0, go: false, goTimer: 0, camX: 0, camLimit: 0,
            finished: false, victory: false, victoryTimer: 0, enemySeq: (this.cs && this.cs.enemySeq) || 0
        };
        this.fighters.forEach((f, i) => {
            Object.assign(f, {
                x: 170 + i * 55, z: 20 + (i % 4) * 36, vx: 0, vy: 0, onGround: true, isJumping: false, inJuggle: false,
                state: 'idle', stateTimer: 0, stateMax: 0, stunTimer: 0, blockStun: 0, knockdown: false, heldBy: null, grabTarget: null,
                hitFlash: 0, blocking: false, crouching: false, attackCooldown: 0, airVx: undefined, facing: 1, thrown: null
            });
            f.y = this.groundY + f.z;
            f.buffEnergy = 0;
        });
        this.placeCamera();
        this.refreshLevelHUD();
    }

    snapshotLevelStart() {
        const ps = this.players();
        this.lvStart = { frame: this.frames, revives: this.revives, kos: {}, dmg: {} };
        this.camp.startHp = {}; this.camp.startStats = {};
        ps.forEach(f => {
            this.lvStart.kos[f.id] = f.kos; this.lvStart.dmg[f.id] = f.damageDealt;
            this.camp.startHp[f.id] = f.hp / f.maxHp;
            this.camp.startStats[f.id] = { kos: f.kos, dmg: f.damageDealt };
        });
    }

    // Entre niveles: +50 puntos de vida máxima a los vivos (tope 100 %) y los caídos reviven con el 50 %
    applyLevelBonus() {
        for (const f of this.players()) {
            if (!f.alive) {
                Object.assign(f, { alive: true, hp: Math.max(1, Math.round(f.maxHp * COOP.LEVEL_REVIVE)), state: 'idle', bodyGone: false, medalMade: false, deadTimer: 0, invuln: 0 });
            } else {
                f.hp = Math.min(f.maxHp, f.hp + Math.round(f.maxHp * COOP.LEVEL_BONUS));
            }
        }
    }

    // ----- Enemigos -------------------------------------------------------
    spawnEnemy(typeKey) {
        const t = COOP_ENEMY_TYPES[typeKey];
        const sc = COOP_SCALE[Math.max(1, Math.min(4, this.coopN))];
        const halfW = this.halfView();
        const fromRight = this.cs.enemySeq % 3 !== 2;
        let x = fromRight ? this.camera.x + halfW + 60 : this.camera.x - halfW - 60;
        if (x > this.worldWidth - 60 || x < 60) x = fromRight ? this.camera.x - halfW - 60 : this.camera.x + halfW + 60;
        x = this.safeX(Math.max(60, Math.min(this.worldWidth - 60, x)));
        const z = t.boss ? 60 : Math.random() * COOP.Z_MAX;
        const arch = t.boss ? buildBossArchetype(this.level.bossId) : coopEnemyArchetype(this.level.arenaId, typeKey);
        const hp = Math.round(t.boss ? (1000 + 350 * this.coopN) * 1.3 * this.level.bossHpMul : t.hp * sc.hp * this.level.hpMul);
        const e = {
            ...this._fighterTemplate,
            id: 'enemy_' + (++this.cs.enemySeq), name: arch.name, isBot: true, type: typeKey,
            archetype: arch, team: COOP.ENEMY_TEAM,
            x, z, y: this.groundY + z, facing: fromRight ? -1 : 1,
            hp, maxHp: hp, mp: 0, maxMp: t.boss ? 100 : 0,
            width: 54 * arch.build.s, height: 108 * arch.build.s,
            ai: null, aiTimer: 20 + Math.random() * 30
        };
        if (t.boss) {
            e.boss = true;
            this.camera.shake = Math.max(this.camera.shake || 0, 12);
            this.showBanner('¡JEFE: ' + arch.name + '!', 1600);
        }
        this.fighters.push(e);
        return e;
    }

    // ----- HUD (solo el equipo; los enemigos no tienen tarjeta) -------------
    withPlayersOnly(fn) {
        const all = this.fighters;
        this.fighters = all.filter(f => this.isPlayerSide(f) && !f.ghost);
        try { return fn(all); } finally { this.fighters = all; }
    }
    buildHUD() { this.withPlayersOnly(() => super.buildHUD()); this.refreshLevelHUD(); }
    refreshLevelHUD() {
        const el = document.getElementById('hud-arena-name');
        if (!el || !this.camp) return;
        const retry = this.camp.bolsa > 0 ? ` · ♻ ${this.camp.bolsa}` : '';
        el.textContent = `${this.arena.icon} NIVEL ${this.levelIdx + 1}/${COOP_LEVELS.length} · ${this.arena.name.toUpperCase()}${retry}`;
    }
    updateHUD() {
        this.withPlayersOnly(() => super.updateHUD());
        const foes = this.fighters.filter(f => !this.isPlayerSide(f) && !f.ghost && f.alive).length + this.cs.queue.length;
        const total = this.level.segments.length;
        document.getElementById('hud-alive-count').textContent = `ENEMIGOS: ${foes}`;
        document.getElementById('hud-timer').textContent = `${Math.min(this.cs.seg + 1, total)}/${total}`;
    }

    // ----- Controles ---------------------------------------------------
    // X (puño débil del versus) = salto corto y A (patada débil) = salto largo, ambos hacia adelante.
    // ↑ ↓ = profundidad. El resto de botones y combinaciones se reutilizan del intérprete original.
    interpretInput(f, raw) {
        raw = raw || this.emptyRaw();
        const cib = f.cib || (f.cib = { pc: {}, prev: {} });
        const edge = (b) => {
            let e;
            if (raw.pc && raw.pc[b] !== undefined) { e = raw.pc[b] !== (cib.pc[b] || 0); cib.pc[b] = raw.pc[b]; }
            else e = !!raw[b] && !cib.prev[b];
            cib.prev[b] = !!raw[b];
            return e;
        };
        const shortJump = edge('lp');
        const longJump = edge('lk');
        const pc = { ...(raw.pc || {}) };
        delete pc.up; delete pc.down; delete pc.lp; delete pc.lk;
        const filtered = { ...raw, up: false, down: false, lp: false, lk: false, pc };
        const cmd = super.interpretInput(f, filtered);
        cmd.zdir = (raw.down ? 1 : 0) - (raw.up ? 1 : 0);
        if (shortJump) cmd.jumpType = 'short';
        else if (longJump) cmd.jumpType = 'long';
        return cmd;
    }

    emptyInput() {
        const c = super.emptyInput();
        c.zdir = 0; c.jumpType = null;
        return c;
    }

    enemyInFront(f) {
        return this.fighters.some(o => o.alive && this.isEnemy(f, o) && (o.x - f.x) * f.facing > 0 &&
            Math.abs(o.x - f.x) < 220 && Math.abs((o.z || 0) - (f.z || 0)) < 40);
    }

    processFighterLogic(f, cmd) {
        if (f.z === undefined) f.z = 0;
        this.botHop(f, cmd);
        const canAct = !LOCKED_STATES.has(f.state) && f.stunTimer === 0 && f.blockStun === 0;
        if (!canAct && ['hurt', 'stun', 'held', 'down', 'getup', 'ko'].includes(f.state)) f.airVx = undefined;
        const boost = f.buffEnergy > 0 ? 1 + COOP.ENERGY_BOOST : 1;

        // Orientación: igual que en el versus, el jugador se voltea tocando "atrás" dos veces seguidas (cmd.turn,
        // lo procesa el motor base). Un solo toque ya no voltea: sirve para retroceder, bloquear o cargar el poder.

        // Salto corto / largo hacia adelante (altura fija, velocidad horizontal comprometida)
        if (cmd.jumpType && canAct && f.onGround) {
            f.vy = f.archetype.jumpForce * 1.15;
            f.onGround = false;
            f.isJumping = false;
            f.blocking = false;
            f.state = 'jump';
            f.airVx = f.facing * (cmd.jumpType === 'long' ? COOP.JUMP_LONG : COOP.JUMP_SHORT) * boost;
            f.vx = f.airVx;
            this.spawnDust(f.x, f.y, 6);
        }

        // Profundidad (solo en el suelo)
        let movedZ = false;
        if (cmd.zdir && canAct && f.onGround && !f.guardShow) {
            const spd = Math.min(3.4, f.archetype.speed * 0.6) * boost;
            f.z = Math.max(0, Math.min(COOP.Z_MAX, f.z + cmd.zdir * spd));
            f.y = this.groundY + f.z - (f.onPlat && f.onPlat.ph ? f.onPlat.ph : 0);
            movedZ = true;
        }

        // Bebida energética: ataques +30 % más rápidos (se adelanta el reloj del golpe sin llegar a cerrarlo)
        if (f.buffEnergy > 0) {
            f.buffEnergy--;
            f.buffAcc = (f.buffAcc || 0) + COOP.ENERGY_BOOST;
            if (f.buffAcc >= 1) {
                f.buffAcc -= 1;
                if (MOVE_DATA[f.state] && f.stateTimer > 2) f.stateTimer--;
                if (f.attackCooldown > 1) f.attackCooldown--;
            }
        }

        const wasGround = f.onGround, prevX = f.x;
        this.terrainPre(f, cmd);
        super.processFighterLogic(f, cmd);
        this.terrainPost(f, wasGround, prevX);

        if (boost > 1 && f.alive && !['hurt', 'stun', 'held', 'down', 'getup', 'ko'].includes(f.state)) f.x += f.vx * COOP.ENERGY_BOOST;
        if (f.onGround) f.airVx = undefined;
        if (movedZ && f.state === 'idle') f.state = 'walk';
        if (f.alive && this.isPlayerSide(f)) this.clampToScreen(f);
        else if (f.alive) this.clampEnemyToScreen(f);
    }

    clampToScreen(f, margin = COOP.EDGE_MARGIN) {
        const halfW = this.halfView();
        const lo = Math.max(55, this.camera.x - halfW + margin);
        const hi = Math.min(this.worldWidth - 55, this.camera.x + halfW - margin);
        if (f.x < lo) f.x = lo;
        else if (f.x > hi) f.x = hi;
    }

    // Los enemigos entran caminando desde fuera de la pantalla; una vez dentro chocan contra una pared invisible
    clampEnemyToScreen(f) {
        const halfW = this.halfView();
        const m = COOP.ENEMY_EDGE_MARGIN;
        if (!f.entered) {
            if (f.x > this.camera.x - halfW + m && f.x < this.camera.x + halfW - m) f.entered = true;
            return;
        }
        this.clampToScreen(f, m);
    }

    // ----- Jefes: resisten la barrida, se enfurecen bajo presión y sueltan un EMPUJÓN ------------------
    //  · Una sola patada baja fuerte (barrida) no los tumba: hacen falta BOSS_SWEEPS en poco tiempo.
    //  · 3 golpes seguidos en pocos segundos → «¡FURIA!»: armadura breve y empujón que aleja al jugador y le quita algo de vida.
    applyDamage(attacker, target, raw, kx, ky = -4.5, opts = {}) {
        const boss = target && target.boss && attacker && attacker !== target;
        if (boss && opts.knockdown && attacker.state === 'chk' && !opts.projectile) {
            target.sweepHits = (target.sweepHits || 0) + 1; target.sweepT = 420;
            if (target.sweepHits < COOP.BOSS_SWEEPS) {
                opts = { ...opts, knockdown: false };
                kx *= 0.4; ky = Math.max(ky, -2);
                this.addFloatingText(target.x, target.y - 150, `¡RESISTE! ${target.sweepHits}/${COOP.BOSS_SWEEPS}`, '#c084fc', 14);
            } else { target.sweepHits = 0; this.addFloatingText(target.x, target.y - 150, '¡BARRIDA!', '#facc15', 16); }
        }
        let shove = false;
        if (attacker && attacker.boss && !target.boss) {
            const mul = (this.level && this.level.bossDmgMul) || 1.2;
            raw = Math.round(raw * mul);
            if (attacker._shove > 0 && attacker.state === 'hp') {
                shove = true; attacker._shove = 0;
                raw = Math.round(COOP.BOSS_SHOVE_DMG * mul); kx = attacker.facing * COOP.BOSS_SHOVE_KB; ky = -3.4;
                opts = { ...opts, unblockable: true, knockdown: false, kind: 'medium' };
            }
        }
        const armored = boss && target.armorT > 0 && target.alive;
        const prev = armored ? { state: target.state, st: target.stateTimer, sm: target.stateMax, hb: target.hitBoxActive, vy: target.vy } : null;
        const res = super.applyDamage(attacker, target, raw, kx, ky, opts);
        if (!res) return res;
        if (shove) {
            attacker.vx = -attacker.facing * 3.5;
            this.addFloatingText(target.x, target.y - 140, '¡EMPUJÓN!', '#f472b6', 20);
            this.fx({ k: 'shake', v: 9 });
        }
        if (boss && target.alive) {
            target.pressure = (target.pressure || 0) + 1; target.pressureT = 170;
            if (armored) {          // armadura: el golpe quita vida pero no lo interrumpe
                target.state = prev.state; target.stateTimer = prev.st; target.stateMax = prev.sm; target.hitBoxActive = prev.hb;
                target.vx = 0; target.vy = prev.vy; target.knockdown = false; target.inJuggle = false;
            } else if (target.pressure >= COOP.BOSS_PRESSURE && !(target.armorCd > 0)) {
                target.armorT = 55; target.armorCd = 330; target.pressure = 0; target._wantShove = true;
                this.addFloatingText(target.x, target.y - 165, '¡FURIA!', '#ef4444', 20);
            }
        }
        return res;
    }

    // Temporizadores del jefe (host): presión, armadura, barridas y empujón
    tickBoss(f) {
        if (f.pressureT > 0 && --f.pressureT === 0) f.pressure = 0;
        if (f.sweepT > 0 && --f.sweepT === 0) f.sweepHits = 0;
        if (f.armorT > 0) f.armorT--;
        if (f.armorCd > 0) f.armorCd--;
        if (f.shoveCd > 0) f.shoveCd--;
        if (f._shove > 0) f._shove--;
        // jugador pegado al jefe durante mucho rato (rincón): también empuja
        const near = this.players().some(p => p.alive && Math.abs(p.x - f.x) < 95 && Math.abs((p.z || 0) - (f.z || 0)) < 30);
        f.nearT = near ? (f.nearT || 0) + 1 : 0;
        if (f.nearT > 150 && !f._wantShove) { f._wantShove = true; f.nearT = 0; }
    }

    // ----- Agarre-lanzamiento: el enemigo sale despedido, se puede golpear en el aire y daña al caer ----
    updateThrow(f) {
        const el = f.stateMax - f.stateTimer;
        if (el !== MOVE_DATA.throw.releaseAt || !f.grabTarget) return;
        const t = this.fighters.find(x => x.id === f.grabTarget);
        f.grabTarget = null;
        if (!t || t.state !== 'held') return;
        t.state = 'hurt';
        t.heldBy = null;
        t.onGround = false;
        t.inJuggle = true;        // se puede golpear en el aire (máx. 4 golpes)
        t.juggleHits = 0;
        t.thrown = f.id;
        this.fx({ k: 'snd', n: 'throw' });
        this.applyDamage(f, t, 70, f.facing * 3.2, -12.5, { unblockable: true, knockdown: true, kind: 'heavy' });
    }

    // Al aterrizar tras un lanzamiento recibe daño extra (antes de quedar caído e invulnerable)
    knockDown(f) {
        if (!f.alive) return;
        if (f.thrown) {
            const by = this.fighters.find(x => x.id === f.thrown);
            f.thrown = null;
            this.applyDamage(by || null, f, 60, 0, 0, { unblockable: true, kind: 'heavy' });
            if (!f.alive) return;
            this.addFloatingText(f.x, f.y - 140, '¡IMPACTO!', '#fb923c', 18);
        }
        super.knockDown(f);
    }

    // ----- IA de enemigos y aliados ------------------------------------
    steer(f, cmd, x, z, tol = 12) {
        const dx = x - f.x, dz = z - (f.z || 0);
        if (Math.abs(dx) > tol) { cmd.left = dx < 0; cmd.right = dx > 0; }
        if (Math.abs(dz) > 8) cmd.zdir = Math.sign(dz);
    }

    // ¿Lo están golpeando o hay un enemigo atacándolo de cerca?
    isThreatened(f, foes) {
        if (f.hitFlash > 0 || f.stunTimer > 0) return true;
        return foes.some(o => Math.abs(o.x - f.x) < 110 && Math.abs((o.z || 0) - (f.z || 0)) < 30 && MOVE_DATA[o.state] && MOVE_DATA[o.state].reach);
    }

    // Prioridad aliada sin amenazas: 1) medalla, 2) comida si está herido, 3) objetos cercanos
    allyGoal(f) {
        let best = null, bd = Infinity;
        for (const m of this.medals) {
            if (m.used || m.t < COOP.MEDAL_ARM - 15) continue;
            const d = Math.abs(m.x - f.x) + Math.abs(m.z - (f.z || 0)) * 2;
            if (d < bd) { bd = d; best = { x: m.x, z: m.z }; }
        }
        if (best) return best;
        const hurt = f.hp < f.maxHp * 0.6;
        for (const it of this.items) {
            const food = COOP_ITEMS[it.kind].heal !== undefined;
            const d = Math.abs(it.x - f.x) + Math.abs(it.z - (f.z || 0)) * 2;
            if (food ? (!hurt || d > 900) : d > 380) continue;
            if (d < bd) { bd = d; best = { x: it.x, z: it.z }; }
        }
        return best;
    }

    computeBotInput(f) {
        const cmd = this.emptyInput();
        if (f.state === 'held') return cmd;
        const ai = f.ai || (f.ai = { think: 20 + Math.random() * 40, engage: !f.type || !!f.boss, hover: 190 + Math.random() * 90, side: Math.random() < 0.5 ? -1 : 1, guard: 0, threat: false });
        const type = f.type ? COOP_ENEMY_TYPES[f.type] : null;
        const ally = this.isPlayerSide(f);
        const foes = this.fighters.filter(o => o.alive && this.isEnemy(f, o) && o.state !== 'held');

        let t = null, bd = Infinity;
        if (ally) {
            const threatened = this.isThreatened(f, foes);
            if (threatened && !ai.threat) ai.guard = Math.random() < 0.5 ? 22 : 0;
            ai.threat = threatened;
            if (ai.guard > 0) { ai.guard--; cmd.back = true; return cmd; }   // se cubre un instante
            const ghost = foes.find(o => o.ghost);
            if (!threatened && !ghost) {
                const goal = this.allyGoal(f);
                if (goal) { this.steer(f, cmd, goal.x, goal.z); return cmd; }
            }
            if (ghost && Math.abs(ghost.x - f.x) < 900) { t = ghost; bd = 0; }   // derrotar al fantasma revive al aliado: prioridad
        }
        if (!t) {
            for (const o of foes) {
                const d = Math.abs(o.x - f.x) + Math.abs((o.z || 0) - (f.z || 0)) * 2;
                if (d < bd) { bd = d; t = o; }
            }
        }

        if (!t) {
            // Aliados sin enemigos: acompañan al jugador humano (o al primer aliado vivo)
            if (ally && !type) {
                const leader = this.fighters.find(o => o.alive && !o.isBot && this.isPlayerSide(o)) || this.fighters.find(o => o.alive && o !== f && this.isPlayerSide(o));
                if (leader) {
                    const dx = leader.x - 60 - f.x;
                    if (Math.abs(dx) > 40) { cmd.left = dx < 0; cmd.right = dx > 0; }
                    const dz = (leader.z || 0) - (f.z || 0);
                    if (Math.abs(dz) > 14) cmd.zdir = Math.sign(dz);
                }
            }
            return cmd;
        }

        const dx = t.x - f.x;
        const dz = (t.z || 0) - (f.z || 0);
        const range = type ? type.range : 78;
        const adx = Math.abs(dx);

        if (ai.engage) {
            if (adx > range * 0.8) { cmd.left = dx < 0; cmd.right = dx > 0; }
            if (Math.abs(dz) > 8) cmd.zdir = Math.sign(dz);
        } else {
            // Enemigos sin turno de ataque: rodean a distancia
            const want = t.x + ai.side * ai.hover;
            const ddx = want - f.x;
            if (Math.abs(ddx) > 30) { cmd.left = ddx < 0; cmd.right = ddx > 0; }
            if (Math.abs(dz) > 24) cmd.zdir = Math.sign(dz);
        }

        if (ai.think > 0) ai.think--;
        const lined = adx <= range + 8 && Math.abs(dz) <= 14 && (dx * f.facing > 0);
        const free = !LOCKED_STATES.has(f.state) && f.stunTimer === 0 && f.attackCooldown === 0;
        if (f.boss && f._wantShove && free && f.shoveCd === 0 && adx <= 100 && Math.abs(dz) <= 22) {
            f._wantShove = false; f.shoveCd = COOP.BOSS_SHOVE_CD; f._shove = 40;
            f.facing = dx >= 0 ? 1 : -1;
            cmd.atk = 'hp'; ai.think = 24;
            return cmd;
        }
        if (ai.engage && lined && free && ai.think <= 0) {
            if ((!type || type.boss) && f.mp >= 100) { cmd.atk = 'super'; cmd.aim = f.facing; }
            else {
                const moves = type ? type.moves : ['mp', 'mk', 'hp', 'mp', 'hk'];
                cmd.atk = moves[Math.floor(Math.random() * moves.length)];
            }
            const th = type ? type.think : [30, 70];
            ai.think = th[0] + Math.random() * (th[1] - th[0]);
        }
        return cmd;
    }

    // ----- Bucle del host: nivel, medallas, objetos, espectador ----------------
    updateHost() {
        super.updateHost();
        if (this.matchState === 'transition') { this.tickTransition(); return; }
        if (this.matchState === 'fighting') this.frames++;
        this.updateLevel();
        for (const b of this.fighters) if (b.boss && b.alive) this.tickBoss(b);
        this.updateMedals();
        this.updateItems();
        this.updateSpectate();
        // Un jugador que abandonó la sala pasa a ser controlado por la IA
        const slots = this.room.slots || [];
        for (const f of this.fighters) if (!f.isBot && f.id !== this.localUserId && this.isPlayerSide(f) && !slots.some(sl => sl.id === f.id)) f.isBot = true;
        // Enemigos y fantasmas caídos: sueltan objetos y desaparecen (parpadean y se retiran)
        let removed = false;
        for (const f of this.fighters) {
            if (f.alive || this.isPlayerSide(f)) continue;
            if (!f.dropDone && f.type && !f.boss) { f.dropDone = true; this.dropItem(f); }
            f.deadTimer = (f.deadTimer || 0) + 1;
            if (f.deadTimer > 150) removed = true;
        }
        if (removed) this.fighters = this.fighters.filter(f => f.alive || this.isPlayerSide(f) || (f.deadTimer || 0) <= 150);
    }

    // ----- Medallas y fantasmas (revivir) ----------------------------------------
    // Al caer un aliado queda una medalla. Un aliado vivo (humano o bot) que pase por encima invoca a su fantasma
    // como RIVAL (transparente, con 1/3 de la vida). Al derrotarlo, el aliado revive. Cada muerte deja una medalla.
    updateMedals() {
        if (this.matchState !== 'fighting') return;
        const halfW = this.halfView();
        for (const f of this.fighters) {
            if (f.alive || !this.isPlayerSide(f) || f.medalMade) continue;
            f.medalMade = true;
            this.medals.push({ ownerId: f.id, arch: f.archetype, name: f.name, x: this.safeX(f.x), z: f.z || 0, t: 0, used: false, maxHp: f.maxHp });
        }
        for (const g of this.fighters) {
            if (g.ghost && !g.alive && !g.resolved) { g.resolved = true; this.reviveOwner(g); }
        }
        const revivers = this.players().filter(f => f.alive && f.onGround);
        for (const m of this.medals) {
            m.t++;
            if (m.used) continue;
            // La medalla acompaña a la cámara para no quedar atrás
            const lo = this.camera.x - halfW + 80, hi = this.camera.x + halfW - 80;
            if (m.x < lo) m.x += Math.min(10, lo - m.x);
            else if (m.x > hi) m.x -= Math.min(10, m.x - hi);
            const who = revivers.find(r => Math.abs(r.x - m.x) < COOP.MEDAL_REACH_X && Math.abs((r.z || 0) - m.z) < COOP.MEDAL_REACH_Z);
            if (who && m.t > COOP.MEDAL_ARM) this.spawnGhost(m, who);
        }
        this.medals = this.medals.filter(m => !m.used || m.t < 5);
    }

    spawnGhost(m, reviver) {
        m.used = true; m.t = 0;
        const owner = this.fighters.find(f => f.id === m.ownerId);
        if (owner) owner.bodyGone = true;
        const hp = Math.max(1, Math.round(m.maxHp * COOP.GHOST_HP_FRACTION));
        const g = {
            ...this._fighterTemplate,
            id: 'ghost_' + m.ownerId + '_' + (++this.ghostSeq), name: m.name, isBot: true, ghost: true, entered: true,
            archetype: m.arch, team: COOP.ENEMY_TEAM, ownerId: m.ownerId,
            x: m.x, z: m.z, y: this.groundY + m.z, facing: reviver.facing || 1,
            hp, maxHp: m.maxHp, mp: 0, maxMp: 100, width: 54 * m.arch.build.s, height: 108 * m.arch.build.s,
            ai: null, aiTimer: 20 + Math.random() * 30, invuln: 60
        };
        this.fighters.push(g);
        this.fx({ k: 'burst', x: g.x, y: g.y - 50, c: '#93c5fd', n: 26 });
        this.addFloatingText(g.x, g.y - 150, '¡DERROTA A SU FANTASMA!', '#93c5fd', 18);
    }

    // Al derrotar al fantasma, el aliado caído revive en ese punto con parte de su vida
    reviveOwner(g) {
        const o = this.fighters.find(f => f.id === g.ownerId);
        if (!o || o.alive) return;
        Object.assign(o, {
            alive: true, hp: Math.max(1, Math.round(o.maxHp * COOP.REVIVE_HP_FRACTION)), state: 'idle', stateTimer: 0, stateMax: 0,
            x: g.x, z: g.z || 0, y: this.groundY + (g.z || 0), vx: 0, vy: 0, onGround: true, isJumping: false, inJuggle: false,
            stunTimer: 0, blockStun: 0, knockdown: false, heldBy: null, grabTarget: null, hitFlash: 0, invuln: 120,
            attackCooldown: 0, airVx: undefined, bodyGone: false, medalMade: false, bounced: false, deadTimer: 0
        });
        this.revives++;
        this.clampToScreen(o);
        this.fx({ k: 'burst', x: o.x, y: o.y - 50, c: '#facc15', n: 30 });
        this.addFloatingText(o.x, o.y - 150, '¡REVIVIDO!', '#facc15', 22);
    }

    // ----- Comida y objetos -----------------------------------------------------
    dropItem(e) {
        const kind = coopRollDrop(e.type);
        if (!kind) return;
        const z = Math.max(0, Math.min(COOP.Z_MAX, e.z || 0));
        this.items.push({ kind, x: e.x, z, gy: this.groundY + z, ttl: COOP.ITEM_TTL, t: 0 });
    }

    updateItems() {
        if (this.matchState !== 'fighting') return;
        const halfW = this.halfView();
        const takers = this.players().filter(f => f.alive && f.onGround);
        for (const it of this.items) {
            it.ttl--; it.t++;
            it.x = Math.max(this.camera.x - halfW + 60, Math.min(this.camera.x + halfW - 60, it.x));
            const who = takers.find(r => Math.abs(r.x - it.x) < COOP.ITEM_REACH_X && Math.abs((r.z || 0) - it.z) < COOP.ITEM_REACH_Z);
            if (who) { this.applyItem(who, it); it.ttl = 0; }
        }
        this.items = this.items.filter(it => it.ttl > 0);
    }

    applyItem(f, it) {
        const def = COOP_ITEMS[it.kind];
        if (def.heal !== undefined) {
            const add = Math.round(f.maxHp * def.heal);
            f.hp = Math.min(f.maxHp, f.hp + add);
            this.addFloatingText(f.x, f.y - 150, `+${Math.round(def.heal * 100)}% VIDA`, '#4ade80', 18);
            this.fx({ k: 'burst', x: f.x, y: f.y - 60, c: '#4ade80', n: 14 });
        } else if (it.kind === 'energy') {
            f.buffEnergy = COOP.ENERGY_FRAMES;
            this.addFloatingText(f.x, f.y - 150, '¡ENERGÍA! +30%', '#facc15', 18);
            this.fx({ k: 'burst', x: f.x, y: f.y - 60, c: '#facc15', n: 16 });
        } else if (it.kind === 'crystal') {
            f.mp = f.maxMp || 100;
            this.addFloatingText(f.x, f.y - 150, '¡SÚPER CARGADO!', '#22d3ee', 18);
            this.fx({ k: 'burst', x: f.x, y: f.y - 60, c: '#22d3ee', n: 16 });
        }
        this.fx({ k: 'snd', n: 'juggle' });
    }

    // ----- Espectador: el jugador caído recorre a los vivos con A/D o ←/→ ---------
    aliveAllies() { return this.fighters.filter(f => f.alive && this.isPlayerSide(f)); }

    updateSpectate() {
        const me = this.fighters.find(f => f.id === this.localUserId);
        const sp = this.spec;
        if (!me || me.alive || this.matchState !== 'fighting') { sp.id = null; return; }
        const raw = this.getLocalInputMap();
        const left = !!raw.left, right = !!raw.right;
        const list = this.aliveAllies();
        if (!list.length) { sp.id = null; return; }
        let i = list.findIndex(f => f.id === sp.id);
        if (i < 0) i = 0;
        else if (right && !sp.prevR) i = (i + 1) % list.length;
        else if (left && !sp.prevL) i = (i - 1 + list.length) % list.length;
        sp.id = list[i].id;
        sp.prevL = left; sp.prevR = right;
    }

    drawHazards(ctx, layer) {
        if (layer !== 'back') return;
        this.drawTerrain(ctx);
        for (const m of (this.medals || [])) {
            if (m.used) continue;
            const bob = Math.sin(this.time * 4 + m.x) * 4;
            const gy = this.groundY + m.z;
            ctx.save();
            ctx.translate(m.x, gy);
            ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 2, 16, 5, 0, 0, TAU); ctx.fill();
            const pulse = 0.5 + Math.sin(this.time * 5) * 0.25;
            softGlow(ctx, 0, -30 + bob, 34, `rgba(250,204,21,${0.35 * pulse + 0.2})`);
            ctx.strokeStyle = `rgba(147,197,253,${pulse})`; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(0, 2, 24 + pulse * 6, 7 + pulse * 2, 0, 0, TAU); ctx.stroke();
            ctx.fillStyle = '#facc15'; ctx.strokeStyle = '#92400e'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, -30 + bob, 15, 0, TAU); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(0, -30 + bob, 11, 0, TAU); ctx.stroke();
            ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#451a03'; ctx.fillText(m.arch.icon || '★', 0, -30 + bob);
            ctx.restore();
        }
        for (const it of (this.items || [])) drawCoopItem(ctx, it, this.time);
    }

    // ----- Nivel: tramos, bloqueo de cámara y oleadas ------------------------
    updateLevel() {
        if (this.matchState !== 'fighting') return;
        const cs = this.cs;
        const halfW = this.halfView();
        const camMax = this.worldWidth + 20 - halfW;
        const players = this.players().filter(f => f.alive);
        const seg = this.level.segments[cs.seg];
        const sc = COOP_SCALE[Math.max(1, Math.min(4, this.coopN))];

        if (cs.goTimer > 0) cs.goTimer--;
        if (cs.spawnCd > 0) cs.spawnCd--;

        if (!cs.locked && seg && this.camera.x >= Math.min(seg.at, camMax) - 6) {
            cs.locked = true;
            cs.go = false;
            cs.camLimit = Math.min(seg.at, camMax);
            cs.queue = coopScaleList(seg.enemies, this.coopN);
        }

        const foes = this.fighters.filter(f => !this.isPlayerSide(f) && !f.ghost && f.alive);
        if (cs.locked) {
            if (cs.queue.length && foes.length < sc.active && cs.spawnCd === 0) {
                this.spawnEnemy(cs.queue.shift());
                cs.spawnCd = 45;
            }
            if (!cs.queue.length && foes.length === 0) {
                cs.locked = false;
                cs.seg++;
                const next = this.level.segments[cs.seg];
                if (next) { cs.camLimit = Math.min(next.at, camMax); cs.go = true; cs.goTimer = 99999; }
                else { cs.camLimit = camMax; cs.finished = true; cs.victoryTimer = 170; }
                this.addFloatingText(this.camera.x, this.groundY - 190, seg && seg.boss ? '¡JEFE DERROTADO!' : '¡ZONA LIMPIA!', '#22c55e', 22);
            }
        }

        // Turnos de ataque: solo los enemigos más cercanos a algún jugador atacan a la vez
        this.fighters.forEach(g => { if (g.ghost && g.ai) g.ai.engage = true; });
        foes.forEach(e => { if (e.boss && e.ai) e.ai.engage = true; });
        const ranked = foes.filter(e => !e.boss).map(e => ({ e, d: Math.min(...players.map(p => Math.abs(p.x - e.x) + Math.abs((p.z || 0) - e.z) * 2), 99999) }))
            .sort((a, b) => a.d - b.d);
        ranked.forEach((r, i) => { if (r.e.ai) r.e.ai.engage = i < sc.engage; });

        // Fin del nivel: jefe derrotado y una breve pausa
        if (cs.finished && !cs.victory && players.length) {
            if (--cs.victoryTimer <= 0) cs.victory = true;
        }
    }

    // ----- Cámara: avanza con el equipo (promedio) y se bloquea durante las oleadas -------
    updateCamera() {
        const cs = this.cs;
        const targetZoom = this.coopZoom();
        this.camera.zoom += (targetZoom - this.camera.zoom) * 0.08;
        const zoom = this.camera.zoom;
        const halfW = this.canvas.width / 2 / zoom;
        const camMin = halfW - 20;
        const camMax = this.worldWidth + 20 - halfW;

        const players = this.players().filter(f => f.alive);
        if (this.isHost && players.length) {
            const avg = players.reduce((s, p) => s + p.x, 0) / players.length;
            if (avg - 60 > cs.camX) cs.camX = avg - 60;
        }
        cs.camX = Math.max(camMin, Math.min(cs.camX, cs.camLimit, camMax));
        const tx = camMin > camMax ? this.worldWidth / 2 : cs.camX;

        const tOff = document.body.classList.contains('touch-on') ? (this.canvas.height * 0.13) / Math.max(0.3, zoom) : 0;
        const ty = this.groundY - 30 + tOff;
        this.camera.x += (tx - this.camera.x) * 0.1;
        this.camera.y += (ty - this.camera.y) * 0.1;
        if (this.camera.shake > 0) this.camera.shake *= 0.78;
        if (this.camera.shake > 14) this.camera.shake = 14;
    }

    // ----- Dibujo --------------------------------------------------------
    orderForDraw(list) {
        return [...list].sort((a, b) => (a.alive === b.alive ? (a.z || 0) - (b.z || 0) : (a.alive ? 1 : -1)));
    }

    drawFighter(ctx, f) {
        if (f.bodyGone) return;
        if (!f.alive && (!this.isPlayerSide(f) || f.ghost) && (f.deadTimer || 0) > 100 && ((f.deadTimer >> 2) & 1)) return;
        if (f.buffEnergy > 0 && f.alive) {
            softGlow(ctx, f.x, f.y - 60, 60 * f.archetype.build.s, `rgba(250,204,21,${0.25 + 0.1 * Math.sin(this.time * 12)})`);
        }
        if (f.ghost) {
            ctx.save();
            softGlow(ctx, f.x, f.y - 60, 52 * f.archetype.build.s, 'rgba(147,197,253,0.3)');
            const k = f.alive ? 0.5 : 0.3;
            const restoreAlpha = coopScaleAlpha(ctx, k);
            try { super.drawFighter(ctx, f); } finally { restoreAlpha(); ctx.restore(); }
            return;
        }
        super.drawFighter(ctx, f);
    }

    // Barra del jefe (arriba al centro) y marca del jugador observado
    drawCoopOverlay() {
        const ctx = this.ctx, W = this.canvas.width;
        const boss = this.fighters.find(f => f.boss && f.alive);
        if (boss) {
            const bw = Math.min(560, W * 0.55), bx = (W - bw) / 2, by = 74;
            ctx.save();
            ctx.font = 'bold 15px Rajdhani, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#000'; ctx.fillText('☣ ' + boss.name, W / 2 + 1, by - 5);
            ctx.fillStyle = '#e9d5ff'; ctx.fillText('☣ ' + boss.name, W / 2, by - 6);
            ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(bx - 3, by - 1, bw + 6, 16);
            ctx.fillStyle = '#3b0764'; ctx.fillRect(bx, by + 2, bw, 10);
            ctx.fillStyle = '#a855f7'; ctx.fillRect(bx, by + 2, bw * Math.max(0, boss.hp / boss.maxHp), 10);
            ctx.restore();
        }
        const sp = this.spec && this.spec.id ? this.fighters.find(f => f.id === this.spec.id) : null;
        if (sp) {
            ctx.save();
            ctx.font = 'bold 15px Rajdhani, sans-serif'; ctx.textAlign = 'center';
            ctx.fillStyle = '#000'; ctx.fillText(`OBSERVANDO: ${sp.name}   ◀ A / D ▶`, W / 2 + 1, this.canvas.height - 59);
            ctx.fillStyle = '#facc15'; ctx.fillText(`OBSERVANDO: ${sp.name}   ◀ A / D ▶`, W / 2, this.canvas.height - 60);
            ctx.restore();
        }
    }

    render() {
        super.render();
        this.drawCoopOverlay();
        const cs = this.cs;
        if (this.matchState === 'fighting' && cs.go && !cs.locked && cs.goTimer > 0 && !cs.victory && Math.floor(this.time * 2.5) % 2 === 0) {
            const ctx = this.ctx;
            ctx.save();
            ctx.font = '22px "Press Start 2P", monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = '#000'; ctx.fillText('¡VE! ▶', this.canvas.width - 38, 62);
            ctx.fillStyle = '#facc15'; ctx.fillText('¡VE! ▶', this.canvas.width - 40, 60);
            ctx.restore();
        }
        if (this.matchState === 'transition' && this.trans) this.drawTransition();
    }

    // ----- Fin de nivel, carga del siguiente y resumen ---------------------------
    collectLevelSummary() {
        const st = this.lvStart;
        const rows = this.players().map(f => ({
            name: f.name, icon: f.archetype.icon, alive: f.alive,
            kos: f.kos - (st.kos[f.id] || 0), dmg: Math.round(f.damageDealt - (st.dmg[f.id] || 0))
        }));
        return {
            level: this.levelIdx, arenaIcon: this.arena.icon, arenaName: this.arena.name, rows,
            time: Math.round((this.frames - st.frame) / 60), revives: this.revives - st.revives
        };
    }

    onLevelComplete() {
        const camp = this.camp;
        const summary = this.collectLevelSummary();
        camp.summaries.push(summary);
        let gained = false;
        if (COOP.RETRY_AWARD_LEVELS.includes(this.levelIdx + 1) && camp.bolsa < COOP.RETRY_MAX) { camp.bolsa++; gained = true; }
        if (this.levelIdx >= COOP_LEVELS.length - 1) {
            this.matchState = 'ended'; this.endWin = true;
            this.showBanner('¡CAMPAÑA COMPLETADA!', 1800);
            setTimeout(() => this.openCoopResults(true), 1900);
            return;
        }
        camp.level = this.levelIdx + 1;
        this.matchState = 'transition';
        this.projectiles = [];
        this.zones = [];
        this.trans = { t: 0, summary, gained, next: camp.level, loaded: false };
    }

    tickTransition() {
        const tr = this.trans;
        tr.t++;
        if (tr.t === 150 && !tr.loaded) {          // la carga ocurre con la pantalla cubierta
            tr.loaded = true;
            this.applyLevelBonus();
            this.enterLevel(tr.next);
            this.snapshotLevelStart();
        }
        if (tr.t >= 330) {
            this.matchState = 'fighting';
            this.trans = null;
            this.showBanner(`NIVEL ${this.levelIdx + 1} • ${this.arena.name.toUpperCase()}`, 1200);
            sfx.sfxFight();
        }
    }

    drawTransition() {
        const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, tr = this.trans;
        const a = Math.min(1, tr.t / 30) * (tr.t > 300 ? Math.max(0, (330 - tr.t) / 30) : 1);
        const u = Math.max(0.6, Math.min(1.3, W / 1000));
        const s = tr.summary;
        ctx.save();
        ctx.globalAlpha = a * 0.94;
        ctx.fillStyle = '#05070f'; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = a;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        let y = H * 0.17;
        ctx.font = `${Math.round(22 * u)}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#000'; ctx.fillText(`¡NIVEL ${s.level + 1} COMPLETADO!`, W / 2 + 2, y + 2);
        ctx.fillStyle = '#facc15'; ctx.fillText(`¡NIVEL ${s.level + 1} COMPLETADO!`, W / 2, y);
        y += 32 * u;
        ctx.font = `bold ${Math.round(16 * u)}px Rajdhani, sans-serif`;
        ctx.fillStyle = '#94a3b8'; ctx.fillText(`${s.arenaIcon} ${s.arenaName.toUpperCase()}  ·  Tiempo ${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, '0')}  ·  Revividos ${s.revives}`, W / 2, y);
        y += 34 * u;
        const colName = W / 2 - 230 * u, colKo = W / 2 + 70 * u, colDmg = W / 2 + 220 * u;
        ctx.font = `bold ${Math.round(14 * u)}px Rajdhani, sans-serif`;
        ctx.fillStyle = '#64748b'; ctx.textAlign = 'left'; ctx.fillText('LUCHADOR', colName, y);
        ctx.textAlign = 'right'; ctx.fillText('ENEMIGOS DERROTADOS', colKo + 60 * u, y); ctx.fillText('DAÑO', colDmg + 50 * u, y);
        y += 8 * u;
        for (const r of s.rows) {
            y += 26 * u;
            ctx.font = `bold ${Math.round(17 * u)}px Rajdhani, sans-serif`;
            ctx.textAlign = 'left'; ctx.fillStyle = r.alive ? '#e2e8f0' : '#94a3b8'; ctx.fillText(`${r.icon} ${r.name}`, colName, y);
            ctx.textAlign = 'right'; ctx.fillStyle = '#f87171'; ctx.fillText(String(r.kos), colKo + 60 * u, y);
            ctx.fillStyle = '#38bdf8'; ctx.fillText(String(r.dmg), colDmg + 50 * u, y);
        }
        y += 40 * u;
        ctx.textAlign = 'center';
        ctx.font = `bold ${Math.round(15 * u)}px Rajdhani, sans-serif`;
        ctx.fillStyle = '#4ade80'; ctx.fillText('Los caídos reviven con el 50 % y el equipo recupera +50 % de vida', W / 2, y);
        if (tr.gained) { y += 24 * u; ctx.fillStyle = '#facc15'; ctx.fillText(`♻ +1 REINTENTO  (guardados: ${this.camp.bolsa}/${COOP.RETRY_MAX})`, W / 2, y); }
        // Siguiente escenario y barra de carga
        const nx = ARENAS[COOP_LEVELS[tr.next].arenaId];
        y = H * 0.84;
        ctx.font = `${Math.round(13 * u)}px "Press Start 2P", monospace`;
        ctx.fillStyle = '#e2e8f0'; ctx.fillText(`CARGANDO: ${nx.icon} ${nx.name.toUpperCase()}`, W / 2, y);
        const bw = Math.min(420, W * 0.5), bx = (W - bw) / 2;
        ctx.fillStyle = '#1e293b'; ctx.fillRect(bx, y + 14, bw, 10);
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(bx, y + 14, bw * Math.min(1, tr.t / 150), 10);
        ctx.restore();
    }

    // ----- Fin de partida ------------------------------------------------
    // Derrota solo cuando caen TODOS los aliados (humanos y bots): mientras quede uno vivo se puede revivir a los demás
    checkWinCondition() {
        if (!this.isHost || this.matchState !== 'fighting') return;
        if (!this.players().some(f => f.alive)) {
            this.matchState = 'ended'; this.endWin = false;
            this.showBanner('¡DERROTA!', 1800);
            setTimeout(() => this.openCoopResults(false), 1900);
        } else if (this.cs.victory) {
            this.onLevelComplete();
        }
    }

    openCoopResults(win) {
        this.running = false;
        sfx.stopAmbientSound();
        const camp = this.camp, total = COOP_LEVELS.length;
        const btn = document.getElementById('btn-rematch');
        if (win) {
            document.getElementById('winner-title').textContent = '🏆 ¡CAMPAÑA COMPLETADA!';
            this.room.coopCamp = null;
            btn.textContent = '🔄 NUEVA CAMPAÑA';
        } else {
            document.getElementById('winner-title').textContent = `💀 DERROTA · NIVEL ${this.levelIdx + 1}/${total}`;
            if (camp.bolsa > 0) {
                if (this.isHost) camp.pendingRetry = true;
                btn.textContent = `🔄 REVANCHA ${camp.bolsa}/${COOP.RETRY_MAX}`;
            } else {
                if (this.isHost) this.room.coopCamp = null;
                btn.textContent = '🔄 REINICIAR DESDE EL NIVEL 1';
            }
        }
        const sorted = this.players().sort((a, b) => (b.kos - a.kos) || (b.damageDealt - a.damageDealt));
        const board = document.getElementById('results-leaderboard');
        board.innerHTML = '';
        sorted.forEach((f, idx) => {
            const row = document.createElement('div');
            row.className = `grid grid-cols-12 px-3 py-2.5 text-xs sm:text-sm items-center ${idx === 0 ? 'bg-yellow-500/10 font-bold text-yellow-300' : 'text-slate-200'}`;
            row.innerHTML = `
                <div class="col-span-1 font-arcade text-xs">${idx + 1}</div>
                <div class="col-span-5 flex items-center gap-2 truncate"><span>${f.archetype.icon}</span><span class="truncate">${escapeHtml(f.name)}</span></div>
                <div class="col-span-3 text-center font-bold text-red-400">${f.kos} K.O.</div>
                <div class="col-span-3 text-right font-bold text-sky-400">${Math.round(f.damageDealt)} DMG</div>`;
            board.appendChild(row);
        });
        document.getElementById('screen-results').classList.remove('hidden');
    }

    // ----- Controles táctiles: P.D / K.D pasan a ser los saltos --------------
    relabelTouchButtons() {
        this._touchBackup = [];
        const labels = { KeyU: 'S.C', KeyJ: 'S.L' };   // salto corto / salto largo
        document.querySelectorAll('#touch-controls [data-key]').forEach(b => {
            const k = b.getAttribute('data-key');
            if (labels[k]) { this._touchBackup.push([b, b.textContent]); b.textContent = labels[k]; }
        });
    }

    start() {
        this.started = true;
        super.start();
    }

    destroy() {
        super.destroy();
        (this._touchBackup || []).forEach(([b, text]) => { b.textContent = text; });
        this._touchBackup = [];
        const btn = document.getElementById('btn-rematch');
        if (btn) btn.textContent = '🔄 REVANCHA INMEDIATA';
    }
}
