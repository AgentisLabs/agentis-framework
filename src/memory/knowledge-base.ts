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
}

/**
 * Result of a knowledge base query
 */
export interface KnowledgeBaseQueryResult {
  entries: Array<FAQEntry | DocumentEntry>;
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
      relevanceThreshold: config.relevanceThreshold || 0.6
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
    
    // Generate embeddings for existing FAQs and documents if needed
    const faqEmbeddingPromises = Array.from(this.faqs.values())
      .filter(faq => !this.faqEmbeddings.has(faq.id))
      .map(async faq => {
        const embedding = await this.embeddingService.embedText(
          `Question: ${faq.question} Answer: ${faq.answer}`
        );
        this.faqEmbeddings.set(faq.id, embedding);
      });
      
    const documentEmbeddingPromises = Array.from(this.documents.values())
      .filter(doc => !this.documentEmbeddings.has(doc.id))
      .map(async doc => {
        const embedding = await this.embeddingService.embedText(
          `${doc.title} ${doc.content.substring(0, 10000)}` // Limit content length
        );
        this.documentEmbeddings.set(doc.id, embedding);
      });
      
    await Promise.all([...faqEmbeddingPromises, ...documentEmbeddingPromises]);
    
    this.initialized = true;
    this.emit('initialized');
    const logger = new Logger('KnowledgeBase');
    logger.debug('Knowledge base initialized');
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
    const now = new Date();
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
    
    // Generate and store embedding
    if (this.initialized) {
      const embedding = await this.embeddingService.embedText(
        `${title} ${content.substring(0, 10000)}` // Limit content length
      );
      this.documentEmbeddings.set(document.id, embedding);
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
    const document = this.documents.get(id);
    if (!document) {
      throw new Error(`Document with ID ${id} does not exist`);
    }
    
    const updatedDocument = {
      ...document,
      ...updates,
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
    
    // Update embedding if title or content changed
    if (updates.title || updates.content) {
      const embedding = await this.embeddingService.embedText(
        `${updatedDocument.title} ${updatedDocument.content.substring(0, 10000)}`
      );
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
    types?: Array<'faq' | 'document'>;
    categories?: string[];
    tags?: string[];
    relevanceThreshold?: number;
  } = {}): Promise<KnowledgeBaseQueryResult> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const maxResults = options.maxResults || this.config.maxResults || 5;
    const relevanceThreshold = options.relevanceThreshold || this.config.relevanceThreshold || 0.6;
    const types = options.types || ['faq', 'document'];
    
    // Get embedding for the query
    const queryEmbedding = await this.embeddingService.embedText(query);
    
    // Find relevant entries by vector similarity
    const relevantEntries: { entry: FAQEntry | DocumentEntry; score: number }[] = [];
    const relevanceScores = new Map<string, number>();
    
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
    
    // Process documents if requested
    if (types.includes('document')) {
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
        if (score >= relevanceThreshold) {
          relevantEntries.push({ entry: doc, score });
          relevanceScores.set(doc.id, score);
        }
      }
    }
    
    // Sort by relevance and limit results
    relevantEntries.sort((a, b) => b.score - a.score);
    const topEntries = relevantEntries.slice(0, maxResults);
    
    // Use the knowledge graph to find related information
    const sourceNodes: KnowledgeNode[] = [];
    for (const { entry } of topEntries) {
      // Find the corresponding node
      let entryType = 'faq' in entry ? 'faq' : 'document';
      const nodes = this.graph.findNodes(entryType).filter(node => node.properties.id === entry.id);
      
      if (nodes.length > 0) {
        // Find related nodes in the graph
        const graphResult = this.graph.traverseGraph(nodes[0].id, 1);
        sourceNodes.push(...graphResult.nodes);
      }
    }
    
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
    types?: Array<'faq' | 'document'>;
    categories?: string[];
    tags?: string[];
    relevanceThreshold?: number;
    format?: 'markdown' | 'text';
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
      
      const data = {
        faqs: Array.from(this.faqs.values()),
        documents: Array.from(this.documents.values())
      };
      
      fs.writeFileSync(this.config.persistPath, JSON.stringify(data, null, 2));
      this.dirty = false;
      this.graph.save(); // Also save the graph
      const logger = new Logger('KnowledgeBase');
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
    return {
      faqCount: this.faqs.size,
      documentCount: this.documents.size,
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