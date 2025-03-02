/**
 * Enhanced service for generating embeddings from text
 * 
 * Features:
 * - Improved caching for frequent embeddings
 * - Enhanced error handling with automatic retries
 * - Support for text chunking and batching
 * - Fallback model support
 */

import OpenAI from 'openai';
import { Logger } from '../utils/logger';
import crypto from 'crypto';

/**
 * Configuration for the enhanced embedding service
 */
export interface EmbeddingServiceConfig {
  model?: string;
  apiKey?: string;
  dimensions?: number;
  batchSize?: number;
  
  // Enhanced options
  fallbackModel?: string;      // Model to use if primary model fails
  maxRetries?: number;         // Max retries for failed operations (default: 3)
  retryDelayMs?: number;       // Delay between retries (default: 1000ms)
  enableCache?: boolean;       // Whether to cache embedding results (default: true)
  cacheSize?: number;          // Number of embeddings to cache (default: 1000)
  chunkSize?: number;          // Max characters per chunk for long text (default: 8000)
  chunkOverlap?: number;       // Overlap between chunks (default: 200)
}

// Type for cache entries
interface CacheEntry {
  text: string;
  embedding: number[];
  model: string;
  timestamp: number;
}

/**
 * Enhanced service that generates embeddings from text using OpenAI's API
 * with caching, batching, and retry logic
 */
export class EmbeddingService {
  private openai: OpenAI;
  private config: EmbeddingServiceConfig;
  private logger: Logger;
  
  // Cache for frequently requested embeddings
  private cache: Map<string, CacheEntry> = new Map();
  
  /**
   * Creates a new enhanced embedding service
   * 
   * @param config - Configuration for the embedding service
   */
  constructor(config?: EmbeddingServiceConfig) {
    this.config = {
      model: 'text-embedding-3-large', // Using large model for better quality
      dimensions: 1536,
      batchSize: 20,
      fallbackModel: 'text-embedding-3-small',
      maxRetries: 3,
      retryDelayMs: 1000,
      enableCache: true,
      cacheSize: 1000,
      chunkSize: 8000,
      chunkOverlap: 200,
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
    
    // Set up cache management
    this.setupCacheManagement();
  }
  
  /**
   * Sets up cache management to prevent memory leaks
   */
  private setupCacheManagement(): void {
    // Only set up if caching is enabled
    if (!this.config.enableCache) {
      return;
    }
    
    // Periodically clean up old cache entries
    setInterval(() => {
      try {
        if (this.cache.size > (this.config.cacheSize || 1000)) {
          this.logger.debug('Cleaning up embedding cache');
          
          // Sort entries by timestamp (oldest first)
          const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
          
          // Remove oldest entries until we're back to 75% of max size
          const targetSize = Math.floor((this.config.cacheSize || 1000) * 0.75);
          const toRemove = this.cache.size - targetSize;
          
          for (let i = 0; i < toRemove; i++) {
            if (entries[i]) {
              this.cache.delete(entries[i][0]);
            }
          }
          
          this.logger.debug(`Removed ${toRemove} old embedding cache entries`);
        }
      } catch (error) {
        this.logger.error('Error during embedding cache cleanup', error);
      }
    }, 60000); // Check every minute
  }
  
  /**
   * Executes a function with retry logic
   */
  private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    const maxRetries = this.config.maxRetries || 3;
    let lastError: any;
    
    while (true) {
      try {
        attempt++;
        return await operation();
      } catch (error) {
        lastError = error;
        // Check if we've exhausted retries
        if (attempt > maxRetries) {
          this.logger.error(`Operation '${context}' failed after ${attempt} attempts`, error);
          throw error;
        }
        
        // Log retry attempt
        this.logger.warn(`Retrying operation '${context}' after error (${attempt}/${maxRetries})`, error);
        
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, (this.config.retryDelayMs || 1000) * Math.pow(2, attempt - 1)));
      }
    }
  }
  
  /**
   * Create a hash key for the cache
   */
  private createCacheKey(text: string, model: string): string {
    return crypto.createHash('md5').update(`${text}:${model}`).digest('hex');
  }
  
  /**
   * Chunks text into smaller pieces for better embedding
   */
  private chunkText(text: string): string[] {
    if (!text) return [];
    
    const chunkSize = this.config.chunkSize || 8000;
    const overlap = this.config.chunkOverlap || 200;
    
    // If text is smaller than chunk size, return it as is
    if (text.length <= chunkSize) {
      return [text];
    }
    
    const chunks: string[] = [];
    let startIndex = 0;
    
    while (startIndex < text.length) {
      let endIndex = startIndex + chunkSize;
      
      // If this isn't the last chunk, try to find a good break point
      if (endIndex < text.length) {
        // Look for a good breaking point (period, question mark, etc.)
        const possibleBreakpoints = ['. ', '! ', '? ', '\n\n', '\n'];
        
        let foundBreakpoint = false;
        for (const breakpoint of possibleBreakpoints) {
          // Search for a break point from end of chunk backwards
          const searchStartIndex = Math.max(endIndex - 100, startIndex + chunkSize / 2);
          const breakpointIndex = text.lastIndexOf(breakpoint, endIndex);
          
          if (breakpointIndex > searchStartIndex) {
            endIndex = breakpointIndex + breakpoint.length;
            foundBreakpoint = true;
            break;
          }
        }
        
        // If no good break point found, just use the chunk size
        if (!foundBreakpoint) {
          endIndex = startIndex + chunkSize;
        }
      }
      
      // Add the chunk
      chunks.push(text.substring(startIndex, endIndex));
      
      // Move to next chunk with overlap
      startIndex = endIndex - overlap;
    }
    
    return chunks;
  }
  
  /**
   * Generates an embedding for a single text with caching and chunking
   * 
   * @param text - The text to embed
   * @returns Promise resolving to the embedding vector
   */
  async embedText(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      this.logger.warn('Attempted to embed empty text, returning zero vector');
      return new Array(this.config.dimensions || 1536).fill(0);
    }
    
    const model = this.config.model || 'text-embedding-3-large';
    const textToEmbed = text.trim();
    
    // Check cache first if enabled
    if (this.config.enableCache) {
      const cacheKey = this.createCacheKey(textToEmbed, model);
      const cachedEntry = this.cache.get(cacheKey);
      
      if (cachedEntry) {
        this.logger.debug('Cache hit for embedding');
        // Update timestamp to keep entry fresh
        cachedEntry.timestamp = Date.now();
        return cachedEntry.embedding;
      }
    }
    
    // Handle text chunking for long texts
    if (textToEmbed.length > (this.config.chunkSize || 8000)) {
      return await this.embedLongText(textToEmbed);
    }
    
    return await this.withRetry(async () => {
      try {
        // Generate embedding with primary model
        const response = await this.openai.embeddings.create({
          model,
          input: textToEmbed,
          dimensions: this.config.dimensions,
        });
        
        const embedding = response.data[0].embedding;
        
        // Cache the result if enabled
        if (this.config.enableCache) {
          const cacheKey = this.createCacheKey(textToEmbed, model);
          this.cache.set(cacheKey, {
            text: textToEmbed,
            embedding,
            model,
            timestamp: Date.now()
          });
        }
        
        return embedding;
      } catch (error) {
        // If primary model fails and we have a fallback, try that
        if (this.config.fallbackModel && this.config.fallbackModel !== model) {
          this.logger.warn(`Primary model ${model} failed, trying fallback ${this.config.fallbackModel}`, error);
          
          const fallbackResponse = await this.openai.embeddings.create({
            model: this.config.fallbackModel,
            input: textToEmbed,
            dimensions: this.config.dimensions,
          });
          
          const fallbackEmbedding = fallbackResponse.data[0].embedding;
          
          // Cache the fallback result if enabled
          if (this.config.enableCache) {
            const fallbackCacheKey = this.createCacheKey(textToEmbed, this.config.fallbackModel);
            this.cache.set(fallbackCacheKey, {
              text: textToEmbed,
              embedding: fallbackEmbedding,
              model: this.config.fallbackModel,
              timestamp: Date.now()
            });
          }
          
          return fallbackEmbedding;
        }
        
        // Re-throw if no fallback or fallback failed
        throw error;
      }
    }, `embed-text-${textToEmbed.length}`);
  }
  
  /**
   * Embeds a long text by chunking and then combining chunks
   * 
   * @param text - The long text to embed
   * @returns Promise resolving to the combined embedding vector
   */
  private async embedLongText(text: string): Promise<number[]> {
    this.logger.info(`Chunking long text (${text.length} chars) for embedding`);
    
    // Chunk the text
    const chunks = this.chunkText(text);
    this.logger.debug(`Split text into ${chunks.length} chunks`);
    
    // Embed each chunk
    const chunkEmbeddings: number[][] = [];
    for (const [index, chunk] of chunks.entries()) {
      try {
        this.logger.debug(`Embedding chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`);
        
        // Recursively call embedText for each chunk (it will handle caching, etc.)
        const embedding = await this.embedText(chunk);
        chunkEmbeddings.push(embedding);
      } catch (error) {
        this.logger.error(`Error embedding chunk ${index + 1}/${chunks.length}`, error);
        // If a chunk fails, we'll skip it and continue with others
      }
    }
    
    // If no chunks were successfully embedded, throw error
    if (chunkEmbeddings.length === 0) {
      throw new Error('Failed to embed any chunks of the long text');
    }
    
    // If only one chunk was embedded, return it directly
    if (chunkEmbeddings.length === 1) {
      return chunkEmbeddings[0];
    }
    
    // Combine the embeddings (weighted average based on chunk length)
    const combinedEmbedding = this.combineEmbeddings(chunkEmbeddings, chunks.map(c => c.length));
    return combinedEmbedding;
  }
  
  /**
   * Combines multiple embeddings into one
   * 
   * @param embeddings - Array of embeddings to combine
   * @param weights - Optional weights for each embedding (e.g. chunk lengths)
   * @returns Combined embedding vector
   */
  private combineEmbeddings(embeddings: number[][], weights?: number[]): number[] {
    // Ensure all embeddings have the same dimension
    const dimensions = embeddings[0].length;
    for (const embedding of embeddings) {
      if (embedding.length !== dimensions) {
        throw new Error('All embeddings must have the same dimension');
      }
    }
    
    // Calculate effective weights
    const effectiveWeights = weights || embeddings.map(() => 1);
    const totalWeight = effectiveWeights.reduce((sum, w) => sum + w, 0);
    const normalizedWeights = effectiveWeights.map(w => w / totalWeight);
    
    // Combine embeddings
    const combined = new Array(dimensions).fill(0);
    for (let i = 0; i < embeddings.length; i++) {
      const weight = normalizedWeights[i];
      const embedding = embeddings[i];
      
      for (let j = 0; j < dimensions; j++) {
        combined[j] += embedding[j] * weight;
      }
    }
    
    // Normalize the combined embedding to unit length
    const magnitude = Math.sqrt(combined.reduce((sum, val) => sum + val * val, 0));
    return combined.map(val => val / magnitude);
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