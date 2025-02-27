/**
 * Enhanced memory interface for the Agentis framework
 * Provides short-term, long-term memory and notes functionality
 */

import { MemoryEntry } from './memory-interface';

/**
 * Represents a note that the agent can create and reference
 */
export interface AgentNote {
  id: string;
  title: string;
  content: string;
  tags: string[];
  importance: number; // 0-1 scale
  created: number;
  updated: number;
}

/**
 * Interface for short term memory entries
 * These are temporary and will expire after a certain amount of time
 */
export interface ShortTermMemory extends MemoryEntry {
  expiresAt: number; // Timestamp when this memory should expire
}

/**
 * Interface for long term memory entries
 * These are persistent and will not expire unless explicitly deleted
 */
export interface LongTermMemory extends MemoryEntry {
  lastAccessed?: number; // Last time this memory was retrieved
  accessCount?: number; // How many times this memory has been accessed
  importance?: number; // 0-1 scale of importance
  embedding?: number[]; // Vector embedding for semantic search
}

/**
 * Configuration for the enhanced memory system
 */
export interface EnhancedMemoryConfig {
  // General settings
  userId?: string; // Optional user identifier for multi-user systems
  namespace?: string; // Optional namespace for segmenting memory
  
  // Short-term memory settings
  shortTermTTL?: number; // Time-to-live for short-term memories in ms (default: 24 hours)
  shortTermCapacity?: number; // Maximum number of short-term memories to keep
  
  // Long-term memory settings
  longTermPruneThreshold?: number; // Number of memories that triggers pruning
  embeddingModel?: string; // Model to use for embeddings
  embeddingDimension?: number; // Dimension of embeddings
  
  // Storage settings
  vectorStoreName?: 'pinecone' | 'supabase'; // Which vector store to use
  vectorStoreConfig?: Record<string, any>; // Configuration for the vector store
  
  // Notes settings
  notesCapacity?: number; // Maximum number of notes to keep
}

/**
 * Results from memory retrieval
 */
export interface MemoryRetrievalResult {
  shortTerm: ShortTermMemory[];
  longTerm: LongTermMemory[];
  notes: AgentNote[];
  relevanceScores?: Record<string, number>; // Optional relevance scores for each memory
}

/**
 * Enhanced memory interface with short-term, long-term, and notes functionality
 */
export interface EnhancedMemoryInterface {
  /**
   * Initializes the memory system
   * 
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Stores a memory in short-term memory
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves to the stored memory ID
   */
  storeShortTerm(memory: Omit<ShortTermMemory, 'id' | 'expiresAt'>): Promise<string>;
  
  /**
   * Stores a memory in long-term memory
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves to the stored memory ID
   */
  storeLongTerm(memory: Omit<LongTermMemory, 'id' | 'embedding'>): Promise<string>;
  
  /**
   * Creates or updates a note
   * 
   * @param note - The note to create or update
   * @returns Promise that resolves to the note ID
   */
  saveNote(note: Omit<AgentNote, 'id' | 'created' | 'updated'>): Promise<string>;
  
  /**
   * Retrieves memories relevant to a query
   * 
   * @param query - The query to find relevant memories for
   * @param options - Optional retrieval options
   * @returns Promise resolving to retrieved memories
   */
  retrieve(query: string, options?: {
    shortTermLimit?: number;
    longTermLimit?: number;
    notesLimit?: number;
    minRelevance?: number;
    includeAll?: boolean;
  }): Promise<MemoryRetrievalResult>;
  
  /**
   * Gets a note by ID
   * 
   * @param id - The note ID
   * @returns Promise resolving to the note or undefined if not found
   */
  getNote(id: string): Promise<AgentNote | undefined>;
  
  /**
   * Gets all notes
   * 
   * @returns Promise resolving to all notes
   */
  getAllNotes(): Promise<AgentNote[]>;
  
  /**
   * Gets notes by tag
   * 
   * @param tag - The tag to filter by
   * @returns Promise resolving to notes with the specified tag
   */
  getNotesByTag(tag: string): Promise<AgentNote[]>;
  
  /**
   * Transfers short-term memories to long-term
   * (Usually called when memory meets certain criteria)
   * 
   * @param shortTermIds - IDs of short-term memories to transfer
   * @returns Promise resolving to the IDs of the new long-term memories
   */
  transferToLongTerm(shortTermIds: string[]): Promise<string[]>;
  
  /**
   * Prunes memories based on relevance, access time, etc.
   * 
   * @returns Promise resolving when pruning is complete
   */
  prune(): Promise<void>;
  
  /**
   * Clears all memories
   * 
   * @returns Promise resolving when all memories are cleared
   */
  clear(): Promise<void>;
}