/**
 * Image Hasher for Rush Roulette
 * Handles image verification and anti-cheat measures
 */

class ImageHasher {
    constructor() {
        this.lastHash = null;
        this.lastTimestamp = null;
        this.submissionHistory = new Map();
        this.suspiciousThreshold = 3;
    }

    /**
     * Generate a simple perceptual hash of an image
     * @param {HTMLVideoElement} videoElement - The video element to hash
     * @returns {string} The image hash
     */
    async generateHash(videoElement) {
        try {
            // Create a canvas to capture the frame
            const canvas = document.createElement('canvas');
            canvas.width = 32; // Small size for hashing
            canvas.height = 32;
            const ctx = canvas.getContext('2d');

            // Draw the current frame
            ctx.drawImage(videoElement, 0, 0, 32, 32);

            // Get image data
            const imageData = ctx.getImageData(0, 0, 32, 32).data;

            // Calculate average brightness
            let hash = '';
            for (let i = 0; i < imageData.length; i += 16) {
                const avg = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
                hash += avg > 128 ? '1' : '0';
            }

            // Store hash and timestamp
            const timestamp = Date.now();
            this.lastHash = hash;
            this.lastTimestamp = timestamp;

            // Track submission
            this.trackSubmission(hash, timestamp);

            return hash;
        } catch (error) {
            console.error('Error generating image hash:', error);
            throw new Error('Failed to process image for verification');
        }
    }

    /**
     * Get metadata about the video stream
     * @param {HTMLVideoElement} videoElement - The video element
     * @returns {Object} Stream metadata
     */
    getMetadata(videoElement) {
        return {
            width: videoElement.videoWidth,
            height: videoElement.videoHeight,
            timestamp: Date.now(),
            frameRate: videoElement.getVideoPlaybackQuality?.()?.totalVideoFrames || null,
            deviceId: videoElement.srcObject?.getTracks()?.[0]?.getSettings()?.deviceId || null
        };
    }

    /**
     * Track submission for anti-cheat detection
     * @param {string} hash - The image hash
     * @param {number} timestamp - Submission timestamp
     */
    trackSubmission(hash, timestamp) {
        const playerHistory = this.submissionHistory.get(hash) || [];
        playerHistory.push(timestamp);

        // Keep only recent history
        const recentHistory = playerHistory.filter(t => timestamp - t < 60000); // Last minute
        this.submissionHistory.set(hash, recentHistory);

        // Check for suspicious patterns
        if (this.detectSuspiciousActivity(recentHistory)) {
            this.reportSuspiciousActivity(hash, recentHistory);
        }
    }

    /**
     * Detect suspicious submission patterns
     * @param {Array} history - Array of submission timestamps
     * @returns {boolean} Whether suspicious activity was detected
     */
    detectSuspiciousActivity(history) {
        if (history.length < 2) return false;

        // Check submission frequency
        const intervals = [];
        for (let i = 1; i < history.length; i++) {
            intervals.push(history[i] - history[i - 1]);
        }

        // Check for suspiciously regular intervals
        const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
        const isRegular = intervals.every(interval => 
            Math.abs(interval - avgInterval) < 100 // Within 100ms
        );

        // Check for rapid submissions
        const tooFast = intervals.some(interval => interval < 500); // Less than 500ms

        return isRegular || tooFast;
    }

    /**
     * Report suspicious activity
     * @param {string} hash - The image hash
     * @param {Array} history - Submission history
     */
    reportSuspiciousActivity(hash, history) {
        console.warn('Suspicious activity detected:', {
            hash,
            submissions: history.length,
            timeSpan: history[history.length - 1] - history[0],
            pattern: 'Unusual submission pattern'
        });

        // Could emit an event or call a callback here
        if (this.onSuspiciousActivity) {
            this.onSuspiciousActivity({
                type: 'rapid_submission',
                severity: 'warning',
                evidence: {
                    hash,
                    history
                }
            });
        }
    }

    /**
     * Compare two image hashes
     * @param {string} hash1 - First hash
     * @param {string} hash2 - Second hash
     * @returns {number} Similarity score (0-1)
     */
    compareHashes(hash1, hash2) {
        if (hash1.length !== hash2.length) return 0;

        let differences = 0;
        for (let i = 0; i < hash1.length; i++) {
            if (hash1[i] !== hash2[i]) differences++;
        }

        return 1 - (differences / hash1.length);
    }

    /**
     * Reset tracking data
     */
    reset() {
        this.lastHash = null;
        this.lastTimestamp = null;
        this.submissionHistory.clear();
    }
}

export default ImageHasher; 