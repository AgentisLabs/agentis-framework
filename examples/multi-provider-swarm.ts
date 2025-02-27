/**
 * Multi-Provider Agent Swarm Example
 * 
 * This example demonstrates a powerful collaboration between specialized agents
 * using different LLM providers and tools to work together effectively.
 * 
 * The swarm consists of:
 * 1. A Researcher agent using OpenAI with web search capabilities
 * 2. An Analyst agent using Claude for deep reasoning
 * 3. A Coordinator agent that organizes the collaboration
 */

import dotenv from 'dotenv';
import { 
  Agent, 
  AgentSwarm, 
  AgentRole, 
  AgentEvent,
  InMemoryMemory, 
  ProviderType,
  TavilySearchTool
} from '../src';

// Load environment variables
dotenv.config();

// Verify required API keys are available
const requiredKeys = [
  { name: 'ANTHROPIC_API_KEY', display: 'Anthropic Claude API' },
  { name: 'OPENAI_API_KEY', display: 'OpenAI API' },
  { name: 'TAVILY_API_KEY', display: 'Tavily Search API' }
];

console.log('Checking for required API keys:');
for (const key of requiredKeys) {
  const status = process.env[key.name] ? '✅' : '❌';
  console.log(`- ${key.display}: ${status}`);
  
  if (!process.env[key.name]) {
    console.error(`\nMissing ${key.name}. Please add it to your .env file.`);
    process.exit(1);
  }
}

/**
 * Main function to demonstrate the multi-provider agent swarm
 */
async function main() {
  console.log('\nCreating specialized agents with different providers and tools...');
  
  // Initialize the web search tool for the researcher
  const searchTool = new TavilySearchTool();
  
  // Make sure the search tool always includes an AI-generated summary
  const originalExecute = searchTool.execute;
  searchTool.execute = async (params: any) => {
    const newParams = { ...params, includeAnswer: true };
    return originalExecute.call(searchTool, newParams);
  };
  
  //======= 1. Create the OpenAI Researcher Agent =======
  console.log('\nCreating OpenAI-powered Researcher agent with web search capabilities...');
  const researcherAgent = new Agent(
    {
      name: 'OpenAI Researcher',
      role: AgentRole.RESEARCHER,
      personality: {
        traits: ['factual', 'thorough', 'internet-savvy', 'resourceful'],
        background: 'A research specialist with access to current information through web search capabilities, focused on finding and organizing factual information.'
      },
      goals: [
        'Find accurate and up-to-date information on the web',
        'Organize research findings in a clear, structured format',
        'Gather comprehensive data from reliable sources'
      ],
      systemPrompt: `You are a research specialist with web search capabilities.

Your primary role is to find current, accurate information on the web using your search tool.

ALWAYS use the web_search tool when asked to research a topic or find current information.

When searching:
1. Create targeted search queries for best results
2. Extract the most relevant information from search results
3. Organize findings in a structured format
4. Cite your sources

Format your research as bulletpoints with clear headings and categories to make it easy for other agents to analyze.`
    },
    undefined,
    {
      type: ProviderType.OPENAI,
      model: 'gpt-4o' // Using GPT-4o for advanced web search and research
    }
  );
  
  // Add memory to maintain context
  researcherAgent.setMemory(new InMemoryMemory());
  
  //======= 2. Create the Claude Analyst Agent =======
  console.log('Creating Claude-powered Analyst agent for deep reasoning and analysis...');
  const analystAgent = new Agent(
    {
      name: 'Claude Analyst',
      role: AgentRole.ANALYST,
      personality: {
        traits: ['analytical', 'thoughtful', 'nuanced', 'detail-oriented'],
        background: 'A specialized analysis expert focused on processing information, identifying patterns, and drawing insightful conclusions with strong reasoning capabilities.'
      },
      goals: [
        'Analyze information carefully and thoroughly',
        'Identify key patterns and insights from research data',
        'Evaluate the implications of findings',
        'Provide well-reasoned analysis with clear logic'
      ],
      systemPrompt: `You are an expert analyst specializing in information processing and insight generation.

Your primary role is to analyze research findings provided by other agents and produce thoughtful, nuanced analysis.

When analyzing information:
1. Identify the most significant patterns and trends
2. Evaluate the reliability and implications of the data
3. Draw connections between different pieces of information
4. Provide a balanced assessment that considers multiple perspectives
5. Highlight the most important insights for decision-making

Your analysis should go beyond summarizing - provide genuine insights and well-reasoned conclusions.`
    },
    undefined,
    {
      type: ProviderType.ANTHROPIC,
      model: 'claude-3-5-sonnet-20240620' // Using Claude for nuanced analysis
    }
  );
  
  // Add memory to maintain context
  analystAgent.setMemory(new InMemoryMemory());
  
  //======= 3. Create the Coordinator Agent =======
  console.log('Creating Coordinator agent to orchestrate the collaboration...');
  const coordinatorAgent = new Agent({
    name: 'Coordinator',
    role: AgentRole.COORDINATOR,
    personality: {
      traits: ['organized', 'strategic', 'clear-minded', 'efficient'],
      background: 'An orchestration specialist designed to coordinate between different specialized agents, manage workflows, and synthesize information effectively.'
    },
    goals: [
      'Efficiently organize tasks between specialized agents',
      'Ensure clear communication between agents',
      'Synthesize agent outputs into cohesive results',
      'Maintain focus on the overall objective'
    ],
    systemPrompt: `You are a coordination specialist responsible for orchestrating collaboration between specialized AI agents.

Your responsibilities include:
1. Breaking complex tasks into appropriate subtasks for specialist agents
2. Determining which agent should handle each aspect of a project
3. Synthesizing the outputs from different agents into a cohesive, unified response
4. Ensuring the overall objective is met efficiently and effectively

When coordinating:
- Assign research tasks to the OpenAI Researcher (who has web search capabilities)
- Assign analysis and reasoning tasks to the Claude Analyst (who excels at nuanced thinking)
- Provide clear instructions to each agent on their responsibilities
- Create a unified, coherent response that leverages the strengths of each agent`
  });
  
  // Add memory to maintain context
  coordinatorAgent.setMemory(new InMemoryMemory());
  
  // Set up event listeners to show the collaboration process
  const setupAgentLogging = (agent: Agent) => {
    agent.on(AgentEvent.THINKING, (data) => {
      console.log(`\n[${agent.config.name}] ${data.message}`);
    });
  };
  
  setupAgentLogging(researcherAgent);
  setupAgentLogging(analystAgent);
  setupAgentLogging(coordinatorAgent);
  
  //======= Create the Agent Swarm =======
  console.log('\nCreating Multi-Provider Agent Swarm...');
  const swarm = new AgentSwarm({
    agents: [researcherAgent, analystAgent],
    coordinator: coordinatorAgent,
    planningStrategy: 'parallel', // Use parallel execution for efficiency
    maxConcurrentAgents: 2 // Allow both specialist agents to work simultaneously
  });
  
  // Get the task to run from command line or use default
  const task = process.argv[2] || "Investigate the impact of quantum computing on cryptography. What are the latest developments and how might they affect current encryption methods?";
  
  console.log(`\n🚀 Running Multi-Provider Agent Swarm with task:\n"${task}"\n`);
  console.log('The Researcher will use OpenAI + web search while the Analyst uses Claude for deep reasoning.\n');
  
  // Run the swarm with the task and tools
  try {
    const result = await swarm.run({
      task,
      tools: [searchTool], // The search tool will be available to all agents
    });
    
    // Display the final synthesized result
    console.log('\n✅ Swarm Task Completed');
    console.log('\n======================= FINAL RESULT =======================\n');
    console.log(result.response);
    console.log('\n===========================================================\n');
  } catch (error) {
    console.error('Error running agent swarm:', error);
  }
}

// Run the example
main().catch(console.error);