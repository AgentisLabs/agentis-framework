import { Tool } from '../core/types';
import { Logger } from '../utils/logger';
import fetch from 'node-fetch';

/**
 * Interface for Brave Search API response
 */
interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  is_source_local?: boolean;
  is_source_both?: boolean;
  age?: string;
  family_friendly?: boolean;
  type?: string;
  subtype?: string;
  meta_url?: {
    scheme: string;
    netloc: string;
    path: string;
    query: string;
    fragment: string;
  };
}

interface BraveWebSearchResponse {
  type: string;
  query: {
    original: string;
    show_strict_warning: boolean;
    is_navigational: boolean;
    is_safe_search_active: boolean;
  };
  mixed?: {
    type: string;
    main?: any[];
    top?: any[];
    side?: any[];
  };
  web: {
    results: BraveSearchResult[];
    more_results_available: boolean;
    auto_correction?: {
      original_query: string;
      auto_corrected_query: string;
      auto_correction_applied: boolean;
    };
  };
  discussions?: any;
  news?: any;
  videos?: any;
  infobox?: any;
  locations?: any;
  spellcheck?: any;
  related?: any;
  goggles?: any;
  _timing?: any;
}

/**
 * A tool for web search functionality using Brave Search API
 */
export class BraveSearchTool implements Tool {
  name: string = 'brave_search';
  description: string = 'Search the web for information on a specific query using Brave Search';
  logger: Logger;
  private apiKey: string;
  private endpoint: string = 'https://api.search.brave.com/res/v1/web/search';
  
  // JSON Schema for the tool parameters
  schema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query'
      },
      numResults: {
        type: 'number',
        description: 'Number of results to return (default: 5)'
      },
      country: {
        type: 'string',
        description: 'Country code for localized results (e.g., "us", "uk", "fr")'
      }
    },
    required: ['query']
  };
  
  /**
   * Creates a new Brave Search tool
   * 
   * @param apiKey - Optional Brave Search API key (defaults to BRAVE_API_KEY env variable)
   */
  constructor(apiKey?: string) {
    this.logger = new Logger('BraveSearchTool');
    this.apiKey = apiKey || process.env.BRAVE_API_KEY || '';
    
    if (!this.apiKey) {
      this.logger.warn('No Brave API key provided. Set BRAVE_API_KEY environment variable or pass in constructor.');
    }
  }
  
  /**
   * Execute the web search using Brave Search API
   * 
   * @param params - Parameters for the search
   * @returns Promise resolving to search results
   */
  async execute(params: Record<string, any>): Promise<any> {
    const query = params.query as string;
    const numResults = (params.numResults as number) || 5;
    const country = (params.country as string) || undefined;
    
    this.logger.debug('Executing Brave search', { query, numResults, country });
    
    if (!this.apiKey) {
      this.logger.error('Brave Search API key is missing');
      throw new Error('Brave Search API key is required. Set BRAVE_API_KEY environment variable or pass in constructor.');
    }
    
    try {
      // Build search URL with parameters
      let url = `${this.endpoint}?q=${encodeURIComponent(query)}`;
      
      if (country) {
        url += `&country=${country}`;
      }
      
      // Make request to Brave Search API
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error('Brave Search API error', { 
          status: response.status, 
          statusText: response.statusText,
          error: errorText
        });
        
        // Handle rate limiting specifically
        if (response.status === 429) {
          this.logger.warn('Rate limit exceeded for Brave Search API. Returning mock results instead.');
          
          // Return mock results when rate limited
          return {
            query,
            results: [
              {
                title: `Mock result for "${query}" (rate limited)`,
                snippet: `This is a mock search result for "${query}" because the Brave Search API rate limit was exceeded. In a production environment, you would implement retry with exponential backoff.`,
                url: `https://example.com/rate-limited?q=${encodeURIComponent(query)}`
              },
              {
                title: `Alternative search options for "${query}"`,
                snippet: `Consider using alternative search tools or implementing rate limiting handling with retry mechanisms and backoff strategies.`,
                url: `https://example.com/search-alternatives`
              }
            ].slice(0, numResults)
          };
        }
        
        throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json() as BraveWebSearchResponse;
      
      // Extract and format search results
      const results = data.web.results
        .slice(0, numResults)
        .map(result => ({
          title: result.title,
          snippet: result.description,
          url: result.url
        }));
      
      // Log the results to verify the tool is working
      this.logger.info(`Brave search results for "${query}":`, { 
        count: results.length, 
        firstResult: results[0] ? {
          title: results[0].title,
          url: results[0].url.substring(0, 100) // Truncate URL if too long
        } : 'No results'
      });
      
      return {
        query,
        results
      };
    } catch (error) {
      this.logger.error('Error executing Brave search', error);
      throw error;
    }
  }
}