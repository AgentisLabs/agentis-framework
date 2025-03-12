// Agentis - A framework for autonomous AI agents
// Main entry point and exports

// Core components
export { Agent } from './core/agent';
export { AgentSwarm } from './core/agent-swarm';
export { AutonomousAgent, AutonomousAgentConfig } from './core/autonomous-agent';
export { 
  AgentRole, 
  AgentEvent 
} from './core/types';

// Enhanced Agent Swarm System
export { 
  EnhancedAgentSwarm,
  AgentSpecialization,
  EnhancedAgentTask,
  EnhancedSwarmPlan,
  EnhancedAgentSwarmConfig,
  AgentMessage
} from './core/enhanced-agent-swarm';

// Provider system
export { 
  ProviderType,
  LLMProviderInterface,
  GenerateOptions,
  GenerateResult
} from './core/provider-interface';
export { AnthropicProvider } from './core/llm-provider';
export { OpenAIProvider } from './core/openai-provider';
export { ProviderFactory } from './core/provider-factory';

// Memory
export { MemoryInterface, MemoryEntry } from './memory/memory-interface';
export { InMemoryMemory } from './memory/in-memory';
export { PersistentMemory } from './memory/persistent-memory';
export { VectorMemory } from './memory/vector-memory';

// Enhanced memory system
export { 
  EnhancedMemoryInterface,
  EnhancedMemoryConfig,
  ShortTermMemory,
  LongTermMemory,
  AgentNote,
  MemoryRetrievalResult
} from './memory/enhanced-memory-interface';
export { EnhancedMemory } from './memory/enhanced-memory';
export { EmbeddingService, EmbeddingServiceConfig } from './memory/embedding-service';
export { PineconeStore, VectorStore } from './memory/pinecone-store';

// Knowledge Graph and Knowledge Base
export { 
  KnowledgeGraph, 
  KnowledgeNode, 
  KnowledgeRelationship,
  KnowledgeGraphConfig,
  KnowledgeGraphQueryResult
} from './memory/knowledge-graph';
export { 
  KnowledgeBase,
  FAQEntry,
  DocumentEntry,
  KnowledgeBaseConfig,
  KnowledgeBaseQueryResult
} from './memory/knowledge-base';

// Planning
export { 
  PlannerInterface, 
  Plan, 
  PlanTask,
  PlanOptions,
  PlanningStrategy
} from './planning/planner-interface';
export { DefaultPlanner } from './planning/default-planner';
export { EnhancedPlanner } from './planning/enhanced-planner';
export { 
  DependencyInference, 
  DependencyInferenceConfig,
  DependencyGraph,
  TaskInfoFlow 
} from './planning/dependency-inference';
export {
  GoalPlanner,
  GoalType,
  GoalStatus,
  Goal,
  GoalTask,
  GoalResult,
  GoalPlannerConfig
} from './planning/goal-planner';

export { RunGoalOptions } from './core/autonomous-agent';

// Tools
export { ToolRegistry } from './tools/tool-registry';
export { WebSearchTool } from './tools/web-search-tool';
export { BraveSearchTool } from './tools/brave-search-tool';
export { TavilySearchTool } from './tools/tavily-search-tool';
export { WeatherTool } from './tools/weather-tool';
export { CoinGeckoPriceTool } from './tools/coingecko-price-tool';
export { BirdEyeTokenOverviewTool } from './tools/birdeye-token-overview-tool';
export { BirdEyeTrendingTool } from './tools/birdeye-trending-tool';

// Platform Connectors
export { 
  DiscordConnector, 
  DiscordConnectorConfig 
} from './platform-connectors/discord-connector';
export { 
  TwitterConnector,
  TwitterConnectorConfig
} from './platform-connectors/twitter-connector';
export {
  TwitterDirectConnector,
  TwitterDirectConnectorConfig,
  Tweet
} from './platform-connectors/twitter-direct-connector';

// Config
export { ConfigManager } from './config/config-manager';

// Utils
export { Logger, LogLevel } from './utils/logger';

// MCP (Model Context Protocol)
export { MCPServer, MCPServerConfig, MCPToolCall, MCPResult } from './mcp/mcp-server';

/**
 * Simple example usage of the framework
 */
async function example() {
  // Import required classes
  const { Agent, InMemoryMemory, WebSearchTool, AgentRole } = require('./index');
  
  // Create an agent
  const agent = new Agent({
    name: 'Jarvis',
    role: AgentRole.ASSISTANT,
    personality: {
      traits: ['helpful', 'knowledgeable', 'friendly'],
      background: 'A sophisticated AI assistant created to help with various tasks.'
    },
    goals: ['Provide accurate information', 'Assist with problem-solving'],
  });
  
  // Set up memory
  agent.setMemory(new InMemoryMemory());
  
  // Run the agent with a task
  const result = await agent.run({
    task: "What's the weather in New York today?",
    tools: [new WebSearchTool()],
  });
  
  console.log(result.response);
}

// If this file is run directly, run the example
if (require.main === module) {
  example().catch(console.error);
}