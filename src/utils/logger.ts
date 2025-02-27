/**
 * Logger utility for the Agentis framework
 */

// Log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

// Convert string log level to enum
const getLevelFromString = (level?: string): LogLevel => {
  if (!level) return LogLevel.INFO;
  
  switch (level.toLowerCase()) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    default: return LogLevel.INFO;
  }
};

// Get configured log level from environment or default to INFO
const CURRENT_LOG_LEVEL = getLevelFromString(process.env.LOG_LEVEL);

/**
 * Logger class with namespacing and log levels
 */
export class Logger {
  private namespace: string;
  
  /**
   * Creates a new logger instance with a specific namespace
   * 
   * @param namespace - The logger namespace (typically component name)
   */
  constructor(namespace: string) {
    this.namespace = namespace;
  }
  
  /**
   * Logs a debug message (only if LOG_LEVEL is set to "debug")
   * 
   * @param message - The message to log
   * @param data - Optional data to include
   */
  debug(message: string, data?: any): void {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG) {
      console.debug(`[${this.getTimestamp()}] [${this.namespace}] [DEBUG] ${message}`, data || '');
    }
  }
  
  /**
   * Logs an info message
   * 
   * @param message - The message to log 
   * @param data - Optional data to include
   */
  info(message: string, data?: any): void {
    if (CURRENT_LOG_LEVEL <= LogLevel.INFO) {
      console.info(`[${this.getTimestamp()}] [${this.namespace}] [INFO] ${message}`, data || '');
    }
  }
  
  /**
   * Logs a warning message
   * 
   * @param message - The message to log
   * @param data - Optional data to include
   */
  warn(message: string, data?: any): void {
    if (CURRENT_LOG_LEVEL <= LogLevel.WARN) {
      console.warn(`[${this.getTimestamp()}] [${this.namespace}] [WARN] ${message}`, data || '');
    }
  }
  
  /**
   * Logs an error message
   * 
   * @param message - The message to log
   * @param error - Optional error to include
   */
  error(message: string, error?: any): void {
    if (CURRENT_LOG_LEVEL <= LogLevel.ERROR) {
      console.error(`[${this.getTimestamp()}] [${this.namespace}] [ERROR] ${message}`, error || '');
    }
  }
  
  /**
   * Gets the current timestamp in ISO format
   * 
   * @returns Formatted timestamp string
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }
}