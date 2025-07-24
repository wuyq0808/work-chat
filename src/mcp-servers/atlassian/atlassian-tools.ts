import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { AtlassianAPIClient } from './atlassian-client.js';
import { subDays, format, parseISO } from 'date-fns';
import { stringify } from 'csv-stringify/sync';

interface SearchJiraIssuesArgs {
  jql: string;
  maxResults?: number;
}

interface SearchConfluencePagesArgs {
  query?: string;
  cql?: string;
  space?: string;
  type?: string;
  maxResults?: number;
}

interface SearchConfluenceSpacesArgs {
  query: string;
  maxResults?: number;
}

interface GetUserLatestIssuesArgs {
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
            'Search for Jira issues using JQL (Jira Query Language) - returns detailed content including descriptions',
          schema: z.object({
            jql: z
              .string()
              .describe(
                'JQL query to search for issues (e.g., "assignee = currentUser() AND status != Done")'
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
          this.formatToolResponse(await this.handleGetUserLatestIssues(input)),
        {
          name: 'atlassian__get_user_latest_issues',
          description:
            "Get user's latest Jira issues from the last N days (returns metadata only, no content)",
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
            cql: z
              .string()
              .optional()
              .describe(
                'Advanced CQL query (e.g., "type=page AND space=PROJ AND title ~ \\"search term\\""))'
              ),
            space: z
              .string()
              .optional()
              .describe('Filter results to specific space key (e.g., "PROJ")'),
            type: z
              .enum(['page', 'blogpost', 'attachment'])
              .optional()
              .describe('Content type filter'),
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
    const { jql, maxResults = 10 } = args;

    const searchResult = await this.atlassianClient.searchJiraIssues(
      jql,
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
      const jql = `(assignee = currentUser() OR reporter = currentUser()) AND updated >= "${startDateStr}" ORDER BY updated DESC`;

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
    const { query, cql, space, type, maxResults = 10 } = args;

    const searchResult = await this.atlassianClient.searchConfluenceContent(
      { query, cql, space, type },
      maxResults
    );

    if (searchResult.success && searchResult.data) {
      const pages = searchResult.data.results;

      if (pages.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No Confluence pages found matching the search criteria.',
            },
          ],
        };
      }

      let content = 'id,title,type,space,url,lastModified,excerpt\n';

      for (const page of pages) {
        const spaceKey = page.space?.key || 'Unknown';
        const spaceName = page.space?.name || 'Unknown';
        const url = page._links?.webui
          ? `https://your-domain.atlassian.net${page._links.webui}`
          : 'No URL';
        const lastModified = page.version?.when
          ? new Date(page.version.when).toISOString().split('T')[0]
          : 'Unknown';
        const excerpt = page.excerpt
          ? page.excerpt.replace(/"/g, '""').substring(0, 100) + '...'
          : 'No excerpt';

        content += `${page.id},"${page.title}","${page.type}","${spaceKey} (${spaceName})","${url}",${lastModified},"${excerpt}"\n`;
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
}
