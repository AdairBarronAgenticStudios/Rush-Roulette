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

// Game state
const gameRooms = new Map();
const playerRooms = new Map();
const disconnectedPlayers = new Map(); // Track disconnected players for recovery

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

    // Handle player joining
    socket.on('joinGame', (data) => {
        if (!checkRateLimit(socket, 'roomJoin')) return;

        console.log('Player joining game:', data.name);
        const playerName = data.name;
        
        // Find an available room or create a new one
        let roomId = findAvailableRoom();
        if (!roomId) {
            roomId = createNewRoom();
        }
        
        // Add player to room
        socket.join(roomId);
        playerRooms.set(socket.id, roomId);
        
        const room = gameRooms.get(roomId);
        room.players.push({
            id: socket.id,
            name: playerName,
            score: 0,
            streak: 0,
            roundScores: []
        });
        
        // Notify all players in the room
        io.to(roomId).emit('playerJoined', {
            playerId: socket.id,
            playerName: playerName,
            currentPlayers: room.players.map(p => ({
                id: p.id,
                name: p.name,
                score: p.score
            }))
        });
        
        // Start game if room has minimum players
        if (room.players.length >= MIN_PLAYERS) {
            startGameCountdown(roomId);
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

    // Handle item submissions
    socket.on('submitItem', async (data) => {
        if (!checkRateLimit(socket, 'itemSubmission')) return;

        const roomId = playerRooms.get(socket.id);
        if (!roomId) return;

        const room = gameRooms.get(roomId);
        if (!room || !room.isActive) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        // Calculate score based on time and accuracy
        const timeElapsed = Date.now() - room.roundStartTime;
        const timeBonus = Math.max(0, 1 - (timeElapsed / ROUND_DURATION));
        const score = calculateScore(timeBonus, room.currentRound, player.streak);

        // Update player score
        player.score += score;
        player.streak++;
        player.roundScores[room.currentRound - 1] = score;

        // Notify all players
        io.to(roomId).emit('itemVerified', {
            playerId: socket.id,
            playerName: player.name,
            score: score,
            totalScore: player.score,
            streak: player.streak
        });
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        const roomId = playerRooms.get(socket.id);
        if (roomId) {
            const room = gameRooms.get(roomId);
            if (room) {
                // Store disconnected player data for potential recovery
                const player = room.players.find(p => p.id === socket.id);
                if (player) {
                    disconnectedPlayers.set(socket.id, {
                        roomId,
                        playerData: player,
                        timestamp: Date.now()
                    });

                    // Set cleanup timeout
                    setTimeout(() => {
                        disconnectedPlayers.delete(socket.id);
                    }, 30000); // 30 second recovery window
                }

                room.players = room.players.filter(p => p.id !== socket.id);
                io.to(roomId).emit('playerLeft', { 
                    playerId: socket.id,
                    remainingPlayers: room.players.length
                });
                
                // End game if not enough players
                if (room.players.length < MIN_PLAYERS && room.isActive) {
                    endGame(roomId, 'Not enough players');
                }
                
                // Clean up empty rooms
                if (room.players.length === 0) {
                    gameRooms.delete(roomId);
                }
            }
            playerRooms.delete(socket.id);
        }

        // Clean up rate limiter data
        rateLimiter.clearUser(socket.id);
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
        roundTimer: null
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});