/**
 * Anti-cheat system for Rush Roulette
 * Implements various security measures to ensure fair play
 */

class AntiCheatSystem {
    constructor() {
        this.submissionHistory = new Map(); // Player submission timestamps
        this.imageHashes = new Set(); // Track image hashes to prevent reuse
        this.suspiciousActivity = new Map(); // Track suspicious behavior
        this.MINIMUM_TIME_BETWEEN_SUBMISSIONS = 2000; // 2 seconds
        this.MAX_SUBMISSIONS_PER_ROUND = 5;
        this.SUBMISSION_WINDOW = 30000; // 30 seconds
    }

    /**
     * Validates a new submission attempt
     * @param {string} playerId - The ID of the player making the submission
     * @param {Object} submissionData - Data about the submission
     * @returns {Object} Validation result
     */
    validateSubmission(playerId, submissionData) {
        const now = Date.now();
        const playerHistory = this.getPlayerHistory(playerId);
        
        // Check submission frequency
        if (!this.checkSubmissionFrequency(playerHistory, now)) {
            return {
                valid: false,
                reason: 'Too many submissions in a short time'
            };
        }

        // Check if within round time limit
        if (!this.checkTimeWindow(submissionData.roundStartTime, now)) {
            return {
                valid: false,
                reason: 'Submission outside of valid time window'
            };
        }

        // Check for suspicious patterns
        if (this.detectSuspiciousPattern(playerId, submissionData)) {
            return {
                valid: false,
                reason: 'Suspicious activity detected'
            };
        }

        // Update player history
        this.updatePlayerHistory(playerId, now);

        return { valid: true };
    }

    /**
     * Validates an image submission
     * @param {string} imageHash - Hash of the submitted image
     * @param {Object} metadata - Image metadata
     * @returns {Object} Validation result
     */
    validateImage(imageHash, metadata) {
        // Check for image reuse
        if (this.imageHashes.has(imageHash)) {
            return {
                valid: false,
                reason: 'Image has been previously submitted'
            };
        }

        // Validate image metadata
        if (!this.validateImageMetadata(metadata)) {
            return {
                valid: false,
                reason: 'Invalid image metadata'
            };
        }

        // Store hash for future reference
        this.imageHashes.add(imageHash);

        return { valid: true };
    }

    /**
     * Checks if submissions are too frequent
     * @private
     */
    checkSubmissionFrequency(history, currentTime) {
        if (!history.length) return true;

        const recentSubmissions = history.filter(time => 
            currentTime - time < this.SUBMISSION_WINDOW
        );

        if (recentSubmissions.length >= this.MAX_SUBMISSIONS_PER_ROUND) {
            return false;
        }

        const lastSubmission = history[history.length - 1];
        return (currentTime - lastSubmission) >= this.MINIMUM_TIME_BETWEEN_SUBMISSIONS;
    }

    /**
     * Checks if submission is within valid time window
     * @private
     */
    checkTimeWindow(roundStartTime, currentTime) {
        const timeSinceStart = currentTime - roundStartTime;
        return timeSinceStart >= 0 && timeSinceStart <= this.SUBMISSION_WINDOW;
    }

    /**
     * Validates image metadata
     * @private
     */
    validateImageMetadata(metadata) {
        // Check if image was taken recently
        const maxAge = 5000; // 5 seconds
        if (Date.now() - metadata.timestamp > maxAge) {
            return false;
        }

        // Check if image comes from a valid source
        if (!metadata.source || metadata.source !== 'webcam') {
            return false;
        }

        // Check image dimensions
        if (!metadata.dimensions || 
            metadata.dimensions.width < 200 || 
            metadata.dimensions.height < 200) {
            return false;
        }

        return true;
    }

    /**
     * Detects suspicious patterns in player behavior
     * @private
     */
    detectSuspiciousPattern(playerId, submissionData) {
        const playerSuspicion = this.suspiciousActivity.get(playerId) || {
            count: 0,
            lastReset: Date.now()
        };

        // Reset suspicion count if it's been a while
        if (Date.now() - playerSuspicion.lastReset > 300000) { // 5 minutes
            playerSuspicion.count = 0;
            playerSuspicion.lastReset = Date.now();
        }

        // Check for rapid successful submissions
        if (submissionData.success && 
            this.getPlayerHistory(playerId).length >= 3) {
            playerSuspicion.count++;
        }

        this.suspiciousActivity.set(playerId, playerSuspicion);

        // Return true if suspicion threshold is reached
        return playerSuspicion.count >= 5;
    }

    /**
     * Gets player submission history
     * @private
     */
    getPlayerHistory(playerId) {
        return this.submissionHistory.get(playerId) || [];
    }

    /**
     * Updates player submission history
     * @private
     */
    updatePlayerHistory(playerId, timestamp) {
        const history = this.getPlayerHistory(playerId);
        history.push(timestamp);
        this.submissionHistory.set(playerId, history);
    }

    /**
     * Resets player history for a new round
     */
    resetPlayerForNewRound(playerId) {
        this.submissionHistory.delete(playerId);
        this.suspiciousActivity.set(playerId, {
            count: 0,
            lastReset: Date.now()
        });
    }

    /**
     * Clears all tracking data for a player
     */
    clearPlayerData(playerId) {
        this.submissionHistory.delete(playerId);
        this.suspiciousActivity.delete(playerId);
    }
}

export default AntiCheatSystem; 