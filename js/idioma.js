'use strict';
// =========================================================================
// IDIOMAS: el juego está escrito en español; con English activo se traduce
// todo lo que sale en pantalla (menús, HUD, avisos, textos dibujados en el canvas).
//   - Diccionario ES→EN por frase completa, más patrones para frases con datos (nombres, números).
//   - Un observador del DOM traduce textos nuevos al aparecer; al volver a Español se restauran.
// =========================================================================
const I18n = (function () {
    const KEY = 'sb8_lang';
    let lang = 'es';
    try { const v = localStorage.getItem(KEY); if (v === 'en' || v === 'es') lang = v; } catch (e) { /* ignorar */ }

    // ---------------------------------------------------------------- diccionario
    const EN = {
        // Menú principal
        'MODO HISTORIA': 'STORY MODE', 'PRÁCTICA': 'PRACTICE', 'PERSONALIZAR': 'CUSTOMIZE', 'OPCIONES': 'OPTIONS', 'CÓMO JUGAR': 'HOW TO PLAY', 'COOPERATIVO': 'COOP', 'COOP': 'COOP',
        'JUGADOR': 'PLAYER', '▲▼ Elegir': '▲▼ Select', 'ENTER Aceptar': 'ENTER Accept', 'ESC Volver': 'ESC Back',
        'Enfréntate 1 contra 1 a todo el roster, un rival tras otro, cada uno en su arena.': 'Fight the whole roster 1 vs 1, one rival after another, each in their own arena.',
        'Juega con amigos por internet: crea una sala o únete con un código.': 'Play with friends online: create a room or join with a code.',
        'Pelea contra la IA en este dispositivo: Versus o Cooperativo.': 'Fight the AI on this device: Versus or Co-op.',
        'Elige tu luchador y entrena contra un muñeco: vida infinita, combos y comandos en pantalla.': 'Pick your fighter and train against a dummy: infinite health, combos and on-screen inputs.',
        'Cambia los colores de tu luchador: pelo, polo, bufanda, pantalón, calzado y piel.': "Change your fighter's colors: hair, shirt, scarf, pants, shoes and skin.",
        'Gráficos, sonido, controles y opciones de pantalla (HUD).': 'Graphics, sound, controls and on-screen (HUD) options.',
        'Controles, combos, bloqueo por alturas, poderes, súper y agarres.': 'Controls, combos, height-based blocking, powers, supers and grabs.',
        'Hasta 8 jugadores: todos contra todos, dúos o escuadras. Rellena con bots si quieres.': 'Up to 8 players: free-for-all, duos or squads. Fill with bots if you like.',
        'De 1 a 4 jugadores contra oleadas de enemigos en 8 niveles con jefe.': '1 to 4 players against waves of enemies across 8 levels with a boss.',
        'Batalla rápida contra bots: todos contra todos, dúos o escuadras.': 'Quick battle against bots: free-for-all, duos or squads.',
        'Tú y 3 aliados de la IA contra oleadas de enemigos en 8 niveles.': 'You and 3 AI allies against waves of enemies across 8 levels.',
        'Fondo animado, intro, partículas, temblor de pantalla y contador de FPS.': 'Animated background, intro, particles, screen shake and FPS counter.',
        'Volumen general, música y efectos; también apaga todo el sonido.': 'Master volume, music and effects; you can also mute everything.',
        'Mando, teclado y controles táctiles, por separado para Versus y Cooperativo.': 'Gamepad, keyboard and touch controls, separate for Versus and Co-op.',
        'Cambia el idioma del menú y del juego: Español o English.': 'Change the menu and game language: Español or English.',
        'Números de daño, contador de combos y comandos en pantalla.': 'Damage numbers, combo counter and on-screen inputs.',
        'GRÁFICOS': 'GRAPHICS', 'SONIDO': 'SOUND', 'CONTROLES': 'CONTROLS', 'JUEGO (HUD)': 'GAMEPLAY (HUD)', 'IDIOMA': 'LANGUAGE',
        'ESTADÍSTICAS': 'STATS', '⚡ COMBOS': '⚡ COMBOS', 'TÁCTIL': 'TOUCH', 'TECLADO': 'KEYBOARD', 'MANDO': 'GAMEPAD', 'COMBOS': 'COMBOS', 'Pulsa los golpes seguidos, sin pausa. Controles básicos en CÓMO JUGAR.': 'Press the hits back to back, no pause. Basic controls are in HOW TO PLAY.',
        'AIRE': 'AIR', 'Lanza al aire': 'Launches', 'Derriba': 'Knocks down', 'No se puede bloquear': 'Unblockable', 'Quema': 'Burns', 'Envenena': 'Poisons', 'Aturde': 'Stuns', 'Empuje fuerte': 'Heavy knockback', 'Extra si el rival está agachado': 'Bonus vs. crouching foe', 'Tus combates, victorias, K.O.s, daño y mejor combo en este dispositivo.': 'Your matches, wins, KOs, damage and best combo on this device.',
        'Combates jugados': 'Matches played', 'Partidas de versus terminadas en este dispositivo (offline y online).': 'Finished versus matches on this device (offline and online).', 'Victorias': 'Wins', 'K.O.s': 'KOs', 'Rivales derrotados por ti.': 'Opponents you defeated.',
        'Daño total': 'Total damage', 'Mejor combo': 'Best combo', 'Golpes encadenados más altos en una partida.': 'Highest chained hits in one match.', 'Luchador más usado': 'Most used fighter',
        'Borrar estadísticas': 'Clear stats', 'Pulsa dos veces para confirmar.': 'Press twice to confirm.', 'BORRAR': 'CLEAR', '¿SEGURO?': 'SURE?', 'Estadísticas borradas.': 'Stats cleared.',
        'ENTRENAMIENTO': 'TRAINING', '1 VS 1 · TODOS LOS RIVALES': '1 VS 1 · ALL RIVALS', 'SALAS DE COMBATE': 'BATTLE ROOMS',
        'Prepara la partida a tu medida: elige mapa, dificultad, duración y cuántos bots.': 'Set up the match your way: choose map, difficulty, length and number of bots.',
        'Se requieren al menos 2 luchadores para comenzar.': 'At least 2 fighters are required to start.',
        // Opciones
        'Fondo animado del menú': 'Animated menu background', 'Las arenas pasan solas detrás del menú principal.': 'Arenas cycle by themselves behind the main menu.',
        'Intro al abrir el juego': 'Intro when opening the game', 'Duelo cinematográfico antes del menú.': 'Cinematic duel before the menu.',
        'Temblor de pantalla': 'Screen shake', 'Sacudida de cámara al recibir golpes y súperes.': 'Camera shake on hits and supers.',
        'Partículas': 'Particles', 'Chispas y anillos de impacto. «Bajas» o «Ninguna» ayudan a los móviles lentos.': 'Impact sparks and rings. "Low" or "None" help slow phones.',
        'ALTAS': 'HIGH', 'BAJAS': 'LOW', 'NINGUNA': 'NONE', 'Contador de FPS': 'FPS counter', 'Muestra los cuadros por segundo en una esquina.': 'Shows frames per second in a corner.',
        'Sonido': 'Sound', 'Apaga o enciende todo el audio.': 'Turns all audio on or off.', 'Volumen general': 'Master volume', 'Música': 'Music', 'Tema principal': 'Main theme', '💀 Combate a muerte': '💀 Deathmatch (timed)', '💀 Combate a muerte (5 min)': '💀 Deathmatch (5 min)', '💀 COMBATE A MUERTE (5 MIN VS 7 BOTS)': '💀 DEATHMATCH (5 MIN VS 7 BOTS)', 'COMBATE A MUERTE': 'DEATHMATCH', '⏳ 3 minutos': '⏳ 3 minutes', '⏳ 5 minutos': '⏳ 5 minutes', '⏳ 8 minutos': '⏳ 8 minutes', 'SIN KO AÚN': 'NO KOs YET', 'Música del menú y la sala de espera: el tema nuevo, más agresivo, o el clásico.': 'Menu and lobby music: the new, more aggressive theme or the classic one.', 'NUEVO': 'NEW', 'CLÁSICO': 'CLASSIC', 'Efectos': 'Effects', 'Golpes, poderes, súperes y menús.': 'Hits, powers, supers and menus.',
        'Números de daño': 'Damage numbers', 'El daño sale flotando sobre el luchador golpeado.': 'Damage floats above the fighter that was hit.',
        'Contador de combo': 'Combo counter', 'Muestra tus golpes encadenados en combate.': 'Shows your chained hits in battle.',
        'Comandos en pantalla': 'On-screen inputs', 'Lo que estás pulsando durante la pelea (↓ ↘ → P1…).': "What you're pressing during the fight (↓ ↘ → P1…).",
        'Idioma': 'Language', 'Idioma del menú, el HUD y los avisos de combate.': 'Language of the menu, HUD and combat messages.',
        '🔄 RESTAURAR': '🔄 RESTORE', 'Los cambios se guardan solos en este navegador.': 'Changes are saved automatically in this browser.', 'Ajustes restaurados por defecto.': 'Settings restored to defaults.',
        '✕ CERRAR': '✕ CLOSE', '◀ VOLVER': '◀ BACK', '← VOLVER': '← BACK', 'CERRAR': 'CLOSE',
        // Ajustes de controles
        '⚙️ AJUSTES DE CONTROLES': '⚙️ CONTROL SETTINGS', '⚙️ AJUSTES CONTROLES': '⚙️ CONTROL SETTINGS',
        'Personaliza los botones de Teclado, Mando Xbox y Táctil. Cada modo tiene sus propios controles.': 'Customize Keyboard, Xbox gamepad and Touch buttons. Each mode has its own controls.',
        'CONTROLES DE:': 'CONTROLS FOR:', 'VERSUS': 'VERSUS', '🎮 MANDO XBOX': '🎮 XBOX GAMEPAD', '⌨️ TECLADO': '⌨️ KEYBOARD', '📱 TÁCTIL': '📱 TOUCH',
        'Haz clic en el botón que deseas cambiar y presiona la acción en tu mando Xbox.': 'Click the button you want to change and press the action on your Xbox gamepad.',
        'Haz clic en la tecla que deseas cambiar y presiona la nueva tecla en tu teclado.': 'Click the key you want to change and press the new key on your keyboard.',
        'Movimiento': 'Movement', 'CRUCETA': 'D-PAD', 'ANALÓGICO': 'ANALOG', 'Posición y tamaño de los botones': 'Button position and size', '✏️ EDITAR BOTONES': '✏️ EDIT BUTTONS',
        'Pausa': 'Pause', 'Botón de la barra superior durante la partida.': 'Button in the top bar during the match.', '⏸ (fijo)': '⏸ (fixed)',
        '🔄 RESTAURAR ESTE MODO': '🔄 RESTORE THIS MODE', '✓ GUARDAR Y CERRAR': '✓ SAVE & CLOSE', 'RESTAURAR': 'RESTORE', 'CANCELAR': 'CANCEL', '✓ GUARDAR': '✓ SAVE',
        'Toca un botón': 'Tap a button', 'Opacidad': 'Opacity', 'A TODOS': 'ALL', 'Aplicar esta opacidad a todos los botones': 'Apply this opacity to all buttons', '✏️ EDITAR BOTONES ·': '✏️ EDIT BUTTONS ·', '¡Ajustes guardados correctamente!': 'Settings saved successfully!', 'Controles táctiles guardados.': 'Touch controls saved.',
        'PRESIONA UN BOTÓN...': 'PRESS A BUTTON...', 'PRESIONA UNA TECLA...': 'PRESS A KEY...', 'PRESIONA CUALQUIER TECLA': 'PRESS ANY KEY',
        'Start está asignado a una acción: cámbialo para poder pausar con el mando.': 'Start is assigned to an action: change it to pause with the gamepad.',
        'La tecla P está asignada a una acción, así que solo pausa Esc.': 'The P key is assigned to an action, so only Esc pauses.',
        // Pantalla de preparación
        'Nombre del Luchador': 'Fighter name', 'BRAWLER': 'BRAWLER', 'Roster de Luchadores (4 Hombres / 4 Mujeres)': 'Fighter roster (4 men / 4 women)',
        'FUERZA': 'STRENGTH', 'VELOCIDAD': 'SPEED', 'PODER': 'POWER', 'IDLE': 'IDLE', 'SISTEMA COMBOS Y BLOQUEO': 'COMBO & BLOCK SYSTEM',
        'PUÑO DÉBIL': 'LIGHT PUNCH', 'PUÑO MEDIO': 'MEDIUM PUNCH', 'PUÑO FUERTE': 'HEAVY PUNCH', 'PATADA DÉBIL': 'LIGHT KICK', 'PATADA MEDIA': 'MEDIUM KICK', 'PATADA FUERTE': 'HEAVY KICK',
        'BAJO: PATADA DÉBIL': 'LOW: LIGHT KICK', 'BARRIDA (BAJO FUERTE)': 'SWEEP (LOW HEAVY)', 'LAUNCHER': 'LAUNCHER', 'AGARRE': 'GRAB', 'SÚPER': 'SUPER',
        'Puño débil': 'Light punch', 'Puño medio': 'Medium punch', 'Puño fuerte': 'Heavy punch', 'Patada débil': 'Light kick', 'Súper: gatillo 1 (LT)': 'Super: trigger 1 (LT)', 'Súper: gatillo 2 (RT)': 'Super: trigger 2 (RT)',
        '● RED LISTA': '● NETWORK READY', '● SALA CREADA': '● ROOM CREATED',
        'Elige tu luchador y vence': 'Pick your fighter and beat', '1 contra 1': '1 vs 1', 'a todo el roster, un rival tras otro. Cada rival pelea en su arena y la dificultad va subiendo.': 'the whole roster, one rival after another. Each rival fights in their own arena and the difficulty keeps rising.',
        '⚔️ EMPEZAR HISTORIA': '⚔️ START STORY', 'Entrena contra un': 'Train against a', 'muñeco': 'dummy', ': vida y barra infinitas, contador de combos y tus comandos en pantalla.': ': infinite health and meter, combo counter and your inputs on screen.',
        'Escenario': 'Stage', '🎲 ALEATORIO': '🎲 RANDOM', '🏯 Santuario Ancestral': '🏯 Ancestral Shrine', '🌋 Cráter Ígneo': '🌋 Igneous Crater', '🌑 Cúpula del Eclipse': '🌑 Eclipse Dome', '🌃 Ciudad Neón': '🌃 Neon City',
        '🧪 Laboratorio Cuántico': '🧪 Quantum Lab', '🎋 Templo Esmeralda': '🎋 Emerald Temple', '🪨 Abismo Sísmico': '🪨 Seismic Abyss', '☣️ Foso Tóxico': '☣️ Toxic Pit', '🥋 EMPEZAR PRÁCTICA': '🥋 START PRACTICE',
        'Crea una arena privada de hasta': 'Create a private arena for up to', '8 jugadores': '8 players', 'o lucha contra la IA en 8 mapas temáticos.': 'or fight the AI on 8 themed maps.',
        '⚡ CREAR NUEVA SALA': '⚡ CREATE NEW ROOM', 'Unirse con Código de Sala': 'Join with Room Code', 'UNIRSE': 'JOIN', '⚙️ PARTIDA PERSONALIZADA': '⚙️ CUSTOM MATCH',
        '⚔️ Todos vs todos': '⚔️ Free-for-all', '👥 Dúos': '👥 Duos', '🛡️ 4 vs 4': '🛡️ 4 vs 4', '🤝 Cooperativo (3 aliados IA)': '🤝 Co-op (3 AI allies)',
        '🔥 BATALLA RÁPIDA (VS 7 BOTS)': '🔥 QUICK BATTLE (VS 7 BOTS)', '🔥 BATALLA RÁPIDA (COOP CON 3 ALIADOS IA)': '🔥 QUICK BATTLE (CO-OP WITH 3 AI ALLIES)',
        // Lobby
        'SALA DE ESPERA • CONFIGURACIÓN DE ARENA': 'WAITING ROOM • ARENA SETUP', 'SIN CONEXIÓN • CONFIGURACIÓN DE ARENA': 'OFFLINE • ARENA SETUP', 'PARTIDA OFFLINE': 'OFFLINE MATCH', '📋 COPIAR CÓDIGO': '📋 COPY CODE',
        '👥 Modo de Juego': '👥 Game Mode', '⚔️ Todos contra todos': '⚔️ Free-for-all', '👥 Dúos (equipos de 2)': '👥 Duos (teams of 2)', '🛡️ Escuadras 4 vs 4': '🛡️ Squads 4 vs 4', '🤝 Cooperativo (máx. 4)': '🤝 Co-op (max. 4)',
        '🗺️ Escenario Temático': '🗺️ Themed Stage', '🎲 ALEATORIO (RANDOM)': '🎲 RANDOM', '🤖 Dificultad IA Bots': '🤖 Bot AI Difficulty', '🌱 FÁCIL (Reacción Lenta)': '🌱 EASY (Slow reactions)', '⚔️ NORMAL (Equilibrado)': '⚔️ NORMAL (Balanced)',
        '🔥 HARDCORE / PRO (Combos & Juggle)': '🔥 HARDCORE / PRO (Combos & Juggle)', '⏱️ Duración de Partida': '⏱️ Match Length', '⏳ Clásico (99 Segundos)': '⏳ Classic (99 seconds)', '♾️ Tiempo Infinito (∞)': '♾️ Infinite time (∞)',
        'Luchadores listos.': 'Fighters ready.', '+ AÑADIR BOT IA': '+ ADD AI BOT', '🤖 LLENAR HASTA 8': '🤖 FILL UP TO 8', 'QUITAR BOTS': 'REMOVE BOTS', '⚔️ ¡INICIAR COMBATE!': '⚔️ START FIGHT!',
        'ESPERANDO AL ANFITRIÓN...': 'WAITING FOR THE HOST...', 'El anfitrión iniciará el combate pronto.': 'The host will start the fight soon.', 'Añade al menos 1 Bot IA o espera a otro jugador.': 'Add at least 1 AI bot or wait for another player.',
        ' ⚠ Equipos desparejos: añade o quita bots para equilibrar.': ' ⚠ Uneven teams: add or remove bots to balance.', 'TODOS CONTRA TODOS': 'FREE-FOR-ALL', 'DÚOS': 'DUOS', 'ESCUADRAS 4 VS 4': 'SQUADS 4 VS 4',
        'ROJO': 'RED', 'AZUL': 'BLUE', 'VERDE': 'GREEN', 'AMARILLO': 'YELLOW', 'LOCAL': 'LOCAL', 'OFFLINE': 'OFFLINE', 'ONLINE': 'ONLINE',
        // Partida / HUD
        'MUÑECO: QUIETO': 'DUMMY: IDLE', 'MUÑECO: AGACHADO': 'DUMMY: CROUCHING', 'MUÑECO: BLOQUEA DE PIE': 'DUMMY: BLOCKS STANDING', 'MUÑECO: BLOQUEA AGACHADO': 'DUMMY: BLOCKS CROUCHING', 'MUÑECO: SALTA': 'DUMMY: JUMPS', 'MUÑECO: ATACA (IA)': 'DUMMY: ATTACKS (AI)',
        'VIDA ∞: ON': 'HEALTH ∞: ON', 'VIDA ∞: OFF': 'HEALTH ∞: OFF', 'BARRA ∞: ON': 'METER ∞: ON', 'BARRA ∞: OFF': 'METER ∞: OFF', 'COMANDOS: ON': 'INPUTS: ON', 'COMANDOS: OFF': 'INPUTS: OFF', '↺ POSICIONES': '↺ POSITIONS',
        '✛ Mover · A Aceptar · B Volver · LB/RB Pestañas': '✛ Move · A Select · B Back · LB/RB Tabs', '←↑↓→ Mover · Enter Aceptar · Esc Volver · Q/E Pestañas': '←↑↓→ Move · Enter Select · Esc Back · Q/E Tabs',
        'SALTAR ▶▶': 'SKIP ▶▶', '¡EMPUJÓN!': 'SHOVE!', '¡FURIA!': 'RAGE!', '¡BARRIDA!': 'SWEEP!',
        'SALIR': 'EXIT', 'PAUSA': 'PAUSE', 'Partida en pausa': 'Game paused', '▶ REANUDAR': '▶ RESUME', 'Esc · P · Start (mando) para pausar / reanudar': 'Esc · P · Start (gamepad) to pause / resume',
        'Solo el anfitrión puede pausar la partida.': 'Only the host can pause the match.', 'El anfitrión pausó la partida': 'The host paused the match',
        'GIRA TU TELÉFONO': 'ROTATE YOUR PHONE', 'El juego está pensado para horizontal: menús, sala y combate.': 'The game is designed for landscape: menus, lobby and combat.', 'Continuar en vertical': 'Continue in portrait',
        'Pantalla completa': 'Fullscreen', 'Modo de juego': 'Game mode', 'Menú principal': 'Main menu', 'Ej. BRAWLER_X': 'e.g. BRAWLER_X', 'Instrucciones según el modo': 'Instructions by mode', 'EJ. ARENA': 'E.G. ARENA',
        'Pausa (Esc / P / Start)': 'Pause (Esc / P / Start)', 'Mostrar/ocultar controles táctiles': 'Show/hide touch controls', 'Anterior': 'Previous', 'Siguiente': 'Next',
        'QUIETO': 'IDLE', 'AGACHADO': 'CROUCHING', 'BLOQUEA DE PIE': 'BLOCKS STANDING', 'BLOQUEA AGACHADO': 'BLOCKS CROUCHING', 'SALTA': 'JUMPS', 'ATACA (IA)': 'ATTACKS (AI)',
        '¡LAUNCHER!': 'LAUNCHER!', '¡CHOQUE DE AGARRES!': 'GRAB CLASH!', '¡AGARRE ROMPEGUARDIA!': 'GUARD-BREAK GRAB!', '¡AGARRE!': 'GRAB!', '¡AGARRE ROTO!': 'GRAB BROKEN!', '¡BAJO!': 'LOW!', '¡ALTO!': 'HIGH!', '¡BLOQUEO!': 'BLOCK!',
        '¡ROMPEGUARDIA (ESPALDA)!': 'GUARD BREAK (BACK)!', 'ARMADURA': 'ARMOR', '¡K.O. AMBIENTAL!': 'ENVIRONMENTAL K.O.!', '¡CHOQUE!': 'CLASH!', '¡HAZ CUÁNTICO!': 'QUANTUM BEAM!', '⚠ LLUVIA ÁCIDA': '⚠ ACID RAIN',
        '¡RÁFAGA →!': 'GUST →!', '¡← RÁFAGA!': '← GUST!', '¡GRAVEDAD LUNAR!': 'LUNAR GRAVITY!', '¡LLUVIA DE METEOROS!': 'METEOR SHOWER!', '¡DESPRENDIMIENTO!': 'ROCKFALL!', '¡TEMBLOR! ¡SUBE A LAS PLATAFORMAS!': 'QUAKE! GET ON THE PLATFORMS!',
        '¡ÚLTIMOS SEGUNDOS!': 'FINAL SECONDS!', '¡DUELO FINAL!': 'FINAL DUEL!', '¡ÚLTIMOS EN PIE!': 'LAST ONES STANDING!', '¡TIEMPO AGOTADO!': 'TIME UP!', '¡TIEMPO!': 'TIME!', '¡DERROTA!': 'DEFEAT!',
        'FIN DEL COMBATE • RESULTADOS': 'END OF FIGHT • RESULTS', '¡GANADOR!': 'WINNER!', 'Luchador': 'Fighter', 'Daño Total': 'Total damage', '🔄 REVANCHA INMEDIATA': '🔄 INSTANT REMATCH', 'VOLVER AL LOBBY DE SALA': 'BACK TO ROOM LOBBY',
        'DAÑO': 'DAMAGE', 'LUCHADOR': 'FIGHTER', 'ENEMIGOS DERROTADOS': 'ENEMIES DEFEATED', 'JEFE': 'BOSS',
        // Combos
        '¡TRIPLE CORTE!': 'TRIPLE SLASH!', '¡GIRO DE KATANA!': 'KATANA SPIN!', '¡CONTRA DE SAMURÁI!': 'SAMURAI COUNTER!', '¡RÁFAGA ARDIENTE!': 'BLAZING BARRAGE!', '¡PUÑO CARMESÍ!': 'CRIMSON FIST!', '¡PATADA BRASA!': 'EMBER KICK!', '¡CHISPA TRIPLE!': 'TRIPLE SPARK!', '¡DESCARGA EN CADENA!': 'CHAIN DISCHARGE!', '¡TRUENO CERRADO!': 'CLOSING THUNDER!', '¡COLAS VELOCES!': 'SWIFT TAILS!', '¡BARRIDO SOMBRA!': 'SHADOW SWEEP!', '¡ZARPA ESPECTRAL!': 'SPECTRAL CLAW!', '¡PROTOCOLO GOLPE!': 'STRIKE PROTOCOL!', '¡IMPACTO HIDRÁULICO!': 'HYDRAULIC IMPACT!', '¡BARRIDO TÁCTICO!': 'TACTICAL SWEEP!', '¡CUATRO VIENTOS!': 'FOUR WINDS!', '¡CORTE ASCENDENTE!': 'RISING CUT!', '¡GIRO CORTANTE!': 'CUTTING SPIN!', '¡DOBLE MARTILLO!': 'DOUBLE HAMMER!', '¡PUÑO ROCA!': 'ROCK FIST!', '¡PISOTÓN DOBLE!': 'DOUBLE STOMP!', '¡COLA RASTRERA!': 'CREEPING TAIL!', '¡MORDIDA DOBLE!': 'DOUBLE BITE!', '¡COLMILLO!': 'FANG!',
        // Red
        'Reconectando con el anfitrión…': 'Reconnecting to the host…', '¡Reconectado!': 'Reconnected!', 'No se pudo reconectar con el anfitrión.': 'Could not reconnect to the host.', 'Se perdió la conexión con el anfitrión.': 'Lost connection to the host.',
        'Tu conexión es lenta: puede notarse retraso en los golpes.': 'Your connection is slow: you may notice delayed hits.', 'Conexión lenta': 'Slow connection',
        // Coop
        '¡CAMPAÑA COMPLETADA!': 'CAMPAIGN COMPLETE!', '🏆 ¡CAMPAÑA COMPLETADA!': '🏆 CAMPAIGN COMPLETE!', '🔄 NUEVA CAMPAÑA': '🔄 NEW CAMPAIGN', '¡IMPACTO!': 'IMPACT!', '¡DERROTA A SU FANTASMA!': 'DEFEAT ITS GHOST!', '¡REVIVIDO!': 'REVIVED!',
        '¡ENERGÍA! +30%': 'ENERGY! +30%', '¡SÚPER CARGADO!': 'SUPER CHARGED!', '¡JEFE DERROTADO!': 'BOSS DEFEATED!', '¡ZONA LIMPIA!': 'AREA CLEAR!', '¡VE! ▶': 'GO! ▶',
        'Los caídos reviven con el 50 % y el equipo recupera +50 % de vida': 'Fallen fighters revive at 50% and the team recovers +50% health',
        'NINJA': 'NINJA', 'SAMURÁI': 'SAMURAI', 'MONJE GUERRERO': 'WARRIOR MONK', 'SAQUEADOR': 'RAIDER', 'MINERO': 'MINER', 'GOLEM DE MAGMA': 'MAGMA GOLEM', 'EXPLORADOR LUNAR': 'LUNAR EXPLORER', 'ASTRONAUTA': 'ASTRONAUT', 'TRAJE PESADO': 'HEAVY SUIT',
        'PANDILLERO NEÓN': 'NEON GANGSTER', 'GUARDIA': 'GUARD', 'ROBOT': 'ROBOT', 'CIENTÍFICO MUTADO': 'MUTATED SCIENTIST', 'GUARDIA DE SEGURIDAD': 'SECURITY GUARD', 'EXPERIMENTO': 'EXPERIMENT', 'DISCÍPULO': 'DISCIPLE', 'GUERRERO DE JADE': 'JADE WARRIOR',
        'GUARDIÁN DE JADE': 'JADE GUARDIAN', 'ESPELEÓLOGO': 'CAVER', 'GOLEM DE ROCA': 'ROCK GOLEM', 'OPERARIO': 'WORKER', 'MUTANTE': 'MUTANT', 'ABOMINACIÓN': 'ABOMINATION', 'INFECTADO': 'INFECTED',
        // Salas / red
        'Ingresa un código de sala.': 'Enter a room code.', 'Esperando a que el anfitrión inicie la revancha.': 'Waiting for the host to start the rematch.', 'Partida offline preparada': 'Offline match ready',
        'Tu navegador no permite pantalla completa. En iPhone usa Compartir → Añadir a pantalla de inicio.': 'Your browser does not allow fullscreen. On iPhone use Share → Add to Home Screen.',
        'Cooperativo online: llega en la etapa 2C. Por ahora inícialo solo con bots aliados.': 'Online co-op: coming in stage 2C. For now, start it alone with allied bots.',
        'No se cargó PeerJS.': 'PeerJS did not load.', 'No se pudo crear la sala. Inténtalo de nuevo.': 'Could not create the room. Try again.', 'El código debe tener 5 caracteres.': 'The code must have 5 characters.',
        'El anfitrión cerró la sala.': 'The host closed the room.', 'La partida ya está en curso.': 'The match is already in progress.', 'La sala está llena (8/8).': 'The room is full (8/8).', 'Solo el anfitrión puede cambiar el modo.': 'Only the host can change the mode.',
        'Sala llena (Máx. 4 jugadores en Cooperativo)': 'Room full (max. 4 players in Co-op)',
        // Historia / práctica / personalizar
        '¡K.O.!': 'K.O.!', 'DERROTA': 'DEFEAT', 'SALIR ': 'EXIT ', '➡ SIGUIENTE COMBATE': '➡ NEXT FIGHT', '🔄 REINTENTAR': '🔄 RETRY', '🏆 VOLVER AL MENÚ': '🏆 BACK TO MENU', '★ ¡HISTORIA COMPLETADA! ★': '★ STORY COMPLETE! ★',
        'SIN REINTENTOS': 'NO RETRIES', 'SONIDO: ON': 'SOUND: ON', 'SONIDO: OFF': 'SOUND: OFF', '● PEERJS NO DISPONIBLE': '● PEERJS UNAVAILABLE', '● PEERJS LISTO': '● PEERJS READY', '● CONECTADO P2P': '● P2P CONNECTED', '♂ HOMBRE': '♂ MALE', '♀ MUJER': '♀ FEMALE', 'HOMBRE': 'MALE', 'MUJER': 'FEMALE', 'Controles en pantalla para el teléfono (': 'On-screen controls for the phone (', ').': ').',
        'En el editor arrastra cada botón para moverlo y usa el control de tamaño para hacerlo más grande o pequeño. Se recomienda el teléfono en horizontal. La visibilidad de los controles táctiles en combate se cambia con el botón 🎮 del HUD.': 'In the editor, drag each button to move it and use the size control to make it bigger or smaller. Landscape phone orientation is recommended. Touch control visibility during combat is toggled with the 🎮 button in the HUD.', '¡LE GANASTE': 'YOU BEAT', 'A TODOS!': 'EVERYONE!', 'MODO HISTORIA ': 'STORY MODE ', 'FÁCIL': 'EASY', 'NORMAL': 'NORMAL', 'EXTREMA': 'EXTREME',
        'Colores de tu luchador · se guardan solos': 'Your fighter\'s colors · saved automatically', '↺ COLORES ORIGINALES': '↺ ORIGINAL COLORS', '🎲 ALEATORIO ': '🎲 RANDOM ',
        'CABEZA / PELO': 'HEAD / HAIR', 'TORSO / POLO': 'TORSO / SHIRT', 'BUFANDA / ACCESORIO': 'SCARF / ACCESSORY', 'PIERNAS': 'LEGS', 'CALZADO': 'SHOES', 'PIEL': 'SKIN',
        'MUÑECO': 'DUMMY', 'MUÑECO: ': 'DUMMY: ', 'VIDA ∞': 'HEALTH ∞', 'BARRA ∞': 'METER ∞', 'COMANDOS': 'INPUTS',
        // Personajes y arenas
        'Energía Azul': 'Blue Energy', 'Fuego Carmesí': 'Crimson Fire', 'Rayo Celeste': 'Sky Lightning', 'Oscuridad Satsui': 'Satsui Darkness', 'Plasma Neón': 'Neon Plasma', 'Tornado Esmeralda': 'Emerald Tornado', 'Roca Sísmica': 'Seismic Rock', 'Ácido Venenoso': 'Venomous Acid',
        'Onda Azul': 'Blue Wave', 'Nova Estelar': 'Stellar Nova', 'Orbe Ígneo': 'Fire Orb', 'Erupción Solar': 'Solar Eruption', 'Pulso Eléctrico': 'Electric Pulse', 'Láser Cuántico': 'Quantum Laser', 'Cañón Satelital': 'Satellite Cannon',
        'Huracán Cortante': 'Cutting Hurricane', 'Meteoro Telúrico': 'Telluric Meteor', 'Cataclismo Pétreo': 'Stone Cataclysm', 'Lluvia Tóxica': 'Toxic Rain',
        'Samurái errante · katana a la espalda y bufanda carmesí': 'Wandering samurai · katana on his back and a crimson scarf',
        'Melena de fuego viva · puños envueltos en llamas': 'Living mane of fire · fists wrapped in flames',
        'Hombreras de acero · chispas eléctricas en los puños': 'Steel shoulder pads · electric sparks on his fists',
        'Kitsune sombría · tres colas espectrales y máscara': 'Dark kitsune · three spectral tails and a mask',
        'Cuerpo blindado · visor de escaneo, núcleo de plasma y jetpack': 'Armored body · scanning visor, plasma core and jetpack',
        'Capucha de cobra · trenza serpiente y colmillos tóxicos': 'Cobra hood · snake braid and toxic fangs',
        'Santuario Ancestral': 'Ancestral Shrine', 'Cráter Ígneo': 'Igneous Crater', 'Cúpula del Eclipse': 'Eclipse Dome', 'Ciudad Neón': 'Neon City', 'Laboratorio Cuántico': 'Quantum Lab', 'Templo Esmeralda': 'Emerald Temple', 'Abismo Sísmico': 'Seismic Abyss', 'Foso Tóxico': 'Toxic Pit'
    };

    // Ayuda de combos: cada <p> se traduce completo
    const HELP_EN = {
        'combo-help-versus': [
            '🥊 <b class="text-white">Punches:</b> <b class="text-yellow-300">U · I · O</b> • <b class="text-white">Kicks:</b> <b class="text-yellow-300">J · K · L</b>',
            '🛡️ <b class="text-white">Block:</b> hold <b class="text-yellow-300">back</b> (standing) or <b class="text-yellow-300">↓ + back</b> (crouching)',
            '📏 <b class="text-white">Heights:</b> jump = HIGH (block standing) • ↓ + hit = LOW (block crouching)',
            '🔄 <b class="text-white">Turn around:</b> <b class="text-yellow-300">back, back</b> quickly • <b class="text-white">Roll:</b> <b class="text-yellow-300">↓ + forward</b>',
            '🚀 <b class="text-white">Launcher:</b> <b class="text-yellow-300">↓ + O</b> (gamepad ↓ + LB / touch ↓ + P.H) and hit in the air (max. 4)',
            '🦵 <b class="text-white">Sweep:</b> <b class="text-yellow-300">↓ + L</b> (gamepad ↓ + RB / touch ↓ + K.H)',
            '🔮 <b class="text-white">Power:</b> hold <b class="text-yellow-300">back 0.7 s</b>, then <b class="text-yellow-300">forward + punch</b>',
            '🌟 <b class="text-white">Super:</b> <b class="text-yellow-300">O + L</b> (gamepad LT + RT) with a full bar',
            '🤼 <b class="text-white">Grab:</b> <b class="text-yellow-300">forward + I + O</b> (break it the same way within 0.23 s)',
            '🦅 <b class="text-white">In the air:</b> straight hit, <b class="text-yellow-300">↘</b> diagonal or <b class="text-yellow-300">↓</b> stomp',
            '🎮 <b class="text-white">Gamepad:</b> X·Y·LB punches • A·B·RB kicks • LT+RT super'
        ],
        'combo-help-coop': [
            '🕹️ <b class="text-white">Movement:</b> <b class="text-yellow-300">← →</b> horizontal • <b class="text-yellow-300">↑ ↓</b> back / front of the stage',
            '🦘 <b class="text-white">Short jump:</b> <b class="text-yellow-300">U</b> (gamepad <b class="text-yellow-300">X</b>) • <b class="text-white">Long jump:</b> <b class="text-yellow-300">J</b> (gamepad <b class="text-yellow-300">A</b>), both move forward',
            '🥊 <b class="text-white">Punches:</b> <b class="text-yellow-300">I</b> medium · <b class="text-yellow-300">O</b> heavy • <b class="text-white">Kicks:</b> <b class="text-yellow-300">K</b> medium · <b class="text-yellow-300">L</b> heavy',
            '🔮 <b class="text-white">Power:</b> hold <b class="text-yellow-300">back 0.7 s</b>, then <b class="text-yellow-300">forward + punch</b> (same as versus)',
            '🌟 <b class="text-white">Super:</b> <b class="text-yellow-300">O + L</b> (gamepad LT + RT) with a full bar',
            '🎮 <b class="text-white">Gamepad:</b> X short jump • A long jump • Y·LB punches • B·RB kicks • LT+RT super',
            '👥 <b class="text-white">Team:</b> 1 to 4 fighters, 8 levels with a boss. Food and drinks drop from enemies; medal + ghost to revive',
            '🌊 <b class="text-white">Terrain:</b> lakes and chasms that can only be crossed by <b class="text-yellow-300">jumping</b> (long jump, or two short ones using the stone); lava/acid puddles drain health; jump onto platforms and steps. Bosses resist the sweep and shove you if you corner them',
            '🦵 <b class="text-white">Sweep:</b> <b class="text-yellow-300">↓ + L</b> • 🚀 <b class="text-white">Launcher:</b> <b class="text-yellow-300">↓ + O</b>',
            '🤼 <b class="text-white">Grab-throw:</b> <b class="text-yellow-300">forward + I + O</b> (touch: forward + grab); jump and hit them in the air (max. 4)',
            'ℹ️ <b class="text-white">Note:</b> in co-op there is no light punch or light kick; those buttons are the jumps. Versus is unchanged.'
        ]
    };
    const HELP_ES = {};

    // ---------------------------------------------------------------- patrones (frases con datos)
    const TERM = s => tr(s);
    const PATTERNS = [
        [/^📶 (.+)$/, (m) => '📶 ' + m[1].replace('pérd.', 'loss')],
        [/^(.+) para pausar \/ reanudar$/, (m) => m[1].replace(/\(mando\)/, '(gamepad)').replace('Sin asignar', 'Unassigned') + ' to pause / resume'],
        [/^¡(.+) GANA!$/, (m) => `${m[1]} WINS!`],
        [/^¡GANA EQUIPO (.+)!$/, (m) => `TEAM ${TERM(m[1])} WINS!`],
        [/^🏆 ¡GANA EQUIPO (.+)!$/, (m) => `🏆 TEAM ${TERM(m[1])} WINS!`],
        [/^🏆 ¡GANADOR: (.+)!$/, (m) => `🏆 WINNER: ${m[1]}!`],
        [/^COMBATE (\d+) \/ (\d+)$/, (m) => `FIGHT ${m[1]} / ${m[2]}`],
        [/^VICTORIA (\d+) \/ (\d+)$/, (m) => `VICTORY ${m[1]} / ${m[2]}`],
        [/^(.+) DERROTADO$/, (m) => `${m[1]} DEFEATED`],
        [/^(.+) TE VENCIÓ$/, (m) => `${m[1]} BEAT YOU`],
        [/^SIGUIENTE: (.+)$/, (m) => `NEXT: ${m[1]}`],
        [/^(.+) VENCIÓ A TODOS$/, (m) => `${m[1]} BEAT EVERYONE`],
        [/^¡LE GANASTE\s*A TODOS!$/, () => 'YOU BEAT\nEVERYONE!'],
        [/^(.+) ES EL CAMPEÓN INVICTO$/, (m) => `${m[1]} IS THE UNDEFEATED CHAMPION`],
        [/^(\d+) RIVALES DERROTADOS$/, (m) => `${m[1]} RIVALS DEFEATED`],
        [/^(\d+) REINTENTOS?$/, (m) => `${m[1]} RETR${m[1] === '1' ? 'Y' : 'IES'}`],
        [/^(.+) · DIFICULTAD (.+)$/, (m) => `${TERM(m[1])} · ${TERM(m[2])} DIFFICULTY`],
        [/^Historia completada con: (.+)$/, (m) => `Story completed with: ${m[1]}`],
        [/^SALA: (.+)$/, (m) => `ROOM: ${TERM(m[1])}`], [/^(\S+) MUÑECO$/, (m) => `${m[1]} DUMMY`], [/^MAPA: (.+)$/, (m) => `MAP: ${TERM(m[1])}`], [/^VIVOS: (.+)$/, (m) => `ALIVE: ${m[1]}`],
        [/^MEJOR COMBO: (\d+) HITS · (\d+) DAÑO$/, (m) => `BEST COMBO: ${m[1]} HITS · ${m[2]} DAMAGE`],
        [/^ÚLTIMO: (\d+) HITS?$/, (m) => `LAST: ${m[1]} HIT${m[1] === '1' ? '' : 'S'}`],
        [/^(\d+) DAÑO$/, (m) => `${m[1]} DAMAGE`],
        [/^Sala (.+) creada$/, (m) => `Room ${m[1]} created`], [/^Unido a la sala (.+)$/, (m) => `Joined room ${m[1]}`], [/^Código "(.+)" copiado$/, (m) => `Code "${m[1]}" copied`],
        [/^No se encontró la sala "(.+)"\.$/, (m) => `Room "${m[1]}" not found.`],
        [/^Máximo (\d+) luchadores en este modo\.$/, (m) => `Maximum ${m[1]} fighters in this mode.`],
        [/^Se quitaron (\d+) bot\(s\) sobrantes \(máx\. (\d+) en Cooperativo\)\.$/, (m) => `Removed ${m[1]} extra bot(s) (max. ${m[2]} in Co-op).`],
        [/^No se puede cambiar a Cooperativo: hay (\d+) jugadores y el máximo es (\d+)\.$/, (m) => `Cannot switch to Co-op: there are ${m[1]} players and the maximum is ${m[2]}.`],
        [/^SLOT (\d+) • VACÍO$/, (m) => `SLOT ${m[1]} • EMPTY`],
        [/^SLOT (\d+) bloqueado en Cooperativo \(máx\. (\d+) jugadores\)$/, (m) => `SLOT ${m[1]} locked in Co-op (max. ${m[2]} players)`],
        [/^¡Todo listo! (\d+) luchadores en la arena\.$/, (m) => `All set! ${m[1]} fighters in the arena.`],
        [/^¡Equipo listo! (\d+)\/(\d+) luchadores\. La dificultad se ajusta al número de jugadores\.$/, (m) => `Team ready! ${m[1]}/${m[2]} fighters. Difficulty scales with the number of players.`],
        [/^Poder: (.+) • Súper: (.+)$/, (m) => `Power: ${TERM(m[1])} • Super: ${TERM(m[2])}`],
        [/^Poder: (.+) • Launcher: (.+)$/, (m) => `Power: ${TERM(m[1])} • Launcher: ${TERM(m[2])}`],
        [/^(.+) • SÚPER ARTE$/, (m) => `${m[1]} • SUPER ART`],
        [/^¡NIVEL (\d+) COMPLETADO!$/, (m) => `LEVEL ${m[1]} COMPLETE!`], [/^¡JEFE: (.*)$/, (m) => `BOSS: ${m[1]}`],
        [/^Botón (\d+)$/, (m) => `Button ${m[1]}`], [/^Asignado (.+) a (.+)$/, (m) => `Assigned ${m[1]} to ${m[2]}`],
        [/^(.+): próximamente\.$/, (m) => `${TERM(m[1])}: coming soon.`],
        [/^¡RESISTE! (\d+)\/(\d+)$/, (m) => `RESISTED! ${m[1]}/${m[2]}`],
        [/^¡(CAÍSTE|AL AGUA|AL FUEGO|AL ÁCIDO)! -(\d+)$/, (m) => `${{ 'CAÍSTE': 'YOU FELL', 'AL AGUA': 'SPLASH', 'AL FUEGO': 'BURNED', 'AL ÁCIDO': 'DISSOLVED' }[m[1]]}! -${m[2]}`],
        [/^◢ (.+) ◣$/, (m) => `◢ ${tr(m[1])} ◣`],
        [/^(.+) · ([A-ZÁÉÍÓÚ ]+)$/, (m) => { const a = tr(m[1]), b = tr(m[2]); return (a !== m[1] || b !== m[2]) ? `${a} · ${b}` : null; }],
        [/^(.+) • (.+)$/, (m) => { const a = tr(m[1]), b = tr(m[2]); return (a !== m[1] || b !== m[2]) ? `${a} • ${b}` : null; }]
    ];
    const LOWER = {};
    for (const k of Object.keys(EN)) LOWER[k.toLowerCase()] = EN[k];

    const cache = new Map();
    function tr(s) {
        if (lang !== 'en' || typeof s !== 'string' || s.length < 2) return s;
        if (cache.has(s)) return cache.get(s);
        let out = s;
        if (EN[s] !== undefined) out = EN[s];
        else {
            const lo = LOWER[s.toLowerCase()];
            if (lo !== undefined) out = s === s.toUpperCase() ? lo.toUpperCase() : lo;
            else {
                for (const [re, fn] of PATTERNS) { const m = re.exec(s); if (m) { const r = fn(m); if (r) { out = r; break; } } }
            }
        }
        if (cache.size > 3000) cache.clear();
        cache.set(s, out);
        return out;
    }

    // ---------------------------------------------------------------- DOM
    const textNodes = new Map();   // nodo -> { es, en }
    const attrs = new Map();       // elemento -> { attr: {es, en} }
    const ATTRS = ['placeholder', 'title', 'aria-label'];

    function doText(n) {
        const raw = n.nodeValue, st = textNodes.get(n);
        if (st && raw === st.en) return;
        const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0], core = raw.slice(lead.length, raw.length - trail.length);
        if (!core) return;
        const out = tr(core);
        if (out !== core) { const nv = lead + out + trail; textNodes.set(n, { es: raw, en: nv }); n.nodeValue = nv; }
    }
    function doAttrs(el) {
        for (const a of ATTRS) {
            if (!el.hasAttribute || !el.hasAttribute(a)) continue;
            const raw = el.getAttribute(a), rec = attrs.get(el) || {};
            if (rec[a] && rec[a].en === raw) continue;
            const out = tr(raw);
            if (out !== raw) { rec[a] = { es: raw, en: out }; attrs.set(el, rec); el.setAttribute(a, out); }
        }
    }
    function scan(root) {
        if (lang !== 'en') return;
        if (root.nodeType === 3) { doText(root); return; }
        if (root.nodeType !== 1) return;
        if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
        doAttrs(root);
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode: n => (n.nodeType === 1 && (n.tagName === 'SCRIPT' || n.tagName === 'STYLE')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        let n;
        while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
    }
    let obs = null, busy = false;
    function observe() {
        if (obs) return;
        obs = new MutationObserver(list => {
            if (lang !== 'en' || busy) return;
            busy = true;
            try {
                for (const m of list) {
                    if (m.type === 'characterData') doText(m.target);
                    else if (m.type === 'attributes') doAttrs(m.target);
                    else m.addedNodes.forEach(n => scan(n));
                }
            } finally { busy = false; }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    }
    function restore() {
        for (const [n, st] of textNodes) { if (n.isConnected && n.nodeValue === st.en) n.nodeValue = st.es; }
        textNodes.clear();
        for (const [el, rec] of attrs) for (const a of Object.keys(rec)) if (el.getAttribute(a) === rec[a].en) el.setAttribute(a, rec[a].es);
        attrs.clear();
    }

    function applyHelp() {
        for (const id of Object.keys(HELP_EN)) {
            const box = document.getElementById(id); if (!box) continue;
            const ps = box.querySelectorAll(':scope > p');
            if (!HELP_ES[id]) HELP_ES[id] = [...ps].map(p => p.innerHTML);
            ps.forEach((p, i) => { p.innerHTML = lang === 'en' ? HELP_EN[id][i] : HELP_ES[id][i]; });
        }
    }

    function apply() {
        cache.clear();
        document.documentElement.lang = lang;
        busy = true;
        try {
            applyHelp();
            if (lang === 'en') scan(document.body); else restore();
            document.title = lang === 'en' ? 'STREET BRAWL 8: ARCADE ROYALE' : document.title;
        } finally { busy = false; }
    }

    // ---------------------------------------------------------------- canvas (nombres de súper, textos flotantes…)
    (function patchCanvas() {
        const P = CanvasRenderingContext2D.prototype;
        for (const fn of ['fillText', 'strokeText', 'measureText']) {
            const o = P[fn];
            P[fn] = function (t, ...r) { return o.call(this, (lang === 'en' && typeof t === 'string') ? tr(t) : t, ...r); };
        }
    })();

    function set(l) {
        if (l !== 'es' && l !== 'en') return;
        lang = l;
        try { localStorage.setItem(KEY, l); } catch (e) { /* ignorar */ }
        apply();
        observe();
        window.dispatchEvent(new Event('sb8-lang'));
    }
    function init() { observe(); if (lang === 'en') apply(); else document.documentElement.lang = 'es'; }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    return { t: tr, set, lang: () => lang, label: () => (lang === 'en' ? 'English' : 'Español'), apply };
})();
