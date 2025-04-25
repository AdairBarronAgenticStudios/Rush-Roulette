/**
 * Error Manager Utility
 * Handles error tracking, logging, and user feedback
 */

// Error categories
const ERROR_CATEGORIES = {
  CONNECTION: 'connection',
  GAME: 'game',
  MEDIA: 'media',
  VALIDATION: 'validation',
  INTERNAL: 'internal',
  UNKNOWN: 'unknown'
};

// Error severity levels
const ERROR_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

class ErrorManager {
  constructor() {
    this.errors = [];
    this.maxErrorsStored = 100;
    this.listeners = [];
    this.debugMode = process.env.NODE_ENV === 'development' || false;
  }

  /**
   * Log an error with metadata
   * @param {string} message - Error message
   * @param {Object} options - Error options
   * @param {string} options.category - Error category
   * @param {string} options.severity - Error severity
   * @param {Error} options.originalError - Original error object
   * @param {Object} options.context - Additional context info
   * @param {boolean} options.notify - Whether to notify listeners
   * @return {Object} The logged error object
   */
  logError(message, {
    category = ERROR_CATEGORIES.UNKNOWN,
    severity = ERROR_SEVERITY.ERROR,
    originalError = null,
    context = {},
    notify = true
  } = {}) {
    // Create error object
    const errorObject = {
      id: this._generateErrorId(),
      timestamp: new Date(),
      message,
      category,
      severity,
      context,
      stack: originalError?.stack || new Error().stack
    };

    // Add to errors array (and maintain max size)
    this.errors.push(errorObject);
    if (this.errors.length > this.maxErrorsStored) {
      this.errors.shift();
    }

    // Log to console in development mode
    if (this.debugMode) {
      this._debugLog(errorObject);
    }

    // Notify listeners if required
    if (notify) {
      this._notifyListeners(errorObject);
    }

    return errorObject;
  }

  /**
   * Subscribe to error notifications
   * @param {Function} callback - Function to call when an error occurs
   * @return {Function} Unsubscribe function
   */
  subscribe(callback) {
    if (typeof callback !== 'function') {
      this.logError('Invalid error listener callback', {
        category: ERROR_CATEGORIES.INTERNAL,
        severity: ERROR_SEVERITY.WARNING
      });
      return () => {};
    }

    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Get all errors or filter by category/severity
   * @param {Object} filters - Filter parameters
   * @param {string} filters.category - Filter by category
   * @param {string} filters.severity - Filter by minimum severity
   * @param {number} filters.limit - Limit number of errors returned
   * @return {Array} Filtered errors
   */
  getErrors({ category, severity, limit } = {}) {
    let result = [...this.errors];
    
    if (category) {
      result = result.filter(err => err.category === category);
    }
    
    if (severity) {
      const severityLevels = Object.values(ERROR_SEVERITY);
      const minSeverityIndex = severityLevels.indexOf(severity);
      if (minSeverityIndex >= 0) {
        result = result.filter(err => {
          const errSeverityIndex = severityLevels.indexOf(err.severity);
          return errSeverityIndex >= minSeverityIndex;
        });
      }
    }
    
    if (limit && limit > 0) {
      result = result.slice(-limit);
    }
    
    return result;
  }

  /**
   * Clear all stored errors
   */
  clearErrors() {
    this.errors = [];
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Whether debug mode should be enabled
   */
  setDebugMode(enabled) {
    this.debugMode = !!enabled;
  }

  /**
   * Helper to format user-friendly error messages
   * @param {Object} error - Error object
   * @return {string} User-friendly error message
   */
  getUserMessage(error) {
    // Default messages by category
    const defaultMessages = {
      [ERROR_CATEGORIES.CONNECTION]: 'Connection issue. Please check your internet.',
      [ERROR_CATEGORIES.GAME]: 'Game error. Please try again.',
      [ERROR_CATEGORIES.MEDIA]: 'Media error. Please check camera permissions.',
      [ERROR_CATEGORIES.VALIDATION]: 'Invalid input. Please check your entry.',
      [ERROR_CATEGORIES.INTERNAL]: 'System error. Please refresh the page.',
      [ERROR_CATEGORIES.UNKNOWN]: 'An error occurred. Please try again.'
    };

    if (!error) return defaultMessages[ERROR_CATEGORIES.UNKNOWN];
    
    // Use the error message if it's user-friendly, otherwise use the default
    return error.userMessage || error.message || defaultMessages[error.category] || defaultMessages[ERROR_CATEGORIES.UNKNOWN];
  }

  // Private methods
  
  /**
   * Generate a unique error ID
   * @private
   * @return {string} Unique error ID
   */
  _generateErrorId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  /**
   * Log error to console in debug mode
   * @private
   * @param {Object} error - Error object to log
   */
  _debugLog(error) {
    const { severity, category, message, context, stack } = error;
    
    console.group(`[${severity.toUpperCase()}] [${category}] ${message}`);
    if (Object.keys(context).length > 0) {
      console.log('Context:', context);
    }
    console.log('Stack:', stack);
    console.groupEnd();
  }

  /**
   * Notify all listeners of a new error
   * @private
   * @param {Object} error - Error object
   */
  _notifyListeners(error) {
    this.listeners.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        // Don't notify about this error to avoid infinite loops
        this.logError('Error in error listener callback', {
          category: ERROR_CATEGORIES.INTERNAL,
          severity: ERROR_SEVERITY.WARNING,
          originalError: err,
          notify: false
        });
      }
    });
  }
}

// Create singleton instance
const errorManager = new ErrorManager();

// Export constants and instance
export {
  errorManager,
  ERROR_CATEGORIES,
  ERROR_SEVERITY
}; 