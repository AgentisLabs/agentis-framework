/**
 * Enhanced memory implementation for Agentis agents
 * Provides short-term, long-term memory and notes functionality
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { 
  EnhancedMemoryInterface, 
  EnhancedMemoryConfig, 
  ShortTermMemory, 
  LongTermMemory, 
  AgentNote,
  MemoryRetrievalResult
} from './enhanced-memory-interface';
import { EmbeddingService } from './embedding-service';
import { VectorStore } from './pinecone-store';
import fs from 'fs';
import path from 'path';

/**
 * Implementation of the enhanced memory system
 */
export class EnhancedMemory implements EnhancedMemoryInterface {
  private config: Required<EnhancedMemoryConfig>;
  private logger: Logger;
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  
  // In-memory storage for short-term memories
  private shortTermMemories: Map<string, ShortTermMemory> = new Map();
  
  // In-memory cache of recently accessed long-term memories
  private longTermCache: Map<string, LongTermMemory> = new Map();
  
  // In-memory storage for notes
  private notes: Map<string, AgentNote> = new Map();
  
  // Local file paths for persistence
  private shortTermPath: string;
  private notesPath: string;
  
  // Initialization state
  private initialized: boolean = false;
  
  /**
   * Creates a new enhanced memory system
   * 
   * @param vectorStore - Vector store for long-term memory
   * @param config - Configuration for the memory system
   */
  constructor(vectorStore: VectorStore, config?: Partial<EnhancedMemoryConfig>) {
    // Set default config values
    this.config = {
      userId: 'default',
      namespace: 'default',
      shortTermTTL: 24 * 60 * 60 * 1000, // 24 hours
      shortTermCapacity: 100,
      longTermPruneThreshold: 10000,
      embeddingModel: 'text-embedding-3-small',
      embeddingDimension: 1536,
      vectorStoreName: 'pinecone',
      vectorStoreConfig: {},
      notesCapacity: 1000,
      ...config
    } as Required<EnhancedMemoryConfig>;
    
    this.logger = new Logger('EnhancedMemory');
    this.vectorStore = vectorStore;
    
    // Initialize embedding service
    this.embeddingService = new EmbeddingService({
      model: this.config.embeddingModel,
      dimensions: this.config.embeddingDimension
    });
    
    // Set up file paths for persistence
    const dataDir = process.env.MEMORY_STORAGE_PATH || './data/memory';
    const agentDir = path.join(dataDir, this.config.userId, this.config.namespace || 'default');
    
    // Create directories if they don't exist
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    
    this.shortTermPath = path.join(agentDir, 'short-term.json');
    this.notesPath = path.join(agentDir, 'notes.json');
  }
  
  /**
   * Initializes the memory system
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    this.logger.debug('Initializing enhanced memory system');
    
    try {
      // Initialize vector store
      await this.vectorStore.initialize();
      
      // Load short-term memories and notes from disk if available
      await this.loadFromDisk();
      
      // Clean up expired short-term memories
      this.cleanupExpiredMemories();
      
      this.initialized = true;
      this.logger.info('Enhanced memory system initialized');
    } catch (error) {
      this.logger.error('Error initializing enhanced memory system', error);
      throw new Error(`Failed to initialize memory system: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Stores a memory in short-term memory
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves to the stored memory ID
   */
  async storeShortTerm(memory: Omit<ShortTermMemory, 'id' | 'expiresAt'>): Promise<string> {
    await this.ensureInitialized();
    
    // Generate ID and expiration time
    const id = uuidv4();
    const expiresAt = Date.now() + this.config.shortTermTTL;
    
    // Create the full memory object
    const shortTermMemory: ShortTermMemory = {
      ...memory,
      id,
      expiresAt
    };
    
    // Store in memory
    this.shortTermMemories.set(id, shortTermMemory);
    
    // Check if we need to prune
    if (this.shortTermMemories.size > this.config.shortTermCapacity) {
      this.pruneShortTerm();
    }
    
    // Persist to disk if enabled
    if (process.env.ENABLE_MEMORY_PERSISTENCE === 'true') {
      this.saveToDisk();
    }
    
    this.logger.debug('Stored short-term memory', { id });
    return id;
  }
  
  /**
   * Stores a memory in long-term memory
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves to the stored memory ID
   */
  async storeLongTerm(memory: Omit<LongTermMemory, 'id' | 'embedding'>): Promise<string> {
    await this.ensureInitialized();
    
    // Generate ID
    const id = uuidv4();
    
    // Combine input and output for embedding
    const textToEmbed = `${memory.input}\n${memory.output}`;
    
    // Generate embedding
    const embedding = await this.embeddingService.embedText(textToEmbed);
    
    // Create the full memory object
    const longTermMemory: LongTermMemory = {
      ...memory,
      id,
      lastAccessed: Date.now(),
      accessCount: 0,
      embedding
    };
    
    // Create a copy of the memory without the embedding for metadata
    const { embedding: _, ...memoryWithoutEmbedding } = longTermMemory;
    
    // Store in vector store
    const namespace = this.config.namespace || 'default';
    const longTermNamespace = `${namespace}_long_term`;
    await this.vectorStore.storeVector(
      id,
      embedding,
      memoryWithoutEmbedding,
      longTermNamespace
    );
    
    // Add to cache
    this.longTermCache.set(id, longTermMemory);
    
    this.logger.debug('Stored long-term memory', { id });
    return id;
  }
  
  /**
   * Creates or updates a note
   * 
   * @param note - The note to create or update
   * @returns Promise that resolves to the note ID
   */
  async saveNote(note: Omit<AgentNote, 'id' | 'created' | 'updated'>): Promise<string> {
    await this.ensureInitialized();
    
    // Generate ID
    const id = uuidv4();
    const now = Date.now();
    
    // Create the full note object
    const agentNote: AgentNote = {
      ...note,
      id,
      created: now,
      updated: now
    };
    
    // Store in memory
    this.notes.set(id, agentNote);
    
    // Check if we need to prune
    if (this.notes.size > this.config.notesCapacity) {
      this.pruneNotes();
    }
    
    // Persist to disk if enabled
    if (process.env.ENABLE_MEMORY_PERSISTENCE === 'true') {
      this.saveToDisk();
    }
    
    this.logger.debug('Saved note', { id, title: note.title });
    return id;
  }
  
  /**
   * Retrieves memories relevant to a query
   * 
   * @param query - The query to find relevant memories for
   * @param options - Optional retrieval options
   * @returns Promise resolving to retrieved memories
   */
  async retrieve(query: string, options?: {
    shortTermLimit?: number;
    longTermLimit?: number;
    notesLimit?: number;
    minRelevance?: number;
    includeAll?: boolean;
  }): Promise<MemoryRetrievalResult> {
    await this.ensureInitialized();
    
    const opts = {
      shortTermLimit: 5,
      longTermLimit: 10,
      notesLimit: 3,
      minRelevance: 0.7,
      includeAll: false,
      ...options
    };
    
    this.logger.debug('Retrieving memories', { query, options: opts });
    
    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.embedText(query);
    
    // Results object with initialized properties
    const scores: Record<string, number> = {};
    const result: MemoryRetrievalResult = {
      shortTerm: [],
      longTerm: [],
      notes: [],
      relevanceScores: scores
    };
    
    // Retrieve short-term memories (simple keyword matching)
    const shortTermResults = this.retrieveShortTerm(query, opts.shortTermLimit);
    result.shortTerm = shortTermResults.memories;
    
    // Update relevance scores
    Object.assign(scores, shortTermResults.scores);
    
    // Retrieve long-term memories (vector search)
    const longTermResults = await this.retrieveLongTerm(queryEmbedding, opts.longTermLimit, opts.minRelevance);
    result.longTerm = longTermResults.memories;
    
    // Update relevance scores
    Object.assign(scores, longTermResults.scores);
    
    // Retrieve notes (vector search for content + keyword matching for tags)
    const noteResults = await this.retrieveNotes(query, queryEmbedding, opts.notesLimit);
    result.notes = noteResults.notes;
    
    // Update relevance scores
    Object.assign(scores, noteResults.scores);
    
    this.logger.debug('Retrieved memories', { 
      shortTermCount: result.shortTerm.length,
      longTermCount: result.longTerm.length,
      notesCount: result.notes.length
    });
    
    return result;
  }
  
  /**
   * Gets a note by ID
   * 
   * @param id - The note ID
   * @returns Promise resolving to the note or undefined if not found
   */
  async getNote(id: string): Promise<AgentNote | undefined> {
    await this.ensureInitialized();
    return this.notes.get(id);
  }
  
  /**
   * Gets all notes
   * 
   * @returns Promise resolving to all notes
   */
  async getAllNotes(): Promise<AgentNote[]> {
    await this.ensureInitialized();
    return Array.from(this.notes.values());
  }
  
  /**
   * Gets notes by tag
   * 
   * @param tag - The tag to filter by
   * @returns Promise resolving to notes with the specified tag
   */
  async getNotesByTag(tag: string): Promise<AgentNote[]> {
    await this.ensureInitialized();
    
    const normalizedTag = tag.toLowerCase();
    
    return Array.from(this.notes.values())
      .filter(note => note.tags.some(t => t.toLowerCase() === normalizedTag));
  }
  
  /**
   * Transfers short-term memories to long-term
   * 
   * @param shortTermIds - IDs of short-term memories to transfer
   * @returns Promise resolving to the IDs of the new long-term memories
   */
  async transferToLongTerm(shortTermIds: string[]): Promise<string[]> {
    await this.ensureInitialized();
    
    const newLongTermIds: string[] = [];
    
    for (const shortTermId of shortTermIds) {
      const shortTermMemory = this.shortTermMemories.get(shortTermId);
      
      if (!shortTermMemory) {
        this.logger.warn('Short-term memory not found', { id: shortTermId });
        continue;
      }
      
      // Convert to long-term memory
      const { id, expiresAt, ...rest } = shortTermMemory;
      
      try {
        // Store in long-term memory
        const longTermId = await this.storeLongTerm(rest);
        newLongTermIds.push(longTermId);
        
        // Remove from short-term memory
        this.shortTermMemories.delete(shortTermId);
      } catch (error) {
        this.logger.error('Error transferring memory to long-term', { id: shortTermId, error });
      }
    }
    
    // Persist to disk if enabled
    if (process.env.ENABLE_MEMORY_PERSISTENCE === 'true') {
      this.saveToDisk();
    }
    
    this.logger.debug('Transferred memories to long-term', { 
      requested: shortTermIds.length, 
      transferred: newLongTermIds.length 
    });
    
    return newLongTermIds;
  }
  
  /**
   * Prunes memories based on relevance, access time, etc.
   * 
   * @returns Promise resolving when pruning is complete
   */
  async prune(): Promise<void> {
    await this.ensureInitialized();
    
    // Prune short-term memories
    this.pruneShortTerm();
    
    // Clear the long-term cache (will be repopulated as needed)
    this.longTermCache.clear();
    
    // Prune notes
    this.pruneNotes();
    
    this.logger.debug('Pruned memory system');
  }
  
  /**
   * Clears all memories
   * 
   * @returns Promise resolving when all memories are cleared
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();
    
    // Clear short-term memories
    this.shortTermMemories.clear();
    
    // Clear long-term memories (in vector store)
    const namespace = this.config.namespace || 'default';
    const longTermNamespace = `${namespace}_long_term`;
    await this.vectorStore.deleteNamespace(longTermNamespace);
    
    // Clear long-term cache
    this.longTermCache.clear();
    
    // Clear notes
    this.notes.clear();
    
    // Persist to disk if enabled
    if (process.env.ENABLE_MEMORY_PERSISTENCE === 'true') {
      this.saveToDisk();
    }
    
    this.logger.info('Cleared all memories');
  }
  
  /**
   * Ensures the memory system is initialized
   * 
   * @returns Promise that resolves when initialization is complete
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
  
  /**
   * Retrieves short-term memories based on keyword matching
   * 
   * @param query - The query to match against
   * @param limit - Maximum number of memories to retrieve
   * @returns Short-term memories and their relevance scores
   */
  private retrieveShortTerm(query: string, limit: number): {
    memories: ShortTermMemory[];
    scores: Record<string, number>;
  } {
    // Split query into keywords
    const keywords = query.toLowerCase().split(/\s+/);
    const scores: Record<string, number> = {};
    
    // Score each memory
    const scoredMemories = Array.from(this.shortTermMemories.values()).map(memory => {
      const inputText = memory.input.toLowerCase();
      const outputText = memory.output.toLowerCase();
      
      // Count keyword occurrences
      let score = 0;
      for (const keyword of keywords) {
        // Skip very short keywords
        if (keyword.length < 3) continue;
        
        // Escape special regex characters to avoid errors
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Check for matches in input and output
        const inputMatches = (inputText.match(new RegExp(escapedKeyword, 'g')) || []).length;
        const outputMatches = (outputText.match(new RegExp(escapedKeyword, 'g')) || []).length;
        
        score += inputMatches * 1.0 + outputMatches * 0.5;
      }
      
      // Apply recency boost (fresher memories score higher)
      const ageInHours = (Date.now() - memory.timestamp) / (1000 * 60 * 60);
      const recencyBoost = Math.max(0, 1 - (ageInHours / 24)); // Full boost if < 1hr, linear decay to 24hr
      
      // Final score is keyword matches + recency boost
      const finalScore = score > 0 ? score + recencyBoost : recencyBoost * 0.1;
      
      // Store the score
      if (memory.id) {
        scores[memory.id] = finalScore;
      }
      
      return { memory, score: finalScore };
    });
    
    // Sort by score and take top results
    const topMemories = scoredMemories
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => {
        // Update access stats
        const memory = item.memory;
        return memory;
      });
    
    return { memories: topMemories, scores };
  }
  
  /**
   * Retrieves long-term memories using vector search
   * 
   * @param queryEmbedding - Embedding of the query
   * @param limit - Maximum number of memories to retrieve
   * @param minRelevance - Minimum relevance score (0-1)
   * @returns Long-term memories and their relevance scores
   */
  private async retrieveLongTerm(
    queryEmbedding: number[],
    limit: number,
    minRelevance: number
  ): Promise<{
    memories: LongTermMemory[];
    scores: Record<string, number>;
  }> {
    // Search the vector store
    const namespace = this.config.namespace || 'default';
    const longTermNamespace = `${namespace}_long_term`;
    const searchResults = await this.vectorStore.searchVectors(
      queryEmbedding,
      limit * 2, // Get more than we need to apply the minimum relevance filter
      longTermNamespace
    );
    
    // Filter by minimum relevance and take top results
    const filteredResults = searchResults
      .filter(result => result.score >= minRelevance)
      .slice(0, limit);
    
    // Extract memories and scores
    const memories: LongTermMemory[] = [];
    const scores: Record<string, number> = {};
    
    for (const result of filteredResults) {
      const memory = result.data as LongTermMemory;
      
      // Update access stats
      memory.lastAccessed = Date.now();
      memory.accessCount = (memory.accessCount || 0) + 1;
      
      // Add to cache
      if (memory.id) {
        this.longTermCache.set(memory.id, memory);
      }
      
      // Add to results
      memories.push(memory);
      if (memory.id) {
        scores[memory.id] = result.score;
      }
    }
    
    return { memories, scores };
  }
  
  /**
   * Retrieves notes relevant to a query
   * 
   * @param query - Text query for keyword matching
   * @param queryEmbedding - Embedding for semantic matching
   * @param limit - Maximum number of notes to retrieve
   * @returns Notes and their relevance scores
   */
  private async retrieveNotes(
    query: string,
    queryEmbedding: number[],
    limit: number
  ): Promise<{
    notes: AgentNote[];
    scores: Record<string, number>;
  }> {
    const scores: Record<string, number> = {};
    const keywords = query.toLowerCase().split(/\s+/);
    
    // If no notes, return empty result
    if (this.notes.size === 0) {
      return { notes: [], scores: {} };
    }
    
    // Score all notes
    const scoredNotes = await Promise.all(
      Array.from(this.notes.values()).map(async note => {
        let score = 0;
        
        // 1. Score by keywords in title and content
        const titleMatches = this.countKeywordMatches(note.title, keywords);
        const contentMatches = this.countKeywordMatches(note.content, keywords);
        score += titleMatches * 2.0 + contentMatches * 0.5;
        
        // 2. Score by tags
        for (const tag of note.tags) {
          if (keywords.some(kw => tag.toLowerCase().includes(kw))) {
            score += 1.0;
          }
        }
        
        // 3. Score by importance
        score *= (1.0 + note.importance);
        
        // 4. Use embedding similarity if score is low
        if (score < 1.0) {
          // Generate embedding for note content (if not already cached)
          const noteEmbedding = await this.embeddingService.embedText(note.title + "\n" + note.content);
          
          // Calculate similarity
          const similarity = this.embeddingService.calculateSimilarity(queryEmbedding, noteEmbedding);
          score += similarity * 2.0;
        }
        
        // Store the score
        if (note.id) {
          scores[note.id] = score;
        }
        
        return { note, score };
      })
    );
    
    // Sort by score and take top results
    const topNotes = scoredNotes
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.note);
    
    return { notes: topNotes, scores };
  }
  
  /**
   * Counts keyword matches in text
   * 
   * @param text - Text to search
   * @param keywords - Keywords to match
   * @returns Number of matches
   */
  private countKeywordMatches(text: string | undefined, keywords: string[]): number {
    if (!text) return 0;
    
    const normalizedText = text.toLowerCase();
    let matches = 0;
    
    for (const keyword of keywords) {
      // Skip very short keywords
      if (keyword.length < 3) continue;
      
      // Escape special regex characters to avoid errors
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Count matches
      const regex = new RegExp(escapedKeyword, 'g');
      const count = (normalizedText.match(regex) || []).length;
      matches += count;
    }
    
    return matches;
  }
  
  /**
   * Prunes short-term memories
   * Removes expired memories and oldest memories if over capacity
   */
  private pruneShortTerm(): void {
    const now = Date.now();
    let removed = 0;
    
    // Remove expired memories
    for (const [id, memory] of this.shortTermMemories.entries()) {
      if (memory.expiresAt <= now) {
        this.shortTermMemories.delete(id);
        removed++;
      }
    }
    
    // If still over capacity, remove oldest memories
    if (this.shortTermMemories.size > this.config.shortTermCapacity) {
      const sortedMemories = Array.from(this.shortTermMemories.values())
        .sort((a, b) => a.timestamp - b.timestamp);
      
      const excessCount = this.shortTermMemories.size - this.config.shortTermCapacity;
      
      for (let i = 0; i < excessCount; i++) {
        const memory = sortedMemories[i];
        if (memory && memory.id) {
          this.shortTermMemories.delete(memory.id);
          removed++;
        }
      }
    }
    
    if (removed > 0) {
      this.logger.debug('Pruned short-term memories', { removed });
      
      // Persist to disk if enabled
      if (process.env.ENABLE_MEMORY_PERSISTENCE === 'true') {
        this.saveToDisk();
      }
    }
  }
  
  /**
   * Prunes notes
   * Removes least important notes if over capacity
   */
  private pruneNotes(): void {
    if (this.notes.size <= this.config.notesCapacity) {
      return;
    }
    
    // Sort notes by importance (ascending)
    const sortedNotes = Array.from(this.notes.values())
      .sort((a, b) => a.importance - b.importance);
    
    const excessCount = this.notes.size - this.config.notesCapacity;
    
    // Remove least important notes
    for (let i = 0; i < excessCount; i++) {
      if (sortedNotes[i] && sortedNotes[i].id) {
        this.notes.delete(sortedNotes[i].id);
      }
    }
    
    this.logger.debug('Pruned notes', { removed: excessCount });
    
    // Persist to disk if enabled
    if (process.env.ENABLE_MEMORY_PERSISTENCE === 'true') {
      this.saveToDisk();
    }
  }
  
  /**
   * Loads short-term memories and notes from disk
   */
  private async loadFromDisk(): Promise<void> {
    if (process.env.ENABLE_MEMORY_PERSISTENCE !== 'true') {
      return;
    }
    
    try {
      // Load short-term memories
      if (fs.existsSync(this.shortTermPath)) {
        const shortTermData = fs.readFileSync(this.shortTermPath, 'utf8');
        const shortTermArray = JSON.parse(shortTermData) as ShortTermMemory[];
        
        for (const memory of shortTermArray) {
          if (memory && memory.id) {
            this.shortTermMemories.set(memory.id, memory);
          }
        }
        
        this.logger.debug('Loaded short-term memories from disk', { count: shortTermArray.length });
      }
      
      // Load notes
      if (fs.existsSync(this.notesPath)) {
        const notesData = fs.readFileSync(this.notesPath, 'utf8');
        const notesArray = JSON.parse(notesData) as AgentNote[];
        
        for (const note of notesArray) {
          if (note && note.id) {
            this.notes.set(note.id, note);
          }
        }
        
        this.logger.debug('Loaded notes from disk', { count: notesArray.length });
      }
    } catch (error) {
      this.logger.error('Error loading memories from disk', error);
    }
  }
  
  /**
   * Saves short-term memories and notes to disk
   */
  private saveToDisk(): void {
    if (process.env.ENABLE_MEMORY_PERSISTENCE !== 'true') {
      return;
    }
    
    try {
      // Save short-term memories
      const shortTermArray = Array.from(this.shortTermMemories.values());
      fs.writeFileSync(this.shortTermPath, JSON.stringify(shortTermArray, null, 2));
      
      // Save notes
      const notesArray = Array.from(this.notes.values());
      fs.writeFileSync(this.notesPath, JSON.stringify(notesArray, null, 2));
      
      this.logger.debug('Saved memories to disk');
    } catch (error) {
      this.logger.error('Error saving memories to disk', error);
    }
  }
  
  /**
   * Cleans up expired short-term memories
   */
  private cleanupExpiredMemories(): void {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [id, memory] of this.shortTermMemories.entries()) {
      if (memory.expiresAt <= now) {
        this.shortTermMemories.delete(id);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      this.logger.debug('Cleaned up expired memories', { count: expiredCount });
    }
  }
}