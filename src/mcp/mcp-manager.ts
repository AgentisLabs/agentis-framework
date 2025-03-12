/**
 * MCP Manager for the Agentis framework
 * Manages connections to Model Context Protocol servers
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
 * Manages connections to MCP servers
 */
export class MCPManager {
  private servers: Map<string, {
    client: Client;
    transport: StdioClientTransport;
    tools: MCPTool[];
  }> = new Map();
  
  private logger: Logger;
  
  constructor() {
    this.logger = new Logger('MCPManager');
  }
  
  /**
   * Connects to an MCP server and fetches available tools
   * 
   * @param config - Configuration for the MCP server connection
   * @returns The server ID and available tools
   */
  async connectToServer(config: MCPServerConfig): Promise<{ serverId: string, tools: MCPTool[] }> {
    const serverPath = config.path;
    const serverId = config.name || `mcp-server-${this.servers.size + 1}`;
    
    try {
      this.logger.debug(`Connecting to MCP server at: ${serverPath}`);
      
      // Determine the command to run based on the file extension
      const isJs = serverPath.endsWith('.js');
      const isPy = serverPath.endsWith('.py');
      
      if (!isJs && !isPy) {
        throw new Error('Server script must be a .js or .py file');
      }
      
      const command = isPy
        ? process.platform === 'win32' ? 'python' : 'python3'
        : process.execPath;
        
      // Create client and transport
      const transport = new StdioClientTransport({
        command,
        args: [serverPath],
      });
      
      const mcpClient = new Client({ 
        name: "agentis-mcp-client",
        version: "1.0.0"
      });
      
      // Connect to the server
      mcpClient.connect(transport);
      
      // List available tools
      const toolsResult = await mcpClient.listTools();
      
      // Format tools for Claude
      const tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      
      this.logger.debug(`Connected to MCP server with tools: ${tools.map(t => t.name).join(', ')}`);
      
      // Store the server connection
      this.servers.set(serverId, {
        client: mcpClient,
        transport,
        tools
      });
      
      return { serverId, tools };
    } catch (error) {
      this.logger.error(`Failed to connect to MCP server: ${error}`);
      throw error;
    }
  }
  
  /**
   * Calls a tool on an MCP server
   * 
   * @param serverId - ID of the server to call
   * @param toolCall - The tool call to execute
   * @returns The result of the tool call
   */
  async callTool(serverId: string, toolCall: MCPToolCall): Promise<MCPResult> {
    const server = this.servers.get(serverId);
    
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }
    
    try {
      this.logger.debug(`Calling MCP tool: ${toolCall.name} on server: ${serverId}`);
      
      const result = await server.client.callTool({
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
   * Gets all available tools from a specific MCP server
   * 
   * @param serverId - ID of the server to get tools from
   * @returns Array of tools available on the server
   */
  getServerTools(serverId: string): MCPTool[] {
    const server = this.servers.get(serverId);
    
    if (!server) {
      throw new Error(`MCP server not found: ${serverId}`);
    }
    
    return server.tools;
  }
  
  /**
   * Gets all available tools from all connected MCP servers
   * 
   * @returns Map of server IDs to their available tools
   */
  getAllServerTools(): Map<string, MCPTool[]> {
    const allTools = new Map<string, MCPTool[]>();
    
    for (const [serverId, server] of this.servers.entries()) {
      allTools.set(serverId, server.tools);
    }
    
    return allTools;
  }
  
  /**
   * Disconnects from an MCP server
   * 
   * @param serverId - ID of the server to disconnect from
   */
  async disconnectServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    
    if (!server) {
      this.logger.warn(`Attempt to disconnect from unknown MCP server: ${serverId}`);
      return;
    }
    
    try {
      this.logger.debug(`Disconnecting from MCP server: ${serverId}`);
      await server.client.close();
      this.servers.delete(serverId);
    } catch (error) {
      this.logger.error(`Error disconnecting from MCP server: ${serverId}`, error);
      throw error;
    }
  }
  
  /**
   * Disconnects from all MCP servers
   */
  async disconnectAll(): Promise<void> {
    this.logger.debug('Disconnecting from all MCP servers');
    
    const disconnectPromises = [];
    
    for (const serverId of this.servers.keys()) {
      disconnectPromises.push(this.disconnectServer(serverId));
    }
    
    await Promise.all(disconnectPromises);
  }
}