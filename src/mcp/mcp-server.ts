/**
 * MCP Server for the Agentis framework
 * Represents a connection to a Model Context Protocol server
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool as MCPTool } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Logger } from '../utils/logger';

export interface MCPServerConfig {
  path: string; 
  name?: string;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPResult {
  content: string | any;
  isError?: boolean;
}

/**
 * Represents a connection to an MCP server
 */
export class MCPServer {
  id: string;
  name: string;
  path: string;
  tools: MCPTool[] = [];
  private client: Client;
  private transport!: StdioClientTransport; // Using definite assignment assertion
  private connected: boolean = false;
  private logger: Logger;
  
  /**
   * Creates a new MCP server instance
   * 
   * @param config - Configuration for the MCP server
   */
  constructor(config: MCPServerConfig) {
    this.id = crypto.randomUUID();
    this.name = config.name || `mcp-server-${this.id.substring(0, 8)}`;
    this.path = config.path;
    this.logger = new Logger(`MCPServer:${this.name}`);
    
    // Initialize client
    this.client = new Client({ 
      name: "agentis-mcp-client",
      version: "1.0.0"
    });
  }
  
  /**
   * Connects to the MCP server and fetches available tools
   * 
   * @returns Promise resolving when connection is established
   */
  async connect(): Promise<void> {
    if (this.connected) {
      this.logger.warn('Already connected to MCP server');
      return;
    }
    
    try {
      this.logger.debug(`Connecting to MCP server at: ${this.path}`);
      
      // Determine the command to run based on the file extension
      const isJs = this.path.endsWith('.js');
      const isPy = this.path.endsWith('.py');
      
      if (!isJs && !isPy) {
        throw new Error('Server script must be a .js or .py file');
      }
      
      const command = isPy
        ? process.platform === 'win32' ? 'python' : 'python3'
        : process.execPath;
        
      // Create transport
      this.transport = new StdioClientTransport({
        command,
        args: [this.path],
      });
      
      // Connect to the server
      this.client.connect(this.transport);
      
      // List available tools
      const toolsResult = await this.client.listTools();
      
      // Format tools for Claude - match exact format from working example
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      
      this.connected = true;
      this.logger.debug(`Connected to MCP server with tools: ${this.tools.map(t => t.name).join(', ')}`);
    } catch (error) {
      this.logger.error(`Failed to connect to MCP server: ${error}`);
      throw error;
    }
  }
  
  /**
   * Calls a tool on the MCP server
   * 
   * @param toolCall - The tool call to execute
   * @returns The result of the tool call
   */
  async callTool(toolCall: MCPToolCall): Promise<MCPResult> {
    if (!this.connected) {
      throw new Error(`MCP server ${this.name} is not connected`);
    }
    
    try {
      this.logger.debug(`Calling MCP tool: ${toolCall.name}`);
      
      const result = await this.client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments,
      });
      
      return {
        content: result.content,
        isError: typeof result.isError === 'boolean' ? result.isError : undefined
      };
    } catch (error) {
      this.logger.error(`Error calling MCP tool: ${error}`);
      return {
        content: `Error calling tool ${toolCall.name}: ${error}`,
        isError: true
      };
    }
  }
  
  /**
   * Gets all tools available from this MCP server
   * 
   * @returns Array of tools
   */
  getTools(): MCPTool[] {
    return this.tools;
  }
  
  /**
   * Checks if a tool is available in this server
   * 
   * @param toolName - Name of the tool to check
   * @returns Boolean indicating if the tool is available
   */
  hasTool(toolName: string): boolean {
    return this.tools.some(tool => tool.name === toolName);
  }
  
  /**
   * Disconnects from the MCP server
   * 
   * @returns Promise resolving when disconnection is complete
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      this.logger.warn('MCP server is not connected');
      return;
    }
    
    try {
      this.logger.debug('Disconnecting from MCP server');
      await this.client.close();
      this.connected = false;
    } catch (error) {
      this.logger.error(`Error disconnecting from MCP server: ${error}`);
      throw error;
    }
  }
}