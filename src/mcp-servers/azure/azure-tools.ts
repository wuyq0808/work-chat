import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AzureAPIClient } from './azure-client.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface GetMessagesArgs {
  limit?: number;
  filter?: string;
  search?: string;
}

interface GetCalendarEventsArgs {
  limit?: number;
  start_time?: string;
  end_time?: string;
}

interface GetEmailContentArgs {
  messageId: string;
}

interface SearchEmailArgs {
  query?: string;
  limit?: number;
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown; // Index signature for MCP compatibility
}

export class AzureTools {
  private azureClient: AzureAPIClient;
  private tools: StructuredTool[];

  constructor(azureClient: AzureAPIClient) {
    this.azureClient = azureClient;
    this.tools = this.createTools();
  }

  // Create DynamicStructuredTool instances
  private createTools(): StructuredTool[] {
    return [
      tool(
        async _input => this.formatToolResponse(await this.handleGetProfile()),
        {
          name: 'azure__get_profile',
          description:
            'Get the current user profile information from Microsoft Graph',
          schema: z.object({}),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleSearchEmail(input)),
        {
          name: 'azure__search_email',
          description:
            'Search emails by keyword or get newest emails by time (returns summaries only)',
          schema: z.object({
            query: z
              .string()
              .optional()
              .describe(
                'Search keyword to find in email content. If not provided, returns newest emails by time'
              ),
            limit: z
              .number()
              .optional()
              .describe('Number of emails to retrieve (default: 25)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleGetCalendarEvents(input)),
        {
          name: 'azure__get_calendar_events',
          description: 'Get calendar events from Outlook/Exchange',
          schema: z.object({
            limit: z
              .number()
              .optional()
              .describe('Number of events to retrieve (default: 10)'),
            start_time: z
              .string()
              .optional()
              .describe('Start time filter (ISO 8601 format)'),
            end_time: z
              .string()
              .optional()
              .describe('End time filter (ISO 8601 format)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleGetEmailContent(input)),
        {
          name: 'azure__get_email_content',
          description: 'Get full content of a specific email by message ID',
          schema: z.object({
            messageId: z
              .string()
              .describe(
                'The message ID of the email to retrieve full content for'
              ),
          }),
        }
      ),
    ];
  }

  // Helper to format ToolResponse as string for LangChain
  private formatToolResponse(response: ToolResponse): string {
    if (response.content && Array.isArray(response.content)) {
      return (
        response.content
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((item: any) => item.text || JSON.stringify(item)) // ToolResponse content format can vary
          .join('\n')
      );
    }
    return JSON.stringify(response);
  }

  // Get LangChain-compatible tools
  getTools(): StructuredTool[] {
    return this.tools;
  }

  private async handleGetProfile(): Promise<ToolResponse> {
    const profileResult = await this.azureClient.getProfile();

    if (profileResult.success && profileResult.data) {
      const profile = profileResult.data;
      let content =
        'id,displayName,userPrincipalName,mail,jobTitle,department,officeLocation\n';
      content += `${profile.id},${profile.displayName},${profile.userPrincipalName},${profile.mail || ''},${profile.jobTitle || ''},${profile.department || ''},${profile.officeLocation || ''}\n`;

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
            text: `Error fetching profile: ${profileResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchEmail(
    args: SearchEmailArgs
  ): Promise<ToolResponse> {
    const { query, limit = 25 } = args;

    const searchResult = await this.azureClient.searchEmails({
      query,
      limit,
    });

    if (searchResult.success && searchResult.data) {
      let content =
        'id,subject,from,toRecipients,receivedDateTime,importance,isRead,summary\n';
      searchResult.data.forEach(msg => {
        content += `${msg.id},"${msg.subject.replace(/"/g, '""')}",${msg.from},"${msg.toRecipients.join(';')}",${msg.receivedDateTime},${msg.importance},${msg.isRead},"${msg.body.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
      });

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
            text: `Error searching emails: ${searchResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetCalendarEvents(
    args: GetCalendarEventsArgs
  ): Promise<ToolResponse> {
    const { limit = 10, start_time, end_time } = args;

    const eventsResult = await this.azureClient.getCalendarEvents({
      limit,
      startTime: start_time,
      endTime: end_time,
    });

    if (eventsResult.success && eventsResult.data) {
      let content =
        'id,subject,start,end,location,attendees,organizer,importance,body\n';
      eventsResult.data.forEach(event => {
        content += `${event.id},"${event.subject.replace(/"/g, '""')}",${event.start},${event.end},"${event.location.replace(/"/g, '""')}","${event.attendees.join(';')}",${event.organizer},${event.importance},"${event.body.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
      });

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
            text: `Error fetching calendar events: ${eventsResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetEmailContent(
    args: GetEmailContentArgs
  ): Promise<ToolResponse> {
    const { messageId } = args;

    const emailResult = await this.azureClient.getEmailContent({
      messageId,
    });

    if (emailResult.success && emailResult.data) {
      const msg = emailResult.data;
      let content =
        'id,subject,from,toRecipients,receivedDateTime,importance,isRead,body\n';
      content += `${msg.id},"${msg.subject.replace(/"/g, '""')}",${msg.from},"${msg.toRecipients.join(';')}",${msg.receivedDateTime},${msg.importance},${msg.isRead},"${msg.body.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;

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
            text: `Error fetching email content: ${emailResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  // Helper method to format CSV content (used by both profile and message handlers)
  private formatCSVField(value: string): string {
    return `"${value.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
  }
}
