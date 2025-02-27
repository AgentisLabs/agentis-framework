// Basic planning demo example
import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  DefaultPlanner,
  Plan
} from '../src';

// Load environment variables
dotenv.config();

console.log('Checking for API keys:');
console.log('- Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');

/**
 * This example demonstrates using the basic planning system
 */
async function main() {
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Anthropic API key is required');
    process.exit(1);
  }
  
  console.log('\nCreating an agent with planning capabilities...');
  
  // Create the agent
  const agent = new Agent({
    name: 'Planning Agent',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['analytical', 'methodical', 'detail-oriented'],
      background: 'An AI assistant with planning capabilities.'
    },
    goals: ['Break down complex tasks into manageable steps', 'Execute plans efficiently'],
  });
  
  // Create the default planner
  const planner = new DefaultPlanner();
  
  // Define a simple task
  const task = "Write a short blog post outline about AI basics";
  
  // Create a plan
  console.log('\nCreating a plan...');
  const plan = await planner.createPlan(task, agent);
  
  // Display the plan
  printPlan(plan);
  
  // Execute the plan
  console.log('\nExecuting the plan...');
  const result = await planner.executePlan(plan, agent, { task });
  
  // Show the result
  console.log('\nPlan execution result:');
  console.log(result.response);
}

// Helper function to print a plan
function printPlan(plan: Plan) {
  console.log(`\nPlan ID: ${plan.id}`);
  console.log(`Original Task: ${plan.originalTask}`);
  console.log(`Status: ${plan.status}`);
  console.log('\nTasks:');
  
  plan.tasks.forEach((task, index) => {
    console.log(`\n${index + 1}. ${task.description}`);
    console.log(`   Status: ${task.status}`);
    console.log(`   Dependencies: ${task.dependencies.length ? task.dependencies.join(', ') : 'None'}`);
  });
}

// Run the example
main().catch(console.error);