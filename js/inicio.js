'use strict';
// Pestañas del menú, ajuste en PC e inicio del juego

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
        { id: 'controls', label: '📖 CONTROLES', sel: ['#screen-menu > div > div:nth-child(1)', '#screen-menu > div > div:nth-child(1) > div:nth-child(4)'] }
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
    const combos = left.children[3];
    const settingsBtn = document.getElementById('btn-open-settings');
    const soundBtn = document.getElementById('btn-toggle-sound');
    combos.id = 'combo-box';
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

window.onload = async () => {
    renderFighterGrid();
    updateFighterDetails();
    requestAnimationFrame(menuPreviewLoop);
    sfx.startLobbyMusic();
    await net.init();
};
