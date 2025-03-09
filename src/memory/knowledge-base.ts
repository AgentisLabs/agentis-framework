import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import { EmbeddingService } from './embedding-service';
import { KnowledgeGraph, KnowledgeNode, KnowledgeRelationship } from './knowledge-graph';

/**
 * Structure of an FAQ entry
 */
export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
  category?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Structure of a document entry in the knowledge base
 */
export interface DocumentEntry {
  id: string;
  title: string;
  content: string;
  url?: string;
  source?: string;
  category?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  chunks?: DocumentChunk[];
}

/**
 * Structure of a document chunk for long document handling
 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  embedding?: number[];
}

/**
 * Result of a knowledge base query
 */
export interface KnowledgeBaseQueryResult {
  entries: Array<FAQEntry | DocumentEntry | DocumentChunk>;
  relevanceScores: Map<string, number>;
  sourceNodes?: KnowledgeNode[];
}

/**
 * Configuration options for the KnowledgeBase
 */
export interface KnowledgeBaseConfig {
  persistPath?: string;
  graphPersistPath?: string;
  embeddingService?: EmbeddingService;
  autoSaveInterval?: number;
  maxResults?: number;
  relevanceThreshold?: number;
  
  // Document chunking options
  enableChunking?: boolean;
  chunkSize?: number;
  chunkOverlap?: number;
  maxDocumentLength?: number;
}

/**
 * KnowledgeBase implementation that integrates with KnowledgeGraph for
 * storing and retrieving company-specific information
 */
export class KnowledgeBase extends EventEmitter {
  private faqs: Map<string, FAQEntry> = new Map();
  private documents: Map<string, DocumentEntry> = new Map();
  private graph: KnowledgeGraph;
  private embeddingService: EmbeddingService;
  private faqEmbeddings: Map<string, number[]> = new Map();
  private documentEmbeddings: Map<string, number[]> = new Map();
  private documentChunkEmbeddings: Map<string, number[]> = new Map();
  private config: KnowledgeBaseConfig;
  private dirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  constructor(config: KnowledgeBaseConfig = {}) {
    super();
    this.config = {
      persistPath: config.persistPath,
      graphPersistPath: config.graphPersistPath,
      embeddingService: config.embeddingService,
      autoSaveInterval: config.autoSaveInterval || 60000, // Default: 1 minute
      maxResults: config.maxResults || 5,
      relevanceThreshold: config.relevanceThreshold || 0.6,
      
      // Document chunking options with defaults
      enableChunking: config.enableChunking ?? true,
      chunkSize: config.chunkSize || 8000,
      chunkOverlap: config.chunkOverlap || 200,
      maxDocumentLength: config.maxDocumentLength || 100000 // 100k chars max by default
    };

    this.graph = new KnowledgeGraph({
      persistPath: this.config.graphPersistPath,
      autoSaveInterval: this.config.autoSaveInterval
    });

    const logger = new Logger('KnowledgeBase');
    if (!this.config.embeddingService) {
      logger.warn('No embedding service provided to KnowledgeBase, semantic search will be limited');
      // Create a mock embedding service if none provided
      this.embeddingService = new EmbeddingService({
        apiKey: process.env.OPENAI_API_KEY || 'dummy-key',
        model: 'text-embedding-3-small'
      });
    } else {
      this.embeddingService = this.config.embeddingService;
    }

    if (this.config.persistPath) {
      this.setupAutoSave();
      this.load();
    }
  }

  /**
   * Initialize the knowledge base
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    const logger = new Logger('KnowledgeBase');
    
    // Generate embeddings for existing FAQs and documents if needed
    const faqEmbeddingPromises = Array.from(this.faqs.values())
      .filter(faq => !this.faqEmbeddings.has(faq.id))
      .map(async faq => {
        const embedding = await this.embeddingService.embedText(
          `Question: ${faq.question} Answer: ${faq.answer}`
        );
        this.faqEmbeddings.set(faq.id, embedding);
      });
    
    // Process documents, handling chunking if enabled  
    const documentPromises = Array.from(this.documents.values()).map(async doc => {
      // Generate embedding for document title + summary
      if (!this.documentEmbeddings.has(doc.id)) {
        // Extract first 500 chars for a summary embedding with title
        const summaryText = `${doc.title} ${doc.content?.substring(0, 500) || ''}`;
        const embedding = await this.embeddingService.embedText(summaryText);
        this.documentEmbeddings.set(doc.id, embedding);
      }
      
      // Process chunks if chunking is enabled and content is long
      if (this.config.enableChunking && 
          doc.content && doc.content.length > (this.config.chunkSize || 8000) && 
          (!doc.chunks || doc.chunks.length === 0)) {
          
        logger.debug(`Chunking document "${doc.title}" (${doc.content.length} chars)`);
        await this.processDocumentChunks(doc);
      }
    });
      
    await Promise.all([...faqEmbeddingPromises, ...documentPromises]);
    
    this.initialized = true;
    this.emit('initialized');
    logger.debug('Knowledge base initialized');
  }
  
  /**
   * Process document content into chunks and generate embeddings
   */
  private async processDocumentChunks(document: DocumentEntry): Promise<void> {
    const logger = new Logger('KnowledgeBase');
    const docContent = document.content;
    
    // Skip if content is small enough to not need chunking
    if (!docContent || docContent.length <= (this.config.chunkSize || 8000)) {
      return;
    }
    
    // Create chunks
    const chunks = this.chunkText(docContent, document.id);
    logger.debug(`Created ${chunks.length} chunks for document "${document.title}"`);
    
    // Add chunks to document
    document.chunks = chunks;
    
    // Generate embeddings for chunks in batches to be more efficient
    const batchSize = 5;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      
      // Create embeddings in parallel for this batch
      const embedPromises = batchChunks.map(async chunk => {
        const embedding = await this.embeddingService.embedText(chunk.content);
        this.documentChunkEmbeddings.set(chunk.id, embedding);
        chunk.embedding = embedding; // Store in the chunk itself too
        return embedding;
      });
      
      await Promise.all(embedPromises);
      logger.debug(`Embedded batch ${i/batchSize + 1}/${Math.ceil(chunks.length/batchSize)} for document "${document.title}"`);
    }
    
    // Mark as dirty to save changes
    this.markDirty();
  }
  
  /**
   * Split text into chunks for better embedding and retrieval
   */
  private chunkText(text: string, documentId: string): DocumentChunk[] {
    if (!text) return [];
    
    const chunkSize = this.config.chunkSize || 8000;
    const overlap = this.config.chunkOverlap || 200;
    
    // If text is smaller than chunk size, return it as a single chunk
    if (text.length <= chunkSize) {
      return [{
        id: `chunk-${documentId}-0`,
        documentId,
        content: text,
        index: 0
      }];
    }
    
    const chunks: DocumentChunk[] = [];
    let startIndex = 0;
    let chunkIndex = 0;
    
    while (startIndex < text.length) {
      let endIndex = startIndex + chunkSize;
      
      // If this isn't the last chunk, try to find a good break point
      if (endIndex < text.length) {
        // Look for a good breaking point (period, question mark, etc.)
        const possibleBreakpoints = ['. ', '! ', '? ', '\n\n', '\n', '. ', ', ', '; '];
        
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
      chunks.push({
        id: `chunk-${documentId}-${chunkIndex}`,
        documentId,
        content: text.substring(startIndex, endIndex),
        index: chunkIndex
      });
      
      // Move to next chunk with overlap
      startIndex = endIndex - overlap;
      chunkIndex++;
    }
    
    return chunks;
  }

  /**
   * Add a new FAQ entry to the knowledge base
   */
  async addFAQ(question: string, answer: string, category?: string, tags: string[] = []): Promise<FAQEntry> {
    const now = new Date();
    const faq: FAQEntry = {
      id: uuidv4(),
      question,
      answer,
      category,
      tags,
      createdAt: now,
      updatedAt: now
    };

    // Store the FAQ
    this.faqs.set(faq.id, faq);
    
    // Add to knowledge graph
    const faqNode = this.graph.createNode('faq', question, {
      id: faq.id,
      answer,
      category,
      tags: tags.join(',')
    });

    // Add category relationship if available
    if (category) {
      // Check if category node exists
      let categoryNodes = this.graph.findNodes('category', category);
      let categoryNode;
      
      if (categoryNodes.length === 0) {
        // Create category node if it doesn't exist
        categoryNode = this.graph.createNode('category', category);
      } else {
        categoryNode = categoryNodes[0];
      }
      
      // Create relationship
      this.graph.createRelationship(faqNode.id, categoryNode.id, 'belongs_to');
    }
    
    // Add tag relationships
    for (const tag of tags) {
      // Check if tag node exists
      let tagNodes = this.graph.findNodes('tag', tag);
      let tagNode;
      
      if (tagNodes.length === 0) {
        // Create tag node if it doesn't exist
        tagNode = this.graph.createNode('tag', tag);
      } else {
        tagNode = tagNodes[0];
      }
      
      // Create relationship
      this.graph.createRelationship(faqNode.id, tagNode.id, 'tagged_with');
    }
    
    // Generate and store embedding
    if (this.initialized) {
      const embedding = await this.embeddingService.embedText(
        `Question: ${question} Answer: ${answer}`
      );
      this.faqEmbeddings.set(faq.id, embedding);
    }
    
    this.markDirty();
    this.emit('faqAdded', faq);
    
    return faq;
  }

  /**
   * Add a new document to the knowledge base
   */
  async addDocument(
    title: string, 
    content: string, 
    url?: string, 
    source?: string,
    category?: string, 
    tags: string[] = []
  ): Promise<DocumentEntry> {
    const logger = new Logger('KnowledgeBase');
    const now = new Date();

    // Check for maximum document length limit
    if (content.length > (this.config.maxDocumentLength || 100000)) {
      logger.warn(`Document "${title}" exceeds maximum length (${content.length} > ${this.config.maxDocumentLength || 100000}). Truncating content.`);
      content = content.substring(0, this.config.maxDocumentLength || 100000);
    }
    
    const document: DocumentEntry = {
      id: uuidv4(),
      title,
      content,
      url,
      source,
      category,
      tags,
      createdAt: now,
      updatedAt: now
    };

    // Store the document
    this.documents.set(document.id, document);
    
    // Add to knowledge graph
    const docNode = this.graph.createNode('document', title, {
      id: document.id,
      url,
      source,
      category,
      tags: tags.join(',')
    });

    // Add category relationship if available
    if (category) {
      // Check if category node exists
      let categoryNodes = this.graph.findNodes('category', category);
      let categoryNode;
      
      if (categoryNodes.length === 0) {
        // Create category node if it doesn't exist
        categoryNode = this.graph.createNode('category', category);
      } else {
        categoryNode = categoryNodes[0];
      }
      
      // Create relationship
      this.graph.createRelationship(docNode.id, categoryNode.id, 'belongs_to');
    }
    
    // Add tag relationships
    for (const tag of tags) {
      // Check if tag node exists
      let tagNodes = this.graph.findNodes('tag', tag);
      let tagNode;
      
      if (tagNodes.length === 0) {
        // Create tag node if it doesn't exist
        tagNode = this.graph.createNode('tag', tag);
      } else {
        tagNode = tagNodes[0];
      }
      
      // Create relationship
      this.graph.createRelationship(docNode.id, tagNode.id, 'tagged_with');
    }
    
    // If we're initialized and the content is long enough, process chunking
    if (this.initialized) {
      // Create a summary embedding (title + first part)
      const summaryText = `${title} ${content.substring(0, 500)}`;
      const embedding = await this.embeddingService.embedText(summaryText);
      this.documentEmbeddings.set(document.id, embedding);
      
      // Process chunks if needed
      if (this.config.enableChunking && content.length > (this.config.chunkSize || 8000)) {
        logger.debug(`Chunking document "${title}" (${content.length} chars)`);
        await this.processDocumentChunks(document);
      }
    }
    
    this.markDirty();
    this.emit('documentAdded', document);
    
    return document;
  }

  /**
   * Update an existing FAQ entry
   */
  async updateFAQ(id: string, updates: Partial<Omit<FAQEntry, 'id' | 'createdAt'>>): Promise<FAQEntry> {
    const faq = this.faqs.get(id);
    if (!faq) {
      throw new Error(`FAQ with ID ${id} does not exist`);
    }
    
    const updatedFAQ = {
      ...faq,
      ...updates,
      updatedAt: new Date()
    };
    
    // Update FAQ in storage
    this.faqs.set(id, updatedFAQ);
    
    // Update the knowledge graph
    // First find the corresponding node
    const nodes = this.graph.findNodes('faq').filter(node => node.properties.id === id);
    if (nodes.length > 0) {
      const node = nodes[0];
      
      // Update node properties
      this.graph.updateNode(node.id, {
        label: updates.question || node.label,
        properties: {
          ...node.properties,
          answer: updates.answer || node.properties.answer,
          category: updates.category || node.properties.category,
          tags: updates.tags ? updates.tags.join(',') : node.properties.tags
        }
      });
      
      // Update category relationship if changed
      if (updates.category && updates.category !== faq.category) {
        // Remove old category relationship if it exists
        if (faq.category) {
          const oldCategoryNodes = this.graph.findNodes('category', faq.category);
          if (oldCategoryNodes.length > 0) {
            const oldCatNode = oldCategoryNodes[0];
            const relationships = this.graph.getOutgoingRelationships(node.id)
              .filter(rel => rel.type === 'belongs_to' && rel.targetId === oldCatNode.id);
            
            for (const rel of relationships) {
              this.graph.deleteRelationship(rel.id);
            }
          }
        }
        
        // Add new category relationship
        let categoryNodes = this.graph.findNodes('category', updates.category);
        let categoryNode;
        
        if (categoryNodes.length === 0) {
          categoryNode = this.graph.createNode('category', updates.category);
        } else {
          categoryNode = categoryNodes[0];
        }
        
        this.graph.createRelationship(node.id, categoryNode.id, 'belongs_to');
      }
      
      // Update tag relationships if changed
      if (updates.tags) {
        // Remove old tag relationships
        const oldTagRels = this.graph.getOutgoingRelationships(node.id)
          .filter(rel => rel.type === 'tagged_with');
        
        for (const rel of oldTagRels) {
          this.graph.deleteRelationship(rel.id);
        }
        
        // Add new tag relationships
        for (const tag of updates.tags) {
          let tagNodes = this.graph.findNodes('tag', tag);
          let tagNode;
          
          if (tagNodes.length === 0) {
            tagNode = this.graph.createNode('tag', tag);
          } else {
            tagNode = tagNodes[0];
          }
          
          this.graph.createRelationship(node.id, tagNode.id, 'tagged_with');
        }
      }
    }
    
    // Update embedding if question or answer changed
    if (updates.question || updates.answer) {
      const embedding = await this.embeddingService.embedText(
        `Question: ${updatedFAQ.question} Answer: ${updatedFAQ.answer}`
      );
      this.faqEmbeddings.set(id, embedding);
    }
    
    this.markDirty();
    this.emit('faqUpdated', updatedFAQ);
    
    return updatedFAQ;
  }

  /**
   * Update an existing document
   */
  async updateDocument(
    id: string, 
    updates: Partial<Omit<DocumentEntry, 'id' | 'createdAt'>>
  ): Promise<DocumentEntry> {
    const logger = new Logger('KnowledgeBase');
    const document = this.documents.get(id);
    if (!document) {
      throw new Error(`Document with ID ${id} does not exist`);
    }
    
    // Check content length if content is being updated
    let content = updates.content ?? document.content;
    if (updates.content && updates.content.length > (this.config.maxDocumentLength || 100000)) {
      logger.warn(`Updated document "${updates.title || document.title}" exceeds maximum length (${updates.content.length} > ${this.config.maxDocumentLength || 100000}). Truncating content.`);
      content = updates.content.substring(0, this.config.maxDocumentLength || 100000);
    }
    
    const updatedDocument = {
      ...document,
      ...updates,
      content, // Use possibly truncated content
      updatedAt: new Date()
    };
    
    // Update document in storage
    this.documents.set(id, updatedDocument);
    
    // Update the knowledge graph
    // First find the corresponding node
    const nodes = this.graph.findNodes('document').filter(node => node.properties.id === id);
    if (nodes.length > 0) {
      const node = nodes[0];
      
      // Update node properties
      this.graph.updateNode(node.id, {
        label: updates.title || node.label,
        properties: {
          ...node.properties,
          url: updates.url || node.properties.url,
          source: updates.source || node.properties.source,
          category: updates.category || node.properties.category,
          tags: updates.tags ? updates.tags.join(',') : node.properties.tags
        }
      });
      
      // Update category relationship if changed
      if (updates.category && updates.category !== document.category) {
        // Remove old category relationship if it exists
        if (document.category) {
          const oldCategoryNodes = this.graph.findNodes('category', document.category);
          if (oldCategoryNodes.length > 0) {
            const oldCatNode = oldCategoryNodes[0];
            const relationships = this.graph.getOutgoingRelationships(node.id)
              .filter(rel => rel.type === 'belongs_to' && rel.targetId === oldCatNode.id);
            
            for (const rel of relationships) {
              this.graph.deleteRelationship(rel.id);
            }
          }
        }
        
        // Add new category relationship
        let categoryNodes = this.graph.findNodes('category', updates.category);
        let categoryNode;
        
        if (categoryNodes.length === 0) {
          categoryNode = this.graph.createNode('category', updates.category);
        } else {
          categoryNode = categoryNodes[0];
        }
        
        this.graph.createRelationship(node.id, categoryNode.id, 'belongs_to');
      }
      
      // Update tag relationships if changed
      if (updates.tags) {
        // Remove old tag relationships
        const oldTagRels = this.graph.getOutgoingRelationships(node.id)
          .filter(rel => rel.type === 'tagged_with');
        
        for (const rel of oldTagRels) {
          this.graph.deleteRelationship(rel.id);
        }
        
        // Add new tag relationships
        for (const tag of updates.tags) {
          let tagNodes = this.graph.findNodes('tag', tag);
          let tagNode;
          
          if (tagNodes.length === 0) {
            tagNode = this.graph.createNode('tag', tag);
          } else {
            tagNode = tagNodes[0];
          }
          
          this.graph.createRelationship(node.id, tagNode.id, 'tagged_with');
        }
      }
    }
    
    // Content updated - regenerate all embeddings and chunks
    if (updates.content) {
      // Generate a new summary embedding
      const summaryText = `${updatedDocument.title} ${updatedDocument.content.substring(0, 500)}`;
      const embedding = await this.embeddingService.embedText(summaryText);
      this.documentEmbeddings.set(id, embedding);
      
      // Clear existing chunks and their embeddings
      if (document.chunks) {
        for (const chunk of document.chunks) {
          this.documentChunkEmbeddings.delete(chunk.id);
        }
      }
      
      // Process new chunks if needed
      if (this.config.enableChunking && updatedDocument.content && updatedDocument.content.length > (this.config.chunkSize || 8000)) {
        logger.debug(`Re-chunking updated document "${updatedDocument.title}" (${updatedDocument.content.length} chars)`);
        await this.processDocumentChunks(updatedDocument);
      } else {
        // Remove chunks if content is now small
        updatedDocument.chunks = [];
      }
    } 
    // Title updated but not content - update only the summary embedding
    else if (updates.title) {
      const summaryText = `${updatedDocument.title} ${updatedDocument.content.substring(0, 500)}`;
      const embedding = await this.embeddingService.embedText(summaryText);
      this.documentEmbeddings.set(id, embedding);
    }
    
    this.markDirty();
    this.emit('documentUpdated', updatedDocument);
    
    return updatedDocument;
  }

  /**
   * Delete an FAQ entry
   */
  deleteFAQ(id: string): boolean {
    const faq = this.faqs.get(id);
    if (!faq) {
      return false;
    }
    
    // Remove from storage
    this.faqs.delete(id);
    this.faqEmbeddings.delete(id);
    
    // Remove from knowledge graph
    const nodes = this.graph.findNodes('faq').filter(node => node.properties.id === id);
    for (const node of nodes) {
      this.graph.deleteNode(node.id);
    }
    
    this.markDirty();
    this.emit('faqDeleted', faq);
    
    return true;
  }

  /**
   * Delete a document
   */
  deleteDocument(id: string): boolean {
    const document = this.documents.get(id);
    if (!document) {
      return false;
    }
    
    // Remove from storage
    this.documents.delete(id);
    this.documentEmbeddings.delete(id);
    
    // Remove chunk embeddings if exist
    if (document.chunks && document.chunks.length > 0) {
      for (const chunk of document.chunks) {
        this.documentChunkEmbeddings.delete(chunk.id);
      }
    }
    
    // Remove from knowledge graph
    const nodes = this.graph.findNodes('document').filter(node => node.properties.id === id);
    for (const node of nodes) {
      this.graph.deleteNode(node.id);
    }
    
    this.markDirty();
    this.emit('documentDeleted', document);
    
    return true;
  }

  /**
   * Query the knowledge base for relevant information
   */
  async query(query: string, options: {
    maxResults?: number;
    types?: Array<'faq' | 'document' | 'chunk'>;
    categories?: string[];
    tags?: string[];
    relevanceThreshold?: number;
    preferChunks?: boolean;
  } = {}): Promise<KnowledgeBaseQueryResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const logger = new Logger('KnowledgeBase');
    const maxResults = options.maxResults || this.config.maxResults || 5;
    const relevanceThreshold = options.relevanceThreshold || this.config.relevanceThreshold || 0.6;
    const types = options.types || ['faq', 'document', 'chunk'];
    const preferChunks = options.preferChunks ?? true;
    
    // Get embedding for the query
    const queryEmbedding = await this.embeddingService.embedText(query);
    
    // Find relevant entries by vector similarity
    type RelevantEntry = { 
      entry: FAQEntry | DocumentEntry | DocumentChunk; 
      score: number;
      isChunk?: boolean;
      documentId?: string;
    };
    
    const relevantEntries: RelevantEntry[] = [];
    const relevanceScores = new Map<string, number>();
    const processedDocIds = new Set<string>(); // To track which documents we've already processed chunks for
    
    // Process FAQs if requested
    if (types.includes('faq')) {
      for (const [faqId, embedding] of this.faqEmbeddings.entries()) {
        const faq = this.faqs.get(faqId);
        if (!faq) continue;
        
        // Filter by category if provided
        if (options.categories && options.categories.length > 0) {
          if (!faq.category || !options.categories.includes(faq.category)) {
            continue;
          }
        }
        
        // Filter by tags if provided
        if (options.tags && options.tags.length > 0) {
          if (!faq.tags || !options.tags.some(tag => faq.tags!.includes(tag))) {
            continue;
          }
        }
        
        const score = this.embeddingService.calculateSimilarity(queryEmbedding, embedding);
        if (score >= relevanceThreshold) {
          relevantEntries.push({ entry: faq, score });
          relevanceScores.set(faq.id, score);
        }
      }
    }
    
    // Process documents and chunks
    if (types.includes('document') || types.includes('chunk')) {
      // First pass - check document embeddings (summary embeddings) for relevance
      for (const [docId, embedding] of this.documentEmbeddings.entries()) {
        const doc = this.documents.get(docId);
        if (!doc) continue;
        
        // Filter by category if provided
        if (options.categories && options.categories.length > 0) {
          if (!doc.category || !options.categories.includes(doc.category)) {
            continue;
          }
        }
        
        // Filter by tags if provided
        if (options.tags && options.tags.length > 0) {
          if (!doc.tags || !options.tags.some(tag => doc.tags!.includes(tag))) {
            continue;
          }
        }
        
        const score = this.embeddingService.calculateSimilarity(queryEmbedding, embedding);
        
        // If document is relevant, check if it has chunks to include instead
        if (score >= relevanceThreshold) {
          // If document has chunks and we want to use them
          if (preferChunks && types.includes('chunk') && doc.chunks && doc.chunks.length > 0) {
            let foundRelevantChunk = false;
            
            // Check each chunk for relevance
            for (const chunk of doc.chunks) {
              // Get embedding from map or from the chunk itself
              const chunkEmbedding = this.documentChunkEmbeddings.get(chunk.id) || chunk.embedding;
              
              if (chunkEmbedding) {
                const chunkScore = this.embeddingService.calculateSimilarity(queryEmbedding, chunkEmbedding);
                
                if (chunkScore >= relevanceThreshold) {
                  // Add chunk as a relevant entry
                  relevantEntries.push({ 
                    entry: chunk, 
                    score: chunkScore,
                    isChunk: true,
                    documentId: doc.id
                  });
                  relevanceScores.set(chunk.id, chunkScore);
                  foundRelevantChunk = true;
                }
              }
            }
            
            processedDocIds.add(doc.id);
            
            // If no relevant chunks found, add the document itself
            if (!foundRelevantChunk && types.includes('document')) {
              relevantEntries.push({ entry: doc, score });
              relevanceScores.set(doc.id, score);
            }
          } 
          // No chunks or not preferring chunks - add the document itself
          else if (types.includes('document')) {
            relevantEntries.push({ entry: doc, score });
            relevanceScores.set(doc.id, score);
          }
        }
      }
      
      // Second pass - explicitly search chunks for documents we haven't processed yet
      // This is important for finding relevant chunks in documents that didn't have a high document-level score
      if (types.includes('chunk')) {
        const unprocessedDocs = Array.from(this.documents.values())
          .filter(doc => !processedDocIds.has(doc.id) && doc.chunks && doc.chunks.length > 0);
          
        for (const doc of unprocessedDocs) {
          // Filter by category if provided
          if (options.categories && options.categories.length > 0) {
            if (!doc.category || !options.categories.includes(doc.category)) {
              continue;
            }
          }
          
          // Filter by tags if provided
          if (options.tags && options.tags.length > 0) {
            if (!doc.tags || !options.tags.some(tag => doc.tags!.includes(tag))) {
              continue;
            }
          }
          
          let foundRelevantChunk = false;
          
          for (const chunk of doc.chunks!) {
            // Get embedding from map or from the chunk itself
            const chunkEmbedding = this.documentChunkEmbeddings.get(chunk.id) || chunk.embedding;
            
            if (chunkEmbedding) {
              const chunkScore = this.embeddingService.calculateSimilarity(queryEmbedding, chunkEmbedding);
              
              if (chunkScore >= relevanceThreshold) {
                // Add chunk as a relevant entry
                relevantEntries.push({ 
                  entry: chunk, 
                  score: chunkScore,
                  isChunk: true,
                  documentId: doc.id
                });
                relevanceScores.set(chunk.id, chunkScore);
                foundRelevantChunk = true;
              }
            }
          }
        }
      }
    }
    
    // Sort by relevance and limit results
    relevantEntries.sort((a, b) => b.score - a.score);
    let topEntries = relevantEntries.slice(0, maxResults);
    
    // Find unique document IDs to get related nodes
    const docIds = new Set<string>();
    const faqIds = new Set<string>();
    
    for (const { entry, isChunk, documentId } of topEntries) {
      if (isChunk && documentId) {
        docIds.add(documentId);
      } else if ('question' in entry) {
        faqIds.add(entry.id);
      } else if (!isChunk) {
        docIds.add(entry.id);
      }
    }
    
    // Use the knowledge graph to find related information
    const sourceNodes: KnowledgeNode[] = [];
    
    // Get nodes for FAQs
    for (const faqId of faqIds) {
      const nodes = this.graph.findNodes('faq').filter(node => node.properties.id === faqId);
      if (nodes.length > 0) {
        const graphResult = this.graph.traverseGraph(nodes[0].id, 1);
        sourceNodes.push(...graphResult.nodes);
      }
    }
    
    // Get nodes for documents
    for (const docId of docIds) {
      const nodes = this.graph.findNodes('document').filter(node => node.properties.id === docId);
      if (nodes.length > 0) {
        const graphResult = this.graph.traverseGraph(nodes[0].id, 1);
        sourceNodes.push(...graphResult.nodes);
      }
    }
    
    // For document chunks, make sure we include the parent document information
    if (topEntries.some(entry => entry.isChunk)) {
      // Create a map of documentIds to their full documents
      const docMap = new Map<string, DocumentEntry>();
      for (const docId of docIds) {
        const doc = this.documents.get(docId);
        if (doc) {
          docMap.set(docId, doc);
        }
      }
      
      // For each chunk entry, add metadata about its parent
      for (const entry of topEntries) {
        if (entry.isChunk && entry.documentId) {
          const parentDoc = docMap.get(entry.documentId);
          if (parentDoc) {
            // Attach document metadata to the chunk
            (entry.entry as DocumentChunk as any).parentTitle = parentDoc.title;
            (entry.entry as DocumentChunk as any).parentUrl = parentDoc.url;
            (entry.entry as DocumentChunk as any).parentSource = parentDoc.source;
            (entry.entry as DocumentChunk as any).parentCategory = parentDoc.category;
            (entry.entry as DocumentChunk as any).parentTags = parentDoc.tags;
          }
        }
      }
    }
    
    logger.debug(`Query "${query.substring(0, 50)}..." matched ${relevantEntries.length} entries, returning top ${topEntries.length}`);
    
    return {
      entries: topEntries.map(item => item.entry),
      relevanceScores,
      sourceNodes
    };
  }

  /**
   * Find FAQs by category
   */
  getFAQsByCategory(category: string): FAQEntry[] {
    return Array.from(this.faqs.values())
      .filter(faq => faq.category === category);
  }

  /**
   * Find documents by category
   */
  getDocumentsByCategory(category: string): DocumentEntry[] {
    return Array.from(this.documents.values())
      .filter(doc => doc.category === category);
  }

  /**
   * Find FAQs by tag
   */
  getFAQsByTag(tag: string): FAQEntry[] {
    return Array.from(this.faqs.values())
      .filter(faq => faq.tags && faq.tags.includes(tag));
  }

  /**
   * Find documents by tag
   */
  getDocumentsByTag(tag: string): DocumentEntry[] {
    return Array.from(this.documents.values())
      .filter(doc => doc.tags && doc.tags.includes(tag));
  }

  /**
   * Ingest a bulk set of FAQs from a JSON array
   */
  async ingestFAQs(faqs: Array<{
    question: string;
    answer: string;
    category?: string;
    tags?: string[];
  }>): Promise<FAQEntry[]> {
    const results: FAQEntry[] = [];
    
    for (const faq of faqs) {
      const newFaq = await this.addFAQ(
        faq.question,
        faq.answer,
        faq.category,
        faq.tags
      );
      results.push(newFaq);
    }
    
    return results;
  }

  /**
   * Ingest a bulk set of documents from a JSON array
   */
  async ingestDocuments(documents: Array<{
    title: string;
    content: string;
    url?: string;
    source?: string;
    category?: string;
    tags?: string[];
  }>): Promise<DocumentEntry[]> {
    const results: DocumentEntry[] = [];
    
    for (const doc of documents) {
      const newDoc = await this.addDocument(
        doc.title,
        doc.content,
        doc.url,
        doc.source,
        doc.category,
        doc.tags
      );
      results.push(newDoc);
    }
    
    return results;
  }

  /**
   * Generate context for agents by retrieving relevant information
   * from the knowledge base
   */
  async generateContext(query: string, options: {
    maxResults?: number;
    types?: Array<'faq' | 'document' | 'chunk'>;
    categories?: string[];
    tags?: string[];
    relevanceThreshold?: number;
    format?: 'markdown' | 'text';
    preferChunks?: boolean;
  } = {}): Promise<string> {
    const format = options.format || 'markdown';
    const results = await this.query(query, options);
    
    if (results.entries.length === 0) {
      return '';
    }
    
    let context = '';
    
    if (format === 'markdown') {
      context += '## Relevant Knowledge Base Information\n\n';
      
      for (const entry of results.entries) {
        const score = results.relevanceScores.get(entry.id);
        const scoreText = score ? ` (relevance: ${score.toFixed(2)})` : '';
        
        if ('question' in entry) {
          // FAQ entry
          context += `### Q: ${entry.question}${scoreText}\n\n`;
          context += `${entry.answer}\n\n`;
          
          if (entry.category) {
            context += `*Category: ${entry.category}*\n\n`;
          }
          
          if (entry.tags && entry.tags.length > 0) {
            context += `*Tags: ${entry.tags.join(', ')}*\n\n`;
          }
        } else if ('documentId' in entry) {
          // Document chunk
          const parentTitle = (entry as any).parentTitle || 'Document Chunk';
          const chunkNumber = entry.index + 1;
          
          context += `### ${parentTitle} (Chunk ${chunkNumber})${scoreText}\n\n`;
          context += `${entry.content}\n\n`;
          
          if ((entry as any).parentUrl) {
            context += `*Source: [${(entry as any).parentUrl}](${(entry as any).parentUrl})*\n\n`;
          } else if ((entry as any).parentSource) {
            context += `*Source: ${(entry as any).parentSource}*\n\n`;
          }
          
          if ((entry as any).parentCategory) {
            context += `*Category: ${(entry as any).parentCategory}*\n\n`;
          }
          
          if ((entry as any).parentTags && (entry as any).parentTags.length > 0) {
            context += `*Tags: ${(entry as any).parentTags.join(', ')}*\n\n`;
          }
        } else {
          // Document entry
          context += `### ${entry.title}${scoreText}\n\n`;
          
          // Truncate content if it's too long
          const maxLength = 1000;
          const content = entry.content.length > maxLength
            ? entry.content.substring(0, maxLength) + '...'
            : entry.content;
            
          context += `${content}\n\n`;
          
          if (entry.url) {
            context += `*Source: [${entry.url}](${entry.url})*\n\n`;
          } else if (entry.source) {
            context += `*Source: ${entry.source}*\n\n`;
          }
          
          if (entry.category) {
            context += `*Category: ${entry.category}*\n\n`;
          }
          
          if (entry.tags && entry.tags.length > 0) {
            context += `*Tags: ${entry.tags.join(', ')}*\n\n`;
          }
        }
      }
    } else {
      // Plain text format
      context += 'RELEVANT KNOWLEDGE BASE INFORMATION:\n\n';
      
      for (const entry of results.entries) {
        if ('question' in entry) {
          // FAQ entry
          context += `Q: ${entry.question}\n`;
          context += `A: ${entry.answer}\n\n`;
          
          if (entry.category) {
            context += `Category: ${entry.category}\n`;
          }
          
          if (entry.tags && entry.tags.length > 0) {
            context += `Tags: ${entry.tags.join(', ')}\n`;
          }
          
          context += '\n';
        } else if ('documentId' in entry) {
          // Document chunk
          const parentTitle = (entry as any).parentTitle || 'Document Chunk';
          const chunkNumber = entry.index + 1;
          
          context += `TITLE: ${parentTitle} (Chunk ${chunkNumber})\n\n`;
          context += `${entry.content}\n\n`;
          
          if ((entry as any).parentUrl) {
            context += `Source: ${(entry as any).parentUrl}\n`;
          } else if ((entry as any).parentSource) {
            context += `Source: ${(entry as any).parentSource}\n`;
          }
          
          if ((entry as any).parentCategory) {
            context += `Category: ${(entry as any).parentCategory}\n`;
          }
          
          if ((entry as any).parentTags && (entry as any).parentTags.length > 0) {
            context += `Tags: ${(entry as any).parentTags.join(', ')}\n`;
          }
          
          context += '\n';
        } else {
          // Document entry
          context += `TITLE: ${entry.title}\n\n`;
          
          // Truncate content if it's too long
          const maxLength = 1000;
          const content = entry.content.length > maxLength
            ? entry.content.substring(0, maxLength) + '...'
            : entry.content;
            
          context += `${content}\n\n`;
          
          if (entry.url) {
            context += `Source: ${entry.url}\n`;
          } else if (entry.source) {
            context += `Source: ${entry.source}\n`;
          }
          
          if (entry.category) {
            context += `Category: ${entry.category}\n`;
          }
          
          if (entry.tags && entry.tags.length > 0) {
            context += `Tags: ${entry.tags.join(', ')}\n`;
          }
          
          context += '\n';
        }
      }
    }
    
    return context;
  }

  /**
   * Mark the knowledge base as dirty and needing to be saved
   */
  private markDirty() {
    this.dirty = true;
  }

  /**
   * Set up auto-save functionality
   */
  private setupAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
    }
    
    this.saveTimer = setInterval(() => {
      if (this.dirty) {
        this.save();
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Save the knowledge base to disk
   */
  save(): boolean {
    if (!this.config.persistPath) {
      return false;
    }
    
    try {
      const fs = require('fs');
      const logger = new Logger('KnowledgeBase');
      
      // Prepare documents for saving
      const documentsForSaving = Array.from(this.documents.values()).map(doc => {
        // If the document has chunks with embeddings, we need to prepare
        // them specially for serialization
        if (doc.chunks) {
          // Create a serializable copy that doesn't include the large embedding arrays
          // which will be recreated when needed
          return {
            ...doc,
            chunks: doc.chunks.map(chunk => ({
              id: chunk.id,
              documentId: chunk.documentId,
              content: chunk.content,
              index: chunk.index
              // Exclude chunk.embedding to save space
            }))
          };
        }
        return doc;
      });
      
      const data = {
        faqs: Array.from(this.faqs.values()),
        documents: documentsForSaving
      };
      
      fs.writeFileSync(this.config.persistPath, JSON.stringify(data, null, 2));
      this.dirty = false;
      this.graph.save(); // Also save the graph
      logger.debug(`Saved knowledge base to ${this.config.persistPath}`);
      return true;
    } catch (error) {
      const logger = new Logger('KnowledgeBase');
      logger.error(`Failed to save knowledge base: ${error}`);
      return false;
    }
  }

  /**
   * Load the knowledge base from disk
   */
  load(): boolean {
    if (!this.config.persistPath) {
      return false;
    }
    
    try {
      const fs = require('fs');
      const logger = new Logger('KnowledgeBase');
      
      if (!fs.existsSync(this.config.persistPath)) {
        logger.debug(`No knowledge base file found at ${this.config.persistPath}`);
        return false;
      }
      
      const data = JSON.parse(fs.readFileSync(this.config.persistPath, 'utf8'));
      
      // Clear current data
      this.faqs.clear();
      this.documents.clear();
      this.faqEmbeddings.clear();
      this.documentEmbeddings.clear();
      
      // Load FAQs
      if (Array.isArray(data.faqs)) {
        for (const faq of data.faqs) {
          faq.createdAt = new Date(faq.createdAt);
          faq.updatedAt = new Date(faq.updatedAt);
          this.faqs.set(faq.id, faq);
        }
      }
      
      // Load documents
      if (Array.isArray(data.documents)) {
        for (const doc of data.documents) {
          doc.createdAt = new Date(doc.createdAt);
          doc.updatedAt = new Date(doc.updatedAt);
          this.documents.set(doc.id, doc);
        }
      }
      
      this.dirty = false;
      logger.debug(`Loaded knowledge base from ${this.config.persistPath}`);
      
      // We'll generate embeddings in initialize()
      this.initialized = false;
      
      return true;
    } catch (error) {
      const logger = new Logger('KnowledgeBase');
      logger.error(`Failed to load knowledge base: ${error}`);
      return false;
    }
  }

  /**
   * Clear the entire knowledge base
   */
  clear() {
    this.faqs.clear();
    this.documents.clear();
    this.faqEmbeddings.clear();
    this.documentEmbeddings.clear();
    this.graph.clear();
    this.markDirty();
    this.emit('knowledgeBaseCleared');
  }

  /**
   * Get statistics about the knowledge base
   */
  getStats() {
    // Count total chunks across all documents
    let totalChunks = 0;
    let totalChunkSize = 0;
    
    for (const doc of this.documents.values()) {
      if (doc.chunks) {
        totalChunks += doc.chunks.length;
        totalChunkSize += doc.chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
      }
    }
    
    return {
      faqCount: this.faqs.size,
      documentCount: this.documents.size,
      chunkCount: totalChunks,
      averageChunksPerDocument: this.documents.size > 0 ? totalChunks / this.documents.size : 0,
      averageChunkSize: totalChunks > 0 ? totalChunkSize / totalChunks : 0,
      totalContentSize: Array.from(this.documents.values()).reduce((sum, doc) => sum + doc.content.length, 0),
      graphStats: this.graph.getStats(),
      categories: Array.from(
        new Set([
          ...Array.from(this.faqs.values()).map(faq => faq.category).filter(Boolean),
          ...Array.from(this.documents.values()).map(doc => doc.category).filter(Boolean)
        ])
      ),
      tags: Array.from(
        new Set([
          ...Array.from(this.faqs.values()).flatMap(faq => faq.tags || []),
          ...Array.from(this.documents.values()).flatMap(doc => doc.tags || [])
        ])
      )
    };
  }

  /**
   * Get access to the underlying knowledge graph
   */
  getGraph(): KnowledgeGraph {
    return this.graph;
  }
}