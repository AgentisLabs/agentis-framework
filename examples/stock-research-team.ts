/**
 * Stock Research Team - Comprehensive Agentis Framework Demo
 * 
 * This example demonstrates a team of specialized agents working together to
 * research and analyze different aspects of stocks, using:
 * 
 * 1. Multi-provider agent swarm with specialized agents
 * 2. Advanced task dependency inference
 * 3. Feedback system for agent improvement
 * 4. Web search tools for real-time data
 * 5. Enhanced memory for context retention
 */

import { Agent } from '../src/core/agent';
import { AgentRole } from '../src/core/types';
import { EnhancedAgentSwarm, AgentSpecialization } from '../src/core/enhanced-agent-swarm';
import { ProviderType } from '../src/core/provider-interface';
import { DependencyInference } from '../src/planning/dependency-inference';
import { FeedbackSystem, FeedbackCategory } from '../src/core/feedback-system';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

// Mock web search tool for demonstration
class WebSearchTool {
  name = 'web_search';
  description = 'Search the web for information';
  
  async execute(params: { query: string }) {
    // This is a mock implementation - in a real system you would integrate
    // with a search API like Tavily, SerpAPI, or directly with search engines
    console.log(`[WebSearch] Searching for: ${params.query}`);
    
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock search results based on query keywords
    let mockResults = '';
    
    if (params.query.toLowerCase().includes('financials') || params.query.toLowerCase().includes('earnings')) {
      mockResults = this.getMockFinancialData(params.query);
    } else if (params.query.toLowerCase().includes('news') || params.query.toLowerCase().includes('recent')) {
      mockResults = this.getMockNewsData(params.query);
    } else if (params.query.toLowerCase().includes('competitors') || params.query.toLowerCase().includes('industry')) {
      mockResults = this.getMockCompetitorData(params.query);
    } else if (params.query.toLowerCase().includes('forecast') || params.query.toLowerCase().includes('prediction')) {
      mockResults = this.getMockForecastData(params.query);
    } else {
      mockResults = this.getMockGeneralData(params.query);
    }
    
    return {
      results: mockResults,
      source: 'Web Search Tool (Mock)',
      timestamp: new Date().toISOString()
    };
  }
  
  // Helper to get schema for tool
  get schema() {
    return {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        }
      },
      required: ['query']
    };
  }
  
  // Different mock data generators for different query types
  private getMockFinancialData(query: string): string {
    // Extract company ticker if present (e.g., AAPL, MSFT, GOOGL)
    const tickerMatch = query.match(/\b[A-Z]{1,5}\b/);
    const ticker = tickerMatch ? tickerMatch[0] : 'AAPL';
    
    return `
      Financial Data for ${ticker} (FY 2024):
      
      Quarterly Results (Latest):
      - Revenue: $97.8 billion (up 9% year-over-year)
      - EPS: $1.58 (up 11% year-over-year)
      - Gross Margin: 43.7%
      - Operating Income: $29.4 billion
      
      Balance Sheet Highlights:
      - Cash & Equivalents: $62.5 billion
      - Total Debt: $119.3 billion
      - Debt-to-Equity Ratio: 1.78
      - Current Ratio: 1.12
      
      Valuation Metrics:
      - P/E Ratio: 32.5
      - Price-to-Sales: 8.7
      - PEG Ratio: 2.3
      - Enterprise Value: $2.78 trillion
      
      Dividend Information:
      - Dividend Yield: 0.48%
      - Annual Dividend: $0.96 per share
      - Payout Ratio: 15.4%
      - Dividend Growth Rate (5-year): 8.4%
    `;
  }
  
  private getMockNewsData(query: string): string {
    // Extract company ticker if present
    const tickerMatch = query.match(/\b[A-Z]{1,5}\b/);
    const ticker = tickerMatch ? tickerMatch[0] : 'AAPL';
    
    return `
      Recent News for ${ticker}:
      
      1. [Business Wire] ${ticker} Announces $20 Billion Share Repurchase Program
         The company's board has authorized a significant expansion of its share buyback initiative, signaling confidence in future performance.
      
      2. [Reuters] ${ticker} Expands Manufacturing in Vietnam Amid Supply Chain Diversification
         The company continues its strategy to reduce dependency on China-based manufacturing with a $2 billion investment in new facilities.
      
      3. [Wall Street Journal] ${ticker} Faces Regulatory Scrutiny Over App Store Policies
         Antitrust regulators are examining the company's app marketplace practices following complaints from developers.
      
      4. [Bloomberg] ${ticker} Unveils New AI Strategy at Developer Conference
         The company announced several new AI-powered features coming to its products, positioning itself against competitors in the space.
      
      5. [CNBC] Analyst Upgrades ${ticker} Citing Strong Product Cycle
         Morgan Stanley raised its price target citing expected strong demand for upcoming product refreshes and services growth.
    `;
  }
  
  private getMockCompetitorData(query: string): string {
    // Extract company ticker if present
    const tickerMatch = query.match(/\b[A-Z]{1,5}\b/);
    const ticker = tickerMatch ? tickerMatch[0] : 'AAPL';
    
    let industry = "Technology";
    let competitors = ["MSFT", "GOOGL", "AMZN", "META"];
    
    // Adjust based on ticker
    if (ticker === "MSFT") {
      competitors = ["AAPL", "GOOGL", "AMZN", "CRM"];
    } else if (ticker === "GOOGL") {
      competitors = ["AAPL", "MSFT", "META", "AMZN"];
    }
    
    return `
      Competitive Landscape for ${ticker}:
      
      Industry: ${industry}
      
      Major Competitors:
      ${competitors.map(comp => `- ${comp}: ${this.getRandomMarketShare()}% market share`).join('\n')}
      
      Competitive Metrics:
      1. R&D Spending (% of Revenue):
         ${ticker}: ${(Math.random() * 15 + 5).toFixed(1)}%
         Industry Average: ${(Math.random() * 10 + 5).toFixed(1)}%
      
      2. Operating Margin:
         ${ticker}: ${(Math.random() * 25 + 15).toFixed(1)}%
         Industry Average: ${(Math.random() * 20 + 10).toFixed(1)}%
      
      3. Revenue Growth (YoY):
         ${ticker}: ${(Math.random() * 20 - 5).toFixed(1)}%
         Industry Average: ${(Math.random() * 15 - 2).toFixed(1)}%
      
      4. Customer Acquisition Cost:
         ${ticker}: $${(Math.random() * 100 + 50).toFixed(2)}
         Industry Average: $${(Math.random() * 120 + 40).toFixed(2)}
      
      Competitive Advantages:
      - Brand Recognition
      - Ecosystem Integration
      - Scale Economics
      - Intellectual Property Portfolio
    `;
  }
  
  private getMockForecastData(query: string): string {
    // Extract company ticker if present
    const tickerMatch = query.match(/\b[A-Z]{1,5}\b/);
    const ticker = tickerMatch ? tickerMatch[0] : 'AAPL';
    
    const currentPrice = (Math.random() * 200 + 50).toFixed(2);
    const averageTarget = (parseFloat(currentPrice) * (1 + (Math.random() * 0.3 - 0.1))).toFixed(2);
    
    return `
      Analyst Forecasts for ${ticker}:
      
      Current Price: $${currentPrice}
      
      Analyst Consensus:
      - Average Price Target: $${averageTarget}
      - Highest Target: $${(parseFloat(averageTarget) * 1.2).toFixed(2)}
      - Lowest Target: $${(parseFloat(averageTarget) * 0.85).toFixed(2)}
      - Consensus Rating: ${['Buy', 'Overweight', 'Hold', 'Underweight', 'Sell'][Math.floor(Math.random() * 3)]}
      
      Earnings Estimates (Next Quarter):
      - EPS Estimate: $${(Math.random() * 2 + 0.5).toFixed(2)}
      - Revenue Estimate: $${(Math.random() * 50 + 20).toFixed(1)} billion
      - Growth Estimate (YoY): ${(Math.random() * 20 - 5).toFixed(1)}%
      
      Long-Term Projections:
      - 5-Year Earnings Growth Rate: ${(Math.random() * 15 + 5).toFixed(1)}% annually
      - Industry Growth Rate: ${(Math.random() * 10 + 3).toFixed(1)}% annually
      
      Risk Factors:
      - Market Volatility
      - Regulatory Challenges
      - Competitive Pressures
      - Supply Chain Constraints
    `;
  }
  
  private getMockGeneralData(query: string): string {
    // Extract company ticker if present
    const tickerMatch = query.match(/\b[A-Z]{1,5}\b/);
    const ticker = tickerMatch ? tickerMatch[0] : 'AAPL';
    
    return `
      General Information for ${ticker}:
      
      Company Overview:
      - Full Name: ${this.getCompanyName(ticker)}
      - Industry: Technology
      - Founded: ${1950 + Math.floor(Math.random() * 50)}
      - Headquarters: ${['Cupertino, CA', 'Seattle, WA', 'Mountain View, CA', 'Redmond, WA'][Math.floor(Math.random() * 4)]}
      - Employees: ${(Math.random() * 150000 + 5000).toFixed(0)}
      
      Business Model:
      - Primary Revenue Sources: Hardware Sales, Services, Advertising
      - Geographic Segments: North America (45%), Europe (30%), Asia-Pacific (20%), Rest of World (5%)
      - Key Products/Services: Consumer Electronics, Software, Cloud Services
      
      Leadership:
      - CEO: ${['John Smith', 'Sarah Johnson', 'Michael Chen', 'Emma Williams'][Math.floor(Math.random() * 4)]}
      - CFO: ${['Robert Brown', 'Jennifer Davis', 'David Wilson', 'Lisa Garcia'][Math.floor(Math.random() * 4)]}
      - CTO: ${['Thomas Lee', 'Rebecca Martin', 'James Taylor', 'Maria Rodriguez'][Math.floor(Math.random() * 4)]}
      
      Recent Milestones:
      - New Product Launches
      - Geographic Expansion
      - Strategic Acquisitions
      - Technology Patents
    `;
  }
  
  private getRandomMarketShare(): string {
    return (Math.random() * 30 + 5).toFixed(1);
  }
  
  private getCompanyName(ticker: string): string {
    const tickerMap: Record<string, string> = {
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com, Inc.',
      'META': 'Meta Platforms, Inc.',
      'TSLA': 'Tesla, Inc.',
      'NVDA': 'NVIDIA Corporation',
      'NFLX': 'Netflix, Inc.'
    };
    
    return tickerMap[ticker] || `${ticker} Corporation`;
  }
}

dotenv.config();

async function runStockResearchDemo() {
  console.log('Stock Research Team - Agentis Framework Demo');
  console.log('===========================================\n');
  
  // Create a feedback system
  console.log('Setting up feedback system...');
  const feedbackSystem = new FeedbackSystem({
    enableAutoFeedback: true,
    requiredCategories: [
      FeedbackCategory.ACCURACY,
      FeedbackCategory.COMPLETENESS,
      FeedbackCategory.RELEVANCE,
      FeedbackCategory.CLARITY
    ],
    feedbackFrequency: 0.5, // 50% feedback
    detailedFeedback: true
  });
  
  // Create specialized research agents
  console.log('Creating specialized research agents...\n');
  
  // 1. Financial Analyst - focuses on company financials and metrics
  const financialAnalyst = new Agent({
    name: 'FinancialAnalyst',
    role: 'financial_analyst',
    personality: {
      traits: ['detail-oriented', 'analytical', 'methodical'],
      background: 'Specialized in analyzing company financial statements, ratios, and valuation metrics'
    },
    goals: ['Provide accurate financial analysis', 'Identify key financial trends and risks']
  });
  
  // 2. News Researcher - tracks recent news and events
  const newsResearcher = new Agent({
    name: 'NewsResearcher',
    role: 'news_analyst',
    personality: {
      traits: ['curious', 'thorough', 'up-to-date'],
      background: 'Specialized in gathering and summarizing recent news events related to companies and markets'
    },
    goals: ['Find relevant news developments', 'Assess news impact on stock performance']
  });
  
  // 3. Industry Analyst - focuses on competitive landscape
  const industryAnalyst = new Agent({
    name: 'IndustryAnalyst',
    role: 'industry_analyst',
    personality: {
      traits: ['strategic', 'insightful', 'forward-thinking'],
      background: 'Specialized in analyzing industry trends, competitive positioning, and market dynamics'
    },
    goals: ['Understand competitive advantages', 'Identify industry disruption risks and opportunities']
  });
  
  // 4. Market Predictor - focuses on forecasts and projections
  const marketPredictor = new Agent({
    name: 'MarketPredictor',
    role: 'market_predictor',
    personality: {
      traits: ['cautious', 'data-driven', 'probabilistic'],
      background: 'Specialized in analyzing market forecasts, analyst ratings, and future growth projections'
    },
    goals: ['Assess future growth potential', 'Evaluate analyst consensus and targets']
  });
  
  // 5. Research Coordinator - organizes and synthesizes findings
  const researchCoordinator = new Agent({
    name: 'ResearchCoordinator',
    role: AgentRole.COORDINATOR,
    personality: {
      traits: ['organized', 'integrative', 'decisive'],
      background: 'Specialized in coordinating research efforts and synthesizing diverse information into cohesive reports'
    },
    goals: ['Ensure comprehensive research coverage', 'Produce actionable investment insights']
  });
  
  // Create search tool instances for each agent
  const webSearchTool = new WebSearchTool();
  
  // Define agent specializations
  const agentSpecializations: Record<string, AgentSpecialization> = {
    [financialAnalyst.id]: {
      name: 'Financial Analysis',
      description: 'Expert in financial statements, metrics, and valuation',
      capabilities: ['financial statement analysis', 'ratio calculation', 'valuation modeling'],
      preferredTaskTypes: ['financial_analysis', 'valuation', 'ratio_analysis'],
      provider: ProviderType.OPENAI
    },
    [newsResearcher.id]: {
      name: 'News Research',
      description: 'Expert in gathering and analyzing company news and events',
      capabilities: ['news monitoring', 'event impact assessment', 'sentiment analysis'],
      preferredTaskTypes: ['news_research', 'event_analysis', 'sentiment_tracking'],
      provider: ProviderType.ANTHROPIC
    },
    [industryAnalyst.id]: {
      name: 'Industry Analysis',
      description: 'Expert in competitive positioning and industry trends',
      capabilities: ['competitive analysis', 'industry trend identification', 'market share assessment'],
      preferredTaskTypes: ['competitor_analysis', 'industry_assessment', 'market_sizing'],
      provider: ProviderType.OPENAI
    },
    [marketPredictor.id]: {
      name: 'Market Prediction',
      description: 'Expert in forecasts, projections, and analyst recommendations',
      capabilities: ['forecast analysis', 'consensus tracking', 'growth projection'],
      preferredTaskTypes: ['forecast_analysis', 'price_target_assessment', 'growth_estimation'],
      provider: ProviderType.ANTHROPIC
    }
  };
  
  // Create the enhanced agent swarm
  console.log('Setting up enhanced multi-provider agent swarm...');
  const swarm = new EnhancedAgentSwarm({
    agents: [financialAnalyst, newsResearcher, industryAnalyst, marketPredictor],
    coordinator: researchCoordinator,
    agentSpecializations,
    planningStrategy: 'hierarchical',
    maxConcurrentAgents: 4,
    enabledCommunicationChannels: ['direct', 'broadcast']
  });
  
  // Define the research task
  const stockToResearch = 'AAPL'; // Apple Inc.
  
  console.log(`\nStarting comprehensive research on ${stockToResearch}...\n`);
  
  // Create a structured research plan with the dependency inference system
  const researchPlanTasks = [
    {
      id: uuidv4(),
      description: `Analyze the latest financial statements and metrics for ${stockToResearch}`,
      dependencies: [],
      status: 'pending' as const
    },
    {
      id: uuidv4(),
      description: `Research recent news and events for ${stockToResearch} from the past 3 months`,
      dependencies: [],
      status: 'pending' as const
    },
    {
      id: uuidv4(),
      description: `Analyze competitors and industry positioning for ${stockToResearch}`,
      dependencies: [],
      status: 'pending' as const
    },
    {
      id: uuidv4(),
      description: `Review analyst forecasts and price targets for ${stockToResearch}`,
      dependencies: [],
      status: 'pending' as const
    },
    {
      id: uuidv4(),
      description: `Assess the impact of recent news on ${stockToResearch}'s financial outlook`,
      dependencies: [],
      status: 'pending' as const
    },
    {
      id: uuidv4(),
      description: `Evaluate ${stockToResearch}'s competitive advantages and weaknesses compared to industry peers`,
      dependencies: [],
      status: 'pending' as const
    },
    {
      id: uuidv4(),
      description: `Create a comprehensive investment thesis for ${stockToResearch} with buy/hold/sell recommendation`,
      dependencies: [],
      status: 'pending' as const
    }
  ];
  
  // Create context for dependency inference
  const researchPlanContext = `
    To conduct a comprehensive analysis of ${stockToResearch}, we need to follow a structured research approach:
    
    First, we need to gather the fundamental data: financial statements, metrics, and valuation information.
    At the same time, we should research recent news and events that might impact the company's performance.
    We also need to analyze the competitive landscape to understand the company's position in its industry.
    Additionally, we should review analyst forecasts and price targets to understand market expectations.
    
    Once we have the financial data and news information, we can assess how recent events might impact the financial outlook.
    With both the competitive analysis and financial data, we can evaluate the company's strengths and weaknesses compared to peers.
    
    Finally, after gathering all this information, we can create a comprehensive investment thesis with a recommendation.
  `;
  
  // Set up the dependency inference system
  console.log('Inferring task dependencies for the research plan...');
  const dependencyInference = new DependencyInference({
    enableContentSimilarity: true,
    enableTypeHierarchy: true,
    enableInformationFlow: true
  });
  
  // Run inference on tasks
  const tasksWithDependencies = dependencyInference.inferDependencies(
    researchPlanTasks as any,
    researchPlanContext
  );
  
  // Visualize the dependency graph
  console.log('\nResearch Plan Structure:');
  console.log(dependencyInference.visualizeDependencyGraph(tasksWithDependencies));
  
  // Simulate task execution
  // In a real implementation, this would call swarm.runEnhanced() with the actual API integrations
  console.log('\nExecuting research tasks...\n');
  
  // Map tasks to appropriate agents
  const taskAssignments = {
    'Analyze the latest financial statements': financialAnalyst,
    'Research recent news and events': newsResearcher,
    'Analyze competitors and industry': industryAnalyst,
    'Review analyst forecasts': marketPredictor,
    'Assess the impact of recent news': newsResearcher,
    'Evaluate competitive advantages': industryAnalyst,
    'Create a comprehensive investment thesis': researchCoordinator
  };
  
  // Simulate executing the tasks according to dependencies
  await simulateTaskExecution(tasksWithDependencies, taskAssignments, feedbackSystem, webSearchTool);
  
  console.log('\nResearch tasks completed!');
  console.log('===============================');
  
  // Display feedback statistics
  for (const agent of [financialAnalyst, newsResearcher, industryAnalyst, marketPredictor]) {
    const stats = feedbackSystem.getAgentFeedbackStats(agent.id);
    if (stats.totalFeedbackItems > 0) {
      console.log(`\nFeedback Stats for ${agent.config.name}:`);
      console.log(`- Average Rating: ${stats.overallAverage.toFixed(2)}/5`);
      console.log(`- Feedback Items: ${stats.totalFeedbackItems}`);
      console.log(`- Performance Trend: ${stats.recentTrend}`);
    }
  }
  
  console.log('\nStock Research Team Demo completed!');
}

// Helper function to simulate task execution
async function simulateTaskExecution(
  tasks: any[],
  taskAssignments: Record<string, Agent>,
  feedbackSystem: FeedbackSystem,
  searchTool: WebSearchTool
) {
  // First, sort tasks by dependencies (simple topological sort)
  const executionOrder = topologicalSort(tasks);
  
  // Execute tasks in order
  for (const task of executionOrder) {
    // Find the agent for this task
    const agent = findAgentForTask(task, taskAssignments);
    
    if (!agent) {
      console.log(`Skipping task (no agent assigned): ${task.description}`);
      continue;
    }
    
    console.log(`\nExecuting: ${task.description}`);
    console.log(`Assigned to: ${agent.config.name}`);
    
    // Simulate search and execution
    const searchQuery = task.description.replace(/Analyze|Research|Review|Assess|Evaluate|Create/g, '').trim();
    const searchResult = await searchTool.execute({ query: searchQuery });
    
    // Simulate agent processing the search results
    console.log(`[${agent.config.name}] Processing search results...`);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate processing time
    
    // Simulate task completion
    const taskResult = `
      ${agent.config.name}'s analysis of ${searchQuery}:
      
      Key Findings:
      - [Finding 1 based on search data]
      - [Finding 2 based on search data]
      - [Finding 3 based on search data]
      
      Implications:
      - [Implication 1 for investment thesis]
      - [Implication 2 for investment thesis]
      
      Confidence Level: ${Math.floor(Math.random() * 3 + 3)}/5
    `;
    
    console.log(`[${agent.config.name}] Task completed.`);
    
    // Randomly request feedback (50% chance)
    if (Math.random() < 0.5) {
      // Find a different agent to provide feedback
      const availableEvaluators = Object.values(taskAssignments).filter(a => a.id !== agent.id);
      const evaluator = availableEvaluators[Math.floor(Math.random() * availableEvaluators.length)];
      
      console.log(`[FeedbackSystem] Requesting feedback from ${evaluator.config.name}...`);
      
      // Request feedback
      const feedback = await feedbackSystem.requestFeedback(
        task.id,
        task.description,
        taskResult,
        agent,
        evaluator
      );
      
      console.log(`[FeedbackSystem] Feedback received: ${calculateAverageRating(feedback.ratings)}/5`);
    }
  }
}

// Helper function to find the right agent for a task
function findAgentForTask(task: any, taskAssignments: Record<string, Agent>): Agent | undefined {
  for (const [keyword, agent] of Object.entries(taskAssignments)) {
    if (task.description.includes(keyword)) {
      return agent;
    }
  }
  return undefined;
}

// Helper function to calculate average rating
function calculateAverageRating(ratings: Record<string, number>): number {
  const values = Object.values(ratings);
  
  if (values.length === 0) return 0;
  
  const sum = values.reduce((total, rating) => total + rating, 0);
  return +(sum / values.length).toFixed(2);
}

// Helper function to sort tasks by dependencies (topological sort)
function topologicalSort(tasks: any[]): any[] {
  // Map of task ID to task
  const taskMap = new Map(tasks.map(task => [task.id, task]));
  
  // Map of task to incoming edge count
  const incomingEdges: Record<string, number> = {};
  tasks.forEach(task => {
    incomingEdges[task.id] = 0;
  });
  
  // Count incoming edges
  tasks.forEach(task => {
    task.dependencies.forEach((depId: string) => {
      incomingEdges[depId] = (incomingEdges[depId] || 0) + 1;
    });
  });
  
  // Queue of tasks with no incoming edges
  const queue = tasks.filter(task => task.dependencies.length === 0).map(task => task.id);
  
  // Result array
  const result: any[] = [];
  
  // Process queue
  while (queue.length > 0) {
    const taskId = queue.shift()!;
    const task = taskMap.get(taskId);
    
    if (task) {
      result.push(task);
      
      // Reduce incoming edge count for all dependent tasks
      tasks.forEach(t => {
        if (t.dependencies.includes(taskId)) {
          t.dependencies = t.dependencies.filter((id: string) => id !== taskId);
          
          // If no more dependencies, add to queue
          if (t.dependencies.length === 0) {
            queue.push(t.id);
          }
        }
      });
    }
  }
  
  return result;
}

// Run the demo
runStockResearchDemo().catch(error => {
  console.error('Error running stock research demo:', error);
});