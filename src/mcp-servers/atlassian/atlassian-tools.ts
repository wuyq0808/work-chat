import { AtlassianMCPClient } from './atlassian-client.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  [key: string]: unknown; // Index signature for MCP compatibility
}

export class AtlassianToolHandlers {
  private atlassianClient: AtlassianMCPClient;

  constructor(atlassianClient: AtlassianMCPClient) {
    this.atlassianClient = atlassianClient;
  }

  // Get all tool definitions
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_jira_issues',
        description: 'Search for Jira issues using JQL (Jira Query Language)',
        inputSchema: {
          type: 'object',
          properties: {
            jql: {
              type: 'string',
              description:
                'JQL query to search for issues (e.g., "assignee = currentUser() AND status != Done")',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: ['jql'],
        },
      },
      {
        name: 'search_confluence_pages',
        description:
          'Search for Confluence pages using CQL (Confluence Query Language)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                'Search query for page titles or content (simple text search)',
            },
            cql: {
              type: 'string',
              description:
                'Advanced CQL query (e.g., "type=page AND space=PROJ AND title ~ \\"search term\\"")',
            },
            space: {
              type: 'string',
              description:
                'Filter results to specific space key (e.g., "PROJ")',
            },
            type: {
              type: 'string',
              description:
                'Content type filter: "page", "blogpost", or "attachment"',
              enum: ['page', 'blogpost', 'attachment'],
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: [],
        },
      },
      {
        name: 'search_confluence_spaces',
        description: 'Search for Confluence spaces',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for space names or keys',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  // Execute a tool by name
  async executeTool(name: string, args: any): Promise<ToolResponse> {
    try {
      switch (name) {
        case 'search_jira_issues':
          return await this.handleSearchJiraIssues(args);

        case 'search_confluence_pages':
          return await this.handleSearchConfluencePages(args);

        case 'search_confluence_spaces':
          return await this.handleSearchConfluenceSpaces(args);

        default:
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
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
            text: `Error executing tool ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchJiraIssues(args: any): Promise<ToolResponse> {
    const { jql, maxResults = 10 } = args as {
      jql: string;
      maxResults?: number;
    };

    const searchResult = await this.atlassianClient.searchJiraIssues(
      jql,
      maxResults
    );

    if (searchResult.success && searchResult.data) {
      const issues = searchResult.data.issues;
      let content =
        'key,summary,status,assignee,reporter,priority,created,updated\n';

      for (const issue of issues) {
        const assignee = issue.fields.assignee?.displayName || 'Unassigned';
        const reporter = issue.fields.reporter?.displayName || 'Unknown';
        const priority = issue.fields.priority?.name || 'Unknown';
        const created = new Date(issue.fields.created)
          .toISOString()
          .split('T')[0];
        const updated = new Date(issue.fields.updated)
          .toISOString()
          .split('T')[0];

        content += `${issue.key},"${issue.fields.summary}","${issue.fields.status.name}","${assignee}","${reporter}","${priority}",${created},${updated}\n`;
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
            text: `Error searching Jira issues: ${searchResult.error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchConfluencePages(args: any): Promise<ToolResponse> {
    const {
      query,
      cql,
      space,
      type,
      maxResults = 10,
    } = args as {
      query?: string;
      cql?: string;
      space?: string;
      type?: string;
      maxResults?: number;
    };

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

  private async handleSearchConfluenceSpaces(args: any): Promise<ToolResponse> {
    const { query, maxResults = 10 } = args as {
      query: string;
      maxResults?: number;
    };

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
