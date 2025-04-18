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

// Initialize socket connection
function initializeSocket() {
    console.log('Initializing socket connection...');
    try {
        gameState.socket = io();
        
        // Socket event handlers
        gameState.socket.on('connect', () => {
            console.log('Connected to server');
            startGameButton.disabled = false; // Enable button once connected
        });

        gameState.socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            showError('Unable to connect to game server. Please try again.');
        });

        gameState.socket.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            updatePlayerList(data);
        });

        gameState.socket.on('playerLeft', (data) => {
            removePlayer(data.playerId);
        });

        gameState.socket.on('gameStarted', (data) => {
            startGame(data);
        });

        gameState.socket.on('countdown', (count) => {
            updateCountdown(count);
        });

        gameState.socket.on('roundStarted', (data) => {
            startRound(data);
        });

        gameState.socket.on('itemVerified', (data) => {
            updatePlayerScore(data);
        });

        gameState.socket.on('itemRejected', (data) => {
            showError(data.message);
        });

        gameState.socket.on('roundEnded', (data) => {
            endRound(data);
        });

        gameState.socket.on('gameEnded', (data) => {
            endGame(data);
        });

        gameState.socket.on('submissionRejected', (data) => {
            if (data.level) {
                // Anti-cheat warning
                handleAntiCheatWarning(data);
            } else {
                // Regular rejection
                showError(data.reason);
            }
        });

        gameState.socket.on('kicked', (data) => {
            showScreen('error-screen');
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.innerHTML = `
                <h2>You have been removed from the game</h2>
                <p>Reason: ${data.reason}</p>
                <button onclick="location.reload()">Return to Home</button>
            `;
            document.getElementById('error-screen').appendChild(errorMessage);
        });
    } catch (error) {
        console.error('Failed to initialize socket:', error);
        showError('Failed to connect to game server. Please refresh the page.');
    }
}

// Initialize audio system
async function initializeAudio() {
    await gameState.audio.initialize();
    
    // Create and add volume control
    const volumeControl = new VolumeControl(gameState.audio);
    document.body.appendChild(volumeControl.create());
}

// Game Functions
async function startGame(data) {
    console.log('Game started!');
    showScreen('game-screen');
    gameState.isGameActive = true;
    gameState.currentRound = data.round;
    gameState.targetItem = data.targetItem;
    
    // Play game start sounds
    gameState.audio.playSequence([
        { sound: 'roundStart', options: { volume: 0.7 } },
        { sound: 'countdown', delay: 500 }
    ]);
    
    // Start background music
    gameState.audio.startMusic();
    
    // Initialize AI scanner
    await gameState.scanner.initialize();
    
    // Update UI
    currentRoundDisplay.textContent = gameState.currentRound;
    targetItemDisplay.textContent = gameState.targetItem;
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
    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-entry';
    playerEntry.id = `player-${data.playerId}`;
    playerEntry.innerHTML = `
        <span>${data.playerName}</span>
        <span>0 points</span>
    `;
    playerList.appendChild(playerEntry);
}

function removePlayer(playerId) {
    const playerElement = document.getElementById(`player-${playerId}`);
    if (playerElement) {
        playerElement.remove();
    }
}

function updatePlayerScore(data) {
    const playerElement = document.getElementById(`player-${data.playerId}`);
    if (playerElement) {
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

        // Update player entry with score and streak
        playerElement.innerHTML = `
            <span class="player-name">${data.playerName}</span>
            <div class="player-stats">
                <span class="score">${data.totalScore} points</span>
                ${data.streak > 1 ? `<span class="streak">🔥 ${data.streak}x</span>` : ''}
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

// Add event listener for play again button
document.getElementById('play-again').addEventListener('click', () => {
    // Reset game state
    gameState.playerStats = {
        roundScores: [],
        roundTimes: [],
        maxStreak: 0,
        currentStreak: 0
    };
    
    // Emit join game event
    gameState.socket.emit('joinGame', { name: gameState.playerName });
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