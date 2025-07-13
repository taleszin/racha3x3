document.addEventListener('DOMContentLoaded', () => {

    let TEAMS = [];
    let gamesData = { type: '', rounds: [], finalMatch: null, timers: {}, activeGameId: null };
    const ICONS = ['🏀', '🔥', '🏆', '👑', '⚡️', '💀', '🎯', '🚀', '👽', '💣', '💯', '💎'];
    let mainTimerInterval, shotClockInterval;
    let teamPerformanceChartInstance = null;
    let topScorersChartInstance = null;

    // A linha "const { jsPDF }..." foi removida daqui para corrigir o bug.

    const numTeamsInput = document.getElementById('num-teams-input');
    const formatSelect = document.getElementById('format-select');
    const numRoundsInput = document.getElementById('num-rounds-input');
    const timerDurationInput = document.getElementById('timer-duration-input');
    const startTimeInput = document.getElementById('start-time-input');
    const breakDurationInput = document.getElementById('break-duration-input');
    const setupTeamsBtn = document.getElementById('setup-teams-btn');
    const startTournamentBtn = document.getElementById('start-tournament-btn');
    const resetTournamentBtn = document.getElementById('reset-tournament-btn');
    const downloadPdfBtn = document.getElementById('download-pdf-btn');
    
    const teamSetupModal = document.getElementById('team-setup-modal');
    const teamSetupContainer = document.getElementById('team-setup-container');
    const teamStatsModal = document.getElementById('team-stats-modal');
    const teamStatsContent = document.getElementById('team-stats-content');
    const scoreboardModal = document.getElementById('scoreboard-modal');
    const scoreboardModalContent = document.getElementById('scoreboard-modal-content');
    const scoreboardPlayersSection = document.getElementById('scoreboard-players-section');

    const mainGrid = document.getElementById('main-grid');
    const gameListContainer = document.getElementById('game-list-container');
    const standingsBody = document.getElementById('standings-body');
    const topScorersList = document.getElementById('top-scorers-list');
    
    const finalCardSection = document.getElementById('final-card-section');
    const finalGameContainer = document.getElementById('final-game-container');
    const finalWinnerDisplay = document.getElementById('final-winner-display');

    const chartsCard = document.getElementById('charts-card');
    const tabsContainer = document.getElementById('tabs-container');
    const themeSwitcher = document.getElementById('theme-switcher');
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');

    function saveState() {
        const state = {
            TEAMS, gamesData,
            config: {
                numTeams: numTeamsInput.value, format: formatSelect.value, numRounds: numRoundsInput.value,
                timerDuration: timerDurationInput.value, startTime: startTimeInput.value, breakDuration: breakDurationInput.value,
            }
        };
        localStorage.setItem('racha3x3_state_v6', JSON.stringify(state));
    }

    function loadState() {
        const savedState = localStorage.getItem('racha3x3_state_v6');
        if (savedState) {
            const state = JSON.parse(savedState);
            TEAMS = state.TEAMS || [];
            gamesData = state.gamesData || { type: '', rounds: [], finalMatch: null, timers: {}, activeGameId: null };
            if (state.config) {
                numTeamsInput.value = state.config.numTeams || 4;
                formatSelect.value = state.config.format || 'round-robin';
                numRoundsInput.value = state.config.numRounds || 1;
                timerDurationInput.value = state.config.timerDuration || 10;
                startTimeInput.value = state.config.startTime || '14:00';
                breakDurationInput.value = state.config.breakDuration || 5;
            }
            if (gamesData.timers) {
                Object.values(gamesData.timers).forEach(timer => {
                    if (timer) {
                        if(timer.main) timer.main.isRunning = false;
                        if(timer.shot) timer.shot.isRunning = false;
                    }
                });
            }
            if (TEAMS && TEAMS.length > 0) {
                document.getElementById('setup-flow-card').style.display = 'none';
                mainGrid.style.visibility = 'visible';
                resetTournamentBtn.style.display = 'flex';
                downloadPdfBtn.style.display = 'flex';
                chartsCard.style.display = 'block';
                renderAll();
            }
        }
    }

    function resetTournament() {
        if (confirm('Tem certeza que deseja resetar o torneio? Todos os dados serão perdidos.')) {
            clearInterval(mainTimerInterval);
            clearInterval(shotClockInterval);
            localStorage.removeItem('racha3x3_state_v6');
            window.location.reload();
        }
    }

    function setupTeamInputs() {
        const numTeams = parseInt(numTeamsInput.value, 10);
        teamSetupContainer.innerHTML = '';
        for (let i = 0; i < numTeams; i++) {
            const entry = document.createElement('div');
            entry.className = 'team-entry';
            entry.innerHTML = `<div class="team-entry-header">
                <input type="text" placeholder="Nome do Time ${i + 1}" value="Time ${i + 1}" data-id="${i}">
                <div class="icon-picker" data-id="${i}">
                    ${ICONS.map((icon, index) => `<span class="${index === i % ICONS.length ? 'selected' : ''}" data-icon="${icon}">${icon}</span>`).join('')}
                </div>
            </div>
            <div class="players-section">
                <div class="player-list" data-team-index="${i}"></div>
                <button class="add-player-btn" data-team-index="${i}">+ Jogador</button>
            </div>`;
            teamSetupContainer.appendChild(entry);
        }
        for (let i = 0; i < numTeams; i++) {
            addPlayerRow(i);
            addPlayerRow(i);
            addPlayerRow(i);
        }
        teamSetupModal.classList.add('visible');
    }

    function addPlayerRow(teamIdx) {
        const playerList = teamSetupContainer.querySelector(`.player-list[data-team-index="${teamIdx}"]`);
        const row = document.createElement('div');
        row.className = 'player-row';
        row.innerHTML = `<input type="text" placeholder="Nome do Jogador" maxlength="30">
            <button class="remove-player-btn" title="Remover" type="button">×</button>`;
        playerList.appendChild(row);
        row.querySelector('.remove-player-btn').onclick = () => {
            if (playerList.children.length > 1) row.remove();
        };
    }

    teamSetupContainer.addEventListener('click', e => {
        if (e.target.matches('.icon-picker span')) {
            const picker = e.target.parentElement;
            picker.querySelector('.selected')?.classList.remove('selected');
            e.target.classList.add('selected');
        }
        if (e.target.matches('.add-player-btn')) {
            const idx = e.target.dataset.teamIndex;
            addPlayerRow(idx);
        }
    });

    const createGameBoilerplate = (id) => ({
        id, score1: '', score2: '', fouls1: 0, fouls2: 0, playerPoints: {}, startTime: ''
    });

    function scheduleRoundRobin(teams, numRounds) {
        let singleRoundSchedule = [], teamList = [...teams];
        if (teamList.length % 2 !== 0) teamList.push({ id: 'bye' });
        const rounds = teamList.length - 1, halfSize = teamList.length / 2;
        for (let round = 0; round < rounds; round++) {
            for (let i = 0; i < halfSize; i++) {
                const team1 = teamList[i], team2 = teamList[teamList.length - 1 - i];
                if (team1.id !== 'bye' && team2.id !== 'bye') singleRoundSchedule.push({ team1, team2 });
            }
            teamList.splice(1, 0, teamList.pop());
        }
        let fullSchedule = [];
        for (let i = 0; i < numRounds; i++) fullSchedule = fullSchedule.concat(singleRoundSchedule);
        return [fullSchedule.map((match, index) => ({ ...match, ...createGameBoilerplate(`g_${index}`) }))];
    }
    
    function scheduleKnockout(teams) {
        const rounds = [];
        let currentRoundTeams = [...teams].sort(() => Math.random() - 0.5), roundIndex = 0;
        while(currentRoundTeams.length > 1) {
            const roundGames = [], nextRoundMatchups = [];
            for(let i = 0; i < currentRoundTeams.length; i += 2) {
                const team1 = currentRoundTeams[i], team2 = i + 1 < currentRoundTeams.length ? currentRoundTeams[i+1] : { id: 'bye', name: 'Avança', icon: '✔', players: [] };
                const gameId = `r${roundIndex}_m${i/2}`;
                roundGames.push({ team1, team2, ...createGameBoilerplate(gameId) });
                if (team2.id === 'bye') nextRoundMatchups.push(team1);
                else nextRoundMatchups.push({ id: `winner_${gameId}`, name: 'Aguardando', icon: '⏳', players: [] });
            }
            rounds.push(roundGames);
            currentRoundTeams = nextRoundMatchups; roundIndex++;
        }
        return rounds;
    }

    function generateTournament() {
        const numTeams = parseInt(numTeamsInput.value, 10);
        TEAMS = [];
        for (let i = 0; i < numTeams; i++) {
            const nameInput = teamSetupContainer.querySelector(`input[data-id="${i}"]`);
            const selectedIcon = teamSetupContainer.querySelector(`.icon-picker[data-id="${i}"] .selected`);
            const playerInputs = Array.from(teamSetupContainer.querySelectorAll(`.player-list[data-team-index="${i}"] input[type="text"]`));
            const players = playerInputs.map(p => p.value.trim()).filter(p => p);
            TEAMS.push({
                id: `team_${i}`, name: nameInput.value.trim() || `Time ${i + 1}`,
                icon: selectedIcon.dataset.icon, players
            });
        }
        teamSetupModal.classList.remove('visible');
        gamesData.type = formatSelect.value;
        gamesData.rounds = gamesData.type === 'round-robin' ? scheduleRoundRobin(TEAMS, parseInt(numRoundsInput.value, 10)) : scheduleKnockout(TEAMS);
        gamesData.finalMatch = null; gamesData.timers = {};
        const [startHour, startMinute] = startTimeInput.value.split(':').map(Number);
        let currentGameTime = new Date();
        currentGameTime.setHours(startHour, startMinute, 0, 0);
        const gameMinutes = parseInt(timerDurationInput.value, 10), breakMinutes = parseInt(breakDurationInput.value, 10);
        gamesData.rounds.flat().forEach(game => {
            if (game.team1.id !== 'bye' && game.team2.id !== 'bye') {
                game.startTime = currentGameTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                currentGameTime.setMinutes(currentGameTime.getMinutes() + gameMinutes + breakMinutes);
            }
        });
        document.getElementById('setup-flow-card').style.display = 'none';
        mainGrid.style.visibility = 'visible';
        resetTournamentBtn.style.display = 'flex';
        downloadPdfBtn.style.display = 'flex';
        chartsCard.style.display = 'block';
        gsap.from('#main-grid .card', { y: 50, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out' });
        confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
        renderAll();
    }

    function renderAll() {
        renderGames();
        updateStatsAndFinals();
        renderCharts();
        saveState();
    }

    function updateStatsAndFinals() {
        const allGames = gamesData.rounds.flat();
        let completedGamesCount = 0;
        allGames.forEach(game => { if (game.score1 !== '' && game.score2 !== '') completedGamesCount++; });
        
        if (gamesData.type === 'round-robin') {
            const stats = TEAMS.reduce((acc, team) => ({ ...acc, [team.id]: { ...team, p: 0, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0 } }), {});
            allGames.forEach(game => {
                const score1 = game.score1 !== '' ? parseInt(game.score1, 10) : null;
                const score2 = game.score2 !== '' ? parseInt(game.score2, 10) : null;
                if (score1 !== null && score2 !== null) {
                    const { team1, team2 } = game;
                    stats[team1.id].j++; stats[team2.id].j++; stats[team1.id].gp += score1; stats[team2.id].gp += score2;
                    stats[team1.id].gc += score2; stats[team2.id].gc += score1;
                    if (score1 > score2) { stats[team1.id].p += 2; stats[team1.id].v++; stats[team2.id].p += 1; stats[team2.id].d++; }
                    else if (score2 > score1) { stats[team2.id].p += 2; stats[team2.id].v++; stats[team1.id].p += 1; stats[team1.id].d++; }
                }
            });
            Object.values(stats).forEach(s => { s.sg = s.gp - s.gc; });
            const sortedTeams = Object.values(stats).sort((a, b) => b.p - a.p || b.sg - a.sg || b.gp - a.gp || a.name.localeCompare(b.name));
            renderStandings(sortedTeams);
            if (completedGamesCount === allGames.length && allGames.length > 0 && !gamesData.finalMatch) {
                generateFinalMatch(sortedTeams[0], sortedTeams[1]);
            }
        }
        renderTopScorers();
        renderFinalGame();
    }

    function renderStandings(sortedTeams) {
        standingsBody.innerHTML = '';
        sortedTeams.forEach((stats, index) => {
            const row = document.createElement('tr');
            row.dataset.teamId = stats.id;
            row.innerHTML = `<td class="pos">${index + 1}</td><td class="team-cell"><div class="team-display"><span class="team-icon">${stats.icon}</span><span class="team-name">${stats.name}</span></div></td><td class="points">${stats.p}</td><td>${stats.j}</td><td>${stats.v}</td><td>${stats.sg}</td>`;
            standingsBody.appendChild(row);
        });
    }

    function getTopScorersData() {
        const topScorers = {};
        [...gamesData.rounds.flat(), gamesData.finalMatch].filter(Boolean).forEach(game => {
            if (game.playerPoints) {
                Object.entries(game.playerPoints).forEach(([name, pts]) => {
                    if (name && pts > 0) topScorers[name] = (topScorers[name] || 0) + pts;
                });
            }
        });
        return Object.entries(topScorers).sort(([, a], [, b]) => b - a);
    }

    function renderTopScorers() {
        const sortedScorers = getTopScorersData();
        topScorersList.innerHTML = sortedScorers.length === 0 ? `<li style="justify-content: center; color: var(--text-muted);">Nenhum cestinha.</li>` : sortedScorers.map(([name, count]) => `<li><span>${name}</span><span>${count} pts</span></li>`).join('');
    }

    function generateFinalMatch(team1, team2) {
        if (!team1 || !team2) return;
        gamesData.finalMatch = { team1, team2, ...createGameBoilerplate('g_final') };
    }
    
    function renderFinalGame() {
        finalGameContainer.innerHTML = '';
        finalWinnerDisplay.innerHTML = '';
        const finalMatch = gamesData.finalMatch;
        if (finalMatch) {
            finalCardSection.style.display = 'block';
            const gameEl = createGameCard(finalMatch);
            finalGameContainer.appendChild(gameEl);
            if(finalMatch.score1 !== '' && finalMatch.score2 !== '') {
                const winner = parseInt(finalMatch.score1) > parseInt(finalMatch.score2) ? finalMatch.team1 : finalMatch.team2;
                finalWinnerDisplay.innerHTML = `🏆 Campeão: ${winner.name} 🏆`;
            }
        } else {
            finalCardSection.style.display = 'none';
        }
    }

    function renderGames() {
        gameListContainer.innerHTML = '';
        finalWinnerDisplay.innerHTML = '';
        finalCardSection.style.display = 'none';

        const standingsTab = tabsContainer.querySelector('[data-tab="standings"]');
        if (gamesData.type === 'round-robin') {
            standingsTab.style.display = 'block';
            gameListContainer.classList.remove('knockout-bracket');
            if (gamesData.rounds[0]) gamesData.rounds[0].forEach(game => gameListContainer.appendChild(createGameCard(game)));
            renderFinalGame();
        } else {
            standingsTab.style.display = 'none';
            if(standingsTab.classList.contains('active')) {
                tabsContainer.querySelector('.active').classList.remove('active');
                document.querySelector('.tab-content.active').classList.remove('active');
                tabsContainer.querySelector('[data-tab="scorers"]').classList.add('active');
                document.getElementById('scorers').classList.add('active');
            }
            gameListContainer.classList.add('knockout-bracket');
            gamesData.rounds.forEach((round, index) => {
                const roundEl = document.createElement('div');
                roundEl.className = 'round';
                const roundTitle = document.createElement('h3');
                roundTitle.className = 'round-title';
                const numTeams = round.length * 2;
                if (numTeams <= 2) roundTitle.textContent = 'Final';
                else if (numTeams <= 4) roundTitle.textContent = 'Semifinais';
                else if (numTeams <= 8) roundTitle.textContent = 'Quartas de Final';
                else roundTitle.textContent = `Rodada ${index + 1}`;
                roundEl.appendChild(roundTitle);
                round.forEach(game => roundEl.appendChild(createGameCard(game)));
                gameListContainer.appendChild(roundEl);
            });
             if (gamesData.rounds.length > 0) {
                const lastRound = gamesData.rounds[gamesData.rounds.length - 1];
                if (lastRound.length === 1 && lastRound[0].score1 !== '' && lastRound[0].score2 !== '') {
                    const finalGame = lastRound[0];
                    const winner = parseInt(finalGame.score1) > parseInt(finalGame.score2) ? finalGame.team1 : finalGame.team2;
                     finalWinnerDisplay.innerHTML = `🏆 Campeão: ${winner.name} 🏆`;
                     finalCardSection.style.display = 'block';
                     finalGameContainer.innerHTML = '';
                }
            }
        }
    }

    function createGameCard(game) {
        const el = document.createElement('div');
        el.className = 'game'; el.dataset.gameId = game.id;
        const time = game.startTime ? `<div class="game-time">${game.startTime}</div>` : '';
        el.innerHTML = `${time}<div class="match"><div class="team-display left"><span class="team-name">${game.team1.name}</span><span class="team-icon">${game.team1.icon}</span></div><div class="game-score-display">${game.score1 !== '' ? game.score1:'-'} vs ${game.score2 !== '' ? game.score2:'-'}</div><div class="team-display right"><span class="team-icon">${game.team2.icon}</span><span class="team-name">${game.team2.name}</span></div></div>`;
        if (game.score1 !== '' && game.score2 !== '') el.classList.add('finished');
        if (game.team1.id.startsWith('winner_') || game.team2.id.startsWith('winner_')) el.style.opacity = '0.7';
        if (game.team2.id === 'bye') {
            el.innerHTML = `<div class="match"><div class="team-display left" style="justify-content:center;flex:1;"><span class="team-name">${game.team1.name}</span><span class="team-icon">${game.team1.icon}</span></div><div class="team-display right" style="justify-content:center;flex:1;font-style:italic;color:var(--text-muted);">${game.team2.name} ${game.team2.icon}</div></div>`;
            el.classList.add('finished'); el.style.cursor = 'default';
        }
        return el;
    }

    function findGame(gameId) {
        if (gameId === 'g_final') return gamesData.finalMatch;
        return gamesData.rounds.flat().find(g => g.id === gameId);
    }

    function openScoreboard(gameId) {
        const game = findGame(gameId);
        if (!game || game.team2.id === 'bye' || game.team1.id.startsWith('winner_') || game.team2.id.startsWith('winner_')) return;
        gamesData.activeGameId = gameId;
        document.getElementById('sb-team1').querySelector('.scoreboard-team-name').textContent = game.team1.name;
        document.getElementById('sb-team2').querySelector('.scoreboard-team-name').textContent = game.team2.name;
        document.getElementById('sb-score1').textContent = game.score1 !== '' ? game.score1 : 0;
        document.getElementById('sb-score2').textContent = game.score2 !== '' ? game.score2 : 0;
        document.getElementById('sb-fouls1').textContent = game.fouls1 || 0;
        document.getElementById('sb-fouls2').textContent = game.fouls2 || 0;
        scoreboardPlayersSection.innerHTML = '';
        renderScoreboardPlayers(game);
        scoreboardModal.classList.add('visible');
    }

    function renderScoreboardPlayers(game) {
        const section = scoreboardPlayersSection;
        section.innerHTML = '';
        [1,2].forEach(teamNum => {
            const team = game[`team${teamNum}`];
            const players = team.players || [];
            const playerPoints = game.playerPoints || {};
            const teamDiv = document.createElement('div');
            teamDiv.className = 'scoreboard-team-players';
            teamDiv.innerHTML = `<div style="font-weight:600;margin-bottom:0.2rem;color:var(--primary);">${team.icon} ${team.name}</div>`;
            players.forEach(player => {
                const row = document.createElement('div');
                row.className = 'scoreboard-player-row';
                row.innerHTML = `<span class="scoreboard-player-name">${player}</span>
                    <span class="scoreboard-player-points" data-player="${player}">${playerPoints[player]||0}</span>
                    <span class="scoreboard-player-btns">
                        <button data-player="${player}" data-pts="1">+1</button>
                        <button data-player="${player}" data-pts="2">+2</button>
                        <button data-player="${player}" data-pts="3">+3</button>
                    </span>`;
                teamDiv.appendChild(row);
            });
            section.appendChild(teamDiv);
        });
    }

    scoreboardPlayersSection.addEventListener('click', e => {
        if (e.target.matches('button[data-player][data-pts]')) {
            const player = e.target.dataset.player;
            const pts = parseInt(e.target.dataset.pts,10);
            const game = findGame(gamesData.activeGameId);
            if (!game.playerPoints) game.playerPoints = {};
            game.playerPoints[player] = (game.playerPoints[player]||0) + pts;
            updateScoreFromPlayers(game);
            renderScoreboardPlayers(game);
        }
    });

    function updateScoreFromPlayers(game) {
        const team1Players = new Set(game.team1.players || []);
        const team2Players = new Set(game.team2.players || []);
        let score1 = 0, score2 = 0;
        Object.entries(game.playerPoints||{}).forEach(([name, pts]) => {
            if (team1Players.has(name)) score1 += pts;
            if (team2Players.has(name)) score2 += pts;
        });
        document.getElementById('sb-score1').textContent = score1;
        document.getElementById('sb-score2').textContent = score2;
    }
    
    function handleScoreboardInput(e, type) {
        const teamNum = e.target.dataset.team;
        if(type === 'foul') {
            const el = document.getElementById(`sb-fouls${teamNum}`);
            el.textContent = parseInt(el.textContent) + 1;
        } else {
            const game = findGame(gamesData.activeGameId);
            if (Object.keys(game.playerPoints || {}).length > 0) {
                if(confirm('Ajustar o placar manualmente irá zerar os pontos individuais dos jogadores nesta partida para evitar inconsistências. Deseja continuar?')) {
                    game.playerPoints = {};
                    renderScoreboardPlayers(game);
                } else {
                    return;
                }
            }
            const op = e.target.dataset.op;
            const el = document.getElementById(`sb-score${teamNum}`);
            let score = parseInt(el.textContent);
            el.textContent = op === '+' ? score + 1 : Math.max(0, score - 1);
        }
    }

    function saveScoreboard() {
        const game = findGame(gamesData.activeGameId);
        if (!game) return;
        game.score1 = document.getElementById('sb-score1').textContent;
        game.score2 = document.getElementById('sb-score2').textContent;
        game.fouls1 = document.getElementById('sb-fouls1').textContent;
        game.fouls2 = document.getElementById('sb-fouls2').textContent;
        if (gamesData.type === 'knockout' && gamesData.activeGameId !== 'g_final') advanceWinner(game);
        scoreboardModal.classList.remove('visible');
        renderAll();
    }
    
    function advanceWinner(game) {
        if (game.score1 === '' || game.score2 === '') return;
        const winner = parseInt(game.score1) > parseInt(game.score2) ? game.team1 : game.team2;
        const [roundIndexStr, matchIndexStr] = game.id.replace('r','').split('_m');
        const roundIndex = parseInt(roundIndexStr), matchIndex = parseInt(matchIndexStr);
        if (roundIndex + 1 < gamesData.rounds.length) {
            const nextMatch = gamesData.rounds[roundIndex + 1][Math.floor(matchIndex / 2)];
            if(nextMatch) {
              if (matchIndex % 2 === 0) nextMatch.team1 = winner; else nextMatch.team2 = winner;
            }
        }
    }

    function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`; }

    function toggleTimer(type, gameId) {
        const timer = gamesData.timers[gameId] = gamesData.timers[gameId] || {};
        const timerData = timer[type] = timer[type] || {};
        const isMain = type === 'main';
        const duration = isMain ? parseInt(timerDurationInput.value, 10) * 60 : 24;
        const displayEl = document.getElementById(isMain ? 'sb-main-timer' : 'sb-shot-clock');
        if (timerData.isRunning) {
            clearInterval(isMain ? mainTimerInterval : shotClockInterval);
            timerData.isRunning = false;
            if (isMain) {
                document.getElementById('sb-main-timer-toggle').innerHTML = '▶';
                const shotClockData = gamesData.timers[gameId]?.['shot'];
                if (shotClockData?.isRunning) { clearInterval(shotClockInterval); shotClockData.isRunning = false; }
            }
        } else {
            if (timerData.remaining === undefined || timerData.remaining <= 0) timerData.remaining = duration;
            timerData.isRunning = true;
            if (isMain) {
                document.getElementById('sb-main-timer-toggle').innerHTML = '⏸️';
                const shotClockData = gamesData.timers[gameId]?.['shot'];
                if (!shotClockData?.isRunning) {
                    resetTimer('shot', gameId, false);
                    toggleTimer('shot', gameId);
                }
            }
            const intervalId = setInterval(() => {
                timerData.remaining--;
                displayEl.textContent = isMain ? formatTime(timerData.remaining) : timerData.remaining;
                if (timerData.remaining <= 0) {
                    clearInterval(intervalId);
                    timerData.isRunning = false;
                    if (isMain) document.getElementById('sb-main-timer-toggle').innerHTML = '▶';
                    else gsap.to(scoreboardModalContent, { backgroundColor: 'var(--danger)', duration: 0.1, yoyo: true, repeat: 3, onComplete: () => gsap.set(scoreboardModalContent, { clearProps: 'backgroundColor' }) });
                }
            }, 1000);
            if (isMain) mainTimerInterval = intervalId; else shotClockInterval = intervalId;
        }
        saveState();
    }

    function resetTimer(type, gameId, save = true) {
        const timer = gamesData.timers[gameId] = gamesData.timers[gameId] || {};
        const timerData = timer[type] = timer[type] || {};
        const isMain = type === 'main';
        const duration = isMain ? parseInt(timerDurationInput.value, 10) * 60 : 24;
        const displayEl = document.getElementById(isMain ? 'sb-main-timer' : 'sb-shot-clock');
        clearInterval(isMain ? mainTimerInterval : shotClockInterval);
        timerData.isRunning = false;
        timerData.remaining = duration;
        displayEl.textContent = isMain ? formatTime(duration) : duration;
        if (isMain) {
            document.getElementById('sb-main-timer-toggle').innerHTML = '▶';
            const shotData = gamesData.timers[gameId]?.['shot'];
            if(shotData) shotData.isRunning = false;
        }
        if (save) saveState();
    }

    function renderCharts() {
        if (!chartsCard || chartsCard.style.display === 'none') return;

        const isLightMode = document.body.classList.contains('light-mode');
        const textColor = isLightMode ? '#1C1E21' : '#F0F0F0';
        const gridColor = isLightMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';

        Chart.defaults.color = textColor;
        Chart.defaults.borderColor = gridColor;

        const teamStats = TEAMS.map(team => {
            const stats = { gp: 0, gc: 0 };
            [...gamesData.rounds.flat(), gamesData.finalMatch].filter(Boolean).forEach(game => {
                if (game.score1 !== '' && game.score2 !== '' && (game.team1.id === team.id || game.team2.id === team.id)) {
                    if (game.team1.id === team.id) {
                        stats.gp += parseInt(game.score1, 10);
                        stats.gc += parseInt(game.score2, 10);
                    } else {
                        stats.gp += parseInt(game.score2, 10);
                        stats.gc += parseInt(game.score1, 10);
                    }
                }
            });
            return { name: team.name, ...stats };
        });

        const ctx1 = document.getElementById('team-performance-chart').getContext('2d');
        if (teamPerformanceChartInstance) teamPerformanceChartInstance.destroy();
        teamPerformanceChartInstance = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: teamStats.map(t => t.name),
                datasets: [{
                    label: 'Pontos Marcados',
                    data: teamStats.map(t => t.gp),
                    backgroundColor: 'rgba(46, 204, 64, 0.7)',
                    borderColor: 'rgba(46, 204, 64, 1)',
                    borderWidth: 1
                }, {
                    label: 'Pontos Sofridos',
                    data: teamStats.map(t => t.gc),
                    backgroundColor: 'rgba(255, 23, 23, 0.7)',
                    borderColor: 'rgba(255, 23, 23, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: 'top' } },
                scales: { y: { beginAtZero: true } }
            }
        });

        const sortedScorers = getTopScorersData().slice(0, 10);
        const ctx2 = document.getElementById('top-scorers-chart').getContext('2d');
        if (topScorersChartInstance) topScorersChartInstance.destroy();
        topScorersChartInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: sortedScorers.map(s => s[0]),
                datasets: [{
                    label: 'Pontos',
                    data: sortedScorers.map(s => s[1]),
                    backgroundColor: 'rgba(0, 178, 255, 0.7)',
                    borderColor: 'rgba(0, 178, 255, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            }
        });
    }

    async function downloadPDF() {
        const btn = downloadPdfBtn;
        btn.disabled = true;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="spin" style="animation: spin 1s linear infinite;">@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }</style><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

        // CORREÇÃO: Inicializa o jsPDF aqui, dentro da função
        const pdf = new window.jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const isLight = document.body.classList.contains('light-mode');
        const bgColor = isLight ? '#FFFFFF' : '#1A1A1A';
        const textColor = isLight ? '#1C1E21' : '#F0F0F0';
        const borderColor = isLight ? '#DDDDDD' : '#444444';

        const pdfContainer = document.createElement('div');
        pdfContainer.style.position = 'absolute';
        pdfContainer.style.left = '-9999px';
        pdfContainer.style.top = '0';
        pdfContainer.style.width = '800px';
        pdfContainer.style.padding = '20px';
        pdfContainer.style.background = bgColor;
        pdfContainer.style.color = textColor;
        pdfContainer.style.fontFamily = "'Poppins', sans-serif";

        let html = `
            <style>
                h1, h2, h3 { font-family: 'Teko', sans-serif; text-transform: uppercase; color: #FF7A00; }
                h1 { font-size: 38px; text-align: center; }
                h2 { font-size: 28px; border-bottom: 2px solid #FF7A00; padding-bottom: 5px; margin-top: 25px; }
                h3 { font-size: 22px; color: #00B2FF; margin-top: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 14px; }
                th, td { border: 1px solid ${borderColor}; padding: 8px; text-align: left; }
                th { background: #333; color: #F0F0F0; text-align: center; }
                .team-cell { display: flex; align-items: center; gap: 8px; } /* Alterado para se comportar como o da página */
                ul { list-style: none; padding: 0; margin-top: 10px; }
                li { background: ${isLight ? '#F0F2F5' : '#232323'}; padding: 10px; border-bottom: 1px solid ${borderColor}; display: flex; justify-content: space-between; align-items: center; font-size: 14px; }
                .game-item { border: 1px solid ${borderColor}; padding: 10px; margin-bottom: 8px; border-radius: 8px; }
                .game-item.finished { opacity: 0.7; }
                img { max-width: 100%; margin-top: 15px; border-radius: 8px; }
            </style>
            <h1>${document.querySelector('header h1').textContent}</h1>`;

        if (gamesData.type === 'round-robin' && document.getElementById('standings-body').innerHTML) {
            html += `<h2>Classificação</h2><table><thead>${document.querySelector('.standings-table thead').innerHTML}</thead><tbody>${document.getElementById('standings-body').innerHTML}</tbody></table>`;
        }

        html += `<h2>Confrontos</h2>`;
        const allGames = [...gamesData.rounds.flat(), gamesData.finalMatch].filter(Boolean);
        allGames.forEach(game => {
            if (game.team2.id !== 'bye') {
                 html += `<div class="game-item ${game.score1 !== '' ? 'finished' : ''}">
                    ${game.startTime ? `<span>${game.startTime} | </span>` : ''}
                    <span>${game.team1.icon} ${game.team1.name}</span>
                    <strong> ${game.score1 !== '' ? game.score1 : '-'} vs ${game.score2 !== '' ? game.score2 : '-'} </strong>
                    <span>${game.team2.icon} ${game.team2.name}</span>
                </div>`;
            }
        });

        const sortedScorers = getTopScorersData();
        if (sortedScorers.length > 0) {
            html += `<h2>Cestinhas</h2><ul>`;
            sortedScorers.forEach(([name, pts]) => {
                html += `<li><span>${name}</span> <strong>${pts} pts</strong></li>`;
            });
            html += `</ul>`;
        }
        
        if (teamPerformanceChartInstance && topScorersChartInstance) {
            html += `<h2>Análises Gráficas</h2>`;
            html += `<h3>Desempenho dos Times</h3><img src="${teamPerformanceChartInstance.toBase64Image()}">`;
            html += `<h3>Maiores Pontuadores</h3><img src="${topScorersChartInstance.toBase64Image()}">`;
        }
        
        pdfContainer.innerHTML = html;
        document.body.appendChild(pdfContainer);

        try {
            const canvas = await html2canvas(pdfContainer, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            let heightLeft = pdfHeight;
            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();
            
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;
            
            while (heightLeft >= 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }
            pdf.save(`relatorio-rachao-${new Date().toISOString().slice(0,10)}.pdf`);
        } catch(error) {
            console.error("Erro ao gerar PDF:", error);
            alert("Ocorreu um erro ao gerar o PDF. Tente novamente.");
        } finally {
            document.body.removeChild(pdfContainer);
            btn.disabled = false;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        }
    }

    document.getElementById('sb-main-timer-toggle').addEventListener('click', () => toggleTimer('main', gamesData.activeGameId));
    document.getElementById('sb-main-timer-reset').addEventListener('click', () => resetTimer('main', gamesData.activeGameId));
    document.getElementById('sb-shot-clock-reset').addEventListener('click', () => {
        resetTimer('shot', gamesData.activeGameId, false); toggleTimer('shot', gamesData.activeGameId);
        gsap.fromTo('#sb-shot-clock', { scale: 1.5 }, { scale: 1, duration: 0.3, ease: 'bounce.out' });
    });
    document.querySelectorAll('.score-btn').forEach(btn => btn.addEventListener('click', (e) => handleScoreboardInput(e, 'score')));
    document.querySelectorAll('.foul-btn').forEach(btn => btn.addEventListener('click', (e) => handleScoreboardInput(e, 'foul')));
    document.getElementById('sb-save-btn').addEventListener('click', saveScoreboard);

    document.querySelector('.container').addEventListener('click', e => {
        const gameCard = e.target.closest('.game');
        if (gameCard) openScoreboard(gameCard.dataset.gameId);
    });

    tabsContainer.addEventListener('click', e => {
        if (e.target.matches('.tab-btn')) {
            tabsContainer.querySelector('.active')?.classList.remove('active');
            e.target.classList.add('active');
            document.querySelector('.tab-content.active')?.classList.remove('active');
            document.getElementById(e.target.dataset.tab).classList.add('active');
        }
    });

    themeSwitcher.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        sunIcon.style.display = isLight ? 'none' : 'block';
        moonIcon.style.display = isLight ? 'block' : 'none';
        localStorage.setItem('racha3x3_theme', isLight ? 'light' : 'dark');
        renderCharts();
    });

    standingsBody.addEventListener('click', e => {
        const row = e.target.closest('tr');
        if (!row || !row.dataset.teamId) return;
        const teamId = row.dataset.teamId;
        const team = TEAMS.find(t => t.id === teamId);
        const teamGames = [...gamesData.rounds.flat(), gamesData.finalMatch].filter(g => g && (g.team1.id === teamId || g.team2.id === teamId));
        let statsHtml = `<h2 class="card-header" style="justify-content:center;">${team.icon} ${team.name}</h2><ul class="list">`;
        if (teamGames.every(g => g.score1 === '')) {
            statsHtml += `<li>Nenhum jogo disputado.</li>`;
        } else {
            teamGames.forEach(g => {
                if (g.score1 !== '' && g.score2 !== '') {
                    const isTeam1 = g.team1.id === teamId, myScore = isTeam1 ? g.score1 : g.score2;
                    const opScore = isTeam1 ? g.score2 : g.score1, op = isTeam1 ? g.team2 : g.team1;
                    let result = 'E', resClass = 'E';
                    if (parseInt(myScore) > parseInt(opScore)) { result = 'V'; resClass = 'V'; }
                    if (parseInt(myScore) < parseInt(opScore)) { result = 'D'; resClass = 'D'; }
                    statsHtml += `<li><span>vs ${op.icon} ${op.name}</span> <span class="result-badge ${resClass}">${result}</span> <span>${myScore} x ${opScore}</span></li>`;
                }
            });
        }
        statsHtml += `</ul><button onclick="document.getElementById('team-stats-modal').classList.remove('visible')" class="setup-button" style="width:100%;margin-top:1rem;">Fechar</button>`;
        teamStatsContent.innerHTML = statsHtml;
        teamStatsModal.classList.add('visible');
    });

    [teamSetupModal, teamStatsModal, scoreboardModal].forEach(m => { m.addEventListener('click', e => { if (e.target === m) m.classList.remove('visible'); }); });
    formatSelect.addEventListener('change', () => { document.getElementById('round-robin-options').style.display = formatSelect.value === 'round-robin' ? 'flex' : 'none'; });
    setupTeamsBtn.addEventListener('click', setupTeamInputs);
    startTournamentBtn.addEventListener('click', generateTournament);
    resetTournamentBtn.addEventListener('click', resetTournament);
    downloadPdfBtn.addEventListener('click', downloadPDF);

    if (localStorage.getItem('racha3x3_theme') === 'light') {
        document.body.classList.add('light-mode');
        sunIcon.style.display = 'none'; moonIcon.style.display = 'block';
    }
    loadState();
    gsap.from('header > *', { y: -30, opacity: 0, duration: 0.7, stagger: 0.2, ease: 'power3.out', delay: 0.2 });
    if (mainGrid.style.visibility !== 'visible') {
        gsap.from('.setup-flow', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out', delay: 0.5 });
    }
});