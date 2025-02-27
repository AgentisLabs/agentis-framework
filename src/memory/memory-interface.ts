/**
 * Interface for memory systems that agents can use to store and retrieve information
 */
export interface MemoryInterface {
  /**
   * Stores a memory entry
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves when storage is complete
   */
  store(memory: MemoryEntry): Promise<void>;
  
  /**
   * Retrieves memories relevant to a query
   * 
   * @param query - The query to find relevant memories for
   * @param limit - Optional limit on number of memories to retrieve
   * @returns Promise resolving to an array of memory content strings
   */
  retrieve(query: string, limit?: number): Promise<string[]>;
  
  /**
   * Get all stored memories
   * 
   * @returns Promise resolving to all memory entries
   */
  getAll(): Promise<MemoryEntry[]>;
  
  /**
   * Delete a specific memory by ID
   * 
   * @param id - ID of the memory to delete
   * @returns Promise resolving to true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;
  
  /**
   * Clear all memories
   * 
   * @returns Promise resolving when all memories are cleared
   */
  clear(): Promise<void>;
}

/**
 * Structure for a memory entry
 */
export interface MemoryEntry {
  id?: string;            // Optional ID, will be generated if not provided
  input: string;          // Input that generated this memory
  output: string;         // Response or output related to the input
  importance?: number;    // Optional importance score (0-1)
  metadata?: {            // Optional metadata
    source?: string;      // Where this memory came from
    category?: string;    // Category/tag for the memory
    [key: string]: any;   // Additional custom metadata
  };
  timestamp: number;      // When this memory was created
}