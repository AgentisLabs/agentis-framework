// Agent swarm example
import { 
  Agent, 
  AgentSwarm, 
  AgentRole, 
  InMemoryMemory, 
  PlanningStrategy,
  WebSearchTool
} from '../src';

/**
 * This example demonstrates creating a swarm of specialized agents
 * that work together to complete a complex task.
 */
async function main() {
  console.log('Creating a swarm of specialized agents...');
  
  // Create the researcher agent
  const researchAgent = new Agent({
    name: 'Researcher',
    role: AgentRole.RESEARCHER,
    personality: {
      traits: ['analytical', 'thorough', 'detail-oriented'],
      background: 'An AI agent specialized in finding information and conducting research.'
    },
    goals: ['Find accurate information', 'Gather comprehensive data'],
  });
  
  // Create the writer agent
  const writerAgent = new Agent({
    name: 'Writer',
    role: AgentRole.WRITER,
    personality: {
      traits: ['creative', 'articulate', 'concise'],
      background: 'An AI agent specialized in creating well-written, engaging content.'
    },
    goals: ['Create clear and concise content', 'Make complex information accessible'],
  });
  
  // Create the coordinator agent
  const coordinatorAgent = new Agent({
    name: 'Coordinator',
    role: AgentRole.COORDINATOR,
    personality: {
      traits: ['organized', 'efficient', 'strategic'],
      background: 'An AI agent specialized in coordinating tasks and synthesizing information.'
    },
    goals: ['Efficiently allocate tasks', 'Ensure cohesive results'],
  });
  
  // Add memory to each agent
  researchAgent.setMemory(new InMemoryMemory());
  writerAgent.setMemory(new InMemoryMemory());
  coordinatorAgent.setMemory(new InMemoryMemory());
  
  // Create the swarm
  const swarm = new AgentSwarm({
    agents: [researchAgent, writerAgent],
    coordinator: coordinatorAgent,
    planningStrategy: PlanningStrategy.SEQUENTIAL,
  });
  
  // Run the swarm with a complex task
  console.log('\nGiving the swarm a complex task...\n');
  
  const result = await swarm.run({
    task: "Create a brief overview of quantum computing, including its basics, current state, and future potential.",
    tools: [new WebSearchTool()],
  });
  
  // Display the result
  console.log(`Swarm's response:\n${result.response}`);
}

// Run the example
main().catch(console.error);