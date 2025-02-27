import { Tool } from '../core/types';
import { Logger } from '../utils/logger';

/**
 * Registry to manage available tools for agents
 */
export class ToolRegistry {
  private static instance: ToolRegistry;
  private tools: Map<string, Tool> = new Map();
  private logger: Logger;
  
  /**
   * Private constructor (use getInstance() instead)
   */
  private constructor() {
    this.logger = new Logger('ToolRegistry');
  }
  
  /**
   * Gets the singleton instance of the tool registry
   * 
   * @returns The tool registry instance
   */
  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }
  
  /**
   * Registers a tool with the registry
   * 
   * @param tool - The tool to register
   * @returns Boolean indicating if registration was successful
   */
  registerTool(tool: Tool): boolean {
    if (this.tools.has(tool.name)) {
      this.logger.warn(`Tool with name "${tool.name}" already exists`);
      return false;
    }
    
    this.tools.set(tool.name, tool);
    this.logger.debug(`Registered tool: ${tool.name}`);
    return true;
  }
  
  /**
   * Gets a tool by name
   * 
   * @param name - The name of the tool to get
   * @returns The tool, or undefined if not found
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }
  
  /**
   * Gets all registered tools
   * 
   * @returns Array of all registered tools
   */
  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }
  
  /**
   * Gets tools by category (from tool metadata)
   * 
   * @param category - The category to filter by
   * @returns Array of tools in the specified category
   */
  getToolsByCategory(category: string): Tool[] {
    return Array.from(this.tools.values()).filter(tool => {
      return (tool as any).category === category;
    });
  }
  
  /**
   * Removes a tool from the registry
   * 
   * @param name - The name of the tool to remove
   * @returns Boolean indicating if removal was successful
   */
  unregisterTool(name: string): boolean {
    if (!this.tools.has(name)) {
      return false;
    }
    
    this.tools.delete(name);
    this.logger.debug(`Unregistered tool: ${name}`);
    return true;
  }
  
  /**
   * Clears all registered tools
   */
  clearTools(): void {
    this.tools.clear();
    this.logger.debug('Cleared all tools');
  }
}