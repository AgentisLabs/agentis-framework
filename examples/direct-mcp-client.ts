/**
 * A direct MCP client implementation that simplifies our approach
 * This follows the working example's pattern
 */

import { Anthropic } from '@anthropic-ai/sdk';
import { MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages/messages.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import readline from 'readline';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check for API key
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY environment variable is required');
}

class MCPClient {
  private mcp: Client;
  private anthropic: Anthropic;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY
    });
    this.mcp = new Client({ name: 'agentis-mcp-client', version: '1.0.0' });
  }

  async connectToServer(serverScriptPath: string) {
    try {
      const isJs = serverScriptPath.endsWith('.js');
      const isPy = serverScriptPath.endsWith('.py');
      
      if (!isJs && !isPy) {
        throw new Error('Server script must be a .js or .py file');
      }
      
      const command = isPy
        ? process.platform === 'win32' ? 'python' : 'python3'
        : process.execPath;
      
      // Create and connect the transport
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath]
      });
      
      this.mcp.connect(this.transport);
      
      // Get available tools
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map(tool => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema
        };
      });
      
      console.log('Connected to server with tools:', this.tools.map(({ name }) => name));
    } catch (e) {
      console.error('Failed to connect to MCP server:', e);
      throw e;
    }
  }

  async processQuery(query: string) {
    const messages: MessageParam[] = [
      {
        role: 'user',
        content: query
      }
    ];

    // First call to Claude with tools
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages,
      tools: this.tools
    });

    const finalText = [];
    const toolResults = [];

    // Process the response
    for (const content of response.content) {
      if (content.type === 'text') {
        finalText.push(content.text);
      } else if (content.type === 'tool_use') {
        const toolName = content.name;
        const toolArgs = content.input as { [x: string]: unknown } | undefined;

        console.log(`Calling tool: ${toolName} with args:`, toolArgs);
        
        // Call the tool on the MCP server
        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs
        });
        
        toolResults.push(result);
        finalText.push(`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`);

        // Add tool result to messages
        let resultContent = '';
        if (typeof result.content === 'string') {
          resultContent = result.content;
        } else if (Array.isArray(result.content)) {
          // Handle array of content objects (common in MCP)
          resultContent = result.content.map((item: any) => {
            if (item.type === 'text') return item.text;
            return '';
          }).join('\n');
        } else {
          resultContent = JSON.stringify(result.content);
        }
        
        // Add the tool result as a user message (this is key to the working approach)
        messages.push({
          role: 'user',
          content: resultContent
        });

        // Get a follow-up response from Claude with the tool results
        const followUpResponse = await this.anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1000,
          messages,
        });

        // Add the follow-up response
        if (followUpResponse.content[0]?.type === 'text') {
          finalText.push(followUpResponse.content[0].text);
        }
      }
    }

    return finalText.join('\n');
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    try {
      console.log('\nMCP Direct Client Started!');
      console.log('Ask about weather forecasts or alerts. Type "exit" to quit.\n');
      console.log('Example queries:');
      console.log('- What\'s the weather like in San Francisco?');
      console.log('- Are there any weather alerts in CA?');
      console.log('- Get the forecast for latitude 40.7, longitude -74.0 (New York)');

      const askQuestion = () => {
        rl.question('\nQuery: ', async (message) => {
          if (message.toLowerCase() === 'exit') {
            await this.cleanup();
            rl.close();
            return;
          }
          
          try {
            console.log('Processing...');
            const response = await this.processQuery(message);
            console.log('\nResponse:');
            console.log(response);
          } catch (error) {
            console.error('Error:', error);
          }
          
          askQuestion();
        });
      };
      
      askQuestion();
    } catch (error) {
      console.error('Error in chat loop:', error);
      rl.close();
    }
  }

  async cleanup() {
    if (this.mcp) {
      await this.mcp.close();
    }
  }
}

async function main() {
  const mcpClient = new MCPClient();
  
  try {
    // Get the path to the weather server
    const weatherServerPath = path.resolve(
      __dirname,
      '../mcp-example/mcp-example/weather/build/index.js'
    );
    
    console.log(`Connecting to MCP server at: ${weatherServerPath}`);
    
    // Connect to the server
    await mcpClient.connectToServer(weatherServerPath);
    
    // Start the chat loop
    await mcpClient.chatLoop();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main().catch(console.error);