import { WebClient } from '@slack/web-api';
import type { Channel } from '@slack/web-api/dist/types/response/ConversationsListResponse';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsHistoryResponse';
import type { Match } from '@slack/web-api/dist/types/response/SearchMessagesResponse';

export interface SlackMessage extends Match {
  isUnread?: boolean;
}

export class SlackAPIClient {
  private client: WebClient;

  private channelsCache: Map<string, Channel> = new Map();

  constructor(token: string) {
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
  }): Promise<MessageElement[]> {
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

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
    }

    if (!result.messages) {
      throw new Error('No messages returned from Slack API');
    }

    const messages: MessageElement[] = [];

    for (const msg of result.messages) {
      const message = msg as MessageElement;

      if (message.subtype && message.subtype !== '') {
        // Skip system messages unless it's a regular message
        continue;
      }

      // Process the message text
      const processedMessage = {
        ...message,
        text: message.text || '',
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

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
    }

    if (!result.messages) {
      throw new Error('No messages returned from Slack API');
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
  }

  async searchMessages(params: {
    query: string;
    count?: number;
    page?: number;
    sort?: 'score' | 'timestamp';
    sort_dir?: 'asc' | 'desc';
  }): Promise<SlackMessage[]> {
    const result = await this.client.search.messages({
      query: params.query,
      count: params.count || 100,
      page: params.page || 1,
      sort: params.sort,
      sort_dir: params.sort_dir,
    });

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
    }

    if (!result.messages?.matches) {
      return []; // No matches found is a valid result
    }

    const matches: SlackMessage[] = [];

    for (const match of result.messages.matches) {
      const processedMatch = {
        ...match,
        text: match.text || '',
      };

      matches.push(processedMatch);
    }

    return matches;
  }

  async getAuthTest(): Promise<{ user_id: string; user: string }> {
    const result = await this.client.auth.test();

    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error || 'Unknown error'}`);
    }

    if (!result.user_id || !result.user) {
      throw new Error('Invalid auth response: missing user_id or user');
    }

    return {
      user_id: result.user_id,
      user: result.user,
    };
  }
}
