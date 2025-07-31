import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { SlackAPIClient, type SlackMessage } from './slack-client.js';
import { subDays, format } from 'date-fns';
import { stringify } from 'csv-stringify/sync';
import { WebClient } from '@slack/web-api';

interface ConversationsHistoryArgs {
  channel_id: string;
  limit?: number;
}

interface ConversationsRepliesArgs {
  channel_id: string;
  thread_ts: string;
  limit?: number;
}

interface SearchMessagesArgs {
  query: string;
  before_date?: string;
  after_date?: string;
  count?: number;
}

interface GetUserLatestMessagesArgs {
  days?: number;
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown; // Index signature for MCP compatibility
}

export class SlackTools {
  private slackClient: SlackAPIClient;
  private tools: StructuredTool[];
  private webClient: WebClient;

  constructor(slackClient: SlackAPIClient) {
    this.slackClient = slackClient;
    this.tools = this.createTools();
    // Access the WebClient for unread functionality
    this.webClient = (slackClient as any).client;
  }

  // Create DynamicStructuredTool instances
  private createTools(): StructuredTool[] {
    return [
      tool(
        async input =>
          this.formatToolResponse(await this.handleConversationsHistory(input)),
        {
          name: 'slack__conversations_history',
          description: 'Get conversation history from a Slack channel',
          schema: z.object({
            channel_id: z
              .string()
              .describe('Channel ID or name (e.g., #general)'),
            limit: z
              .number()
              .optional()
              .describe('Number of messages (default: 10)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleConversationsReplies(input)),
        {
          name: 'slack__conversations_replies',
          description: 'Get thread replies from a Slack conversation',
          schema: z.object({
            channel_id: z
              .string()
              .describe('Channel ID or name (e.g., #general)'),
            thread_ts: z
              .string()
              .describe('Thread timestamp (e.g., 1234567890.123456)'),
            limit: z
              .number()
              .optional()
              .describe('Number of replies (default: 10)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleSearchMessages(input)),
        {
          name: 'slack__search_messages',
          description: 'Search for messages across Slack workspace',
          schema: z.object({
            query: z
              .string()
              .describe(
                'Search query text (keywords, phrases). Unquoted multi-word searches for messages containing ANY of the words (OR logic), quoted phrases search for exact phrase matches.'
              ),
            before_date: z
              .string()
              .optional()
              .describe('Filter messages before date (YYYY-MM-DD)'),
            after_date: z
              .string()
              .optional()
              .describe('Filter messages after date (YYYY-MM-DD)'),
            count: z
              .number()
              .optional()
              .describe('Number of results (default: 50)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(
            await this.handleGetUserLatestMessages(input)
          ),
        {
          name: 'slack__get_latest_messages',
          description:
            'Get latest messages involving the current user (messages with/to/from the user) in the last N days',
          schema: z.object({
            days: z
              .number()
              .optional()
              .describe('Number of days to look back (default: 14)'),
          }),
        }
      ),
    ];
  }

  // Helper to format ToolResponse as string for LangChain
  private formatToolResponse(response: ToolResponse): string {
    if (response.content && Array.isArray(response.content)) {
      return response.content
        .map((item: { text?: string }) => item.text || JSON.stringify(item))
        .join('\n');
    }
    return JSON.stringify(response);
  }

  // Get LangChain-compatible tools
  getTools(): StructuredTool[] {
    return this.tools;
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

  // Helper to get conversation info for unread status
  private async getConversationInfo(channelId: string): Promise<{
    last_read?: string;
  }> {
    try {
      const result = await this.webClient.conversations.info({
        channel: channelId,
      });

      if (!result.ok || !result.channel) {
        throw new Error('Failed to fetch conversation info');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channel = result.channel as any;

      return {
        last_read: channel.last_read,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error('Unknown error');
    }
  }

  // Private method to group messages by channel and format with headers
  private async formatMessagesGroupedByChannel(
    messages: SlackMessage[]
  ): Promise<string> {
    // Group messages by channel
    const channelGroups = new Map<string, any[]>();

    messages.forEach((msg: any) => {
      const channelId = msg.channel?.id || 'unknown';
      if (!channelGroups.has(channelId)) {
        channelGroups.set(channelId, []);
      }
      channelGroups.get(channelId)!.push(msg);
    });

    // Sort each channel group by time (descending)
    channelGroups.forEach(channelMessages => {
      channelMessages.sort((a: any, b: any) => {
        const timeA = a.ts ? parseFloat(a.ts) : 0;
        const timeB = b.ts ? parseFloat(b.ts) : 0;
        return timeB - timeA; // Descending order (newest first)
      });
    });

    // Get last_read timestamps for all channels
    const channelLastRead = new Map<string, string>();
    await Promise.all(
      Array.from(channelGroups.keys()).map(async channelId => {
        if (channelId !== 'unknown') {
          try {
            const infoResult = await this.getConversationInfo(channelId);
            if (infoResult.last_read) {
              channelLastRead.set(channelId, infoResult.last_read);
            }
          } catch {
            // Ignore errors for individual channels
          }
        }
      })
    );

    let content = '';

    // Generate content for each channel
    channelGroups.forEach((channelMessages, channelId) => {
      const firstMsg = channelMessages[0];
      const channelName = firstMsg.channel?.name || 'unknown';
      const lastRead = channelLastRead.get(channelId);

      // Add channel start header
      content += `Channel start -- #${channelName} ${channelId}\n`;

      // Add CSV data for this channel (without channel column)
      const records = channelMessages.map((msg: SlackMessage) => [
        msg.username || '',
        msg.text || '',
        msg.ts || '',
        this.isMessageUnread(msg.ts || '', lastRead) ? 'true' : 'false',
      ]);

      const channelCsv = stringify([
        ['username', 'text', 'time', 'isUnread'],
        ...records,
      ]);

      content += channelCsv;
      content += `Channel end -- #${channelName} ${channelId}\n\n`;
    });

    return content.trim();
  }

  private async handleConversationsHistory(
    args: ConversationsHistoryArgs
  ): Promise<ToolResponse> {
    const { channel_id, limit = 10 } = args;

    if (!channel_id || typeof channel_id !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: channel_id is required and must be a string',
          },
        ],
        isError: true,
      };
    }

    try {
      const historyResult = await this.slackClient.getConversationHistory({
        channel: channel_id,
        limit,
      });

      const records = historyResult.map((msg: any) => [
        msg.username || '',
        msg.text || '',
        msg.ts || '',
        msg.isUnread ? 'true' : 'false',
      ]);

      const content = stringify([
        ['username', 'text', 'time', 'isUnread'],
        ...records,
      ]);

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching conversation history: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleConversationsReplies(
    args: ConversationsRepliesArgs
  ): Promise<ToolResponse> {
    const { channel_id, thread_ts, limit = 10 } = args;

    if (!channel_id || typeof channel_id !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: channel_id is required and must be a string',
          },
        ],
        isError: true,
      };
    }

    if (!thread_ts || typeof thread_ts !== 'string') {
      return {
        content: [
          {
            type: 'text',
            text: 'Error: thread_ts is required and must be a string',
          },
        ],
        isError: true,
      };
    }

    try {
      const repliesResult = await this.slackClient.getConversationReplies({
        channel: channel_id,
        ts: thread_ts,
        limit,
      });

      const records = repliesResult.map((msg: any) => [
        msg.username || '',
        msg.text || '',
        msg.ts || '',
        msg.thread_ts || '',
      ]);

      const content = stringify([
        ['username', 'text', 'time', 'thread_ts'],
        ...records,
      ]);

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error fetching thread replies: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchMessages(
    args: SearchMessagesArgs
  ): Promise<ToolResponse> {
    const { query, before_date, after_date, count = 50 } = args;

    try {
      // Build the full query string from separate parameters
      let fullQuery = query;

      if (before_date) {
        fullQuery += ` before:${before_date}`;
      }
      if (after_date) {
        fullQuery += ` after:${after_date}`;
      }

      const finalQuery = fullQuery.trim();

      const searchResult = await this.slackClient.searchMessages({
        query: finalQuery,
        count,
      });

      const records = searchResult.map((msg: any) => [
        msg.username || '',
        msg.text || '',
        msg.ts || '',
        msg.channel?.name || msg.channel || '',
        msg.channel?.id || '',
        msg.isUnread ? 'true' : 'false',
      ]);

      const content = stringify([
        ['username', 'text', 'time', 'channel', 'channelId', 'isUnread'],
        ...records,
      ]);

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetUserLatestMessages(
    args: GetUserLatestMessagesArgs
  ): Promise<ToolResponse> {
    const { days = 14 } = args;

    try {
      // Get current user ID
      const authResult = await this.slackClient.getAuthTest();
      const userId = authResult.user_id;

      // Calculate start date (N days ago)
      const startDate = subDays(new Date(), days);

      // Format date for Slack search (YYYY-MM-DD)
      const startDateStr = format(startDate, 'yyyy-MM-dd');

      // Search for messages with the user after the start date
      const query = `with:${userId} after:${startDateStr}`;

      // Fetch multiple pages in parallel batches to get more messages faster
      const allMessages: SlackMessage[] = [];
      const maxPages = 10; // Fetch up to 10 pages (1000 messages max)
      const batchSize = 5; // Process 5 pages in parallel per batch

      for (
        let batchStart = 1;
        batchStart <= maxPages;
        batchStart += batchSize
      ) {
        const batchEnd = Math.min(batchStart + batchSize - 1, maxPages);
        const batchPromises = [];

        // Create parallel requests for this batch
        for (let page = batchStart; page <= batchEnd; page++) {
          const promise = this.slackClient.searchMessages({
            query,
            count: 100,
            page,
            sort: 'timestamp',
            sort_dir: 'desc',
          });
          batchPromises.push(promise);
        }

        // Wait for all requests in this batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Process results and check for end conditions
        let shouldStop = false;
        for (const result of batchResults) {
          if (!result || result.length === 0) {
            shouldStop = true;
            break;
          }

          allMessages.push(...result);

          // If we got less than 100 messages, we've reached the end
          if (result.length < 100) {
            shouldStop = true;
          }
        }

        if (shouldStop) {
          break;
        }
      }

      if (allMessages.length > 0) {
        // Sort messages by timestamp in descending order (newest first)
        // Slack timestamps are Unix timestamps as strings (e.g., "1234567890.123456")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        allMessages.sort((a: any, b: any) => {
          const timeA = a.time ? parseFloat(a.time) : 0;
          const timeB = b.time ? parseFloat(b.time) : 0;
          return timeB - timeA; // Descending order (newest first)
        });

        const content = await this.formatMessagesGroupedByChannel(allMessages);

        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'No messages found for the specified time period',
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting user latest messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
}
