import { WebClient } from '@slack/web-api';
import type { Member } from '@slack/web-api/dist/types/response/UsersListResponse';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';
import type { Match } from '@slack/web-api/dist/types/response/SearchMessagesResponse';

export interface SlackConfig {
  userToken?: string;
  addMessageToolEnabled?: boolean;
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

  constructor(config: SlackConfig) {
    this.config = config;

    // Use user token
    const token = config.userToken;
    if (!token) {
      throw new Error('userToken must be provided');
    }

    this.client = new WebClient(token);
  }

  async getUsers(): Promise<ApiResponse<Member[]>> {
    try {
      const result = await this.client.users.list({
        limit: 1000,
      });

      if (!result.ok || !result.members) {
        return {
          success: false,
          error: 'Failed to fetch users from Slack API',
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

      return {
        success: true,
        data: Array.from(this.usersCache.values()),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listChannels(
    cursor?: string,
    limit?: number
  ): Promise<ApiResponse<Channel[]> & { nextCursor?: string }> {
    try {
      const types = ['public_channel', 'private_channel', 'mpim', 'im'];

      const result = await this.client.conversations.list({
        types: types.join(','),
        limit: Math.min(limit || 10, 100),
        cursor: cursor,
      });

      if (!result.ok || !result.channels) {
        return {
          success: false,
          error: 'Failed to fetch channels from Slack API',
        };
      }

      const allChannels: Channel[] = [];
      for (const channel of result.channels) {
        if (channel.id && channel.name) {
          this.channelsCache.set(channel.id, channel);
          allChannels.push(channel);
        }
      }

      return {
        success: true,
        data: allChannels,
        ...(result.response_metadata?.next_cursor && {
          nextCursor: result.response_metadata.next_cursor,
        }),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getChannels(
    cursor?: string,
    limit?: number
  ): Promise<ApiResponse<Channel[]> & { nextCursor?: string }> {
    return await this.listChannels(cursor, limit);
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
      if (
        params.channel &&
        typeof params.channel === 'string' &&
        params.channel.startsWith('#')
      ) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(
          c => c.name === channelName
        );
        if (channel?.id) {
          channelId = channel.id;
        } else {
          return {
            success: false,
            error: `Channel ${params.channel} not found`,
          };
        }
      }

      const result = await this.client.conversations.history({
        channel: channelId,
        limit: params.limit || 10,
        oldest: params.oldest,
        latest: params.latest,
        cursor: params.cursor,
        inclusive: false,
      });

      if (!result.ok || !result.messages) {
        return {
          success: false,
          error: 'Failed to fetch conversation history',
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
          text: this.processText(message.text || ''),
        };

        messages.push(processedMessage);
      }

      // Add cursor for pagination if there are more messages
      // Note: cursor is handled by response_metadata, not individual messages

      return {
        success: true,
        data: messages,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      if (
        params.channel &&
        typeof params.channel === 'string' &&
        params.channel.startsWith('#')
      ) {
        const channelName = params.channel.substring(1);
        const channel = Array.from(this.channelsCache.values()).find(
          c => c.name === channelName
        );
        if (channel?.id) {
          channelId = channel.id;
        } else {
          return {
            success: false,
            error: `Channel ${params.channel} not found`,
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
        inclusive: true,
      });

      if (!result.ok || !result.messages) {
        return {
          success: false,
          error: 'Failed to fetch conversation replies',
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
          text: this.processText(message.text || ''),
        };

        messages.push(processedMessage);
      }

      // Add cursor for pagination if there are more messages
      // Note: cursor is handled by response_metadata, not individual messages

      return {
        success: true,
        data: messages,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
        sort_dir: params.sort_dir || 'desc',
      });

      if (!result.ok || !result.messages?.matches) {
        return {
          success: false,
          error: 'Failed to search messages',
        };
      }

      const matches: Match[] = [];

      for (const match of result.messages.matches) {
        // Process the match text
        const processedMatch: Match = {
          ...match,
          text: this.processText(match.text || ''),
        };

        matches.push(processedMatch);
      }

      return {
        success: true,
        data: matches,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
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
