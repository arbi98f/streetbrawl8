'use strict';
// =========================================================================
// PRUEBAS AUTOMÁTICAS DE STREET BRAWL 8  (red de seguridad antes de tocar el combate)
//
// Cómo usarlas: abre el juego con  index.html?pruebas=1  (o  tu-web/?pruebas=1 )
// Se ejecutan solas, sin instalar nada, y muestran una lista de ✔ / ✘ en pantalla.
// No modifican el juego: crean motores de prueba aparte y los destruyen al terminar.
// =========================================================================
(function () {
    const resultados = [];
    let grupoActual = '';

    function grupo(nombre) { grupoActual = nombre; }
    function prueba(nombre, fn) {
        const t0 = performance.now();
        try {
            const detalle = fn();
            resultados.push({ grupo: grupoActual, nombre, ok: true, detalle: detalle || '', ms: performance.now() - t0 });
        } catch (e) {
            resultados.push({ grupo: grupoActual, nombre, ok: false, detalle: (e && e.message) || String(e), ms: performance.now() - t0 });
        }
    }
    function afirmar(cond, msg) { if (!cond) throw new Error(msg || 'La condición no se cumple'); }
    function igual(real, esperado, msg) {
        if (real !== esperado) throw new Error(`${msg || 'Valor distinto'}: esperado ${esperado}, obtenido ${real}`);
    }

    // ---- Utilidades para crear motores de prueba -----------------------------------------------
    const motores = [];
    function crearMotor(Motor, { bots = 7, modo = 'ffa', arena = 'suzaku', hostId = 'test_host', localId = null, humanos = 1 } = {}) {
        const canvas = document.getElementById('game-canvas');
        const slots = [{ id: hostId, name: 'TEST', archetypeId: FIGHTER_ARCHETYPES[0].id, isBot: false, isHost: true }];
        for (let i = 1; i < humanos; i++) slots.push({ id: 'test_guest' + i, name: 'GUEST' + i, archetypeId: FIGHTER_ARCHETYPES[i % 8].id, isBot: false, isHost: false });
        for (let i = 0; i < bots; i++) slots.push({ id: 'bot_t' + i, name: 'BOT' + i, archetypeId: FIGHTER_ARCHETYPES[(i + humanos) % 8].id, isBot: true, isHost: false });
        const room = { code: 'TEST', hostId, arena, resolvedArena: arena, difficulty: 'normal', timerMode: '99', mode: modo, status: 'playing', isLocal: true, slots, matchSeed: 12345, updatedAt: Date.now() };
        const motor = new Motor(canvas, room, localId || hostId);
        motor.running = true;
        motor.matchState = 'fighting';
        motores.push(motor);
        return motor;
    }
    function destruirMotores() {
        while (motores.length) { try { motores.pop().destroy(); } catch (e) { /* ignorar */ } }
    }
    // Dos luchadores enfrentados: A mira a la derecha y B a la izquierda
    function duelo() {
        const m = crearMotor(BattleArenaEngine, { bots: 1 });
        const a = m.fighters[0], b = m.fighters[1];
        a.x = 500; a.facing = 1; b.x = 560; b.facing = -1;
        a.y = b.y = m.groundY;
        b.maxHp = b.hp = 100000; b.invuln = 0; b.alive = true;
        b.state = 'idle'; b.blocking = false; b.crouching = false; b.inJuggle = false; b.juggleHits = 0; b.juggleImmune = false;
        b.comboTaken = 0; b.stunTimer = 0;
        return { m, a, b };
    }
    function golpe(m, a, b, nivel, dmg = 100, extra = {}) {
        b.invuln = 0;
        const antes = b.hp;
        const r = m.applyDamage(a, b, dmg, 4, -3, { level: nivel, kind: 'medium', ...extra });
        return { aplicado: r, perdido: antes - b.hp };
    }
    function finito(n) { return typeof n === 'number' && isFinite(n); }

    // Revisa que el estado de todos los luchadores sea coherente
    function validarLuchadores(m, etiqueta) {
        for (const f of m.fighters) {
            afirmar(finito(f.x) && finito(f.y), `${etiqueta}: posición no numérica en ${f.name} (x=${f.x}, y=${f.y})`);
            afirmar(finito(f.hp) && f.hp >= 0 && f.hp <= f.maxHp, `${etiqueta}: vida fuera de rango en ${f.name} (${f.hp}/${f.maxHp})`);
            afirmar(finito(f.mp) && f.mp >= 0 && f.mp <= f.maxMp, `${etiqueta}: barra fuera de rango en ${f.name} (${f.mp}/${f.maxMp})`);
            afirmar(f.x > -400 && f.x < m.worldWidth + 400, `${etiqueta}: ${f.name} salió del mundo (x=${Math.round(f.x)})`);
        }
    }
    function simular(m, segundos, etiqueta) {
        const frames = Math.round(segundos * 60);
        for (let i = 0; i < frames; i++) {
            try { m.update(1 / 60); }
            catch (e) { throw new Error(`${etiqueta}: excepción en el frame ${i}: ${e.message}`); }
            if (i % 60 === 59) validarLuchadores(m, `${etiqueta} (seg ${(i + 1) / 60})`);
        }
        return frames;
    }

    // =========================================================================
    function ejecutar() {
        const sonidoAntes = sfx.enabled;
        sfx.enabled = false;   // sin sonido durante las pruebas
        const netBroadcast = net.broadcastCombatSnapshot, netPause = net.broadcastPause;

        try {
            // ---------------------------------------------------------------------
            grupo('Datos del juego');
            prueba('8 luchadores con datos completos', () => {
                igual(FIGHTER_ARCHETYPES.length, 8, 'Número de luchadores');
                const ids = new Set();
                for (const a of FIGHTER_ARCHETYPES) {
                    afirmar(!ids.has(a.id), `id repetido: ${a.id}`); ids.add(a.id);
                    afirmar(a.stats && finito(a.stats.atk), `${a.id}: faltan estadísticas`);
                    afirmar(a.build && finito(a.build.s) && a.build.s > 0, `${a.id}: falta la escala del cuerpo`);
                    afirmar(finito(a.projSpeed) && a.projSpeed > 0, `${a.id}: falta la velocidad del proyectil`);
                    afirmar(typeof a.projColor === 'string', `${a.id}: falta el color del proyectil`);
                    afirmar(a.superName && a.powerName, `${a.id}: falta el nombre del poder o del súper`);
                }
            });
            prueba('8 arenas con plataformas', () => {
                const claves = Object.keys(ARENAS);
                igual(claves.length, 8, 'Número de arenas');
                for (const k of claves) {
                    afirmar(ARENAS[k].id === k, `la arena ${k} tiene otro id (${ARENAS[k].id})`);
                    afirmar(Array.isArray(ARENAS[k].platforms) && ARENAS[k].platforms.length > 0, `${k}: sin plataformas`);
                }
            });
            prueba('Tabla de movimientos coherente (MOVE_DATA)', () => {
                for (const [k, md] of Object.entries(MOVE_DATA)) {
                    afirmar(finito(md.dur) && md.dur > 0, `${k}: duración inválida`);
                    if (md.active) {
                        afirmar(md.active[0] >= 0 && md.active[1] >= md.active[0] && md.active[1] <= md.dur, `${k}: frames activos fuera de la duración`);
                    }
                    if (md.rank) {
                        afirmar(md.dmg > 0 && md.reach > 0, `${k}: daño o alcance inválido`);
                        afirmar(LOCKED_STATES.has(k), `${k}: falta en LOCKED_STATES`);
                    }
                }
                // Cada golpe fuerte debe pegar más que su versión débil
                for (const [d, m, h] of [['lp', 'mp', 'hp'], ['lk', 'mk', 'hk'], ['clp', 'cmp', 'chp'], ['clk', 'cmk', 'chk'], ['jlp', 'jmp', 'jhp'], ['jlk', 'jmk', 'jhk']]) {
                    afirmar(MOVE_DATA[d].dmg < MOVE_DATA[m].dmg && MOVE_DATA[m].dmg < MOVE_DATA[h].dmg, `${d}/${m}/${h}: el daño no crece con la fuerza`);
                }
            });
            prueba('Pausa: Esc, P y Start no chocan con los controles por defecto', () => {
                const d = CtrlProfiles.defaults();
                afirmar(!Object.values(d.kb).flat().includes('Escape'), 'Esc está asignada por defecto');
                afirmar(!Object.values(d.kb).flat().includes('KeyP'), 'P está asignada por defecto');
                afirmar(!Object.values(d.gp).includes(9), 'Start (botón 9) está asignado por defecto');
            });

            // ---------------------------------------------------------------------
            grupo('Bloqueo por altura');
            const casos = [
                ['medio', false, true], ['medio', true, true],
                ['alto', false, true], ['alto', true, false],
                ['bajo', false, false], ['bajo', true, true]
            ];
            const nivelDe = { medio: 'mid', alto: 'high', bajo: 'low' };
            for (const [nivel, agachado, bloquea] of casos) {
                prueba(`Golpe ${nivel} contra rival ${agachado ? 'agachado' : 'de pie'} que bloquea → ${bloquea ? 'se bloquea' : 'conecta'}`, () => {
                    const { m, a, b } = duelo();
                    b.blocking = true; b.crouching = agachado;
                    const r = golpe(m, a, b, nivelDe[nivel]);
                    if (bloquea) {
                        igual(r.perdido, 15, 'Daño por roce (15 %)');
                        afirmar(r.aplicado === false, 'applyDamage debería devolver false al bloquear');
                    } else {
                        afirmar(r.perdido > 15, `El golpe debía conectar y solo quitó ${r.perdido}`);
                    }
                });
            }
            prueba('El daño por roce nunca mata (la vida mínima es 1)', () => {
                const { m, a, b } = duelo();
                b.blocking = true; b.hp = 5;
                golpe(m, a, b, 'mid', 1000);
                igual(b.hp, 1, 'Vida tras bloquear un golpe enorme');
            });
            prueba('Atacar por la espalda rompe la guardia', () => {
                const { m, a, b } = duelo();
                b.blocking = true;
                a.x = 620;   // detrás de B (B mira a la izquierda)
                const r = golpe(m, a, b, 'mid');
                afirmar(r.perdido > 15, 'El golpe por la espalda debía conectar');
                igual(b.blocking, false, 'La guardia debía romperse');
                afirmar(b.stunTimer > 0 || b.state === 'stun' || b.state === 'hurt', 'El rival debía quedar aturdido');
            });
            prueba('Un agarre/lanzamiento ignora el bloqueo', () => {
                const { m, a, b } = duelo();
                b.blocking = true;
                const r = golpe(m, a, b, 'mid', 110, { unblockable: true });
                afirmar(r.perdido >= 100, `El lanzamiento debía ignorar el bloqueo (quitó ${r.perdido})`);
            });

            // ---------------------------------------------------------------------
            grupo('Escalado de combo');
            prueba('Daño completo en los 3 primeros golpes y menos desde el 4.º (mínimo 50 %)', () => {
                const { m, a, b } = duelo();
                const mult = 1 + ((a.archetype.stats.atk || 4) - 4) * 0.05;
                const esperado = n => Math.round(100 * (n >= 4 ? Math.max(0.5, 1 - 0.1 * (n - 3)) : 1) * mult);
                for (let n = 1; n <= 9; n++) {
                    const r = golpe(m, a, b, 'mid');
                    igual(r.perdido, esperado(n), `Daño del golpe nº ${n} del combo`);
                }
            });
            prueba('El combo se reinicia cuando el rival se recupera', () => {
                const { m, a, b } = duelo();
                for (let i = 0; i < 6; i++) golpe(m, a, b, 'mid');
                b.state = 'idle'; b.inJuggle = false;
                const mult = 1 + ((a.archetype.stats.atk || 4) - 4) * 0.05;
                const r = golpe(m, a, b, 'mid');
                igual(r.perdido, Math.round(100 * mult), 'Daño del primer golpe de un combo nuevo');
            });
            prueba('Malabares: máximo 4 golpes en el aire y luego inmune', () => {
                const { m, a, b } = duelo();
                a.state = 'launcher';
                m.checkMeleeHits(a);
                afirmar(b.inJuggle, 'El launcher debía lanzar al rival por los aires');
                let golpes = 0;
                for (let i = 0; i < 6; i++) {
                    a.state = 'lp';
                    const antes = b.hp;
                    b.invuln = 0;
                    m.checkMeleeHits(a);
                    if (b.hp < antes) golpes++;
                }
                igual(golpes, 4, 'Golpes encadenados tras el launcher');
                afirmar(b.juggleImmune, 'El rival debía quedar inmune tras 4 golpes en el aire');
            });

            // ---------------------------------------------------------------------
            grupo('Interpretación de controles');
            const resolver = (botones, ctx, prep) => {
                const m = crearMotor(BattleArenaEngine, { bots: 1 });
                const f = m.fighters[0];
                f.onGround = true; f.mp = 0;
                if (prep) prep(f);
                return m.resolveButtons(f, new Set(botones), { fwd: false, charged: false, down: false, ...ctx });
            };
            prueba('Puño de pie = golpe medio; ↓ + puño = golpe bajo; en el aire = golpe alto', () => {
                igual(resolver(['mp'], {}), 'mp', 'Puño medio de pie');
                igual(resolver(['mp'], { down: true }), 'cmp', 'Puño medio agachado');
                igual(resolver(['mp'], {}, f => { f.onGround = false; }), 'jmp', 'Puño medio en el aire');
                igual(resolver(['lk'], { down: true }), 'clk', 'Patada débil agachado');
            });
            prueba('↓ + puño fuerte = launcher', () => igual(resolver(['hp'], { down: true }), 'launcher'));
            prueba('Adelante + puño medio + fuerte = agarre', () => igual(resolver(['mp', 'hp'], { fwd: true }), 'grab'));
            prueba('Carga atrás → adelante + puño = poder (1, 2 o 3 según el puño)', () => {
                igual(resolver(['lp'], { fwd: true, charged: true }), 'special1');
                igual(resolver(['mp'], { fwd: true, charged: true }), 'special2');
                igual(resolver(['hp'], { fwd: true, charged: true }), 'special3');
            });
            prueba('Súper solo con la barra llena (puño fuerte + patada fuerte)', () => {
                igual(resolver(['hp', 'hk'], {}, f => { f.mp = 100; }), 'super', 'Con barra llena');
                afirmar(resolver(['hp', 'hk'], {}, f => { f.mp = 40; }) !== 'super', 'Sin barra no debía salir el súper');
            });

            // ---------------------------------------------------------------------
            grupo('Pausa');
            prueba('Pausar congela el tiempo y reanudar lo continúa', () => {
                const m = crearMotor(BattleArenaEngine, { bots: 3 });
                m.update(1 / 60); m.update(1 / 60);
                m.togglePause();
                afirmar(m.paused, 'Debía quedar en pausa');
                const t = m.time; const xs = m.fighters.map(f => f.x).join();
                for (let i = 0; i < 120; i++) m.update(1 / 60);
                igual(m.time, t, 'El tiempo no debía avanzar en pausa');
                igual(m.fighters.map(f => f.x).join(), xs, 'Nadie debía moverse en pausa');
                m.togglePause();
                afirmar(!m.paused, 'Debía reanudarse');
                m.update(1 / 60);
                afirmar(m.time > t, 'El tiempo debía avanzar tras reanudar');
            });
            prueba('Online: el anfitrión avisa de la pausa y el invitado no puede pausar solo', () => {
                const enviados = [];
                net.broadcastPause = p => enviados.push(p);
                const h = crearMotor(BattleArenaEngine, { bots: 2 });
                h.togglePause(); h.togglePause();
                igual(enviados.join(), 'true,false', 'Avisos enviados por el anfitrión');
                const g = crearMotor(BattleArenaEngine, { bots: 2, hostId: 'otro_host', localId: 'test_host' });
                afirmar(!g.isHost, 'El motor debía ser de invitado');
                g.togglePause();
                afirmar(!g.paused, 'El invitado no debía poder pausar');
                g.setPaused(true, true);
                afirmar(g.paused, 'El invitado debía acatar la pausa del anfitrión');
                g.togglePause();
                afirmar(g.paused, 'El invitado no debía poder reanudar');
                g.setPaused(false, true);
                afirmar(!g.paused, 'El invitado debía reanudar con el anfitrión');
            });

            // ---------------------------------------------------------------------
            grupo('Textos flotantes');
            prueba('Los textos que aparecen en el mismo sitio se apilan y no se pisan', () => {
                const m = crearMotor(BattleArenaEngine, { bots: 1 });
                m.floatingTexts.length = 0;
                for (let i = 0; i < 4; i++) m.pushFloatingText({ x: 300, y: 300, text: '-100', color: '#fff', size: 16, vy: 0, life: 50 });
                const ys = new Set(m.floatingTexts.map(t => Math.round(t.y)));
                igual(ys.size, 4, 'Posiciones verticales distintas');
            });
            prueba('Hay un máximo de 24 textos a la vez', () => {
                const m = crearMotor(BattleArenaEngine, { bots: 1 });
                m.floatingTexts.length = 0;
                for (let i = 0; i < 60; i++) m.pushFloatingText({ x: i * 90, y: 100, text: 'X', color: '#fff', size: 14, vy: 0, life: 50 });
                afirmar(m.floatingTexts.length <= 24, `Había ${m.floatingTexts.length} textos`);
            });

            // ---------------------------------------------------------------------
            grupo('Red (snapshot anfitrión → invitado)');
            prueba('El invitado reproduce vida, estado y posición del anfitrión', () => {
                let paquete = null;
                net.broadcastCombatSnapshot = p => { paquete = p; };
                const crear = (hostId, localId) => crearMotor(BattleArenaEngine, { bots: 2, humanos: 2, hostId, localId });
                const h = crear('test_host', 'test_host');
                const g = crear('test_host', 'test_guest1');
                afirmar(h.isHost && !g.isHost, 'Roles de anfitrión e invitado incorrectos');
                simular(h, 6, 'anfitrión');
                h.broadcastSnapshot();
                afirmar(paquete, 'El anfitrión no generó snapshot');
                const bytes = JSON.stringify(paquete).length;
                const viaRed = JSON.parse(JSON.stringify(paquete));   // como viaja por PeerJS
                g.applyRemoteSnapshot(viaRed);
                for (const hf of h.fighters) {
                    const gf = g.fighters.find(x => x.id === hf.id);
                    afirmar(gf, `Falta el luchador ${hf.id} en el invitado`);
                    igual(gf.hp, hf.hp, `Vida de ${hf.name}`);
                    igual(gf.alive, hf.alive, `Estado vivo/KO de ${hf.name}`);
                    afirmar(gf.net && Math.abs(gf.net.x - hf.x) < 100, `Posición de ${hf.name}: anfitrión ${Math.round(hf.x)}, invitado ${gf.net ? Math.round(gf.net.x) : 'sin dato'}`);
                }
                afirmar(bytes < 25000, `El snapshot pesa demasiado: ${bytes} bytes`);
                return `snapshot de ${bytes} bytes (a 20 envíos/s)`;
            });
            net.broadcastCombatSnapshot = netBroadcast;

            // ---------------------------------------------------------------------
            grupo('Partidas simuladas (sin pintar nada)');
            prueba('Versus: 8 luchadores durante 30 s sin errores y peleando', () => {
                const m = crearMotor(BattleArenaEngine, { bots: 7, arena: 'suzaku' });
                const frames = simular(m, 30, 'versus');
                const dmg = m.fighters.reduce((s, f) => s + f.damageDealt, 0);
                afirmar(dmg > 0, 'Nadie llegó a golpear a nadie en 30 s');
                return `${frames} frames, daño total ${Math.round(dmg)}`;
            });
            for (const arena of Object.keys(ARENAS)) {
                prueba(`Arena «${ARENAS[arena].name}»: 8 s con 8 luchadores sin errores`, () => {
                    const m = crearMotor(BattleArenaEngine, { bots: 7, arena });
                    simular(m, 8, arena);
                });
            }
            prueba('Cooperativo: 20 s con 4 luchadores sin errores', () => {
                const m = crearMotor(CoopArenaEngine, { bots: 3, modo: 'coop', arena: 'suzaku' });
                simular(m, 20, 'coop');
                validarLuchadores(m, 'coop final');
            });
        } finally {
            net.broadcastCombatSnapshot = netBroadcast;
            net.broadcastPause = netPause;
            destruirMotores();
            sfx.enabled = sonidoAntes;
        }
    }

    // =========================================================================
    // Resultados en pantalla
    // =========================================================================
    function mostrar(msTotal) {
        const ok = resultados.filter(r => r.ok).length;
        const fallos = resultados.length - ok;
        window.__PRUEBAS__ = { total: resultados.length, aprobadas: ok, falladas: fallos, ms: Math.round(msTotal), resultados };

        const caja = document.createElement('div');
        caja.id = 'panel-pruebas';
        caja.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#05070f;color:#e2e8f0;overflow:auto;padding:20px;font:14px/1.5 ui-monospace,Consolas,monospace';
        let html = `<div style="max-width:900px;margin:0 auto">
            <h1 style="font-size:22px;margin:0 0 6px;color:${fallos ? '#f87171' : '#4ade80'}">${fallos ? '✘' : '✔'} Pruebas de Street Brawl 8: ${ok}/${resultados.length} aprobadas</h1>
            <p style="color:#94a3b8;margin:0 0 16px">Tiempo total: ${(msTotal / 1000).toFixed(1)} s ·
            <a href="${location.pathname}" style="color:#38bdf8">volver al juego</a></p>`;
        let g = '';
        for (const r of resultados) {
            if (r.grupo !== g) { g = r.grupo; html += `<h2 style="font-size:15px;color:#facc15;margin:18px 0 6px">${g}</h2>`; }
            const detalle = r.detalle ? `<div style="margin-left:22px;color:${r.ok ? '#64748b' : '#fca5a5'}">${String(r.detalle).replace(/</g, '&lt;')}</div>` : '';
            html += `<div style="color:${r.ok ? '#cbd5e1' : '#f87171'}">${r.ok ? '✔' : '✘'} ${r.nombre.replace(/</g, '&lt;')} <span style="color:#475569">(${r.ms.toFixed(0)} ms)</span></div>${detalle}`;
        }
        html += '</div>';
        caja.innerHTML = html;
        document.body.appendChild(caja);
        console.log(`[PRUEBAS] ${ok}/${resultados.length} aprobadas`, fallos ? resultados.filter(r => !r.ok) : '');
    }

    const t0 = performance.now();
    ejecutar();
    mostrar(performance.now() - t0);
})();
