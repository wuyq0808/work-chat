import { WebClient } from '@slack/web-api';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';
import type { Match } from '@slack/web-api/dist/types/response/SearchMessagesResponse';
import NodeCache from 'node-cache';

export interface SlackMessage extends Match {
  isUnread: boolean;
}

export class SlackAPIClient {
  private client: WebClient;

  private channelsCache: Map<string, Channel> = new Map();
  private conversationInfoCache: NodeCache;

  constructor(token: string) {
    if (!token) {
      throw new Error('userToken must be provided');
    }

    this.client = new WebClient(token);

    // Initialize conversation info cache with 1 minute TTL
    this.conversationInfoCache = new NodeCache({
      stdTTL: 60, // 1 minute in seconds
      checkperiod: 120, // Check for expired keys every 2 minutes
    });
  }

  async getConversationHistory(params: {
    channel: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
  }): Promise<Array<MessageElement & { isUnread: boolean }>> {
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
        throw new Error(`Channel ${params.channel} not found`);
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
      throw new Error('Failed to fetch conversation history');
    }

    // Get conversation info for last_read timestamp
    const conversationInfo = await this.getConversationInfo(channelId);
    const lastRead = conversationInfo?.last_read;

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
        text: message.text || '',
        isUnread: this.isMessageUnread(message.ts || '', lastRead),
      };

      messages.push(processedMessage);
    }

    return messages;
  }

  async getConversationReplies(params: {
    channel: string;
    ts: string;
    limit?: number;
    oldest?: string;
    latest?: string;
    cursor?: string;
  }): Promise<MessageElement[]> {
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
          throw new Error(`Channel ${params.channel} not found`);
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
        throw new Error('Failed to fetch conversation replies');
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
          text: message.text || '',
        };

        messages.push(processedMessage);
      }

      // Add cursor for pagination if there are more messages
      // Note: cursor is handled by response_metadata, not individual messages

      return messages;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }

  async searchMessages(params: {
    query: string;
    count?: number;
    page?: number;
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
  }): Promise<SlackMessage[]> {
    try {
      const result = await this.client.search.messages({
        query: params.query,
        count: params.count || 100,
        page: params.page || 1,
        sort: params.sort || 'timestamp',
        sort_dir: params.sort_dir || 'desc',
      });

      if (!result.ok || !result.messages?.matches) {
        throw new Error('Failed to search messages');
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
          try {
            const infoResult = await this.getConversationInfo(channelId);
            if (infoResult.last_read) {
              channelLastRead.set(channelId, infoResult.last_read);
            }
          } catch {
            // Ignore errors for individual channels
          }
        })
      );

      const matches: SlackMessage[] = [];

      for (const match of result.messages.matches) {
        // Process the match text and add unread status
        const processedMatch = {
          ...match,
          text: match.text || '',
          isUnread: this.isMessageUnread(
            match.ts || '',
            channelLastRead.get(match.channel?.id || '')
          ),
        };

        matches.push(processedMatch);
      }

      return matches;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error');
    }
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

  async getConversationInfo(channelId: string): Promise<{
    last_read?: string;
  }> {
    try {
      // Check cache first
      const cachedInfo = this.conversationInfoCache.get<{
        last_read?: string;
      }>(channelId);

      if (cachedInfo) {
        return cachedInfo;
      }

      // Cache miss - fetch from API
      const result = await this.client.conversations.info({
        channel: channelId,
      });

      if (!result.ok || !result.channel) {
        throw new Error('Failed to fetch conversation info');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel = result.channel as any;

      const conversationInfo = {
        last_read: channel.last_read,
      };

      // Cache the result
      this.conversationInfoCache.set(channelId, conversationInfo);

      return conversationInfo;
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }

  async getAuthTest(): Promise<{ user_id: string; user: string }> {
    try {
      const result = await this.client.auth.test();

      if (!result.ok || !result.user_id || !result.user) {
        throw new Error('Failed to get auth test info');
      }

      return {
        user_id: result.user_id,
        user: result.user,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }
}
