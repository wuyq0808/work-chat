import { WebClient } from '@slack/web-api';
import type { Member } from '@slack/web-api/dist/types/response/UsersListResponse';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';
import type { Match } from '@slack/web-api/dist/types/response/SearchMessagesResponse';
import fs from 'fs/promises';
import path from 'path';

export interface SlackConfig {
  botToken?: string;
  userToken?: string;
  addMessageToolEnabled?: boolean;
  allowedChannels?: string[];
  usersCache?: string;
  channelsCache?: string;
}




export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class SlackMCPClient {
  private client: WebClient;
  private config: SlackConfig;
  private usersCache: Map<string, Member> = new Map();
  private usersInvCache: Map<string, string> = new Map();
  private channelsCache: Map<string, Channel> = new Map();
  private readonly cacheDir: string;

  constructor(config: SlackConfig) {
    this.config = config;
    this.cacheDir = path.join(process.cwd(), '.cache');
    
    // Use user token if available, otherwise bot token
    const token = config.userToken || config.botToken;
    if (!token) {
      throw new Error('Either userToken or botToken must be provided');
    }
    
    this.client = new WebClient(token);
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  private async loadUsersFromCache(): Promise<boolean> {
    try {
      await this.ensureCacheDir();
      const cacheFile = this.config.usersCache || path.join(this.cacheDir, 'users.json');
      const data = await fs.readFile(cacheFile, 'utf-8');
      const cached = JSON.parse(data);
      
      this.usersCache.clear();
      this.usersInvCache.clear();
      
      for (const user of cached.users || []) {
        this.usersCache.set(user.id, user);
        this.usersInvCache.set(user.name, user.id);
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  private async saveUsersToCache(): Promise<void> {
    try {
      await this.ensureCacheDir();
      const cacheFile = this.config.usersCache || path.join(this.cacheDir, 'users.json');
      const data = {
        users: Array.from(this.usersCache.values()),
        timestamp: new Date().toISOString()
      };
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save users cache:', error);
    }
  }

  private async loadChannelsFromCache(): Promise<boolean> {
    try {
      await this.ensureCacheDir();
      const cacheFile = this.config.channelsCache || path.join(this.cacheDir, 'channels.json');
      const data = await fs.readFile(cacheFile, 'utf-8');
      const cached = JSON.parse(data);
      
      this.channelsCache.clear();
      
      for (const channel of cached.channels || []) {
        this.channelsCache.set(channel.id, channel);
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  private async saveChannelsToCache(): Promise<void> {
    try {
      await this.ensureCacheDir();
      const cacheFile = this.config.channelsCache || path.join(this.cacheDir, 'channels.json');
      const data = {
        channels: Array.from(this.channelsCache.values()),
        timestamp: new Date().toISOString()
      };
      await fs.writeFile(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save channels cache:', error);
    }
  }

  async refreshUsers(): Promise<ApiResponse<Member[]>> {
    try {
      // Try loading from cache first
      if (await this.loadUsersFromCache() && this.usersCache.size > 0) {
        return {
          success: true,
          data: Array.from(this.usersCache.values())
        };
      }

      // Fetch from API if cache miss
      const result = await this.client.users.list({
        limit: 1000
      });

      if (!result.ok || !result.members) {
        return {
          success: false,
          error: 'Failed to fetch users from Slack API'
        };
      }

      this.usersCache.clear();
      this.usersInvCache.clear();

      for (const member of result.members) {
        if (member.id && member.name) {
          this.usersCache.set(member.id, member);
          this.usersInvCache.set(member.name, member.id);
        }
      }

      // Save to cache
      await this.saveUsersToCache();

      return {
        success: true,
        data: Array.from(this.usersCache.values())
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async refreshChannels(): Promise<ApiResponse<Channel[]>> {
    try {
      // Try loading from cache first
      if (await this.loadChannelsFromCache() && this.channelsCache.size > 0) {
        return {
          success: true,
          data: Array.from(this.channelsCache.values())
        };
      }

      // Fetch from API if cache miss
      const types = ['public_channel', 'private_channel', 'mpim', 'im'];
      let cursor: string | undefined;
      const allChannels: Channel[] = [];

      do {
        const result = await this.client.conversations.list({
          types: types.join(','),
          limit: 999,
          exclude_archived: true,
          cursor
        });

        if (!result.ok || !result.channels) {
          return {
            success: false,
            error: 'Failed to fetch channels from Slack API'
          };
        }

        for (const channel of result.channels) {
          if (channel.id && channel.name) {
            this.channelsCache.set(channel.id, channel);
            allChannels.push(channel);
          }
        }

        cursor = result.response_metadata?.next_cursor;
      } while (cursor);

      // Save to cache
      await this.saveChannelsToCache();

      return {
        success: true,
        data: allChannels
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getChannels(): Promise<ApiResponse<Channel[]>> {
    if (this.channelsCache.size === 0) {
      return await this.refreshChannels();
    }
    
    return {
      success: true,
      data: Array.from(this.channelsCache.values())
    };
  }

  async getConversationHistory(params: {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
  }): Promise<ApiResponse<MessageElement[]>> {
    try {
      // Resolve channel name to ID if needed
      let channelId = params.channel;
      if (params.channel.startsWith('#')) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(c => c.name === channelName);
        if (channel?.id) {
          channelId = channel.id;
        } else {
          return {
            success: false,
            error: `Channel ${params.channel} not found`
          };
        }
      }

      const result = await this.client.conversations.history({
        channel: channelId,
        limit: params.limit || 10,
        oldest: params.oldest,
        latest: params.latest,
        cursor: params.cursor,
        inclusive: false
      });

      if (!result.ok || !result.messages) {
        return {
          success: false,
          error: 'Failed to fetch conversation history'
        };
      }

      const messages: MessageElement[] = [];

      for (const msg of result.messages) {
        const message = msg as MessageElement;
        
        if (message.subtype && message.subtype !== '') {
          // Skip system messages unless it's a regular message
          continue;
        }

        // Process the message text
        const processedMessage: MessageElement = {
          ...message,
          text: this.processText(message.text || '')
        };

        messages.push(processedMessage);
      }

      // Add cursor for pagination if there are more messages
      // Note: cursor is handled by response_metadata, not individual messages

      return {
        success: true,
        data: messages
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getConversationReplies(params: {
    channel: string;
    ts: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
  }): Promise<ApiResponse<MessageElement[]>> {
    try {
      // Resolve channel name to ID if needed
      let channelId = params.channel;
      if (params.channel.startsWith('#')) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(c => c.name === channelName);
        if (channel?.id) {
          channelId = channel.id;
        } else {
          return {
            success: false,
            error: `Channel ${params.channel} not found`
          };
        }
      }

      const result = await this.client.conversations.replies({
        channel: channelId,
        ts: params.ts,
        limit: params.limit || 10,
        oldest: params.oldest,
        latest: params.latest,
        cursor: params.cursor,
        inclusive: true
      });

      if (!result.ok || !result.messages) {
        return {
          success: false,
          error: 'Failed to fetch conversation replies'
        };
      }

      const messages: MessageElement[] = [];

      for (const msg of result.messages) {
        const message = msg as MessageElement;
        
        if (message.subtype && message.subtype !== '') {
          // Skip system messages unless it's a regular message
          continue;
        }

        // Process the message text
        const processedMessage: MessageElement = {
          ...message,
          text: this.processText(message.text || '')
        };

        messages.push(processedMessage);
      }

      // Add cursor for pagination if there are more messages
      // Note: cursor is handled by response_metadata, not individual messages

      return {
        success: true,
        data: messages
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async searchMessages(params: {
    query: string;
    count?: number;
    page?: number;
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
  }): Promise<ApiResponse<Match[]>> {
    try {
      const result = await this.client.search.messages({
        query: params.query,
        count: params.count || 20,
        page: params.page || 1,
        sort: params.sort || 'timestamp',
        sort_dir: params.sort_dir || 'desc'
      });

      if (!result.ok || !result.messages?.matches) {
        return {
          success: false,
          error: 'Failed to search messages'
        };
      }

      const matches: Match[] = [];

      for (const match of result.messages.matches) {
        // Process the match text
        const processedMatch: Match = {
          ...match,
          text: this.processText(match.text || '')
        };

        matches.push(processedMatch);
      }

      return {
        success: true,
        data: matches
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async addMessage(params: {
    channel: string;
    text: string;
    thread_ts?: string;
  }): Promise<ApiResponse<any>> {
    try {
      if (!this.config.addMessageToolEnabled) {
        return {
          success: false,
          error: 'Message posting is disabled'
        };
      }

      // Resolve channel name to ID if needed
      let channelId = params.channel;
      if (params.channel.startsWith('#')) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(c => c.name === channelName);
        if (channel?.id) {
          channelId = channel.id;
        } else {
          return {
            success: false,
            error: `Channel ${params.channel} not found`
          };
        }
      }

      // Check if channel is allowed
      if (this.config.allowedChannels && this.config.allowedChannels.length > 0) {
        const channelInfo = this.channelsCache.get(channelId);
        const channelName = channelInfo?.name || channelId;
        
        if (!this.config.allowedChannels.includes(channelId) && 
            !this.config.allowedChannels.includes(`#${channelName}`)) {
          return {
            success: false,
            error: `Posting to channel ${params.channel} is not allowed`
          };
        }
      }

      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: params.text,
        thread_ts: params.thread_ts
      });

      if (!result.ok) {
        return {
          success: false,
          error: `Failed to post message: ${result.error}`
        };
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private processText(text: string): string {
    // Basic text processing - convert user/channel mentions
    return text
      .replace(/<@(\w+)>/g, (match, userId) => {
        const user = this.usersCache.get(userId);
        return user ? `@${user.name}` : match;
      })
      .replace(/<#(\w+)\|([^>]+)>/g, '@$2')
      .replace(/<#(\w+)>/g, (match, channelId) => {
        const channel = this.channelsCache.get(channelId);
        return channel ? `#${channel.name}` : match;
      })
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  getUserInfo(userId: string): Member | undefined {
    return this.usersCache.get(userId);
  }

  getChannelInfo(channelId: string): Channel | undefined {
    return this.channelsCache.get(channelId);
  }
}