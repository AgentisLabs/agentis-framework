import axios from 'axios';
import { Tool } from '../core/types';
import { Logger } from '../utils/logger';

/**
 * Interface for Tavily search result
 */
interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  raw_content?: string;
}

/**
 * Interface for Tavily search response
 */
interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  response_time: number;
}

/**
 * WebSearchTool implementation using Tavily API
 */
export class TavilySearchTool implements Tool {
  name: string = 'web_search';
  description: string = 'Search the web for information on a specific query using Tavily';
  logger: Logger;
  private apiKey: string;
  
  // JSON Schema for the tool parameters
  schema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      maxResults: {
        type: 'number',
        description: 'Number of results to return (default: 5, max: 10)'
      },
      includeAnswer: {
        type: 'boolean',
        description: 'Whether to include an AI-generated answer (default: false)'
      },
      searchDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Depth of search to perform (basic or advanced)'
      }
    },
    required: ['query']
  };
  
  /**
   * Creates a new Tavily search tool
   * 
   * @param apiKey - Optional API key (defaults to TAVILY_API_KEY env var)
   */
  constructor(apiKey?: string) {
    this.logger = new Logger('TavilySearchTool');
    this.apiKey = apiKey || process.env.TAVILY_API_KEY || '';
    
    if (!this.apiKey) {
      throw new Error('Tavily API key is required. Set TAVILY_API_KEY environment variable or pass it to the constructor.');
    }
  }
  
  /**
   * Execute the web search using Tavily API
   * 
   * @param params - Parameters for the search
   * @returns Promise resolving to search results
   */
  async execute(params: Record<string, any>): Promise<any> {
    const query = params.query as string;
    const maxResults = Math.min(params.maxResults || 5, 10); // Cap at 10 results
    const includeAnswer = params.includeAnswer || false;
    const searchDepth = params.searchDepth || 'basic';
    
    this.logger.debug('Executing Tavily search', { query, maxResults, includeAnswer, searchDepth });
    
    try {
      // Make API request to Tavily
      const response = await axios.post<TavilySearchResponse>(
        'https://api.tavily.com/search',
        {
          query,
          max_results: maxResults,
          include_answer: includeAnswer,
          search_depth: searchDepth
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      
      // Format the response
      return {
        query,
        results: response.data.results.map(result => ({
          title: result.title,
          snippet: result.content,
          url: result.url
        })),
        answer: response.data.answer,
        responseTime: response.data.response_time
      };
    } catch (error) {
      this.logger.error('Error executing Tavily search', error);
      
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Tavily search failed: ${error.response.status} - ${error.response.statusText}`);
      }
      
      throw new Error(`Tavily search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}