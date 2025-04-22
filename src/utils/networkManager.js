/**
 * Network Manager Utility
 * Handles socket connections with enhanced retry logic and error handling
 */

import io from 'socket.io-client';
import { errorManager, ERROR_CATEGORIES, ERROR_SEVERITY } from './errorManager';

// Default configuration
const DEFAULT_CONFIG = {
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 10000,
  autoConnect: false,
  forceNew: true
};

class NetworkManager {
  constructor() {
    this.socket = null;
    this.config = { ...DEFAULT_CONFIG };
    this.isConnecting = false;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.eventHandlers = new Map();
    this.connectionTimeout = null;
    this.pendingEvents = [];
  }

  /**
   * Configure the network manager
   * @param {Object} config - Configuration options
   */
  configure(config = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config
    };
  }

  /**
   * Connect to the server
   * @param {string} url - Server URL to connect to
   * @param {Object} options - Socket.io options
   * @return {Promise} Promise that resolves when connected
   */
  connect(url, options = {}) {
    if (this.isConnected) {
      return Promise.resolve(this.socket);
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        this.pendingEvents.push({
          type: 'connect',
          resolve,
          reject
        });
      });
    }

    this.isConnecting = true;
    this.connectionAttempts = 0;
    
    return new Promise((resolve, reject) => {
      const attemptConnection = () => {
        this.connectionAttempts++;
        
        // Clean up previous socket if exists
        if (this.socket) {
          this.socket.removeAllListeners();
          this.socket.close();
        }

        // Create new socket
        this.socket = io(url, {
          ...this.config,
          ...options
        });

        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          const timeoutError = new Error('Connection timeout');
          errorManager.logError('Connection timeout', {
            category: ERROR_CATEGORIES.CONNECTION,
            severity: ERROR_SEVERITY.ERROR,
            context: { url, attempts: this.connectionAttempts }
          });
          
          this.socket.close();
          
          if (this.connectionAttempts < this.config.reconnectionAttempts) {
            setTimeout(attemptConnection, this.config.reconnectionDelay);
          } else {
            this.isConnecting = false;
            reject(timeoutError);
            this._rejectPendingEvents('connect', timeoutError);
          }
        }, this.config.timeout);

        // Setup core event handlers
        this.socket.on('connect', () => {
          clearTimeout(this.connectionTimeout);
          this.isConnected = true;
          this.isConnecting = false;
          
          errorManager.logError('Socket connected successfully', {
            category: ERROR_CATEGORIES.CONNECTION,
            severity: ERROR_SEVERITY.INFO,
            context: { url, attempts: this.connectionAttempts }
          });
          
          // Restore event handlers
          this._restoreEventHandlers();
          
          resolve(this.socket);
          this._resolvePendingEvents('connect', this.socket);
        });

        this.socket.on('connect_error', (err) => {
          clearTimeout(this.connectionTimeout);
          
          errorManager.logError('Socket connection error', {
            category: ERROR_CATEGORIES.CONNECTION,
            severity: ERROR_SEVERITY.ERROR,
            originalError: err,
            context: { url, attempts: this.connectionAttempts }
          });
          
          if (this.connectionAttempts < this.config.reconnectionAttempts) {
            setTimeout(attemptConnection, this.config.reconnectionDelay);
          } else {
            this.isConnecting = false;
            reject(err);
            this._rejectPendingEvents('connect', err);
          }
        });

        this.socket.on('disconnect', (reason) => {
          this.isConnected = false;
          
          errorManager.logError(`Socket disconnected: ${reason}`, {
            category: ERROR_CATEGORIES.CONNECTION,
            severity: reason === 'io client disconnect' ? ERROR_SEVERITY.INFO : ERROR_SEVERITY.WARNING,
            context: { reason }
          });
          
          // Attempt to reconnect if not intentional
          if (
            reason === 'transport close' || 
            reason === 'transport error' || 
            reason === 'ping timeout'
          ) {
            this.reconnect();
          }
        });

        this.socket.on('error', (err) => {
          errorManager.logError('Socket error', {
            category: ERROR_CATEGORIES.CONNECTION,
            severity: ERROR_SEVERITY.ERROR,
            originalError: err
          });
        });

        // Connect the socket
        this.socket.connect();
      };

      attemptConnection();
    });
  }

  /**
   * Reconnect to the server
   * @return {Promise} Promise that resolves when reconnected
   */
  reconnect() {
    if (this.isConnected) {
      return Promise.resolve(this.socket);
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        this.pendingEvents.push({
          type: 'connect',
          resolve,
          reject
        });
      });
    }

    this.isConnecting = true;
    this.connectionAttempts = 0;
    
    return new Promise((resolve, reject) => {
      const attemptReconnection = () => {
        this.connectionAttempts++;
        
        errorManager.logError(`Reconnection attempt ${this.connectionAttempts}`, {
          category: ERROR_CATEGORIES.CONNECTION,
          severity: ERROR_SEVERITY.INFO
        });
        
        this.socket.connect();
        
        // Set connection timeout
        this.connectionTimeout = setTimeout(() => {
          if (this.connectionAttempts < this.config.reconnectionAttempts) {
            setTimeout(attemptReconnection, this.config.reconnectionDelay);
          } else {
            this.isConnecting = false;
            const timeoutError = new Error('Reconnection timeout');
            reject(timeoutError);
            this._rejectPendingEvents('connect', timeoutError);
          }
        }, this.config.timeout);
      };
      
      this.socket.once('connect', () => {
        clearTimeout(this.connectionTimeout);
        this.isConnected = true;
        this.isConnecting = false;
        resolve(this.socket);
        this._resolvePendingEvents('connect', this.socket);
      });
      
      attemptReconnection();
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  /**
   * Register an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   * @return {Function} Function to remove the handler
   */
  on(event, callback) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    
    this.eventHandlers.get(event).push(callback);
    
    if (this.socket) {
      this.socket.on(event, callback);
    }
    
    return () => this.off(event, callback);
  }

  /**
   * Remove an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   */
  off(event, callback) {
    if (!this.eventHandlers.has(event)) {
      return;
    }
    
    if (callback) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(callback);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
      
      if (this.socket) {
        this.socket.off(event, callback);
      }
    } else {
      this.eventHandlers.delete(event);
      
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  /**
   * Emit an event to the server
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @param {Function} callback - Acknowledgement callback
   * @return {Promise} Promise that resolves with the acknowledgement
   */
  emit(event, data, options = {}) {
    const { timeout = 5000, expectResponse = false } = options;
    
    if (!this.isConnected) {
      const error = new Error('Socket not connected');
      errorManager.logError('Emit failed: socket not connected', {
        category: ERROR_CATEGORIES.CONNECTION,
        severity: ERROR_SEVERITY.WARNING,
        context: { event, data }
      });
      
      if (expectResponse) {
        return Promise.reject(error);
      }
      
      return;
    }
    
    if (!expectResponse) {
      this.socket.emit(event, data);
      return;
    }
    
    return new Promise((resolve, reject) => {
      let timeoutId;
      
      // Set timeout for response
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          const timeoutError = new Error(`Emit timeout for event: ${event}`);
          errorManager.logError('Emit timeout', {
            category: ERROR_CATEGORIES.CONNECTION,
            severity: ERROR_SEVERITY.WARNING,
            context: { event, data, timeout }
          });
          reject(timeoutError);
        }, timeout);
      }
      
      // Send with acknowledgement
      this.socket.emit(event, data, (response) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        if (response && response.error) {
          const responseError = new Error(response.message || 'Server error');
          responseError.details = response;
          errorManager.logError('Server error response', {
            category: ERROR_CATEGORIES.GAME,
            severity: ERROR_SEVERITY.WARNING,
            context: { event, response }
          });
          reject(responseError);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Check if connected to the server
   * @return {boolean} True if connected
   */
  isSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }

  /**
   * Get connection status information
   * @return {Object} Connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      connectionAttempts: this.connectionAttempts,
      maxAttempts: this.config.reconnectionAttempts
    };
  }

  // Private methods
  
  /**
   * Restore event handlers after reconnection
   * @private
   */
  _restoreEventHandlers() {
    for (const [event, handlers] of this.eventHandlers.entries()) {
      for (const handler of handlers) {
        this.socket.on(event, handler);
      }
    }
  }

  /**
   * Resolve pending events of a specific type
   * @private
   * @param {string} type - Event type
   * @param {*} value - Value to resolve with
   */
  _resolvePendingEvents(type, value) {
    const remaining = [];
    
    for (const event of this.pendingEvents) {
      if (event.type === type) {
        event.resolve(value);
      } else {
        remaining.push(event);
      }
    }
    
    this.pendingEvents = remaining;
  }

  /**
   * Reject pending events of a specific type
   * @private
   * @param {string} type - Event type
   * @param {Error} error - Error to reject with
   */
  _rejectPendingEvents(type, error) {
    const remaining = [];
    
    for (const event of this.pendingEvents) {
      if (event.type === type) {
        event.reject(error);
      } else {
        remaining.push(event);
      }
    }
    
    this.pendingEvents = remaining;
  }
}

// Create singleton instance
const networkManager = new NetworkManager();

export default networkManager; 