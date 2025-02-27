/**
 * Integrated Showcase for Agentis Framework
 * 
 * This example demonstrates the complete capabilities of the Agentis framework
 * by integrating all major features:
 * 
 * 1. Multi-provider agent swarm with specialized agents
 * 2. Advanced task dependency inference
 * 3. Enhanced memory system
 * 4. Hierarchical planning
 * 5. Dynamic provider selection
 * 6. Cross-provider collaboration
 */

import { Agent } from '../src/core/agent';
import { AgentRole } from '../src/core/types';
import { EnhancedAgentSwarm, AgentSpecialization } from '../src/core/enhanced-agent-swarm';
import { ProviderType } from '../src/core/provider-interface';
import { DependencyInference } from '../src/planning/dependency-inference';
// For demonstration purposes, reference these types but don't actually use them
// since we're only showing what the integrated example would look like
import { VectorStoreInterface, Vector } from '../src/memory/vector-store';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

async function runShowcase() {
  console.log('Agentis Framework - Integrated Showcase');
  console.log('======================================\n');
  
  // Set up memory system (in a real implementation)
  console.log('Setting up enhanced memory system...');
  console.log('(For demonstration purposes only - not actually initializing memory)');
  
  // This is how you would use the memory system in a real implementation:
  /*
  const vectorStore = new InMemoryVectorStore({
    dimensions: 1536
  });
  
  const memory = new EnhancedMemory(vectorStore, {
    userId: 'showcase-user',
    namespace: 'integrated-demo',
    shortTermTTL: 24 * 60 * 60 * 1000, // 24 hours
  });
  
  await memory.initialize();
  
  await memory.storeShortTerm({
    input: "What's the project about?",
    output: "We're working on a content marketing strategy for a SaaS product that helps businesses manage customer support workflows.",
    timestamp: Date.now() - 86400000 // 1 day ago
  });
  
  await memory.storeShortTerm({
    input: "Who is our target audience?",
    output: "Our primary audience is customer service managers and CX leaders at mid-size B2B SaaS companies with 50-500 employees.",
    timestamp: Date.now() - 43200000 // 12 hours ago
  });
  
  await memory.saveNote({
    title: "Project Context",
    content: "The client needs a comprehensive content strategy to establish thought leadership in customer experience optimization. They want to drive organic traffic and generate leads for their support automation platform.",
    tags: ["project", "context", "requirements"],
    importance: 0.9
  });
  */
  
  // Create specialized agents for different tasks
  console.log('Creating specialized agents...');
  
  // 1. Research Agent using OpenAI - good at gathering and synthesizing information
  const researcherAgent = new Agent({
    name: 'Researcher',
    role: AgentRole.RESEARCHER,
    personality: {
      traits: ['thorough', 'detail-oriented', 'analytical'],
      background: 'Specialized in gathering and synthesizing information from multiple sources'
    },
    goals: ['Find accurate and relevant information', 'Identify patterns and insights in data']
  });
  
  // 2. Analyst Agent using Claude - excellent at critical thinking and strategic analysis
  const analystAgent = new Agent({
    name: 'Analyst',
    role: AgentRole.ANALYST,
    personality: {
      traits: ['strategic', 'thoughtful', 'nuanced'],
      background: 'Specialized in deep analysis, critical thinking, and insight generation'
    },
    goals: ['Provide nuanced analysis of complex situations', 'Identify strategic opportunities']
  });
  
  // 3. Writer Agent using OpenAI - good at creative content generation
  const writerAgent = new Agent({
    name: 'Writer',
    role: AgentRole.WRITER,
    personality: {
      traits: ['creative', 'articulate', 'engaging'],
      background: 'Specialized in creating compelling content that resonates with specific audiences'
    },
    goals: ['Create engaging content', 'Adapt tone and style for different contexts']
  });
  
  // 4. Coordinator Agent using Claude - excellent at planning and oversight
  const coordinatorAgent = new Agent({
    name: 'Coordinator',
    role: AgentRole.COORDINATOR,
    personality: {
      traits: ['organized', 'efficient', 'collaborative'],
      background: 'Specialized in coordinating complex projects and facilitating collaboration'
    },
    goals: ['Ensure efficient task execution', 'Facilitate information flow between agents']
  });
  
  // Set up memories for all agents (in a real implementation)
  console.log('(In a real implementation, agents would have memories attached)');
  
  // Define agent specializations based on their providers and capabilities
  const agentSpecializations: Record<string, AgentSpecialization> = {
    [researcherAgent.id]: {
      name: 'Research Specialist',
      description: 'Information gathering and synthesis expert',
      capabilities: ['web research', 'data analysis', 'pattern recognition'],
      preferredTaskTypes: ['research', 'data collection', 'summarization'],
      provider: ProviderType.OPENAI
    },
    [analystAgent.id]: {
      name: 'Strategic Analyst',
      description: 'Deep analysis and strategic thinking expert',
      capabilities: ['critical thinking', 'strategic analysis', 'insight generation'],
      preferredTaskTypes: ['analysis', 'evaluation', 'recommendation'],
      provider: ProviderType.ANTHROPIC
    },
    [writerAgent.id]: {
      name: 'Content Creator',
      description: 'Creative content writing expert',
      capabilities: ['creative writing', 'audience targeting', 'engaging communication'],
      preferredTaskTypes: ['writing', 'content creation', 'editing'],
      provider: ProviderType.OPENAI
    }
  };
  
  // Create the enhanced agent swarm
  console.log('Creating enhanced multi-provider agent swarm...');
  const swarm = new EnhancedAgentSwarm({
    agents: [researcherAgent, analystAgent, writerAgent],
    coordinator: coordinatorAgent,
    agentSpecializations,
    planningStrategy: 'hierarchical',
    maxConcurrentAgents: 3,
    enabledCommunicationChannels: ['direct', 'broadcast']
  });
  
  // Example complex task
  const complexTask = `
    Develop a comprehensive content marketing strategy for a SaaS customer support platform.
    Include content pillars, content types, distribution channels, and a 3-month editorial calendar.
    Focus on establishing thought leadership in customer experience optimization.
  `;
  
  console.log('\nExecuting complex task:');
  console.log(complexTask);
  console.log('\nBreaking down task and inferring dependencies...');
  
  // Showcase: Directly use the dependency inference system
  const planTasks = [
    {
      id: uuidv4(),
      description: "Research current trends in customer experience and support automation",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Analyze competitor content strategies and identify content gaps",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Define target audience personas and their content preferences",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Identify key content pillars and topics aligned with product features",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Develop content formats and types for different funnel stages",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Create distribution and promotion strategy for maximum reach",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Design 3-month editorial calendar with specific content pieces",
      dependencies: [],
      status: 'pending'
    },
    {
      id: uuidv4(),
      description: "Establish KPIs and success metrics for content performance",
      dependencies: [],
      status: 'pending'
    }
  ];
  
  // Create context description for dependency inference
  const planContext = `
    To develop a comprehensive content marketing strategy for a SaaS customer support platform, we need to follow a structured approach.
    
    First, we need to research current trends in customer experience and support automation to understand the landscape.
    In parallel, we should analyze competitor content strategies to identify gaps and opportunities.
    
    Once we have this research, we need to define our target audience personas and their content preferences.
    Using all this information, we can identify key content pillars that align with our product features.
    
    After establishing our pillars, we'll develop appropriate content formats and types for different stages of the marketing funnel.
    Then we can create a distribution and promotion strategy to ensure maximum reach.
    
    With all these elements in place, we'll design a 3-month editorial calendar with specific content pieces.
    Finally, we'll establish KPIs and success metrics to measure the performance of our content strategy.
  `;
  
  // Set up the dependency inference system
  const dependencyInference = new DependencyInference({
    enableContentSimilarity: true,
    enableTypeHierarchy: true,
    enableInformationFlow: true
  });
  
  // Infer dependencies between tasks
  // In a real implementation, these tasks would properly implement the PlanTask interface
  // This is just for demonstration
  const planTasksTyped = planTasks as any;
  const tasksWithDependencies = dependencyInference.inferDependencies(planTasksTyped, planContext);
  
  // Show the dependency graph
  console.log('\nTask Dependency Analysis:');
  console.log(dependencyInference.visualizeDependencyGraph(tasksWithDependencies));
  
  console.log('\nDemonstration only: In a real implementation, the EnhancedAgentSwarm would now:');
  console.log('1. Automatically assign tasks to specialized agents based on their capabilities');
  console.log('2. Execute tasks in parallel where possible, respecting dependencies');
  console.log('3. Share context between agents for seamless collaboration');
  console.log('4. Dynamically adjust the plan if needed during execution');
  console.log('5. Synthesize the final result combining all agent outputs');
  
  console.log('\nIntegrated showcase complete!');
}

// Run the showcase
runShowcase().catch(error => {
  console.error('Error running showcase:', error);
});