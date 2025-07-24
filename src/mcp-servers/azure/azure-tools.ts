import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AzureAPIClient } from './azure-client.js';
import { subDays, addDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

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

interface GetLatestEmailsArgs {
  days?: number;
}

interface GetUpcomingCalendarArgs {
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

export class AzureTools {
  private azureClient: AzureAPIClient;
  private tools: StructuredTool[];
  private timezone?: string;

  constructor(azureClient: AzureAPIClient, timezone?: string) {
    this.azureClient = azureClient;
    this.timezone = timezone;
    this.tools = this.createTools();
  }

  // Create DynamicStructuredTool instances
  private createTools(): StructuredTool[] {
    return [
      tool(
        async input =>
          this.formatToolResponse(await this.handleGetLatestEmails(input)),
        {
          name: 'azure__get_latest_emails',
          description: 'Get latest emails from the last N days',
          schema: z.object({
            days: z
              .number()
              .optional()
              .describe('Number of days to look back (default: 14)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleGetUpcomingCalendar(input)),
        {
          name: 'azure__get_upcoming_calendar',
          description: 'Get upcoming calendar events for the next N days',
          schema: z.object({
            days: z
              .number()
              .optional()
              .describe('Number of days to look ahead (default: 7)'),
          }),
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

  private async handleSearchEmail(
    args: SearchEmailArgs
  ): Promise<ToolResponse> {
    const { query, limit = 1000 } = args;

    const searchResult = await this.azureClient.searchEmails({
      query,
      limit,
    });

    if (searchResult.success && searchResult.data) {
      let content =
        'id,subject,from,toRecipients,receivedDateTime,importance,isRead,summary\n';
      searchResult.data.forEach(msg => {
        content += `${msg.id},"${msg.subject.replace(/"/g, '""')}",${msg.from},"${msg.toRecipients.join(';')}",${msg.receivedDateTime},${msg.importance},${msg.isRead},"${(msg.body || '').replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
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
    const { limit = 1000, start_time, end_time } = args;

    const eventsResult = await this.azureClient.getCalendarEvents({
      limit,
      startTime: start_time,
      endTime: end_time,
    });

    if (eventsResult.success && eventsResult.data) {
      let content =
        'id,subject,start,end,location,attendees,organizer,importance,body\n';
      eventsResult.data.forEach(event => {
        content += `${event.id},"${event.subject.replace(/"/g, '""')}",${this.formatDateTime(event.start, event.startTimeZone)},${this.formatDateTime(event.end, event.endTimeZone)},"${event.location.replace(/"/g, '""')}","${event.attendees.join(';')}",${event.organizer},${event.importance},"${event.body.replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;
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
      content += `${msg.id},"${msg.subject.replace(/"/g, '""')}",${msg.from},"${msg.toRecipients.join(';')}",${msg.receivedDateTime},${msg.importance},${msg.isRead},"${(msg.body || '').replace(/"/g, '""').replace(/\n/g, ' ')}"\n`;

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

  private async handleGetLatestEmails(
    args: GetLatestEmailsArgs
  ): Promise<ToolResponse> {
    const { days = 14 } = args;

    try {
      // Calculate date range (last N days)
      const startDate = subDays(new Date(), days);

      // Format date for Microsoft Graph API filter (ISO 8601 format with Z)
      const startDateStr = startDate.toISOString();

      // Create filter for emails received after the start date
      const filter = `receivedDateTime ge ${startDateStr}`;

      const emailsResult = await this.azureClient.getMessageTitles({
        filter,
      });

      if (emailsResult.success && emailsResult.data) {
        let content =
          'id,subject,from,toRecipients,receivedDateTime,importance,isRead\n';
        emailsResult.data.forEach(msg => {
          content += `${msg.id},"${msg.subject.replace(/"/g, '""')}",${msg.from},"${msg.toRecipients.join(';')}",${msg.receivedDateTime},${msg.importance},${msg.isRead}\n`;
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
              text: `Error getting latest emails: ${emailsResult.error}`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting latest emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetUpcomingCalendar(
    args: GetUpcomingCalendarArgs
  ): Promise<ToolResponse> {
    const { days = 7 } = args;

    try {
      // Calculate date range (next N days)
      const startDate = new Date();
      const endDate = addDays(new Date(), days);

      // Format dates for Microsoft Graph API filter (ISO 8601 format with Z)
      const startDateStr = startDate.toISOString();
      const endDateStr = endDate.toISOString();

      const eventsResult = await this.azureClient.getCalendarEvents({
        startTime: startDateStr,
        endTime: endDateStr,
      });

      if (eventsResult.success && eventsResult.data) {
        let content =
          'id,subject,start,end,location,attendees,organizer,importance\n';
        eventsResult.data.forEach(event => {
          content += `${event.id},"${event.subject.replace(/"/g, '""')}",${this.formatDateTime(event.start, event.startTimeZone)},${this.formatDateTime(event.end, event.endTimeZone)},"${event.location.replace(/"/g, '""')}","${event.attendees.join(';')}",${event.organizer},${event.importance}\n`;
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
              text: `Error getting upcoming events: ${eventsResult.error}`,
            },
          ],
          isError: true,
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting upcoming events: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  // Helper method to format datetime with timezone support
  private formatDateTime(
    dateString: string,
    sourceTimeZone: string = 'UTC'
  ): string {
    if (!dateString) return '';

    try {
      // Microsoft Graph returns UTC times but without 'Z' suffix
      // We need to append 'Z' to ensure parseISO treats it as UTC
      let dateToParseISO = dateString;
      if (sourceTimeZone === 'UTC' && !dateString.endsWith('Z')) {
        dateToParseISO = dateString.replace(/\.?\d*$/, 'Z');
      }

      const date = parseISO(dateToParseISO);

      if (this.timezone) {
        return formatInTimeZone(date, this.timezone, 'yyyy-MM-dd HH:mm:ss zzz');
      }
      return date.toISOString();
    } catch {
      return dateString; // Return original if parsing fails
    }
  }
}
