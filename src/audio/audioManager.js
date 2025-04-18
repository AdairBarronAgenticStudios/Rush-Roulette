/**
 * Audio Manager for Rush Roulette
 * Handles all game sound effects and background music
 */

class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.music = null;
        this.isMuted = false;
        this.volume = 0.5;
        this.initialized = false;
    }

    /**
     * Initialize audio system and load all sounds
     */
    async initialize() {
        if (this.initialized) return;

        // Define sound effects with their URLs
        const soundEffects = {
            scan: '/assets/audio/scan.mp3',
            success: '/assets/audio/success.mp3',
            error: '/assets/audio/error.mp3',
            countdown: '/assets/audio/countdown.mp3',
            roundStart: '/assets/audio/round-start.mp3',
            roundEnd: '/assets/audio/round-end.mp3',
            gameOver: '/assets/audio/game-over.mp3',
            click: '/assets/audio/click.mp3',
            point: '/assets/audio/point.mp3',
            streak: '/assets/audio/streak.mp3'
        };

        // Load all sound effects
        try {
            for (const [name, url] of Object.entries(soundEffects)) {
                const audio = new Audio(url);
                audio.volume = this.volume;
                this.sounds.set(name, audio);
            }

            // Load background music
            this.music = new Audio('/assets/audio/background.mp3');
            this.music.loop = true;
            this.music.volume = this.volume * 0.3; // Background music slightly quieter

            this.initialized = true;
        } catch (error) {
            console.error('Failed to load audio files:', error);
        }
    }

    /**
     * Play a sound effect
     * @param {string} soundName - Name of the sound to play
     * @param {Object} options - Optional parameters (volume, pitch, etc.)
     */
    playSound(soundName, options = {}) {
        if (this.isMuted) return;

        const sound = this.sounds.get(soundName);
        if (!sound) return;

        // Create a new audio instance for overlapping sounds
        const audioInstance = sound.cloneNode();
        
        // Apply options
        if (options.volume) {
            audioInstance.volume = options.volume * this.volume;
        }
        if (options.playbackRate) {
            audioInstance.playbackRate = options.playbackRate;
        }

        // Play the sound
        audioInstance.play().catch(error => {
            console.error(`Error playing sound ${soundName}:`, error);
        });

        // Cleanup after playing
        audioInstance.onended = () => {
            audioInstance.remove();
        };
    }

    /**
     * Start playing background music
     */
    startMusic() {
        if (this.isMuted || !this.music) return;

        // Fade in the music
        this.music.volume = 0;
        this.music.play().then(() => {
            const fadeIn = setInterval(() => {
                if (this.music.volume < this.volume * 0.3) {
                    this.music.volume += 0.01;
                } else {
                    clearInterval(fadeIn);
                }
            }, 50);
        }).catch(error => {
            console.error('Error playing background music:', error);
        });
    }

    /**
     * Stop background music
     */
    stopMusic() {
        if (!this.music) return;

        // Fade out the music
        const fadeOut = setInterval(() => {
            if (this.music.volume > 0.01) {
                this.music.volume -= 0.01;
            } else {
                this.music.pause();
                this.music.currentTime = 0;
                clearInterval(fadeOut);
            }
        }, 50);
    }

    /**
     * Toggle mute state
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted) {
            this.stopMusic();
        } else {
            this.startMusic();
        }

        return this.isMuted;
    }

    /**
     * Set master volume
     * @param {number} level - Volume level (0-1)
     */
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
        
        // Update all sound volumes
        this.sounds.forEach(sound => {
            sound.volume = this.volume;
        });

        // Update music volume
        if (this.music) {
            this.music.volume = this.volume * 0.3;
        }
    }

    /**
     * Play a sequence of sounds with timing
     * @param {Array} sequence - Array of sound names and delays
     */
    async playSequence(sequence) {
        if (this.isMuted) return;

        for (const item of sequence) {
            this.playSound(item.sound, item.options);
            if (item.delay) {
                await new Promise(resolve => setTimeout(resolve, item.delay));
            }
        }
    }

    /**
     * Clean up audio resources
     */
    dispose() {
        this.stopMusic();
        this.sounds.clear();
        this.music = null;
        this.initialized = false;
    }
}

export default AudioManager; 