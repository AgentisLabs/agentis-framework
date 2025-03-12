/**
 * Example of using the MCPAgent with weather tools
 */

import { MCPAgent, AgentRole } from '../src';
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
  console.log('Creating MCP agent...');
  
  // Create an agent with MCP capabilities
  const agent = new MCPAgent({
    name: 'McpWeatherAssistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'knowledgeable', 'friendly'],
      background: 'A weather assistant with access to weather data through MCP.'
    },
    goals: ['Provide accurate weather information', 'Help users plan around weather conditions']
  });
  
  try {
    // Get the absolute path to the weather MCP server
    const serverPath = path.resolve(__dirname, '..', 'mcp-example', 'mcp-example', 'weather', 'build', 'index.js');
    console.log(`Connecting to MCP server at: ${serverPath}`);
    
    // Connect to the weather MCP server
    const serverId = await agent.connectToMCPServer({
      path: serverPath,
      name: 'weather-server'
    });
    console.log(`Connected to MCP server with ID: ${serverId}`);
    
    // Interactive command loop
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\nWeather MCP Agent ready! Type "exit" to quit.');
    
    const askQuestion = () => {
      readline.question('\nYour query: ', async (query) => {
        if (query.toLowerCase() === 'exit') {
          // Clean up and exit
          await agent.disconnectAllMCPServers();
          readline.close();
          return;
        }
        
        console.log('Processing your query...');
        
        try {
          // Run the agent with MCP enabled
          const result = await agent.run({
            task: query,
            useMcp: true, // This tells the agent to use MCP instead of standard tools
            onStream: (text, done) => {
              if (done) {
                console.log('\nFinal response:');
                console.log(text);
              }
            }
          });
          
          // If there was no streaming, display the response
          if (!result.response.includes('Calling tool')) {
            console.log('\nResponse:');
            console.log(result.response);
          }
          
          // Show tool usage information
          if (result.toolCalls && result.toolCalls.length > 0) {
            console.log(`\nUsed ${result.toolCalls.length} MCP tools in this response.`);
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