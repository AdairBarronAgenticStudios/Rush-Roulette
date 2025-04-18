/**
 * Session Recovery System for Rush Roulette
 * Handles game state persistence and recovery
 */

class RecoverySystem {
    constructor() {
        this.storageKey = 'rush_roulette_session';
        this.recoveryTimeout = 30000; // 30 seconds
    }

    /**
     * Save current game session
     * @param {Object} gameState - Current game state
     */
    saveSession(gameState) {
        const session = {
            playerId: gameState.socket?.id,
            playerName: gameState.playerName,
            roomId: gameState.roomId,
            timestamp: Date.now(),
            gameData: {
                currentRound: gameState.currentRound,
                score: gameState.playerStats.roundScores,
                streak: gameState.playerStats.currentStreak
            }
        };

        try {
            localStorage.setItem(this.storageKey, JSON.stringify(session));
        } catch (error) {
            console.error('Failed to save session:', error);
        }
    }

    /**
     * Load saved session
     * @returns {Object|null} Saved session data or null if none exists
     */
    loadSession() {
        try {
            const savedSession = localStorage.getItem(this.storageKey);
            if (!savedSession) return null;

            const session = JSON.parse(savedSession);
            const age = Date.now() - session.timestamp;

            // Check if session is still valid
            if (age > this.recoveryTimeout) {
                this.clearSession();
                return null;
            }

            return session;
        } catch (error) {
            console.error('Failed to load session:', error);
            return null;
        }
    }

    /**
     * Clear saved session
     */
    clearSession() {
        try {
            localStorage.removeItem(this.storageKey);
        } catch (error) {
            console.error('Failed to clear session:', error);
        }
    }

    /**
     * Attempt to recover a game session
     * @param {Object} gameState - Current game state
     * @param {Function} onRecover - Callback for successful recovery
     */
    async attemptRecovery(gameState, onRecover) {
        const session = this.loadSession();
        if (!session) return false;

        try {
            // Attempt to rejoin room
            await gameState.socket.emit('attemptRejoin', {
                playerId: session.playerId,
                playerName: session.playerName,
                roomId: session.roomId,
                gameData: session.gameData
            });

            // Wait for server response
            return new Promise((resolve) => {
                gameState.socket.once('rejoinResult', (result) => {
                    if (result.success) {
                        onRecover(session);
                        this.clearSession();
                        resolve(true);
                    } else {
                        this.clearSession();
                        resolve(false);
                    }
                });

                // Timeout after 5 seconds
                setTimeout(() => {
                    this.clearSession();
                    resolve(false);
                }, 5000);
            });
        } catch (error) {
            console.error('Recovery attempt failed:', error);
            this.clearSession();
            return false;
        }
    }
}

export default RecoverySystem; 