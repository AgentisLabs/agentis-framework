/**
 * Vector memory implementation
 * 
 * Note: This is a placeholder implementation. In a real application, 
 * you would integrate with a vector database like Pinecone, Weaviate, 
 * or use a local vector store.
 */

import { v4 as uuidv4 } from 'uuid';
import { MemoryInterface, MemoryEntry } from './memory-interface';
import { Logger } from '../utils/logger';

/**
 * Interface for a vector database service
 */
interface VectorDBService {
  // Store a vector with its data
  storeVector(id: string, vector: number[], data: any): Promise<void>;
  
  // Search for similar vectors
  searchVectors(vector: number[], limit: number): Promise<Array<{
    id: string;
    score: number;
    data: any;
  }>>;
  
  // Delete a vector
  deleteVector(id: string): Promise<boolean>;
  
  // Clear all vectors
  clearVectors(): Promise<void>;
}

/**
 * Mock vector database service for demonstration
 */
class MockVectorDBService implements VectorDBService {
  private vectors: Array<{
    id: string;
    vector: number[];
    data: any;
  }> = [];
  
  async storeVector(id: string, vector: number[], data: any): Promise<void> {
    this.vectors.push({ id, vector, data });
  }
  
  async searchVectors(queryVector: number[], limit: number): Promise<Array<{
    id: string;
    score: number;
    data: any;
  }>> {
    // Calculate cosine similarity between vectors
    const results = this.vectors.map(item => {
      const similarity = this.cosineSimilarity(queryVector, item.vector);
      return {
        id: item.id,
        score: similarity,
        data: item.data
      };
    });
    
    // Sort by similarity (descending) and take the top N
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  
  async deleteVector(id: string): Promise<boolean> {
    const initialLength = this.vectors.length;
    this.vectors = this.vectors.filter(item => item.id !== id);
    return initialLength > this.vectors.length;
  }
  
  async clearVectors(): Promise<void> {
    this.vectors = [];
  }
  
  // Helper: Calculate cosine similarity between two vectors
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

/**
 * Simple mock for text-to-vector embedding service
 */
class MockEmbeddingService {
  // Mock function to convert text to a vector
  async textToVector(text: string): Promise<number[]> {
    // In a real application, you would call an embedding API
    // like OpenAI's text-embedding-ada-002 or similar
    
    // For demo purposes, create a random vector
    // Real embeddings typically have 1024-4096 dimensions
    const dimensions = 128;
    const vector = Array(dimensions).fill(0)
      .map(() => Math.random() * 2 - 1); // Random values between -1 and 1
    
    // Normalize the vector
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return vector.map(val => val / norm);
  }
}

/**
 * Configuration for vector memory
 */
export interface VectorMemoryConfig {
  vectorService?: VectorDBService;
  embeddingService?: MockEmbeddingService;
}

/**
 * Vector-based memory implementation
 * Uses embeddings to find semantically similar memories
 */
export class VectorMemory implements MemoryInterface {
  private vectorDB: VectorDBService;
  private embeddingService: MockEmbeddingService;
  private logger: Logger;
  
  /**
   * Creates a new vector memory system
   * 
   * @param config - Configuration for the vector memory
   */
  constructor(config?: VectorMemoryConfig) {
    this.vectorDB = config?.vectorService || new MockVectorDBService();
    this.embeddingService = config?.embeddingService || new MockEmbeddingService();
    this.logger = new Logger('VectorMemory');
  }
  
  /**
   * Stores a memory entry
   * 
   * @param memory - The memory to store
   * @returns Promise that resolves when storage is complete
   */
  async store(memory: MemoryEntry): Promise<void> {
    // Generate an ID if not provided
    const id = memory.id || uuidv4();
    
    // Combine input and output for embedding
    const textToEmbed = `${memory.input}\n${memory.output}`;
    
    try {
      // Convert text to vector
      const vector = await this.embeddingService.textToVector(textToEmbed);
      
      // Store in vector database
      await this.vectorDB.storeVector(id, vector, {
        ...memory,
        id
      });
      
      this.logger.debug('Stored memory in vector DB', { id });
    } catch (error) {
      this.logger.error('Error storing memory in vector DB', error);
      throw error;
    }
  }
  
  /**
   * Retrieves memories relevant to a query using vector similarity
   * 
   * @param query - The query to find relevant memories for
   * @param limit - Optional limit on number of memories to retrieve (default: 5)
   * @returns Promise resolving to an array of memory content strings
   */
  async retrieve(query: string, limit: number = 5): Promise<string[]> {
    this.logger.debug('Retrieving memories for query', { query, limit });
    
    try {
      // Convert query to vector
      const queryVector = await this.embeddingService.textToVector(query);
      
      // Search for similar vectors
      const results = await this.vectorDB.searchVectors(queryVector, limit);
      
      // Format results
      return results.map(result => {
        const memory = result.data as MemoryEntry;
        return `${memory.input}\n${memory.output}`;
      });
    } catch (error) {
      this.logger.error('Error retrieving memories from vector DB', error);
      return [];
    }
  }
  
  /**
   * Get all stored memories
   * Note: This is inefficient with large vector DBs
   * 
   * @returns Promise resolving to all memory entries
   */
  async getAll(): Promise<MemoryEntry[]> {
    // In a real implementation, this would be more complex and paginated
    try {
      // Search with a generic vector and high limit
      const genericVector = Array(128).fill(0);
      const results = await this.vectorDB.searchVectors(genericVector, 1000);
      
      return results.map(result => result.data as MemoryEntry);
    } catch (error) {
      this.logger.error('Error getting all memories from vector DB', error);
      return [];
    }
  }
  
  /**
   * Delete a specific memory by ID
   * 
   * @param id - ID of the memory to delete
   * @returns Promise resolving to true if deleted, false if not found
   */
  async delete(id: string): Promise<boolean> {
    try {
      const deleted = await this.vectorDB.deleteVector(id);
      if (deleted) {
        this.logger.debug('Deleted memory from vector DB', { id });
      }
      return deleted;
    } catch (error) {
      this.logger.error('Error deleting memory from vector DB', error);
      return false;
    }
  }
  
  /**
   * Clear all memories
   * 
   * @returns Promise resolving when all memories are cleared
   */
  async clear(): Promise<void> {
    try {
      await this.vectorDB.clearVectors();
      this.logger.debug('Cleared all memories from vector DB');
    } catch (error) {
      this.logger.error('Error clearing memories from vector DB', error);
      throw error;
    }
  }
}