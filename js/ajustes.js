'use strict';
// =========================================================================
// AJUSTES: gráficos, sonido y HUD de combate. Se guardan en este navegador (localStorage).
//   Settings        → almacén de valores
//   OptionsUI       → ventana OPTIONS (pestañas GRAPHICS / SOUND / GAMEPLAY; CONTROLS abre la de controles)
//   HudExtras       → contador de combo y comandos en pantalla durante el combate
//   FpsCounter      → contador de FPS opcional
// =========================================================================
const Settings = (function () {
    const KEY = 'sb8_settings';
    const DEFAULTS = {
        // Si el sistema pide menos movimiento, el temblor de cámara empieza desactivado (se puede activar en Opciones)
        gfx: { shake: !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches), particles: 'high', fps: false },
        snd: { master: 80, music: 70, sfx: 100, menuTheme: 'new' },
        hud: { dmg: true, combo: true, inputs: false }
    };
    const clone = o => JSON.parse(JSON.stringify(o));
    let data = clone(DEFAULTS);
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved) for (const g of Object.keys(DEFAULTS)) if (saved[g]) for (const k of Object.keys(DEFAULTS[g])) if (typeof saved[g][k] === typeof DEFAULTS[g][k]) data[g][k] = saved[g][k];
    } catch (e) { /* sin datos guardados */ }

    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignorar */ } }
    function get(g, k) { return data[g][k]; }
    function set(g, k, v) { data[g][k] = v; save(); if (g === 'snd' && typeof sfx !== 'undefined') sfx.applyVolumes(); if (g === 'gfx' && k === 'fps') FpsCounter.refresh(); }
    function reset() { data = clone(DEFAULTS); save(); if (typeof sfx !== 'undefined') sfx.applyVolumes(); FpsCounter.refresh(); }
    return { get, set, reset, defaults: () => clone(DEFAULTS), all: () => data };
})();

// ---------------------------------------------------------------- FPS
const FpsCounter = (function () {
    let el = null, frames = 0, last = performance.now(), running = false;
    function ensure() {
        if (el) return el;
        el = document.createElement('div');
        el.id = 'fps-counter';
        el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:70;font:700 11px/1 ui-monospace,Consolas,monospace;color:#a7f3d0;background:rgba(2,6,23,.75);padding:3px 6px;border-radius:4px;pointer-events:none;display:none';
        document.body.appendChild(el);
        return el;
    }
    function loop(now) {
        requestAnimationFrame(loop);
        frames++;
        if (now - last >= 500) { if (el && Settings.get('gfx', 'fps')) el.textContent = Math.round(frames * 1000 / (now - last)) + ' FPS'; frames = 0; last = now; }
    }
    function refresh() {
        ensure().style.display = Settings.get('gfx', 'fps') ? 'block' : 'none';
        if (!running) { running = true; requestAnimationFrame(loop); }
    }
    return { refresh };
})();

// ---------------------------------------------------------------- HUD EXTRA EN COMBATE
const HudExtras = (function () {
    let comboEl = null, inEl = null, lastCombo = '', lastIn = '', log = [], lastSig = '', lastFrameT = 0;
    const LABEL = { lp: 'P1', mp: 'P2', hp: 'P3', lk: 'K1', mk: 'K2', hk: 'K3', t1: 'T1', t2: 'T2' };
    function host() { return document.getElementById('canvas-wrap'); }
    function ensure() {
        const h = host();
        if (!h) return false;
        if (!comboEl || !comboEl.isConnected) {
            comboEl = document.createElement('div'); comboEl.id = 'combo-counter'; h.appendChild(comboEl);
            inEl = document.createElement('div'); inEl.id = 'hud-inputs'; h.appendChild(inEl);
            lastCombo = lastIn = '';
        }
        return true;
    }
    function track(engine, me, raw) {
        const fwd = me.facing === 1 ? raw.right : raw.left, back = me.facing === 1 ? raw.left : raw.right;
        let dir = '•';
        if (raw.down && fwd) dir = '↘'; else if (raw.down && back) dir = '↙'; else if (raw.up && fwd) dir = '↗'; else if (raw.up && back) dir = '↖';
        else if (raw.down) dir = '↓'; else if (raw.up) dir = '↑'; else if (fwd) dir = '→'; else if (back) dir = '←';
        const btns = Object.keys(LABEL).filter(b => raw[b]).map(b => LABEL[b]).join(' ');
        const sig = dir + '|' + btns;
        if (sig === lastSig) return;
        lastSig = sig;
        if (dir !== '•' || btns) { log.push({ dir, btns }); if (log.length > 8) log.shift(); }
    }
    // Se llama al final de cada render del motor
    function frame(engine) {
        if (!engine || !engine.running || engine.isPractice || !engine.localUserId || String(engine.localUserId).startsWith('intro')) return;
        if (!ensure()) return;
        const me = engine.fighters.find(f => f.id === engine.localUserId);
        if (!me) return;
        // contador de combo del jugador local
        let txt = '';
        if (Settings.get('hud', 'combo') && me.comboCount >= 2) txt = me.comboCount + ' HITS';
        if (txt !== lastCombo) {
            lastCombo = txt;
            comboEl.textContent = txt;
            comboEl.classList.remove('pop'); void comboEl.offsetWidth; if (txt) comboEl.classList.add('pop');
        }
        // comandos en pantalla
        let html = '';
        if (Settings.get('hud', 'inputs')) {
            track(engine, me, engine.getLocalInputMap());
            html = log.slice().reverse().map((e, i) => `<div class="pr-in" style="opacity:${Math.max(0.25, 1 - i * 0.12)}"><b>${e.dir}</b>${e.btns ? `<span>${e.btns}</span>` : ''}</div>`).join('');
        } else if (log.length) log = [];
        if (html !== lastIn) { lastIn = html; inEl.innerHTML = html; }
    }
    return { frame };
})();

// ---------------------------------------------------------------- VENTANA OPTIONS
const OptionsUI = (function () {
    const $ = id => document.getElementById(id);
    let tab = 'gfx';
    const TABS = [['gfx', 'GRÁFICOS'], ['snd', 'SONIDO'], ['ctl', 'CONTROLES'], ['hud', 'JUEGO (HUD)'], ['lang', 'IDIOMA'], ['stats', 'ESTADÍSTICAS']];

    const row = (label, desc, control) => {
        const d = document.createElement('div');
        d.className = 'opt-row';
        const t = document.createElement('div');
        t.className = 'opt-label';
        t.innerHTML = `<span>${label}</span>${desc ? `<small>${desc}</small>` : ''}`;
        d.appendChild(t); d.appendChild(control);
        return d;
    };
    const toggle = (get, set) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'opt-switch';
        const paint = () => { const on = get(); b.classList.toggle('on', on); b.textContent = on ? 'ON' : 'OFF'; };
        b.onclick = () => { sfx.sfxSelect(); set(!get()); paint(); };
        paint(); return b;
    };
    const choice = (opts, get, set) => {
        const w = document.createElement('div');
        w.className = 'opt-choice';
        opts.forEach(([val, txt]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = txt;
            b.onclick = () => { sfx.sfxSelect(); set(val); paint(); };
            w.appendChild(b);
        });
        const paint = () => [...w.children].forEach((b, i) => b.classList.toggle('on', opts[i][0] === get()));
        paint(); return w;
    };
    const slider = (get, set, after) => {
        const w = document.createElement('div');
        w.className = 'opt-slider';
        const r = document.createElement('input');
        r.type = 'range'; r.min = 0; r.max = 100; r.step = 5; r.value = get();
        const v = document.createElement('span'); v.textContent = get() + '%';
        r.oninput = () => { set(Number(r.value)); v.textContent = r.value + '%'; };
        r.onchange = () => { if (after) after(); };
        w.appendChild(r); w.appendChild(v);
        return w;
    };

    const PANELS = {
        gfx: () => [
            row('Fondo animado del menú', 'Las arenas pasan solas detrás del menú principal.', toggle(() => MenuBackdrop.isEnabled(), v => MenuBackdrop.setEnabled(v))),
            row('Intro al abrir el juego', 'Duelo cinematográfico antes del menú.', toggle(() => Intro.isEnabled(), v => Intro.setEnabled(v))),
            row('Temblor de pantalla', 'Sacudida de cámara al recibir golpes y súperes.', toggle(() => Settings.get('gfx', 'shake'), v => Settings.set('gfx', 'shake', v))),
            row('Partículas', 'Chispas y anillos de impacto. «Bajas» o «Ninguna» ayudan a los móviles lentos.', choice([['high', 'ALTAS'], ['low', 'BAJAS'], ['off', 'NINGUNA']], () => Settings.get('gfx', 'particles'), v => Settings.set('gfx', 'particles', v))),
            row('Contador de FPS', 'Muestra los cuadros por segundo en una esquina.', toggle(() => Settings.get('gfx', 'fps'), v => Settings.set('gfx', 'fps', v)))
        ],
        snd: () => [
            row('Sonido', 'Apaga o enciende todo el audio.', toggle(() => sfx.enabled, () => { $('btn-toggle-sound').click(); })),
            row('Volumen general', '', slider(() => Settings.get('snd', 'master'), v => Settings.set('snd', 'master', v), () => sfx.sfxSelect())),
            row('Música', '', slider(() => Settings.get('snd', 'music'), v => Settings.set('snd', 'music', v))),
            row('Tema principal', 'Música del menú y la sala de espera: el tema nuevo, más agresivo, o el clásico.', choice([['new', 'NUEVO'], ['classic', 'CLÁSICO']], () => Settings.get('snd', 'menuTheme'), v => {
                Settings.set('snd', 'menuTheme', v);
                if (sfx.lobbyPlayer) { sfx.stopLobbyMusic(); sfx.startLobbyMusic(); }   // se oye al instante si ya está sonando el menú
            })),
            row('Efectos', 'Golpes, poderes, súperes y menús.', slider(() => Settings.get('snd', 'sfx'), v => Settings.set('snd', 'sfx', v), () => sfx.sfxPunch()))
        ],
        stats: () => {
            const d = Stats.get(), fav = Stats.favorite();
            const favA = fav ? FIGHTER_ARCHETYPES.find(a => a.id === fav) : null;
            const txt = (t) => { const s = document.createElement('span'); s.className = 'opt-stat'; s.textContent = t; return s; };
            const pct = d.games ? Math.round(d.wins / d.games * 100) : 0;
            const rows = [
                row('Combates jugados', 'Partidas de versus terminadas en este dispositivo (offline y online).', txt(String(d.games))),
                row('Victorias', '', txt(d.wins + (d.games ? '  (' + pct + '%)' : ''))),
                row('K.O.s', 'Rivales derrotados por ti.', txt(String(d.kos))),
                row('Daño total', '', txt(String(d.damage))),
                row('Mejor combo', 'Golpes encadenados más altos en una partida.', txt(d.bestCombo ? d.bestCombo + ' HITS' : '—')),
                row('Luchador más usado', '', txt(favA ? favA.icon + ' ' + favA.name + ' (' + d.byFighter[fav].g + ')' : '—'))
            ];
            const reset = document.createElement('button');
            reset.type = 'button'; reset.className = 'opt-switch'; reset.textContent = 'BORRAR';
            let armed = false;
            reset.onclick = () => {
                sfx.sfxSelect();
                if (!armed) { armed = true; reset.textContent = '¿SEGURO?'; setTimeout(() => { armed = false; reset.textContent = 'BORRAR'; }, 3000); return; }
                Stats.reset(); render(); showToast('Estadísticas borradas.', 'info');
            };
            rows.push(row('Borrar estadísticas', 'Pulsa dos veces para confirmar.', reset));
            return rows;
        },
        lang: () => [
            row('Idioma', 'Idioma del menú, el HUD y los avisos de combate.', choice([['es', 'ESPAÑOL'], ['en', 'ENGLISH']], () => I18n.lang(), v => I18n.set(v)))
        ],
        hud: () => [
            row('Números de daño', 'El daño sale flotando sobre el luchador golpeado.', toggle(() => Settings.get('hud', 'dmg'), v => Settings.set('hud', 'dmg', v))),
            row('Contador de combo', 'Muestra tus golpes encadenados en combate.', toggle(() => Settings.get('hud', 'combo'), v => Settings.set('hud', 'combo', v))),
            row('Comandos en pantalla', 'Lo que estás pulsando durante la pelea (↓ ↘ → P1…).', toggle(() => Settings.get('hud', 'inputs'), v => Settings.set('hud', 'inputs', v)))
        ]
    };

    function render() {
        const bar = $('opt-tabs'); bar.innerHTML = '';
        TABS.forEach(([id, label]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = label;
            b.className = 'opt-tab' + (id === tab ? ' on' : '');
            b.onclick = () => { sfx.sfxSelect(); if (id === 'ctl') { close(); $('btn-open-settings').click(); return; } tab = id; render(); };
            bar.appendChild(b);
        });
        const body = $('opt-body'); body.innerHTML = '';
        (PANELS[tab] || PANELS.gfx)().forEach(r => body.appendChild(r));
    }
    function open(which) {
        tab = PANELS[which] ? which : 'gfx';
        render();
        $('modal-options').classList.remove('hidden');
    }
    function close() { $('modal-options').classList.add('hidden'); }
    function isOpen() { return !$('modal-options').classList.contains('hidden'); }

    $('btn-close-options').onclick = () => { sfx.sfxSelect(); close(); };
    $('btn-opt-reset').onclick = () => {
        sfx.sfxSelect();
        Settings.reset(); I18n.set('es'); MenuBackdrop.setEnabled(true); Intro.setEnabled(true);
        render(); showToast('Ajustes restaurados por defecto.', 'info');
    };
    document.addEventListener('keydown', e => { if (isOpen() && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } });
    // Misma barra de pestañas en la ventana de Controles
    function mountTabs(el, active, pick) {
        el.innerHTML = '';
        TABS.filter(t => t[0] !== 'stats').forEach(([id, label]) => {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = label;
            b.className = 'opt-tab' + (id === active ? ' on' : '');
            b.onclick = () => pick(id);
            el.appendChild(b);
        });
    }
    return { open, close, isOpen, mountTabs };
})();

FpsCounter.refresh();
