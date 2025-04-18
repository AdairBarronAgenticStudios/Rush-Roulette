// Game Constants
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const ROUNDS_PER_GAME = 3;
const ROUND_DURATION = 60000; // 60 seconds

import { getRandomItem } from './src/ai/items.js';
import ImageHasher from './src/security/imageHash.js';
import AudioManager from './src/audio/audioManager.js';
import VolumeControl from './src/audio/volumeControl.js';

// Initialize scanner class
class ItemScanner {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.currentItem = null;
        this.confidenceThreshold = 0.4; // Matched with server threshold
        this.itemKeywords = {
            'tennis ball': ['ball', 'tennis', 'sports equipment', 'yellow ball', 'sphere'],
            'spoon': ['spoon', 'utensil', 'silverware', 'cutlery', 'tableware'],
            'scissors': ['scissors', 'shears', 'clippers', 'cutting tool', 'blade'],
            'rubiks cube': ['cube', 'puzzle', 'rubix', 'toy', 'puzzle cube'],
            'water bottle': ['bottle', 'container', 'water', 'drink', 'plastic bottle'],
            'book': ['book', 'novel', 'text', 'publication', 'reading material', 'paperback', 'hardcover', 'literature']
        };
    }

    async initialize() {
        try {
            console.log('Loading MobileNet model...');
            this.model = await window.mobilenet.load();
            this.isModelLoaded = true;
            console.log('MobileNet model loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load MobileNet model:', error);
            this.isModelLoaded = false;
            return false;
        }
    }

    async processFrame(videoElement) {
        if (!this.isModelLoaded || !videoElement) {
            throw new Error('Scanner not initialized or video element missing');
        }

        try {
            // Get more predictions for better accuracy
            const predictions = await this.model.classify(videoElement, 10);
            console.log('Raw predictions:', predictions); // Debug log
            return this.verifyItem(predictions);
        } catch (error) {
            console.error('Error processing frame:', error);
            throw error;
        }
    }

    verifyItem(predictions) {
        if (!predictions || predictions.length === 0) {
            return { success: false, message: 'No predictions available' };
        }

        const targetItem = this.currentItem;
        if (!targetItem) {
            return { success: false, message: 'No target item set' };
        }

        // Check all predictions instead of just the best one
        for (const prediction of predictions) {
            const result = this.compareItems(prediction.className, targetItem);
            if (result.isMatch && prediction.probability >= this.confidenceThreshold) {
                return {
                    success: true,
                    message: 'Item verified!',
                    confidence: prediction.probability,
                    prediction: prediction.className
                };
            }
            console.log(`Checking prediction: ${prediction.className} (${prediction.probability}) against ${targetItem}`);
        }

        return {
            success: false,
            message: 'Item not found or confidence too low',
            confidence: predictions[0].probability,
            prediction: predictions[0].className
        };
    }

    compareItems(predictedItem, targetItem) {
        // Convert both to lowercase for comparison
        const predicted = predictedItem.toLowerCase();
        const target = typeof targetItem === 'string' ? targetItem.toLowerCase() : targetItem.name.toLowerCase();

        // Debug log
        console.log(`Comparing: ${predicted} with target: ${target}`);

        // Special handling for books
        if (target === 'book') {
            const bookIndicators = ['book', 'novel', 'text', 'publication', 'reading', 'paperback', 'hardcover', 'literature'];
            if (bookIndicators.some(indicator => predicted.includes(indicator))) {
                return { isMatch: true, confidence: 0.9 };
            }
        }

        // Check for exact match
        if (predicted === target) {
            return { isMatch: true, confidence: 1.0 };
        }

        // Check against known keywords for this item
        const keywords = this.itemKeywords[target] || [];
        if (keywords.some(keyword => predicted.includes(keyword))) {
            return { isMatch: true, confidence: 0.9 };
        }

        // Check if target is part of the prediction or vice versa
        if (predicted.includes(target) || target.includes(predicted)) {
            return { isMatch: true, confidence: 0.9 };
        }

        // Split into words and check for matches
        const predictedWords = predicted.split(' ');
        const targetWords = target.split(' ');
        
        let matchCount = 0;
        for (const targetWord of targetWords) {
            if (predictedWords.some(word => 
                word === targetWord || 
                word.includes(targetWord) || 
                targetWord.includes(word) ||
                this.checkSimilarity(word, targetWord)
            )) {
                matchCount++;
            }
        }

        if (matchCount > 0) {
            return { isMatch: true, confidence: 0.7 + (0.1 * matchCount) };
        }

        return { isMatch: false, confidence: 0 };
    }

    checkSimilarity(word1, word2) {
        // Simple Levenshtein distance check for similar words
        if (Math.abs(word1.length - word2.length) > 3) return false;
        
        let matches = 0;
        const minLength = Math.min(word1.length, word2.length);
        for (let i = 0; i < minLength; i++) {
            if (word1[i] === word2[i]) matches++;
        }
        return matches / Math.max(word1.length, word2.length) > 0.7;
    }

    setTargetItem(item) {
        this.currentItem = item;
        console.log('Set target item:', item); // Debug log
    }

    getTargetItem() {
        return this.currentItem;
    }
}

// Game state
const gameState = {
    currentScreen: 'home',
    players: [],
    currentRound: 0,
    maxPlayers: 8,
    targetItem: '',
    countdown: 3,
    isGameActive: false,
    playerName: '',
    socket: null,
    scanner: new ItemScanner(),
    imageHasher: new ImageHasher(),
    audio: new AudioManager(),
    isConnecting: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,
    lastConnectionError: null,
    isScanning: false,
    loadingStates: new Map(),
    playerStats: {
        roundScores: [],
        roundTimes: [],
        maxStreak: 0,
        currentStreak: 0
    }
};

// DOM Elements
const gameContainer = document.getElementById('game-container');
const startGameButton = document.getElementById('start-game');
const currentRoundDisplay = document.getElementById('current-round');
const countdownDisplay = document.getElementById('countdown');
const targetItemDisplay = document.getElementById('target-item');
const webcam = document.getElementById('webcam');
const playerList = document.getElementById('player-list');

// Add anti-cheat warning handling
function handleAntiCheatWarning(warning) {
    const warningLevels = {
        warning: {
            color: '#ff9800',
            icon: '⚠️',
            duration: 3000
        },
        severe: {
            color: '#f44336',
            icon: '🚫',
            duration: 5000
        },
        critical: {
            color: '#d32f2f',
            icon: '⛔',
            duration: 0 // Permanent until dismissed
        }
    };

    const warningConfig = warningLevels[warning.level];
    const warningElement = document.createElement('div');
    warningElement.className = 'anti-cheat-warning';
    warningElement.style.backgroundColor = warningConfig.color;
    warningElement.innerHTML = `
        <span class="warning-icon">${warningConfig.icon}</span>
        <span class="warning-message">${warning.reason}</span>
        ${warning.level === 'critical' ? '<button class="dismiss-warning">Dismiss</button>' : ''}
    `;

    document.body.appendChild(warningElement);

    // Auto-dismiss for non-critical warnings
    if (warningConfig.duration > 0) {
        setTimeout(() => {
            warningElement.remove();
        }, warningConfig.duration);
    }

    // Handle dismiss button for critical warnings
    const dismissButton = warningElement.querySelector('.dismiss-warning');
    if (dismissButton) {
        dismissButton.addEventListener('click', () => {
            warningElement.remove();
        });
    }
}

// Initialize socket connection with reconnection logic
function initializeSocket() {
    if (gameState.isConnecting) return;
    
    console.log('Initializing socket connection...');
    gameState.isConnecting = true;
    updateLoadingState('connection', true, 'Connecting to server...');
    
    try {
        gameState.socket = io({
            reconnection: true,
            reconnectionAttempts: gameState.maxReconnectAttempts,
            reconnectionDelay: gameState.reconnectDelay
        });
        
        // Socket event handlers
        gameState.socket.on('connect', () => {
            console.log('Connected to server');
            gameState.isConnecting = false;
            gameState.reconnectAttempts = 0;
            gameState.lastConnectionError = null;
            updateLoadingState('connection', false);
            startGameButton.disabled = false;
            
            // Attempt to rejoin if we were in a game
            if (gameState.isGameActive) {
                attemptRejoin();
            }
        });
        
        gameState.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            gameState.lastConnectionError = error;
            updateLoadingState('connection', true, 'Connection error. Retrying...');
            startGameButton.disabled = true;
        });
        
        gameState.socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
            gameState.isConnecting = false;
            updateLoadingState('connection', true, 'Disconnected. Attempting to reconnect...');
            startGameButton.disabled = true;
            
            if (reason === 'io server disconnect') {
                // Server disconnected us, try to reconnect
                gameState.socket.connect();
            }
        });
        
        gameState.socket.on('error', handleError);
        
        // Game event handlers
        setupGameEventHandlers();
        
    } catch (error) {
        console.error('Socket initialization error:', error);
        gameState.isConnecting = false;
        gameState.lastConnectionError = error;
        updateLoadingState('connection', false);
        showError('Failed to connect to server. Please refresh the page.');
    }
}

// Handle errors
function handleError(error) {
    console.error('Received error:', error);
    
    switch (error.type) {
        case 'rate_limit':
            showError(`${error.message} Please wait ${Math.ceil(error.resetTime / 1000)} seconds.`);
            break;
        case 'invalid_input':
            showError(error.message);
            break;
        case 'submission_locked':
            showError('Please wait before submitting again.');
            break;
        case 'room_creation_failed':
            showError('Unable to create game room. Please try again.');
            break;
        case 'already_joined':
            showError('You are already in a game.');
            break;
        default:
            showError('An error occurred. Please try again.');
    }
}

// Update loading states
function updateLoadingState(key, isLoading, message = '') {
    gameState.loadingStates.set(key, { isLoading, message });
    updateLoadingUI();
}

// Update loading UI
function updateLoadingUI() {
    const loadingContainer = document.getElementById('loading-container') || createLoadingContainer();
    loadingContainer.innerHTML = '';
    
    let hasActiveLoading = false;
    gameState.loadingStates.forEach(({ isLoading, message }, key) => {
        if (isLoading) {
            hasActiveLoading = true;
            const loadingElement = document.createElement('div');
            loadingElement.className = 'loading-item';
            loadingElement.innerHTML = `
                <div class="loading-spinner"></div>
                <span class="loading-message">${message}</span>
            `;
            loadingContainer.appendChild(loadingElement);
        }
    });
    
    loadingContainer.style.display = hasActiveLoading ? 'flex' : 'none';
}

// Create loading container
function createLoadingContainer() {
    const container = document.createElement('div');
    container.id = 'loading-container';
    container.className = 'loading-container';
    document.body.appendChild(container);
    return container;
}

// Initialize audio system
async function initializeAudio() {
    try {
        await gameState.audio.initialize();
        
        // Create and add volume control
        const volumeControl = new VolumeControl(gameState.audio);
        document.body.appendChild(volumeControl.create());
    } catch (error) {
        console.warn('Audio initialization failed:', error);
        // Continue without audio
        gameState.audio = {
            playSound: () => {}, // No-op function
            playSequence: () => {},
            startMusic: () => {},
            stopMusic: () => {}
        };
    }
}

// Game Functions
async function startGame(data) {
    try {
        console.log('Game started!');
        showScreen('game-screen');
        gameState.isGameActive = true;
        gameState.currentRound = data.round;
        gameState.targetItem = data.targetItem;
        
        // Play game start sounds
        if (gameState.audio) {
            gameState.audio.playSequence([
                { sound: 'roundStart', options: { volume: 0.7 } },
                { sound: 'countdown', delay: 500 }
            ]);
            
            // Start background music
            gameState.audio.startMusic();
        }
        
        // Initialize AI scanner
        await gameState.scanner.initialize();
        
        // Update UI with null checks
        const currentRoundDisplay = document.getElementById('current-round');
        const targetItemDisplay = document.getElementById('target-item');
        
        if (currentRoundDisplay) {
            currentRoundDisplay.textContent = gameState.currentRound;
        } else {
            console.warn('Current round display element not found');
        }
        
        if (targetItemDisplay) {
            targetItemDisplay.textContent = gameState.targetItem;
        } else {
            console.warn('Target item display element not found');
        }
        
        // Initialize game UI
        initializeGameUI();
    } catch (error) {
        console.error('Error starting game:', error);
        showError('Failed to start game. Please refresh the page.');
    }
}

function initializeGameUI() {
    try {
        // Create game UI elements if they don't exist
        const gameScreen = document.getElementById('game-screen');
        if (!gameScreen) {
            console.warn('Game screen element not found');
            return;
        }
        
        // Ensure required elements exist
        ['current-round', 'target-item', 'countdown'].forEach(id => {
            if (!document.getElementById(id)) {
                const element = document.createElement('div');
                element.id = id;
                element.className = id;
                gameScreen.appendChild(element);
            }
        });
        
        // Initialize player slots
        const playerContainer = document.getElementById('player-container') || createPlayerContainer();
        if (!playerContainer.hasChildNodes()) {
            for (let i = 0; i < gameState.maxPlayers; i++) {
                const slot = document.createElement('div');
                slot.className = 'player-slot empty';
                slot.dataset.position = i;
                slot.innerHTML = '<span>Waiting for player...</span>';
                playerContainer.appendChild(slot);
            }
        }
    } catch (error) {
        console.error('Error initializing game UI:', error);
    }
}

function createPlayerContainer() {
    const container = document.createElement('div');
    container.id = 'player-container';
    container.className = 'player-container';
    document.getElementById('game-screen').appendChild(container);
    return container;
}

function startRound(data) {
    gameState.currentRound = data.round;
    gameState.targetItem = data.targetItem;
    
    // Play round start sound
    gameState.audio.playSound('roundStart');
    
    // Update UI with animations
    currentRoundDisplay.textContent = gameState.currentRound;
    
    const itemDisplay = document.getElementById('target-item');
    itemDisplay.classList.add('fade-enter');
    itemDisplay.textContent = gameState.targetItem;
    setTimeout(() => {
        itemDisplay.classList.remove('fade-enter');
    }, 300);
    
    // Add round progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'round-progress';
    progressBar.innerHTML = '<div class="round-progress-bar"></div>';
    document.querySelector('.game-header').appendChild(progressBar);
    
    // Start webcam scanning with visual feedback
    startWebcamScanning();
}

async function startWebcamScanning() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        webcam.srcObject = stream;
        
        // Start periodic scanning
        setInterval(async () => {
            if (gameState.isGameActive) {
                const result = await gameState.scanner.verifyItem(webcam);
                if (result.success) {
                    submitItem();
                }
            }
        }, 1000);
    } catch (error) {
        console.error('Error accessing webcam:', error);
        showError('Please allow camera access to play the game.');
    }
}

async function submitItem() {
    if (!gameState.isGameActive) return;

    try {
        // Add loading state
        const cameraContainer = document.querySelector('.camera-container');
        cameraContainer.classList.add('loading');

        // Play scanning sound
        gameState.audio.playSound('scan');

        // Generate image hash and metadata
        const imageHash = await gameState.imageHasher.generateHash(webcam);
        const metadata = gameState.imageHasher.getMetadata(webcam);

        // Submit to server with security data
        gameState.socket.emit('submitItem', {
            item: gameState.targetItem,
            timestamp: Date.now(),
            imageHash,
            metadata
        });

        // Show success indicator
        showSuccessIndicator();
    } catch (error) {
        console.error('Error submitting item:', error);
        showError('Failed to process image. Please try again.');
        gameState.audio.playSound('error');
    } finally {
        // Remove loading state
        document.querySelector('.camera-container').classList.remove('loading');
    }
}

function updateCountdown(count) {
    countdownDisplay.textContent = count;
}

function updatePlayerList(data) {
    console.log('Updating player list:', data);
    
    // Find an empty player slot
    const emptySlot = document.querySelector('.player-video.empty');
    if (!emptySlot) {
        console.warn('No empty slots available for new player');
        return;
    }

    // Remove empty class and update content
    emptySlot.classList.remove('empty');
    emptySlot.innerHTML = `
        <video autoplay playsinline></video>
        <div class="player-info">
            <div class="player-name">${data.playerName}</div>
            <div class="player-stats">
                <span class="score">0</span>
                <span class="streak"></span>
            </div>
        </div>
    `;

    // Store player data
    const position = emptySlot.dataset.position;
    gameState.players[position] = {
        id: data.playerId,
        name: data.playerName,
        element: emptySlot
    };

    // Show waiting message if not enough players
    if (data.currentPlayers.length < MIN_PLAYERS) {
        showMessage(`Waiting for players... (${data.currentPlayers.length}/${MIN_PLAYERS} needed)`);
    }
}

function removePlayer(playerId) {
    // Find the player's position
    const position = Object.keys(gameState.players).find(pos => 
        gameState.players[pos] && gameState.players[pos].id === playerId
    );

    if (position) {
        const playerElement = gameState.players[position].element;
        playerElement.classList.add('empty');
        playerElement.innerHTML = '<span>Waiting for player...</span>';
        delete gameState.players[position];
    }
}

function updatePlayerScore(data) {
    // Find the player's position
    const position = Object.keys(gameState.players).find(pos => 
        gameState.players[pos] && gameState.players[pos].id === data.playerId
    );

    if (position) {
        const playerElement = gameState.players[position].element;
        
        // Play score sounds
        if (data.score.total > 150) {
            gameState.audio.playSound('streak', { volume: 0.7 });
        } else {
            gameState.audio.playSound('point');
        }

        // Create score increment animation
        const scoreIncrement = document.createElement('div');
        scoreIncrement.className = 'score-update';
        scoreIncrement.textContent = `+${data.score.total}`;
        playerElement.appendChild(scoreIncrement);

        // Update player name with score and streak
        const playerNameElement = playerElement.querySelector('.player-name');
        playerNameElement.innerHTML = `
            ${data.playerName}
            <div class="player-stats">
                <span class="score">${data.totalScore}</span>
                ${data.streak > 1 ? `<span class="streak">🔥${data.streak}x</span>` : ''}
            </div>
        `;

        // Add celebration effect if it's a high score
        if (data.score.total > 150) {
            playerElement.classList.add('celebration');
            setTimeout(() => {
                playerElement.classList.remove('celebration');
            }, 1000);
        }
    }
}

function showSuccessIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'success-indicator';
    indicator.textContent = '✓';
    
    const cameraContainer = document.querySelector('.camera-container');
    cameraContainer.appendChild(indicator);
    
    setTimeout(() => {
        indicator.classList.add('show');
        setTimeout(() => {
            indicator.classList.remove('show');
            setTimeout(() => {
                indicator.remove();
            }, 300);
        }, 1000);
    }, 10);
}

function endRound(data) {
    // Play round end sound
    gameState.audio.playSound('roundEnd');

    // Stop webcam scanning
    if (webcam.srcObject) {
        webcam.srcObject.getTracks().forEach(track => track.stop());
    }
    
    // Update player stats
    const currentPlayer = data.scores.find(score => score.playerId === gameState.socket.id);
    if (currentPlayer) {
        gameState.playerStats.roundScores.push(currentPlayer.score);
        gameState.playerStats.roundTimes.push(Date.now() - gameState.roundStartTime);
        gameState.playerStats.maxStreak = Math.max(gameState.playerStats.maxStreak, gameState.playerStats.currentStreak);
    }

    // Show round summary
    showRoundSummary(data);
}

function showRoundSummary(data) {
    // Update round number
    document.getElementById('round-number').textContent = gameState.currentRound;
    
    // Update player's time
    const playerTime = gameState.playerStats.roundTimes[gameState.currentRound - 1];
    document.getElementById('player-time').textContent = formatTime(playerTime);
    
    // Update round score
    const roundScore = gameState.playerStats.roundScores[gameState.currentRound - 1];
    document.getElementById('round-points').textContent = roundScore;
    
    // Update rankings
    const roundLeaderboard = document.getElementById('round-leaderboard');
    roundLeaderboard.innerHTML = '';
    
    data.scores.forEach((score, index) => {
        const entry = document.createElement('div');
        entry.className = 'ranking-entry';
        
        const medal = index < 3 ? getMedalEmoji(index) : '';
        
        entry.innerHTML = `
            <div class="ranking-position">${medal || (index + 1)}</div>
            <div class="ranking-details">
                <div class="ranking-name">${score.playerName}</div>
            </div>
            <div class="ranking-score">${score.score} pts</div>
        `;
        
        roundLeaderboard.appendChild(entry);
    });
    
    // Update next round info
    if (gameState.currentRound < 3) {
        const difficulties = ['common', 'specific', 'rare'];
        document.getElementById('next-round-difficulty').textContent = difficulties[gameState.currentRound];
        startNextRoundCountdown();
    }
    
    showScreen('round-summary');
}

function endGame(data) {
    // Stop background music and play game over sound
    gameState.audio.stopMusic();
    gameState.audio.playSound('gameOver');

    gameState.isGameActive = false;
    
    // Calculate final stats
    const totalScore = gameState.playerStats.roundScores.reduce((a, b) => a + b, 0);
    const bestRound = Math.max(...gameState.playerStats.roundScores);
    const avgTime = gameState.playerStats.roundTimes.reduce((a, b) => a + b, 0) / gameState.playerStats.roundTimes.length;
    
    // Update stats display
    document.getElementById('total-score').textContent = totalScore;
    document.getElementById('best-round').textContent = bestRound;
    document.getElementById('max-streak').textContent = gameState.playerStats.maxStreak;
    document.getElementById('avg-time').textContent = formatTime(avgTime);
    
    // Update final leaderboard
    const finalLeaderboard = document.getElementById('final-leaderboard');
    finalLeaderboard.innerHTML = '';
    
    data.scores.forEach((score, index) => {
        const entry = document.createElement('div');
        entry.className = 'ranking-entry';
        
        const medal = index < 3 ? getMedalEmoji(index) : '';
        
        entry.innerHTML = `
            <div class="ranking-position">${medal || (index + 1)}</div>
            <div class="ranking-details">
                <div class="ranking-name">${score.playerName}</div>
            </div>
            <div class="ranking-score">${score.score} pts</div>
        `;
        
        finalLeaderboard.appendChild(entry);
    });
    
    showScreen('game-summary');
}

function startNextRoundCountdown() {
    let countdown = 5;
    const countdownElement = document.getElementById('next-round-countdown');
    
    const timer = setInterval(() => {
        countdown--;
        countdownElement.textContent = countdown;
        
        if (countdown <= 0) {
            clearInterval(timer);
        }
    }, 1000);
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getMedalEmoji(position) {
    const medals = ['🥇', '🥈', '🥉'];
    return medals[position] || '';
}

function showError(message) {
    const errorPopup = document.createElement('div');
    errorPopup.className = 'error-popup';
    errorPopup.textContent = message;
    
    document.body.appendChild(errorPopup);
    
    // Add error shake animation
    errorPopup.classList.add('error');
    
    // Trigger show animation
    setTimeout(() => {
        errorPopup.classList.add('show');
        setTimeout(() => {
            errorPopup.classList.remove('show');
            setTimeout(() => {
                errorPopup.remove();
            }, 300);
        }, 3000);
    }, 10);
}

// Screen Management
function showScreen(screenId) {
    // Remove active class with fade out
    document.querySelectorAll('.screen').forEach(screen => {
        if (screen.classList.contains('active')) {
            screen.classList.add('fade-exit');
            setTimeout(() => {
                screen.classList.remove('active', 'fade-exit');
            }, 300);
        }
    });
    
    // Show new screen with fade in
    const screen = document.getElementById(screenId);
    if (screen) {
        setTimeout(() => {
            screen.classList.add('active', 'fade-enter');
            setTimeout(() => {
                screen.classList.remove('fade-enter');
            }, 300);
        }, 300);
    }
}

// Event Listeners
if (startGameButton) {
    startGameButton.disabled = true; // Disable until socket connects
    startGameButton.addEventListener('click', async () => {
        try {
            console.log('Start game button clicked');
            if (!gameState.socket || !gameState.socket.connected) {
                showError('Not connected to game server. Please refresh the page.');
                return;
            }

            const playerName = prompt('Enter your name:');
            if (playerName && playerName.trim()) {
                gameState.playerName = playerName.trim();
                console.log('Emitting joinGame event with name:', playerName);
                gameState.socket.emit('joinGame', { name: playerName });
                
                // Play click sound
                if (gameState.audio) {
                    gameState.audio.playSound('click');
                }
            }
        } catch (error) {
            console.error('Error in start game handler:', error);
            showError('An error occurred. Please try again.');
        }
    });
} else {
    console.error('Start game button not found in the DOM');
}

// Update the play again button handler
document.getElementById('play-again').addEventListener('click', () => {
    // Don't reset game state, just prompt for a new player name
    const playerName = prompt('Enter player name:');
    if (playerName && playerName.trim()) {
        console.log('Adding new player:', playerName);
        gameState.socket.emit('joinGame', { name: playerName });
        
        // Play click sound
        if (gameState.audio) {
            gameState.audio.playSound('click');
        }
    }
});

// Initialize the game
async function init() {
    try {
        console.log('Game initializing...');
        await initializeAudio();
        showScreen('home-screen');
        initializeSocket();
        console.log('Game initialization complete');
    } catch (error) {
        console.error('Error during game initialization:', error);
        showError('Failed to initialize game. Please refresh the page.');
    }
}

// Start the game when the page loads
document.addEventListener('DOMContentLoaded', init);

// Setup game event handlers
function setupGameEventHandlers() {
    gameState.socket.on('playerJoined', (data) => {
        console.log('Player joined:', data);
        updatePlayerList(data);
        
        // Show waiting message if not enough players
        if (data.currentPlayers.length < MIN_PLAYERS) {
            showMessage(`Waiting for players... (${data.currentPlayers.length}/${MIN_PLAYERS} needed)`);
        }
    });

    gameState.socket.on('gameStarting', (data) => {
        console.log('Game starting:', data);
        showScreen('game-screen');
        updateCountdown(data.countdown);
    });

    gameState.socket.on('countdown', (data) => {
        console.log('Countdown:', data);
        updateCountdown(data.countdown);
    });

    gameState.socket.on('gameStarted', (data) => {
        console.log('Game started:', data);
        startGame(data);
    });

    gameState.socket.on('roundStarted', (data) => {
        console.log('Round started:', data);
        startRound(data);
    });

    gameState.socket.on('itemVerified', (data) => {
        console.log('Item verified:', data);
        updatePlayerScore(data);
    });

    gameState.socket.on('roundEnded', (data) => {
        console.log('Round ended:', data);
        endRound(data);
    });

    gameState.socket.on('gameEnded', (data) => {
        console.log('Game ended:', data);
        endGame(data);
    });

    gameState.socket.on('playerLeft', (data) => {
        console.log('Player left:', data);
        removePlayer(data.playerId);
    });

    gameState.socket.on('playerRejoined', (data) => {
        console.log('Player rejoined:', data);
        updatePlayerList(data);
    });
}

// Add helper function to show messages
function showMessage(message) {
    const messageContainer = document.getElementById('message-container') || createMessageContainer();
    messageContainer.textContent = message;
    messageContainer.classList.add('show');
    
    setTimeout(() => {
        messageContainer.classList.remove('show');
    }, 3000);
}

function createMessageContainer() {
    const container = document.createElement('div');
    container.id = 'message-container';
    container.className = 'message-container';
    document.body.appendChild(container);
    return container;
} 