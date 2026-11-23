'use strict';
// =========================================================================
// MENÚ PRINCIPAL NUEVO (centrado, con submenús)
//   Raíz: STORY MODE · ONLINE · OFFLINE · PRACTICE · CUSTOMIZATION · OPTIONS · HOW TO PLAY
//   Online / Offline → VERSUS | COOP → pantalla "preparar partida" (luchador y salas)
//   Se maneja con teclado (↑↓ Enter Esc), mando (cruceta, A, B), ratón y toque.
// =========================================================================
(function () {
    const $ = id => document.getElementById(id);
    const home = $('screen-home');
    const menuEl = $('home-menu');

    state.menuKind = 'offline';
    state.menuPreset = 'versus';

    // ---------- Definición de los menús ----------
    const soon = (label, msg) => ({ label, soon: true, msg });
    const MENUS = {
        root: {
            title: '',
            items: () => [
                { id: 'story', label: 'MODO HISTORIA', desc: 'Enfréntate 1 contra 1 a todo el roster, un rival tras otro, cada uno en su arena.', action: () => openSetup('story', 'versus') },
                { id: 'online', label: 'ONLINE', sub: 'online', desc: 'Juega con amigos por internet: crea una sala o únete con un código.' },
                { id: 'offline', label: 'OFFLINE', sub: 'offline', desc: 'Pelea contra la IA en este dispositivo: Versus o Cooperativo.' },
                { id: 'practice', label: 'PRÁCTICA', action: () => openSetup('practice', 'versus'), desc: 'Elige tu luchador y entrena contra un muñeco: vida infinita, combos y comandos en pantalla.' },
                { id: 'custom', label: 'PERSONALIZAR', action: () => Custom.open(), desc: 'Cambia los colores de tu luchador: pelo, polo, bufanda, pantalón, calzado y piel.' },
                { id: 'options', label: 'OPCIONES', sub: 'options', desc: 'Gráficos, sonido, controles y opciones de pantalla (HUD).' },
                { id: 'help', label: 'CÓMO JUGAR', action: () => openHelp(), desc: 'Controles, combos, bloqueo por alturas, poderes, súper y agarres.' }
            ]
        },
        online: {
            title: 'ONLINE',
            items: () => [
                { id: 'on-versus', label: 'VERSUS', action: () => openSetup('online', 'versus'), desc: 'Hasta 8 jugadores: todos contra todos, dúos o escuadras. Rellena con bots si quieres.' },
                { id: 'on-coop', label: 'COOPERATIVO', action: () => openSetup('online', 'coop'), desc: 'De 1 a 4 jugadores contra oleadas de enemigos en 8 niveles con jefe.' }
            ]
        },
        offline: {
            title: 'OFFLINE',
            items: () => [
                { id: 'off-versus', label: 'VERSUS', action: () => openSetup('offline', 'versus'), desc: 'Batalla rápida contra bots: todos contra todos, dúos o escuadras.' },
                { id: 'off-coop', label: 'COOPERATIVO', action: () => openSetup('offline', 'coop'), desc: 'Tú y 3 aliados de la IA contra oleadas de enemigos en 8 niveles.' }
            ]
        },
        options: {
            title: 'OPCIONES',
            items: () => [
                { id: 'op-gfx', label: 'GRÁFICOS', action: () => OptionsUI.open('gfx'), desc: 'Fondo animado, intro, partículas, temblor de pantalla y contador de FPS.' },
                { id: 'op-snd', label: 'SONIDO', val: sfx.enabled ? 'ON' : 'OFF', action: () => OptionsUI.open('snd'), desc: 'Volumen general, música y efectos; también apaga todo el sonido.' },
                { id: 'op-ctl', label: 'CONTROLES', action: () => $('btn-open-settings').click(), desc: 'Mando, teclado y controles táctiles, por separado para Versus y Cooperativo.' },
                { id: 'op-lang', label: 'IDIOMA', val: I18n.label(), action: () => OptionsUI.open('lang'), desc: 'Cambia el idioma del menú y del juego: Español o English.' },
                { id: 'op-hud', label: 'JUEGO (HUD)', action: () => OptionsUI.open('hud'), desc: 'Números de daño, contador de combos y comandos en pantalla.' }
            ]
        }
    };

    const nav = { stack: ['root'], idx: { root: 0 } };
    const cur = () => nav.stack[nav.stack.length - 1];
    let items = [];

    // ---------- Pintado ----------
    function renderMenu(animate = true) {
        const key = cur();
        items = MENUS[key].items();
        if (nav.idx[key] == null || nav.idx[key] >= items.length) nav.idx[key] = 0;
        $('home-submenu-title').textContent = MENUS[key].title ? '◢ ' + MENUS[key].title + ' ◣' : '';
        menuEl.innerHTML = '';
        items.forEach((it, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'home-item' + (it.soon ? ' soon' : '');
            b.setAttribute('role', 'menuitem');
            b.innerHTML = it.label + (it.val ? `<span class="val">${it.val}</span>` : '') + (it.tag ? `<span class="tag">${it.tag}</span>` : '');
            b.onpointerenter = e => { if (e.pointerType === 'mouse') select(i); };
            b.onclick = () => { select(i); activate(); };
            menuEl.appendChild(b);
        });
        select(nav.idx[key]);
        if (animate) { menuEl.classList.remove('swap'); void menuEl.offsetWidth; menuEl.classList.add('swap'); }
    }

    function select(i) {
        nav.idx[cur()] = i;
        [...menuEl.children].forEach((el, k) => el.classList.toggle('sel', k === i));
        $('home-desc-text').textContent = items[i] ? items[i].desc : '';
    }

    function move(d) {
        const n = items.length;
        select((nav.idx[cur()] + d + n) % n);
        sfx.sfxSelect();
    }

    function activate() {
        const it = items[nav.idx[cur()]];
        if (!it) return;
        sfx.init();
        sfx.sfxSelect();
        if (it.soon) { showToast(it.label + ': próximamente.', 'info'); return; }
        if (it.sub) { nav.stack.push(it.sub); nav.idx[it.sub] = 0; renderMenu(); return; }
        if (it.action) it.action();
    }

    function back() {
        if (nav.stack.length <= 1) return;
        nav.stack.pop();
        sfx.sfxSelect();
        renderMenu();
    }

    // ---------- Tarjeta del jugador ----------
    function refreshPlayerCard() {
        const name = ($('input-player-name').value || state.playerName || 'BRAWLER').trim().toUpperCase();
        $('home-player-name').textContent = name;
    }

    // ---------- Pantalla "preparar partida" ----------
    const createText = $('create-box-text').innerHTML;
    const createBtnText = $('btn-create-room').textContent.trim();
    function openSetup(kind, preset) {
        state.menuKind = kind;
        state.menuPreset = preset;
        const m = $('screen-menu');
        m.dataset.kind = kind;
        m.dataset.preset = preset;
        const practice = kind === 'practice', story = kind === 'story';
        $('menu-view-kind').textContent = practice ? 'PRÁCTICA' : story ? 'MODO HISTORIA' : (kind === 'online' ? 'ONLINE' : 'OFFLINE');
        $('menu-view-mode').textContent = practice ? 'ENTRENAMIENTO' : story ? '1 VS 1 · TODOS LOS RIVALES' : (preset === 'coop' ? 'COOPERATIVO' : 'VERSUS');
        $('rooms-heading').textContent = practice ? 'ENTRENAMIENTO' : story ? 'MODO HISTORIA' : 'SALAS DE COMBATE';
        $('connection-mode-badge').style.display = (practice || story) ? 'none' : '';

        // Batalla rápida: en Versus no se ofrece el modo cooperativo; en Coop va fijo
        const sel = $('select-quick-mode');
        [...sel.options].forEach(o => { const coopOpt = o.value === 'coop'; o.hidden = o.disabled = (preset === 'coop') ? !coopOpt : coopOpt; });
        if (preset === 'coop') sel.value = 'coop';
        else if (sel.value === 'coop') sel.value = 'ffa';
        updateQuickMatchLabel();

        // Crear sala: en Offline sirve para preparar la partida con bots
        if (kind === 'offline') {
            $('create-box-text').textContent = 'Prepara la partida a tu medida: elige mapa, dificultad, duración y cuántos bots.';
            $('btn-create-room').textContent = '⚙️ PARTIDA PERSONALIZADA';
        } else {
            $('create-box-text').innerHTML = createText;
            $('btn-create-room').textContent = createBtnText;
        }
        const cl = (typeof Story !== 'undefined' ? Story.cleared() : []);
        $('story-cleared').textContent = cl.length ? 'Historia completada con: ' + cl.map(i => (FIGHTER_ARCHETYPES.find(a => a.id === i) || {}).name).join(', ') : '';
        if (window.__menuTabs) window.__menuTabs('fighter');
        switchScreen('menu');
        $('screen-menu').scrollTop = 0;
    }
    window.addEventListener('sb8-lang', () => { if (homeActive()) renderMenu(false); });
    $('btn-menu-back').onclick = () => { sfx.sfxSelect(); showHome(); };

    function showHome() {
        switchScreen('home');
        refreshPlayerCard();
        renderMenu(false);
    }

    // ---------- Cómo jugar ----------
    let helpBuilt = false;
    function openHelp() {
        if (!helpBuilt) {
            const src = $('combo-box');
            if (src) {
                const c = src.cloneNode(true);
                c.removeAttribute('id');
                c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
                const grids = c.querySelectorAll(':scope > div.grid');
                const btns = c.querySelectorAll('.help-switch button');
                if (grids.length === 2 && btns.length === 2) {
                    const set = coop => {
                        grids[0].classList.toggle('hidden', coop);
                        grids[1].classList.toggle('hidden', !coop);
                        btns[0].classList.toggle('on', !coop);
                        btns[1].classList.toggle('on', coop);
                    };
                    btns[0].onclick = () => { sfx.sfxSelect(); set(false); };
                    btns[1].onclick = () => { sfx.sfxSelect(); set(true); };
                    set(false);
                }
                $('help-clone-host').appendChild(c);
                helpBuilt = true;
            }
        }
        $('modal-help').classList.remove('hidden');
    }
    function closeHelp() { $('modal-help').classList.add('hidden'); }
    $('btn-close-help').onclick = () => { sfx.sfxSelect(); closeHelp(); };

    // ---------- Teclado ----------
    function homeActive() {
        if (home.classList.contains('hidden')) return false;
        if (!$('modal-settings').classList.contains('hidden')) return false;
        if (!$('modal-help').classList.contains('hidden')) return false;
        if (OptionsUI.isOpen()) return false;
        return true;
    }
    document.addEventListener('keydown', e => {
        if (!$('modal-help').classList.contains('hidden') && (e.code === 'Escape' || e.code === 'Enter')) { e.preventDefault(); closeHelp(); return; }
        if (!homeActive()) return;
        const k = e.code;
        if (k === 'ArrowUp' || k === 'KeyW') { e.preventDefault(); move(-1); }
        else if (k === 'ArrowDown' || k === 'KeyS') { e.preventDefault(); move(1); }
        else if (k === 'Enter' || k === 'Space' || k === 'NumpadEnter') { e.preventDefault(); activate(); }
        else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); back(); }
    });

    // ---------- Mando ----------
    const padPrev = {};
    let padHold = 0;
    function pollPad(now) {
        requestAnimationFrame(pollPad);
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let up = false, down = false, ok = false, no = false;
        for (const p of pads) {
            if (!p) continue;
            const ay = p.axes[1] || 0;
            up = up || !!(p.buttons[12] && p.buttons[12].pressed) || ay < -0.6;
            down = down || !!(p.buttons[13] && p.buttons[13].pressed) || ay > 0.6;
            ok = ok || !!(p.buttons[0] && p.buttons[0].pressed);
            no = no || !!(p.buttons[1] && p.buttons[1].pressed);
        }
        const cs = !!($('modal-help') && !$('modal-help').classList.contains('hidden'));
        const edge = (k, v) => { const r = v && !padPrev[k]; padPrev[k] = v; return r; };
        const eUp = edge('up', up), eDown = edge('down', down), eOk = edge('ok', ok), eNo = edge('no', no);
        if (cs) { if (eOk || eNo) closeHelp(); return; }
        if (!homeActive()) return;
        // repetición suave al mantener arriba/abajo
        if ((up || down) && now - padHold > 260 && !eUp && !eDown) { padHold = now; move(up ? -1 : 1); }
        if (eUp) { padHold = now; move(-1); }
        if (eDown) { padHold = now; move(1); }
        if (eOk) activate();
        if (eNo) back();
    }

    // ---------- Arranque ----------
    window.goHome = showHome;
    window.openSetup = openSetup;     // lo usan otras pantallas para volver
    requestAnimationFrame(pollPad);
    $('input-player-name').addEventListener('input', refreshPlayerCard);
    if (typeof MenuBackdrop !== 'undefined') MenuBackdrop.start();
    switchScreen('home');
    refreshPlayerCard();
    renderMenu(false);

    // Intro: duelo cinematográfico antes del menú (una vez por visita; se salta con cualquier tecla)
    if (typeof Intro !== 'undefined' && Intro.shouldPlay()) {
        Intro.prepare();
        const go = () => setTimeout(() => Intro.play(showHome), 60);
        if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
    }
})();
