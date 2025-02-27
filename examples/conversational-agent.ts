/**
 * Conversational Agent Example
 * 
 * This example demonstrates a simple conversational agent using Agentis
 * with streaming responses and memory retention.
 */

import dotenv from 'dotenv';
import readline from 'readline';
import { 
  Agent, 
  AgentRole, 
  AgentEvent, 
  InMemoryMemory,
  TavilySearchTool
} from '../src';

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Main function to run the conversational agent
 */
async function main() {
  console.log('\n🤖 Agentis Conversational Agent Example 🤖\n');
  
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ Anthropic API key is required. Please add it to your .env file.');
    process.exit(1);
  }
  
  const useTavily = Boolean(process.env.TAVILY_API_KEY);
  
  console.log('API Keys Status:');
  console.log(`- Anthropic API: ✅`);
  console.log(`- Tavily (for web search): ${useTavily ? '✅' : '❌'}`);
  
  if (!useTavily) {
    console.log('\n⚠️ Tavily API key not found. The agent won\'t be able to search the web.');
    console.log('You can get a free key at https://tavily.com\n');
  }
  
  // Create the agent
  console.log('\nCreating conversational agent...');
  const agent = createConversationalAgent();
  
  // Setup memory
  const memory = new InMemoryMemory();
  agent.setMemory(memory);
  
  // Set up tools
  const tools = [];
  if (useTavily) {
    tools.push(new TavilySearchTool());
    console.log('Web search capability enabled.');
  }
  
  // Set up event listeners for thinking events
  agent.on(AgentEvent.THINKING, (data) => {
    // Uncomment to see detailed thinking events
    // console.log(`${data.message}`);
  });
  
  agent.on(AgentEvent.TOOL_CALL, (data) => {
    console.log(`\n🔍 Searching for: "${data.params.query}"`);
  });
  
  // Start conversation
  console.log('\nYou are now chatting with the Agentis Assistant.');
  console.log('Type "exit" to end the conversation.');
  console.log('Type "search: [topic]" to explicitly search for information.\n');
  
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
      // Run the agent with streaming enabled
      const result = await agent.run({
        task: userInput,
        conversation,
        tools,
        stream: true,
        onStream: (text, done) => {
          // If done was already reported, ignore this callback
          if (responseComplete) return;
          
          // Calculate the delta (what's new since last callback)
          const newText = text.substring(currentResponse.length);
          currentResponse = text;
          
          // Print the new content without a line break
          process.stdout.write(newText);
          
          // Mark completion on done
          if (done) {
            responseComplete = true;
            process.stdout.write('\n\n');
          }
        }
      });
      
      // Save conversation for context
      conversation = result.conversation;
      
    } catch (error) {
      console.error('\n\nError:', error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log('\nThank you for chatting with the Agentis Assistant!');
  rl.close();
}

/**
 * Create a conversational agent with appropriate personality and settings
 */
function createConversationalAgent(): Agent {
  return new Agent({
    name: 'Agentis Assistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'friendly', 'conversational', 'knowledgeable'],
      background: `A helpful AI assistant designed to have natural conversations 
                  and help users with information and answers to questions.`,
      voice: 'casual and friendly'
    },
    goals: [
      'Have natural, engaging conversations',
      'Provide accurate and helpful information',
      'Remember context from earlier in the conversation',
      'Use web search when needed to provide up-to-date information'
    ],
  });
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