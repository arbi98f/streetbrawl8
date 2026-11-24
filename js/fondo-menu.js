'use strict';
// =========================================================================
// FONDO VIVO DEL MENÚ: las 8 arenas pasan solas, como diapositivas con cámara lenta
// Reutiliza el dibujo de arenas del motor (sin crear ninguna partida).
// Opciones guardadas: sb8_bgAnim = 'off' apaga el fondo animado (queda el degradado)
// =========================================================================
const MenuBackdrop = (function () {
    const SLIDE_MS = 7000;      // tiempo de cada arena
    const FADE_MS = 1300;       // duración del fundido entre arenas
    const FPS_MIN_MS = 1000 / 30;

    let canvas, ctx, nameEl;
    let enabled = true;
    try { enabled = localStorage.getItem('sb8_bgAnim') !== 'off'; } catch (e) { /* sin almacenamiento */ }

    const cache = {};     // arenaId -> "renderizador" ligero con los datos que necesita el dibujo
    let order = [], pos = 0, slideStart = 0, lastDraw = 0, started = false;
    let lastActive = 0, idleTotal = 0;   // tiempo acumulado en que el fondo no se veía (no cuenta para las diapositivas)

    function makeRenderer(id) {
        if (cache[id]) return cache[id];
        const r = Object.create(BattleArenaEngine.prototype);
        r.setupWorld();
        r.arena = ARENAS[id];
        r.scenery = r.buildScenery(id);
        r.camera = { x: r.worldWidth / 2, y: r.groundY - 170, zoom: 1, shake: 0, kick: 0, focus: null };
        r.time = 0;
        r.cycle = {};
        r.hazards = [];
        r.ambient = [];
        r.fighters = [];
        r.projectiles = [];
        r.difficulty = 'normal';
        const rng = mulberry32(id.length * 977 + 13);
        r.platforms = r.arena.platforms.map(p => ({ ...p, h: 18, jag: Array.from({ length: 8 }, () => rng() * 26) }));
        cache[id] = r;
        return r;
    }

    // Dibuja una arena con una cámara que se desplaza despacio y se acerca un poco
    function drawArena(id, tSec, alpha) {
        const r = makeRenderer(id);
        const w = canvas.width, h = canvas.height;
        r.time = tSec;
        const k = Math.min(1, tSec / (SLIDE_MS / 1000 + 2));
        const zoom = (h / 640) * (1.0 + 0.10 * k);
        r.camera.x = r.worldWidth / 2 + Math.sin(tSec * 0.12 + id.length) * 360;
        r.camera.y = r.groundY - 190;
        r.camera.zoom = zoom;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(w / 2, h / 2);
        ctx.scale(zoom, zoom);
        ctx.translate(-r.camera.x, -r.camera.y);
        r.ctx = ctx; r.canvas = canvas;
        try {
            r.drawArenaBackground(ctx);
            r.drawPlatforms(ctx);
        } catch (e) { /* una arena que falle no debe romper el menú */ }
        ctx.restore();
    }

    function sizeCanvas() {
        // Resolución reducida: el fondo va detrás de capas oscuras y así consume poco
        const scale = Math.min(1, 960 / Math.max(canvas.clientWidth || 960, 1));
        const w = Math.max(320, Math.round((canvas.clientWidth || 960) * scale));
        const h = Math.max(180, Math.round((canvas.clientHeight || 540) * scale));
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }

    function frame(now) {
        requestAnimationFrame(frame);
        const home = document.getElementById('screen-home');
        if (!enabled || document.hidden || !home || home.classList.contains('hidden')) return;   // oculto: el reloj se detiene
        if (now - lastDraw < FPS_MIN_MS) return;
        // si estuvo oculto (juego, submenú, otra pestaña…) ese tiempo no cuenta: continúa donde quedó
        if (lastActive && now - lastActive > 250) idleTotal += now - lastActive;
        lastActive = now; lastDraw = now;
        sizeCanvas();
        const clock = now - idleTotal;
        if (!slideStart) slideStart = clock;
        let el = clock - slideStart;
        if (el >= SLIDE_MS) { pos = (pos + 1) % order.length; slideStart = clock - (el % SLIDE_MS); el = clock - slideStart; if (nameEl) nameEl.textContent = '◢ ' + ARENAS[order[pos]].name.toUpperCase() + ' ◣'; }
        const id = order[pos];
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const t = clock / 1000;
        const prev = order[(pos - 1 + order.length) % order.length];
        // al inicio de cada diapositiva la anterior se desvanece por detrás
        if (el < FADE_MS && started) {
            drawArena(prev, t, 1);
            drawArena(id, t, el / FADE_MS);
        } else {
            drawArena(id, t, 1);
        }
        started = true;
    }

    function start() {
        canvas = document.getElementById('home-arena-canvas');
        nameEl = document.getElementById('home-arena-name');
        if (!canvas) return;
        ctx = canvas.getContext('2d');
        order = Object.keys(ARENAS);
        // empieza en una arena al azar para que no sea siempre la misma
        pos = Math.floor(Math.random() * order.length);
        if (nameEl) nameEl.textContent = '◢ ' + ARENAS[order[pos]].name.toUpperCase() + ' ◣';
        document.getElementById('screen-home').classList.toggle('bg-off', !enabled);
        requestAnimationFrame(frame);
    }

    function setEnabled(on) {
        enabled = !!on;
        try { localStorage.setItem('sb8_bgAnim', enabled ? 'on' : 'off'); } catch (e) { /* ignorar */ }
        const home = document.getElementById('screen-home');
        if (home) home.classList.toggle('bg-off', !enabled);
        if (!enabled && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { start, setEnabled, isEnabled: () => enabled, _debug: () => ({ pos, order, enabled }) };
})();
