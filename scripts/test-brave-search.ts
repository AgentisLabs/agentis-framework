/**
 * Test Script for the Brave Search Tool
 * 
 * This script demonstrates the Brave Search Tool functionality
 * by performing a sample search query and displaying the results.
 */

import { BraveSearchTool } from '../src/tools/brave-search-tool';
import dotenv from 'dotenv';

// Set log level to debug by setting environment variable
process.env.LOG_LEVEL = 'debug';

// Load environment variables
dotenv.config();

// Check for Brave API key
if (!process.env.BRAVE_API_KEY) {
  console.error('BRAVE_API_KEY environment variable is required');
  process.exit(1);
}

async function testBraveSearch() {
  console.log('Testing Brave Search Tool...\n');

  // Create a Brave Search tool
  const braveSearchTool = new BraveSearchTool();

  try {
    // Define test queries (use just one to avoid rate limiting)
    const queries = [
      'latest developments in quantum computing'
    ];

    // Test each query
    for (const query of queries) {
      console.log(`\n=== Searching for: "${query}" ===\n`);
      
      const result = await braveSearchTool.execute({
        query,
        numResults: 3
      });

      // Display the results
      console.log(`Found ${result.results.length} results:\n`);
      
      result.results.forEach((item: any, index: number) => {
        console.log(`Result ${index + 1}:`);
        console.log(`  Title: ${item.title}`);
        console.log(`  Snippet: ${item.snippet.substring(0, 150)}...`);
        console.log(`  URL: ${item.url}`);
        console.log();
      });
    }

    console.log('Brave Search Tool test completed successfully!');
  } catch (error) {
    console.error('Error testing Brave Search Tool:', error);
    process.exit(1);
  }
}

// Run the test
testBraveSearch().catch(console.error);