/**
 * Example demonstrating the integrated MCP approach
 * Shows how to use MCP servers alongside standard tools
 */

import { Agent, AgentRole, WebSearchTool, MCPServer } from '../src';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Verify required API keys
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

async function main() {
  console.log('Creating agent with MCP capabilities...');
  
  // Create a standard agent
  const agent = new Agent({
    name: 'HybridAssistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'knowledgeable', 'friendly'],
      background: 'An assistant that can use both standard tools and MCP servers.'
    },
    goals: ['Provide accurate information', 'Help users with various tasks']
  });
  
  try {
    // Add a standard tool
    const webSearchTool = new WebSearchTool();
    
    // Create and connect to an MCP server
    const weatherServerPath = path.resolve(__dirname, '..', 'mcp-example', 'mcp-example', 'weather', 'build', 'index.js');
    console.log(`Creating MCP server with path: ${weatherServerPath}`);
    
    const weatherServer = new MCPServer({
      path: weatherServerPath,
      name: 'weather-mcp'
    });
    
    // Connect to the MCP server
    await weatherServer.connect();
    console.log(`Connected to MCP server with ${weatherServer.tools.length} tools`);
    
    // Add the MCP server to the agent
    agent.addMCPServer(weatherServer);
    
    // Interactive command loop
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\nHybrid MCP Agent ready! You can:');
    console.log('- Use standard tools: "search for the latest news"');
    console.log('- Use MCP tools: "what\'s the weather forecast for New York?"');
    console.log('- Type "mcp" to use only MCP tools for the next query');
    console.log('- Type "standard" to use only standard tools for the next query');
    console.log('- Type "exit" to quit');
    
    let useMcpOnly = false;
    let useStandardOnly = false;
    
    const askQuestion = () => {
      const prompt = useMcpOnly ? 'MCP Query: ' : 
                    useStandardOnly ? 'Standard Query: ' : 
                    'Query: ';
      
      readline.question(`\n${prompt}`, async (query) => {
        if (query.toLowerCase() === 'exit') {
          // Clean up and exit
          await weatherServer.disconnect();
          readline.close();
          return;
        }
        
        if (query.toLowerCase() === 'mcp') {
          useMcpOnly = true;
          useStandardOnly = false;
          console.log('Switched to MCP-only mode. MCP tools will be used for the next query.');
          askQuestion();
          return;
        }
        
        if (query.toLowerCase() === 'standard') {
          useStandardOnly = true;
          useMcpOnly = false;
          console.log('Switched to standard-only mode. Standard tools will be used for the next query.');
          askQuestion();
          return;
        }
        
        console.log('Processing your query...');
        
        try {
          // Run the agent with appropriate tools based on mode
          const result = await agent.run({
            task: query,
            tools: useStandardOnly || (!useMcpOnly) ? [webSearchTool] : [],
            useMcpServers: useMcpOnly || (!useStandardOnly),
            onStream: (text, done) => {
              if (done) {
                console.log('\nFinal response:');
                console.log(text);
              }
            }
          });
          
          // Reset mode after query
          if (useMcpOnly || useStandardOnly) {
            useMcpOnly = false;
            useStandardOnly = false;
            console.log('Returned to hybrid mode. Both standard and MCP tools are available.');
          }
          
          // If there was no streaming, display the response
          if (!result.response.includes('Calling tool')) {
            console.log('\nResponse:');
            console.log(result.response);
          }
          
          // Show tool usage information
          if (result.toolCalls && result.toolCalls.length > 0) {
            console.log(`\nUsed ${result.toolCalls.length} tools in this response.`);
          }
        } catch (error) {
          console.error('Error processing query:', error);
        }
        
        // Ask for the next question
        askQuestion();
      });
    };
    
    // Start the interaction loop
    askQuestion();
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch(console.error);