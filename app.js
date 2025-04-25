// Game Constants
const MIN_PLAYERS = 1;
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
            'rubiks cube': ['cube', 'puzzle', 'rubix', 'rubik', 'toy', 'puzzle cube', 'rubik\'s', 'cubing', 'magic cube', 'colorful cube', 'speed cube', 'twisty puzzle', 'color', 'square', 'blocks', 'puzzle game'],
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
            console.error('Scanner not initialized or video element missing', {
                isModelLoaded: this.isModelLoaded,
                videoElementExists: !!videoElement
            });
            throw new Error('Scanner not initialized or video element missing');
        }

        if (videoElement.readyState < 2) { // HAVE_CURRENT_DATA or better
            console.warn('Video element not ready for frame processing, readyState:', videoElement.readyState);
            return { 
                success: false, 
                message: 'Video not ready for processing',
                readyState: videoElement.readyState
            };
        }

        try {
            console.log('Processing frame with dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
            
            // Check if the video has valid dimensions
            if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
                console.warn('Video has invalid dimensions:', videoElement.videoWidth, 'x', videoElement.videoHeight);
                return {
                    success: false,
                    message: 'Invalid video dimensions'
                };
            }
            
            // Get more predictions for better accuracy
            const predictions = await this.model.classify(videoElement, 15); // Increased to top 15 predictions
            console.log('Raw predictions:', predictions); // Debug log
            
            if (!predictions || predictions.length === 0) {
                console.warn('No predictions returned from model');
                return {
                    success: false,
                    message: 'No predictions available'
                };
            }
            
            // Store original confidence threshold
            const originalThreshold = this.confidenceThreshold;
            
            // Temporarily lower threshold for hard-to-detect items
            if (this.currentItem) {
                const targetLower = this.currentItem.toLowerCase();
                if (targetLower === 'scissors') {
                    console.log('🔍 SCISSORS DETECTION: Lowering confidence threshold from', originalThreshold, 'to 0.25');
                    this.confidenceThreshold = 0.25;
                } else if (targetLower === 'rubiks cube' || targetLower === 'rubik\'s cube' || targetLower === 'rubix cube') {
                    console.log('🔍 RUBIK\'S CUBE DETECTION: Lowering confidence threshold from', originalThreshold, 'to 0.2');
                    this.confidenceThreshold = 0.2; // Even lower threshold for Rubik's cube
                }
            }
            
            // Verify the item
            const result = this.verifyItem(predictions);
            
            // Restore original threshold
            this.confidenceThreshold = originalThreshold;
            
            return result;
        } catch (error) {
            console.error('Error processing frame:', error);
            return {
                success: false,
                message: 'Error processing image. Please try again.',
                error: error.message
            };
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

        // DEBUG: Log target item for verification
        console.log(`🔍 VERIFY: Looking for target item: "${targetItem}"`);
        
        // Check all predictions instead of just the best one
        for (const prediction of predictions) {
            // DEBUG: Add more detailed logging for predictions
            console.log(`🔍 PREDICT: ${prediction.className} (${(prediction.probability * 100).toFixed(2)}%)`);
            
            const result = this.compareItems(prediction.className, targetItem);
            if (result.isMatch && prediction.probability >= this.confidenceThreshold) {
                console.log(`✅ MATCH FOUND: "${prediction.className}" matches "${targetItem}" with confidence ${result.confidence.toFixed(2)}`);
                return {
                    success: true,
                    message: 'Item verified!',
                    confidence: prediction.probability,
                    prediction: prediction.className
                };
            }
        }

        // DEBUG: When no match is found
        console.log(`❌ NO MATCH: No predictions matched "${targetItem}" with confidence above ${this.confidenceThreshold}`);
        
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
        const target = typeof targetItem === 'string' ? targetItem.toLowerCase() : targetItem.name?.toLowerCase() || '';

        // DEBUG: Enhanced comparison logging
        console.log(`🔄 COMPARE: "${predicted}" with target: "${target}"`);

        // Tennis ball specific checks - expanded detection for the most common first item
        if (target === 'tennis ball') {
            const tennisBallKeywords = [
                'tennis ball', 'ball', 'tennis', 'sports ball', 'yellow ball', 
                'sphere', 'yellow sphere', 'yellow', 'sport', 'racket ball',
                'toy ball', 'playing ball', 'game ball', 'green ball'
            ];
            
            // Check for any tennis ball related keywords
            for (const keyword of tennisBallKeywords) {
                if (predicted.includes(keyword)) {
                    console.log(`✅ TENNIS BALL: Matched with keyword: "${keyword}"`);
                    return { isMatch: true, confidence: 0.8 };
                }
            }
            
            // Color and shape based detections for tennis balls
            if (
                (predicted.includes('yellow') && (predicted.includes('round') || predicted.includes('sphere') || predicted.includes('ball'))) ||
                (predicted.includes('green') && (predicted.includes('round') || predicted.includes('sphere') || predicted.includes('ball')))
            ) {
                console.log(`✅ TENNIS BALL: Matched with color and shape combination`);
                return { isMatch: true, confidence: 0.8 };
            }
        }

        // Special handling for Rubik's cube - adding enhanced detection
        if (target === 'rubiks cube' || target === 'rubik\'s cube' || target === 'rubix cube') {
            // DEBUG: Explicit logging for Rubik's cube matching
            console.log(`🔍 RUBIK'S CUBE CHECK: Analyzing prediction: "${predicted}"`);
            
            const rubiksCubeKeywords = [
                'cube', 'puzzle', 'rubik', 'rubix', 'rubiks', 'rubik\'s', 'toy', 'game',
                'puzzle cube', 'magic cube', 'speed cube', 'twisty puzzle', 'colorful cube',
                'cubing', 'multicolor', 'square', '3x3', 'solved', 'blocks', 'puzzle game'
            ];
            
            // Check for any Rubik's cube related keywords
            for (const keyword of rubiksCubeKeywords) {
                if (predicted.includes(keyword)) {
                    console.log(`✅ RUBIK'S CUBE: Matched with keyword: "${keyword}"`);
                    return { isMatch: true, confidence: 0.85 };
                }
            }
            
            // Color-based detection for Rubik's cube
            if (
                (predicted.includes('color') && (predicted.includes('cube') || predicted.includes('square') || predicted.includes('puzzle'))) ||
                (predicted.includes('multi') && predicted.includes('color')) ||
                (predicted.includes('cube') && predicted.includes('game'))
            ) {
                console.log(`✅ RUBIK'S CUBE: Matched with color/type combination`);
                return { isMatch: true, confidence: 0.85 };
            }
            
            // For any prediction about cubes, lower the threshold
            if (predicted.includes('cube') || predicted.includes('square') || predicted.includes('plastic')) {
                console.log(`✅ RUBIK'S CUBE: Matched with cube-related term`);
                return { isMatch: true, confidence: 0.7 };
            }
        }

        // Special handling for scissors
        if (target === 'scissors') {
            // DEBUG: Explicit logging for scissors matching
            console.log(`🔍 SCISSORS CHECK: Analyzing prediction: "${predicted}"`);
            
            const scissorsKeywords = [
                'scissors', 'shears', 'clippers', 'cutting tool', 'blade', 'cut', 'cutter',
                'cutting instrument', 'snips', 'trimmer', 'cutting implement', 'paper cutter',
                'pruning', 'trimming', 'craft scissors', 'fabric scissors', 'office scissors'
            ];
            
            // Check for any scissors related keywords
            for (const keyword of scissorsKeywords) {
                if (predicted.includes(keyword)) {
                    console.log(`✅ SCISSORS: Matched with keyword: "${keyword}"`);
                    return { isMatch: true, confidence: 0.85 };
                }
            }
            
            // Function-based and appearance-based detection
            if (
                (predicted.includes('cut') && (predicted.includes('tool') || predicted.includes('instrument'))) ||
                (predicted.includes('blade') && predicted.includes('handle')) ||
                (predicted.includes('metal') && predicted.includes('blades')) ||
                (predicted.includes('stainless') && predicted.includes('steel'))
            ) {
                console.log(`✅ SCISSORS: Matched with function/appearance combination`);
                return { isMatch: true, confidence: 0.85 };
            }

            // Lower the confidence threshold specifically for scissors to make detection easier
            if (this.confidenceThreshold > 0.3 && predicted.includes('cut') || predicted.includes('sciss') || predicted.includes('clip')) {
                console.log(`✅ SCISSORS: Matched with lower threshold for cutting-related term`);
                return { isMatch: true, confidence: 0.7 };
            }
        }

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
    },
    roundStartTime: null
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
    gameState.scanner.setTargetItem(gameState.targetItem);
    gameState.roundStartTime = Date.now();
    
    // Play round start sound
    gameState.audio.playSound('roundStart');
    
    // Update UI with animations
    const currentRoundDisplay = document.getElementById('current-round');
    if (currentRoundDisplay) {
        currentRoundDisplay.textContent = gameState.currentRound;
    } else {
        console.warn("Element with ID 'current-round' not found.");
    }
    
    const itemDisplay = document.getElementById('target-item');
    if (itemDisplay) {
        itemDisplay.classList.add('fade-enter');
        itemDisplay.textContent = gameState.targetItem;
        setTimeout(() => {
            itemDisplay.classList.remove('fade-enter');
        }, 300);
    } else {
        console.warn("Element with ID 'target-item' not found.");
    }
    
    // Add round progress bar if header exists
    const gameHeader = document.querySelector('.game-header'); // Assuming game-header exists
    if (gameHeader) {
        // Remove old progress bar if it exists
        const oldProgressBar = gameHeader.querySelector('.round-progress');
        if (oldProgressBar) oldProgressBar.remove();
        // Add new progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'round-progress';
        progressBar.innerHTML = '<div class="round-progress-bar"></div>';
        gameHeader.appendChild(progressBar);
    } else {
        console.warn("Element with class 'game-header' not found.");
    }
    
    // Start webcam scanning using the player's video element
    startWebcamScanning();
}

async function startWebcamScanning() {
    // Find the video element associated with the local player
    const localPlayerVideoElement = document.getElementById(`video-${gameState.socket?.id}`);

    if (!localPlayerVideoElement) {
        console.error("Local player video element not found for scanning.");
        showError("Could not start camera scanning - video element not found.");
        return;
    }

    if (!gameState.localStream || !gameState.localStream.active) {
        console.warn("Local stream not ready for scanning. Attempting initialization again.");
        try {
            // Try initializing again, might have failed silently before
            await initializeLocalWebcam(localPlayerVideoElement);
            // Check again
            if (!gameState.localStream || !gameState.localStream.active) {
                console.error("Local stream failed to initialize for scanning.");
                showError("Camera not ready for scanning. Please check camera permissions.");
                return;
            }
        } catch (error) {
            console.error("Error initializing webcam:", error);
            showError("Failed to access camera. Please check permissions and try again.");
            return;
        }
    }
    
    // Ensure the stream is correctly assigned (might be redundant but safe)
    if (localPlayerVideoElement.srcObject !== gameState.localStream) {
        localPlayerVideoElement.srcObject = gameState.localStream;
    }

    // Make sure the model is loaded
    if (!gameState.scanner.isModelLoaded) {
        console.log("AI model not loaded yet, attempting to initialize scanner again...");
        try {
            await gameState.scanner.initialize();
        } catch (error) {
            console.error("Failed to initialize scanner:", error);
            showError("Failed to load AI scanner. Please refresh the page.");
            return;
        }
    }

    console.log("Starting scanning loop with target item:", gameState.targetItem);
    gameState.scanner.setTargetItem(gameState.targetItem);
    
    // Clear previous interval if it exists
    if (gameState.scanIntervalId) {
        clearInterval(gameState.scanIntervalId);
    }
    
    // Determine scanning frequency based on target item
    let scanInterval = 1000; // Default 1 second
    const targetLower = gameState.targetItem.toLowerCase();
    
    if (targetLower === 'rubiks cube' || targetLower === 'rubik\'s cube') {
        scanInterval = 300; // Fast but not too fast (300ms)
        console.log(`⚡ FASTER SCANNING: Setting scan interval to ${scanInterval}ms for ${gameState.targetItem}`);
        // Reset cube detection related state
        gameState.cubeDetectionAttempts = 0;
        gameState.lastConfidence = 0;
        gameState.confidenceHistory = [];
    } else if (targetLower === 'scissors') {
        scanInterval = 500; // 2x speed for scissors (500ms)
        console.log(`Setting scan interval to ${scanInterval}ms for ${gameState.targetItem}`);
    } else {
        console.log(`Setting scan interval to ${scanInterval}ms for ${gameState.targetItem}`);
    }
    
    // Start periodic scanning using the correct video element
    gameState.scanIntervalId = setInterval(async () => {
        if (gameState.isGameActive && gameState.scanner.isModelLoaded) {
            try {
                // Make sure video is playing and ready
                if (localPlayerVideoElement.readyState >= 2) {
                    const result = await gameState.scanner.processFrame(localPlayerVideoElement);
                    console.log("Scan result:", result);
                    
                    // For Rubik's cube, use a more sophisticated confidence tracking
                    if (targetLower === 'rubiks cube' || targetLower === 'rubik\'s cube') {
                        // Initialize if needed
                        if (!gameState.confidenceHistory) {
                            gameState.confidenceHistory = [];
                        }
                        
                        // Only process non-success results for confidence tracking
                        if (!result.success && result.confidence) {
                            // Add to history (limited to last 5 readings)
                            gameState.confidenceHistory.push(result.confidence);
                            if (gameState.confidenceHistory.length > 5) {
                                gameState.confidenceHistory.shift(); // Remove oldest
                            }
                            
                            // Calculate average confidence
                            const avgConfidence = gameState.confidenceHistory.reduce((sum, val) => sum + val, 0) / 
                                                  gameState.confidenceHistory.length;
                            
                            console.log(`Rubik's cube confidence: current=${result.confidence.toFixed(2)}, avg=${avgConfidence.toFixed(2)}`);
                            
                            // If we have at least 3 readings and good average confidence
                            if (gameState.confidenceHistory.length >= 3 && avgConfidence > 0.3 &&
                                (result.prediction && 
                                 (result.prediction.toLowerCase().includes('cube') || 
                                  result.prediction.toLowerCase().includes('rubik') ||
                                  result.prediction.toLowerCase().includes('puzzle')))) {
                                
                                console.log("⚡ RUBIK'S CUBE DETECTED with good confidence pattern");
                                
                                // Success! But don't manipulate the result directly
                                clearInterval(gameState.scanIntervalId);
                                gameState.isScanning = false;
                                
                                // Create an enhanced result that maintains data integrity
                                const enhancedResult = {
                                    success: true,
                                    message: 'Item verified!',
                                    confidence: avgConfidence,
                                    prediction: result.prediction || 'cube'
                                };
                                
                                // Reset tracking
                                gameState.confidenceHistory = [];
                                
                                await submitItem(enhancedResult);
                                
                                // Restart scanning after a delay
                                setTimeout(() => {
                                    if (gameState.isGameActive) {
                                        startWebcamScanning();
                                    }
                                }, 3000);
                                
                                return;
                            }
                        }
                    }
                    
                    // Standard success handling (for all items)
                    if (result.success) {
                        console.log("Item found! Submitting...");
                        clearInterval(gameState.scanIntervalId);
                        gameState.isScanning = false;
                        
                        await submitItem(result);
                        
                        // Restart scanning after a delay
                        setTimeout(() => {
                            if (gameState.isGameActive) {
                                startWebcamScanning();
                            }
                        }, 3000);
                    } else if (result.message && result.message !== 'Item not found or confidence too low') {
                        // If there's a specific error (not just "item not found")
                        console.warn("Scanning issue:", result.message);
                        // Show error for specific technical issues
                        if (result.message.includes('Video not ready') || 
                            result.message.includes('Invalid video dimensions')) {
                            showError(result.message);
                        }
                    }
                } else {
                    console.log("Scanning paused: Video not ready. ReadyState:", localPlayerVideoElement.readyState);
                }
            } catch (error) {
                console.error('Error during scanning interval:', error);
                showError("Error during scanning. Retrying...");
            }
        } else {
            // Stop scanning if game is no longer active or scanner not ready
            console.log("Stopping scanning loop (Game inactive or scanner not loaded).");
            clearInterval(gameState.scanIntervalId);
            gameState.scanIntervalId = null;
        }
    }, scanInterval);

    gameState.isScanning = true;
}

async function submitItem(scanResult) {
    if (!gameState.isGameActive) return;

    try {
        // Add loading state
        const cameraContainer = document.querySelector('.camera-container');
        if (cameraContainer) {
            cameraContainer.classList.add('loading');
        }

        // Play scanning sound
        if (gameState.audio && gameState.audio.isInitialized) {
            gameState.audio.playSound('scan');
        }

        // IMPORTANT: Log detailed submission data for debugging
        console.log('📤 SUBMITTING ITEM:', {
            item: gameState.targetItem,
            prediction: scanResult?.prediction || null,
            confidence: scanResult?.confidence || null
        });

        // Generate image hash and metadata if available
        let imageHash = null;
        let metadata = null;
        
        try {
            const videoElement = document.getElementById(`video-${gameState.socket?.id}`);
            if (gameState.imageHasher && videoElement) {
                imageHash = await gameState.imageHasher.generateHash(videoElement);
                metadata = gameState.imageHasher.getMetadata(videoElement);
            }
        } catch (hashError) {
            console.warn('Could not generate image hash:', hashError);
            // Continue without the hash
        }

        // Ensure all required data is present
        if (!gameState.socket || !gameState.socket.connected) {
            console.error('Socket not connected for item submission');
            showError('Connection lost. Please refresh the page.');
            return;
        }

        // Create the submission data with all required fields
        const submissionData = {
            item: gameState.targetItem,
            timestamp: Date.now(),
            prediction: scanResult?.prediction || gameState.targetItem, // Use target item as fallback
            confidence: scanResult?.confidence || 0.8, // Use high confidence as fallback
            imageHash,
            metadata
        };

        console.log('📤 EMITTING submitItem EVENT:', submissionData);

        // Submit to server with all available data
        gameState.socket.emit('submitItem', submissionData);

        // Show success indicator
        showSuccessIndicator();
        
        // Log success
        console.log('✅ ITEM SUBMISSION SUCCESS:', gameState.targetItem);
    } catch (error) {
        console.error('Error submitting item:', error);
        showError('Failed to process image. Please try again.');
        if (gameState.audio && gameState.audio.isInitialized) {
            gameState.audio.playSound('error');
        }
        
        // Restart scanning after error
        setTimeout(() => {
            if (gameState.isGameActive && !gameState.isScanning) {
                startWebcamScanning();
            }
        }, 2000);
    } finally {
        // Remove loading state
        const cameraContainer = document.querySelector('.camera-container');
        if (cameraContainer) {
            cameraContainer.classList.remove('loading');
        }
    }
}

function updateCountdown(count) {
    countdownDisplay.textContent = count;
}

function updatePlayerList(data) {
    console.log('Updating player list:', data);
    
    // Find the player slot by data-position if available, otherwise find first empty
    const position = data.position !== undefined ? data.position : findEmptySlotPosition();
    const playerSlot = document.querySelector(`.player-video[data-position="${position}"]`);

    if (!playerSlot) {
        console.warn(`No player slot found for position ${position}`);
        return;
    }

    // Update player data in game state
    const playerData = {
        id: data.playerId,
        name: data.playerName,
        position: position,
        element: playerSlot,
        score: data.score || 0,
        streak: data.streak || 0
    };
    gameState.players[data.playerId] = playerData; // Store by player ID

    // Remove empty class and update content
    playerSlot.classList.remove('empty');
    playerSlot.innerHTML = `
        <div class="camera-container">
            <video id="video-${data.playerId}" autoplay playsinline muted></video>
            <div class="player-info">
                <div class="player-name">${data.playerName}</div>
                <div class="player-stats">
                    <span class="score">${playerData.score}</span>
                    <span class="streak">${playerData.streak > 1 ? '🔥'+playerData.streak+'x' : ''}</span>
                </div>
            </div>
        </div>
    `;

    // If this is the local player joining, initialize their webcam
    if (data.playerId === gameState.socket?.id) {
        initializeLocalWebcam(playerSlot.querySelector('video'));
    } else {
        // For other players, we need to request/receive their stream (handled by socket listeners)
        console.log(`Requesting video for player ${data.playerId} in slot ${position}`);
        // The server should send the stream based on room logic
    }
    
    // Show waiting message if not enough players
    const currentPlayersCount = Object.keys(gameState.players).length;
    if (currentPlayersCount < MIN_PLAYERS) {
        showMessage(`Waiting for players... (${currentPlayersCount}/${MIN_PLAYERS} needed)`);
    }
}

// Helper to find the first available empty slot position
function findEmptySlotPosition() {
    for (let i = 0; i < gameState.maxPlayers; i++) {
        const slot = document.querySelector(`.player-video[data-position="${i}"]`);
        if (slot && slot.classList.contains('empty')) {
            return i;
        }
    }
    return -1; // No empty slot found
}

// Initialize the local player's webcam and attach to their video element
async function initializeLocalWebcam(videoElement) {
    if (!videoElement) {
        console.error("Video element not provided for webcam initialization");
        return false;
    }
    
    console.log("Initializing local webcam...");
    
    // Check if we already have a stream and it's still active
    if (gameState.localStream && gameState.localStream.active) {
        console.log("Using existing webcam stream");
        videoElement.srcObject = gameState.localStream;
        return true;
    }
    
    try {
        // Get user media with constraints
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: false
        };
        
        console.log("Requesting webcam access...");
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Store stream globally and assign to video element
        gameState.localStream = stream;
        videoElement.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                console.log("Video metadata loaded, dimensions:", videoElement.videoWidth, "x", videoElement.videoHeight);
                resolve();
            };
            // Add a timeout in case onloadedmetadata doesn't fire
            setTimeout(resolve, 1000);
        });
        
        // Make sure video is playing
        try {
            await videoElement.play();
            console.log("Video started playing successfully");
        } catch (playError) {
            console.error("Error playing video:", playError);
            // Continue anyway, as some browsers might still work
        }
        
        return true;
    } catch (error) {
        console.error("Error accessing webcam:", error);
        
        // Show specific error message based on error type
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
            showError("Camera access denied. Please allow camera access in your browser settings.");
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
            showError("No camera found. Please connect a camera and try again.");
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
            showError("Camera is in use by another application. Please close other applications using your camera.");
        } else {
            showError("Error accessing camera: " + error.message);
        }
        
        return false;
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
    // Play success sound
    if (gameState.audio && gameState.audio.isInitialized) {
        gameState.audio.playSound('success');
    }
    
    // Show visual indicator on the player's video
    const localPlayerId = gameState.socket?.id;
    if (localPlayerId) {
        const playerContainer = document.querySelector(`.player-video[data-position="${gameState.players[localPlayerId]?.position}"] .camera-container`);
        if (playerContainer) {
            // Create success indicator element
            const successIndicator = document.createElement('div');
            successIndicator.className = 'success-indicator';
            playerContainer.appendChild(successIndicator);
            
            // Remove after animation completes
            setTimeout(() => {
                if (successIndicator.parentNode) {
                    successIndicator.remove();
                }
            }, 2000);
        }
    }
    
    // Update player UI to show success
    updatePlayerScore({
        playerId: localPlayerId,
        score: gameState.players[localPlayerId]?.score || 0,
        streak: gameState.players[localPlayerId]?.streak || 0
    });
}

function endRound(data) {
    console.log("Ending round, stopping scanning loop.");
    // Stop scanning interval
    if (gameState.scanIntervalId) {
        clearInterval(gameState.scanIntervalId);
        gameState.scanIntervalId = null;
    }

    // Play round end sound
    gameState.audio.playSound('roundEnd');

    // Stop webcam stream?
    // Consider if the stream should stop or just the scanning
    // if (gameState.localStream) {
    //     gameState.localStream.getTracks().forEach(track => track.stop());
    //     gameState.localStream = null; 
    // }
    
    // Update player stats
    const currentPlayer = data.scores.find(score => score.playerId === gameState.socket.id);
    if (currentPlayer) {
        // Ensure playerStats exists
        if (!gameState.playerStats) {
            gameState.playerStats = { roundScores: [], roundTimes: [], maxStreak: 0, currentStreak: 0 };
        }
        gameState.playerStats.roundScores.push(currentPlayer.score);
        // Make sure roundStartTime was recorded
        const roundDuration = gameState.roundStartTime ? (Date.now() - gameState.roundStartTime) : 0;
        gameState.playerStats.roundTimes.push(roundDuration);
        gameState.playerStats.maxStreak = Math.max(gameState.playerStats.maxStreak || 0, gameState.playerStats.currentStreak || 0);
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

function showError(message, duration = 3000) {
    console.error(message);
    
    // Add as a general message
    const errorMsg = document.createElement('div');
    errorMsg.className = 'error-message';
    errorMsg.textContent = message;
    document.body.appendChild(errorMsg);
    
    // Also add directly to the player's video container if it exists
    const localPlayerId = gameState.socket?.id;
    if (localPlayerId) {
        const playerContainer = document.querySelector(`.player-video[data-position="${gameState.players[localPlayerId]?.position}"] .camera-container`);
        if (playerContainer) {
            // Remove any existing error messages
            const existingError = playerContainer.querySelector('.processing-error');
            if (existingError) {
                existingError.remove();
            }
            
            // Add new error message
            const videoError = document.createElement('div');
            videoError.className = 'processing-error';
            videoError.textContent = message;
            playerContainer.appendChild(videoError);
            
            // Remove after duration
            setTimeout(() => {
                if (videoError.parentNode) {
                    videoError.remove();
                }
            }, duration);
        }
    }
    
    // Clean up general message after duration
    setTimeout(() => {
        if (errorMsg.parentNode) {
            errorMsg.remove();
        }
    }, duration);
    
    // Play error sound if available
    if (gameState.audio && gameState.audio.isInitialized) {
        gameState.audio.playSound('error');
    }
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

            const playerNameInput = document.getElementById('player-name');
            const playerName = playerNameInput.value.trim();
            
            if (playerName) {
                gameState.playerName = playerName;
                console.log('Emitting joinGame event with name:', playerName);
                gameState.socket.emit('joinGame', { name: playerName });
                
                // Play click sound
                if (gameState.audio) {
                    gameState.audio.playSound('click');
                }
            } else {
                showError('Please enter your name');
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
    const playerNameInput = document.getElementById('player-name');
    const playerName = playerNameInput.value.trim();
    
    if (playerName) {
        console.log('Adding new player:', playerName);
        gameState.socket.emit('joinGame', { name: playerName });
        
        // Play click sound
        if (gameState.audio) {
            gameState.audio.playSound('click');
        }
    } else {
        showError('Please enter your name');
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
        
        // Update with potentially more complete player list from server
        if (data.allPlayers) {
             Object.values(data.allPlayers).forEach(player => {
                 if (!gameState.players[player.id]) { // Add players we might have missed
                     updatePlayerList(player);
                 }
             });
        }

        const currentPlayersCount = Object.keys(gameState.players).length;
        if (currentPlayersCount < MIN_PLAYERS) {
            showMessage(`Waiting for players... (${currentPlayersCount}/${MIN_PLAYERS} needed)`);
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
        // Re-add player to the list and potentially request stream
        updatePlayerList(data);
    });

    // -------- ADD WEBRTC / VIDEO STREAM LISTENERS HERE --------
    // Example (needs actual WebRTC implementation):
    gameState.socket.on('videoOffer', handleVideoOffer); // From another peer
    gameState.socket.on('videoAnswer', handleVideoAnswer); // From another peer
    gameState.socket.on('newIceCandidate', handleNewIceCandidate); // From another peer
    gameState.socket.on('allPlayers', setupPeerConnections); // From server, lists players to connect to
    // -----------------------------------------------------------
}

// -------- ADD WEBRTC / VIDEO STREAM HANDLER FUNCTIONS HERE --------
// Placeholder functions - These require a full WebRTC implementation
function setupPeerConnections(players) {
    console.log("Setting up peer connections for players:", players);
    // For each player (except self), create a PeerConnection
    // Send offers etc.
}

function handleVideoOffer(data) {
    console.log("Received video offer from:", data.senderId);
    // Create PeerConnection, set remote description, create answer, send answer
}

function handleVideoAnswer(data) {
    console.log("Received video answer from:", data.senderId);
    // Set remote description
}

function handleNewIceCandidate(data) {
    console.log("Received ICE candidate from:", data.senderId);
    // Add ICE candidate to the corresponding PeerConnection
}
// -----------------------------------------------------------------

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