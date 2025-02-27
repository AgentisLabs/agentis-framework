/**
 * Core types for the Agentis framework
 */

/**
 * Represents different roles an agent can have
 */
export enum AgentRole {
  ASSISTANT = 'assistant',
  RESEARCHER = 'researcher', 
  WRITER = 'writer',
  COORDINATOR = 'coordinator',
  ANALYST = 'analyst',
  CUSTOM = 'custom'
}

/**
 * Defines the personality traits and background of an agent
 */
export interface AgentPersonality {
  traits: string[];
  background: string;
  voice?: string; // Optional specific voice style
  examples?: string[]; // Optional example responses to define style
}

/**
 * Configuration options for creating an agent
 */
export interface AgentConfig {
  name: string;
  role: AgentRole | string;
  personality: AgentPersonality;
  goals: string[];
  systemPrompt?: string;
  model?: string;
}

/**
 * Message format for agent communication
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, any>;
  timestamp?: number;
}

/**
 * Conversation history containing messages
 */
export interface Conversation {
  id: string;
  messages: Message[];
  metadata?: Record<string, any>;
  created: number;
  updated: number;
}

/**
 * Tool interface for agents to use external capabilities
 */
export interface Tool {
  name: string;
  description: string;
  execute: (params: Record<string, any>) => Promise<any>;
  schema: Record<string, any>; // JSON Schema for the tool parameters
}

/**
 * Agent execution options
 */
export interface RunOptions {
  task: string;
  tools?: Tool[];
  conversation?: Conversation;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onStream?: (text: string, done: boolean) => void;
}

/**
 * Note: Planning strategies have been moved to planning/planner-interface.ts
 * This enum is kept for backward compatibility but will be deprecated
 * in a future version.
 */
import { PlanningStrategy as PS } from '../planning/planner-interface';
export const PlanningStrategy = PS;

/**
 * The result of an agent execution
 */
export interface RunResult {
  response: string;
  conversation: Conversation;
  toolCalls?: {
    tool: string;
    params: Record<string, any>;
    result: any;
  }[];
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Events that agents can emit
 */
export enum AgentEvent {
  THINKING = 'thinking',
  MESSAGE = 'message',
  TOOL_CALL = 'tool_call',
  ERROR = 'error',
  PLAN_CREATED = 'plan_created',
  TASK_COMPLETE = 'task_complete',
}