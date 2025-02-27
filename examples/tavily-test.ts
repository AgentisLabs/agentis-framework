/**
 * Tavily Search Tool Test Script
 * 
 * This is a simple test script to verify the Tavily search tool works correctly
 */

import dotenv from 'dotenv';
import { TavilySearchTool } from '../src';

// Load environment variables
dotenv.config();

/**
 * Test the Tavily search tool directly
 */
async function main() {
  console.log('Testing Tavily Search Tool');
  
  // Check for required API key
  if (!process.env.TAVILY_API_KEY) {
    console.error('❌ Tavily API key is required. Please add it to your .env file.');
    process.exit(1);
  }
  
  console.log('API Key Status:');
  console.log(`- Tavily API: ✅`);
  
  try {
    // Initialize the tool
    console.log('\nCreating search tool...');
    const searchTool = new TavilySearchTool();
    
    // Print tool details
    console.log(`Tool name: ${searchTool.name}`);
    console.log(`Tool description: ${searchTool.description}`);
    console.log(`Tool schema: ${JSON.stringify(searchTool.schema, null, 2)}`);
    
    // Execute a search
    const query = process.argv[2] || "Latest finance news";
    console.log(`\nExecuting search for: "${query}"`);
    
    const results = await searchTool.execute({
      query: query,
      maxResults: 5,
      includeAnswer: true,
      searchDepth: 'basic'
    });
    
    // Display results
    console.log('\nSearch Results:');
    console.log(JSON.stringify(results, null, 2));
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('\nError during search test:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);