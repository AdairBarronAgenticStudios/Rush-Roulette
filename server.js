import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import { getRandomItem } from './src/ai/items.js';
import RateLimiter from './src/security/rateLimit.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from the root directory
app.use(express.static(__dirname));

// Serve static files from src directory
app.use('/src', express.static(path.join(__dirname, 'src')));

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle 404s
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Initialize rate limiter
const rateLimiter = new RateLimiter();

// Game Constants
const ROUND_DURATION = 60000; // 60 seconds per round
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 2;
const ROUNDS_PER_GAME = 3;
const DIFFICULTIES = ['common', 'specific', 'rare'];
const ROOM_CLEANUP_INTERVAL = 300000; // 5 minutes
const PLAYER_TIMEOUT = 30000; // 30 seconds
const MAX_INACTIVE_TIME = 600000; // 10 minutes

// Game state
const gameRooms = new Map();
const playerRooms = new Map();
const disconnectedPlayers = new Map();
const submissionLocks = new Map(); // Prevent duplicate submissions

// Clean up inactive rooms and disconnected players
setInterval(() => {
    const now = Date.now();
    
    // Clean up inactive rooms
    for (const [roomId, room] of gameRooms.entries()) {
        if (!room.isActive && (now - room.lastActivity > MAX_INACTIVE_TIME)) {
            endGame(roomId, 'Room inactive');
            gameRooms.delete(roomId);
        }
    }
    
    // Clean up disconnected players
    for (const [playerId, data] of disconnectedPlayers.entries()) {
        if (now - data.timestamp > PLAYER_TIMEOUT) {
            disconnectedPlayers.delete(playerId);
        }
    }
}, ROOM_CLEANUP_INTERVAL);

// Express routes
app.get('/status', (req, res) => {
    res.json({
        status: 'ok',
        activeRooms: gameRooms.size,
        totalPlayers: playerRooms.size,
        rateLimits: rateLimiter.getStatus()
    });
});

// Middleware to check rate limits
const checkRateLimit = (socket, actionType) => {
    if (!rateLimiter.isAllowed(actionType, socket.id)) {
        socket.emit('error', {
            type: 'rate_limit',
            message: 'Too many requests. Please wait.',
            ...rateLimiter.getRemainingRequests(actionType, socket.id)
        });
        return false;
    }
    return true;
};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Clean up any existing session for this socket
    cleanupPlayer(socket.id);

    // Handle player joining with validation
    socket.on('joinGame', (data) => {
        if (!checkRateLimit(socket, 'roomJoin')) {
            socket.emit('error', {
                type: 'rate_limit',
                message: 'Too many join attempts. Please wait.'
            });
            return;
        }
        
        // Validate player name
        if (!validatePlayerName(data.name)) {
            socket.emit('error', {
                type: 'invalid_input',
                message: 'Invalid player name. Must be 2-20 characters.'
            });
            return;
        }
        
        try {
            console.log('Player joining game:', data.name);
            const playerName = data.name.trim();
            
            // Find or create room
            let roomId = findAvailableRoom();
            if (!roomId) {
                try {
                    roomId = createNewRoom();
                } catch (error) {
                    socket.emit('error', {
                        type: 'room_creation_failed',
                        message: 'Failed to create game room.'
                    });
                    return;
                }
            }
            
            const room = gameRooms.get(roomId);
            
            // Check if room is full
            if (room.players.length >= MAX_PLAYERS) {
                socket.emit('error', {
                    type: 'room_full',
                    message: 'Room is full. Please try again later.'
                });
                return;
            }
            
            // Add player to room
            socket.join(roomId);
            playerRooms.set(socket.id, roomId);
            
            const playerData = {
                id: socket.id,
                name: playerName,
                score: 0,
                streak: 0,
                roundScores: [],
                lastActivity: Date.now()
            };
            
            room.players.push(playerData);
            room.lastActivity = Date.now();
            
            // Notify all players
            io.to(roomId).emit('playerJoined', {
                playerId: socket.id,
                playerName: playerName,
                currentPlayers: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    score: p.score,
                    streak: p.streak
                }))
            });
            
            // Start game if enough players
            if (room.players.length >= MIN_PLAYERS && !room.isActive) {
                console.log('Starting game countdown...');
                startGameCountdown(roomId);
            } else {
                console.log(`Waiting for more players (${room.players.length}/${MIN_PLAYERS} needed)`);
            }
        } catch (error) {
            console.error('Error in joinGame:', error);
            socket.emit('error', {
                type: 'join_failed',
                message: 'Failed to join game.'
            });
        }
    });

    // Handle session recovery attempts
    socket.on('attemptRejoin', async (data) => {
        if (!checkRateLimit(socket, 'roomJoin')) return;

        const disconnectedData = disconnectedPlayers.get(data.playerId);
        if (!disconnectedData) {
            socket.emit('rejoinResult', { success: false });
            return;
        }

        const room = gameRooms.get(disconnectedData.roomId);
        if (!room || !room.isActive) {
            socket.emit('rejoinResult', { success: false });
            return;
        }

        // Restore player state
        socket.join(disconnectedData.roomId);
        playerRooms.set(socket.id, disconnectedData.roomId);
        
        const playerIndex = room.players.findIndex(p => p.id === data.playerId);
        if (playerIndex !== -1) {
            room.players[playerIndex] = {
                ...disconnectedData.playerData,
                id: socket.id
            };
        } else {
            room.players.push({
                ...disconnectedData.playerData,
                id: socket.id
            });
        }

        // Clean up disconnected player data
        disconnectedPlayers.delete(data.playerId);

        // Notify player of successful rejoin
        socket.emit('rejoinResult', {
            success: true,
            gameState: {
                round: room.currentRound,
                targetItem: room.targetItem,
                timeRemaining: room.roundTimer ? ROUND_DURATION - (Date.now() - room.roundStartTime) : 0,
                players: room.players
            }
        });

        // Notify other players
        socket.to(disconnectedData.roomId).emit('playerRejoined', {
            playerId: socket.id,
            playerName: disconnectedData.playerData.name
        });
    });

    // Handle item submissions with locking
    socket.on('submitItem', async (data) => {
        if (!checkRateLimit(socket, 'itemSubmission')) return;
        
        const roomId = playerRooms.get(socket.id);
        if (!roomId) return;
        
        const room = gameRooms.get(roomId);
        if (!room || !room.isActive) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        
        // Check submission lock
        const lockKey = `${roomId}:${socket.id}`;
        if (submissionLocks.has(lockKey)) {
            socket.emit('error', {
                type: 'submission_locked',
                message: 'Please wait before submitting again.'
            });
            return;
        }
        
        try {
            // Lock submission
            submissionLocks.set(lockKey, true);
            
            // Validate submission data
            if (!data || !data.prediction || !data.confidence) {
                throw new Error('Invalid submission data');
            }
            
            // Calculate score
            const timeElapsed = Date.now() - room.roundStartTime;
            const timeBonus = Math.max(0, 1 - (timeElapsed / ROUND_DURATION));
            const score = calculateScore(timeBonus, room.currentRound, player.streak);
            
            // Update player score
            player.score += score;
            player.streak++;
            player.roundScores[room.currentRound - 1] = score;
            player.lastActivity = Date.now();
            room.lastActivity = Date.now();
            
            // Notify all players
            io.to(roomId).emit('itemVerified', {
                playerId: socket.id,
                playerName: player.name,
                score: score,
                totalScore: player.score,
                streak: player.streak,
                timeBonus: timeBonus
            });
            
            // Release lock after a short delay
            setTimeout(() => {
                submissionLocks.delete(lockKey);
            }, 1000);
        } catch (error) {
            console.error('Error in submitItem:', error);
            socket.emit('error', {
                type: 'submission_failed',
                message: 'Failed to process item submission.'
            });
            submissionLocks.delete(lockKey);
        }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        const roomId = playerRooms.get(socket.id);
        if (roomId) {
            const room = gameRooms.get(roomId);
            if (room) {
                // Notify other players before cleanup
                io.to(roomId).emit('playerLeft', {
                    playerId: socket.id,
                    remainingPlayers: room.players.length - 1
                });
            }
        }
        cleanupPlayer(socket.id);
    });
});

function createNewRoom() {
    const roomId = 'room_' + Date.now();
    gameRooms.set(roomId, {
        id: roomId,
        players: [],
        currentRound: 0,
        isActive: false,
        roundStartTime: null,
        targetItem: null,
        roundTimer: null,
        lastActivity: Date.now()
    });
    return roomId;
}

function findAvailableRoom() {
    for (const [roomId, room] of gameRooms) {
        if (room.players.length < MAX_PLAYERS && !room.isActive) {
            return roomId;
        }
    }
    return null;
}

function startGameCountdown(roomId) {
    const room = gameRooms.get(roomId);
    if (!room || room.isActive) return;

    let countdown = 5;
    io.to(roomId).emit('gameStarting', { countdown });

    const timer = setInterval(() => {
        countdown--;
        io.to(roomId).emit('countdown', { countdown });

        if (countdown <= 0) {
            clearInterval(timer);
            startGame(roomId);
        }
    }, 1000);
}

function startGame(roomId) {
    const room = gameRooms.get(roomId);
    if (!room || room.isActive) return;
    
    room.isActive = true;
    room.currentRound = 1;
    
    io.to(roomId).emit('gameStarted', {
        round: room.currentRound,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }))
    });

    startRound(roomId);
}

function startRound(roomId) {
    const room = gameRooms.get(roomId);
    if (!room) return;

    // Set up round
    room.roundStartTime = Date.now();
    room.targetItem = getRandomItem(DIFFICULTIES[room.currentRound - 1]);

    // Notify players
    io.to(roomId).emit('roundStarted', {
        round: room.currentRound,
        targetItem: room.targetItem.name,
        duration: ROUND_DURATION
    });

    // Set round timer
    room.roundTimer = setTimeout(() => {
        endRound(roomId);
    }, ROUND_DURATION);
}

function endRound(roomId) {
    const room = gameRooms.get(roomId);
    if (!room) return;

    // Clear round timer
    if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
    }

    // Calculate round results
    const roundResults = room.players.map(player => ({
        id: player.id,
        name: player.name,
        roundScore: player.roundScores[room.currentRound - 1] || 0,
        totalScore: player.score,
        streak: player.streak
    })).sort((a, b) => b.roundScore - a.roundScore);

    // Send round results
    io.to(roomId).emit('roundEnded', {
        round: room.currentRound,
        results: roundResults
    });

    // Start next round or end game
    if (room.currentRound < ROUNDS_PER_GAME) {
        room.currentRound++;
        setTimeout(() => startRound(roomId), 5000);
    } else {
        endGame(roomId);
    }
}

function endGame(roomId, reason = 'Game Complete') {
    const room = gameRooms.get(roomId);
    if (!room) return;

    // Calculate final results
    const finalResults = room.players.map(player => ({
        id: player.id,
        name: player.name,
        totalScore: player.score,
        roundScores: player.roundScores,
        maxStreak: player.streak
    })).sort((a, b) => b.totalScore - a.totalScore);

    // Send game results
    io.to(roomId).emit('gameEnded', {
        reason: reason,
        results: finalResults
    });

    // Reset room
    room.isActive = false;
    room.currentRound = 0;
    room.roundStartTime = null;
    room.targetItem = null;
    if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
    }

    // Reset player scores
    room.players.forEach(player => {
        player.score = 0;
        player.streak = 0;
        player.roundScores = [];
    });
}

function calculateScore(timeBonus, round, streak) {
    // Base score
    let score = 100;

    // Add time bonus (up to 50 points)
    score += Math.floor(50 * timeBonus);

    // Add round multiplier
    score *= (1 + (round - 1) * 0.5); // 1x, 1.5x, 2x for rounds 1, 2, 3

    // Add streak bonus
    if (streak > 0) {
        score *= (1 + Math.min(streak * 0.1, 0.5)); // Up to 50% bonus for streaks
    }

    return Math.floor(score);
}

// Clean up rate limiter periodically
setInterval(() => {
    rateLimiter.cleanup();
}, 60000); // Every minute

// Validate player name
function validatePlayerName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmedName = name.trim();
    return trimmedName.length >= 2 && trimmedName.length <= 20;
}

// Update cleanupPlayer function
function cleanupPlayer(socketId) {
    console.log('Cleaning up player:', socketId);
    
    // Remove from player rooms
    const roomId = playerRooms.get(socketId);
    playerRooms.delete(socketId);
    
    // Remove from rate limiter
    rateLimiter.clearUser(socketId);
    
    // Remove from disconnected players
    disconnectedPlayers.delete(socketId);
    
    // Remove from room if exists
    if (roomId) {
        const room = gameRooms.get(roomId);
        if (room) {
            // Remove player from room
            room.players = room.players.filter(p => p.id !== socketId);
            
            // Clean up empty rooms
            if (room.players.length === 0) {
                console.log('Removing empty room:', roomId);
                gameRooms.delete(roomId);
            } else if (room.players.length < MIN_PLAYERS && room.isActive) {
                // End game if not enough players
                endGame(roomId, 'Not enough players');
            }
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});