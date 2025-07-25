import { Client } from '@microsoft/microsoft-graph-client';

export interface AzureConfig {
  accessToken: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AzureUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  mail?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
}

export interface AzureMessage {
  id: string;
  subject: string;
  body?: string;
  from: string;
  toRecipients: string[];
  receivedDateTime: string;
  importance: string;
  isRead: boolean;
}

export interface AzureCalendarEvent {
  id: string;
  subject: string;
  body: string;
  start: string;
  end: string;
  startTimeZone: string;
  endTimeZone: string;
  location: string;
  attendees: string[];
  organizer: string;
  importance: string;
}

export class AzureAPIClient {
  private client: Client;
  private config: AzureConfig;

  constructor(config: AzureConfig) {
    this.config = config;
    this.client = Client.init({
      authProvider: async done => {
        done(null, config.accessToken);
      },
    });
  }

  async getProfile(): Promise<ApiResponse<AzureUser>> {
    try {
      const user = await this.client.api('/me').get();
      return {
        success: true,
        data: {
          id: user.id,
          displayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          mail: user.mail,
          jobTitle: user.jobTitle,
          department: user.department,
          officeLocation: user.officeLocation,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch profile',
      };
    }
  }

  async getMessageTitles(options: {
    limit?: number;
    filter?: string;
    search?: string;
  }): Promise<ApiResponse<AzureMessage[]>> {
    try {
      let query = this.client
        .api('/me/messages')
        // Exclude body content from bulk queries for efficiency
        .select(
          'id,subject,from,toRecipients,receivedDateTime,importance,isRead'
        );

      if (options.limit) {
        query = query.top(options.limit);
      }

      if (options.filter) {
        query = query.filter(options.filter);
      }

      if (options.search) {
        query = query.search(options.search);
      }

      const response = await query.get();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: AzureMessage[] = response.value.map((msg: any) => ({
        // Microsoft Graph API response format is complex
        id: msg.id,
        subject: msg.subject,
        from: msg.from?.emailAddress?.address || '',
        toRecipients:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          msg.toRecipients?.map((r: any) => r.emailAddress?.address) || [], // Graph API recipient structure varies
        receivedDateTime: msg.receivedDateTime,
        importance: msg.importance,
        isRead: msg.isRead,
      }));

      return {
        success: true,
        data: messages,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch messages',
      };
    }
  }

  async getMessageContent(
    messageId: string
  ): Promise<ApiResponse<AzureMessage>> {
    try {
      const response = await this.client
        .api(`/me/messages/${messageId}`)
        // Include body content for individual message requests
        .select(
          'id,subject,body,from,toRecipients,receivedDateTime,importance,isRead'
        )
        .get();

      const message: AzureMessage = {
        id: response.id,
        subject: response.subject,
        body: response.body?.content || '',
        from: response.from?.emailAddress?.address || '',
        toRecipients:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          response.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
        receivedDateTime: response.receivedDateTime,
        importance: response.importance,
        isRead: response.isRead,
      };

      return {
        success: true,
        data: message,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch message content',
      };
    }
  }

  async getCalendarEvents(options: {
    limit?: number;
    startTime?: string;
    endTime?: string;
  }): Promise<ApiResponse<AzureCalendarEvent[]>> {
    try {
      let query = this.client
        .api('/me/calendarView')
        .select(
          'id,subject,start,end,location,recurrence,seriesMasterId,organizer,attendees,importance,body'
        );

      if (options.limit) {
        query = query.top(options.limit);
      }

      // CalendarView requires startDateTime and endDateTime as query parameters
      if (options.startTime && options.endTime) {
        query = query.query({
          startDateTime: options.startTime,
          endDateTime: options.endTime,
        });
      }

      const response = await query.get();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const events: AzureCalendarEvent[] = response.value.map((event: any) => ({
        // Microsoft Graph API event format is complex
        id: event.id,
        subject: event.subject,
        body: event.body?.content || '',
        start: event.start?.dateTime,
        end: event.end?.dateTime,
        startTimeZone: event.start?.timeZone || 'UTC',
        endTimeZone: event.end?.timeZone || 'UTC',
        location: event.location?.displayName || '',
        attendees:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          event.attendees?.map((a: any) => a.emailAddress?.address) || [], // Graph API attendee structure varies
        organizer: event.organizer?.emailAddress?.address || '',
        importance: event.importance,
      }));

      return {
        success: true,
        data: events,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch calendar events',
      };
    }
  }

  async searchEmails(options: {
    query?: string;
    limit?: number;
  }): Promise<ApiResponse<AzureMessage[]>> {
    try {
      if (options.query) {
        // Use Search API for keyword-based search
        const searchRequest = {
          requests: [
            {
              entityTypes: ['message'],
              query: {
                queryString: options.query,
              },
              from: 0,
              size: options.limit || 25,
            },
          ],
        };

        const response = await this.client
          .api('/search/query')
          .post(searchRequest);

        if (!response.value || !response.value[0].hitsContainers) {
          return { success: true, data: [] };
        }

        const hits = response.value[0].hitsContainers[0].hits || [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: AzureMessage[] = hits.map((hit: any) => {
          const msg = hit.resource;
          return {
            id: hit.hitId,
            subject: msg.subject || '',
            from: msg.from?.emailAddress?.address || '',
            toRecipients:
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              msg.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
            receivedDateTime: msg.receivedDateTime || '',
            importance: msg.importance || 'normal',
            isRead: msg.isRead || false,
          };
        });

        return { success: true, data: messages };
      } else {
        // Use Messages API for newest emails by time
        let query = this.client
          .api('/me/messages')
          .select(
            'id,subject,from,toRecipients,receivedDateTime,importance,isRead'
          )
          .orderby('receivedDateTime desc');

        if (options.limit) {
          query = query.top(options.limit);
        }

        const response = await query.get();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: AzureMessage[] = response.value.map((msg: any) => ({
          id: msg.id,
          subject: msg.subject || '',
          body: '', // No body content in search results
          from: msg.from?.emailAddress?.address || '',
          toRecipients:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            msg.toRecipients?.map((r: any) => r.emailAddress?.address) || [],
          receivedDateTime: msg.receivedDateTime || '',
          importance: msg.importance || 'normal',
          isRead: msg.isRead || false,
        }));

        return { success: true, data: messages };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to search emails',
      };
    }
  }
}
