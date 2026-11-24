'use strict';
// =========================================================================
// INTRO CINEMATOGRÁFICA: un duelo real entre dos luchadores de la IA, con poderes,
// agarres y súperes, barras de cine y el título. Cualquier tecla / clic / toque la salta.
// Se apaga con  localStorage.sb8_intro = 'off'  o abriendo  index.html?nointro=1
// =========================================================================
class IntroDuelEngine extends BattleArenaEngine {
    // Nada de teclado, táctil ni pausa: es solo un espectáculo
    bindInputs() {
        if (window.ResizeObserver) {
            this._ro = new ResizeObserver(() => this.resize());
            this._ro.observe(this.canvas.parentElement);
        }
    }
    showBanner() { /* sin carteles */ }
    pollPauseInput() { /* sin pausa */ }
    togglePause() { /* sin pausa */ }
    endMatchByTimeout() { /* sin fin por tiempo */ }

    // Cuando uno cae, se avisa y la intro cierra
    checkWinCondition() {
        if (this.matchState !== 'fighting') return;
        if (this.fighters.filter(f => f.alive).length > 1) return;
        this.matchState = 'ended';
        if (this.onKO) this.onKO();
    }

    // Director: guiones de súper y agarre en momentos concretos, y vida protegida hasta el final
    update(dt) {
        super.update(dt);
        // cámara de cine: más cerca de la acción que en una partida normal
        if (this.camera.zoom < 0.92) this.camera.zoom += (0.92 - this.camera.zoom) * 0.06;
        this.introT = (this.introT || 0) + dt;
        const t = this.introT;
        const [a, b] = this.fighters;
        if (!a || !b || this.matchState !== 'fighting') return;

        if (t < 10.6) {   // nadie muere antes del clímax
            for (const f of this.fighters) if (f.alive && f.hp < f.maxHp * 0.28) f.hp = f.maxHp * 0.28;
        }
        if (!this.script) {
            this.script = [
                { at: 2.8, who: a, act: 'super' },
                { at: 5.4, who: b, act: 'grab' },
                { at: 7.6, who: b, act: 'super' },
                { at: 9.6, who: a, act: 'super' }
            ];
        }
        for (const ev of this.script) {
            if (ev.done || t < ev.at) continue;
            if (t > ev.at + 3) { ev.done = true; continue; }   // se pasó la ocasión: se omite
            const me = ev.who, other = me === a ? b : a;
            if (!me.alive || !other.alive || !me.onGround || me.stunTimer > 0) continue;
            if (ev.act === 'super') {
                me.mp = 100;
                me.aiDecision = 'super'; me.aiTimer = 40;
                if (me.state === 'super') ev.done = true;
            } else if (ev.act === 'grab') {
                if (Math.abs(other.x - me.x) < 78 && other.onGround) { me.aiDecision = 'grab'; me.aiTimer = 40; }
                if (me.grabTarget) ev.done = true;
            }
            break;   // un guion a la vez
        }
    }
}

const Intro = (function () {
    const $ = id => document.getElementById(id);
    let engine = null, active = false, finishing = false, startedAt = 0, timers = [], padTimer = null;
    const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };

    function shouldPlay() {
        if (/[?&](nointro|pruebas)\b/.test(location.search)) return false;
        try { if (localStorage.getItem('sb8_intro') === 'off') return false; } catch (e) { /* ignorar */ }
        return true;
    }
    function isEnabled() { try { return localStorage.getItem('sb8_intro') !== 'off'; } catch (e) { return true; } }
    function setEnabled(on) { try { localStorage.setItem('sb8_intro', on ? 'on' : 'off'); } catch (e) { /* ignorar */ } }

    // Pantalla negra inmediata para que el menú no parpadee antes de la intro
    function prepare() {
        $('intro-overlay').classList.add('on');
        $('intro-fade').style.transition = 'none';
        $('intro-fade').style.opacity = '1';
    }

    function pickDuel() {
        const ids = FIGHTER_ARCHETYPES.map(f => f.id);
        const i = Math.floor(Math.random() * ids.length);
        let j = Math.floor(Math.random() * (ids.length - 1)); if (j >= i) j++;
        const arenas = Object.keys(ARENAS);
        return { a: ids[i], b: ids[j], arena: arenas[Math.floor(Math.random() * arenas.length)] };
    }

    function play(onDone) {
        if (active) return;
        active = true; finishing = false;
        const duel = pickDuel();
        const room = {
            code: 'INTRO', hostId: 'intro_host', arena: duel.arena, resolvedArena: duel.arena, difficulty: 'hardcore', timerMode: 'infinite', mode: 'ffa',
            status: 'playing', isLocal: true, matchSeed: Math.floor(Math.random() * 1e6),
            slots: [
                { id: 'bot_intro_a', name: 'A', archetypeId: duel.a, isBot: true, isHost: false },
                { id: 'bot_intro_b', name: 'B', archetypeId: duel.b, isBot: true, isHost: false }
            ],
            updatedAt: Date.now()
        };
        // Muestra el escenario de combate sin HUD ni controles
        ['screen-home', 'screen-menu', 'screen-lobby', 'screen-results'].forEach(id => $(id).classList.add('hidden'));
        const sg = $('screen-game');
        sg.classList.remove('hidden');
        sg.classList.add('intro-mode');
        document.body.classList.add('intro-on');
        sfx.stopLobbyMusic();

        $('intro-overlay').classList.add('on');
        $('intro-overlay').classList.remove('closing');
        engine = new IntroDuelEngine($('game-canvas'), room, 'intro_host');
        // empiezan cerca del centro para que la acción arranque enseguida
        const cx = engine.worldWidth / 2;
        engine.fighters[0].x = cx - 300; engine.fighters[0].facing = 1;
        engine.fighters[1].x = cx + 300; engine.fighters[1].facing = -1;
        engine.camera.x = cx;
        engine.onKO = () => later(() => finish(false), 1700);
        engine.start();
        startedAt = performance.now();

        // entrada: el negro se levanta, entran las barras y aparece el título
        const fade = $('intro-fade');
        fade.style.transition = 'opacity .9s';
        requestAnimationFrame(() => { fade.style.opacity = '0'; });
        later(() => showTitle('STREET BRAWL', '8'), 700);
        later(() => hideTitle(), 3500);
        later(() => finish(false), 17000);   // tope de seguridad

        // saltar con cualquier tecla, clic o toque (con un instante de gracia para no saltarla sin querer)
        const skip = (ev) => { if (ev && ev.target && ev.target.closest && ev.target.closest('.global-fab')) return; if (performance.now() - startedAt > 350) finish(true); };
        Intro._skip = skip; Intro._done = onDone;
        window.addEventListener('keydown', skip, true);
        window.addEventListener('pointerdown', skip, true);
        let held = {};
        padTimer = setInterval(() => {
            const pads = navigator.getGamepads ? navigator.getGamepads() : [];
            for (const p of pads) if (p) p.buttons.forEach((bt, k) => { if (bt.pressed && !held[k]) skip(); held[k] = bt.pressed; });
        }, 100);
    }

    function showTitle(big, small) {
        const el = $('intro-title');
        el.querySelector('.it-main').textContent = big;
        el.querySelector('.it-num').textContent = small || '';
        el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    }
    function hideTitle() { $('intro-title').classList.remove('show'); }

    function finish(quick) {
        if (!active || finishing) return;
        finishing = true;
        window.removeEventListener('keydown', Intro._skip, true);
        window.removeEventListener('pointerdown', Intro._skip, true);
        if (padTimer) { clearInterval(padTimer); padTimer = null; }
        if (!quick) showTitle('STREET BRAWL', '8');
        const fade = $('intro-fade');
        const wait = quick ? 0 : 1400;
        later(() => {
            fade.style.transition = 'opacity ' + (quick ? '.25s' : '.7s');
            fade.style.opacity = '1';
            later(close, quick ? 280 : 750);
        }, wait);
    }

    function close() {
        timers.forEach(clearTimeout); timers = [];
        if (engine) { try { engine.destroy(); } catch (e) { /* ignorar */ } engine = null; }
        const sg = $('screen-game');
        sg.classList.remove('intro-mode');
        document.body.classList.remove('intro-on');
        hideTitle();
        const cb = Intro._done; Intro._done = null;
        active = false; finishing = false;
        if (cb) cb();
        // se levanta el negro sobre el menú
        const fade = $('intro-fade');
        fade.style.transition = 'opacity .6s';
        requestAnimationFrame(() => { fade.style.opacity = '0'; });
        later(() => $('intro-overlay').classList.remove('on'), 650);
    }

    return { shouldPlay, isEnabled, setEnabled, prepare, play, isActive: () => active, _engine: () => engine };
})();
