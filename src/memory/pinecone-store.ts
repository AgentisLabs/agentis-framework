/**
 * Pinecone vector database integration for Agentis memory system
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { Logger } from '../utils/logger';
import { LongTermMemory, ShortTermMemory, AgentNote } from './enhanced-memory-interface';

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

/**
 * Pinecone implementation of the vector store
 */
export class PineconeStore implements VectorStore {
  private client: Pinecone;
  private index!: ReturnType<Pinecone['Index']>; // Pinecone index
  private config: PineconeStoreConfig;
  private logger: Logger;
  private initialized: boolean = false;
  
  /**
   * Creates a new Pinecone store
   * 
   * @param config - Configuration for the Pinecone store
   */
  constructor(config: PineconeStoreConfig) {
    this.config = {
      dimension: 1536, // Default dimension for OpenAI embeddings
      namespace: 'default',
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
   * Stores a vector in Pinecone
   * 
   * @param id - Unique ID for the vector
   * @param vector - The embedding vector
   * @param data - Metadata to store with the vector
   * @param namespace - Optional namespace (defaults to config namespace)
   * @returns Promise that resolves when storage is complete
   */
  async storeVector(id: string, vector: number[], data: any, namespace?: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    try {
      // Create the vector record
      const record = {
        id,
        values: vector,
        metadata: data
      };
      
      // Use the namespaced index
      const nsIndex = this.index.namespace(ns);
      
      // Upsert the vector
      await nsIndex.upsert([record]);
      
      this.logger.debug('Stored vector in Pinecone', { id, namespace: ns });
    } catch (error) {
      this.logger.error('Error storing vector in Pinecone', error);
      throw new Error(`Failed to store vector: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Searches for similar vectors in Pinecone
   * 
   * @param vector - The query vector
   * @param limit - Maximum number of results to return
   * @param namespace - Optional namespace (defaults to config namespace)
   * @returns Promise resolving to search results
   */
  async searchVectors(vector: number[], limit: number, namespace?: string): Promise<Array<{
    id: string;
    score: number;
    data: any;
  }>> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const ns = namespace || this.config.namespace || 'default';
    
    try {
      // Use the namespaced index
      const nsIndex = this.index.namespace(ns);
      
      // Query for similar vectors
      const response = await nsIndex.query({
        topK: limit,
        includeMetadata: true,
        vector
      });
      
      return (response.matches || []).map(match => ({
        id: match.id,
        score: match.score || 0,
        data: match.metadata || {}
      }));
    } catch (error) {
      this.logger.error('Error searching vectors in Pinecone', error);
      throw new Error(`Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Gets a vector by ID
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
    
    try {
      // Use the namespaced index
      const nsIndex = this.index.namespace(ns);
      
      // Fetch the vector
      const response = await nsIndex.fetch([id]);
      
      if (response.records && response.records[id]) {
        const record = response.records[id];
        return {
          id,
          vector: record.values as number[],
          data: record.metadata || {}
        };
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error getting vector from Pinecone', error);
      throw new Error(`Failed to get vector: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    
    try {
      // Use the namespaced index
      const nsIndex = this.index.namespace(ns);
      
      // Delete the vector
      await nsIndex.deleteOne(id);
      this.logger.debug('Deleted vector from Pinecone', { id, namespace: ns });
      return true;
    } catch (error) {
      this.logger.error('Error deleting vector from Pinecone', error);
      return false;
    }
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
    
    try {
      // Use the namespaced index
      const nsIndex = this.index.namespace(namespace);
      
      // Delete all vectors in the namespace
      await nsIndex.deleteAll();
      this.logger.debug('Deleted all vectors in namespace', { namespace });
    } catch (error) {
      this.logger.error('Error deleting namespace from Pinecone', error);
      throw new Error(`Failed to delete namespace: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}