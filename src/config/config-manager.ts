import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Logger } from '../utils/logger';

/**
 * Configuration manager for the Agentis framework
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Record<string, any> = {};
  private logger: Logger;
  
  /**
   * Private constructor (use getInstance() instead)
   */
  private constructor() {
    this.logger = new Logger('ConfigManager');
    this.loadEnvironmentVariables();
  }
  
  /**
   * Gets the singleton instance of the config manager
   * 
   * @returns The config manager instance
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  /**
   * Gets a configuration value
   * 
   * @param key - The key to get
   * @param defaultValue - Default value if not found
   * @returns The configuration value, or defaultValue if not found
   */
  get<T>(key: string, defaultValue?: T): T {
    const value = this.config[key] !== undefined ? this.config[key] : process.env[key];
    
    if (value === undefined && defaultValue === undefined) {
      this.logger.warn(`Configuration key "${key}" not found and no default provided`);
    }
    
    return (value !== undefined ? value : defaultValue) as T;
  }
  
  /**
   * Sets a configuration value
   * 
   * @param key - The key to set
   * @param value - The value to set
   */
  set(key: string, value: any): void {
    this.config[key] = value;
  }
  
  /**
   * Checks if a configuration value exists
   * 
   * @param key - The key to check
   * @returns Boolean indicating if the key exists
   */
  has(key: string): boolean {
    return this.config[key] !== undefined || process.env[key] !== undefined;
  }
  
  /**
   * Gets all configuration values
   * 
   * @returns All configuration values
   */
  getAll(): Record<string, any> {
    // Combine config and environment variables
    return {
      ...process.env,
      ...this.config
    };
  }
  
  /**
   * Loads configuration from a file
   * 
   * @param filePath - Path to the configuration file
   * @returns Boolean indicating if loading was successful
   */
  loadFromFile(filePath: string): boolean {
    try {
      const fullPath = path.resolve(filePath);
      
      if (!fs.existsSync(fullPath)) {
        this.logger.warn(`Configuration file not found: ${fullPath}`);
        return false;
      }
      
      const fileContent = fs.readFileSync(fullPath, 'utf8');
      const fileExtension = path.extname(fullPath).toLowerCase();
      
      let loadedConfig: Record<string, any> = {};
      
      if (fileExtension === '.json') {
        loadedConfig = JSON.parse(fileContent);
      } else if (fileExtension === '.js') {
        // For .js files, require them (they should export an object)
        loadedConfig = require(fullPath);
      } else {
        this.logger.warn(`Unsupported configuration file type: ${fileExtension}`);
        return false;
      }
      
      // Merge with existing config
      this.config = {
        ...this.config,
        ...loadedConfig
      };
      
      this.logger.info(`Loaded configuration from ${fullPath}`);
      return true;
    } catch (error) {
      this.logger.error(`Error loading configuration from ${filePath}`, error);
      return false;
    }
  }
  
  /**
   * Loads environment variables from .env file
   */
  private loadEnvironmentVariables(): void {
    const result = dotenv.config();
    
    if (result.error) {
      this.logger.warn('Error loading .env file', result.error);
    } else {
      this.logger.debug('Loaded environment variables from .env file');
    }
  }
}