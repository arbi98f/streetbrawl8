'use strict';
// =========================================================================
// ESTADÍSTICAS LOCALES: partidas, victorias, K.O.s, daño, mejor combo y luchador más usado.
// Se guardan solo en este navegador (localStorage); se ven en OPCIONES → ESTADÍSTICAS.
// =========================================================================
const Stats = (function () {
    const KEY = 'sb8_stats';
    const blank = () => ({ games: 0, wins: 0, kos: 0, damage: 0, bestCombo: 0, byFighter: {} });
    let data = blank();
    try {
        const s = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (s && typeof s === 'object') {
            for (const k of ['games', 'wins', 'kos', 'damage', 'bestCombo']) if (isFinite(s[k]) && s[k] >= 0) data[k] = Math.floor(s[k]);
            if (s.byFighter && typeof s.byFighter === 'object') {
                for (const id of Object.keys(s.byFighter)) {
                    const v = s.byFighter[id];
                    if (v && isFinite(v.g) && isFinite(v.w)) data.byFighter[id] = { g: Math.floor(v.g), w: Math.floor(v.w) };
                }
            }
        }
    } catch (e) { /* sin datos guardados */ }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignorar */ } };

    // Se llama una sola vez al terminar un combate de versus (también en línea): res = { fighter | team | tie }
    function recordMatch(engine, res) {
        if (!engine || engine._statsDone || engine.isPractice || engine.isStory) return;
        const me = (engine.fighters || []).find(f => f.id === engine.localUserId);
        if (!me) return;
        engine._statsDone = true;
        const won = res.team !== undefined ? me.team === res.team : (res.tie ? res.tie.includes(me) : res.fighter === me);
        data.games++;
        if (won) data.wins++;
        data.kos += me.kos || 0;
        data.damage += Math.max(0, Math.round(me.damageDealt || 0));
        data.bestCombo = Math.max(data.bestCombo, me.bestCombo || 0);
        const id = me.archetype && me.archetype.id;
        if (id) { const b = data.byFighter[id] || (data.byFighter[id] = { g: 0, w: 0 }); b.g++; if (won) b.w++; }
        save();
    }
    function favorite() {
        let best = null;
        for (const id of Object.keys(data.byFighter)) if (!best || data.byFighter[id].g > data.byFighter[best].g) best = id;
        return best;
    }
    function reset() { data = blank(); save(); }
    return { recordMatch, favorite, reset, get: () => data };
})();
