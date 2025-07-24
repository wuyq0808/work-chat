import { WebClient } from '@slack/web-api';
import type { Member } from '@slack/web-api/dist/types/response/UsersListResponse';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';
import type { Match } from '@slack/web-api/dist/types/response/SearchMessagesResponse';

export interface SlackConfig {
  userToken?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class SlackAPIClient {
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

  async getConversationHistory(params: {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
  }): Promise<ApiResponse<Array<MessageElement & { isUnread: boolean }>>> {
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

      // Get conversation info for last_read timestamp
      const infoResult = await this.getConversationInfo(channelId);
      const lastRead = infoResult.success
        ? infoResult.data?.last_read
        : undefined;

      const messages: Array<MessageElement & { isUnread: boolean }> = [];

      for (const msg of result.messages) {
        const message = msg as MessageElement;

        if (message.subtype && message.subtype !== '') {
          // Skip system messages unless it's a regular message
          continue;
        }

        // Process the message text and add unread status
        const processedMessage = {
          ...message,
          text: this.processText(message.text || ''),
          isUnread: this.isMessageUnread(message.ts || '', lastRead),
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
  }): Promise<ApiResponse<Array<Match & { isUnread: boolean }>>> {
    try {
      const result = await this.client.search.messages({
        query: params.query,
        count: params.count || 100,
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

      // Group messages by channel to minimize API calls
      const channelIds = new Set<string>();
      result.messages.matches.forEach(match => {
        if (match.channel?.id) {
          channelIds.add(match.channel.id);
        }
      });

      // Get last_read timestamps for all channels
      const channelLastRead = new Map<string, string>();
      await Promise.all(
        Array.from(channelIds).map(async channelId => {
          const infoResult = await this.getConversationInfo(channelId);
          if (infoResult.success && infoResult.data?.last_read) {
            channelLastRead.set(channelId, infoResult.data.last_read);
          }
        })
      );

      const matches: Array<Match & { isUnread: boolean }> = [];

      for (const match of result.messages.matches) {
        // Process the match text and add unread status
        const processedMatch = {
          ...match,
          text: this.processText(match.text || ''),
          isUnread: this.isMessageUnread(
            match.ts || '',
            channelLastRead.get(match.channel?.id || '')
          ),
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

  // Helper function to determine if a message is unread
  private isMessageUnread(messageTs: string, lastRead?: string): boolean {
    if (!lastRead) {
      // If no last_read timestamp, assume all messages are unread
      return true;
    }

    const messageTime = parseFloat(messageTs);
    const lastReadTime = parseFloat(lastRead);

    // If either timestamp is invalid (NaN), assume unread for safety
    if (isNaN(messageTime) || isNaN(lastReadTime)) {
      return true;
    }

    // Compare timestamps - message is unread if ts > last_read
    return messageTime > lastReadTime;
  }

  async getConversationInfo(channelId: string): Promise<
    ApiResponse<{
      last_read?: string;
      unread_count?: number;
      unread_count_display?: number;
    }>
  > {
    try {
      const result = await this.client.conversations.info({
        channel: channelId,
      });

      if (!result.ok || !result.channel) {
        return {
          success: false,
          error: 'Failed to fetch conversation info',
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel = result.channel as any;

      return {
        success: true,
        data: {
          last_read: channel.last_read,
          unread_count: channel.unread_count,
          unread_count_display: channel.unread_count_display,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getAuthTest(): Promise<ApiResponse<{ user_id: string; user: string }>> {
    try {
      const result = await this.client.auth.test();

      if (!result.ok || !result.user_id || !result.user) {
        return {
          success: false,
          error: 'Failed to get auth test info',
        };
      }

      return {
        success: true,
        data: {
          user_id: result.user_id,
          user: result.user,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getChannels(): Promise<ApiResponse<Channel[]>> {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel',
        limit: 100,
      });

      if (!result.ok || !result.channels) {
        return {
          success: false,
          error: 'Failed to fetch channels',
        };
      }

      // Update cache
      result.channels.forEach(channel => {
        if (channel.id) {
          this.channelsCache.set(channel.id, channel);
        }
      });

      return {
        success: true,
        data: result.channels as Channel[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getUsers(): Promise<ApiResponse<Member[]>> {
    try {
      const result = await this.client.users.list({
        limit: 100,
      });

      if (!result.ok || !result.members) {
        return {
          success: false,
          error: 'Failed to fetch users',
        };
      }

      // Update cache
      result.members.forEach(member => {
        if (member.id) {
          this.usersCache.set(member.id, member);
        }
      });

      return {
        success: true,
        data: result.members as Member[],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
