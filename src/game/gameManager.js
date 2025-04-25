/**
 * GameManager - Handles game state, rounds, and player interactions
 */

import errorManager from '../utils/errorManager.js';
import { getRandomItem } from '../items.js';

class GameManager {
  constructor() {
    this.games = new Map(); // roomId -> game state
    this.roundDuration = 60000; // 60 seconds per round
    this.timeBetweenRounds = 10000; // 10 seconds between rounds
    this.maxRounds = 5;
    this.minPlayers = 1;
  }

  /**
   * Create a new game room
   * @param {string} roomId - The room identifier
   * @return {Object} The new game state
   */
  createGame(roomId) {
    if (this.games.has(roomId)) {
      errorManager.logError('game', `Attempted to create duplicate game: ${roomId}`);
      throw new Error('Game already exists with this ID');
    }

    const game = {
      roomId,
      players: new Map(), // playerId -> player object
      status: 'waiting',  // waiting, countdown, active, between_rounds, ended
      currentRound: 0,
      maxRounds: this.maxRounds,
      currentItem: null,
      roundStartTime: null,
      roundEndTime: null,
      roundTimeRemaining: null,
      timers: { // Active timers
        round: null,
        countdown: null,
        betweenRounds: null
      },
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.games.set(roomId, game);
    return game;
  }

  /**
   * Add a player to a game
   * @param {string} roomId - The room identifier
   * @param {string} playerId - The player's socket ID
   * @param {string} playerName - The player's display name
   * @return {Object} Updated game state
   */
  addPlayer(roomId, playerId, playerName) {
    const game = this.getGame(roomId);
    
    if (game.players.has(playerId)) {
      return game; // Player already in game
    }

    const player = {
      id: playerId,
      name: playerName,
      score: 0,
      streak: 0,
      submittedItems: [],
      joinedAt: Date.now(),
      lastActivity: Date.now()
    };

    game.players.set(playerId, player);
    game.lastActivity = Date.now();

    // Check if we have enough players to start
    if (game.status === 'waiting' && game.players.size >= this.minPlayers) {
      this.startCountdown(roomId);
    }

    return game;
  }

  /**
   * Remove a player from a game
   * @param {string} roomId - The room identifier
   * @param {string} playerId - The player's socket ID
   * @return {Object|null} Updated game state or null if game ended
   */
  removePlayer(roomId, playerId) {
    const game = this.getGame(roomId);
    
    if (!game.players.has(playerId)) {
      return game; // Player not in game
    }

    game.players.delete(playerId);
    game.lastActivity = Date.now();

    // End game if no players left
    if (game.players.size === 0) {
      this.endGame(roomId);
      return null;
    }

    // Pause game if not enough players
    if (game.status === 'active' && game.players.size < this.minPlayers) {
      this.pauseGame(roomId);
    }

    return game;
  }

  /**
   * Start the countdown to begin the game
   * @param {string} roomId - The room identifier
   */
  startCountdown(roomId) {
    const game = this.getGame(roomId);
    
    // Clear any existing countdown
    if (game.timers.countdown) {
      clearTimeout(game.timers.countdown);
    }

    game.status = 'countdown';
    
    // Start a 5-second countdown
    game.timers.countdown = setTimeout(() => {
      this.startRound(roomId);
    }, 5000);
  }

  /**
   * Start a new round
   * @param {string} roomId - The room identifier
   */
  startRound(roomId) {
    const game = this.getGame(roomId);
    
    // Clear any existing timers
    this.clearAllTimers(game);

    game.currentRound++;
    game.status = 'active';
    game.currentItem = getRandomItem(game.currentRound, game.maxRounds);
    game.roundStartTime = Date.now();
    game.roundEndTime = game.roundStartTime + this.roundDuration;
    
    // Set round timer
    game.timers.round = setTimeout(() => {
      this.endRound(roomId);
    }, this.roundDuration);

    return game;
  }

  /**
   * End the current round
   * @param {string} roomId - The room identifier
   */
  endRound(roomId) {
    const game = this.getGame(roomId);
    
    // Clear round timer
    if (game.timers.round) {
      clearTimeout(game.timers.round);
      game.timers.round = null;
    }

    // Calculate final scores for the round
    this.finalizeRoundScores(game);

    game.status = 'between_rounds';
    
    // Check if this was the last round
    if (game.currentRound >= game.maxRounds) {
      // End the game after a short delay
      game.timers.betweenRounds = setTimeout(() => {
        this.endGame(roomId);
      }, this.timeBetweenRounds);
    } else {
      // Start next round after a delay
      game.timers.betweenRounds = setTimeout(() => {
        this.startRound(roomId);
      }, this.timeBetweenRounds);
    }

    return game;
  }

  /**
   * Process a player's item submission
   * @param {string} roomId - The room identifier
   * @param {string} playerId - The player's ID
   * @param {Object} itemData - The submitted item data
   * @return {Object} Result of the submission
   */
  submitItem(roomId, playerId, itemData) {
    const game = this.getGame(roomId);
    
    if (game.status !== 'active') {
      return { success: false, message: 'No active round in progress' };
    }
    
    const player = game.players.get(playerId);
    if (!player) {
      return { success: false, message: 'Player not found in game' };
    }

    player.lastActivity = Date.now();
    game.lastActivity = Date.now();

    // Verify the item matches the current target
    const isCorrect = this.verifyItem(game.currentItem, itemData);
    
    if (isCorrect) {
      // Calculate time bonus - faster submissions get more points
      const timeElapsed = Date.now() - game.roundStartTime;
      const timeRatio = 1 - (timeElapsed / this.roundDuration);
      const timeBonus = Math.floor(timeRatio * 50); // Up to 50 bonus points
      
      // Base score + time bonus
      const scoreEarned = 100 + timeBonus;
      
      // Track submission
      player.submittedItems.push({
        round: game.currentRound,
        item: itemData,
        score: scoreEarned,
        timeElapsed
      });
      
      // Update player score
      player.score += scoreEarned;
      player.streak++;
      
      return { 
        success: true, 
        message: 'Item matched!', 
        score: scoreEarned, 
        totalScore: player.score,
        streak: player.streak 
      };
    } else {
      // Reset streak on incorrect submission
      player.streak = 0;
      
      // Track failed submission
      player.submittedItems.push({
        round: game.currentRound,
        item: itemData,
        score: 0,
        timeElapsed: Date.now() - game.roundStartTime
      });
      
      return { 
        success: false, 
        message: 'Item did not match', 
        score: 0, 
        totalScore: player.score,
        streak: 0
      };
    }
  }

  /**
   * Verify if submitted item matches the target
   * @param {Object} targetItem - The current round's target item
   * @param {Object} submittedItem - The item data submitted by player
   * @return {boolean} Whether the item matches
   */
  verifyItem(targetItem, submittedItem) {
    // Basic verification - compare item name/type
    // More sophisticated logic would go here in a real implementation
    if (!targetItem || !submittedItem) return false;
    
    if (submittedItem.confidence < 0.7) {
      return false; // Reject low confidence detections
    }
    
    // Check if the detected item matches any keywords for the target
    return targetItem.keywords.some(keyword => 
      submittedItem.label.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  /**
   * Pause a game (when player count drops below minimum)
   * @param {string} roomId - The room identifier
   */
  pauseGame(roomId) {
    const game = this.getGame(roomId);
    
    // Clear all timers
    this.clearAllTimers(game);
    
    game.status = 'waiting';
    
    return game;
  }

  /**
   * End a game completely
   * @param {string} roomId - The room identifier
   */
  endGame(roomId) {
    const game = this.getGame(roomId);
    
    // Clear all timers
    this.clearAllTimers(game);
    
    game.status = 'ended';
    
    // Calculate final results and rankings
    const results = this.calculateFinalResults(game);
    
    // Keep game in memory for a short while before removing
    setTimeout(() => {
      this.games.delete(roomId);
    }, 300000); // 5 minutes
    
    return results;
  }

  /**
   * Calculate final scores for the round
   * @param {Object} game - The game state
   */
  finalizeRoundScores(game) {
    // Apply any end-of-round bonuses
    // For example, bonus for first to find the item
    const playersWhoFound = [...game.players.values()].filter(player => {
      return player.submittedItems.some(submission => 
        submission.round === game.currentRound && submission.score > 0
      );
    });
    
    // Sort by submission time
    playersWhoFound.sort((a, b) => {
      const aSubmission = a.submittedItems.find(s => s.round === game.currentRound && s.score > 0);
      const bSubmission = b.submittedItems.find(s => s.round === game.currentRound && s.score > 0);
      
      return aSubmission.timeElapsed - bSubmission.timeElapsed;
    });
    
    // First place bonus
    if (playersWhoFound.length > 0) {
      const firstPlayer = playersWhoFound[0];
      firstPlayer.score += 25; // First place bonus
    }
  }

  /**
   * Calculate final game results
   * @param {Object} game - The game state
   * @return {Object} Final results and rankings
   */
  calculateFinalResults(game) {
    const players = [...game.players.values()];
    
    // Sort by score (highest first)
    players.sort((a, b) => b.score - a.score);
    
    // Assign ranks
    const rankings = players.map((player, index) => {
      return {
        rank: index + 1,
        id: player.id,
        name: player.name,
        score: player.score,
        items: player.submittedItems.filter(s => s.score > 0).length
      };
    });
    
    return {
      roomId: game.roomId,
      rounds: game.currentRound,
      rankings,
      endedAt: Date.now()
    };
  }

  /**
   * Get current game state
   * @param {string} roomId - The room identifier
   * @return {Object} Current game state
   */
  getGame(roomId) {
    const game = this.games.get(roomId);
    
    if (!game) {
      errorManager.logError('game', `Game not found: ${roomId}`);
      throw new Error('Game not found');
    }
    
    return game;
  }

  /**
   * Get time remaining in current round
   * @param {string} roomId - The room identifier
   * @return {number} Milliseconds remaining
   */
  getRoundTimeRemaining(roomId) {
    const game = this.getGame(roomId);
    
    if (game.status !== 'active' || !game.roundEndTime) {
      return 0;
    }
    
    const remaining = Math.max(0, game.roundEndTime - Date.now());
    return remaining;
  }

  /**
   * Get summary info about all active games
   * @return {Array} List of active games
   */
  getActiveGames() {
    const activeGames = [];
    
    for (const [roomId, game] of this.games.entries()) {
      if (game.status !== 'ended') {
        activeGames.push({
          roomId,
          playerCount: game.players.size,
          status: game.status,
          currentRound: game.currentRound,
          maxRounds: game.maxRounds
        });
      }
    }
    
    return activeGames;
  }

  /**
   * Clear all active timers for a game
   * @param {Object} game - The game state
   */
  clearAllTimers(game) {
    if (game.timers.round) {
      clearTimeout(game.timers.round);
      game.timers.round = null;
    }
    
    if (game.timers.countdown) {
      clearTimeout(game.timers.countdown);
      game.timers.countdown = null;
    }
    
    if (game.timers.betweenRounds) {
      clearTimeout(game.timers.betweenRounds);
      game.timers.betweenRounds = null;
    }
  }

  /**
   * Clean up inactive games
   * @param {number} maxInactivity - Max time (ms) without activity before cleanup
   */
  cleanupInactiveGames(maxInactivity = 1800000) { // 30 minutes default
    const now = Date.now();
    
    for (const [roomId, game] of this.games.entries()) {
      // Skip games that are still active
      if (game.status === 'active' || game.status === 'countdown') continue;
      
      const inactiveTime = now - game.lastActivity;
      
      if (inactiveTime > maxInactivity) {
        errorManager.logError('game', `Cleaning up inactive game: ${roomId}`, {
          inactiveTime,
          playerCount: game.players.size,
          status: game.status
        });
        
        this.clearAllTimers(game);
        this.games.delete(roomId);
      }
    }
  }
}

// Export as singleton
const gameManager = new GameManager();
export default gameManager; 