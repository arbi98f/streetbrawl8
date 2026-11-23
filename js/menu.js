'use strict';
// Eventos del menú, salas, partida rápida y botones

// =========================================================================
// 7. INICIALIZACIÓN Y EVENTOS GENERALES
// =========================================================================
function getPlayerProfile() {
    const rawName = document.getElementById('input-player-name').value.trim().toUpperCase();
    state.playerName = rawName || 'BRAWLER_' + Math.floor(10 + Math.random() * 89);
    document.getElementById('input-player-name').value = state.playerName;
    return {
        name: state.playerName,
        archetypeId: state.selectedArchetypeId
    };
}

function launchArena(room) {
    if (state.gameInstance) {
        state.gameInstance.destroy();
    }
    switchScreen('game');
    const canvas = document.getElementById('game-canvas');
    const Engine = isCoopRoom(room) ? CoopArenaEngine : BattleArenaEngine;
    CtrlProfiles.playMode = isCoopRoom(room) ? 'coop' : 'versus';
    TouchPad.applyProfile();
    state.gameInstance = new Engine(canvas, room, net.userId);
    state.gameInstance.start();
}

net.onRoomUpdated = (room) => {
    state.currentRoom = room;
    const gameVisible = !document.getElementById('screen-game').classList.contains('hidden');
    if (room.status === 'playing') {
        if (isCoopRoom(room) && !COOP_ONLINE_READY && !room.isLocal && room.hostId !== net.userId) return; // online coop: etapa 2C
        if (!state.gameInstance || !state.gameInstance.running) launchArena(room);
        return;
    }
    if (room.status === 'lobby' && gameVisible) {
        if (state.gameInstance) state.gameInstance.destroy();
        switchScreen('lobby');
    }
    renderLobby(room);
};
net.onCombatStateReceived = (payload) => {
    if (state.gameInstance) state.gameInstance.applyRemoteSnapshot(payload);
};
net.onClientInputReceived = (senderId, input) => {
    if (state.gameInstance) state.gameInstance.remoteInputs[senderId] = input;
};
net.onPauseReceived = (paused) => {
    if (state.gameInstance) state.gameInstance.setPaused(paused, true);
};
net.onRoomClosed = () => {
    if (state.gameInstance) state.gameInstance.destroy();
    net.leaveRoom();
    state.currentRoom = null;
    switchScreen('menu');
};

document.getElementById('btn-open-settings').onclick = () => {
    sfx.sfxSelect();
    activeRebindAction = null;
    activeRebindType = null;
    CtrlProfiles.editMode = (state.currentRoom && isCoopRoom(state.currentRoom)) ? 'coop' : 'versus';
    showSettingsTab('gamepad');
    renderSettingsUI();
    document.getElementById('modal-settings').classList.remove('hidden');
};

document.getElementById('btn-close-settings').onclick = () => {
    sfx.sfxSelect();
    activeRebindAction = null;
    activeRebindType = null;
    document.getElementById('modal-settings').classList.add('hidden');
};

// Pestañas: Mando / Teclado / Táctil
const SETTINGS_TABS = ['gamepad', 'keyboard', 'touch'];
function showSettingsTab(name) {
    SETTINGS_TABS.forEach(t => {
        const on = t === name;
        document.getElementById('tab-btn-' + t).className = on
            ? "px-4 py-2 text-xs font-bold rounded-t-lg bg-yellow-500/20 text-yellow-300 border-t border-x border-yellow-500/40"
            : "px-4 py-2 text-xs font-bold rounded-t-lg bg-slate-900 text-slate-400 hover:text-white";
        document.getElementById('tab-panel-' + t).classList.toggle('hidden', !on);
    });
}
SETTINGS_TABS.forEach(t => { document.getElementById('tab-btn-' + t).onclick = () => { sfx.sfxSelect(); activeRebindAction = null; activeRebindType = null; showSettingsTab(t); renderSettingsUI(); }; });

// Selector de modo: cada modo (VERSUS / COOPERATIVO) tiene sus propios controles
CONTROL_MODES.forEach(m => {
    document.getElementById('ctrl-mode-' + m).onclick = () => {
        sfx.sfxSelect();
        activeRebindAction = null; activeRebindType = null;
        CtrlProfiles.editMode = m;
        renderSettingsUI();
    };
});

// Táctil: analógico o cruceta (del modo que se está editando)
document.querySelectorAll('#touch-move-switch button').forEach(b => {
    b.onclick = () => {
        sfx.sfxSelect();
        CtrlProfiles.touch(CtrlProfiles.editMode).mode = b.dataset.move;
        renderSettingsUI();
        if (CtrlProfiles.playMode === CtrlProfiles.editMode) TouchPad.applyProfile();
    };
});
document.getElementById('btn-touch-edit').onclick = () => { sfx.sfxSelect(); TouchEditor.open(CtrlProfiles.editMode); };

document.getElementById('btn-reset-binds').onclick = () => {
    sfx.sfxSelect();
    const m = CtrlProfiles.editMode;
    CtrlProfiles.reset(m);
    CtrlProfiles.save();
    TouchPad.applyProfile();
    renderSettingsUI();
    showToast('Controles de ' + (m === 'coop' ? 'COOPERATIVO' : 'VERSUS') + ' restaurados por defecto.', 'info');
};

document.getElementById('btn-save-settings').onclick = () => {
    sfx.sfxSelect();
    CtrlProfiles.save();
    TouchPad.applyProfile();
    document.getElementById('modal-settings').classList.add('hidden');
    showToast('¡Ajustes guardados correctamente!', 'success');
};

document.getElementById('btn-toggle-sound').onclick = () => {
    const on = sfx.toggle();
    document.getElementById('sound-icon').textContent = on ? '🔊' : '🔇';
    document.getElementById('sound-text').textContent = on ? 'SONIDO: ON' : 'SONIDO: OFF';
    document.getElementById('btn-hud-sound').textContent = on ? '🔊' : '🔇';
};

document.getElementById('btn-hud-sound').onclick = () => { document.getElementById('btn-toggle-sound').click(); };

// Selector informativo VERSUS / COOPERATIVO del panel "SISTEMA COMBOS Y BLOQUEO".
// Solo cambia el texto mostrado: no toca las asignaciones reales de controles.
function setHelpMode(mode) {
    const coop = mode === 'coop';
    document.getElementById('combo-help-versus').classList.toggle('hidden', coop);
    document.getElementById('combo-help-coop').classList.toggle('hidden', !coop);
    [['versus', !coop], ['coop', coop]].forEach(([id, on]) => {
        const b = document.getElementById('help-mode-' + id);
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
}
document.getElementById('help-mode-versus').onclick = () => { sfx.sfxSelect(); setHelpMode('versus'); };
document.getElementById('help-mode-coop').onclick = () => { sfx.sfxSelect(); setHelpMode('coop'); };

document.getElementById('btn-create-room').onclick = async () => {
    sfx.init();
    sfx.sfxSelect();
    try {
        const profile = getPlayerProfile();
        const room = await net.createRoom(profile, 'random', 'normal', '99');
        state.currentRoom = room;
        switchScreen('lobby');
        renderLobby(room);
        showToast(`Sala ${room.code} creada`, 'success');
    } catch (err) {
        showToast(err.message || 'No se pudo crear la sala.', 'error');
    }
};

document.getElementById('btn-join-room').onclick = async () => {
    sfx.init();
    sfx.sfxSelect();
    const code = document.getElementById('input-room-code').value;
    if (!code.trim()) {
        showToast('Ingresa un código de sala.', 'warn');
        return;
    }
    try {
        const profile = getPlayerProfile();
        const room = await net.joinRoom(code, profile);
        state.currentRoom = room;
        switchScreen('lobby');
        renderLobby(room);
        showToast(`Unido a la sala ${room.code}`, 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// El texto del botón de batalla rápida refleja cuántos bots se añaden según el modo elegido
function updateQuickMatchLabel() {
    const coop = document.getElementById('select-quick-mode').value === 'coop';
    document.getElementById('btn-quick-match').textContent = coop ? '🔥 BATALLA RÁPIDA (COOP CON 3 ALIADOS IA)' : '🔥 BATALLA RÁPIDA (VS 7 BOTS)';
}
document.getElementById('select-quick-mode').addEventListener('change', updateQuickMatchLabel);

document.getElementById('btn-quick-match').onclick = async () => {
    sfx.init();
    sfx.sfxSelect();
    net.leaveRoom();
    const profile = getPlayerProfile();
    const room = {
        code: 'LOCAL',
        hostId: net.userId,
        arena: 'random',
        difficulty: 'normal',
        timerMode: '99',
        mode: document.getElementById('select-quick-mode').value || 'ffa',
        status: 'playing',
        isLocal: true,
        slots: [{
            id: net.userId,
            name: profile.name,
            archetypeId: profile.archetypeId,
            isBot: false,
            isHost: true
        }],
        updatedAt: Date.now()
    };
    state.currentRoom = room;
    const quickMax = getRoomMaxPlayers(room);   // 8 en versus, 4 en cooperativo
    while (room.slots.length < quickMax) {
        const before = room.slots.length;
        addBotToRoom();
        if (room.slots.length === before) break;
    }
    room.status = 'playing';
    resolveArenaForMatch(room);
    launchArena(room);
};

document.getElementById('btn-copy-code').onclick = () => {
    const code = document.getElementById('lobby-room-code').textContent;
    const temp = document.createElement('textarea');
    temp.value = code;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    temp.remove();
    sfx.sfxSelect();
    showToast(`Código "${code}" copiado`, 'success');
};

document.getElementById('select-arena').onchange = (e) => {
    if (!state.currentRoom || state.currentRoom.hostId !== net.userId) return;
    state.currentRoom.arena = e.target.value;
    net.saveRoomState(state.currentRoom);
};

document.getElementById('select-difficulty').onchange = (e) => {
    if (!state.currentRoom || state.currentRoom.hostId !== net.userId) return;
    state.currentRoom.difficulty = e.target.value;
    net.saveRoomState(state.currentRoom);
};

document.getElementById('select-mode').onchange = (e) => {
    if (!state.currentRoom || state.currentRoom.hostId !== net.userId) return;
    const res = net.changeRoomMode(state.currentRoom, e.target.value);
    if (!res.ok) {
        showToast(res.error, 'warn');
        e.target.value = state.currentRoom.mode || 'ffa';
        return;
    }
    if (res.removedBots > 0) {
        showToast(`Se quitaron ${res.removedBots} bot(s) sobrantes (máx. ${COOP_MAX_PLAYERS} en Cooperativo).`, 'info');
    }
    net.saveRoomState(state.currentRoom);
};

document.getElementById('select-timer-mode').onchange = (e) => {
    if (!state.currentRoom || state.currentRoom.hostId !== net.userId) return;
    state.currentRoom.timerMode = e.target.value;
    net.saveRoomState(state.currentRoom);
};

document.getElementById('btn-add-bot').onclick = () => addBotToRoom();

document.getElementById('btn-fill-bots').onclick = () => {
    if (!state.currentRoom) return;
    const max = getRoomMaxPlayers(state.currentRoom);
    while (state.currentRoom.slots.length < max) {
        addBotToRoom();
    }
};

document.getElementById('btn-clear-bots').onclick = () => {
    if (!state.currentRoom) return;
    state.currentRoom.slots = state.currentRoom.slots.filter(s => !s.isBot);
    sfx.sfxSelect();
    net.saveRoomState(state.currentRoom);
};

document.getElementById('btn-start-match').onclick = async () => {
    if (!state.currentRoom || state.currentRoom.slots.length < (isCoopRoom(state.currentRoom) ? COOP_MIN_PLAYERS : 2)) return;
    if (state.currentRoom.slots.length > getRoomMaxPlayers(state.currentRoom)) {
        showToast(`Máximo ${getRoomMaxPlayers(state.currentRoom)} luchadores en este modo.`, 'warn');
        return;
    }
    if (isCoopRoom(state.currentRoom) && (!COOP_ENGINE_READY ||
        (!COOP_ONLINE_READY && state.currentRoom.slots.some(s => !s.isBot && !s.isHost)))) {
        sfx.sfxSelect();
        showToast('Cooperativo online: llega en la etapa 2C. Por ahora inícialo solo con bots aliados.', 'info');
        return;
    }
    state.currentRoom.coopCamp = null;   // iniciar desde el lobby = campaña nueva
    resolveArenaForMatch(state.currentRoom);
    state.currentRoom.status = 'playing';
    await net.saveRoomState(state.currentRoom);
    launchArena(state.currentRoom);
};

document.getElementById('btn-leave-room').onclick = () => {
    sfx.sfxSelect();
    net.leaveRoom();
    state.currentRoom = null;
    switchScreen('menu');
};

document.getElementById('btn-hud-exit').onclick = () => {
    if (state.currentRoom && !state.currentRoom.isLocal && state.currentRoom.hostId !== net.userId) {
        // El invitado puede salir cuando quiera: abandona la sala (el anfitrión sigue y su luchador pasa a la IA)
        if (state.gameInstance) state.gameInstance.destroy();
        net.leaveRoom();
        state.currentRoom = null;
        switchScreen('menu');
        return;
    }
    if (state.gameInstance) state.gameInstance.destroy();
    if (state.currentRoom) {
        state.currentRoom.status = 'lobby';
        net.saveRoomState(state.currentRoom);
        switchScreen('lobby');
        renderLobby(state.currentRoom);
    } else {
        switchScreen('menu');
    }
};

document.getElementById('btn-rematch').onclick = async () => {
    sfx.sfxSelect();
    if (state.currentRoom) {
        if (!state.currentRoom.isLocal && state.currentRoom.hostId !== net.userId) {
            showToast('Esperando a que el anfitrión inicie la revancha.', 'info');
            return;
        }
        resolveArenaForMatch(state.currentRoom);
        state.currentRoom.status = 'playing';
        await net.saveRoomState(state.currentRoom);
        launchArena(state.currentRoom);
    }
};

document.getElementById('btn-back-lobby').onclick = () => {
    sfx.sfxSelect();
    if (state.currentRoom) {
        state.currentRoom.coopCamp = null;   // volver al lobby cierra la campaña cooperativa
        if (!state.currentRoom.isLocal && state.currentRoom.hostId !== net.userId) {
            // El invitado vuelve al lobby de la sala; se actualizará cuando el anfitrión lo haga
            if (state.gameInstance) state.gameInstance.destroy();
            switchScreen('lobby');
            renderLobby(state.currentRoom);
            return;
        }
        state.currentRoom.status = 'lobby';
        net.saveRoomState(state.currentRoom);
        switchScreen('lobby');
        renderLobby(state.currentRoom);
    } else {
        switchScreen('menu');
    }
};

window.addEventListener('resize', () => {
    if (state.gameInstance) state.gameInstance.resize();
});

// Botones extra del HUD: controles táctiles y pantalla completa (intenta bloquear horizontal)
document.getElementById('btn-hud-touch').onclick = () => TouchPad.toggle();
document.getElementById('btn-hud-pause').onclick = () => { if (state.gameInstance) state.gameInstance.togglePause(); };
document.getElementById('btn-pause-resume').onclick = () => { if (state.gameInstance) state.gameInstance.togglePause(); };
document.getElementById('btn-pause-exit').onclick = () => document.getElementById('btn-hud-exit').click();
async function toggleFullscreen() {
    try {
        if (!document.documentElement.requestFullscreen) throw new Error('nofs');
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
            if (screen.orientation && screen.orientation.lock) { try { await screen.orientation.lock('landscape'); } catch (e) {} }
        } else {
            await document.exitFullscreen();
        }
    } catch (e) { showToast('Tu navegador no permite pantalla completa. En iPhone usa Compartir → Añadir a pantalla de inicio.', 'warn'); }
}
document.getElementById('btn-hud-full').onclick = toggleFullscreen;
document.getElementById('btn-global-full').onclick = toggleFullscreen;
document.addEventListener('fullscreenchange', () => {
    const t = document.fullscreenElement ? '⤡' : '⛶';
    document.getElementById('btn-global-full').textContent = t;
    document.getElementById('btn-hud-full').textContent = t;
});
TouchPad.refresh();
