/**
 * Volume Control Component
 * Manages audio settings UI for Rush Roulette
 */

class VolumeControl {
    constructor(audioManager) {
        this.audioManager = audioManager;
        this.container = null;
        this.volumeSlider = null;
        this.muteButton = null;
    }

    /**
     * Create and initialize the volume control UI
     * @returns {HTMLElement} The volume control container
     */
    create() {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'volume-control';
        
        // Create mute button
        this.muteButton = document.createElement('button');
        this.muteButton.className = 'mute-button';
        this.muteButton.innerHTML = '🔊';
        this.muteButton.addEventListener('click', () => this.toggleMute());
        
        // Create volume slider
        this.volumeSlider = document.createElement('input');
        this.volumeSlider.type = 'range';
        this.volumeSlider.min = '0';
        this.volumeSlider.max = '100';
        this.volumeSlider.value = this.audioManager.volume * 100;
        this.volumeSlider.className = 'volume-slider';
        this.volumeSlider.addEventListener('input', (e) => this.updateVolume(e.target.value));
        
        // Add tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'volume-tooltip';
        tooltip.textContent = 'Volume';
        
        // Assemble components
        this.container.appendChild(this.muteButton);
        this.container.appendChild(this.volumeSlider);
        this.container.appendChild(tooltip);
        
        return this.container;
    }

    /**
     * Toggle mute state
     */
    toggleMute() {
        const isMuted = this.audioManager.toggleMute();
        this.muteButton.innerHTML = isMuted ? '🔇' : '🔊';
        this.volumeSlider.disabled = isMuted;
        
        // Play click sound if unmuting
        if (!isMuted) {
            this.audioManager.playSound('click');
        }
    }

    /**
     * Update volume level
     * @param {number} value - Volume level (0-100)
     */
    updateVolume(value) {
        const level = value / 100;
        this.audioManager.setVolume(level);
        
        // Update mute button icon based on volume
        if (level === 0) {
            this.muteButton.innerHTML = '🔇';
        } else if (level < 0.5) {
            this.muteButton.innerHTML = '🔉';
        } else {
            this.muteButton.innerHTML = '🔊';
        }
        
        // Play tick sound for feedback
        if (level > 0) {
            this.audioManager.playSound('click', { volume: level });
        }
    }

    /**
     * Show the volume control
     */
    show() {
        if (this.container) {
            this.container.classList.add('visible');
        }
    }

    /**
     * Hide the volume control
     */
    hide() {
        if (this.container) {
            this.container.classList.remove('visible');
        }
    }
}

export default VolumeControl; 