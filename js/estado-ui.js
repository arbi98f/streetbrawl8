'use strict';
// Estado global, menú, vista previa animada, ajustes y lobby

// =========================================================================
// 5. ESTADO GLOBAL E INTERFAZ
// =========================================================================
const state = {
    playerName: 'BRAWLER_1',
    selectedArchetypeId: 'ronin',
    currentRoom: null,
    gameInstance: null
};

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    const colors = {
        info: 'bg-slate-900 border-sky-400 text-sky-200',
        success: 'bg-emerald-950 border-emerald-400 text-emerald-200',
        error: 'bg-red-950 border-red-500 text-red-200',
        warn: 'bg-amber-950 border-yellow-400 text-yellow-200'
    };
    el.className = `px-4 py-2.5 rounded-xl border-2 shadow-xl text-xs sm:text-sm font-bold transition-all duration-300 ${colors[type] || colors.info}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

function switchScreen(screenName) {
    ['screen-menu', 'screen-lobby', 'screen-game', 'screen-results'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`screen-${screenName}`).classList.remove('hidden');
    document.body.classList.toggle('in-game', screenName === 'game');
    TouchPad.refresh();
    if (screenName !== 'game') TouchPad.releaseAll();

    if (screenName === 'menu' || screenName === 'lobby') {
        sfx.stopAmbientSound();
        sfx.startLobbyMusic();
    } else {
        sfx.stopLobbyMusic();
    }
}

function renderFighterGrid() {
    const grid = document.getElementById('fighter-grid');
    grid.innerHTML = '';
    FIGHTER_ARCHETYPES.forEach(f => {
        const isSelected = f.id === state.selectedArchetypeId;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `fighter-card rounded-xl p-2.5 bg-slate-900/90 border-2 ${isSelected ? 'selected border-yellow-400' : 'border-slate-800 hover:border-slate-600'} flex flex-col items-center text-center gap-1 cursor-pointer`;
        card.innerHTML = `
            <canvas class="fighter-preview rounded-lg" data-id="${f.id}" width="120" height="132" style="width:60px;height:66px;background: linear-gradient(160deg, ${f.primary}22, ${f.secondary}55); border: 1px solid ${f.primary}55"></canvas>
            <div class="font-bold text-xs text-white tracking-tight truncate w-full">${f.name}</div>
            <div class="text-[9px] font-bold px-1 rounded ${f.gender === 'female' ? 'bg-pink-500/20 text-pink-300' : 'bg-sky-500/20 text-sky-300'}">${f.gender === 'female' ? '♀ MUJER' : '♂ HOMBRE'}</div>
        `;
        card.onclick = () => {
            sfx.sfxSelect();
            state.selectedArchetypeId = f.id;
            renderFighterGrid();
            updateFighterDetails();
        };
        grid.appendChild(card);
    });
}

function updateFighterDetails() {
    const f = FIGHTER_ARCHETYPES.find(x => x.id === state.selectedArchetypeId) || FIGHTER_ARCHETYPES[0];
    document.getElementById('selected-fighter-badge').textContent = `${f.name} • ${f.element.toUpperCase()}`;
    const avatar = document.getElementById('detail-preview');
    avatar.style.background = `radial-gradient(circle at 50% 85%, ${f.primary}55, ${f.secondary}33 55%, #020617 100%)`;
    document.getElementById('detail-name').textContent = f.name;
    document.getElementById('detail-power').textContent = `Poder: ${f.powerName} • Súper: ${f.superName}`;
    document.getElementById('detail-trait').textContent = f.trait;
    previewCycleStart = performance.now();
    document.getElementById('stat-atk').textContent = '★'.repeat(f.stats.atk) + '☆'.repeat(5 - f.stats.atk);
    document.getElementById('stat-spd').textContent = '★'.repeat(f.stats.spd) + '☆'.repeat(5 - f.stats.spd);
    document.getElementById('stat-pwr').textContent = '★'.repeat(f.stats.pwr) + '☆'.repeat(5 - f.stats.pwr);
}


// =========================================================================
// VISTA PREVIA ANIMADA DE LUCHADORES EN EL MENÚ
// =========================================================================
const PREVIEW_CYCLE = [['idle', 30, 'IDLE'], ['lp', 13, 'PUÑO DÉBIL'], ['idle', 10, 'IDLE'], ['mp', 22, 'PUÑO MEDIO'], ['idle', 10, 'IDLE'], ['hp', 35, 'PUÑO FUERTE'], ['idle', 14, 'IDLE'], ['lk', 16, 'PATADA DÉBIL'], ['idle', 10, 'IDLE'], ['mk', 26, 'PATADA MEDIA'], ['idle', 10, 'IDLE'], ['hk', 41, 'PATADA FUERTE'], ['idle', 16, 'IDLE'], ['clk', 15, 'BAJO: PATADA DÉBIL'], ['idle', 12, 'IDLE'], ['chk', 44, 'BARRIDA (BAJO FUERTE)'], ['idle', 16, 'IDLE'], ['launcher', 35, 'LAUNCHER'], ['idle', 16, 'IDLE'], ['grab', 26, 'AGARRE'], ['idle', 16, 'IDLE'], ['special', 30, 'PODER'], ['idle', 24, 'IDLE'], ['super', 44, 'SÚPER'], ['idle', 30, 'IDLE']];
const PREVIEW_TOTAL = PREVIEW_CYCLE.reduce((a, c) => a + c[1], 0);
let previewCycleStart = performance.now();

function drawFighterPreview(cv, id, t, st, stateTimer, stateMax, scale) {
    const arch = FIGHTER_ARCHETYPES.find(a => a.id === id);
    if (!arch) return;
    const ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const f = { archetype: arch, state: st, stateTimer, stateMax, alive: true, onGround: true, vx: 0, vy: 0, facing: 1, animFrame: t * 10.8, stunTimer: 0, blocking: false, crouching: false, inJuggle: false, mp: st === 'super' ? 100 : 0, hitFlash: 0, slotIndex: 0 };
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cv.width * 0.45, cv.height - 9, 26 * scale, 6 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cv.width * 0.45, cv.height - 9);
    const s = scale * arch.build.s;
    ctx.scale(s, s);
    FighterArt.draw(ctx, f, t);
}

function menuPreviewLoop(now) {
    requestAnimationFrame(menuPreviewLoop);
    if (document.getElementById('screen-menu').classList.contains('hidden')) return;
    const t = now / 1000;
    document.querySelectorAll('canvas.fighter-preview').forEach(cv => drawFighterPreview(cv, cv.dataset.id, t + cv.dataset.id.length, 'idle', 0, 1, 0.78));
    const det = document.getElementById('detail-preview');
    if (det) {
        let frame = Math.floor((now - previewCycleStart) / (1000 / 60)) % PREVIEW_TOTAL;
        let cur = PREVIEW_CYCLE[0];
        for (const c of PREVIEW_CYCLE) { if (frame < c[1]) { cur = c; break; } frame -= c[1]; }
        drawFighterPreview(det, state.selectedArchetypeId, t, cur[0], cur[1] - frame, cur[1], 1.22);
        const label = document.getElementById('detail-move');
        if (label && label.textContent !== cur[2]) label.textContent = cur[2];
    }
}

function resolveArenaForMatch(room) {
    if (!room) return;
    room.matchSeed = Math.floor(Math.random() * 1e9);
    const keys = Object.keys(ARENAS);
    room.resolvedArena = (!room.arena || room.arena === 'random' || !ARENAS[room.arena])
        ? keys[Math.floor(Math.random() * keys.length)]
        : room.arena;
}

function renderSettingsUI() {
    const em = CtrlProfiles.editMode;
    [['versus', em === 'versus'], ['coop', em === 'coop']].forEach(([id, on]) => {
        const b = document.getElementById('ctrl-mode-' + id);
        if (!b) return;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const tt = CtrlProfiles.touch(em);
    const sw = document.getElementById('touch-move-switch');
    if (sw) {
        sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.move === tt.mode));
        const lbl = document.getElementById('touch-mode-label');
        if (lbl) lbl.textContent = em === 'coop' ? 'COOPERATIVO' : 'VERSUS';
    }
    const gpContainer = document.getElementById('gamepad-binds-container');
    gpContainer.innerHTML = '';
    const gpActions = ['lp', 'mp', 'hp', 'lk', 'mk', 'hk', 't1', 't2'];
    
    gpActions.forEach(action => {
        const btnIndex = CtrlProfiles.gp(CtrlProfiles.editMode)[action];
        const btnLabel = GAMEPAD_BUTTON_NAMES[btnIndex] || `Botón ${btnIndex}`;
        const row = document.createElement('div');
        row.className = 'bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center';
        const isRebinding = activeRebindType === 'gamepad' && activeRebindAction === action;
        row.innerHTML = `
            <span class="text-slate-300 font-bold">${bindLabel(action)}</span>
            <button data-action="${action}" class="rebind-gp-btn px-3 py-1 rounded-lg ${isRebinding ? 'rebind-active bg-yellow-600 text-white font-extrabold' : 'bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold'} border border-slate-700">
                ${isRebinding ? 'PRESIONA UN BOTÓN...' : btnLabel}
            </button>
        `;
        gpContainer.appendChild(row);
    });

    const kbContainer = document.getElementById('keyboard-binds-container');
    kbContainer.innerHTML = '';
    const kbActions = ['up', 'down', 'left', 'right', 'lp', 'mp', 'hp', 'lk', 'mk', 'hk'];

    kbActions.forEach(action => {
        const keys = CtrlProfiles.kb(CtrlProfiles.editMode)[action] || [];
        const keysLabel = keys.map(k => k.replace('Key', '').replace('Arrow', 'Flecha ').replace('Space', 'Espacio').replace('Semicolon', 'Ñ')).join(' / ');
        const row = document.createElement('div');
        row.className = 'bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center';
        const isRebinding = activeRebindType === 'keyboard' && activeRebindAction === action;
        row.innerHTML = `
            <span class="text-slate-300 font-bold">${bindLabel(action)}</span>
            <button data-action="${action}" class="rebind-kb-btn px-3 py-1 rounded-lg ${isRebinding ? 'rebind-active bg-yellow-600 text-white font-extrabold' : 'bg-slate-800 hover:bg-slate-700 text-sky-400 font-bold'} border border-slate-700">
                ${isRebinding ? 'PRESIONA UNA TECLA...' : keysLabel}
            </button>
        `;
        kbContainer.appendChild(row);
    });

    document.querySelectorAll('.rebind-gp-btn').forEach(btn => {
        btn.onclick = () => {
            sfx.sfxSelect();
            activeRebindType = 'gamepad';
            activeRebindAction = btn.getAttribute('data-action');
            renderSettingsUI();
        };
    });

    document.querySelectorAll('.rebind-kb-btn').forEach(btn => {
        btn.onclick = () => {
            sfx.sfxSelect();
            activeRebindType = 'keyboard';
            activeRebindAction = btn.getAttribute('data-action');
            renderSettingsUI();
        };
    });
}

function pollGamepadRebind() {
    if (activeRebindType === 'gamepad' && activeRebindAction) {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for (const pad of pads) {
            if (pad && pad.connected) {
                for (let i = 0; i < pad.buttons.length; i++) {
                    if (pad.buttons[i].pressed) {
                        CtrlProfiles.gp(CtrlProfiles.editMode)[activeRebindAction] = i;
                        sfx.sfxSelect();
                        showToast(`Asignado ${bindLabel(activeRebindAction)} a ${GAMEPAD_BUTTON_NAMES[i] || 'Botón ' + i}`, 'success');
                        activeRebindAction = null;
                        activeRebindType = null;
                        renderSettingsUI();
                        break;
                    }
                }
            }
        }
    }
    requestAnimationFrame(pollGamepadRebind);
}
requestAnimationFrame(pollGamepadRebind);

window.addEventListener('keydown', (e) => {
    if (activeRebindType === 'keyboard' && activeRebindAction) {
        e.preventDefault();
        e.stopPropagation();
        CtrlProfiles.kb(CtrlProfiles.editMode)[activeRebindAction] = [e.code];
        sfx.sfxSelect();
        showToast(`Asignado ${bindLabel(activeRebindAction)} a ${e.code.replace('Key', '')}`, 'success');
        activeRebindAction = null;
        activeRebindType = null;
        renderSettingsUI();
    }
}, true);

function renderLobby(room) {
    if (!room) return;
    state.currentRoom = room;
    document.getElementById('lobby-room-code').textContent = room.code;
    const coop = isCoopRoom(room);
    const maxPlayers = getRoomMaxPlayers(room);
    document.getElementById('screen-lobby').dataset.mode = room.mode || 'ffa';
    document.getElementById('lobby-count').textContent = `${room.slots.length}/${maxPlayers}`;
    const fillBtn = document.getElementById('btn-fill-bots');
    fillBtn.textContent = `🤖 LLENAR HASTA ${maxPlayers}`;
    fillBtn.disabled = room.slots.length >= maxPlayers;
    document.getElementById('btn-add-bot').disabled = room.slots.length >= maxPlayers;
    document.getElementById('select-arena').value = room.arena || 'random';
    document.getElementById('select-difficulty').value = room.difficulty || 'normal';
    document.getElementById('select-timer-mode').value = room.timerMode || '99';
    document.getElementById('select-mode').value = room.mode || 'ffa';

    const isHost = room.hostId === net.userId;
    document.getElementById('host-controls').style.display = isHost ? 'flex' : 'none';
    document.getElementById('select-arena').disabled = !isHost;
    document.getElementById('select-difficulty').disabled = !isHost;
    document.getElementById('select-timer-mode').disabled = !isHost;
    document.getElementById('select-mode').disabled = !isHost;
    const lobbyTeams = computeTeams(room.mode || 'ffa', room.slots.length);

    const grid = document.getElementById('lobby-slots-grid');
    grid.innerHTML = '';

    for (let i = 0; i < VERSUS_MAX_PLAYERS; i++) {
        const slot = room.slots[i];
        const card = document.createElement('div');
        if (i >= maxPlayers) {
            // Slots 5–8 en cooperativo: bloqueados, sin jugadores ni bots
            card.className = 'slot-locked rounded-xl p-3 border-2 border-dashed flex flex-col items-center justify-center gap-0.5 h-[74px]';
            card.setAttribute('aria-disabled', 'true');
            card.title = `SLOT ${i + 1} bloqueado en Cooperativo (máx. ${COOP_MAX_PLAYERS} jugadores)`;
            card.innerHTML = `<span class="slot-locked-x">✕</span><span class="slot-locked-label">BLOQUEADO · MÁX. ${COOP_MAX_PLAYERS}</span>`;
        } else if (slot) {
            const arch = FIGHTER_ARCHETYPES.find(a => a.id === slot.archetypeId) || FIGHTER_ARCHETYPES[i % 8];
            const isMe = slot.id === net.userId;
            card.className = `rounded-xl p-3 bg-slate-900/95 border-2 ${isMe ? 'border-yellow-400' : 'border-slate-700'} flex items-center justify-between gap-2 relative`;
            if (lobbyTeams) card.style.borderLeft = `6px solid ${TEAM_COLORS[lobbyTeams[i]].c}`;
            card.innerHTML = `
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-lg border" style="background:${arch.primary}22; border-color:${arch.primary}">
                        ${arch.icon}
                    </div>
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                            <span class="text-[10px] font-arcade text-slate-400">P${i + 1}</span>
                            <span class="font-bold text-sm text-white truncate">${slot.name}</span>
                        </div>
                        <div class="text-[11px] font-semibold truncate" style="color:${arch.primary}">${arch.name}</div>
                        <div class="mt-0.5 flex gap-1">
                            ${slot.isHost ? '<span class="text-[9px] px-1.5 rounded bg-yellow-500/20 text-yellow-300 font-bold">HOST</span>' : ''}
                            ${lobbyTeams ? `<span class="text-[9px] px-1.5 rounded font-bold" style="background:${TEAM_COLORS[lobbyTeams[i]].c}33;color:${TEAM_COLORS[lobbyTeams[i]].c}">EQ. ${TEAM_COLORS[lobbyTeams[i]].name}</span>` : ''}
                            ${slot.isBot ? '<span class="text-[9px] px-1.5 rounded bg-purple-500/20 text-purple-300 font-bold">BOT IA</span>' : '<span class="text-[9px] px-1.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">PLAYER</span>'}
                        </div>
                    </div>
                </div>
                ${isHost && slot.isBot ? `<button data-remove-idx="${i}" class="remove-bot-btn px-2 py-1 rounded bg-red-950 hover:bg-red-800 text-red-300 text-xs font-bold cursor-pointer">✕</button>` : ''}
            `;
        } else {
            card.className = 'rounded-xl p-3 bg-slate-950/60 border-2 border-dashed border-slate-800 flex items-center justify-center text-slate-600 text-xs font-bold h-[74px]';
            card.textContent = `SLOT ${i + 1} • VACÍO`;
        }
        grid.appendChild(card);
    }

    document.querySelectorAll('.remove-bot-btn').forEach(btn => {
        btn.onclick = () => {
            const idx = parseInt(btn.getAttribute('data-remove-idx'), 10);
            room.slots.splice(idx, 1);
            sfx.sfxSelect();
            net.saveRoomState(room);
        };
    });

    const startBtn = document.getElementById('btn-start-match');
    if (isHost) {
        const coopNeedsOnline = coop && !COOP_ONLINE_READY && room.slots.some(s => !s.isBot && !s.isHost);
        const minPlayers = coop ? COOP_MIN_PLAYERS : 2;
        startBtn.disabled = room.slots.length < minPlayers || room.slots.length > maxPlayers || coopNeedsOnline;
        let msg = room.slots.length < 2
            ? 'Añade al menos 1 Bot IA o espera a otro jugador.'
            : `¡Todo listo! ${room.slots.length} luchadores en la arena.`;
        if (coop) {
            msg = room.slots.length < COOP_MIN_PLAYERS
                ? `Cooperativo: se requieren de ${COOP_MIN_PLAYERS} a ${COOP_MAX_PLAYERS} luchadores.`
                : `¡Equipo listo! ${room.slots.length}/${COOP_MAX_PLAYERS} luchadores. La dificultad se ajusta al número de jugadores.`;
        }
        if (lobbyTeams && room.slots.length >= 2) {
            const sizes = {};
            lobbyTeams.forEach(t => { sizes[t] = (sizes[t] || 0) + 1; });
            const vals = Object.values(sizes);
            if (Math.max(...vals) !== Math.min(...vals)) msg += ' ⚠ Equipos desparejos: añade o quita bots para equilibrar.';
        }
        document.getElementById('lobby-status-msg').textContent = msg;
    } else {
        startBtn.disabled = true;
        startBtn.textContent = 'ESPERANDO AL ANFITRIÓN...';
        document.getElementById('lobby-status-msg').textContent = 'El anfitrión iniciará el combate pronto.';
    }
}

function addBotToRoom() {
    const room = state.currentRoom;
    if (!room || room.slots.length >= getRoomMaxPlayers(room)) return;
    const usedArchetypes = room.slots.map(s => s.archetypeId);
    const available = FIGHTER_ARCHETYPES.filter(a => !usedArchetypes.includes(a.id));
    const chosenArch = available.length > 0 ? available[0] : FIGHTER_ARCHETYPES[room.slots.length % 8];
    const usedNames = room.slots.map(s => s.name);
    const botName = BOT_NAMES.find(n => !usedNames.includes(n)) || `BOT_${room.slots.length + 1}`;

    room.slots.push({
        id: 'bot_' + Math.random().toString(36).substring(2, 8),
        name: botName,
        archetypeId: chosenArch.id,
        isBot: true,
        isHost: false
    });
    sfx.sfxSelect();
    net.saveRoomState(room);
}
