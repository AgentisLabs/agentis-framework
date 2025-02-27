/**
 * Agent Feedback System
 * 
 * This module provides a feedback mechanism for agents to evaluate each other's work,
 * enabling continuous improvement and quality control in multi-agent systems.
 */

import { Agent } from './agent';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Feedback rating scale
 */
export enum FeedbackRating {
  EXCELLENT = 5,
  GOOD = 4,
  ADEQUATE = 3,
  NEEDS_IMPROVEMENT = 2,
  POOR = 1
}

/**
 * Feedback categories for structured evaluation
 */
export enum FeedbackCategory {
  ACCURACY = 'accuracy',
  COMPLETENESS = 'completeness',
  RELEVANCE = 'relevance',
  CLARITY = 'clarity',
  CREATIVITY = 'creativity',
  EFFICIENCY = 'efficiency',
  REASONING = 'reasoning'
}

/**
 * Feedback item representing an evaluation of a task result
 */
export interface FeedbackItem {
  id: string;
  taskId: string;
  evaluatorAgentId: string;
  producerAgentId: string;
  timestamp: number;
  ratings: Record<FeedbackCategory, FeedbackRating>;
  comments: string;
  suggestions: string;
  metadata?: Record<string, any>;
}

/**
 * Configuration for the feedback system
 */
export interface FeedbackSystemConfig {
  enableAutoFeedback?: boolean;
  requiredCategories?: FeedbackCategory[];
  feedbackFrequency?: number; // 0-1, 1 means feedback on every task
  detailedFeedback?: boolean;
  feedbackTimeout?: number; // ms
}

/**
 * System for agents to provide and receive feedback on task results
 */
export class FeedbackSystem {
  private feedbackHistory: FeedbackItem[] = [];
  private config: Required<FeedbackSystemConfig>;
  private logger: Logger;
  
  // Default configuration
  private static readonly DEFAULT_CONFIG: Required<FeedbackSystemConfig> = {
    enableAutoFeedback: true,
    requiredCategories: [
      FeedbackCategory.ACCURACY,
      FeedbackCategory.COMPLETENESS,
      FeedbackCategory.RELEVANCE
    ],
    feedbackFrequency: 0.5, // 50% of tasks get feedback
    detailedFeedback: true,
    feedbackTimeout: 30000 // 30 seconds
  };
  
  /**
   * Creates a new feedback system
   * 
   * @param config - Feedback system configuration
   */
  constructor(config?: FeedbackSystemConfig) {
    this.config = {
      ...FeedbackSystem.DEFAULT_CONFIG,
      ...config
    };
    
    this.logger = new Logger('FeedbackSystem');
  }
  
  /**
   * Request feedback on a task result from an evaluator agent
   * 
   * @param taskId - ID of the task
   * @param taskDescription - Description of the task
   * @param taskResult - Result of the task
   * @param producerAgent - Agent that produced the result
   * @param evaluatorAgent - Agent that will evaluate the result
   * @returns Promise resolving to feedback item
   */
  async requestFeedback(
    taskId: string,
    taskDescription: string,
    taskResult: string,
    producerAgent: Agent,
    evaluatorAgent: Agent
  ): Promise<FeedbackItem> {
    this.logger.info('Requesting feedback', { 
      taskId, 
      producer: producerAgent.id, 
      evaluator: evaluatorAgent.id 
    });
    
    // Build the feedback request prompt
    const feedbackPrompt = this.buildFeedbackPrompt(
      taskDescription,
      taskResult,
      producerAgent.config.name,
      producerAgent.config.role
    );
    
    // Ask the evaluator agent to provide feedback
    const result = await evaluatorAgent.run({
      task: feedbackPrompt
    });
    
    // Parse feedback from the response
    const feedback = this.parseFeedbackResponse(
      result.response,
      taskId,
      producerAgent.id,
      evaluatorAgent.id
    );
    
    // Store the feedback
    this.feedbackHistory.push(feedback);
    
    this.logger.info('Feedback received', { 
      taskId, 
      feedbackId: feedback.id,
      averageRating: this.calculateAverageRating(feedback.ratings)
    });
    
    return feedback;
  }
  
  /**
   * Check if we should request feedback for this task
   * based on configured feedback frequency
   * 
   * @returns Boolean indicating whether to request feedback
   */
  shouldRequestFeedback(): boolean {
    if (!this.config.enableAutoFeedback) return false;
    
    // Random check based on frequency
    return Math.random() < this.config.feedbackFrequency;
  }
  
  /**
   * Get all feedback for a specific agent
   * 
   * @param agentId - ID of the agent
   * @returns Array of feedback items
   */
  getFeedbackForAgent(agentId: string): FeedbackItem[] {
    return this.feedbackHistory.filter(item => 
      item.producerAgentId === agentId
    ).sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Get feedback statistics for an agent
   * 
   * @param agentId - ID of the agent
   * @returns Feedback statistics
   */
  getAgentFeedbackStats(agentId: string): {
    averageRatings: Record<FeedbackCategory, number>;
    overallAverage: number;
    totalFeedbackItems: number;
    recentTrend: 'improving' | 'stable' | 'declining' | 'unknown';
  } {
    const agentFeedback = this.getFeedbackForAgent(agentId);
    
    if (agentFeedback.length === 0) {
      return {
        averageRatings: {} as Record<FeedbackCategory, number>,
        overallAverage: 0,
        totalFeedbackItems: 0,
        recentTrend: 'unknown'
      };
    }
    
    // Calculate average ratings per category
    const categorySums: Record<FeedbackCategory, number> = {} as Record<FeedbackCategory, number>;
    const categoryCounts: Record<FeedbackCategory, number> = {} as Record<FeedbackCategory, number>;
    
    for (const feedback of agentFeedback) {
      for (const [category, rating] of Object.entries(feedback.ratings)) {
        categorySums[category as FeedbackCategory] = (categorySums[category as FeedbackCategory] || 0) + rating;
        categoryCounts[category as FeedbackCategory] = (categoryCounts[category as FeedbackCategory] || 0) + 1;
      }
    }
    
    const averageRatings: Record<FeedbackCategory, number> = {} as Record<FeedbackCategory, number>;
    
    for (const category of Object.values(FeedbackCategory)) {
      if (categoryCounts[category]) {
        averageRatings[category] = categorySums[category] / categoryCounts[category];
      }
    }
    
    // Calculate overall average
    const overallSum = Object.values(categorySums).reduce((sum, value) => sum + value, 0);
    const overallCount = Object.values(categoryCounts).reduce((sum, value) => sum + value, 0);
    const overallAverage = overallSum / overallCount;
    
    // Determine recent trend (last 5 vs previous 5)
    let recentTrend: 'improving' | 'stable' | 'declining' | 'unknown' = 'unknown';
    
    if (agentFeedback.length >= 10) {
      const recent5 = agentFeedback.slice(0, 5);
      const previous5 = agentFeedback.slice(5, 10);
      
      const recent5Avg = recent5.reduce((sum, item) => 
        sum + this.calculateAverageRating(item.ratings), 0) / 5;
      
      const previous5Avg = previous5.reduce((sum, item) => 
        sum + this.calculateAverageRating(item.ratings), 0) / 5;
      
      const difference = recent5Avg - previous5Avg;
      
      if (difference > 0.25) {
        recentTrend = 'improving';
      } else if (difference < -0.25) {
        recentTrend = 'declining';
      } else {
        recentTrend = 'stable';
      }
    }
    
    return {
      averageRatings,
      overallAverage,
      totalFeedbackItems: agentFeedback.length,
      recentTrend
    };
  }
  
  /**
   * Apply feedback to improve an agent's capabilities
   * 
   * @param agent - Agent to improve
   * @returns Promise resolving to improvement summary
   */
  async applyFeedbackImprovements(agent: Agent): Promise<{
    agentId: string;
    improvementAreas: string[];
    suggestedAdjustments: string;
  }> {
    const agentFeedback = this.getFeedbackForAgent(agent.id);
    
    if (agentFeedback.length === 0) {
      return {
        agentId: agent.id,
        improvementAreas: [],
        suggestedAdjustments: "No feedback available for improvement"
      };
    }
    
    // Aggregate feedback to identify patterns
    const recentFeedback = agentFeedback.slice(0, 10); // Focus on most recent feedback
    
    // Build a prompt for the agent to self-reflect on feedback
    const reflectionPrompt = `
      I've received the following feedback on my recent work.
      Please help me identify patterns and suggest improvements:
      
      ${recentFeedback.map((f, i) => `
      Feedback ${i+1}:
      - Task: ${f.metadata?.taskDescription || 'Task ' + f.taskId}
      - Ratings: ${Object.entries(f.ratings)
        .map(([cat, rating]) => `${cat}: ${rating}/5`)
        .join(', ')}
      - Comments: ${f.comments}
      - Suggestions: ${f.suggestions}
      `).join('\n')}
      
      Based on this feedback, please:
      1. Identify my top 3 strengths
      2. Identify my top 3 areas for improvement
      3. Suggest specific adjustments to my approach
      4. Recommend how I should handle similar tasks in the future
    `;
    
    // The agent reflects on its own feedback
    const reflectionResult = await agent.run({
      task: reflectionPrompt
    });
    
    // Extract improvement areas and suggestions
    const improvementAreas = this.extractImprovementAreas(reflectionResult.response);
    
    return {
      agentId: agent.id,
      improvementAreas,
      suggestedAdjustments: reflectionResult.response
    };
  }
  
  /**
   * Builds a prompt for requesting feedback
   * 
   * @param taskDescription - Description of the task
   * @param taskResult - Result of the task
   * @param producerName - Name of the producer agent
   * @param producerRole - Role of the producer agent
   * @returns Feedback request prompt
   */
  private buildFeedbackPrompt(
    taskDescription: string,
    taskResult: string,
    producerName: string,
    producerRole: string
  ): string {
    const categoriesText = this.config.requiredCategories
      .map(category => `- ${category}: Rate from 1-5`)
      .join('\n');
    
    return `
      Please evaluate the following task result produced by ${producerName} (${producerRole}):
      
      TASK:
      ${taskDescription}
      
      RESULT:
      ${taskResult}
      
      Provide your evaluation in the following format:
      
      RATINGS:
      ${categoriesText}
      
      COMMENTS:
      [Overall assessment of the work]
      
      SUGGESTIONS:
      [Specific suggestions for improvement]
      
      ${this.config.detailedFeedback ? `
      STRENGTHS:
      [List key strengths of the work]
      
      WEAKNESSES:
      [List areas that need improvement]
      ` : ''}
      
      Be specific, constructive, and actionable in your feedback.
    `;
  }
  
  /**
   * Parses feedback from an agent's response
   * 
   * @param response - Agent's response to feedback request
   * @param taskId - ID of the task
   * @param producerAgentId - ID of the agent that produced the task result
   * @param evaluatorAgentId - ID of the agent providing feedback
   * @returns Parsed feedback item
   */
  private parseFeedbackResponse(
    response: string,
    taskId: string,
    producerAgentId: string,
    evaluatorAgentId: string
  ): FeedbackItem {
    // Extract ratings
    const ratings: Record<FeedbackCategory, FeedbackRating> = {} as Record<FeedbackCategory, FeedbackRating>;
    
    // Set default ratings in case parsing fails
    for (const category of this.config.requiredCategories) {
      ratings[category] = FeedbackRating.ADEQUATE;
    }
    
    // Try to parse actual ratings
    const ratingsMatch = response.match(/RATINGS:([\s\S]*?)(?:COMMENTS:|SUGGESTIONS:|STRENGTHS:|WEAKNESSES:|$)/i);
    
    if (ratingsMatch) {
      const ratingsText = ratingsMatch[1];
      
      for (const category of Object.values(FeedbackCategory)) {
        const categoryMatch = new RegExp(`${category}\\s*:\\s*(\\d)`, 'i').exec(ratingsText);
        
        if (categoryMatch && categoryMatch[1]) {
          const rating = parseInt(categoryMatch[1], 10);
          
          if (rating >= 1 && rating <= 5) {
            ratings[category] = rating as FeedbackRating;
          }
        }
      }
    }
    
    // Extract comments
    let comments = 'No comments provided';
    const commentsMatch = response.match(/COMMENTS:([\s\S]*?)(?:SUGGESTIONS:|STRENGTHS:|WEAKNESSES:|$)/i);
    
    if (commentsMatch && commentsMatch[1].trim()) {
      comments = commentsMatch[1].trim();
    }
    
    // Extract suggestions
    let suggestions = 'No suggestions provided';
    const suggestionsMatch = response.match(/SUGGESTIONS:([\s\S]*?)(?:STRENGTHS:|WEAKNESSES:|$)/i);
    
    if (suggestionsMatch && suggestionsMatch[1].trim()) {
      suggestions = suggestionsMatch[1].trim();
    }
    
    // Create feedback item
    const feedbackItem: FeedbackItem = {
      id: uuidv4(),
      taskId,
      evaluatorAgentId,
      producerAgentId,
      timestamp: Date.now(),
      ratings,
      comments,
      suggestions
    };
    
    // Add detailed feedback if enabled
    if (this.config.detailedFeedback) {
      // Extract strengths
      const strengthsMatch = response.match(/STRENGTHS:([\s\S]*?)(?:WEAKNESSES:|$)/i);
      const strengths = strengthsMatch && strengthsMatch[1].trim() 
        ? strengthsMatch[1].trim() 
        : 'No strengths specified';
      
      // Extract weaknesses
      const weaknessesMatch = response.match(/WEAKNESSES:([\s\S]*?)$/i);
      const weaknesses = weaknessesMatch && weaknessesMatch[1].trim() 
        ? weaknessesMatch[1].trim() 
        : 'No weaknesses specified';
      
      feedbackItem.metadata = {
        strengths,
        weaknesses
      };
    }
    
    return feedbackItem;
  }
  
  /**
   * Calculates the average rating across all categories
   * 
   * @param ratings - Ratings by category
   * @returns Average rating
   */
  private calculateAverageRating(ratings: Record<FeedbackCategory, FeedbackRating>): number {
    const values = Object.values(ratings);
    
    if (values.length === 0) return 0;
    
    const sum = values.reduce((total, rating) => total + rating, 0);
    return sum / values.length;
  }
  
  /**
   * Extract improvement areas from reflection response
   * 
   * @param reflectionResponse - Agent's reflection on feedback
   * @returns Array of improvement areas
   */
  private extractImprovementAreas(reflectionResponse: string): string[] {
    // Look for improvement areas, typically after phrases like "areas for improvement"
    const improvementMatch = reflectionResponse.match(
      /areas for improvement:?[\s\S]*?((?:\d\.|\-)[^\n]+(?:\n(?:\d\.|\-)[^\n]+)*)/i
    );
    
    if (!improvementMatch) return ['No specific improvement areas identified'];
    
    // Split into separate points
    return improvementMatch[1]
      .split('\n')
      .map(line => line.replace(/^\d+\.\s*|\-\s*/, '').trim())
      .filter(line => line.length > 0);
  }
}