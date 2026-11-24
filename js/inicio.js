'use strict';
// Pestañas del menú, ajuste en PC e inicio del juego

// =========================================================================
// PANEL "COMBOS": lista los 3 combos de cada luchador (los movimientos básicos están en CÓMO JUGAR)
// =========================================================================
(function buildComboPanel() {
    const menu = document.getElementById('screen-menu');
    const left = menu.querySelector(':scope > div.grid').children[0];
    const old = left.children[3];            // texto de controles básicos: se conserva oculto para CÓMO JUGAR
    old.id = 'combo-box'; old.style.display = 'none';
    const panel = document.createElement('div');
    panel.id = 'combos-panel';
    panel.className = old.className;
    panel.innerHTML = '<div class="cb-head"><h3 class="font-arcade text-[10px] sm:text-xs text-yellow-400">COMBOS</h3><span class="cb-hint">Pulsa los golpes seguidos, sin pausa. Controles básicos en CÓMO JUGAR.</span></div>' +
        '<div class="cb-bar"><div id="cb-chips" class="cb-chips" role="tablist" aria-label="Luchador"></div>' +
        '<div id="cb-scheme" class="help-switch cb-scheme" role="tablist" aria-label="Controles"><button type="button" data-s="touch" role="tab">TÁCTIL</button><button type="button" data-s="kb" role="tab">TECLADO</button><button type="button" data-s="gp" role="tab">MANDO</button></div></div>' +
        '<div id="cb-list" class="cb-list"></div>';
    left.appendChild(panel);

    const TOUCH = { lp: 'P.D', mp: 'P.M', hp: 'P.F', lk: 'K.D', mk: 'K.M', hk: 'K.F' };
    let scheme = null;
    // Etiquetas reales según el esquema elegido (teclado y mando respetan lo que hayas reasignado)
    const kbName = (code) => String(code || '?').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num');
    const label = (b) => {
        if (scheme === 'kb') {
            const k = (CtrlProfiles.kb('versus')[b] || [])[0];
            return k ? (/^Arrow/.test(k) ? { Up: '↑', Down: '↓', Left: '←', Right: '→' }[k.slice(5)] : kbName(k)) : '?';
        }
        if (scheme === 'gp') { const n = CtrlProfiles.gp('versus')[b]; return GAMEPAD_BUTTON_NAMES[n] || '?'; }
        return TOUCH[b];
    };
    const key = (b) => `<span class="cb-btn ${b[1] === 'p' ? 'p' : 'k'}"><b>${label(b)}</b></span>`;
    const step = (k) => {
        if (k === 'launcher') return `<span class="cb-mod">↓</span>${key('hp')}`;
        if (k[0] === 'c') return `<span class="cb-mod">↓</span>${key(k.slice(1))}`;
        if (k[0] === 'j') return `<span class="cb-mod">AIRE</span>${key(k.slice(1))}`;
        return key(k);
    };
    const effects = (c) => {
        const t = [];
        if (c.launch) t.push('Lanza al aire');
        if (c.knock) t.push('Derriba');
        if (c.unblock) t.push('No se puede bloquear');
        if (c.dot) t.push(c.dot[0] === 'burn' ? 'Quema' : 'Envenena');
        if (c.stun) t.push('Aturde');
        if (c.kbm && c.kbm >= 1.4 && !c.knock && !c.launch) t.push('Empuje fuerte');
        if (c.crouch) t.push('Extra si el rival está agachado');
        return t;
    };
    let cur = null;
    function defaultScheme() {
        let gp = false; try { gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(g => g && g.connected); } catch (e) {}
        if (typeof TouchPad !== 'undefined' && TouchPad.shouldShow()) return 'touch';
        return gp ? 'gp' : 'kb';
    }
    function render() {
        if (!scheme) scheme = defaultScheme();
        document.querySelectorAll('#cb-scheme button').forEach(b => { b.classList.toggle('on', b.dataset.s === scheme); b.setAttribute('aria-selected', b.dataset.s === scheme ? 'true' : 'false'); });
        const chips = document.getElementById('cb-chips'), list = document.getElementById('cb-list');
        chips.innerHTML = '';
        for (const a of FIGHTER_ARCHETYPES) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'cb-chip' + (a.id === cur ? ' on' : '');
            b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', a.id === cur ? 'true' : 'false');
            b.style.setProperty('--c', a.primary);
            b.innerHTML = `<span class="cb-ic">${a.icon}</span><span class="cb-nm"></span>`;
            b.querySelector('.cb-nm').textContent = a.name;
            b.onclick = () => { if (typeof sfx !== 'undefined') sfx.sfxSelect(); cur = a.id; render(); };
            chips.appendChild(b);
        }
        const arch = FIGHTER_ARCHETYPES.find(a => a.id === cur) || FIGHTER_ARCHETYPES[0];
        list.innerHTML = '';
        for (const c of Combos.defs(arch.id)) {
            const d = document.createElement('div');
            d.className = 'cb-card'; d.style.setProperty('--c', arch.primary);
            const nm = document.createElement('div'); nm.className = 'cb-name'; nm.textContent = '¡' + c.name + '!';
            const sq = document.createElement('div'); sq.className = 'cb-seq'; sq.innerHTML = c.seq.map(step).join('<i class="cb-arrow">›</i>');
            const ef = document.createElement('div'); ef.className = 'cb-fx';
            const tags = ['+' + c.dmg + ' DMG'].concat(effects(c));
            tags.forEach((t, i) => { const s = document.createElement('span'); s.textContent = t; if (i === 0) s.className = 'dmg'; ef.appendChild(s); });
            d.appendChild(nm); d.appendChild(sq); d.appendChild(ef);
            list.appendChild(d);
        }
    }
    document.querySelectorAll('#cb-scheme button').forEach(b => { b.onclick = () => { if (typeof sfx !== 'undefined') sfx.sfxSelect(); scheme = b.dataset.s; render(); }; });
    window.__combosPanel = { sync() { cur = (typeof state !== 'undefined' && state.selectedArchetypeId) || FIGHTER_ARCHETYPES[0].id; render(); } };
    window.__combosPanel.sync();
})();

// =========================================================================
// PESTAÑAS (solo se activan en horizontal bajo: menú y lobby)
// =========================================================================
(function setupTabs() {
    document.getElementById('btn-allow-portrait').onclick = () => document.body.classList.add('allow-portrait');

    function build(host, before, tabs, group) {
        const bar = document.createElement('div');
        bar.className = 'tabbar';
        const items = tabs.map(t => ({ ...t, els: t.sel.map(s => document.querySelector(s)).filter(Boolean) }));
        items.forEach(t => t.els.forEach(e => { e.dataset.tab = (e.dataset.tab ? e.dataset.tab + ' ' : '') + t.id; }));
        const all = [...new Set(items.flatMap(t => t.els))];
        const select = (id) => {
            bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.t === id));
            all.forEach(e => e.classList.toggle('tab-off', !e.dataset.tab.split(' ').includes(id)));
            try { sessionStorage.setItem('tab_' + group, id); } catch (e) {}
        };
        items.forEach(t => {
            const b = document.createElement('button');
            b.type = 'button'; b.dataset.t = t.id; b.textContent = t.label;
            b.onclick = () => { select(t.id); host.scrollTop = 0; };
            bar.appendChild(b);
        });
        before.parentNode.insertBefore(bar, before);
        let start = items[0].id;
        try { const s = sessionStorage.getItem('tab_' + group); if (items.some(i => i.id === s)) start = s; } catch (e) {}
        select(start);
        return select;
    }

    // MENÚ: luchador | salas | controles
    const menu = document.getElementById('screen-menu');
    const grid = menu.querySelector(':scope > div.grid');
    const left = grid.children[0], right = grid.children[1];
    const selMenu = build(menu, grid, [
        { id: 'fighter', label: '🥊 LUCHADOR', sel: ['#screen-menu > div > div:nth-child(1)', '#screen-menu > div > div:nth-child(1) > div:nth-child(1)', '#screen-menu > div > div:nth-child(1) > div:nth-child(2)', '#fighter-details'] },
        { id: 'rooms', label: '🎮 SALAS', sel: ['#screen-menu > div > div:nth-child(2)'] },
        { id: 'controls', label: '⚡ COMBOS', sel: ['#screen-menu > div > div:nth-child(1)', '#combos-panel'] }
    ], 'menu');

    window.__menuTabs = selMenu;
})();

// =========================================================================
// MENÚ EN PC: Ajustes + Sistema de combos pasan a la columna derecha (como el diseño de referencia)
// =========================================================================
(function setupDesktopMenu() {
    const menu = document.getElementById('screen-menu');
    const grid = menu.querySelector(':scope > div.grid');
    const left = grid.children[0], right = grid.children[1];
    const headRow = left.children[0];
    const btnBox = headRow.children[1];
    const combos = document.getElementById('combos-panel');
    const settingsBtn = document.getElementById('btn-open-settings');
    const soundBtn = document.getElementById('btn-toggle-sound');
    const extra = document.createElement('div');
    extra.id = 'menu-right-extra';
    settingsBtn.classList.add('settings-tab');
    const fab = document.createElement('div');
    fab.id = 'sound-fab';
    document.body.appendChild(fab);
    let desktop = null;
    function isDesktop() {
        return window.innerWidth >= 1024 && !(window.innerHeight <= 520 && window.innerWidth > window.innerHeight);
    }
    function apply() {
        const d = isDesktop();
        if (d === desktop) return;
        desktop = d;
        document.body.classList.toggle('menu-desktop', d);
        if (d) {
            extra.appendChild(settingsBtn);
            extra.appendChild(combos);
            right.appendChild(extra);
            fab.appendChild(soundBtn);
            btnBox.style.display = 'none';
        } else {
            btnBox.style.display = '';
            btnBox.insertBefore(settingsBtn, btnBox.firstChild);
            btnBox.appendChild(soundBtn);
            left.appendChild(combos);
            if (extra.parentNode) extra.parentNode.removeChild(extra);
        }
    }
    window.addEventListener('resize', apply);
    apply();
})();

// Accesibilidad: nombre para lectores de pantalla en botones con solo icono, avisos y ventanas
(function a11y() {
    const run = () => {
        document.querySelectorAll('button[title]:not([aria-label])').forEach(b => b.setAttribute('aria-label', b.getAttribute('title')));
        document.querySelectorAll('.sb-modal').forEach(m => { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); });
        const t = document.getElementById('toast-container'); if (t) { t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); }
        const s = document.getElementById('lobby-status-msg'); if (s) s.setAttribute('aria-live', 'polite');
        const c = document.getElementById('game-canvas'); if (c) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Arena de combate'); }
        document.querySelectorAll('select:not([aria-label])').forEach(sel => { const l = sel.previousElementSibling; if (l && l.tagName === 'LABEL') sel.setAttribute('aria-label', l.textContent.trim()); });
    };
    run();
    window.addEventListener('load', run);
})();

window.onload = async () => {
    renderFighterGrid();
    updateFighterDetails();
    requestAnimationFrame(menuPreviewLoop);
    sfx.startLobbyMusic();
    await net.init();
};


// Altura real de la ventana (algunos móviles cambian con la barra del navegador): se usa como --app-h
(function trackViewport() {
    const set = () => document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    window.addEventListener('resize', set);
    window.addEventListener('orientationchange', () => setTimeout(set, 250));
    set();
})();
