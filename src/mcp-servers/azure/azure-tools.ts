import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AzureAPIClient } from './azure-client.js';
import { subDays, addDays, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { stringify } from 'csv-stringify/sync';

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
  query: string;
}

interface GetLatestEmailsArgs {
  days?: number;
}

interface GetUpcomingCalendarArgs {
  days?: number;
}

interface GetEmailsAndCalendarArgs {
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
          description:
            "Get current user's own upcoming calendar events for the next N days (includes detailed content)",
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
          name: 'azure__search_email',
          description:
            'Search emails by query and get full content (supports multiple keywords, searches in title, content, and sender)',
          schema: z.object({
            query: z
              .string()
              .describe(
                'Search query - can include multiple keywords, phrases, or search operators'
              ),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleGetEmailsAndCalendar(input)),
        {
          name: 'azure__get_emails_and_calendar',
          description:
            'Get latest emails and upcoming calendar events in parallel (more efficient than separate calls)',
          schema: z.object({
            days: z
              .number()
              .optional()
              .describe(
                'Number of days to look back for emails and ahead for calendar (default: 14 for emails, 7 for calendar)'
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
      const records = eventsResult.data.map(event => [
        event.id,
        event.subject,
        this.formatDateTime(event.start, event.startTimeZone),
        this.formatDateTime(event.end, event.endTimeZone),
        event.location,
        event.attendees.join(';'),
        event.organizer,
        event.importance,
        event.body,
      ]);

      const content = stringify(records, {
        header: true,
        columns: [
          'id',
          'subject',
          'start',
          'end',
          'location',
          'attendees',
          'organizer',
          'importance',
          'body',
        ],
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
    const { query } = args;

    // Use the search functionality to find emails by query
    const searchResult = await this.azureClient.searchEmails({
      query,
      limit: 10, // Limit to 10 most relevant results
    });

    if (searchResult.success && searchResult.data) {
      const records = searchResult.data.map(msg => [
        msg.id,
        msg.subject,
        msg.from,
        msg.toRecipients.join(';'),
        msg.receivedDateTime,
        msg.importance,
        msg.isRead,
        msg.body || '',
      ]);

      const content = stringify(records, {
        header: true,
        columns: [
          'id',
          'subject',
          'from',
          'toRecipients',
          'receivedDateTime',
          'importance',
          'isRead',
          'body',
        ],
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
        const records = emailsResult.data.map(msg => [
          msg.id,
          msg.subject,
          msg.from,
          msg.toRecipients.join(';'),
          msg.receivedDateTime,
          msg.importance,
          msg.isRead,
        ]);

        const content = stringify(records, {
          header: true,
          columns: [
            'id',
            'subject',
            'from',
            'toRecipients',
            'receivedDateTime',
            'importance',
            'isRead',
          ],
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

      // Get user profile and calendar events in parallel
      const [profileResult, eventsResult] = await Promise.all([
        this.azureClient.getProfile(),
        this.azureClient.getCalendarEvents({
          startTime: startDateStr,
          endTime: endDateStr,
        }),
      ]);

      if (eventsResult.success && eventsResult.data) {
        const records = eventsResult.data.map(event => [
          event.id,
          event.subject,
          this.formatDateTime(event.start, event.startTimeZone),
          this.formatDateTime(event.end, event.endTimeZone),
          event.location,
          event.attendees.join(';'),
          event.organizer,
          event.importance,
          event.body,
        ]);

        const content = stringify(records, {
          header: true,
          columns: [
            'id',
            'subject',
            'start',
            'end',
            'location',
            'attendees',
            'organizer',
            'importance',
            'body',
          ],
        });

        // Add user info header if profile was successfully retrieved
        let responseText = content;
        if (profileResult.success && profileResult.data) {
          const userInfo = `Calendar for: ${profileResult.data.displayName} (${profileResult.data.mail || profileResult.data.userPrincipalName})\n\n`;
          responseText = userInfo + content;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText,
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

  private async handleGetEmailsAndCalendar(
    args: GetEmailsAndCalendarArgs
  ): Promise<ToolResponse> {
    const { days = 14 } = args;

    try {
      // Call both email and calendar methods in parallel for efficiency
      const [emailsResult, calendarResult] = await Promise.all([
        this.handleGetLatestEmails({ days }),
        this.handleGetUpcomingCalendar({ days: Math.min(days, 30) }), // Cap calendar to 30 days max
      ]);

      // Check if both operations succeeded
      if (emailsResult.isError && calendarResult.isError) {
        return {
          content: [
            {
              type: 'text',
              text: `Both email and calendar retrieval failed:\nEmails: ${emailsResult.content[0]?.text}\nCalendar: ${calendarResult.content[0]?.text}`,
            },
          ],
          isError: true,
        };
      }

      // Combine results with clear section headers
      let combinedText = '';

      // Add emails section
      if (!emailsResult.isError && emailsResult.content[0]?.text) {
        combinedText += '=== LATEST EMAILS ===\n';
        combinedText += emailsResult.content[0].text;
        combinedText += '\n\n';
      } else if (emailsResult.isError) {
        combinedText += '=== LATEST EMAILS ===\n';
        combinedText += `Error: ${emailsResult.content[0]?.text}\n\n`;
      }

      // Add calendar section
      if (!calendarResult.isError && calendarResult.content[0]?.text) {
        combinedText += '=== UPCOMING CALENDAR ===\n';
        combinedText += calendarResult.content[0].text;
      } else if (calendarResult.isError) {
        combinedText += '=== UPCOMING CALENDAR ===\n';
        combinedText += `Error: ${calendarResult.content[0]?.text}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: combinedText.trim(),
          },
        ],
        isError: emailsResult.isError && calendarResult.isError, // Only error if both failed
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting emails and calendar: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
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
