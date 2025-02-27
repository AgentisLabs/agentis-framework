import { v4 as uuidv4 } from 'uuid';
import { MemoryInterface, MemoryEntry } from './memory-interface';
import { Logger } from '../utils/logger';

/**
 * Simple in-memory implementation of the MemoryInterface
 * Useful for development and testing
 */
export class InMemoryMemory implements MemoryInterface {
  private memories: MemoryEntry[] = [];
  private logger: Logger;
  
  /**
   * Creates a new in-memory memory system
   */
  constructor() {
    this.logger = new Logger('InMemoryMemory');
  }
  
  /**
   * Stores a memory entry
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
    this.logger.debug('Stored memory', { id: entry.id });
  }
  
  /**
   * Retrieves memories relevant to a query using simple keyword matching
   * More sophisticated implementations would use embeddings or other techniques
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
    this.logger.debug(deleted ? 'Deleted memory' : 'Memory not found', { id });
    
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
    this.logger.debug('Cleared all memories', { count });
  }
}