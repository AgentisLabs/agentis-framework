/**
 * A simple Claude agent example that uses the weather MCP server
 */

import { Agent, AgentRole, MCPServer } from '../src';
import { AnthropicProvider } from '../src/core/llm-provider';
import path from 'path';
import dotenv from 'dotenv';
import readline from 'readline';

// Load environment variables
dotenv.config();

// Check for required API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is required.');
  process.exit(1);
}

async function main() {
  console.log('Creating Claude Weather Agent...');
  
  // Create a Claude provider
  const provider = new AnthropicProvider({
    model: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  // Create an agent with Claude provider
  const agent = new Agent({
    name: 'WeatherAssistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'knowledgeable', 'concise'],
      background: 'A weather assistant that provides accurate weather information using MCP tools.'
    },
    goals: ['Provide accurate weather forecasts', 'Help users understand weather conditions']
  }, provider);
  
  try {
    // Get absolute path to the weather MCP server
    const weatherServerPath = path.resolve(
      __dirname, 
      '../mcp-example/mcp-example/weather/build/index.js'
    );
    
    console.log(`Connecting to weather MCP server at: ${weatherServerPath}`);
    
    // Create and connect to the weather MCP server
    const weatherServer = new MCPServer({
      path: weatherServerPath,
      name: 'weather-mcp'
    });
    
    await weatherServer.connect();
    console.log(`Connected to weather MCP server with ${weatherServer.tools.length} tools`);
    
    // Add the weather server to the agent
    agent.addMCPServer(weatherServer);
    
    // Set up command-line interface
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\nClaude Weather Assistant is ready!');
    console.log('This agent can provide weather forecasts and alerts.');
    console.log('Example queries:');
    console.log('- What\'s the weather like in San Francisco?');
    console.log('- Are there any weather alerts in CA?');
    console.log('- Get the forecast for latitude 40.7, longitude -74.0 (New York)');
    console.log('Type "exit" to quit.\n');
    
    // Create interaction loop
    const askQuestion = () => {
      rl.question('Query: ', async (query) => {
        if (query.toLowerCase() === 'exit') {
          // Clean up and exit
          await weatherServer.disconnect();
          rl.close();
          console.log('Goodbye!');
          return;
        }
        
        try {
          console.log('Processing...');
          
          // Run the agent with MCP enabled
          const result = await agent.run({
            task: query,
            useMcpServers: true,
            onStream: (text, done) => {
              if (done) {
                console.log('\nResponse:');
                console.log(text);
                
                // Show tool usage info
                if (result.toolCalls?.length) {
                  console.log(`\nUsed ${result.toolCalls.length} weather tool(s) to answer your query.`);
                }
                
                askQuestion(); // Ask for next query
              }
            }
          });
          
          // Handle non-streaming case
          if (!result.response.includes('Processing')) {
            console.log('\nResponse:');
            console.log(result.response);
            
            // Show tool usage info
            if (result.toolCalls?.length) {
              console.log(`\nUsed ${result.toolCalls.length} weather tool(s) to answer your query.`);
            }
            
            askQuestion(); // Ask for next query
          }
        } catch (error) {
          console.error('Error:', error);
          askQuestion(); // Continue even after error
        }
      });
    };
    
    // Start the interaction loop
    askQuestion();
    
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
}

main().catch(console.error);