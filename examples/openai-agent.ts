/**
 * OpenAI Agent Example with Web Search
 * 
 * This example demonstrates using an Agentis agent with the OpenAI provider
 * and Tavily search tool for web search capabilities
 */

import dotenv from 'dotenv';
import readline from 'readline';
import { 
  Agent, 
  AgentRole, 
  AgentEvent,
  ProviderType,
  TavilySearchTool,
  InMemoryMemory
} from '../src';

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Main function to run the OpenAI agent
 */
async function main() {
  console.log('\n🤖 Agentis with OpenAI Example + Web Search 🤖\n');
  
  // Check for required API keys
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OpenAI API key is required. Please add it to your .env file.');
    process.exit(1);
  }
  
  if (!process.env.TAVILY_API_KEY) {
    console.error('❌ Tavily API key is required for web search. Please add it to your .env file.');
    process.exit(1);
  }
  
  console.log('API Keys Status:');
  console.log(`- OpenAI API: ✅`);
  console.log(`- Tavily API: ✅`);
  
  // Initialize web search tool with includeAnswer=true to get Tavily's AI-generated summary
  const searchTool = new TavilySearchTool();
  
  // Override the execute method to ensure includeAnswer is always true
  const originalExecute = searchTool.execute;
  searchTool.execute = async (params: any) => {
    // Always include AI-generated answer from Tavily
    const newParams = { ...params, includeAnswer: true };
    return originalExecute.call(searchTool, newParams);
  };
  
  // Create the agent with OpenAI provider
  console.log('\nCreating agent with OpenAI provider and web search capabilities...');
  const agent = new Agent(
    {
      name: 'OpenAI Search Agent',
      role: AgentRole.RESEARCHER,
      personality: {
        traits: ['helpful', 'precise', 'friendly', 'resourceful'],
        background: 'An AI assistant powered by OpenAI\'s models with the ability to search the web for current information.'
      },
      goals: ['Provide accurate information', 'Search the web when needed', 'Be helpful and clear'],
      systemPrompt: `You are a helpful assistant with web search capabilities.

IMPORTANT: You MUST use the web_search tool when users ask about news, current events, finance, or other timely information.

For any user query related to current events, finance data, news articles, or any topic requiring recent information, your first action MUST be to use the web_search tool.

Example appropriate tool usage JSON format:
{"name": "web_search", "parameters": {"query": "latest Bitcoin news"}}

DO NOT respond to news-related, finance-related or current event queries without using the web_search tool first.

When a query like "Find news about X" or "What's happening with Y" is received, immediately use the web_search tool.`
    },
    undefined, // No direct provider
    {
      type: ProviderType.OPENAI,
      model: 'gpt-4o', // Using GPT-4o for better tool use capabilities
    }
  );
  
  // Add memory separately
  agent.setMemory(new InMemoryMemory());
  
  // Set up event listeners for thinking events
  agent.on(AgentEvent.THINKING, (data) => {
    // Enable detailed thinking events to debug tool usage
    console.log(`\n[DEBUG] ${data.message}`);
  });
  
  // Start conversation
  console.log('\nYou are now chatting with the OpenAI-powered Agentis Assistant with web search capability.');
  console.log('Type "exit" to end the conversation.\n');
  
  // Store conversation context to maintain history
  let conversation;
  
  while (true) {
    const userInput = await promptUser('You: ');
    
    if (userInput.toLowerCase() === 'exit') {
      break;
    }
    
    // Display start of assistant's response
    process.stdout.write('Assistant: ');
    
    // Track streaming state
    let responseComplete = false;
    let currentResponse = '';
    
    try {
      // Run the agent with web search tool and disable streaming
      console.log('\n[DEBUG] Running agent with web search tool');
      console.log(`[DEBUG] Search tool details: ${JSON.stringify({
        name: searchTool.name,
        description: searchTool.description,
        schema: searchTool.schema
      }, null, 2)}`);
      
      // Run the agent without streaming for proper tool handling
      const result = await agent.run({
        task: userInput,
        conversation,
        tools: [searchTool],
        stream: false // Disable streaming to ensure tool calls work properly
      });
      
      // Print the complete response
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.log('\n[DEBUG] Tool calls executed:', JSON.stringify(result.toolCalls, null, 2));
      }
      
      // Display the full response with fallback in case of issues
      if (result.response && result.response.trim().length > 0) {
        console.log('\nAssistant: ' + result.response + '\n');
      } else {
        // Check if we got tool calls and results but no response
        if (result.toolCalls && result.toolCalls.length > 0) {
          // Extract search results summary
          const searchResults = result.toolCalls[0]?.result?.results || [];
          const answer = result.toolCalls[0]?.result?.answer;
          
          let fallbackResponse = 'Here are the latest news about ' + userInput + ':\n\n';
          
          // Add AI-generated answer if available
          if (answer) {
            fallbackResponse += answer + '\n\n';
          }
          
          // Add article list
          searchResults.forEach((result: any, index: number) => {
            fallbackResponse += `${index + 1}. ${result.title}\n   ${result.snippet.substring(0, 150)}...\n   Source: ${result.url}\n\n`;
          });
          
          console.log('\nAssistant: ' + fallbackResponse + '\n');
        } else {
          console.log('\nAssistant: I apologize, but I couldn\'t generate a response. Please try again with a different query.\n');
        }
      }
      
      // Save conversation for context
      conversation = result.conversation;
      
    } catch (error) {
      console.error('\n\nError:', error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log('\nThank you for chatting with the OpenAI-powered Agentis Assistant!');
  rl.close();
}

/**
 * Prompt the user for input
 */
function promptUser(promptText: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(promptText, answer => {
      resolve(answer.trim());
    });
  });
}

// Run the main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});