import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';

class ItemScanner {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.currentItem = null;
        this.confidenceThreshold = 0.4;
        this.itemKeywords = {
            'tennis ball': ['ball', 'tennis', 'sports equipment', 'yellow ball', 'sphere'],
            'spoon': ['spoon', 'utensil', 'silverware', 'cutlery', 'tableware'],
            'scissors': ['scissors', 'shears', 'clippers', 'cutting tool', 'blade'],
            'rubiks cube': ['cube', 'puzzle', 'rubix', 'toy', 'puzzle cube'],
            'water bottle': ['bottle', 'container', 'water', 'drink', 'plastic bottle'],
            'book': ['book', 'novel', 'text', 'publication', 'reading material', 'paperback', 'hardcover', 'literature']
        };
    }

    /**
     * Initialize the scanner with MobileNet model
     */
    async initialize() {
        try {
            console.log('Loading MobileNet model...');
            this.model = await window.mobilenet.load();
            this.isModelLoaded = true;
            console.log('MobileNet model loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load MobileNet model:', error);
            throw new Error('Failed to initialize AI scanner');
        }
    }

    /**
     * Process a video frame and get predictions
     * @param {HTMLVideoElement} videoElement - The webcam video element
     * @returns {Array} Array of predictions
     */
    async processFrame(videoElement) {
        if (!this.isModelLoaded) {
            throw new Error('Model not initialized');
        }

        try {
            // Get more predictions for better accuracy
            const predictions = await this.model.classify(videoElement, 10); // Increased to top 10 predictions
            console.log('Raw predictions:', predictions); // Debug log
            return predictions;
        } catch (error) {
            console.error('Error processing frame:', error);
            throw error;
        }
    }

    /**
     * Verify if the current frame matches the target item
     * @param {HTMLVideoElement} videoElement - The webcam video element
     * @param {string} targetItem - The item to look for
     * @returns {Object} Verification result
     */
    async verifyItem(videoElement, targetItem) {
        try {
            const predictions = await this.processFrame(videoElement);
            
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
                console.log(`Checking prediction: ${prediction.className} (${prediction.probability}) against ${targetItem}`); // Debug log
            }

            return {
                success: false,
                message: 'Item not found or confidence too low',
                confidence: predictions[0].probability,
                prediction: predictions[0].className
            };
        } catch (error) {
            console.error('Error verifying item:', error);
            return {
                success: false,
                message: 'Error processing image',
                error: error.message
            };
        }
    }

    /**
     * Compare predicted item with target item
     * @param {string} predictedItem - The item predicted by the model
     * @param {string} targetItem - The target item to find
     * @returns {Object} Comparison result
     */
    compareItems(predictedItem, targetItem) {
        // Convert both to lowercase for comparison
        const predicted = predictedItem.toLowerCase();
        const target = targetItem.toLowerCase();

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

    /**
     * Check similarity between two words
     * @param {string} word1 
     * @param {string} word2 
     * @returns {boolean}
     */
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

    /**
     * Set the current target item
     * @param {string} item - The item to look for
     */
    setTargetItem(item) {
        this.currentItem = item;
    }

    /**
     * Get the current target item
     * @returns {string} Current target item
     */
    getTargetItem() {
        return this.currentItem;
    }
}

export default ItemScanner; 