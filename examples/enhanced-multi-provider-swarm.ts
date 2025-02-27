/**
 * Enhanced Multi-Provider Agent Swarm Example
 * 
 * This example demonstrates advanced collaboration between specialized agents
 * using different LLM providers and tools, with enhanced coordination capabilities.
 * 
 * The enhanced swarm features:
 * - Specialized agents with different providers and capabilities
 * - Sophisticated task planning and distribution
 * - Inter-agent communication
 * - Dynamic collaboration based on task requirements
 */

import dotenv from 'dotenv';
import { 
  Agent, 
  AgentRole, 
  AgentEvent,
  InMemoryMemory, 
  ProviderType,
  TavilySearchTool
} from '../src';
import { EnhancedAgentSwarm, AgentSpecialization } from '../src/core/enhanced-agent-swarm';

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
 * Main function to demonstrate the enhanced multi-provider agent swarm
 */
async function main() {
  console.log('\n🚀 Starting Enhanced Multi-Provider Agent Swarm Example\n');
  
  //======= Create Web Search Tool =======
  const searchTool = new TavilySearchTool();
  
  // Make sure search tool always includes an AI-generated summary
  const originalExecute = searchTool.execute;
  searchTool.execute = async (params: any) => {
    const newParams = { ...params, includeAnswer: true };
    return originalExecute.call(searchTool, newParams);
  };
  
  //======= Create Agents with Different Providers =======
  console.log('Creating specialized agents with different capabilities...');
  
  // 1. OpenAI Researcher Agent (GPT-4o with web search for information gathering)
  console.log('\n1. Creating OpenAI Researcher with web search...');
  const researcherAgent = new Agent(
    {
      name: 'ResearchBot',
      role: AgentRole.RESEARCHER,
      personality: {
        traits: ['meticulous', 'internet-savvy', 'data-driven', 'resourceful'],
        background: 'A specialized research agent powered by OpenAI, skilled in web search and current information gathering.'
      },
      goals: [
        'Find accurate and current information',
        'Gather comprehensive data from the web',
        'Organize findings in clear, structured formats'
      ],
      systemPrompt: `You are a specialized research agent powered by OpenAI with web search capabilities.

Your primary function is to find accurate, current information by searching the web.

ALWAYS use your web_search tool when asked to find information.

Guidelines for effective research:
1. Break complex topics into specific search queries
2. Use multiple searches to gather comprehensive information
3. Format your findings clearly with headings and lists
4. Include URLs of your sources
5. Focus on factual information and objective data`
    },
    undefined,
    {
      type: ProviderType.OPENAI,
      model: 'gpt-4o' // Using GPT-4o for advanced search capabilities
    }
  );
  
  // 2. Claude Analyst Agent (Claude for deep reasoning and analysis)
  console.log('2. Creating Claude Analyst for reasoning and insight generation...');
  const analystAgent = new Agent(
    {
      name: 'InsightBot',
      role: AgentRole.ANALYST,
      personality: {
        traits: ['analytical', 'nuanced', 'thoughtful', 'insightful'],
        background: 'A specialized analysis agent powered by Claude, skilled in deep reasoning, pattern recognition, and generating nuanced insights.'
      },
      goals: [
        'Analyze information with depth and nuance',
        'Identify patterns and connections across datasets',
        'Generate thoughtful, well-reasoned insights',
        'Consider multiple perspectives and implications'
      ],
      systemPrompt: `You are a specialized analysis agent powered by Claude.

Your primary function is to analyze information provided by other agents and extract meaningful insights.

Guidelines for effective analysis:
1. Look beyond surface-level information to identify deeper patterns
2. Consider multiple perspectives and potential interpretations
3. Evaluate the reliability and significance of different data points
4. Draw connections between seemingly unrelated information
5. Provide well-reasoned, nuanced conclusions
6. Acknowledge limitations and uncertainties in your analysis`
    },
    undefined,
    {
      type: ProviderType.ANTHROPIC,
      model: 'claude-3-5-sonnet-20240620' // Using Claude for nuanced analysis
    }
  );
  
  // 3. OpenAI Writer Agent (GPT-4o for content creation)
  console.log('3. Creating OpenAI Writer for content creation...');
  const writerAgent = new Agent(
    {
      name: 'ContentBot',
      role: AgentRole.WRITER,
      personality: {
        traits: ['creative', 'articulate', 'adaptable', 'precise'],
        background: 'A specialized writing agent powered by OpenAI, skilled in creating clear, compelling content in various formats and styles.'
      },
      goals: [
        'Create well-structured, engaging content',
        'Adapt writing style to different contexts and audiences',
        'Communicate complex ideas clearly and concisely',
        'Ensure accuracy and clarity in all content'
      ],
      systemPrompt: `You are a specialized writing agent powered by OpenAI.

Your primary function is to create high-quality content based on research and analysis from other agents.

Guidelines for effective writing:
1. Structure content with clear organization (introductions, sections, conclusions)
2. Use engaging and appropriate language for the target audience
3. Maintain a consistent tone and style throughout
4. Use concrete examples to illustrate abstract concepts
5. Prioritize clarity and conciseness
6. Synthesize information from multiple sources into cohesive narratives`
    },
    undefined,
    {
      type: ProviderType.OPENAI,
      model: 'gpt-4o' // Using GPT-4o for creative writing
    }
  );
  
  // 4. Claude Coordinator Agent (Claude for orchestration)
  console.log('4. Creating Claude Coordinator for orchestration...');
  const coordinatorAgent = new Agent(
    {
      name: 'OrchestraBot',
      role: AgentRole.COORDINATOR,
      personality: {
        traits: ['strategic', 'organizational', 'collaborative', 'decisive'],
        background: 'A specialized coordination agent powered by Claude, skilled in task orchestration, workflow management, and integrating diverse contributions.'
      },
      goals: [
        'Effectively coordinate specialized agents',
        'Break down complex problems into appropriate subtasks',
        'Ensure efficient collaboration between agents',
        'Synthesize diverse contributions into cohesive outputs'
      ],
      systemPrompt: `You are a specialized coordination agent powered by Claude.

Your primary function is to orchestrate collaboration between different specialized agents:
- ResearchBot (OpenAI with web search): Excels at gathering current information from the web
- InsightBot (Claude): Excels at deep analysis, reasoning, and generating nuanced insights
- ContentBot (OpenAI): Excels at creating well-structured, engaging content

Guidelines for effective coordination:
1. Break complex tasks into appropriate subtasks for each specialized agent
2. Assign tasks based on each agent's strengths and capabilities
3. Establish clear dependencies between tasks
4. Manage workflow to maximize efficiency and quality
5. Synthesize the contributions of different agents into coherent outputs
6. Identify when additional information or analysis is needed`
    },
    undefined,
    {
      type: ProviderType.ANTHROPIC,
      model: 'claude-3-5-sonnet-20240620' // Using Claude for coordination
    }
  );
  
  // Add memory to all agents
  researcherAgent.setMemory(new InMemoryMemory());
  analystAgent.setMemory(new InMemoryMemory());
  writerAgent.setMemory(new InMemoryMemory());
  coordinatorAgent.setMemory(new InMemoryMemory());
  
  // Set up event listeners to show agent activities
  const setupAgentLogging = (agent: Agent) => {
    agent.on(AgentEvent.THINKING, (data) => {
      console.log(`\n[${agent.config.name}] ${data.message}`);
    });
    
    agent.on(AgentEvent.TOOL_CALL, (data) => {
      console.log(`\n[${agent.config.name}] Using tool: ${data.tool}`);
    });
  };
  
  setupAgentLogging(researcherAgent);
  setupAgentLogging(analystAgent);
  setupAgentLogging(writerAgent);
  setupAgentLogging(coordinatorAgent);
  
  //======= Define Agent Specializations =======
  const agentSpecializations: Record<string, AgentSpecialization> = {
    [researcherAgent.id]: {
      name: 'ResearchBot',
      description: 'Web search and information gathering specialist',
      capabilities: ['web search', 'data collection', 'information retrieval', 'fact-checking'],
      preferredTaskTypes: ['research', 'search', 'data gathering', 'verification'],
      provider: ProviderType.OPENAI
    },
    [analystAgent.id]: {
      name: 'InsightBot',
      description: 'Deep reasoning and analysis specialist',
      capabilities: ['pattern recognition', 'critical thinking', 'nuanced analysis', 'insight generation'],
      preferredTaskTypes: ['analysis', 'evaluation', 'interpretation', 'reasoning'],
      provider: ProviderType.ANTHROPIC
    },
    [writerAgent.id]: {
      name: 'ContentBot',
      description: 'Content creation and communication specialist',
      capabilities: ['writing', 'storytelling', 'explanation', 'summarization'],
      preferredTaskTypes: ['writing', 'content creation', 'explanation', 'summarization'],
      provider: ProviderType.OPENAI
    }
  };
  
  //======= Create Enhanced Agent Swarm =======
  console.log('\nCreating Enhanced Multi-Provider Agent Swarm...');
  const enhancedSwarm = new EnhancedAgentSwarm({
    agents: [researcherAgent, analystAgent, writerAgent],
    coordinator: coordinatorAgent,
    planningStrategy: 'parallel',
    maxConcurrentAgents: 3,
    agentSpecializations,
    enabledCommunicationChannels: ['direct', 'broadcast']
  });
  
  // Get the task to run from command line or use default
  const task = process.argv[2] || "Create a comprehensive explainer about the future of renewable energy. Include the latest technological developments, challenges, and potential impact on global energy systems.";
  
  console.log(`\n🚀 Running Enhanced Multi-Provider Agent Swarm with task:\n"${task}"\n`);
  console.log('This swarm features specialized agents with different LLM providers working together with enhanced coordination.\n');
  
  // Run the enhanced swarm with the task and tools
  try {
    const result = await enhancedSwarm.runEnhanced({
      task,
      tools: [searchTool],
    });
    
    // Display the final synthesized result
    console.log('\n✅ Enhanced Swarm Task Completed');
    console.log('\n======================= FINAL RESULT =======================\n');
    console.log(result.response);
    console.log('\n===========================================================\n');
  } catch (error) {
    console.error('Error running enhanced agent swarm:', error);
  }
}

// Run the example
main().catch(console.error);