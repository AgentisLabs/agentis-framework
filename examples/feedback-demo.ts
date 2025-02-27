/**
 * Feedback System Demo
 * 
 * This example demonstrates the agent feedback system that enables
 * agents to evaluate each other's work and improve over time
 */

import { Agent } from '../src/core/agent';
import { AgentRole } from '../src/core/types';
import { AgentSwarm } from '../src/core/agent-swarm';
import { FeedbackSystem, FeedbackCategory, FeedbackRating } from '../src/core/feedback-system';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

async function runDemo() {
  console.log('Agent Feedback System Demo');
  console.log('==========================\n');
  
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
    feedbackFrequency: 1.0, // 100% feedback for demo purposes
    detailedFeedback: true
  });
  
  // Create some specialized agents
  console.log('Creating specialized agents...');
  
  // 1. Research Agent
  const researcherAgent = new Agent({
    name: 'Researcher',
    role: AgentRole.RESEARCHER,
    personality: {
      traits: ['curious', 'thorough', 'detail-oriented'],
      background: 'Specialized in gathering comprehensive information from various sources'
    },
    goals: ['Find accurate and comprehensive information', 'Identify patterns and insights']
  });
  
  // 2. Writer Agent
  const writerAgent = new Agent({
    name: 'Writer',
    role: AgentRole.WRITER,
    personality: {
      traits: ['creative', 'articulate', 'engaging'],
      background: 'Specialized in crafting compelling content tailored to specific audiences'
    },
    goals: ['Create engaging and informative content', 'Communicate complex ideas clearly']
  });
  
  // 3. Reviewer Agent
  const reviewerAgent = new Agent({
    name: 'Reviewer',
    role: 'critic', // Using string directly since CRITIC is not in AgentRole enum
    personality: {
      traits: ['analytical', 'critical', 'precise'],
      background: 'Specialized in evaluating content for accuracy, clarity, and effectiveness'
    },
    goals: ['Ensure high quality outputs', 'Provide constructive criticism']
  });
  
  // 4. Coordinator Agent
  const coordinatorAgent = new Agent({
    name: 'Coordinator',
    role: AgentRole.COORDINATOR,
    personality: {
      traits: ['organized', 'balanced', 'collaborative'],
      background: 'Specialized in facilitating team collaboration and optimizing workflows'
    },
    goals: ['Ensure team efficiency', 'Optimize task allocation']
  });
  
  // Set up a swarm with feedback enabled
  console.log('Setting up agent swarm with feedback...');
  const swarm = new AgentSwarm({
    agents: [researcherAgent, writerAgent, reviewerAgent],
    coordinator: coordinatorAgent,
    enableFeedback: true
  });
  
  console.log('\nDemonstrating direct feedback requests...');
  
  // Let's simulate some tasks and feedback
  
  // Task 1: Research task
  const researchTask = "Research the latest trends in renewable energy storage technologies";
  console.log(`\nTask for Researcher: ${researchTask}`);
  
  // Simulate a research result
  const researchResult = `
Based on my research, the latest trends in renewable energy storage technologies include:

1. Advanced Battery Technologies:
   - Solid-state batteries with higher energy density and safety
   - Flow batteries for grid-scale storage with longer cycles
   - Sodium-ion batteries as a lithium alternative

2. Thermal Energy Storage:
   - Molten salt storage for concentrated solar power
   - Phase change materials for building temperature regulation

3. Mechanical Storage Solutions:
   - Compressed air energy storage in underground caverns
   - Gravity-based storage using concrete blocks or water

4. Hydrogen Storage Innovations:
   - Metal hydride storage systems
   - Underground hydrogen storage in salt caverns
   - Liquid organic hydrogen carriers (LOHCs)

5. Integration of AI for Storage Optimization:
   - Predictive analytics for demand forecasting
   - Smart grid integration with distributed storage

The most promising technologies appear to be solid-state batteries for mobile applications and flow batteries combined with AI optimization for grid storage.
`;
  
  console.log('Research completed, requesting feedback...\n');
  
  // Request feedback from the Reviewer agent
  const researchFeedback = await feedbackSystem.requestFeedback(
    uuidv4(),
    researchTask,
    researchResult,
    researcherAgent,
    reviewerAgent
  );
  
  console.log('Feedback received:');
  console.log(`Overall rating: ${calculateAverageRating(researchFeedback.ratings)}/5`);
  console.log('Category ratings:');
  
  for (const [category, rating] of Object.entries(researchFeedback.ratings)) {
    console.log(`- ${category}: ${rating}/5`);
  }
  
  console.log('\nComments:');
  console.log(researchFeedback.comments);
  
  console.log('\nSuggestions:');
  console.log(researchFeedback.suggestions);
  
  // Task 2: Writing task
  const writingTask = "Write a short blog post about the benefits of sustainable architecture";
  console.log(`\nTask for Writer: ${writingTask}`);
  
  // Simulate a writing result
  const writingResult = `
# The Future Is Green: Benefits of Sustainable Architecture

In an era of climate change and resource scarcity, sustainable architecture stands as a beacon of innovation and responsibility. More than just a design trend, it represents a fundamental shift in how we conceive, construct, and inhabit our built environment.

## Energy Efficiency Means Long-Term Savings

Sustainable buildings are designed to minimize energy consumption through strategic orientation, superior insulation, and smart systems. While initial investments may be higher, property owners typically see returns through significantly reduced utility bills within 3-7 years.

## Improved Health and Wellbeing

Sustainable architecture prioritizes indoor air quality through proper ventilation, non-toxic materials, and abundant natural light. Studies show that occupants of green buildings report 30% fewer headaches and respiratory problems compared to conventional buildings.

## Reduced Environmental Impact

From sourcing local materials to incorporating renewable energy systems, sustainable architecture dramatically reduces a building's carbon footprint. A typical green building uses 25% less energy and 11% less water than its conventional counterpart.

## Enhanced Property Value

As environmental awareness grows, so does the market premium for sustainable properties. Green-certified buildings command rental rates approximately 13% higher than non-certified properties in the same markets.

## Conclusion

Sustainable architecture isn't just good for the planet—it's good for people and profits too. As we face the challenges of the 21st century, embracing green building practices isn't just an option—it's increasingly becoming the only sensible path forward.
`;
  
  console.log('Writing completed, requesting feedback...\n');
  
  // Request feedback from the Reviewer agent
  const writingFeedback = await feedbackSystem.requestFeedback(
    uuidv4(),
    writingTask,
    writingResult,
    writerAgent,
    reviewerAgent
  );
  
  console.log('Feedback received:');
  console.log(`Overall rating: ${calculateAverageRating(writingFeedback.ratings)}/5`);
  console.log('Category ratings:');
  
  for (const [category, rating] of Object.entries(writingFeedback.ratings)) {
    console.log(`- ${category}: ${rating}/5`);
  }
  
  console.log('\nComments:');
  console.log(writingFeedback.comments);
  
  console.log('\nSuggestions:');
  console.log(writingFeedback.suggestions);
  
  // Now demonstrate the agent reflection and improvement process
  console.log('\nDemonstrating agent self-improvement through feedback reflection...');
  
  // First, add more simulated feedback to the system
  await addSimulatedFeedback(feedbackSystem, writerAgent, reviewerAgent);
  
  // Get the agent's feedback stats
  const stats = feedbackSystem.getAgentFeedbackStats(writerAgent.id);
  
  console.log('\nWriter Agent Feedback Stats:');
  console.log(`Total feedback items: ${stats.totalFeedbackItems}`);
  console.log(`Overall average rating: ${stats.overallAverage.toFixed(2)}/5`);
  console.log(`Recent trend: ${stats.recentTrend}`);
  console.log('Average ratings by category:');
  
  for (const [category, rating] of Object.entries(stats.averageRatings)) {
    console.log(`- ${category}: ${rating.toFixed(2)}/5`);
  }
  
  // Apply feedback to improve the agent
  console.log('\nApplying feedback for agent improvement...');
  const improvement = await feedbackSystem.applyFeedbackImprovements(writerAgent);
  
  console.log('\nImprovement areas identified:');
  improvement.improvementAreas.forEach((area, i) => {
    console.log(`${i+1}. ${area}`);
  });
  
  console.log('\nFull improvement suggestion:');
  console.log(improvement.suggestedAdjustments);
  
  console.log('\nFeedback System Demo completed!');
}

// Helper function to calculate average rating
function calculateAverageRating(ratings: Record<FeedbackCategory, FeedbackRating>): number {
  const values = Object.values(ratings);
  
  if (values.length === 0) return 0;
  
  const sum = values.reduce((total, rating) => total + rating, 0);
  return +(sum / values.length).toFixed(2);
}

// Helper function to add simulated feedback for demonstration
async function addSimulatedFeedback(
  feedbackSystem: FeedbackSystem,
  writerAgent: Agent,
  reviewerAgent: Agent
): Promise<void> {
  // Add a few more feedback items with various ratings
  
  // Sample task 1 - needs improvement
  await feedbackSystem.requestFeedback(
    uuidv4(),
    "Write a product description for a new smartphone",
    "The XYZ Phone 12 is a powerful smartphone with great features. It has a good camera and fast processor. Battery life is decent and the screen is nice. It comes in several colors and has plenty of storage. Overall it's a good choice for most users.",
    writerAgent,
    reviewerAgent
  );
  
  // Sample task 2 - average
  await feedbackSystem.requestFeedback(
    uuidv4(),
    "Write a brief explanation of quantum computing for beginners",
    "Quantum computing uses quantum bits or 'qubits' instead of regular bits. While regular bits are either 0 or 1, qubits can exist in multiple states simultaneously through superposition. This allows quantum computers to process certain types of problems much faster than classical computers. However, quantum computers are still in early stages of development and aren't yet practical for most applications.",
    writerAgent,
    reviewerAgent
  );
  
  // Sample task 3 - good
  await feedbackSystem.requestFeedback(
    uuidv4(),
    "Write a short introduction for a climate change article",
    "As glaciers retreat at unprecedented rates and extreme weather events intensify across the globe, climate change has transformed from a distant theoretical concern to an urgent reality reshaping our world. The scientific consensus is clear: human activity has warmed our planet by approximately 1.1°C since pre-industrial times, triggering cascading effects throughout Earth's delicate ecosystems. This article examines the latest climate data, explores the most vulnerable regions facing immediate impacts, and investigates the technological and policy innovations that could still alter our collective trajectory.",
    writerAgent,
    reviewerAgent
  );
}

// Run the demo
runDemo().catch(error => {
  console.error('Error running demo:', error);
});