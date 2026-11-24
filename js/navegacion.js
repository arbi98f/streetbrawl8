'use strict';
// =========================================================================
// NAVEGACIÓN DE MENÚS con teclado y mando (el ratón y el tacto siguen funcionando igual).
//   Flechas / WASD / cruceta / stick izq. → mover el foco entre botones (navegación espacial)
//   Enter · Espacio / A                   → aceptar
//   Esc · Backspace / B                   → volver / cerrar
//   Q · E / LB · RB                       → cambiar de pestaña (barra principal)
//   Z · C / LT · RT                       → cambiar la barra secundaria (p. ej. luchador en COMBOS)
// Aplica a: sala/lobby, salas, práctica, opciones, controles, historia y resultados.
// El menú principal (screen-home) conserva su propio manejo.
// =========================================================================
const MenuNav = (function () {
    const $ = id => document.getElementById(id);
    const FOCUSABLE = 'button,a[href],input:not([type=hidden]),select,textarea,[tabindex],[role=button],[role=tab],[onclick],.cursor-pointer';
    const TABLISTS = '.tabbar,.opt-tabs,.cu-tabs,[role=tablist],#ctrl-mode-switch,.help-switch';
    // Orden de prioridad: lo que esté encima manda
    const LAYERS = ['modal-settings', 'modal-options', 'story-overlay', 'screen-results', 'screen-lobby', 'screen-menu'];
    let lastLayer = null, layerSince = 0, usingPad = false;

    const hidden = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { if (n.classList && (n.classList.contains('hidden') || n.classList.contains('tab-off'))) return true; } return false; };
    function visible(el) {
        if (el.disabled || hidden(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.pointerEvents !== 'none';
    }
    function blocked() {
        if (typeof activeRebindType !== 'undefined' && typeof activeRebindAction !== 'undefined' && activeRebindAction) return true;
        const intro = $('intro-overlay'); if (intro && intro.classList.contains('on')) return true;
        const te = $('touch-editor'); if (te && !te.classList.contains('hidden')) return true;
        const help = $('modal-help'); if (help && !help.classList.contains('hidden')) return true;   // lo gestiona menu-principal
        return false;
    }
    // Capa activa: el elemento visible más "alto"
    function layer() {
        if (blocked()) return null;
        const pause = $('pause-overlay');
        if (pause && !pause.classList.contains('hidden') && !$('screen-game').classList.contains('hidden')) return pause;
        for (const id of LAYERS) { const el = $(id); if (el && !el.classList.contains('hidden')) return el; }
        return null;      // home, partida y personalizar tienen su propio manejo
    }
    function candidates(root) {
        return [...root.querySelectorAll(FOCUSABLE)].filter(el => {
            if (el.tagName === 'DIV' || el.tagName === 'SPAN' || el.tagName === 'LI') { if (el.getAttribute('tabindex') === null) el.setAttribute('tabindex', '-1'); }
            if (el.tabIndex < -1 && el.tagName !== 'INPUT') return false;
            return visible(el);
        });
    }
    const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; };

    function move(root, dx, dy) {
        const list = candidates(root);
        if (!list.length) return;
        let cur = document.activeElement;
        if (!cur || !root.contains(cur) || !list.includes(cur)) {
            // primer foco: el elemento marcado como activo/seleccionado, si no el primero en orden de lectura
            cur = list.find(e => e.classList.contains('on') || e.getAttribute('aria-selected') === 'true' || e.classList.contains('selected')) ||
                [...list].sort((a, b) => { const A = center(a), B = center(b); return (A.y - B.y) || (A.x - B.x); })[0];
            return focus(cur);
        }
        const c = center(cur);
        let best = null, bs = Infinity;
        for (const o of list) {
            if (o === cur || cur.contains(o) || o.contains(cur)) continue;
            const p = center(o);
            const vx = p.x - c.x, vy = p.y - c.y;
            const along = dx ? vx * dx : vy * dy;
            if (along <= 2) continue;
            const across = dx ? Math.abs(vy) : Math.abs(vx);
            // Debe quedar en un cono razonable (no más lateral que "hacia adelante" × 1.6, salvo solape de bordes)
            const overlap = dx ? (p.r.top < c.r.bottom && p.r.bottom > c.r.top) : (p.r.left < c.r.right && p.r.right > c.r.left);
            if (!overlap && across > along * 1.6 + 30) continue;
            const s = along + across * (overlap ? 0.6 : 2.2);
            if (s < bs) { bs = s; best = o; }
        }
        if (best) focus(best);
        else {
            // Nada en esa dirección: si hay un contenedor desplazable, desplázalo un poco
            for (let n = cur.parentElement; n && n !== document.body; n = n.parentElement) {
                if (dy && n.scrollHeight > n.clientHeight + 4) { n.scrollTop += dy * 90; break; }
            }
        }
    }
    function focus(el) {
        if (!el) return;
        document.body.classList.add('kbnav');
        try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
        try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignorar */ }
        try { sfx.sfxSelect && sfx.sfxSelect(); } catch (e) { /* ignorar */ }
        hint();
    }

    function adjust(el, dir) {         // ←/→ sobre deslizadores y desplegables
        if (el.tagName === 'INPUT' && el.type === 'range') {
            const st = +el.step || 1, mn = el.min === '' ? 0 : +el.min, mx = el.max === '' ? 100 : +el.max;
            const v = Math.max(mn, Math.min(mx, (+el.value) + dir * Math.max(st, (mx - mn) / 20)));
            el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        if (el.tagName === 'SELECT') {
            const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + dir));
            if (i !== el.selectedIndex) { el.selectedIndex = i; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
            return true;
        }
        return false;
    }

    function activeTab(bar) {
        const t = [...bar.querySelectorAll('button,[role=tab]')].filter(b => visible(b) && !(bar.id === 'opt-tabs' && /CONTROL/i.test(b.textContent)));
        const i = t.findIndex(b => b.getAttribute('aria-selected') === 'true' || /\b(on|active|sel|selected)\b/.test(b.className));
        return { t, i };
    }
    function tabs(root, dir, secondary) {
        const bars = [...root.querySelectorAll(TABLISTS)].filter(b => visible(b) && b.querySelectorAll('button,[role=tab]').length > 1);
        if (!bars.length) return false;
        const bar = secondary ? (bars[1] || bars[0]) : bars[0];
        const { t, i } = activeTab(bar);
        if (!t.length) return false;
        const n = t[(Math.max(0, i) + dir + t.length) % t.length];
        n.click();
        document.body.classList.add('kbnav');
        // la barra puede reconstruirse al hacer clic (opciones): conserva el foco en la pestaña activa
        setTimeout(() => { const r2 = layer(); if (!r2) return; const bs = [...r2.querySelectorAll(TABLISTS)].filter(visible); const b2 = bs[secondary ? (bs[1] ? 1 : 0) : 0]; if (b2) { const a = activeTab(b2); if (a.t[a.i]) try { a.t[a.i].focus({ preventScroll: true }); } catch (e) { /* ignorar */ } } }, 30);
        return true;
    }

    function back(root) {
        const sel = '.btn-back,[id$="-back"],[id$="_back"],[id$="-cancel"],[id^="btn-close"],[id$="-close"],[id*="close"],[data-back]';
        const b = [...root.querySelectorAll(sel)].find(visible);
        if (b) { b.click(); return true; }
        return false;
    }

    // ----- acciones comunes (teclado y mando) -----
    function act(name, root, fromPad) {
        usingPad = !!fromPad;
        const cur = document.activeElement;
        const typing = cur && (cur.tagName === 'TEXTAREA' || (cur.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes(cur.type)));
        switch (name) {
            case 'left': case 'right': {
                if (!fromPad && typing) return false;
                const d = name === 'left' ? -1 : 1;
                if (cur && root.contains(cur) && adjust(cur, d)) return true;
                move(root, d, 0); return true;
            }
            case 'up': case 'down':
                if (!fromPad && typing && false) return false;
                move(root, 0, name === 'up' ? -1 : 1); return true;
            case 'ok': {
                if (cur && root.contains(cur) && cur !== document.body) {
                    if (typing && !fromPad) return false;
                    if (cur.tagName === 'SELECT' || (cur.tagName === 'INPUT' && cur.type === 'range')) return fromPad;
                    cur.click(); return true;
                }
                move(root, 0, 0); return true;
            }
            case 'back':
                if (typing) { cur.blur(); return true; }
                return back(root);
            case 'tabL': return tabs(root, -1, false);
            case 'tabR': return tabs(root, 1, false);
            case 'subL': return tabs(root, -1, true);
            case 'subR': return tabs(root, 1, true);
        }
        return false;
    }

    // ----- Teclado -----
    const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', Escape: 'back', Backspace: 'back', KeyQ: 'tabL', KeyE: 'tabR', KeyZ: 'subL', KeyC: 'subR', PageUp: 'tabL', PageDown: 'tabR' };
    document.addEventListener('keydown', e => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const root = layer(); if (!root) return;
        const cur = document.activeElement;
        const typing = cur && (cur.tagName === 'TEXTAREA' || (cur.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes(cur.type)));
        let name = KEYS[e.code];
        // Escribiendo un nombre: solo Esc (soltar el campo) y ↑/↓ se interpretan; las letras son del texto
        if (typing && !['Escape', 'ArrowUp', 'ArrowDown'].includes(e.code)) return;
        if (e.code === 'Backspace' && (typing || (cur && cur.tagName === 'SELECT'))) return;
        if (cur && cur.tagName === 'SELECT' && ['ArrowUp', 'ArrowDown'].includes(e.code)) { /* navega fuera del desplegable */ }
        if (e.code === 'Escape' && (root.id === 'modal-options')) return;   // ya lo gestiona ajustes.js
        if (e.code === 'Escape' && root.id === 'pause-overlay') return;      // lo gestiona el motor
        if (!name) {
            // Enter/Espacio sobre elementos no nativos (div con tabindex)
            if ((e.code === 'Enter' || e.code === 'Space') && cur && root.contains(cur) && !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(cur.tagName) && cur.tagName !== 'BODY') {
                e.preventDefault(); cur.click(); document.body.classList.add('kbnav');
            }
            return;
        }
        if (root.id === 'pause-overlay' && (name === 'back' || name === 'tabL' || name === 'tabR')) return;
        if (act(name, root, false)) { e.preventDefault(); document.body.classList.add('kbnav'); usingPad = false; hint(); }
    }, true);

    // ----- Mando -----
    const prev = {}, nextAt = {};
    function poll(now) {
        requestAnimationFrame(poll);
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        let ax = 0, ay = 0; const b = {};
        let any = false;
        for (const p of pads) {
            if (!p || !p.connected) continue;
            any = true;
            ax += p.axes[0] || 0; ay += p.axes[1] || 0;
            const bt = i => !!(p.buttons[i] && p.buttons[i].pressed);
            ['0', '1', '4', '5', '6', '7', '12', '13', '14', '15'].forEach(i => { b[i] = b[i] || bt(+i); });
        }
        if (!any) return;
        const st = {
            left: b[14] || ax < -0.55, right: b[15] || ax > 0.55, up: b[12] || ay < -0.55, down: b[13] || ay > 0.55,
            ok: b[0], back: b[1], tabL: b[4], tabR: b[5], subL: b[6], subR: b[7]
        };
        const root = layer();
        if (!root || (root.id === 'pause-overlay' && false)) { for (const k in st) prev[k] = st[k]; return; }
        if (root !== lastLayer) { lastLayer = root; layerSince = now; }
        if (now - layerSince < 320) { for (const k in st) prev[k] = st[k]; return; }   // evita pulsaciones heredadas al cambiar de pantalla
        for (const k in st) {
            const on = st[k];
            const edge = on && !prev[k];
            const dir = k === 'left' || k === 'right' || k === 'up' || k === 'down';
            let fire = edge;
            if (edge) nextAt[k] = now + 380;
            else if (on && dir && now >= nextAt[k]) { fire = true; nextAt[k] = now + 110; }
            prev[k] = on;
            if (!fire) continue;
            if (root.id === 'pause-overlay' && (k === 'back')) continue;   // el motor ya reanuda con B/Start
            act(k, root, true);
        }
    }
    requestAnimationFrame(poll);

    // El ratón o el tacto ocultan el aro de foco
    window.addEventListener('pointerdown', () => { document.body.classList.remove('kbnav'); hint(); }, true);

    // ----- Barra de ayuda inferior -----
    let hintEl = null;
    function hint() {
        if (!hintEl) {
            hintEl = document.createElement('div'); hintEl.id = 'nav-hint'; hintEl.setAttribute('aria-hidden', 'true'); document.body.appendChild(hintEl);
        }
        const on = document.body.classList.contains('kbnav') && !!layer();
        hintEl.classList.toggle('on', on);
        if (on) {
            const t = usingPad ? '✛ Mover · A Aceptar · B Volver · LB/RB Pestañas' : '←↑↓→ Mover · Enter Aceptar · Esc Volver · Q/E Pestañas';
            const k = usingPad ? 'p' : 'k';
            if (hintEl.dataset.k !== k) { hintEl.dataset.k = k; hintEl.textContent = t; }
        }
    }
    return { layer, move, hint };
})();
