// Streaming example
import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole,
  AgentEvent
} from '../src';
import readline from 'readline';

// Load environment variables
dotenv.config();

console.log('Checking for API keys:');
console.log('- Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * This example demonstrates using streaming responses with an agent
 */
async function main() {
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Anthropic API key is required');
    process.exit(1);
  }
  
  console.log('\nCreating a streaming agent...');
  
  // Create the agent
  const agent = new Agent({
    name: 'StreamingAssistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'knowledgeable', 'responsive'],
      background: 'An AI assistant that streams responses in real-time.'
    },
    goals: ['Provide accurate information', 'Stream responses for a better user experience'],
  });
  
  // Listen for thinking events (for debugging)
  agent.on(AgentEvent.THINKING, (data) => {
    // Uncomment to see thinking events
    // console.log(`Thinking: ${data.message}`);
  });
  
  // Start interaction loop
  await interactWithAgent(agent);
  
  console.log("\nThanks for using the streaming agent!");
  rl.close();
}

/**
 * Interactive chat loop with streaming agent
 */
async function interactWithAgent(agent: Agent) {
  console.log("\nChat with the streaming assistant. Type 'exit' to quit.\n");
  
  // Store conversation context
  let conversation;
  
  while (true) {
    // Get user input
    const userInput = await new Promise<string>(resolve => {
      rl.question('> You: ', resolve);
    });
    
    // Check for exit command
    if (userInput.toLowerCase() === 'exit') {
      break;
    }
    
    // Display start of assistant's response
    process.stdout.write('\n> Assistant: ');
    
    // Track streaming state
    let responseComplete = false;
    let currentResponse = '';
    
    try {
      // Run the agent with streaming enabled
      const result = await agent.run({
        task: userInput,
        conversation,
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
}

// Run the example
main().catch(console.error);