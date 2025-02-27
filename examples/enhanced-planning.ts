// Enhanced planning example
import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  EnhancedPlanner,
  PlanningStrategy
} from '../src';

// Load environment variables
dotenv.config();

console.log('Checking for API keys:');
console.log('- Anthropic API key:', process.env.ANTHROPIC_API_KEY ? 'Found' : 'Not found');

/**
 * This example demonstrates using the enhanced planning system
 */
async function main() {
  // Check for required API keys
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Anthropic API key is required');
    process.exit(1);
  }
  
  console.log('\nCreating an agent with enhanced planning...');
  
  // Create the agent
  const agent = new Agent({
    name: 'Planning Agent',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['analytical', 'methodical', 'detail-oriented'],
      background: 'An AI assistant with advanced planning capabilities.'
    },
    goals: ['Break down complex tasks into manageable steps', 'Execute plans efficiently'],
  });
  
  // Create the enhanced planner
  const planner = new EnhancedPlanner();
  
  // Define a simpler task
  const task = "Write a blog post about artificial intelligence for beginners";
  
  // Create a hierarchical plan
  console.log('\nCreating a hierarchical plan...');
  
  const hierarchicalPlan = await planner.createPlan(task, agent, {
    strategy: PlanningStrategy.HIERARCHICAL
  });
  
  console.log(`Created hierarchical plan with ${hierarchicalPlan.tasks.length} phases:`);
  
  // Print plan structure
  hierarchicalPlan.tasks.forEach((phase, phaseIndex) => {
    console.log(`\nPhase ${phaseIndex + 1}: ${phase.description}`);
    
    if (phase.subtasks) {
      phase.subtasks.forEach((task, taskIndex) => {
        console.log(`  Task ${phaseIndex + 1}.${taskIndex + 1}: ${task.description}`);
        
        if (task.subtasks) {
          task.subtasks.forEach((subtask, subtaskIndex) => {
            console.log(`    Subtask ${phaseIndex + 1}.${taskIndex + 1}.${subtaskIndex + 1}: ${subtask.description}`);
          });
        }
      });
    }
  });
  
  console.log('\nPlanning completed successfully!');
}

// Run the example
main().catch(console.error);