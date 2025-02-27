/**
 * Basic Enhanced Agent Swarm Example
 * 
 * This is a simplified version of the enhanced agent swarm
 * to test that it works correctly.
 */

import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  AgentEvent,
  InMemoryMemory, 
  ProviderType,
  WebSearchTool
} from '../src';
import { EnhancedAgentSwarm } from '../src/core/enhanced-agent-swarm';

// Load environment variables
dotenv.config();

/**
 * Main function to demonstrate the enhanced agent swarm
 */
async function main() {
  console.log('\n🚀 Starting Basic Enhanced Agent Swarm Example\n');
  
  // Create agents
  console.log('Creating specialized agents...');
  
  // First agent
  const firstAgent = new Agent({
    name: 'ResearchAgent',
    role: AgentRole.RESEARCHER,
    personality: {
      traits: ['analytical', 'thorough'],
      background: 'A research specialist'
    },
    goals: ['Find accurate information']
  });
  
  // Second agent
  const secondAgent = new Agent({
    name: 'WriterAgent',
    role: AgentRole.WRITER,
    personality: {
      traits: ['creative', 'articulate'],
      background: 'A writing specialist'
    },
    goals: ['Create engaging content']
  });
  
  // Coordinator agent
  const coordinatorAgent = new Agent({
    name: 'Coordinator',
    role: AgentRole.COORDINATOR,
    personality: {
      traits: ['organized', 'strategic'],
      background: 'A coordination specialist'
    },
    goals: ['Coordinate effectively']
  });
  
  // Add memory to all agents
  firstAgent.setMemory(new InMemoryMemory());
  secondAgent.setMemory(new InMemoryMemory());
  coordinatorAgent.setMemory(new InMemoryMemory());
  
  // Set up event listeners
  const setupAgentLogging = (agent: Agent) => {
    agent.on(AgentEvent.THINKING, (data) => {
      console.log(`\n[${agent.config.name}] ${data.message}`);
    });
  };
  
  setupAgentLogging(firstAgent);
  setupAgentLogging(secondAgent);
  setupAgentLogging(coordinatorAgent);
  
  // Create enhanced swarm
  console.log('Creating Enhanced Agent Swarm...');
  const enhancedSwarm = new EnhancedAgentSwarm({
    agents: [firstAgent, secondAgent],
    coordinator: coordinatorAgent,
    planningStrategy: 'sequential',
    maxConcurrentAgents: 2
  });
  
  // Simple task
  const task = "Write a short paragraph about the importance of teamwork.";
  
  console.log(`\nRunning Enhanced Swarm with task: "${task}"\n`);
  
  // Run the enhanced swarm
  try {
    // First test with standard run method from parent class
    console.log('Testing standard run method...');
    const result = await enhancedSwarm.run({
      task: task,
    });
    
    // Display result
    console.log('\n✅ Task Completed');
    console.log('\nResult:\n' + result.response);
    
    // Then test with enhanced method if standard one works
    console.log('\nTesting enhanced run method...');
    const enhancedResult = await enhancedSwarm.runEnhanced({
      task: task + " Include specific examples.",
    });
    
    // Display enhanced result
    console.log('\n✅ Enhanced Task Completed');
    console.log('\nEnhanced Result:\n' + enhancedResult.response);
    
  } catch (error) {
    console.error('Error running enhanced agent swarm:', error);
  }
}

// Run the example
main().catch(console.error);