import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';

/**
 * Represents a node in the knowledge graph
 */
export interface KnowledgeNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Represents a relationship between two nodes in the knowledge graph
 */
export interface KnowledgeRelationship {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  properties: Record<string, any>;
  weight: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Configuration options for the KnowledgeGraph
 */
export interface KnowledgeGraphConfig {
  persistPath?: string;
  autoSaveInterval?: number;
  maxRelationshipWeight?: number;
  defaultRelationshipWeight?: number;
}

/**
 * Result of a knowledge graph query
 */
export interface KnowledgeGraphQueryResult {
  nodes: KnowledgeNode[];
  relationships: KnowledgeRelationship[];
  relevanceScore: number;
}

/**
 * A knowledge graph implementation that stores entities and their relationships
 */
export class KnowledgeGraph extends EventEmitter {
  private nodes: Map<string, KnowledgeNode> = new Map();
  private relationships: Map<string, KnowledgeRelationship> = new Map();
  private nodesByType: Map<string, Set<string>> = new Map();
  private nodesByLabel: Map<string, Set<string>> = new Map();
  private relationshipsByType: Map<string, Set<string>> = new Map();
  private relationshipsBySource: Map<string, Set<string>> = new Map();
  private relationshipsByTarget: Map<string, Set<string>> = new Map();
  private config: KnowledgeGraphConfig;
  private dirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(config: KnowledgeGraphConfig = {}) {
    super();
    this.config = {
      persistPath: config.persistPath,
      autoSaveInterval: config.autoSaveInterval || 60000, // Default: 1 minute
      maxRelationshipWeight: config.maxRelationshipWeight || 10,
      defaultRelationshipWeight: config.defaultRelationshipWeight || 1
    };

    if (this.config.persistPath) {
      this.setupAutoSave();
      this.load();
    }
  }

  /**
   * Initialize indexes for efficient graph traversal
   */
  private initializeIndexes() {
    this.nodesByType = new Map();
    this.nodesByLabel = new Map();
    this.relationshipsByType = new Map();
    this.relationshipsBySource = new Map();
    this.relationshipsByTarget = new Map();

    // Index nodes
    for (const node of this.nodes.values()) {
      this.indexNode(node);
    }

    // Index relationships
    for (const relationship of this.relationships.values()) {
      this.indexRelationship(relationship);
    }
  }

  /**
   * Index a node for faster lookup
   */
  private indexNode(node: KnowledgeNode) {
    // Index by type
    if (!this.nodesByType.has(node.type)) {
      this.nodesByType.set(node.type, new Set());
    }
    this.nodesByType.get(node.type)!.add(node.id);

    // Index by label
    if (!this.nodesByLabel.has(node.label)) {
      this.nodesByLabel.set(node.label, new Set());
    }
    this.nodesByLabel.get(node.label)!.add(node.id);
  }

  /**
   * Index a relationship for faster lookup
   */
  private indexRelationship(relationship: KnowledgeRelationship) {
    // Index by type
    if (!this.relationshipsByType.has(relationship.type)) {
      this.relationshipsByType.set(relationship.type, new Set());
    }
    this.relationshipsByType.get(relationship.type)!.add(relationship.id);

    // Index by source node
    if (!this.relationshipsBySource.has(relationship.sourceId)) {
      this.relationshipsBySource.set(relationship.sourceId, new Set());
    }
    this.relationshipsBySource.get(relationship.sourceId)!.add(relationship.id);

    // Index by target node
    if (!this.relationshipsByTarget.has(relationship.targetId)) {
      this.relationshipsByTarget.set(relationship.targetId, new Set());
    }
    this.relationshipsByTarget.get(relationship.targetId)!.add(relationship.id);
  }

  /**
   * Create a new node in the knowledge graph
   */
  createNode(type: string, label: string, properties: Record<string, any> = {}): KnowledgeNode {
    const now = new Date();
    const node: KnowledgeNode = {
      id: uuidv4(),
      type,
      label,
      properties,
      createdAt: now,
      updatedAt: now
    };

    this.nodes.set(node.id, node);
    this.indexNode(node);
    this.markDirty();
    this.emit('nodeCreated', node);
    
    return node;
  }

  /**
   * Create a relationship between two nodes
   */
  createRelationship(
    sourceId: string, 
    targetId: string, 
    type: string, 
    properties: Record<string, any> = {},
    weight?: number
  ): KnowledgeRelationship {
    if (!this.nodes.has(sourceId)) {
      throw new Error(`Source node with ID ${sourceId} does not exist`);
    }
    if (!this.nodes.has(targetId)) {
      throw new Error(`Target node with ID ${targetId} does not exist`);
    }

    const now = new Date();
    const relationship: KnowledgeRelationship = {
      id: uuidv4(),
      type,
      sourceId,
      targetId,
      properties,
      weight: weight !== undefined ? weight : this.config.defaultRelationshipWeight!,
      createdAt: now,
      updatedAt: now
    };

    this.relationships.set(relationship.id, relationship);
    this.indexRelationship(relationship);
    this.markDirty();
    this.emit('relationshipCreated', relationship);
    
    return relationship;
  }

  /**
   * Get a node by its ID
   */
  getNode(id: string): KnowledgeNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get a relationship by its ID
   */
  getRelationship(id: string): KnowledgeRelationship | undefined {
    return this.relationships.get(id);
  }

  /**
   * Find nodes by exact type and label match
   */
  findNodes(type?: string, label?: string): KnowledgeNode[] {
    const result: KnowledgeNode[] = [];
    
    if (type && label) {
      // Find nodes that match both type and label
      const typeNodeIds = this.nodesByType.get(type);
      const labelNodeIds = this.nodesByLabel.get(label);
      
      if (typeNodeIds && labelNodeIds) {
        // Intersection of two sets
        for (const id of typeNodeIds) {
          if (labelNodeIds.has(id)) {
            const node = this.nodes.get(id);
            if (node) result.push(node);
          }
        }
      }
    } else if (type) {
      // Find nodes by type only
      const nodeIds = this.nodesByType.get(type);
      if (nodeIds) {
        for (const id of nodeIds) {
          const node = this.nodes.get(id);
          if (node) result.push(node);
        }
      }
    } else if (label) {
      // Find nodes by label only
      const nodeIds = this.nodesByLabel.get(label);
      if (nodeIds) {
        for (const id of nodeIds) {
          const node = this.nodes.get(id);
          if (node) result.push(node);
        }
      }
    } else {
      // Return all nodes
      return Array.from(this.nodes.values());
    }
    
    return result;
  }

  /**
   * Find relationships by type
   */
  findRelationships(type?: string): KnowledgeRelationship[] {
    if (type) {
      const relationshipIds = this.relationshipsByType.get(type);
      if (!relationshipIds) return [];
      
      return Array.from(relationshipIds)
        .map(id => this.relationships.get(id))
        .filter(Boolean) as KnowledgeRelationship[];
    }
    
    return Array.from(this.relationships.values());
  }

  /**
   * Get all relationships where the specified node is the source
   */
  getOutgoingRelationships(nodeId: string): KnowledgeRelationship[] {
    const relationshipIds = this.relationshipsBySource.get(nodeId);
    if (!relationshipIds) return [];
    
    return Array.from(relationshipIds)
      .map(id => this.relationships.get(id))
      .filter(Boolean) as KnowledgeRelationship[];
  }

  /**
   * Get all relationships where the specified node is the target
   */
  getIncomingRelationships(nodeId: string): KnowledgeRelationship[] {
    const relationshipIds = this.relationshipsByTarget.get(nodeId);
    if (!relationshipIds) return [];
    
    return Array.from(relationshipIds)
      .map(id => this.relationships.get(id))
      .filter(Boolean) as KnowledgeRelationship[];
  }

  /**
   * Get all nodes connected to a specific node
   */
  getConnectedNodes(nodeId: string): KnowledgeNode[] {
    const result = new Set<KnowledgeNode>();
    
    // Get outgoing connections
    const outgoing = this.getOutgoingRelationships(nodeId);
    for (const relationship of outgoing) {
      const targetNode = this.nodes.get(relationship.targetId);
      if (targetNode) result.add(targetNode);
    }
    
    // Get incoming connections
    const incoming = this.getIncomingRelationships(nodeId);
    for (const relationship of incoming) {
      const sourceNode = this.nodes.get(relationship.sourceId);
      if (sourceNode) result.add(sourceNode);
    }
    
    return Array.from(result);
  }

  /**
   * Perform a breadth-first search starting from a node
   * @param startNodeId The ID of the starting node
   * @param maxDepth Maximum traversal depth
   * @param filter Optional filter function for relationships to traverse
   */
  traverseGraph(
    startNodeId: string, 
    maxDepth: number = 2,
    filter?: (relationship: KnowledgeRelationship) => boolean
  ): KnowledgeGraphQueryResult {
    const visitedNodes = new Set<string>();
    const visitedRelationships = new Set<string>();
    const resultNodes: KnowledgeNode[] = [];
    const resultRelationships: KnowledgeRelationship[] = [];
    
    // BFS queue
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: startNodeId, depth: 0 }];
    
    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      
      if (visitedNodes.has(nodeId)) continue;
      
      // Add this node to results
      const node = this.nodes.get(nodeId);
      if (!node) continue;
      
      visitedNodes.add(nodeId);
      resultNodes.push(node);
      
      // Stop if we've reached max depth
      if (depth >= maxDepth) continue;
      
      // Process outgoing relationships
      const outgoing = this.getOutgoingRelationships(nodeId);
      for (const relationship of outgoing) {
        if (visitedRelationships.has(relationship.id)) continue;
        
        // Apply filter if provided
        if (filter && !filter(relationship)) continue;
        
        visitedRelationships.add(relationship.id);
        resultRelationships.push(relationship);
        
        // Add target to queue
        queue.push({ nodeId: relationship.targetId, depth: depth + 1 });
      }
      
      // Process incoming relationships
      const incoming = this.getIncomingRelationships(nodeId);
      for (const relationship of incoming) {
        if (visitedRelationships.has(relationship.id)) continue;
        
        // Apply filter if provided
        if (filter && !filter(relationship)) continue;
        
        visitedRelationships.add(relationship.id);
        resultRelationships.push(relationship);
        
        // Add source to queue
        queue.push({ nodeId: relationship.sourceId, depth: depth + 1 });
      }
    }
    
    return {
      nodes: resultNodes,
      relationships: resultRelationships,
      relevanceScore: 1.0 // Default value, can be refined later
    };
  }

  /**
   * Find path between two nodes (uses Dijkstra's algorithm)
   */
  findPath(sourceId: string, targetId: string): KnowledgeRelationship[] | null {
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return null;
    }

    // Implementation of Dijkstra's algorithm
    const distances: Map<string, number> = new Map();
    const previous: Map<string, { nodeId: string, relationshipId: string }> = new Map();
    const unvisited: Set<string> = new Set();

    // Initialize distances
    for (const nodeId of this.nodes.keys()) {
      distances.set(nodeId, nodeId === sourceId ? 0 : Infinity);
      unvisited.add(nodeId);
    }

    while (unvisited.size > 0) {
      // Find node with minimum distance
      let currentNodeId: string | null = null;
      let minDistance = Infinity;
      
      for (const nodeId of unvisited) {
        const distance = distances.get(nodeId) || Infinity;
        if (distance < minDistance) {
          minDistance = distance;
          currentNodeId = nodeId;
        }
      }

      // If we can't find a node or we've reached the target
      if (currentNodeId === null || minDistance === Infinity || currentNodeId === targetId) {
        break;
      }

      // Remove current node from unvisited
      unvisited.delete(currentNodeId);

      // Check all neighbors
      const outgoing = this.getOutgoingRelationships(currentNodeId);
      for (const rel of outgoing) {
        if (!unvisited.has(rel.targetId)) continue;
        
        const weight = this.config.maxRelationshipWeight! - rel.weight + 1; // Invert weight for Dijkstra
        const newDistance = (distances.get(currentNodeId) || 0) + weight;
        
        if (newDistance < (distances.get(rel.targetId) || Infinity)) {
          distances.set(rel.targetId, newDistance);
          previous.set(rel.targetId, { nodeId: currentNodeId, relationshipId: rel.id });
        }
      }
    }

    // Reconstruct path
    if (!previous.has(targetId)) {
      return null; // No path found
    }

    const path: KnowledgeRelationship[] = [];
    let current = targetId;
    
    while (current !== sourceId) {
      const prev = previous.get(current);
      if (!prev) break;
      
      const relationship = this.relationships.get(prev.relationshipId);
      if (!relationship) break;
      
      path.unshift(relationship);
      current = prev.nodeId;
    }

    return path;
  }

  /**
   * Update an existing node
   */
  updateNode(id: string, updates: Partial<Omit<KnowledgeNode, 'id' | 'createdAt'>>): KnowledgeNode {
    const node = this.nodes.get(id);
    if (!node) {
      throw new Error(`Node with ID ${id} does not exist`);
    }
    
    const updatedNode = {
      ...node,
      ...updates,
      updatedAt: new Date()
    };
    
    // If type or label changed, update indexes
    if (updates.type && updates.type !== node.type) {
      this.nodesByType.get(node.type)?.delete(id);
      if (!this.nodesByType.has(updates.type)) {
        this.nodesByType.set(updates.type, new Set());
      }
      this.nodesByType.get(updates.type)!.add(id);
    }
    
    if (updates.label && updates.label !== node.label) {
      this.nodesByLabel.get(node.label)?.delete(id);
      if (!this.nodesByLabel.has(updates.label)) {
        this.nodesByLabel.set(updates.label, new Set());
      }
      this.nodesByLabel.get(updates.label)!.add(id);
    }
    
    this.nodes.set(id, updatedNode);
    this.markDirty();
    this.emit('nodeUpdated', updatedNode);
    
    return updatedNode;
  }

  /**
   * Update an existing relationship
   */
  updateRelationship(
    id: string, 
    updates: Partial<Omit<KnowledgeRelationship, 'id' | 'createdAt' | 'sourceId' | 'targetId'>>
  ): KnowledgeRelationship {
    const relationship = this.relationships.get(id);
    if (!relationship) {
      throw new Error(`Relationship with ID ${id} does not exist`);
    }
    
    const updatedRelationship = {
      ...relationship,
      ...updates,
      updatedAt: new Date()
    };
    
    // If type changed, update indexes
    if (updates.type && updates.type !== relationship.type) {
      this.relationshipsByType.get(relationship.type)?.delete(id);
      if (!this.relationshipsByType.has(updates.type)) {
        this.relationshipsByType.set(updates.type, new Set());
      }
      this.relationshipsByType.get(updates.type)!.add(id);
    }
    
    this.relationships.set(id, updatedRelationship);
    this.markDirty();
    this.emit('relationshipUpdated', updatedRelationship);
    
    return updatedRelationship;
  }

  /**
   * Delete a node and all its relationships
   */
  deleteNode(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) {
      return false;
    }
    
    // Delete all relationships involving this node
    const outgoing = this.getOutgoingRelationships(id);
    const incoming = this.getIncomingRelationships(id);
    
    for (const rel of [...outgoing, ...incoming]) {
      this.deleteRelationship(rel.id);
    }
    
    // Remove from indexes
    this.nodesByType.get(node.type)?.delete(id);
    this.nodesByLabel.get(node.label)?.delete(id);
    
    // Remove the node
    this.nodes.delete(id);
    this.markDirty();
    this.emit('nodeDeleted', node);
    
    return true;
  }

  /**
   * Delete a relationship
   */
  deleteRelationship(id: string): boolean {
    const relationship = this.relationships.get(id);
    if (!relationship) {
      return false;
    }
    
    // Remove from indexes
    this.relationshipsByType.get(relationship.type)?.delete(id);
    this.relationshipsBySource.get(relationship.sourceId)?.delete(id);
    this.relationshipsByTarget.get(relationship.targetId)?.delete(id);
    
    // Remove the relationship
    this.relationships.delete(id);
    this.markDirty();
    this.emit('relationshipDeleted', relationship);
    
    return true;
  }

  /**
   * Mark the graph as dirty and needing to be saved
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
   * Save the knowledge graph to disk
   */
  save(): boolean {
    if (!this.config.persistPath) {
      return false;
    }
    
    try {
      const fs = require('fs');
      
      const data = {
        nodes: Array.from(this.nodes.values()),
        relationships: Array.from(this.relationships.values())
      };
      
      fs.writeFileSync(this.config.persistPath, JSON.stringify(data, null, 2));
      this.dirty = false;
      const logger = new Logger('KnowledgeGraph');
      logger.debug(`Saved knowledge graph to ${this.config.persistPath}`);
      return true;
    } catch (error) {
      const logger = new Logger('KnowledgeGraph');
      logger.error(`Failed to save knowledge graph: ${error}`);
      return false;
    }
  }

  /**
   * Load the knowledge graph from disk
   */
  load(): boolean {
    if (!this.config.persistPath) {
      return false;
    }
    
    try {
      const fs = require('fs');
      
      const logger = new Logger('KnowledgeGraph');
      if (!fs.existsSync(this.config.persistPath)) {
        logger.debug(`No knowledge graph file found at ${this.config.persistPath}`);
        return false;
      }
      
      const data = JSON.parse(fs.readFileSync(this.config.persistPath, 'utf8'));
      
      // Clear current data
      this.nodes.clear();
      this.relationships.clear();
      
      // Load nodes
      if (Array.isArray(data.nodes)) {
        for (const node of data.nodes) {
          node.createdAt = new Date(node.createdAt);
          node.updatedAt = new Date(node.updatedAt);
          this.nodes.set(node.id, node);
        }
      }
      
      // Load relationships
      if (Array.isArray(data.relationships)) {
        for (const relationship of data.relationships) {
          relationship.createdAt = new Date(relationship.createdAt);
          relationship.updatedAt = new Date(relationship.updatedAt);
          this.relationships.set(relationship.id, relationship);
        }
      }
      
      // Rebuild indexes
      this.initializeIndexes();
      
      this.dirty = false;
      logger.debug(`Loaded knowledge graph from ${this.config.persistPath}`);
      return true;
    } catch (error) {
      const logger = new Logger('KnowledgeGraph');
      logger.error(`Failed to load knowledge graph: ${error}`);
      return false;
    }
  }

  /**
   * Clear the entire knowledge graph
   */
  clear() {
    this.nodes.clear();
    this.relationships.clear();
    this.nodesByType.clear();
    this.nodesByLabel.clear();
    this.relationshipsByType.clear();
    this.relationshipsBySource.clear();
    this.relationshipsByTarget.clear();
    this.markDirty();
    this.emit('graphCleared');
  }

  /**
   * Get statistics about the knowledge graph
   */
  getStats() {
    return {
      nodeCount: this.nodes.size,
      relationshipCount: this.relationships.size,
      nodeTypes: Array.from(this.nodesByType.keys()),
      relationshipTypes: Array.from(this.relationshipsByType.keys())
    };
  }
}