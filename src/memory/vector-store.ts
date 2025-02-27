/**
 * Vector store interface and implementations for Agentis memory
 */

/**
 * Configuration for vector stores
 */
export interface VectorStoreConfig {
  dimensions: number;
  namespace?: string;
  index?: string;
}

/**
 * A vector is an array of numbers representing embeddings
 */
export type Vector = number[];

/**
 * Document with vector embedding
 */
export interface VectorDocument {
  id: string;
  vector: Vector;
  metadata: Record<string, any>;
  text?: string;
}

/**
 * Interface for vector stores
 */
export interface VectorStoreInterface {
  /**
   * Stores a vector in the database
   * 
   * @param document - The document to store
   * @returns Promise resolving to success indicator
   */
  storeVector(document: VectorDocument): Promise<boolean>;
  
  /**
   * Searches for vectors similar to the query vector
   * 
   * @param queryVector - The vector to search for
   * @param limit - Maximum number of results
   * @param filter - Optional filter to apply to the search
   * @returns Promise resolving to array of similar documents
   */
  searchVector(
    queryVector: Vector, 
    limit?: number, 
    filter?: Record<string, any>
  ): Promise<VectorDocument[]>;
  
  /**
   * Deletes a vector from the database
   * 
   * @param id - ID of the vector to delete
   * @returns Promise resolving to success indicator
   */
  deleteVector(id: string): Promise<boolean>;
  
  /**
   * Initializes the vector store
   * 
   * @returns Promise resolving when initialization is complete
   */
  initialize(): Promise<void>;
}

/**
 * In-memory vector store for testing and demonstration
 */
export class InMemoryVectorStore implements VectorStoreInterface {
  private vectors: VectorDocument[] = [];
  private config: VectorStoreConfig;
  
  /**
   * Creates an in-memory vector store
   * 
   * @param config - Configuration options
   */
  constructor(config: VectorStoreConfig) {
    this.config = {
      dimensions: 1536, // Default to OpenAI embedding dimensions
      ...config
    };
  }
  
  /**
   * Initializes the vector store (no-op for in-memory store)
   */
  async initialize(): Promise<void> {
    // No initialization needed for in-memory store
  }
  
  /**
   * Stores a vector in memory
   * 
   * @param document - The document to store
   * @returns Promise resolving to success indicator
   */
  async storeVector(document: VectorDocument): Promise<boolean> {
    // Check if vector has correct dimensions
    if (document.vector.length !== this.config.dimensions) {
      throw new Error(`Vector dimensions (${document.vector.length}) do not match configured dimensions (${this.config.dimensions})`);
    }
    
    // Check if document with this ID already exists
    const existingIndex = this.vectors.findIndex(doc => doc.id === document.id);
    
    if (existingIndex >= 0) {
      // Update existing document
      this.vectors[existingIndex] = document;
    } else {
      // Add new document
      this.vectors.push(document);
    }
    
    return true;
  }
  
  /**
   * Calculates cosine similarity between two vectors
   * 
   * @param vectorA - First vector
   * @param vectorB - Second vector
   * @returns Cosine similarity score (1 = identical, 0 = orthogonal, -1 = opposite)
   */
  private cosineSimilarity(vectorA: Vector, vectorB: Vector): number {
    if (vectorA.length !== vectorB.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vectorA.length; i++) {
      dotProduct += vectorA[i] * vectorB[i];
      normA += vectorA[i] * vectorA[i];
      normB += vectorB[i] * vectorB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
      return 0; // Handle zero vectors
    }
    
    return dotProduct / (normA * normB);
  }
  
  /**
   * Searches for vectors similar to the query vector
   * 
   * @param queryVector - The vector to search for
   * @param limit - Maximum number of results
   * @param filter - Optional filter to apply to the search
   * @returns Promise resolving to array of similar documents
   */
  async searchVector(
    queryVector: Vector, 
    limit: number = 10, 
    filter?: Record<string, any>
  ): Promise<VectorDocument[]> {
    // Check if query vector has correct dimensions
    if (queryVector.length !== this.config.dimensions) {
      throw new Error(`Query vector dimensions (${queryVector.length}) do not match configured dimensions (${this.config.dimensions})`);
    }
    
    // Calculate similarities and filter if needed
    const similarities = this.vectors
      .filter(doc => {
        // Apply filter if provided
        if (!filter) return true;
        
        // Check if document metadata matches all filter criteria
        return Object.entries(filter).every(([key, value]) => {
          return doc.metadata[key] === value;
        });
      })
      .map(doc => ({
        document: doc,
        similarity: this.cosineSimilarity(queryVector, doc.vector)
      }));
    
    // Sort by similarity (highest first) and take top results
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.document);
  }
  
  /**
   * Deletes a vector from memory
   * 
   * @param id - ID of the vector to delete
   * @returns Promise resolving to success indicator
   */
  async deleteVector(id: string): Promise<boolean> {
    const initialLength = this.vectors.length;
    this.vectors = this.vectors.filter(doc => doc.id !== id);
    return this.vectors.length < initialLength;
  }
}