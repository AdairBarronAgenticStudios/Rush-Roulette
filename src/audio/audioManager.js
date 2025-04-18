/**
 * Audio Manager for Rush Roulette
 * Handles all game sound effects and background music
 */

export default class AudioManager {
    constructor() {
        this.sounds = new Map();
        this.music = null;
        this.isInitialized = false;
        this.isMuted = false;
    }

    /**
     * Initialize audio system and load all sounds
     */
    async initialize() {
        try {
            // Define sound files with fallback formats
            const soundFiles = {
                click: ['sounds/click.mp3', 'sounds/click.ogg'],
                roundStart: ['sounds/round-start.mp3', 'sounds/round-start.ogg'],
                countdown: ['sounds/countdown.mp3', 'sounds/countdown.ogg'],
                scan: ['sounds/scan.mp3', 'sounds/scan.ogg'],
                point: ['sounds/point.mp3', 'sounds/point.ogg'],
                streak: ['sounds/streak.mp3', 'sounds/streak.ogg'],
                roundEnd: ['sounds/round-end.mp3', 'sounds/round-end.ogg'],
                gameOver: ['sounds/game-over.mp3', 'sounds/game-over.ogg'],
                error: ['sounds/error.mp3', 'sounds/error.ogg']
            };

            // Background music
            const musicFiles = ['sounds/background.mp3', 'sounds/background.ogg'];

            // Load all sounds
            for (const [name, sources] of Object.entries(soundFiles)) {
                const audio = new Audio();
                let loaded = false;

                for (const source of sources) {
                    try {
                        audio.src = source;
                        await this.preloadAudio(audio);
                        this.sounds.set(name, audio);
                        loaded = true;
                        break;
                    } catch (error) {
                        console.warn(`Failed to load sound ${name} from ${source}:`, error);
                    }
                }

                if (!loaded) {
                    console.warn(`Could not load sound: ${name}`);
                    // Create silent audio as fallback
                    const silentAudio = new Audio();
                    silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                    this.sounds.set(name, silentAudio);
                }
            }

            // Load background music
            this.music = new Audio();
            let musicLoaded = false;

            for (const source of musicFiles) {
                try {
                    this.music.src = source;
                    this.music.loop = true;
                    await this.preloadAudio(this.music);
                    musicLoaded = true;
                    break;
                } catch (error) {
                    console.warn(`Failed to load background music from ${source}:`, error);
                }
            }

            if (!musicLoaded) {
                console.warn('Could not load background music');
                // Create silent audio as fallback
                this.music = new Audio();
                this.music.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                this.music.loop = true;
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Audio initialization failed:', error);
            this.isInitialized = false;
            return false;
        }
    }

    preloadAudio(audio) {
        return new Promise((resolve, reject) => {
            audio.preload = 'auto';
            
            const loadHandler = () => {
                audio.removeEventListener('canplaythrough', loadHandler);
                audio.removeEventListener('error', errorHandler);
                resolve();
            };
            
            const errorHandler = (error) => {
                audio.removeEventListener('canplaythrough', loadHandler);
                audio.removeEventListener('error', errorHandler);
                reject(error);
            };

            audio.addEventListener('canplaythrough', loadHandler);
            audio.addEventListener('error', errorHandler);

            // Set a timeout for loading
            setTimeout(() => {
                audio.removeEventListener('canplaythrough', loadHandler);
                audio.removeEventListener('error', errorHandler);
                reject(new Error('Audio loading timeout'));
            }, 5000);

            // Start loading
            audio.load();
        });
    }

    /**
     * Play a sound effect
     * @param {string} name - Name of the sound to play
     * @param {Object} options - Optional parameters (volume, pitch, etc.)
     */
    playSound(name, options = {}) {
        if (!this.isInitialized || this.isMuted) return;

        const sound = this.sounds.get(name);
        if (!sound) {
            console.warn(`Sound not found: ${name}`);
            return;
        }

        try {
            // Create a new instance for overlapping sounds
            const soundInstance = new Audio(sound.src);
            soundInstance.volume = options.volume || 1;
            soundInstance.play().catch(error => {
                console.warn(`Error playing sound ${name}:`, error);
            });
        } catch (error) {
            console.warn(`Error playing sound ${name}:`, error);
        }
    }

    /**
     * Start playing background music
     */
    startMusic() {
        if (!this.isInitialized || this.isMuted || !this.music) return;
        
        this.music.volume = 0.3; // Lower volume for background music
        this.music.play().catch(error => {
            console.warn('Error playing background music:', error);
        });
    }

    /**
     * Stop background music
     */
    stopMusic() {
        if (this.music) {
            this.music.pause();
            this.music.currentTime = 0;
        }
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
        if (!this.isInitialized || this.isMuted) return;

        for (const item of sequence) {
            try {
                await new Promise(resolve => {
                    this.playSound(item.sound, item.options);
                    setTimeout(resolve, item.delay || 0);
                });
            } catch (error) {
                console.warn(`Error in sound sequence:`, error);
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
        this.isInitialized = false;
    }
} 