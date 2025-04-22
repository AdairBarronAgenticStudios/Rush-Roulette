// Landing page functionality

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Landing page loaded');
    
    // Get DOM elements
    const startGameButton = document.getElementById('start-game');
    const playerNameInput = document.getElementById('player-name');
    
    // Initialize socket for session validation
    const socket = io();
    
    socket.on('connect', function() {
        console.log('Connected to server with ID:', socket.id);
    });
    
    socket.on('connect_error', function(error) {
        console.error('Connection error:', error);
        displayError('Cannot connect to server. Please try again later.');
    });
    
    // Handle start game button click
    startGameButton.addEventListener('click', function() {
        const playerName = playerNameInput.value.trim();
        
        // Validate player name
        if (!playerName) {
            displayError('Please enter your name');
            return;
        }
        
        if (playerName.length < 2 || playerName.length > 20) {
            displayError('Name must be between 2 and 20 characters');
            return;
        }
        
        // Store player name and redirect to game page
        sessionStorage.setItem('playerName', playerName);
        window.location.href = '/game.html';
    });
    
    // Support for enter key
    playerNameInput.addEventListener('keyup', function(event) {
        if (event.key === 'Enter') {
            startGameButton.click();
        }
    });
    
    // Auto-focus the player name input
    playerNameInput.focus();
    
    // Check if returning from game
    const gameMessage = sessionStorage.getItem('gameMessage');
    if (gameMessage) {
        displayError(gameMessage);
        sessionStorage.removeItem('gameMessage');
    }
    
    // Function to display errors
    function displayError(message) {
        let errorElement = document.getElementById('error-message');
        
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'error-message';
            errorElement.style.color = '#ff1744';
            errorElement.style.marginTop = '1rem';
            errorElement.style.textAlign = 'center';
            document.querySelector('.input-container').appendChild(errorElement);
        }
        
        errorElement.textContent = message;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorElement.textContent = '';
        }, 5000);
    }
}); 