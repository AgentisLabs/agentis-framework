import { Agent } from '../src/core/agent';
import { AgentRole } from '../src/core/types';
import { AutonomousAgent } from '../src/core/autonomous-agent';
import { GoalType } from '../src/planning/goal-planner';
import { BraveSearchTool } from '../src/tools/brave-search-tool';
import { TavilySearchTool } from '../src/tools/tavily-search-tool';
import { OpenAIProvider } from '../src/core/openai-provider';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check for API key
if (!process.env.OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Check for Brave Search API key
if (!process.env.BRAVE_API_KEY) {
  console.warn('BRAVE_API_KEY environment variable is not set. Brave search tool may not work.');
}

// Create a Brave search tool
const webSearchTool = new BraveSearchTool();

// Create a Tavily search tool if API key is available
let tavilySearchTool;
if (process.env.TAVILY_API_KEY) {
  tavilySearchTool = new TavilySearchTool();
}

// Define available tools
const tools = [
  webSearchTool,
  ...(tavilySearchTool ? [tavilySearchTool] : [])
];

// Create a base agent with OpenAI provider
const provider = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o' // Use GPT-4o for better reasoning
});

const baseAgent = new Agent({
  name: 'ResearchAgent',
  role: AgentRole.RESEARCHER,
  personality: {
    traits: ['analytical', 'thorough', 'curious', 'objective'],
    background: 'An AI researcher specializing in finding and analyzing information on various topics.'
  },
  goals: [
    'Find accurate and relevant information',
    'Provide well-organized research results',
    'Cite sources properly'
  ]
}, provider);

// Create an autonomous agent with goal planning enabled
const autonomousAgent = new AutonomousAgent({
  baseAgent,
  healthCheckIntervalMinutes: 5,
  enableAutoRecovery: true,
  enableContinuousMode: true,
  stateStoragePath: './data/agent-state',
  goalPlanning: {
    enabled: true,
    maxSubgoals: 5,
    maxTasksPerGoal: 7,
    adaptivePlanning: true,
    defaultPriority: 5,
    persistGoals: true,
    goalsStoragePath: './data/agent-goals'
  }
});

// Start the agent
autonomousAgent.start();

/**
 * Demonstrate a research goal
 */
async function demoResearchGoal() {
  console.log('\n=== Demonstrating Autonomous Research Goal ===\n');
  
  // Create a research goal
  const researchGoal = await autonomousAgent.createGoal(
    'Research and summarize the latest developments in quantum computing from the past year',
    {
      type: GoalType.INFORMATION,
      successCriteria: [
        'Find at least 3 significant developments in quantum computing from the past year',
        'Provide a coherent summary with proper citations',
        'Include both technical achievements and business/commercial developments'
      ],
      executeImmediately: true,
      tools: tools
    }
  );
  
  console.log(`Created research goal with ID: ${researchGoal.id}`);
  console.log('Goal is now executing. Progress will be reported...\n');
  
  // Wait for goal completion (in a real application, you would use events)
  await waitForGoalCompletion(researchGoal.id);
}

/**
 * Demonstrate a recurring monitoring goal
 */
async function demoRecurringGoal() {
  console.log('\n=== Demonstrating Recurring Monitoring Goal ===\n');
  
  // Create a monitoring goal that runs every 15 minutes
  const monitoringGoal = await autonomousAgent.createGoal(
    'Monitor for new developments in AI safety research',
    {
      type: GoalType.MONITORING,
      successCriteria: [
        'Check reputable sources for new AI safety research',
        'Identify any significant announcements or papers',
        'Report findings clearly and concisely'
      ],
      recurrence: 'every 15 minutes',
      tools: tools
    }
  );
  
  console.log(`Created recurring monitoring goal with ID: ${monitoringGoal.id}`);
  console.log('Goal will execute every 15 minutes\n');
  
  // Wait for the first execution
  await waitForGoalExecution(monitoringGoal.id);
}

/**
 * Helper function to wait for a goal to complete
 */
async function waitForGoalCompletion(goalId: string, maxAttempts = 60): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const goal = autonomousAgent.getGoal(goalId);
    
    if (!goal) {
      console.log('Goal not found');
      return;
    }
    
    console.log(`Goal status: ${goal.status}, waiting...`);
    
    if (goal.status === 'completed' || goal.status === 'failed') {
      console.log(`Goal execution finished with status: ${goal.status}`);
      return;
    }
    
    // Wait 5 seconds between checks
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('Timed out waiting for goal completion');
}

/**
 * Helper function to wait for a goal to execute at least once
 */
async function waitForGoalExecution(goalId: string, maxAttempts = 60): Promise<void> {
  const goal = autonomousAgent.getGoal(goalId);
  if (!goal) {
    console.log('Goal not found');
    return;
  }
  
  const initialStatus = goal.status;
  
  for (let i = 0; i < maxAttempts; i++) {
    const currentGoal = autonomousAgent.getGoal(goalId);
    
    if (!currentGoal) {
      console.log('Goal not found');
      return;
    }
    
    // Check if status has changed, which indicates execution
    if (currentGoal.status !== initialStatus) {
      console.log(`Goal executed with status: ${currentGoal.status}`);
      return;
    }
    
    console.log(`Waiting for goal to execute...`);
    
    // Wait 5 seconds between checks
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('Timed out waiting for goal execution');
}

// Run the demos
async function runDemos() {
  try {
    await demoResearchGoal();
    await demoRecurringGoal();
    
    console.log('\n=== All demos completed ===\n');
    console.log('The autonomous agent is still running with its recurring goals.');
    console.log('Press Ctrl+C to stop the agent and exit.');
  } catch (error) {
    console.error('Error running demos:', error);
    autonomousAgent.stop();
    process.exit(1);
  }
}

// Start the demos
runDemos().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down autonomous agent...');
  autonomousAgent.stop();
  process.exit(0);
});