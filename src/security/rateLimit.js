/**
 * Rate Limiting System for Rush Roulette
 * Prevents abuse through request throttling
 */

class RateLimiter {
    constructor() {
        this.requests = new Map();
        this.limits = {
            itemSubmission: { max: 5, window: 5000 }, // 5 submissions per 5 seconds
            roomJoin: { max: 3, window: 60000 },      // 3 room joins per minute
            messageRate: { max: 10, window: 10000 }    // 10 messages per 10 seconds
        };
    }

    /**
     * Check if an action is allowed
     * @param {string} actionType - Type of action to check
     * @param {string} userId - User identifier
     * @returns {boolean} Whether the action is allowed
     */
    isAllowed(actionType, userId) {
        const limit = this.limits[actionType];
        if (!limit) return true;

        const key = `${userId}:${actionType}`;
        const now = Date.now();
        const userRequests = this.requests.get(key) || [];

        // Remove old requests outside the window
        const recentRequests = userRequests.filter(
            timestamp => now - timestamp < limit.window
        );

        // Check if under limit
        if (recentRequests.length >= limit.max) {
            return false;
        }

        // Add new request
        recentRequests.push(now);
        this.requests.set(key, recentRequests);
        return true;
    }

    /**
     * Get remaining requests in the current window
     * @param {string} actionType - Type of action to check
     * @param {string} userId - User identifier
     * @returns {Object} Remaining requests and reset time
     */
    getRemainingRequests(actionType, userId) {
        const limit = this.limits[actionType];
        if (!limit) return { remaining: Infinity, resetIn: 0 };

        const key = `${userId}:${actionType}`;
        const now = Date.now();
        const userRequests = this.requests.get(key) || [];
        const recentRequests = userRequests.filter(
            timestamp => now - timestamp < limit.window
        );

        const remaining = Math.max(0, limit.max - recentRequests.length);
        const oldestRequest = recentRequests[0] || now;
        const resetIn = Math.max(0, limit.window - (now - oldestRequest));

        return { remaining, resetIn };
    }

    /**
     * Clear rate limit data for a user
     * @param {string} userId - User identifier
     */
    clearUser(userId) {
        for (const actionType of Object.keys(this.limits)) {
            this.requests.delete(`${userId}:${actionType}`);
        }
    }

    /**
     * Clean up old request data
     */
    cleanup() {
        const now = Date.now();
        for (const [key, requests] of this.requests.entries()) {
            const [userId, actionType] = key.split(':');
            const limit = this.limits[actionType];
            if (!limit) continue;

            const recentRequests = requests.filter(
                timestamp => now - timestamp < limit.window
            );

            if (recentRequests.length === 0) {
                this.requests.delete(key);
            } else {
                this.requests.set(key, recentRequests);
            }
        }
    }

    /**
     * Get current rate limit status for debugging
     * @returns {Object} Current rate limit status
     */
    getStatus() {
        const status = {};
        for (const [key, requests] of this.requests.entries()) {
            const [userId, actionType] = key.split(':');
            if (!status[userId]) status[userId] = {};
            status[userId][actionType] = this.getRemainingRequests(actionType, userId);
        }
        return status;
    }
}

export default RateLimiter; 