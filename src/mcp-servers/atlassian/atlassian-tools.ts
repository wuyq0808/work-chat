import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AtlassianAPIClient } from './atlassian-client.js';
import { subDays, format, parseISO } from 'date-fns';
import { stringify } from 'csv-stringify/sync';

interface SearchJiraIssuesArgs {
  query?: string;
  assignee?: string;
  status?: string;
  maxResults?: number;
}

interface SearchConfluencePagesArgs {
  query?: string;
  maxResults?: number;
}

interface SearchConfluenceSpacesArgs {
  query: string;
  maxResults?: number;
}

interface GetUserLatestIssuesArgs {
  days?: number;
}

interface GetLatestConfluencePagesArgs {
  days?: number;
  maxResults?: number;
  includeUserMentions?: boolean;
}

interface GetLatestActivityArgs {
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

export class AtlassianTools {
  private atlassianClient: AtlassianAPIClient;
  private tools: StructuredTool[];

  constructor(atlassianClient: AtlassianAPIClient) {
    this.atlassianClient = atlassianClient;
    this.tools = this.createTools();
  }

  // Create DynamicStructuredTool instances
  private createTools(): StructuredTool[] {
    return [
      tool(
        async input =>
          this.formatToolResponse(await this.handleSearchJiraIssues(input)),
        {
          name: 'atlassian__search_jira_issues',
          description:
            'Search for Jira issues - returns detailed content including descriptions',
          schema: z.object({
            query: z
              .string()
              .optional()
              .describe('Search query for issue summary or description'),
            assignee: z
              .string()
              .optional()
              .describe(
                'Filter by assignee (use "currentUser()" for current user)'
              ),
            status: z
              .string()
              .optional()
              .describe('Filter by status (e.g., "Done", "In Progress")'),
            maxResults: z
              .number()
              .optional()
              .describe('Maximum number of results to return (default: 10)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleGetUserLatestIssues(input)),
        {
          name: 'atlassian__jira_get_latest_issues',
          description:
            "Get user's latest Jira issues from the last N days - includes issues where user is mentioned (returns metadata only, no content)",
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
          this.formatToolResponse(
            await this.handleSearchConfluencePages(input)
          ),
        {
          name: 'atlassian__search_confluence_pages',
          description:
            'Search for Confluence pages using CQL (Confluence Query Language)',
          schema: z.object({
            query: z
              .string()
              .optional()
              .describe(
                'Search query for page titles or content (simple text search)'
              ),
            maxResults: z
              .number()
              .optional()
              .describe('Maximum number of results to return (default: 10)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(
            await this.handleSearchConfluenceSpaces(input)
          ),
        {
          name: 'atlassian__search_confluence_spaces',
          description: 'Search for Confluence spaces',
          schema: z.object({
            query: z.string().describe('Search query for space names or keys'),
            maxResults: z
              .number()
              .optional()
              .describe('Maximum number of results to return (default: 10)'),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(
            await this.handleGetLatestConfluencePages(input)
          ),
        {
          name: 'atlassian__confluence_get_latest_pages',
          description:
            'Get latest Confluence pages and comments with excerpts - includes content where user is mentioned',
          schema: z.object({
            days: z
              .number()
              .optional()
              .describe('Number of days to look back (default: 14)'),
            maxResults: z
              .number()
              .optional()
              .describe('Maximum number of results to return (default: 10)'),
            includeUserMentions: z
              .boolean()
              .optional()
              .describe(
                'Include pages where current user is mentioned (default: true)'
              ),
          }),
        }
      ),

      tool(
        async input =>
          this.formatToolResponse(await this.handleGetLatestActivity(input)),
        {
          name: 'atlassian__get_latest_activity',
          description:
            'Get latest activity from both Jira issues and Confluence pages in parallel - provides comprehensive overview of recent activity',
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

  private async handleSearchJiraIssues(
    args: SearchJiraIssuesArgs
  ): Promise<ToolResponse> {
    const { query, assignee, status, maxResults = 10 } = args;

    // Build JQL query with proper syntax
    const conditions = [];
    if (query) {
      conditions.push(`(summary ~ "${query}" OR description ~ "${query}")`);
    }
    if (assignee) {
      conditions.push(`assignee = "${assignee}"`);
    }
    if (status) {
      conditions.push(`status = "${status}"`);
    }

    let jqlQuery = conditions.join(' AND ');
    if (jqlQuery) {
      jqlQuery += ' ORDER BY updated DESC';
    } else {
      jqlQuery = 'ORDER BY updated DESC';
    }

    const searchResult = await this.atlassianClient.searchJiraIssues(
      jqlQuery,
      maxResults
    );

    if (searchResult.success && searchResult.data) {
      const issues = searchResult.data.issues;

      const records = issues.map(issue => {
        const assignee = issue.fields.assignee?.displayName || 'Unassigned';
        const reporter = issue.fields.reporter?.displayName || 'Unknown';
        const priority = issue.fields.priority?.name || 'Unknown';
        const created = format(parseISO(issue.fields.created), 'yyyy-MM-dd');
        const updated = format(parseISO(issue.fields.updated), 'yyyy-MM-dd');

        // Get epic information from parent field
        const epicKey = issue.fields.parent?.key || '';
        const epicSummary = issue.fields.parent?.fields.summary || '';

        // Get description content, clean it up for CSV
        const description = issue.fields.description || '';

        return [
          issue.key,
          issue.fields.summary,
          description,
          issue.fields.status.name,
          assignee,
          reporter,
          priority,
          created,
          updated,
          epicKey,
          epicSummary,
        ];
      });

      const content = stringify(records, {
        header: true,
        columns: [
          'key',
          'summary',
          'description',
          'status',
          'assignee',
          'reporter',
          'priority',
          'created',
          'updated',
          'epic_key',
          'epic_summary',
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
            text: `Error searching Jira issues: ${searchResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetUserLatestIssues(
    args: GetUserLatestIssuesArgs
  ): Promise<ToolResponse> {
    const { days = 14 } = args;

    try {
      // Calculate date range (last N days)
      const startDate = subDays(new Date(), days);

      // Format date for JQL (yyyy-MM-dd format as required by Jira)
      const startDateStr = format(startDate, 'yyyy-MM-dd');

      // Create JQL query for issues updated in the last N days for current user
      // Include issues where user is mentioned in comments or description
      const jql = `(assignee = currentUser() OR reporter = currentUser() OR comment ~ currentUser() OR description ~ currentUser()) AND updated >= "${startDateStr}" ORDER BY updated DESC`;

      const searchResult = await this.atlassianClient.searchJiraIssues(
        jql,
        100
      );

      if (searchResult.success && searchResult.data) {
        const issues = searchResult.data.issues;

        const records = issues.map(issue => {
          const assignee = issue.fields.assignee?.displayName || 'Unassigned';
          const reporter = issue.fields.reporter?.displayName || 'Unknown';
          const priority = issue.fields.priority?.name || 'Unknown';
          const created = format(parseISO(issue.fields.created), 'yyyy-MM-dd');
          const updated = format(parseISO(issue.fields.updated), 'yyyy-MM-dd');

          // Get epic information from parent field
          const epicKey = issue.fields.parent?.key || '';
          const epicSummary = issue.fields.parent?.fields.summary || '';

          return [
            issue.key,
            issue.fields.summary,
            issue.fields.status.name,
            assignee,
            reporter,
            priority,
            created,
            updated,
            epicKey,
            epicSummary,
          ];
        });

        const content = stringify(records, {
          header: true,
          columns: [
            'key',
            'summary',
            'status',
            'assignee',
            'reporter',
            'priority',
            'created',
            'updated',
            'epic_key',
            'epic_summary',
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
              text: `Error searching Jira issues: ${searchResult.error}`,
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
            text: `Error searching Jira issues by days: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchConfluencePages(
    args: SearchConfluencePagesArgs
  ): Promise<ToolResponse> {
    const { query, maxResults = 10 } = args;

    // Build CQL query with ordering
    let cqlQuery = '';
    if (query) {
      cqlQuery = `title ~ "${query}" OR text ~ "${query}"`;
    }

    if (cqlQuery) {
      cqlQuery += ' ORDER BY lastModified DESC';
    } else {
      cqlQuery = 'ORDER BY lastModified DESC';
    }

    const searchResult = await this.atlassianClient.searchConfluenceContent(
      { cql: cqlQuery },
      maxResults
    );

    if (searchResult.success && searchResult.data) {
      const searchItems = searchResult.data.results;
      const baseUrl = searchResult.data._links?.base;

      if (searchItems.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No Confluence pages found matching the search criteria.',
            },
          ],
        };
      }

      const records = searchItems.map(item => {
        const page = item.content;
        const spaceKey = page?.space?.key || '';
        const spaceName = page?.space?.name || '';
        const url = item.url && baseUrl ? `${baseUrl}${item.url}` : '';
        const lastModified = item.lastModified
          ? new Date(item.lastModified).toISOString().split('T')[0]
          : '';
        const excerpt = item.excerpt || '';

        const spaceDisplay =
          spaceKey && spaceName
            ? `${spaceKey} (${spaceName})`
            : spaceKey || spaceName || '';

        return [
          page?.id || '',
          item.title,
          page?.type || '',
          spaceDisplay,
          url,
          lastModified,
          excerpt,
        ];
      });

      const content = stringify(records, {
        header: true,
        columns: [
          'id',
          'title',
          'type',
          'space',
          'url',
          'last_modified',
          'excerpt',
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
            text: `Error searching Confluence pages: ${searchResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchConfluenceSpaces(
    args: SearchConfluenceSpacesArgs
  ): Promise<ToolResponse> {
    const { query, maxResults = 10 } = args;

    const searchResult = await this.atlassianClient.searchConfluenceSpaces(
      query,
      maxResults
    );

    if (searchResult.success && searchResult.data) {
      const spaces = searchResult.data.results;

      if (spaces.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No Confluence spaces found matching the search criteria.',
            },
          ],
        };
      }

      let content = 'key,name,type,status,description\n';

      for (const space of spaces) {
        const description = space.description?.plain?.value || 'No description';
        const cleanDescription = description
          .replace(/"/g, '""')
          .substring(0, 100);

        content += `"${space.key}","${space.name}","${space.type}","${space.status}","${cleanDescription}"\n`;
      }

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
            text: `Error searching Confluence spaces: ${searchResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetLatestConfluencePages(
    args: GetLatestConfluencePagesArgs
  ): Promise<ToolResponse> {
    const { days = 14, maxResults = 10, includeUserMentions = true } = args;

    try {
      // Calculate date range (last N days)
      const startDate = subDays(new Date(), days);
      const startDateStr = format(startDate, 'yyyy-MM-dd');

      // Build CQL query for pages and comments updated in the last N days
      let cqlQuery = `(type = page OR type = comment) AND lastModified >= "${startDateStr}"`;

      // Add user mention search if enabled
      if (includeUserMentions) {
        cqlQuery += ` AND (mention = currentUser() OR creator = currentUser())`;
      }

      cqlQuery += ' ORDER BY lastModified DESC';

      const searchResult = await this.atlassianClient.searchConfluenceContent(
        { cql: cqlQuery },
        maxResults
      );

      if (searchResult.success && searchResult.data) {
        const searchItems = searchResult.data.results;
        const baseUrl = searchResult.data._links?.base;

        if (searchItems.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No Confluence pages found matching the criteria.',
              },
            ],
          };
        }

        const records = searchItems.map(item => {
          const page = item.content;
          const spaceKey = page?.space?.key || '';
          const spaceName = page?.space?.name || '';
          const url = item.url && baseUrl ? `${baseUrl}${item.url}` : '';
          const lastModified = item.lastModified
            ? format(parseISO(item.lastModified), 'yyyy-MM-dd')
            : '';

          // Use excerpt as content preview
          const excerpt = item.excerpt || '';

          return [
            page?.id || '',
            item.title,
            page?.type || '',
            spaceKey && spaceName
              ? `${spaceKey} (${spaceName})`
              : spaceKey || spaceName || '',
            url,
            lastModified,
            excerpt,
          ];
        });

        const content = stringify(records, {
          header: true,
          columns: [
            'id',
            'title',
            'type',
            'space',
            'url',
            'last_modified',
            'excerpt',
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
              text: `Error searching latest Confluence pages: ${searchResult.error}`,
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
            text: `Error getting latest Confluence pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleGetLatestActivity(
    args: GetLatestActivityArgs
  ): Promise<ToolResponse> {
    const { days = 14 } = args;

    try {
      // Call both Jira and Confluence tools in parallel
      const [jiraResult, confluenceResult] = await Promise.all([
        this.handleGetUserLatestIssues({ days }),
        this.handleGetLatestConfluencePages({
          days,
          maxResults: 10,
          includeUserMentions: true,
        }),
      ]);

      // Check if both calls were successful
      if (jiraResult.isError && confluenceResult.isError) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting latest activity:\nJira: ${jiraResult.content[0]?.text}\nConfluence: ${confluenceResult.content[0]?.text}`,
            },
          ],
          isError: true,
        };
      }

      // Combine results
      let combinedText = '';

      // Add Jira results
      if (!jiraResult.isError && jiraResult.content[0]?.text) {
        combinedText += '# Latest Jira Issues\n\n';
        combinedText += jiraResult.content[0].text;
        combinedText += '\n\n';
      } else if (jiraResult.isError) {
        combinedText += '# Latest Jira Issues\n\n';
        combinedText += `Error: ${jiraResult.content[0]?.text}\n\n`;
      }

      // Add Confluence results
      if (!confluenceResult.isError && confluenceResult.content[0]?.text) {
        combinedText += '# Latest Confluence Pages\n\n';
        combinedText += confluenceResult.content[0].text;
      } else if (confluenceResult.isError) {
        combinedText += '# Latest Confluence Pages\n\n';
        combinedText += `Error: ${confluenceResult.content[0]?.text}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: combinedText.trim(),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting latest activity: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }
}
