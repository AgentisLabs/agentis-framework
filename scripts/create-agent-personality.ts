import dotenv from 'dotenv';
import { Agent } from '../src/core/agent';
import { Logger } from '../src/utils/logger';
import { 
  PersonalityUtils, 
  EnhancedPersonality
} from '../src/core/enhanced-personality-system';
import { AgentRole } from '../src/core/types';
import path from 'path';
import fs from 'fs';
import { createInterface } from 'readline';

// Load environment variables
dotenv.config();

// Configure logging
const logger = new Logger('CreateAgentPersonality');

// Check for Anthropic API key
if (!process.env.ANTHROPIC_API_KEY) {
  logger.error('Missing required environment variable: ANTHROPIC_API_KEY');
  process.exit(1);
}

// Create readline interface
const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create a prompting agent
const agent = new Agent({
  name: 'PersonalityGenerator',
  role: AgentRole.ASSISTANT,
  personality: {
    traits: ['creative', 'collaborative', 'detail-oriented', 'imaginative'],
    background: 'Expert at creating detailed, consistent agent personalities',
    voice: 'professional, supportive'
  },
  goals: ['Create rich, detailed agent personas', 'Maintain internal consistency'],
  model: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20240620'
});

interface PersonaDefinition {
  name: string;
  occupation: string;
  age: string;
  gender: string;
  interests: string[];
  expertise: string[];
  temperament: string;
  keyTraits: string[];
  communicationStyle: string;
  background: string;
}

async function promptForPersonaDetails(): Promise<PersonaDefinition> {
  return new Promise((resolve) => {
    console.log("\n=== Agent Personality Creator ===\n");
    console.log("Let's create a rich personality for your agent.\n");
    
    const details: Partial<PersonaDefinition> = {};
    
    rl.question("Name: ", (name) => {
      details.name = name;
      
      rl.question("Occupation/Role: ", (occupation) => {
        details.occupation = occupation;
        
        rl.question("Age: ", (age) => {
          details.age = age;
          
          rl.question("Gender: ", (gender) => {
            details.gender = gender;
            
            rl.question("Interests (comma-separated): ", (interests) => {
              details.interests = interests.split(',').map(i => i.trim());
              
              rl.question("Areas of expertise (comma-separated): ", (expertise) => {
                details.expertise = expertise.split(',').map(e => e.trim());
                
                rl.question("Temperament/personality (brief description): ", (temperament) => {
                  details.temperament = temperament;
                  
                  rl.question("Key personality traits (comma-separated): ", (traits) => {
                    details.keyTraits = traits.split(',').map(t => t.trim());
                    
                    rl.question("Communication style: ", (style) => {
                      details.communicationStyle = style;
                      
                      rl.question("Brief background/backstory: ", (background) => {
                        details.background = background;
                        
                        resolve(details as PersonaDefinition);
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

async function generateFullPersonality(personaDetails: PersonaDefinition): Promise<EnhancedPersonality> {
  console.log("\nGenerating a complete, rich personality profile...");
  
  const prompt = `
  Create a complete JSON personality profile for an AI agent using the following details:
  - Name: ${personaDetails.name}
  - Occupation: ${personaDetails.occupation}
  - Age: ${personaDetails.age}
  - Gender: ${personaDetails.gender}
  - Interests: ${personaDetails.interests.join(', ')}
  - Expertise: ${personaDetails.expertise.join(', ')}
  - Temperament: ${personaDetails.temperament}
  - Key traits: ${personaDetails.keyTraits.join(', ')}
  - Communication style: ${personaDetails.communicationStyle}
  - Background: ${personaDetails.background}

  Generate a complete personality profile JSON object following this structure:
  {
    "persona": {
      "demographics": { ... },
      "appearance": { ... },
      "personality": {
        "traits": [...],
        "values": [...],
        "communication": { ... },
        "thinking": { ... },
        "emotional": { ... },
        "social": { ... }
      },
      "background": {
        "backstory": "...",
        "formativeEvents": [...],
        "achievements": [...],
        "failures": [...],
        "relationships": [...],
        "timeline": [...]
      }
    },
    "content": {
      "preferences": {
        "topics": { ... },
        "media": { ... },
        "platformStyle": { ... }
      },
      "examples": {
        "conversationExamples": [...],
        "writingExamples": [...],
        "decisionExamples": [...]
      }
    },
    "motivation": {
      "goals": { ... },
      "behavior": { ... }
    },
    "knowledge": { ... }
  }

  Each field should be thoughtfully developed and internally consistent with the persona information provided. Use your creativity to fill in additional details that would make this personality rich, realistic, and usable as an AI character.

  Use JSON format with proper double quotes, ensure all property names are in quotes, and that the JSON is valid.
  Return only the JSON object without explanation or additional commentary.
  `;

  try {
    const result = await agent.run({ task: prompt });
    
    // Extract JSON from the response (in case there's any additional text)
    const jsonMatch = result.response.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in the response');
    }
    
    const jsonString = jsonMatch[1];
    return JSON.parse(jsonString) as EnhancedPersonality;
  } catch (error) {
    logger.error('Error generating personality', error);
    throw error;
  }
}

async function savePersonality(personality: EnhancedPersonality, name: string): Promise<string> {
  // Create the personas directory if it doesn't exist
  const personasDir = path.join(__dirname, '../personas');
  if (!fs.existsSync(personasDir)) {
    fs.mkdirSync(personasDir, { recursive: true });
  }
  
  // Create filename from persona name
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const filePath = path.join(personasDir, `${safeName}.json`);
  
  // Save the personality
  PersonalityUtils.savePersonalityToJson(personality, filePath);
  
  return filePath;
}

async function main() {
  try {
    // Get basic persona details from the user
    const personaDetails = await promptForPersonaDetails();
    
    // Generate full personality
    const fullPersonality = await generateFullPersonality(personaDetails);
    
    // Validate the personality
    try {
      PersonalityUtils.validatePersonality(fullPersonality);
      console.log("\n✅ Generated personality is valid.");
    } catch (error) {
      console.error("\n❌ Warning: Generated personality has validation issues:", error);
      
      // Fix common issues
      if (!fullPersonality.persona) fullPersonality.persona = {} as any;
      if (!fullPersonality.content) fullPersonality.content = {} as any;
      if (!fullPersonality.motivation) fullPersonality.motivation = {} as any;
      
      console.log("Attempted to fix basic issues. The personality may still need manual editing.");
    }
    
    // Save the personality
    const filePath = await savePersonality(fullPersonality, personaDetails.name);
    console.log(`\n✅ Personality saved to: ${filePath}`);
    
    // Display usage instructions
    console.log(`\nTo use this personality with your Twitter agent, run:`);
    console.log(`npx ts-node -r tsconfig-paths/register examples/twitter-personality-agent-json.ts --persona ${filePath}`);
    
    rl.close();
  } catch (error) {
    logger.error('Error in personality creation process', error);
    rl.close();
    process.exit(1);
  }
}

// Run the script
main();