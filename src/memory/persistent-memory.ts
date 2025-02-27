import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { MemoryInterface, MemoryEntry } from './memory-interface';
import { Logger } from '../utils/logger';

/**
 * Configuration for persistent memory
 */
export interface PersistentMemoryConfig {
  storageDir: string;
  filename?: string;
  autoSave?: boolean;
  saveInterval?: number; // In milliseconds
}

/**
 * A memory implementation that persists memories to disk
 */
export class PersistentMemory implements MemoryInterface {
  private memories: MemoryEntry[] = [];
  private config: PersistentMemoryConfig;
  private filePath: string;
  private logger: Logger;
  private saveTimer?: NodeJS.Timeout;
  private dirty: boolean = false;
  
  /**
   * Creates a new persistent memory system
   * 
   * @param config - Configuration for the persistent memory
   */
  constructor(config: PersistentMemoryConfig) {
    this.config = {
      filename: 'memories.json',
      autoSave: true,
      saveInterval: 60000, // Default: every 60 seconds
      ...config
    };
    
    this.filePath = path.join(this.config.storageDir, this.config.filename!);
    this.logger = new Logger('PersistentMemory');
    
    // Create storage directory if it doesn't exist
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
      this.logger.debug('Created storage directory', { dir: this.config.storageDir });
    }
    
    // Load existing memories if they exist
    this.load();
    
    // Set up auto-save if enabled
    if (this.config.autoSave) {
      this.setupAutoSave();
    }
  }
  
  /**
   * Stores a memory and persists it to disk
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves when storage is complete
   */
  async store(memory: MemoryEntry): Promise<void> {
    // Generate an ID if not provided
    const entry: MemoryEntry = {
      ...memory,
      id: memory.id || uuidv4()
    };
    
    this.memories.push(entry);
    this.dirty = true;
    
    this.logger.debug('Stored memory', { id: entry.id });
    
    // Save immediately if auto-save is disabled
    if (!this.config.autoSave) {
      await this.save();
    }
  }
  
  /**
   * Retrieves memories relevant to a query
   * 
   * @param query - The query to find relevant memories for
   * @param limit - Optional limit on number of memories to retrieve (default: 5)
   * @returns Promise resolving to an array of memory content strings
   */
  async retrieve(query: string, limit: number = 5): Promise<string[]> {
    this.logger.debug('Retrieving memories for query', { query, limit });
    
    // Split query into keywords for simple matching
    const keywords = query.toLowerCase().split(/\s+/);
    
    // Score each memory based on keyword matches
    const scoredMemories = this.memories.map(memory => {
      const inputText = memory.input.toLowerCase();
      const outputText = memory.output.toLowerCase();
      
      // Count keyword occurrences in input and output
      let score = 0;
      for (const keyword of keywords) {
        const inputMatches = (inputText.match(new RegExp(keyword, 'g')) || []).length;
        const outputMatches = (outputText.match(new RegExp(keyword, 'g')) || []).length;
        
        score += inputMatches + outputMatches;
      }
      
      // Apply importance multiplier if set
      if (memory.importance !== undefined) {
        score *= memory.importance;
      }
      
      // Recent memories get a slight boost
      const recencyBoost = Math.max(0, 1 - (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24 * 7));
      score += recencyBoost;
      
      return { memory, score };
    });
    
    // Sort by score (descending) and take top results
    const topMemories = scoredMemories
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => `${item.memory.input}\n${item.memory.output}`);
    
    this.logger.debug('Retrieved memories', { count: topMemories.length });
    return topMemories;
  }
  
  /**
   * Get all stored memories
   * 
   * @returns Promise resolving to all memory entries
   */
  async getAll(): Promise<MemoryEntry[]> {
    return [...this.memories];
  }
  
  /**
   * Delete a specific memory by ID
   * 
   * @param id - ID of the memory to delete
   * @returns Promise resolving to true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    const initialLength = this.memories.length;
    this.memories = this.memories.filter(memory => memory.id !== id);
    
    const deleted = initialLength > this.memories.length;
    
    if (deleted) {
      this.dirty = true;
      this.logger.debug('Deleted memory', { id });
      
      // Save immediately if auto-save is disabled
      if (!this.config.autoSave) {
        await this.save();
      }
    }
    
    return deleted;
  }
  
  /**
   * Clear all memories
   * 
   * @returns Promise resolving when all memories are cleared
   */
  async clear(): Promise<void> {
    const count = this.memories.length;
    this.memories = [];
    this.dirty = true;
    
    this.logger.debug('Cleared all memories', { count });
    
    // Save immediately if auto-save is disabled
    if (!this.config.autoSave) {
      await this.save();
    }
  }
  
  /**
   * Loads memories from disk
   * 
   * @returns Boolean indicating if loading was successful
   */
  private load(): boolean {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        this.memories = JSON.parse(data);
        this.logger.info('Loaded memories from disk', { count: this.memories.length });
        return true;
      }
      
      this.logger.info('No memories file found, starting with empty memory');
      return false;
    } catch (error) {
      this.logger.error('Error loading memories from disk', error);
      return false;
    }
  }
  
  /**
   * Saves memories to disk
   * 
   * @returns Promise resolving when save is complete
   */
  async save(): Promise<void> {
    if (!this.dirty) {
      return;
    }
    
    try {
      const data = JSON.stringify(this.memories, null, 2);
      fs.writeFileSync(this.filePath, data, 'utf8');
      this.dirty = false;
      this.logger.debug('Saved memories to disk', { count: this.memories.length });
    } catch (error) {
      this.logger.error('Error saving memories to disk', error);
      throw error;
    }
  }
  
  /**
   * Sets up auto-save
   */
  private setupAutoSave(): void {
    this.saveTimer = setInterval(async () => {
      if (this.dirty) {
        await this.save();
      }
    }, this.config.saveInterval);
    
    this.logger.debug('Set up auto-save', { interval: this.config.saveInterval });
  }
  
  /**
   * Cleanup function to ensure memories are saved before shutdown
   */
  async cleanup(): Promise<void> {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    
    if (this.dirty) {
      await this.save();
    }
  }
}