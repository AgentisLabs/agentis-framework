/**
 * Enhanced personality system for Agentis agents
 * This provides a much richer personality definition for agents, allowing for
 * more nuanced, consistent, and engaging interactions across platforms
 */
import { AgentRole } from './types';

/**
 * Demographic information for an agent's persona
 */
export interface PersonaDemographics {
  age?: number | string;        // Age or age range
  gender?: string;              // Gender identity 
  location?: string;            // Current location/home
  background?: string;          // Cultural/ethnic/national background
  education?: string;           // Educational background
  occupation?: string;          // Current or previous occupation
  socioeconomic?: string;       // Socioeconomic status/background
}

/**
 * Appearance description for agents that may have avatars or visual representations
 */
export interface PersonaAppearance {
  physicalDescription?: string; // General physical description
  style?: string;               // Clothing/fashion style
  distinctiveFeatures?: string; // Any distinctive physical features 
  avatarPrompt?: string;        // Image generation prompt for creating agent avatar
}

/**
 * Detailed personality traits and characteristics
 */
export interface PersonalityProfile {
  traits: string[];             // Core personality traits (e.g., "curious", "analytical")
  values: string[];             // Core values (e.g., "honesty", "knowledge-sharing")
  communication: {
    tone: string[];             // Communication tone (e.g., "friendly", "formal", "humorous")
    style: string[];            // Communication style (e.g., "concise", "detailed", "metaphorical")
    quirks?: string[];          // Language quirks or speech patterns
    vocabulary?: string;        // Vocabulary level and preferences (e.g., "technical", "simple")
  };
  thinking: {
    approach: string[];         // Thinking approach (e.g., "analytical", "creative", "methodical")
    strengths: string[];        // Cognitive strengths
    biases?: string[];          // Typical cognitive biases or preferences
    interests: string[];        // Areas of interest/expertise
  };
  emotional: {
    temperament: string;        // General emotional temperament
    triggers?: string[];        // Things that provoke emotional responses
    coping?: string[];          // How they handle stress/difficulty
  };
  social: {
    interactionStyle: string;   // How they typically interact with others
    socialNeeds?: string;       // Social needs and preferences
    roles?: string[];           // Social roles they typically take on
  };
}

/**
 * Background narrative elements
 */
export interface PersonaBackground {
  backstory: string;            // Complete backstory narrative
  formativeEvents?: string[];   // Key events that shaped their personality
  achievements?: string[];      // Notable achievements
  failures?: string[];          // Notable setbacks or failures
  relationships?: {             // Key relationships
    name: string;
    relation: string;
    description: string;
  }[];
  timeline?: {                  // Key life timeline events
    period: string;
    event: string;
  }[];
}

/**
 * Content and platform-specific preferences
 */
export interface ContentPreferences {
  topics: {
    favored: string[];          // Topics they enjoy discussing
    avoided: string[];          // Topics they prefer to avoid
    expertise: string[];        // Topics where they have expertise
  };
  media?: {
    favoritesBooks?: string[];  // Favorite books
    favoriteMovies?: string[];  // Favorite movies/shows
    favoriteMusic?: string[];   // Favorite music
    otherMedia?: string[];      // Other media preferences
  };
  platformStyle?: {             // Platform-specific writing/interaction styles
    twitter?: {
      tone: string;             // Tone for Twitter
      contentFocus: string[];   // Content focus for Twitter
      typicalPosts: string[];   // Examples of typical posts
      hashtagUsage: string;     // How they use hashtags
      interactionStyle: string; // How they interact with others
    };
    email?: {
      formality: string;        // Email formality level
      structure: string;        // Email structure preferences
      signatureStyle: string;   // Signature style
    };
    chat?: {
      responseLength: string;   // Typical length of chat responses
      emoji: string;            // Emoji usage description
      casualness: string;       // Level of casualness in chat
    };
    blog?: {
      writingStyle: string;     // Blog writing style
      structure: string;        // Typical blog structure
      topicAreas: string[];     // Typical blog topics
    };
  };
}

/**
 * Example content for learning the agent's style
 */
export interface ExampleContent {
  conversationExamples?: {      // Example conversations
    topic: string;
    exchange: {
      user: string;
      agent: string;
    }[];
  }[];
  writingExamples?: {           // Example writings
    type: string;               // Type of content (tweet, blog, email)
    content: string;            // The example content
    context?: string;           // Context for the content
  }[];
  decisionExamples?: {          // Example decisions to demonstrate reasoning 
    scenario: string;
    decision: string;
    reasoning: string;
  }[];
}

/**
 * Goals, motivations, and aspirations
 */
export interface GoalsAndMotivations {
  mission?: string;             // Overall mission/purpose
  shortTermGoals: string[];     // Current short-term goals
  longTermGoals: string[];      // Long-term aspirations
  values: string[];             // Core values that drive decisions
  needs: string[];              // Psychological needs
  fears?: string[];             // Core fears or anxieties
  aspirations?: string[];       // Things they aspire to achieve or become
}

/**
 * Behavioral patterns and tendencies
 */
export interface BehavioralPatterns {
  habits?: string[];            // Regular habits
  rituals?: string[];           // Personal rituals
  preferences: {                // General preferences
    likes: string[];
    dislikes: string[];
  };
  decisionMaking: string;       // Decision-making approach
  conflictResolution?: string;  // How they handle conflicts
  stressResponse?: string;      // How they respond to stress
  adaptability?: string;        // How they adapt to new situations
}

/**
 * Knowledge and skill areas for the agent
 */
export interface KnowledgeAndSkills {
  expertise: string[];          // Areas of deep expertise
  knowledgeAreas: string[];     // General knowledge areas
  skills: string[];             // Specific skills
  limitations?: string[];       // Knowledge or skill limitations
  learningStyle?: string;       // How they prefer to learn
  teachingStyle?: string;       // How they share knowledge
}

/**
 * Enhanced comprehensive personality profile for an agent
 */
export interface EnhancedPersonality {
  persona: {
    demographics?: PersonaDemographics;
    appearance?: PersonaAppearance;
    personality: PersonalityProfile;
    background?: PersonaBackground;
  };
  content: {
    preferences: ContentPreferences;
    examples?: ExampleContent;
  };
  motivation: {
    goals: GoalsAndMotivations;
    behavior?: BehavioralPatterns;
  };
  knowledge?: KnowledgeAndSkills;
}

/**
 * Extended configuration for agents with enhanced personality
 */
export interface EnhancedAgentConfig {
  name: string;
  role: AgentRole | string;
  personality: EnhancedPersonality;
  systemPrompt?: string;
  model?: string;
}

/**
 * Utility functions for working with enhanced personalities
 */
export class PersonalityUtils {
  /**
   * Generate a system prompt from an enhanced personality
   */
  static generateSystemPrompt(config: EnhancedAgentConfig): string {
    const { name, role, personality } = config;
    const { persona, content, motivation, knowledge } = personality;
    
    // Build personality description for system prompt
    const roleDisplay = typeof role === 'string' ? role : 
                       (Object.values(AgentRole).includes(role as AgentRole) ? role : 'assistant');
    let prompt = `# ${name} - ${roleDisplay}\n\n`;
    
    // Core identity
    prompt += "## Core Identity\n";
    if (persona.demographics) {
      const demo = persona.demographics;
      prompt += `You are ${name}, `;
      if (demo.age) prompt += `${demo.age} years old, `;
      if (demo.gender) prompt += `${demo.gender}, `;
      if (demo.occupation) prompt += `working as ${demo.occupation}, `;
      if (demo.location) prompt += `based in ${demo.location}, `;
      if (demo.education) prompt += `with background in ${demo.education}, `;
      prompt = prompt.replace(/,\s*$/, ".\n");
    }
    
    // Personality profile
    prompt += "\n## Personality\n";
    prompt += `Your core traits include: ${persona.personality.traits.join(", ")}.\n`;
    prompt += `You value: ${persona.personality.values.join(", ")}.\n`;
    prompt += `Your communication tone is: ${persona.personality.communication.tone.join(", ")}.\n`;
    prompt += `Your communication style is: ${persona.personality.communication.style.join(", ")}.\n`;
    
    if (persona.personality.communication.quirks) {
      prompt += `Speech quirks: ${persona.personality.communication.quirks.join(", ")}.\n`;
    }
    
    prompt += `\nYou think in a ${persona.personality.thinking.approach.join(", ")} manner.\n`;
    prompt += `Your interests include: ${persona.personality.thinking.interests.join(", ")}.\n`;
    
    // Background if available
    if (persona.background && persona.background.backstory) {
      prompt += "\n## Backstory\n";
      prompt += `${persona.background.backstory}\n`;
      
      if (persona.background.achievements && persona.background.achievements.length > 0) {
        prompt += `\nKey achievements: ${persona.background.achievements.join("; ")}\n`;
      }
    }
    
    // Goals and motivations
    prompt += "\n## Goals & Motivations\n";
    if (motivation.goals.mission) {
      prompt += `Mission: ${motivation.goals.mission}\n`;
    }
    prompt += `Short-term goals: ${motivation.goals.shortTermGoals.join("; ")}\n`;
    prompt += `Long-term goals: ${motivation.goals.longTermGoals.join("; ")}\n`;
    
    // Knowledge areas if available
    if (knowledge) {
      prompt += "\n## Knowledge & Expertise\n";
      prompt += `Areas of expertise: ${knowledge.expertise.join(", ")}\n`;
      prompt += `Knowledge areas: ${knowledge.knowledgeAreas.join(", ")}\n`;
      
      if (knowledge.limitations) {
        prompt += `Limitations: ${knowledge.limitations.join(", ")}\n`;
      }
    }
    
    // Twitter-specific instructions if available
    if (content.preferences.platformStyle?.twitter) {
      const twitter = content.preferences.platformStyle.twitter;
      prompt += "\n## Twitter Behavior\n";
      prompt += `On Twitter, your tone is ${twitter.tone}.\n`;
      prompt += `You focus on: ${twitter.contentFocus.join(", ")}.\n`;
      prompt += `Your hashtag usage: ${twitter.hashtagUsage}.\n`;
      prompt += `Interaction style: ${twitter.interactionStyle}.\n`;
      
      if (twitter.typicalPosts && twitter.typicalPosts.length > 0) {
        prompt += "\nExamples of your typical tweets:\n";
        twitter.typicalPosts.forEach(post => {
          prompt += `- "${post}"\n`;
        });
      }
    }
    
    // Content preferences
    prompt += "\n## Content Preferences\n";
    prompt += `Favored topics: ${content.preferences.topics.favored.join(", ")}\n`;
    prompt += `Topics to avoid: ${content.preferences.topics.avoided.join(", ")}\n`;
    
    // Example conversations if available
    if (content.examples?.conversationExamples && content.examples.conversationExamples.length > 0) {
      prompt += "\n## Example Conversations\n";
      content.examples.conversationExamples.forEach(example => {
        prompt += `\nTopic: ${example.topic}\n`;
        example.exchange.forEach(exchange => {
          prompt += `User: ${exchange.user}\n`;
          prompt += `You: ${exchange.agent}\n`;
        });
      });
    }
    
    // Example tweets/content if available
    if (content.examples?.writingExamples && content.examples.writingExamples.length > 0) {
      const tweetExamples = content.examples.writingExamples.filter(ex => ex.type === 'tweet');
      if (tweetExamples.length > 0) {
        prompt += "\n## Example Tweets\n";
        tweetExamples.forEach(example => {
          prompt += `- "${example.content}"\n`;
          if (example.context) {
            prompt += `  Context: ${example.context}\n`;
          }
        });
      }
    }
    
    // Final instructions
    prompt += "\n## Operational Guidelines\n";
    prompt += "1. Always stay true to your personality and writing style.\n";
    prompt += "2. Maintain your perspective and tone consistently.\n";
    prompt += "3. When discussing topics you have expertise in, provide informed perspectives.\n";
    prompt += "4. For Twitter, craft messages that reflect your style while staying within character limits.\n";
    prompt += "5. Use your backstory and experiences to inform your responses.\n";
    
    return prompt;
  }
  
  /**
   * Create a simplified personality from an enhanced personality
   * for backward compatibility with the base AgentPersonality type
   */
  static simplifyPersonality(enhanced: EnhancedPersonality): {
    traits: string[];
    background: string;
    voice: string;
    examples: string[];
  } {
    return {
      traits: enhanced.persona.personality.traits,
      background: enhanced.persona.background?.backstory || 
                 "A sophisticated AI assistant with a unique personality.",
      voice: enhanced.persona.personality.communication.tone.join(", "),
      examples: enhanced.content.examples?.writingExamples?.map(ex => ex.content) || []
    };
  }
}