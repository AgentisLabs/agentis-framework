/**
 * Service for generating embeddings from text
 */

import OpenAI from 'openai';
import { Logger } from '../utils/logger';

/**
 * Configuration for the embedding service
 */
export interface EmbeddingServiceConfig {
  model?: string;
  apiKey?: string;
  dimensions?: number;
  batchSize?: number;
}

/**
 * Service that generates embeddings from text using OpenAI's API
 */
export class EmbeddingService {
  private openai: OpenAI;
  private config: EmbeddingServiceConfig;
  private logger: Logger;
  
  /**
   * Creates a new embedding service
   * 
   * @param config - Configuration for the embedding service
   */
  constructor(config?: EmbeddingServiceConfig) {
    this.config = {
      model: 'text-embedding-3-small',
      dimensions: 1536,
      batchSize: 20,
      ...config
    };
    
    const apiKey = this.config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it to the constructor.');
    }
    
    this.openai = new OpenAI({
      apiKey
    });
    
    this.logger = new Logger('EmbeddingService');
  }
  
  /**
   * Generates an embedding for a single text
   * 
   * @param text - The text to embed
   * @returns Promise resolving to the embedding vector
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const model = this.config.model || 'text-embedding-3-small';
      
      const response = await this.openai.embeddings.create({
        model,
        input: text,
        dimensions: this.config.dimensions,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Error generating embedding', error);
      throw new Error(`Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Generates embeddings for multiple texts in batches
   * 
   * @param texts - Array of texts to embed
   * @returns Promise resolving to an array of embedding vectors
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    this.logger.debug(`Embedding batch of ${texts.length} texts`);
    
    const embeddings: number[][] = [];
    const batchSize = this.config.batchSize || 20;
    const model = this.config.model || 'text-embedding-3-small';
    
    // Process in batches to avoid rate limits
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      try {
        const response = await this.openai.embeddings.create({
          model,
          input: batch,
          dimensions: this.config.dimensions,
        });
        
        // Add the embeddings in correct order
        response.data.forEach((item) => {
          embeddings.push(item.embedding);
        });
        
        // If we have more batches, add a small delay to avoid rate limits
        if (i + batchSize < texts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        this.logger.error(`Error generating embeddings for batch ${i}`, error);
        throw new Error(`Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return embeddings;
  }
  
  /**
   * Calculate cosine similarity between two vectors
   * 
   * @param a - First vector
   * @param b - Second vector
   * @returns Cosine similarity (0-1)
   */
  calculateSimilarity(a: number[], b: number[]): number {
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
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (denominator === 0) {
      return 0;
    }
    
    // Return similarity score (0-1)
    return dotProduct / denominator;
  }
}