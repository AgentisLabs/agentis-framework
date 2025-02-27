/**
 * Agentis Framework Showcase
 * 
 * This example demonstrates the key features of the Agentis framework:
 * - Agent creation with personality and goals
 * - Enhanced memory with short and long-term storage
 * - Hierarchical planning and execution
 * - Tool usage for real-world interaction
 * - Streaming responses for real-time feedback
 */

import dotenv from 'dotenv';
import readline from 'readline';
import { 
  Agent, 
  AgentRole, 
  EnhancedMemory,
  PineconeStore,
  EnhancedPlanner,
  PlanningStrategy,
  TavilySearchTool,
  AgentEvent
} from '../src';

// Load environment variables
dotenv.config();

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check for the necessary API keys
const apiKeyStatus = {
  anthropic: process.env.ANTHROPIC_API_KEY ? '✅' : '❌',
  openai: process.env.OPENAI_API_KEY ? '✅' : '❌',
  pinecone: process.env.PINECONE_API_KEY ? '✅' : '❌',
  tavily: process.env.TAVILY_API_KEY ? '✅' : '❌'
};

/**
 * Main function to run the showcase
 */
async function main() {
  console.log('\n🤖 Agentis Framework Showcase 🤖\n');
  console.log('API Keys Status:');
  console.log(`- Anthropic API: ${apiKeyStatus.anthropic}`);
  console.log(`- OpenAI API (for embeddings): ${apiKeyStatus.openai}`);
  console.log(`- Pinecone (for vector storage): ${apiKeyStatus.pinecone}`);
  console.log(`- Tavily (for web search): ${apiKeyStatus.tavily}`);
  
  // Check for required Anthropic API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('\n❌ Anthropic API key is required. Please add it to your .env file.');
    process.exit(1);
  }
  
  // Get user choice for demo mode
  const demoMode = await promptForChoice('\nSelect demo mode:', [
    { key: '1', label: 'Chat with Memory (requires OpenAI and Pinecone keys)' },
    { key: '2', label: 'Planning and Execution (requires Tavily key for best experience)' },
    { key: '3', label: 'Streaming Chat (basic mode)' },
    { key: '4', label: 'Exit' }
  ]);
  
  switch (demoMode) {
    case '1':
      if (!process.env.OPENAI_API_KEY || !process.env.PINECONE_API_KEY) {
        console.log('\n⚠️ This demo requires OpenAI and Pinecone API keys for full functionality.');
        const proceed = await promptYesNo('Do you want to proceed with limited functionality?');
        if (!proceed) return;
      }
      await runMemoryDemo();
      break;
    case '2':
      if (!process.env.TAVILY_API_KEY) {
        console.log('\n⚠️ This demo works best with a Tavily API key for web search capabilities.');
        const proceed = await promptYesNo('Do you want to proceed without web search?');
        if (!proceed) return;
      }
      await runPlanningDemo();
      break;
    case '3':
      await runStreamingDemo();
      break;
    case '4':
      console.log('\nExiting showcase. Goodbye!');
      break;
  }
  
  rl.close();
}

/**
 * Demo 1: Enhanced Memory System
 * Demonstrates short-term and long-term memory with semantic search
 */
async function runMemoryDemo() {
  console.log('\n🧠 Enhanced Memory System Demo 🧠\n');
  
  // Setup memory system if API keys are available
  let memory: EnhancedMemory | undefined;
  
  if (process.env.OPENAI_API_KEY && process.env.PINECONE_API_KEY) {
    try {
      console.log('Setting up enhanced memory system...');
      
      // Create vector store with Pinecone
      const vectorStore = new PineconeStore({
        index: 'agentis-demo',
        dimension: 1536, // OpenAI embeddings dimension
        namespace: 'showcase'
      });
      
      // Create memory with both short and long-term capabilities
      memory = new EnhancedMemory(vectorStore, {
        userId: 'showcase-user',
        namespace: 'showcase',
        shortTermTTL: 24 * 60 * 60 * 1000 // 24 hours
      });
      
      // Initialize memory system
      await memory.initialize();
      console.log('Memory system initialized successfully!');
    } catch (error) {
      console.error('Error setting up memory:', error instanceof Error ? error.message : String(error));
      console.log('Continuing without enhanced memory...');
    }
  } else {
    console.log('OpenAI or Pinecone API keys missing. Running without enhanced memory.');
  }
  
  // Create the agent
  const agent = new Agent({
    name: 'Agentis Memory Assistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'thoughtful', 'personable'],
      background: 'An AI assistant with an excellent memory that learns about users over time.'
    },
    goals: [
      'Remember important information about the user',
      'Use memory to provide personalized responses',
      'Be helpful and informative'
    ],
  });
  
  // Set memory if available
  if (memory) {
    agent.setMemory(memory);
  }
  
  // Add an initial fact to remember
  if (memory) {
    await memory.storeShortTerm({
      input: "My name is User and I'm trying out the Agentis framework.",
      output: "Nice to meet you! I'll remember your name and that you're exploring the Agentis framework.",
      timestamp: Date.now()
    });
    
    await memory.saveNote({
      title: "User Preferences",
      content: "The user is interested in AI frameworks and is exploring the Agentis system.",
      tags: ["preferences", "interests"],
      importance: 0.8
    });
  }
  
  // Interactive chat loop
  console.log('\nChat with the memory-enabled assistant. Type "exit" to quit.\n');
  console.log('(Try asking about yourself or mentioning a topic you "like" to see memory in action)\n');
  
  let conversation;
  while (true) {
    const userInput = await promptUser('You: ');
    
    if (userInput.toLowerCase() === 'exit') {
      break;
    }
    
    console.log('Assistant: ');
    const result = await agent.run({
      task: userInput,
      conversation
    });
    
    console.log(result.response);
    console.log();
    
    // Save conversation for context
    conversation = result.conversation;
  }
  
  console.log('Memory demo completed!');
}

/**
 * Demo 2: Planning and Execution
 * Demonstrates hierarchical planning and tool usage
 */
async function runPlanningDemo() {
  console.log('\n📝 Planning and Execution Demo 📝\n');
  
  // Create the agent
  const agent = new Agent({
    name: 'Agentis Planning Assistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['methodical', 'organized', 'thorough'],
      background: 'An AI assistant specialized in planning and executing complex tasks.'
    },
    goals: [
      'Break down complex tasks into manageable steps',
      'Execute plans efficiently',
      'Use available tools to accomplish tasks'
    ],
  });
  
  // Create planner
  const planner = new EnhancedPlanner();
  agent.setPlanner(planner);
  
  // Create tools
  const tools = [];
  
  // Add search tool if available
  if (process.env.TAVILY_API_KEY) {
    tools.push(new TavilySearchTool());
    console.log('Web search capability enabled.');
  }
  
  // Task options
  const taskOptions = [
    { key: '1', label: 'Research a topic and write a summary' },
    { key: '2', label: 'Create a step-by-step guide' },
    { key: '3', label: 'Custom task (enter your own)' },
    { key: '4', label: 'Back to main menu' }
  ];
  
  while (true) {
    const choice = await promptForChoice('\nSelect a planning task:', taskOptions);
    
    if (choice === '4') {
      break;
    }
    
    let task = '';
    switch (choice) {
      case '1':
        task = await promptUser('Enter a topic to research: ');
        task = `Research the topic "${task}" and write a comprehensive summary. Include key facts, history, and current relevance.`;
        break;
      case '2':
        task = await promptUser('What would you like a guide for? ');
        task = `Create a detailed step-by-step guide for "${task}". Include materials needed, time estimates, and potential challenges.`;
        break;
      case '3':
        task = await promptUser('Enter your custom task: ');
        break;
    }
    
    if (!task) continue;
    
    console.log('\nCreating plan...');
    
    // Setup event listener for planning progress
    agent.on(AgentEvent.THINKING, (data) => {
      console.log(`🔄 ${data.message}`);
    });
    
    try {
      // Create hierarchical plan
      const plan = await planner.createPlan(task, agent, {
        strategy: PlanningStrategy.HIERARCHICAL
      });
      
      console.log('\nPlan created successfully!');
      console.log(`Plan has ${plan.tasks.length} main phases with ${
        plan.tasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0)
      } total tasks.\n`);
      
      // Display plan structure
      plan.tasks.forEach((phase, phaseIndex) => {
        console.log(`Phase ${phaseIndex + 1}: ${phase.description}`);
        
        if (phase.subtasks) {
          phase.subtasks.forEach((task, taskIndex) => {
            console.log(`  - Task ${phaseIndex + 1}.${taskIndex + 1}: ${task.description}`);
          });
        }
      });
      
      // Ask if user wants to execute the plan
      const executeChoice = await promptYesNo('\nDo you want to execute this plan? (This might take a while)');
      
      if (executeChoice) {
        console.log('\nExecuting plan...');
        
        // Execute the plan
        const result = await planner.executePlan(plan, agent, {
          task,
          tools
        });
        
        console.log('\n✅ Plan execution completed!\n');
        console.log('Result:');
        console.log(result.response);
      }
    } catch (error) {
      console.error('\nError in planning:', error instanceof Error ? error.message : String(error));
    }
    
    // Remove event listeners
    agent.removeAllListeners(AgentEvent.THINKING);
  }
  
  console.log('Planning demo completed!');
}

/**
 * Demo 3: Streaming Responses
 * Demonstrates real-time streaming of responses
 */
async function runStreamingDemo() {
  console.log('\n🌊 Streaming Responses Demo 🌊\n');
  
  // Create the agent
  const agent = new Agent({
    name: 'Agentis Streaming Assistant',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'responsive', 'articulate'],
      background: 'An AI assistant that streams responses in real-time.'
    },
    goals: ['Provide accurate information', 'Deliver responses incrementally']
  });
  
  console.log('Chat with the streaming assistant. Type "exit" to quit.\n');
  console.log('(Watch as responses appear in real-time!)\n');
  
  let conversation;
  
  while (true) {
    const userInput = await promptUser('You: ');
    
    if (userInput.toLowerCase() === 'exit') {
      break;
    }
    
    // Start showing the assistant's response
    process.stdout.write('Assistant: ');
    
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
  
  console.log('Streaming demo completed!');
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

/**
 * Prompt for a yes/no question
 */
async function promptYesNo(promptText: string): Promise<boolean> {
  while (true) {
    const response = await promptUser(`${promptText} (y/n): `);
    if (response.toLowerCase() === 'y' || response.toLowerCase() === 'yes') {
      return true;
    } else if (response.toLowerCase() === 'n' || response.toLowerCase() === 'no') {
      return false;
    }
    console.log('Please answer with y or n.');
  }
}

/**
 * Prompt user to choose from a list of options
 */
async function promptForChoice(
  promptText: string, 
  options: {key: string, label: string}[]
): Promise<string> {
  console.log(promptText);
  
  for (const option of options) {
    console.log(`${option.key}. ${option.label}`);
  }
  
  while (true) {
    const response = await promptUser('Enter your choice: ');
    
    for (const option of options) {
      if (response === option.key) {
        return option.key;
      }
    }
    
    console.log('Invalid choice. Please try again.');
  }
}

// Run the showcase
main().catch(err => {
  console.error('Error in showcase:', err);
  process.exit(1);
});