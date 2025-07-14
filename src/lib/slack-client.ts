import { WebClient } from '@slack/web-api';
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

export interface SlackChannel {
  id: string;
  name: string;
  topic: string;
  purpose: string;
  memberCount: number;
  isMpIM: boolean;
  isIM: boolean;
  isPrivate: boolean;
  isMember: boolean;
}

export interface SlackMessage {
  userID: string;
  userName: string;
  realName: string;
  channel: string;
  threadTs: string;
  text: string;
  time: string;
  cursor?: string;
}

export interface SlackUser {
  id: string;
  name: string;
  realName: string;
  displayName: string;
  email?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class SlackMCPClient {
  private client: WebClient;
  private config: SlackConfig;
  private usersCache: Map<string, SlackUser> = new Map();
  private usersInvCache: Map<string, string> = new Map();
  private channelsCache: Map<string, SlackChannel> = new Map();
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

  async refreshUsers(): Promise<ApiResponse<SlackUser[]>> {
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
          const user: SlackUser = {
            id: member.id,
            name: member.name,
            realName: member.real_name || member.name,
            displayName: member.profile?.display_name || member.real_name || member.name,
            email: member.profile?.email
          };
          
          this.usersCache.set(user.id, user);
          this.usersInvCache.set(user.name, user.id);
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

  async refreshChannels(): Promise<ApiResponse<SlackChannel[]>> {
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
      const allChannels: SlackChannel[] = [];

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
            const slackChannel: SlackChannel = {
              id: channel.id,
              name: channel.name,
              topic: channel.topic?.value || '',
              purpose: channel.purpose?.value || '',
              memberCount: channel.num_members || 0,
              isMpIM: channel.is_mpim || false,
              isIM: channel.is_im || false,
              isPrivate: channel.is_private || false,
              isMember: channel.is_member || false
            };
            
            this.channelsCache.set(slackChannel.id, slackChannel);
            allChannels.push(slackChannel);
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

  async getChannels(): Promise<ApiResponse<SlackChannel[]>> {
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
  }): Promise<ApiResponse<SlackMessage[]>> {
    try {
      // Resolve channel name to ID if needed
      let channelId = params.channel;
      if (params.channel.startsWith('#')) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(c => c.name === channelName);
        if (channel) {
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

      const messages: SlackMessage[] = [];

      for (const msg of result.messages) {
        // Cast to any to access all message properties
        const message_any = msg as any;
        
        if (message_any.subtype && message_any.subtype !== '') {
          // Skip system messages unless it's a regular message
          continue;
        }

        const user = this.usersCache.get(message_any.user || '');
        const message: SlackMessage = {
          userID: message_any.user || '',
          userName: user?.name || message_any.user || 'Unknown',
          realName: user?.realName || user?.name || message_any.user || 'Unknown',
          channel: channelId,
          threadTs: message_any.thread_ts || '',
          text: this.processText(message_any.text || ''),
          time: message_any.ts || ''
        };

        messages.push(message);
      }

      // Add cursor for pagination if there are more messages
      if (messages.length > 0 && result.has_more && result.response_metadata?.next_cursor) {
        messages[messages.length - 1].cursor = result.response_metadata.next_cursor;
      }

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
  }): Promise<ApiResponse<SlackMessage[]>> {
    try {
      // Resolve channel name to ID if needed
      let channelId = params.channel;
      if (params.channel.startsWith('#')) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(c => c.name === channelName);
        if (channel) {
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

      const messages: SlackMessage[] = [];

      for (const msg of result.messages) {
        // Cast to any to access all message properties
        const message_any = msg as any;
        
        if (message_any.subtype && message_any.subtype !== '') {
          // Skip system messages unless it's a regular message
          continue;
        }

        const user = this.usersCache.get(message_any.user || '');
        const message: SlackMessage = {
          userID: message_any.user || '',
          userName: user?.name || message_any.user || 'Unknown',
          realName: user?.realName || user?.name || message_any.user || 'Unknown',
          channel: channelId,
          threadTs: message_any.thread_ts || '',
          text: this.processText(message_any.text || ''),
          time: message_any.ts || ''
        };

        messages.push(message);
      }

      // Add cursor for pagination if there are more messages
      if (messages.length > 0 && result.has_more && result.response_metadata?.next_cursor) {
        messages[messages.length - 1].cursor = result.response_metadata.next_cursor;
      }

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
  }): Promise<ApiResponse<SlackMessage[]>> {
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

      const messages: SlackMessage[] = [];

      for (const match of result.messages.matches) {
        // Cast to any to access all match properties
        const match_any = match as any;
        
        const user = this.usersCache.get(match_any.user || '');
        const channel = this.channelsCache.get(match_any.channel?.id || '');
        
        const message: SlackMessage = {
          userID: match_any.user || '',
          userName: user?.name || match_any.username || 'Unknown',
          realName: user?.realName || user?.name || match_any.username || 'Unknown',
          channel: match_any.channel?.id || '',
          threadTs: match_any.ts || '',
          text: this.processText(match_any.text || ''),
          time: match_any.ts || ''
        };

        messages.push(message);
      }

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
        if (channel) {
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

  getUserInfo(userId: string): SlackUser | undefined {
    return this.usersCache.get(userId);
  }

  getChannelInfo(channelId: string): SlackChannel | undefined {
    return this.channelsCache.get(channelId);
  }
}