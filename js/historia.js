'use strict';
// =========================================================================
// MODO HISTORIA: escalera 1 contra 1 contra todo el roster.
//   - Eliges luchador (pantalla de selección) y te enfrentas uno a uno a los demás.
//   - Cada rival pelea en su arena y la dificultad sube con el avance.
//   - Si pierdes puedes reintentar el combate; al vencer a todos, historia completada.
//   - Se guarda en este navegador qué luchadores ya han completado la historia.
// =========================================================================
const STORY_DIFFICULTY = ['easy', 'easy', 'normal', 'normal', 'normal', 'hardcore', 'hardcore'];
const STORY_KEY = 'sb8_story';

class StoryEngine extends BattleArenaEngine {
    constructor(canvas, room, localUserId) {
        super(canvas, room, localUserId);
        this.isStory = true;
        this._storyDone = false;
    }
    get player() { return this.fighters.find(f => f.id === this.localUserId) || this.fighters[0]; }
    get rival() { return this.fighters.find(f => f !== this.player); }
    checkWinCondition() {
        if (this.matchState !== 'fighting') return;
        const p = this.player, r = this.rival;
        if (p.alive && r.alive) return;
        this._finish(p.alive || (!p.alive && !r.alive && p.hp >= r.hp));
    }
    endMatchByTimeout() {
        if (this.matchState !== 'fighting') return;
        this._finish(this.player.hp >= this.rival.hp, true);
    }
    _finish(won, timeout) {
        if (this._storyDone) return;
        this._storyDone = true;
        this.matchState = 'ended';
        this.showBanner(timeout ? '¡TIEMPO!' : (won ? '¡K.O.!' : '¡DERROTA!'), 1700);
        setTimeout(() => { if (state.gameInstance === this) { this.running = false; sfx.stopAmbientSound(); Story.onFightEnd(won, this); } }, 1900);
    }
    // En Historia no se usa el panel de resultados de sala
    openResultsModal() { }
}

// Confeti y serpentinas para el final de Historia
const Confetti = (function () {
    let cv = null, ctx = null, raf = 0, parts = [], last = 0, t = 0;
    const COLORS = ['#fbbf24', '#f43f5e', '#38bdf8', '#a3e635', '#c084fc', '#fb923c', '#ffffff', '#34d399'];
    const rnd = (a, b) => a + Math.random() * (b - a);
    function burst(x, y, n, dirX) {
        for (let i = 0; i < n; i++) {
            const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05) + (dirX ? dirX * 0.35 : 0), v = rnd(5, 15);
            const streamer = Math.random() < 0.3;
            parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: streamer ? rnd(3, 5) : rnd(6, 11), h: streamer ? rnd(22, 46) : rnd(4, 8), rot: rnd(0, 6.28), vr: rnd(-0.25, 0.25), c: COLORS[(Math.random() * COLORS.length) | 0], streamer, ph: rnd(0, 6.28), life: rnd(220, 420) });
        }
    }
    function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(2.2, (now - last) / 16.67 || 1); last = now; t += dt;
        const W = cv.width, H = cv.height;
        ctx.clearRect(0, 0, W, H);
        if (t < 360 && ((t | 0) % 70 === 0 || t < 2)) { burst(W * 0.08, H * 0.95, 70, 1); burst(W * 0.92, H * 0.95, 70, -1); burst(W * 0.5, H * 1.02, 50, 0); }
        if (t < 520 && Math.random() < 0.5) parts.push({ x: rnd(0, W), y: -20, vx: rnd(-1, 1), vy: rnd(1.5, 4), w: rnd(6, 10), h: rnd(4, 8), rot: rnd(0, 6.28), vr: rnd(-0.2, 0.2), c: COLORS[(Math.random() * COLORS.length) | 0], streamer: false, ph: rnd(0, 6.28), life: 600 });
        parts = parts.filter(p => p.y < H + 60 && p.life > 0);
        for (const p of parts) {
            p.vy += 0.28 * dt; p.vx *= 0.992; p.vy *= 0.992; p.x += p.vx * dt + Math.sin(t * 0.08 + p.ph) * 0.8; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.c; ctx.globalAlpha = Math.min(1, p.life / 40);
            const sq = p.streamer ? 1 : Math.abs(Math.cos(t * 0.15 + p.ph));
            ctx.scale(1, p.streamer ? 1 : Math.max(0.2, sq));
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        }
    }
    function start(canvas) {
        stop(); cv = canvas; ctx = cv.getContext('2d');
        cv.width = cv.clientWidth || window.innerWidth; cv.height = cv.clientHeight || window.innerHeight;
        parts = []; t = 0; last = performance.now();
        raf = requestAnimationFrame(frame);
    }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; parts = []; if (ctx && cv) ctx.clearRect(0, 0, cv.width, cv.height); }
    return { start, stop };
})();

const Story = (function () {
    const $ = id => document.getElementById(id);
    let run = null;   // { heroId, order:[ids], idx, wins, losses, hits:0 }

    function load() { try { return JSON.parse(localStorage.getItem(STORY_KEY)) || {}; } catch (e) { return {}; } }
    function save(o) { try { localStorage.setItem(STORY_KEY, JSON.stringify(o)); } catch (e) { /* ignorar */ } }
    function cleared() { return load().cleared || []; }

    function arch(id) { return FIGHTER_ARCHETYPES.find(a => a.id === id); }

    function buildOrder(heroId) {
        return FIGHTER_ARCHETYPES.filter(a => a.id !== heroId).map(a => a.id);
    }

    function start() {
        sfx.init(); sfx.sfxSelect();
        net.leaveRoom();
        run = { heroId: state.selectedArchetypeId, order: buildOrder(state.selectedArchetypeId), idx: 0, retries: 0 };
        card();
    }

    function show(id, on) { $(id).classList.toggle('hidden', !on); if (!on) Confetti.stop(); }

    // Tarjeta «COMBATE n / N — A vs B», luego se lanza el combate
    function card() {
        const e = state.gameInstance; if (e) { e.destroy(); state.gameInstance = null; }
        const hero = arch(run.heroId), rival = arch(run.order[run.idx]);
        $('story-card').classList.remove('finale');
        $('story-kicker').textContent = `COMBATE ${run.idx + 1} / ${run.order.length}`;
        $('story-title').innerHTML = `<span style="color:${hero.primary}">${escapeHtml(hero.name)}</span> <em>VS</em> <span style="color:${rival.primary}">${escapeHtml(rival.name)}</span>`;
        const diff = STORY_DIFFICULTY[Math.min(run.idx, STORY_DIFFICULTY.length - 1)];
        $('story-sub').textContent = `${ARENAS[rival.homeArena].name.toUpperCase()} · DIFICULTAD ${{ easy: 'FÁCIL', normal: 'NORMAL', hardcore: 'EXTREMA' }[diff] || diff.toUpperCase()}`;
        $('story-actions').innerHTML = '';
        $('story-ladder').innerHTML = run.order.map((id, i) => `<span class="${i < run.idx ? 'done' : (i === run.idx ? 'now' : '')}" title="${arch(id).name}">${arch(id).icon}</span>`).join('');
        show('story-overlay', true);
        clearTimeout(run.t);
        run.t = setTimeout(fight, 2000);
        sfx.sfxSelect();
    }

    function fight() {
        if (!run) return;
        show('story-overlay', false);
        const hero = arch(run.heroId), rival = arch(run.order[run.idx]);
        const profile = getPlayerProfile();
        const room = {
            code: 'HISTORIA', hostId: net.userId, arena: rival.homeArena, resolvedArena: rival.homeArena,
            difficulty: STORY_DIFFICULTY[Math.min(run.idx, STORY_DIFFICULTY.length - 1)], timerMode: '99', mode: 'ffa',
            status: 'playing', isLocal: true, matchSeed: 7000 + run.idx * 31 + run.retries,
            slots: [
                { id: net.userId, name: profile.name, archetypeId: hero.id, look: profile.look, isBot: false, isHost: true },
                { id: 'bot_story', name: rival.name, archetypeId: rival.id, isBot: true, isHost: false }
            ],
            updatedAt: Date.now()
        };
        state.currentRoom = null;
        if (state.gameInstance) state.gameInstance.destroy();
        switchScreen('game');
        CtrlProfiles.playMode = 'versus';
        TouchPad.applyProfile();
        const e = new StoryEngine($('game-canvas'), room, net.userId);
        state.gameInstance = e;
        e.start();
    }

    function btn(label, cls, fn) {
        const b = document.createElement('button');
        b.className = 'btn-arcade px-5 py-3 rounded-xl font-arcade text-xs cursor-pointer ' + cls;
        b.textContent = label; b.onclick = () => { sfx.sfxSelect(); fn(); };
        $('story-actions').appendChild(b);
    }

    function onFightEnd(won, engine) {
        const hero = arch(run.heroId), rival = arch(run.order[run.idx]);
        const last = run.idx >= run.order.length - 1;
        $('story-ladder').innerHTML = run.order.map((id, i) => `<span class="${i < run.idx + (won ? 1 : 0) ? 'done' : (i === run.idx ? 'now' : '')}">${arch(id).icon}</span>`).join('');
        $('story-actions').innerHTML = '';
        if (won && last) {
            const s = load(); s.cleared = [...new Set([...(s.cleared || []), run.heroId])]; save(s);
            $('story-kicker').textContent = '★ ¡HISTORIA COMPLETADA! ★';
            $('story-title').innerHTML = `<span class="story-big">¡LE GANASTE<br>A TODOS!</span><span class="story-champ" style="color:${hero.primary}">${escapeHtml(hero.name)} ES EL CAMPEÓN INVICTO</span>`;
            $('story-sub').textContent = `${run.order.length} RIVALES DERROTADOS · ${run.retries ? run.retries + ' REINTENTOS' : 'SIN REINTENTOS'}`;
            $('story-card').classList.add('finale');
            btn('🏆 VOLVER AL MENÚ', 'bg-gradient-to-r from-amber-500 to-red-600 text-white', exit);
            Confetti.start($('story-confetti'));
            try { sfx.sfxSuper && sfx.sfxSuper(); } catch (e) { /* ignorar */ }
        } else if (won) {
            $('story-kicker').textContent = `VICTORIA ${run.idx + 1} / ${run.order.length}`;
            $('story-title').innerHTML = `${escapeHtml(rival.name)} DERROTADO`;
            $('story-sub').textContent = `SIGUIENTE: ${arch(run.order[run.idx + 1]).name}`;
            btn('➡ SIGUIENTE COMBATE', 'bg-gradient-to-r from-emerald-500 to-green-600 text-white', () => { run.idx++; card(); });
            btn('SALIR', 'bg-slate-800 border border-slate-600 text-white', exit);
        } else {
            $('story-kicker').textContent = 'DERROTA';
            $('story-title').innerHTML = `${escapeHtml(rival.name)} TE VENCIÓ`;
            $('story-sub').textContent = `COMBATE ${run.idx + 1} / ${run.order.length}`;
            btn('🔄 REINTENTAR', 'bg-gradient-to-r from-amber-500 to-red-600 text-white', () => { run.retries++; card(); });
            btn('SALIR', 'bg-slate-800 border border-slate-600 text-white', exit);
        }
        show('story-overlay', true);
    }

    function exit() {
        if (run) clearTimeout(run.t);
        run = null;
        show('story-overlay', false);
        if (state.gameInstance) { state.gameInstance.destroy(); state.gameInstance = null; }
        openSetup('story', 'versus');
    }

    function active() { return !!run; }
    $('btn-start-story').onclick = start;

    return { start, onFightEnd, exit, active, cleared, _run: () => run };
})();
