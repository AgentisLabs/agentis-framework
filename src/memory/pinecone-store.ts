/**
 * Enhanced Pinecone vector database integration for Agentis memory system
 * 
 * Features:
 * - Improved batch operations
 * - Caching for better performance
 * - Enhanced error handling with retry logic
 * - Memory compression capabilities
 * - Seamless integration with EmbeddingService
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { Logger } from '../utils/logger';
import { LongTermMemory, ShortTermMemory, AgentNote } from './enhanced-memory-interface';
import { EmbeddingService } from './embedding-service';

/**
 * Configuration for the Pinecone store
 */
export interface PineconeStoreConfig {
  apiKey?: string;
  environment?: string;
  projectId?: string;
  index?: string;
  namespace?: string;
  dimension?: number;
  
  // Enhanced options
  maxBatchSize?: number;      // Maximum vectors in a single upsert (default: 100)
  cacheSize?: number;         // Size of the memory cache (default: 100 items)
  maxRetries?: number;        // Max retries for failed operations (default: 3)
  retryDelayMs?: number;      // Delay between retries (default: 1000ms)
  enableCompression?: boolean; // Whether to enable text compression (default: true)
  compressionThreshold?: number; // Character threshold for compression (default: 5000)
  
  // Embedding service configuration
  embeddingService?: EmbeddingService; // Existing embedding service to use
  embeddingConfig?: {                  // Configuration to create a new embedding service
    apiKey?: string;                   // OpenAI API key (falls back to environment variable)
    model?: string;                    // Model to use (default: text-embedding-3-large)
    dimensions?: number;               // Embedding dimensions (default: 1536)
    enableCache?: boolean;             // Whether to cache embeddings (default: true)
  };
}

/**
 * Interface for vector store operations
 */
export interface VectorStore {
  initialize(): Promise<void>;
  storeVector(id: string, vector: number[], data: any, namespace?: string): Promise<void>;
  searchVectors(vector: number[], limit: number, namespace?: string): Promise<Array<{
    id: string;
    score: number;
    data: any;
  }>>;
  getVector(id: string, namespace?: string): Promise<{
    id: string;
    vector: number[];
    data: any;
  } | null>;
  deleteVector(id: string, namespace?: string): Promise<boolean>;
  deleteNamespace(namespace: string): Promise<void>;
}

// Type for cache entries
interface CacheEntry {
  id: string;
  vector: number[];
  data: any;
  namespace: string;
  timestamp: number;
}

// Simple text compression utility for metadata
class TextCompressor {
  /**
   * Compress text data in metadata
   */
  static compressMetadata(data: any, threshold: number): any {
    if (!data) return data;
    
    const compressedData = {...data};
    
    // Find string fields that exceed the threshold
    Object.keys(compressedData).forEach(key => {
      // Skip the tags field - we don't want to compress or modify tag arrays
      if (key === 'tags') {
        return;
      }
      
      if (typeof compressedData[key] === 'string' && compressedData[key].length > threshold) {
        // For this simple implementation, we'll truncate and add a marker
        // In a real implementation, you might use actual compression algorithms
        compressedData[key] = `${compressedData[key].substring(0, threshold)}... [truncated ${compressedData[key].length - threshold} chars]`;
        compressedData[`${key}_truncated`] = true;
        compressedData[`${key}_original_length`] = data[key].length;
      } else if (typeof compressedData[key] === 'object' && compressedData[key] !== null && key !== 'tags') {
        compressedData[key] = this.compressMetadata(compressedData[key], threshold);
      }
    });
    
    return compressedData;
  }
  
  /**
   * Create a summary of long text content
   */
  static summarizeText(text: string, maxLength: number = 1000): string {
    if (!text || text.length <= maxLength) return text;
    
    // Simple summarization by extracting the beginning and end
    const halfLength = Math.floor(maxLength / 2);
    return `${text.substring(0, halfLength)}... [${text.length - maxLength} chars omitted] ...${text.substring(text.length - halfLength)}`;
  }
}

/**
 * Enhanced Pinecone implementation of the vector store
 * with caching, batching, and retry mechanisms
 */
export class PineconeStore implements VectorStore {
  private client: Pinecone;
  private index!: ReturnType<Pinecone['Index']>; // Pinecone index
  private config: PineconeStoreConfig;
  private logger: Logger;
  private initialized: boolean = false;
  private embeddingService: EmbeddingService;
  
  // Cache for frequently accessed vectors
  private cache: Map<string, CacheEntry> = new Map();
  
  // Batching queue for vector operations
  private batchQueue: {id: string, vector: number[], data: any, namespace: string}[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  
  /**
   * Creates a new enhanced Pinecone store
   * 
   * @param config - Configuration for the Pinecone store
   */
  constructor(config: PineconeStoreConfig) {
    this.config = {
      dimension: 1536, // Default dimension for OpenAI embeddings
      namespace: 'default',
      maxBatchSize: 100,
      cacheSize: 100,
      maxRetries: 3,
      retryDelayMs: 1000,
      enableCompression: true,
      compressionThreshold: 5000,
      ...config
    };
    
    const apiKey = this.config.apiKey || process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('Pinecone API key is required. Set PINECONE_API_KEY environment variable or pass it to the constructor.');
    }
    
    this.logger = new Logger('PineconeStore');
    
    // Initialize Pinecone client
    this.client = new Pinecone({
      apiKey
    });
    
    // Initialize or use provided embedding service
    if (this.config.embeddingService) {
      this.embeddingService = this.config.embeddingService;
      this.logger.debug('Using provided embedding service');
    } else {
      // Create a new embedding service with provided config or defaults
      this.embeddingService = new EmbeddingService({
        dimensions: this.config.dimension,
        ...this.config.embeddingConfig
      });
      this.logger.debug('Created new embedding service');
    }
    
    // Set up LRU cache management
    this.setupCacheManagement();
  }
  
  /**
   * Sets up cache management to prevent memory leaks
   */
  private setupCacheManagement(): void {
    // Periodically clean up old cache entries
    setInterval(() => {
      try {
        if (this.cache.size > (this.config.cacheSize || 100)) {
          this.logger.debug('Cleaning up cache');
          
          // Sort entries by timestamp (oldest first)
          const entries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
          
          // Remove oldest entries until we're back to 75% of max size
          const targetSize = Math.floor((this.config.cacheSize || 100) * 0.75);
          const toRemove = this.cache.size - targetSize;
          
          for (let i = 0; i < toRemove; i++) {
            if (entries[i]) {
              this.cache.delete(entries[i][0]);
            }
          }
          
          this.logger.debug(`Removed ${toRemove} old cache entries`);
        }
      } catch (error) {
        this.logger.error('Error during cache cleanup', error);
      }
    }, 60000); // Check every minute
  }
  
  /**
   * Executes a function with retry logic
   */
  private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let attempt = 0;
    const maxRetries = this.config.maxRetries || 3;
    
    while (true) {
      try {
        attempt++;
        return await operation();
      } catch (error) {
        // Check if we've exhausted retries
        if (attempt > maxRetries) {
          this.logger.error(`Operation '${context}' failed after ${attempt} attempts`, error);
          throw error;
        }
        
        // Log retry attempt
        this.logger.warn(`Retrying operation '${context}' after error (${attempt}/${maxRetries})`, error);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, (this.config.retryDelayMs || 1000) * attempt));
      }
    }
  }
  
  /**
   * Initializes the Pinecone store
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    this.logger.debug('Initializing Pinecone store', { index: this.config.index });
    
    try {
      if (!this.config.index) {
        throw new Error('Pinecone index name is required');
      }
      
      // Check if the index exists
      let indexExists = false;
      try {
        const indexList = await this.client.listIndexes();
        indexExists = indexList.indexes?.some(idx => idx.name === this.config.index) || false;
      } catch (error) {
        indexExists = false;
      }
      
      if (indexExists) {
        this.index = this.client.Index(this.config.index);
        this.logger.info('Connected to existing Pinecone index', { index: this.config.index });
      } else {
        // Create the index if it doesn't exist
        this.logger.info('Creating new Pinecone index', { index: this.config.index });
        
        // Create the index with proper spec
        await this.client.createIndex({
          name: this.config.index,
          dimension: this.config.dimension || 1536,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1' // Free tier region
            }
          }
        });
        
        // Wait for the index to be ready
        let isReady = false;
        let attempts = 0;
        const maxAttempts = 30; // 30 seconds max wait
        
        while (!isReady && attempts < maxAttempts) {
          try {
            // Try to connect to the index
            this.index = this.client.Index(this.config.index);
            // Try an operation to see if it's ready
            await this.index.describeIndexStats();
            isReady = true;
          } catch (error) {
            this.logger.debug('Waiting for index to be ready...');
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        if (!isReady) {
          throw new Error(`Index ${this.config.index} creation timed out`);
        }
        
        this.logger.info('Created and connected to new Pinecone index', { index: this.config.index });
      }
      
      this.initialized = true;
    } catch (error) {
      this.logger.error('Error initializing Pinecone store', error);
      throw new Error(`Failed to initialize Pinecone store: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Ensures that tags are in the correct format for Pinecone
   * 
   * @param tags - Tags in any format
   * @returns Tags as an array of strings
   */
  static formatTags(tags: any): string[] {
    if (!tags) {
      return [];
    }
    
    if (Array.isArray(tags)) {
      // Convert all array items to strings
      return tags.map(item => String(item));
    }
    
    if (typeof tags === 'object') {
      // Convert object values to an array of strings
      return Object.values(tags).map(item => String(item));
    }
    
    // Handle single values
    return [String(tags)];
  }

  /**
   * Queues a vector for batch storage and processes the batch if needed
   * 
   * @param id - Unique ID for the vector
   * @param vector - The embedding vector
   * @param data - Metadata to store with the vector
   * @param namespace - Optional namespace (defaults to config namespace)
   * @returns Promise that resolves when the vector is queued (not necessarily stored)
   */
  async storeVector(id: string, vector: number[], data: any, namespace?: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    try {
      // Apply compression if enabled and data contains large text fields
      let processedData = {...data};
      
      // Ensure tags are properly formatted
      if (processedData.tags) {
        processedData.tags = PineconeStore.formatTags(processedData.tags);
      }
      
      // Apply compression after formatting the tags
      if (this.config.enableCompression) {
        processedData = TextCompressor.compressMetadata(processedData, this.config.compressionThreshold || 5000);
      }
      
      // Add to cache for fast retrieval
      const cacheKey = `${ns}:${id}`;
      this.cache.set(cacheKey, {
        id,
        vector,
        data: processedData,
        namespace: ns,
        timestamp: Date.now()
      });
      
      // Add to batch queue
      this.batchQueue.push({
        id,
        vector,
        data: processedData,
        namespace: ns
      });
      
      // Process batch if it's reached the max size
      if (this.batchQueue.length >= (this.config.maxBatchSize || 100)) {
        await this.processBatch();
      } 
      // Otherwise schedule delayed processing if not already scheduled
      else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.processBatch(), 1000);
      }
      
      this.logger.debug('Queued vector for storage in Pinecone', { id, namespace: ns });
    } catch (error) {
      this.logger.error('Error queuing vector for Pinecone', error);
      throw new Error(`Failed to queue vector: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Process the current batch of vectors
   */
  private async processBatch(): Promise<void> {
    // Clear the timer if it exists
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Check if there's anything to process
    if (this.batchQueue.length === 0) {
      return;
    }
    
    this.logger.debug(`Processing batch of ${this.batchQueue.length} vectors`);
    
    try {
      // Group by namespace for efficient processing
      const vectorsByNamespace: Record<string, any[]> = {};
      
      // Group vectors by namespace
      for (const item of this.batchQueue) {
        if (!vectorsByNamespace[item.namespace]) {
          vectorsByNamespace[item.namespace] = [];
        }
        
        // Final check to ensure all metadata is compatible with Pinecone
        const processedMetadata = {...item.data};
        
        // Ensure tags are properly formatted as string arrays
        if (processedMetadata.tags) {
          processedMetadata.tags = PineconeStore.formatTags(processedMetadata.tags);
        }
        
        vectorsByNamespace[item.namespace].push({
          id: item.id,
          values: item.vector,
          metadata: processedMetadata
        });
      }
      
      // Process each namespace batch with retry logic
      for (const [ns, vectors] of Object.entries(vectorsByNamespace)) {
        await this.withRetry(async () => {
          const nsIndex = this.index.namespace(ns);
          
          // Process in sub-batches to stay within service limits
          const maxSubBatchSize = 100; // Maximum vectors per API call
          for (let i = 0; i < vectors.length; i += maxSubBatchSize) {
            const subBatch = vectors.slice(i, i + maxSubBatchSize);
            await nsIndex.upsert(subBatch);
            this.logger.debug(`Stored sub-batch of ${subBatch.length} vectors in namespace ${ns}`);
          }
        }, `batch-upsert-${ns}`);
      }
      
      // Clear the batch queue
      this.batchQueue = [];
      this.logger.info('Successfully processed vector batch');
    } catch (error) {
      this.logger.error('Error processing vector batch', error);
      
      // Keep the batch queue for retry on next operation
      // Could implement a more sophisticated retry strategy here
    }
  }
  
  /**
   * Searches for similar vectors in Pinecone with enhanced features
   * 
   * @param vector - The query vector
   * @param limit - Maximum number of results to return
   * @param namespace - Optional namespace (defaults to config namespace)
   * @param filter - Optional metadata filter
   * @returns Promise resolving to search results
   */
  async searchVectors(
    vector: number[], 
    limit: number, 
    namespace?: string,
    filter?: Record<string, any>
  ): Promise<Array<{
    id: string;
    score: number;
    data: any;
  }>> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Process any pending batches to ensure most recent data is available in Pinecone
    if (this.batchQueue.length > 0) {
      await this.processBatch();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    // First check the cache for frequently accessed vectors
    // This step is mainly useful for exact matches rather than similarity searches
    // but can significantly improve performance for repeated queries
    
    return await this.withRetry(async () => {
      // Use the namespaced index
      const nsIndex = this.index.namespace(ns);
      
      // Query for similar vectors
      const response = await nsIndex.query({
        topK: limit,
        includeMetadata: true,
        vector,
        filter
      });
      
      // Cache the results for future use
      const results = (response.matches || []).map(match => {
        const result = {
          id: match.id,
          score: match.score || 0,
          data: match.metadata || {}
        };
        
        // Add to cache for future retrieval
        const cacheKey = `${ns}:${match.id}`;
        if (match.values) {
          this.cache.set(cacheKey, {
            id: match.id,
            vector: match.values as number[],
            data: match.metadata || {},
            namespace: ns,
            timestamp: Date.now()
          });
        }
        
        return result;
      });
      
      // Enhance results with additional metrics
      const enhancedResults = results.map(result => ({
        ...result,
        confidence: this.calculateConfidence(result.score)
      }));
      
      this.logger.debug(`Found ${enhancedResults.length} similar vectors in namespace ${ns}`);
      return enhancedResults;
    }, 'search-vectors');
  }
  
  /**
   * Calculate a confidence score from similarity
   */
  private calculateConfidence(similarity: number): number {
    // Convert cosine similarity to a more intuitive confidence score
    // This is a simple transformation, could be made more sophisticated
    return Math.min(1, Math.max(0, similarity * 1.2 - 0.2));
  }
  
  /**
   * Gets a vector by ID with cache
   * 
   * @param id - The vector ID
   * @param namespace - Optional namespace (defaults to config namespace)
   * @returns Promise resolving to the vector or null if not found
   */
  async getVector(id: string, namespace?: string): Promise<{
    id: string;
    vector: number[];
    data: any;
  } | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    // Check cache first
    const cacheKey = `${ns}:${id}`;
    const cachedEntry = this.cache.get(cacheKey);
    
    if (cachedEntry) {
      this.logger.debug(`Cache hit for vector ID ${id} in namespace ${ns}`);
      // Update the timestamp to keep this entry fresh
      cachedEntry.timestamp = Date.now();
      return {
        id: cachedEntry.id,
        vector: cachedEntry.vector,
        data: cachedEntry.data
      };
    }
    
    // If it's in the batch queue but not yet stored, return from there
    const queuedVector = this.batchQueue.find(item => item.id === id && item.namespace === ns);
    if (queuedVector) {
      this.logger.debug(`Found vector ID ${id} in queue, not yet stored in Pinecone`);
      return {
        id: queuedVector.id,
        vector: queuedVector.vector,
        data: queuedVector.data
      };
    }
    
    // Not in cache, fetch from Pinecone with retry
    return await this.withRetry(async () => {
      // Use the namespaced index
      const nsIndex = this.index.namespace(ns);
      
      // Fetch the vector
      const response = await nsIndex.fetch([id]);
      
      if (response.records && response.records[id]) {
        const record = response.records[id];
        
        // Cache for future use
        this.cache.set(cacheKey, {
          id,
          vector: record.values as number[],
          data: record.metadata || {},
          namespace: ns,
          timestamp: Date.now()
        });
        
        return {
          id,
          vector: record.values as number[],
          data: record.metadata || {}
        };
      }
      
      return null;
    }, `get-vector-${id}`);
  }
  
  /**
   * Gets multiple vectors by ID in a single request
   * 
   * @param ids - Array of vector IDs
   * @param namespace - Optional namespace
   * @returns Promise resolving to a map of found vectors
   */
  async getVectors(ids: string[], namespace?: string): Promise<Map<string, {
    id: string;
    vector: number[];
    data: any;
  }>> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    const result = new Map();
    
    // First check cache for matches
    const uncachedIds: string[] = [];
    
    for (const id of ids) {
      const cacheKey = `${ns}:${id}`;
      const cachedEntry = this.cache.get(cacheKey);
      
      if (cachedEntry) {
        // Update timestamp
        cachedEntry.timestamp = Date.now();
        
        // Add to results
        result.set(id, {
          id: cachedEntry.id,
          vector: cachedEntry.vector,
          data: cachedEntry.data
        });
      } else {
        uncachedIds.push(id);
      }
    }
    
    // If all IDs were in cache, return immediately
    if (uncachedIds.length === 0) {
      return result;
    }
    
    // Fetch uncached IDs from Pinecone with retry
    await this.withRetry(async () => {
      // Process in batches of 100 IDs (Pinecone limit)
      const batchSize = 100;
      
      for (let i = 0; i < uncachedIds.length; i += batchSize) {
        const batchIds = uncachedIds.slice(i, i + batchSize);
        const nsIndex = this.index.namespace(ns);
        const response = await nsIndex.fetch(batchIds);
        
        // Add found records to result and cache
        if (response.records) {
          for (const [id, record] of Object.entries(response.records)) {
            // Cache for future use
            const cacheKey = `${ns}:${id}`;
            this.cache.set(cacheKey, {
              id,
              vector: record.values as number[],
              data: record.metadata || {},
              namespace: ns,
              timestamp: Date.now()
            });
            
            // Add to results
            result.set(id, {
              id,
              vector: record.values as number[],
              data: record.metadata || {}
            });
          }
        }
      }
    }, 'get-vectors-batch');
    
    return result;
  }
  
  /**
   * Deletes a vector by ID
   * 
   * @param id - The vector ID
   * @param namespace - Optional namespace (defaults to config namespace)
   * @returns Promise resolving to true if deleted, false if not found
   */
  async deleteVector(id: string, namespace?: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    // Remove from cache if present
    const cacheKey = `${ns}:${id}`;
    this.cache.delete(cacheKey);
    
    // Remove from batch queue if present (to avoid inserting after deletion)
    const queueIndex = this.batchQueue.findIndex(item => item.id === id && item.namespace === ns);
    if (queueIndex !== -1) {
      this.batchQueue.splice(queueIndex, 1);
    }
    
    // Delete from Pinecone with retry
    return await this.withRetry(async () => {
      try {
        // Use the namespaced index
        const nsIndex = this.index.namespace(ns);
        
        // Delete the vector
        await nsIndex.deleteOne(id);
        this.logger.debug('Deleted vector from Pinecone', { id, namespace: ns });
        return true;
      } catch (error) {
        // If it's a not found error, just return false without retrying
        if (error instanceof Error && error.message.includes('not found')) {
          return false;
        }
        throw error;
      }
    }, `delete-vector-${id}`);
  }
  
  /**
   * Deletes multiple vectors by ID in a batch
   * 
   * @param ids - Array of vector IDs to delete
   * @param namespace - Optional namespace
   * @returns Promise resolving to the number of successfully deleted vectors
   */
  async deleteVectors(ids: string[], namespace?: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (ids.length === 0) {
      return 0;
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    // Remove from cache
    for (const id of ids) {
      const cacheKey = `${ns}:${id}`;
      this.cache.delete(cacheKey);
    }
    
    // Remove from batch queue
    this.batchQueue = this.batchQueue.filter(item => 
      !(ids.includes(item.id) && item.namespace === ns)
    );
    
    // Delete from Pinecone with retry
    return await this.withRetry(async () => {
      // Process in batches of 100 (Pinecone limit)
      const batchSize = 100;
      let deletedCount = 0;
      
      for (let i = 0; i < ids.length; i += batchSize) {
        const batchIds = ids.slice(i, i + batchSize);
        const nsIndex = this.index.namespace(ns);
        
        try {
          await nsIndex.deleteMany(batchIds);
          deletedCount += batchIds.length;
          this.logger.debug(`Deleted batch of ${batchIds.length} vectors from namespace ${ns}`);
        } catch (error) {
          this.logger.error(`Error deleting batch of vectors from ${ns}`, error);
          // Continue with next batch despite error
        }
      }
      
      return deletedCount;
    }, 'delete-vectors-batch');
  }
  
  /**
   * Deletes all vectors in a namespace
   * 
   * @param namespace - The namespace to delete
   * @returns Promise resolving when deletion is complete
   */
  async deleteNamespace(namespace: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    // Clear cache entries for this namespace
    for (const [key, entry] of this.cache.entries()) {
      if (entry.namespace === namespace) {
        this.cache.delete(key);
      }
    }
    
    // Remove from batch queue
    this.batchQueue = this.batchQueue.filter(item => item.namespace !== namespace);
    
    // Delete from Pinecone with retry
    await this.withRetry(async () => {
      // Use the namespaced index
      const nsIndex = this.index.namespace(namespace);
      
      // Delete all vectors in the namespace
      await nsIndex.deleteAll();
      this.logger.info(`Deleted all vectors in namespace ${namespace}`);
    }, `delete-namespace-${namespace}`);
  }
  
  /**
   * Get statistics about the index
   * 
   * @returns Promise resolving to index statistics
   */
  async getStats(): Promise<{
    namespaces: Record<string, { vectorCount: number }>;
    totalVectorCount: number;
    dimension: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    return await this.withRetry(async () => {
      const stats = await this.index.describeIndexStats();
      
      // Convert Pinecone namespaces format to our expected format
      const convertedNamespaces: Record<string, { vectorCount: number }> = {};
      if (stats.namespaces) {
        Object.entries(stats.namespaces).forEach(([key, value]) => {
          convertedNamespaces[key] = {
            vectorCount: value.recordCount || 0
          };
        });
      }
      
      return {
        namespaces: convertedNamespaces,
        totalVectorCount: stats.totalRecordCount || 0,
        dimension: this.config.dimension || 1536
      };
    }, 'get-stats');
  }
  
  /**
   * Perform a flush to ensure all pending writes are committed
   */
  async flush(): Promise<void> {
    if (this.batchQueue.length > 0) {
      await this.processBatch();
    }
    
    this.logger.info('Flushed all pending writes to Pinecone');
  }
  
  /**
   * Stores text content with automatically generated embeddings
   * 
   * @param id - Unique ID for the text
   * @param text - The text content to store
   * @param metadata - Additional metadata to store with the text
   * @param namespace - Optional namespace
   * @returns Promise resolving when storage is complete
   */
  async storeText(id: string, text: string, metadata: any = {}, namespace?: string): Promise<void> {
    try {
      if (!text || text.trim().length === 0) {
        this.logger.warn('Attempted to store empty text, skipping');
        return;
      }
      
      // Generate embedding for the text
      this.logger.debug(`Generating embedding for text (id: ${id})`);
      const embedding = await this.embeddingService.embedText(text);
      
      // Process metadata to ensure it's compatible with Pinecone
      // We need to create a new object with processed values
      const processedMetadata: Record<string, any> = {};
      
      // Go through each metadata field and ensure it's in the correct format for Pinecone
      for (const [key, value] of Object.entries(metadata)) {
        if (key === 'tags') {
          // Use our utility function to handle tags formatting
          processedMetadata[key] = PineconeStore.formatTags(value);
        } else if (Array.isArray(value)) {
          // For other arrays, convert items to strings if they're objects
          processedMetadata[key] = value.map(item => 
            typeof item === 'object' && item !== null ? 
              JSON.stringify(item) : item
          );
        } else if (value && typeof value === 'object' && value !== null) {
          // Convert objects to JSON strings
          processedMetadata[key] = JSON.stringify(value);
        } else {
          // Pass through primitives unchanged
          processedMetadata[key] = value;
        }
      }
      
      // Prepare metadata with the original text
      const enhancedMetadata = {
        ...processedMetadata,
        text: text,
        stored_at: new Date().toISOString()
      };
      
      // Store the vector
      await this.storeVector(id, embedding, enhancedMetadata, namespace);
      
      this.logger.debug(`Stored text with id ${id} in namespace ${namespace || this.config.namespace || 'default'}`);
    } catch (error) {
      this.logger.error(`Error storing text with id ${id}`, error);
      throw new Error(`Failed to store text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Stores multiple texts with automatically generated embeddings
   * 
   * @param items - Array of items to store
   * @param namespace - Optional namespace
   * @returns Promise resolving when storage is complete
   */
  async storeTexts(items: Array<{id: string, text: string, metadata?: any}>, namespace?: string): Promise<void> {
    if (items.length === 0) {
      return;
    }
    
    try {
      // Filter out empty texts
      const validItems = items.filter(item => item.text && item.text.trim().length > 0);
      if (validItems.length === 0) {
        this.logger.warn('No valid text items to store');
        return;
      }
      
      // Generate embeddings for all texts in batch for efficiency
      this.logger.debug(`Generating embeddings for batch of ${validItems.length} texts`);
      const texts = validItems.map(item => item.text);
      const embeddings = await this.embeddingService.embedBatch(texts);
      
      // Store each text with its embedding
      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const embedding = embeddings[i];
        
        // Process metadata to ensure it's compatible with Pinecone
        const processedMetadata: Record<string, any> = {};
        
        // Go through each metadata field and ensure it's in the correct format for Pinecone
        if (item.metadata) {
          for (const [key, value] of Object.entries(item.metadata)) {
            if (key === 'tags') {
              // Use our utility function to handle tags formatting
              processedMetadata[key] = PineconeStore.formatTags(value);
            } else if (Array.isArray(value)) {
              // For other arrays, convert items to strings if they're objects
              processedMetadata[key] = value.map(item => 
                typeof item === 'object' && item !== null ? 
                  JSON.stringify(item) : item
              );
            } else if (value && typeof value === 'object' && value !== null) {
              // Convert objects to JSON strings
              processedMetadata[key] = JSON.stringify(value);
            } else {
              // Pass through primitives unchanged
              processedMetadata[key] = value;
            }
          }
        }
        
        // Prepare metadata with the original text
        const enhancedMetadata = {
          ...processedMetadata,
          text: item.text,
          stored_at: new Date().toISOString()
        };
        
        // Queue for storage
        await this.storeVector(item.id, embedding, enhancedMetadata, namespace);
      }
      
      this.logger.debug(`Stored batch of ${validItems.length} texts in namespace ${namespace || this.config.namespace || 'default'}`);
    } catch (error) {
      this.logger.error('Error storing batch of texts', error);
      throw new Error(`Failed to store texts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Searches for similar text content
   * 
   * @param text - The query text
   * @param limit - Maximum number of results
   * @param namespace - Optional namespace
   * @param filter - Optional metadata filter
   * @returns Promise resolving to search results
   */
  async searchText(
    text: string, 
    limit: number = 10, 
    namespace?: string,
    filter?: Record<string, any>
  ): Promise<Array<{
    id: string;
    score: number;
    text: string;
    metadata: any;
  }>> {
    try {
      if (!text || text.trim().length === 0) {
        return [];
      }
      
      // Generate embedding for the query text
      this.logger.debug('Generating embedding for search query');
      const embedding = await this.embeddingService.embedText(text);
      
      // Search using the embedding
      const results = await this.searchVectors(embedding, limit, namespace, filter);
      
      // Enhance results with the text content
      return results.map(result => {
        const { data, ...rest } = result;
        const text = data.text || '';
        delete data.text;
        
        return {
          ...rest,
          text,
          metadata: data
        };
      });
    } catch (error) {
      this.logger.error('Error searching for text', error);
      throw new Error(`Failed to search for text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Updates existing text content with new text while preserving the ID
   * 
   * @param id - The ID of the text to update
   * @param newText - The new text content
   * @param metadata - Optional new metadata (or undefined to keep existing)
   * @param namespace - Optional namespace
   * @returns Promise resolving to true if updated, false if not found
   */
  async updateText(id: string, newText: string, metadata?: any, namespace?: string): Promise<boolean> {
    try {
      const ns = namespace || this.config.namespace || 'default';
      
      // Check if the vector exists
      const existingVector = await this.getVector(id, ns);
      if (!existingVector) {
        return false;
      }
      
      // Generate new embedding
      const newEmbedding = await this.embeddingService.embedText(newText);
      
      // Merge metadata
      const existingMetadata = existingVector.data || {};
      delete existingMetadata.text; // Remove old text
      
      const updatedMetadata = {
        ...existingMetadata,
        ...(metadata || {}),
        text: newText,
        updated_at: new Date().toISOString()
      };
      
      // Store the updated vector
      await this.storeVector(id, newEmbedding, updatedMetadata, ns);
      
      return true;
    } catch (error) {
      this.logger.error(`Error updating text with id ${id}`, error);
      throw new Error(`Failed to update text: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Creates a new memory entry from structured data
   * 
   * @param memory - Memory data to store
   * @param namespace - Optional namespace
   * @returns Promise resolving to the memory ID
   */
  async storeMemory(memory: LongTermMemory | ShortTermMemory | AgentNote, namespace?: string): Promise<string> {
    try {
      // Generate a unique ID if none provided
      const id = memory.id || `mem_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      
      // Determine the text content to embed based on memory type
      let textToEmbed = '';
      
      if ('content' in memory) {
        // It's a Note
        textToEmbed = memory.content;
      } else if ('thought' in memory) {
        // It's a memory with thought
        const memoryWithThought = memory as { thought: string; context?: string };
        textToEmbed = `${memoryWithThought.thought || ''} ${memoryWithThought.context || ''}`;
      } else {
        // Generic handling
        textToEmbed = JSON.stringify(memory);
      }
      
      // Get timestamp based on memory type
      let timestamp: string;
      if ('timestamp' in memory && memory.timestamp) {
        // Convert timestamp to string if it's a number
        if (typeof memory.timestamp === 'number') {
          timestamp = new Date(memory.timestamp).toISOString();
        } else {
          timestamp = memory.timestamp;
        }
      } else {
        timestamp = new Date().toISOString();
      }
      
      // Process metadata to ensure Pinecone compatibility
      const metadata: Record<string, any> = {};
      
      // Extract key properties
      for (const [key, value] of Object.entries(memory)) {
        // Skip the content/thought field as we'll embed it separately
        if (key === 'content' || key === 'thought') continue;
        
        if (key === 'tags') {
          // Ensure tags are properly formatted
          metadata[key] = PineconeStore.formatTags(value);
        } else if (Array.isArray(value)) {
          // For other arrays, convert items to strings if they're objects
          metadata[key] = value.map(item => 
            typeof item === 'object' && item !== null ? 
              JSON.stringify(item) : item
          );
        } else if (value && typeof value === 'object' && value !== null) {
          // Convert objects to JSON strings
          metadata[key] = JSON.stringify(value);
        } else {
          // Pass through primitives unchanged
          metadata[key] = value;
        }
      }
      
      // Add memory type and creation timestamp
      metadata.memory_type = 'thought' in memory ? 'memory' : 'note';
      metadata.created_at = timestamp;
      
      // Store with metadata
      await this.storeText(id, textToEmbed, metadata, namespace);
      
      return id;
    } catch (error) {
      this.logger.error('Error storing memory', error);
      throw new Error(`Failed to store memory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Retrieves memories similar to a query
   * 
   * @param query - The query text
   * @param limit - Maximum number of results
   * @param namespace - Optional namespace
   * @param filter - Optional filter criteria
   * @returns Promise resolving to matching memories
   */
  async searchMemories(
    query: string,
    limit: number = 10,
    namespace?: string,
    filter?: Record<string, any>
  ): Promise<Array<LongTermMemory | ShortTermMemory | AgentNote>> {
    try {
      // Search using text
      const results = await this.searchText(query, limit, namespace, filter);
      
      // Convert to memory objects
      return results.map(result => {
        const { metadata } = result;
        
        // Determine memory type and convert to appropriate format
        if (metadata.memory_type === 'note') {
          return {
            id: result.id,
            content: result.text,
            category: metadata.category || 'general',
            importance: metadata.importance || 5,
            timestamp: metadata.created_at || metadata.timestamp || new Date().toISOString(),
            ...metadata
          } as AgentNote;
        } else {
          return {
            id: result.id,
            thought: result.text,
            context: metadata.context || '',
            timestamp: metadata.created_at || metadata.timestamp || new Date().toISOString(),
            ...metadata
          } as LongTermMemory;
        }
      });
    } catch (error) {
      this.logger.error('Error searching memories', error);
      throw new Error(`Failed to search memories: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}