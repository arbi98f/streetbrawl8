'use strict';
// =========================================================================
// PERSONALIZACIÓN: cambia los colores del luchador SIN cambiar su dibujo.
//   Ranuras: CABEZA/PELO · TORSO/POLO · ACCESORIO (bufanda, guantes…) · PIERNAS · CALZADO · PIEL
//   - Torso, piernas, calzado y piel se aplican sobre los colores `look` del arquetipo.
//   - Cabeza y accesorio sustituyen los colores sueltos que usan las capas únicas de cada personaje
//     (bufanda de Ronin, llamas de Blaze…) conservando sus matices (más claro / más oscuro).
//   - Se guarda por personaje en este navegador y viaja con el jugador en la sala (los demás te ven así).
// =========================================================================
const LOOK_SLOTS = [
    { id: 'head', label: 'CABEZA / PELO' },
    { id: 'torso', label: 'TORSO / POLO' },
    { id: 'acc', label: 'BUFANDA / ACCESORIO' },
    { id: 'legs', label: 'PIERNAS' },
    { id: 'shoes', label: 'CALZADO' },
    { id: 'skin', label: 'PIEL' }
];
// Colores sueltos de las capas únicas de cada personaje (el primero es el color base de la ranura)
const LOOK_STRINGS = {
    ronin:   { head: ['#111827', '#374151'], acc: ['#ef4444', '#991b1b', '#7f1d1d', '#dc2626'] },
    blaze:   { head: ['#f97316', '#b91c1c', '#c2410c', '#be123c'], acc: ['#facc15', '#fbbf24'] },
    storm:   { head: ['#e0f2fe'], acc: ['#fde047'] },
    vixen:   { head: ['#3b0764', '#0f0a1f'], acc: ['#c084fc', '#f0abfc', '#f5d0fe', '#4c1d95'] },
    cyborg:  { head: ['#ec4899', '#831843'], acc: ['#22d3ee', '#a5f3fc'] },
    zephyra: { head: ['#10b981', '#047857', '#064e3b'], acc: ['#34d399', '#6ee7b7', '#a7f3d0'] },
    titan:   { head: ['#1c1917', '#7c2d12'], acc: ['#78716c', '#a8a29e'] },
    viper:   { head: ['#1a2e05', '#14532d'], acc: ['#4d7c0f', '#bef264'] }
};
const LOOK_PALETTE = ['#f8fafc', '#94a3b8', '#1e293b', '#0b0b0f', '#ef4444', '#f97316', '#facc15', '#a3e635', '#22c55e', '#14b8a6', '#38bdf8', '#2563eb', '#8b5cf6', '#d946ef', '#ec4899', '#78350f'];
const SKIN_PALETTE = ['#ffe0c2', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e', '#94a3b8', '#d9f99d'];
const LOOK_KEY = 'sb8_look';
const HEX6 = /^#[0-9a-f]{6}$/i;

const Look = (function () {
    const cache = new Map();

    function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
    function toHsl(h) {
        let [r, g, b] = hexToRgb(h).map(v => v / 255);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let hh = 0, s = 0;
        if (mx !== mn) {
            const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6;
        }
        return [hh, s, l];
    }
    function fromHsl(h, s, l) {
        const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
        if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
    }
    // Lleva el matiz de `orig` respecto a `base` al color elegido
    function tone(chosen, orig, base) {
        if (orig.toLowerCase() === base.toLowerCase()) return chosen;
        const c = toHsl(chosen), o = toHsl(orig), b = toHsl(base);
        return fromHsl(c[0], c[1], Math.max(0.04, Math.min(0.96, c[2] + (o[2] - b[2]))));
    }
    // Clave canónica 'r,g,b' de un color CSS (#rgb, #rrggbb o rgb(r,g,b))
    function key(v) {
        if (v[0] === '#') {
            if (v.length === 7) return hexToRgb(v).join(',');
            if (v.length === 4) return [1, 2, 3].map(i => parseInt(v[i] + v[i], 16)).join(',');
            return null;
        }
        const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(v);
        return m ? `${m[1]},${m[2]},${m[3]}` : null;
    }

    function load() { try { return JSON.parse(localStorage.getItem(LOOK_KEY)) || {}; } catch (e) { return {}; } }
    function persist(o) { try { localStorage.setItem(LOOK_KEY, JSON.stringify(o)); } catch (e) { /* ignorar */ } }
    function clean(look) {
        const out = {};
        if (look && typeof look === 'object') for (const s of LOOK_SLOTS) if (typeof look[s.id] === 'string' && HEX6.test(look[s.id])) out[s.id] = look[s.id].toLowerCase();
        return out;
    }
    function get(id) { return clean(load()[id]); }
    function set(id, slot, hex) { const o = load(); o[id] = clean({ ...(o[id] || {}), [slot]: hex }); persist(o); }
    function reset(id) { const o = load(); delete o[id]; persist(o); }

    // Devuelve una copia del arquetipo con los colores aplicados (con caché)
    function resolve(arch, lookIn) {
        const look = clean(lookIn);
        if (!Object.keys(look).length) return arch;
        const ck = arch.id + JSON.stringify(look);
        if (cache.has(ck)) return cache.get(ck);
        const a = { ...arch, look: { ...arch.look }, _dk: null };
        const L = a.look, orig = arch.look;
        if (look.skin) {
            for (const k of Object.keys(L)) if (typeof L[k] === 'string' && L[k].toLowerCase() === arch.skin.toLowerCase()) L[k] = look.skin;
            a.skin = look.skin;
        }
        if (look.torso) {
            L.top = look.torso;
            if (orig.upperArm.toLowerCase() === orig.top.toLowerCase()) L.upperArm = look.torso;
            if (orig.foreArm.toLowerCase() !== arch.skin.toLowerCase()) L.foreArm = tone(look.torso, orig.foreArm, orig.top);
        }
        if (look.legs) { L.pants = look.legs; if (orig.shin) L.shin = tone(look.legs, orig.shin, orig.pants); }
        if (look.shoes) L.boot = look.shoes;
        if (look.acc) L.glove = look.acc;
        const rc = {};
        const st = LOOK_STRINGS[arch.id] || {};
        for (const slot of ['head', 'acc']) {
            if (!look[slot] || !st[slot]) continue;
            const base = st[slot][0];
            for (const o of st[slot]) {
                const nw = tone(look[slot], o, base), k = key(o);
                if (k && !(k in rc)) {
                    rc[k] = nw;
                    const dk = key(shadeColor(o, -0.32));
                    if (dk && !(dk in rc)) rc[dk] = shadeColor(nw, -0.32);
                }
            }
        }
        a._recolor = Object.keys(rc).length ? rc : null;
        if (a._recolor) {
            // Un color elegido para torso/piernas/etc. no debe coincidir con uno que se sustituye: se mueve 1 punto
            const free = h => {
                if (typeof h !== 'string' || !HEX6.test(h)) return h;
                let [r, g, b] = hexToRgb(h);
                for (let i = 0; i < 6; i++) {
                    const c = rgbToHex(r, g, b), dk = key(shadeColor(c, -0.32));
                    if (!(key(c) in rc) && !(dk in rc)) return c;
                    b = b > 250 ? b - 1 : b + 1;
                }
                return h;
            };
            for (const k of Object.keys(L)) if (typeof L[k] === 'string') L[k] = free(L[k]);
            a.skin = free(a.skin);
        }
        cache.set(ck, a);
        return a;
    }

    // Dibuja con los colores sustituidos: intercepta fillStyle/strokeStyle sólo durante este dibujo
    const PROTO = CanvasRenderingContext2D.prototype;
    const D = { fillStyle: Object.getOwnPropertyDescriptor(PROTO, 'fillStyle'), strokeStyle: Object.getOwnPropertyDescriptor(PROTO, 'strokeStyle') };
    function withRecolor(ctx, rc, fn) {
        if (!rc) return fn();
        for (const p of ['fillStyle', 'strokeStyle']) {
            Object.defineProperty(ctx, p, {
                configurable: true,
                get() { return D[p].get.call(ctx); },
                set(v) { if (typeof v === 'string') { const k = key(v); if (k && rc[k]) v = rc[k]; } D[p].set.call(ctx, v); }
            });
        }
        try { return fn(); } finally { delete ctx.fillStyle; delete ctx.strokeStyle; }
    }

    // Colores actuales de cada ranura para mostrarlos en el editor
    function slotColor(arch, look, slot) {
        if (look[slot]) return look[slot];
        const L = arch.look;
        return { head: (LOOK_STRINGS[arch.id] || {}).head ? LOOK_STRINGS[arch.id].head[0] : '#111827', torso: L.top, acc: (LOOK_STRINGS[arch.id] || {}).acc ? LOOK_STRINGS[arch.id].acc[0] : L.glove, legs: L.pants, shoes: L.boot, skin: arch.skin }[slot];
    }

    return { get, set, reset, resolve, withRecolor, slotColor, clean, all: load };
})();

// ---------------------------------------------------------------------------
// Pantalla de personalización
// ---------------------------------------------------------------------------
const Custom = (function () {
    const $ = id => document.getElementById(id);
    let idx = 0, raf = 0, t0 = 0, moveIdx = 0;
    const MOVES = [['idle', 70], ['mp', 24], ['idle', 30], ['hk', 40], ['idle', 30], ['special', 34], ['idle', 40], ['super', 46], ['idle', 60]];
    const MOVE_TOTAL = MOVES.reduce((a, m) => a + m[1], 0);

    const arch = () => FIGHTER_ARCHETYPES[idx];
    const hex2 = v => (HEX6.test(v) ? v : '#000000');

    function open() {
        idx = Math.max(0, FIGHTER_ARCHETYPES.findIndex(a => a.id === state.selectedArchetypeId));
        switchScreen('custom');
        renderPanel();
        t0 = performance.now();
        cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    }
    function close() {
        cancelAnimationFrame(raf); raf = 0;
        state.selectedArchetypeId = arch().id;
        if (typeof renderFighterGrid === 'function') renderFighterGrid();
        goHome();
    }
    function isOpen() { return !$('screen-custom').classList.contains('hidden'); }

    function renderPanel() {
        const a = arch(), look = Look.get(a.id);
        $('cu-name').textContent = a.name;
        $('cu-trait').textContent = a.trait || '';
        const rows = LOOK_SLOTS.map(s => {
            const cur = Look.slotColor(a, look, s.id);
            const pal = (s.id === 'skin' ? SKIN_PALETTE : LOOK_PALETTE).map(c => `<button class="cu-sw${c.toLowerCase() === String(cur).toLowerCase() ? ' on' : ''}" data-slot="${s.id}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
            return `<div class="cu-row"><div class="cu-lab"><span>${s.label}</span><input type="color" class="cu-pick" data-slot="${s.id}" value="${hex2(cur)}" aria-label="${s.label}"></div><div class="cu-pal">${pal}</div></div>`;
        }).join('');
        $('cu-slots').innerHTML = rows;
    }
    function applyColor(slot, hex) { Look.set(arch().id, slot, hex); renderPanel(); }

    function loop(now) {
        if (!isOpen()) return;
        raf = requestAnimationFrame(loop);
        const cv = $('cu-canvas'); if (!cv) return;
        let frame = Math.floor((now - t0) / (1000 / 60)) % MOVE_TOTAL, cur = MOVES[0];
        for (const m of MOVES) { if (frame < m[1]) { cur = m; break; } frame -= m[1]; }
        const a = Look.resolve(arch(), Look.get(arch().id));
        const ctx = cv.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
        const sc = Math.min(cv.width / 150, cv.height / 190) * a.build.s;
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(cv.width * 0.5, cv.height - 22, 58 * sc / 1.5, 10 * sc / 1.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(cv.width * 0.5, cv.height - 24); ctx.scale(sc, sc);
        const f = { archetype: a, state: cur[0], stateTimer: cur[1] - frame, stateMax: cur[1], alive: true, onGround: true, vx: 0, vy: 0, facing: 1, animFrame: now / 1000 * 10.8, stunTimer: 0, blocking: false, crouching: false, inJuggle: false, mp: cur[0] === 'super' ? 100 : 0, hitFlash: 0, slotIndex: 0 };
        FighterArt.draw(ctx, f, now / 1000);
    }

    function step(d) { idx = (idx + d + FIGHTER_ARCHETYPES.length) % FIGHTER_ARCHETYPES.length; sfx.sfxSelect(); renderPanel(); }

    document.addEventListener('click', e => {
        if (!isOpen()) return;
        const sw = e.target.closest('.cu-sw'); if (sw) { sfx.sfxSelect(); applyColor(sw.dataset.slot, sw.dataset.c); }
    });
    document.addEventListener('input', e => {
        if (!isOpen()) return;
        if (e.target.classList && e.target.classList.contains('cu-pick')) Look.set(arch().id, e.target.dataset.slot, e.target.value);   // en vivo, sin repintar el panel
    });
    document.addEventListener('change', e => { if (isOpen() && e.target.classList && e.target.classList.contains('cu-pick')) renderPanel(); });
    $('cu-prev').onclick = () => step(-1);
    $('cu-next').onclick = () => step(1);
    $('cu-reset').onclick = () => { sfx.sfxSelect(); Look.reset(arch().id); renderPanel(); };
    $('cu-random').onclick = () => {
        sfx.sfxSelect();
        const rnd = () => LOOK_PALETTE[Math.floor(Math.random() * LOOK_PALETTE.length)];
        for (const s of LOOK_SLOTS) if (s.id !== 'skin') Look.set(arch().id, s.id, rnd());
        renderPanel();
    };
    $('cu-back').onclick = () => { sfx.sfxSelect(); close(); };
    document.addEventListener('keydown', e => {
        if (!isOpen()) return;
        if (e.code === 'Escape' || e.code === 'Backspace') { if (document.activeElement && document.activeElement.type === 'color') return; e.preventDefault(); close(); }
        else if (e.code === 'ArrowLeft') { e.preventDefault(); step(-1); }
        else if (e.code === 'ArrowRight') { e.preventDefault(); step(1); }
    });

    return { open, close, isOpen };
})();
