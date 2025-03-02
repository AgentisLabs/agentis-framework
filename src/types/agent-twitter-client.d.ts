declare module 'agent-twitter-client' {
  export enum SearchMode {
    Latest = 'Latest',
    Top = 'Top',
    Photos = 'Photos',
    Videos = 'Videos'
  }

  export interface LoginOptions {
    username: string;
    password: string;
    email?: string;
    apiKey?: string;
    apiSecret?: string;
    accessToken?: string;
    accessSecret?: string;
  }

  export interface Tweet {
    id: string;
    text: string;
    user_id_str?: string;
    username?: string;
    name?: string;
    created_at: string;
    retweeted?: boolean;
    is_reply?: boolean;
    in_reply_to_status_id_str?: string;
    in_reply_to_screen_name?: string;
    user?: {
      screen_name: string;
      name: string;
    };
    media?: any[];
    entities?: {
      hashtags?: any[];
      user_mentions?: any[];
      urls?: any[];
    };
    favorite_count?: number;
    retweet_count?: number;
    reply_count?: number;
    view_count?: number;
  }

  export interface Profile {
    id_str: string;
    screen_name: string;
    name: string;
    description?: string;
    followers_count?: number;
    following_count?: number;
    statuses_count?: number;
  }

  export interface MediaData {
    data: Buffer;
    mediaType: string;
  }

  export interface PollData {
    options: { label: string }[];
    duration_minutes: number;
    durationMinutes?: number; // Alias for compatibility
  }

  export interface TweetOptions {
    media?: MediaData[];
    poll?: PollData;
  }

  export interface GrokChatOptions {
    messages: { role: 'user' | 'assistant', content: string }[];
    conversationId?: string;
    returnSearchResults?: boolean;
    returnCitations?: boolean;
  }

  export interface GrokChatResponse {
    conversationId: string;
    message: string;
    messages: { role: 'user' | 'assistant', content: string }[];
    webResults?: any[];
    metadata?: any;
    rateLimit?: {
      isRateLimited: boolean;
      message: string;
      upsellInfo?: any;
    };
  }

  export class Scraper {
    constructor();
    
    // Support both function signatures
    login(username: string, password: string, email?: string, apiKey?: string, apiSecret?: string, accessToken?: string, accessSecret?: string): Promise<void>;
    login(options: LoginOptions): Promise<void>;
    logout(): Promise<void>;
    isLoggedIn(): Promise<boolean>;
    
    getCookies(): Promise<any[]>;
    setCookies(cookies: any[]): Promise<void>;
    clearCookies(): Promise<void>;
    
    getProfile(username: string): Promise<Profile>;
    me(): Promise<Profile>;
    
    getTweet(tweetId: string): Promise<Tweet>;
    getTweetV2(tweetId: string, options?: any): Promise<any>;
    getTweetsV2(tweetIds: string[], options?: any): Promise<any>;
    
    searchTweets(query: string, count?: number, mode?: SearchMode): AsyncIterableIterator<Tweet>;
    getTweets(username: string, count?: number): AsyncIterableIterator<Tweet>;
    fetchHomeTimeline(count?: number, seenTweetIds?: string[]): Promise<Tweet[]>;
    
    sendTweet(content: string, inReplyToStatus?: string, media?: MediaData[]): Promise<any>;
    sendTweetV2(content: string, inReplyToStatus?: string, options?: { poll?: PollData }): Promise<any>;
    sendQuoteTweet(content: string, quotedStatusId: string, media?: Buffer[]): Promise<any>;
    
    replyToTweet(tweetId: string, content: string, media?: Buffer[]): Promise<any>;
    likeTweet(tweetId: string): Promise<any>;
    retweet(tweetId: string): Promise<any>;
    followUser(username: string): Promise<any>;
    
    getTrends(): Promise<any[]>;
    getPage(): Promise<any>;
    grokChat(options: GrokChatOptions): Promise<GrokChatResponse>;
  }
}
