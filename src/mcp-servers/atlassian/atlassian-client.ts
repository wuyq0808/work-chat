export interface AtlassianConfig {
  accessToken: string;
  cloudId?: string;
}

export interface AtlassianApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    };
    reporter?: {
      displayName: string;
    };
    priority?: {
      name: string;
    };
    created: string;
    updated: string;
  };
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
}

export interface ConfluencePage {
  id: string;
  title: string;
  type: string;
  space?: {
    key: string;
    name: string;
  };
  version?: {
    when: string;
  };
  _links?: {
    webui: string;
  };
  excerpt?: string;
}

export interface ConfluenceSpace {
  key: string;
  name: string;
  type: string;
  status: string;
  description?: {
    plain?: {
      value: string;
    };
  };
}

export interface ConfluenceSpaceSearchResult {
  results: ConfluenceSpace[];
  size: number;
}

export interface ConfluenceSearchOptions {
  query?: string;
  cql?: string;
  space?: string;
  type?: string;
}

export interface ConfluenceSearchResult {
  results: ConfluencePage[];
  size: number;
}

export interface AtlassianResource {
  id: string;
  name: string;
  scopes: string[];
}

export class AtlassianAPIClient {
  private accessToken: string;
  private cloudId: string | null = null;

  constructor(config: AtlassianConfig) {
    this.accessToken = config.accessToken;
    this.cloudId = config.cloudId || null;
  }

  // Get accessible resources to find cloud ID
  async getAccessibleResources(): Promise<
    AtlassianApiResponse<AtlassianResource[]>
  > {
    try {
      const response = await globalThis.fetch(
        'https://api.atlassian.com/oauth/token/accessible-resources',
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to get accessible resources: ${response.status} ${errorText}`,
        };
      }

      const resources = await response.json();

      // Set the first cloud ID if not already set
      if (!this.cloudId && resources.length > 0) {
        this.cloudId = resources[0].id;
      }

      return {
        success: true,
        data: resources,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error getting accessible resources: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Search Jira issues using JQL
  async searchJiraIssues(
    jql: string,
    maxResults: number = 10
  ): Promise<AtlassianApiResponse<JiraSearchResult>> {
    try {
      // Ensure we have a cloud ID
      if (!this.cloudId) {
        const resourcesResult = await this.getAccessibleResources();
        if (
          !resourcesResult.success ||
          !resourcesResult.data ||
          resourcesResult.data.length === 0
        ) {
          return {
            success: false,
            error: 'No accessible Atlassian resources found',
          };
        }
      }

      const response = await globalThis.fetch(
        `https://api.atlassian.com/ex/jira/${this.cloudId}/rest/api/3/search`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            jql,
            maxResults,
            fields: [
              'summary',
              'status',
              'assignee',
              'reporter',
              'priority',
              'created',
              'updated',
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to search Jira issues: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error searching Jira issues: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Search Confluence content with advanced CQL support
  async searchConfluenceContent(
    options: ConfluenceSearchOptions,
    maxResults: number = 10
  ): Promise<AtlassianApiResponse<ConfluenceSearchResult>> {
    try {
      // Ensure we have a cloud ID
      if (!this.cloudId) {
        const resourcesResult = await this.getAccessibleResources();
        if (
          !resourcesResult.success ||
          !resourcesResult.data ||
          resourcesResult.data.length === 0
        ) {
          return {
            success: false,
            error: 'No accessible Atlassian resources found',
          };
        }
      }

      let cqlQuery: string;

      if (options.cql) {
        // Use provided CQL query directly
        cqlQuery = options.cql;
      } else {
        // Build CQL query from options
        const cqlParts: string[] = [];

        // Add type filter
        if (options.type) {
          cqlParts.push(`type = ${options.type}`);
        } else {
          cqlParts.push('type = page'); // Default to pages
        }

        // Add space filter
        if (options.space) {
          cqlParts.push(`space = "${options.space}"`);
        }

        // Add text search
        if (options.query) {
          cqlParts.push(
            `(title ~ "${options.query}" OR text ~ "${options.query}")`
          );
        }

        cqlQuery = cqlParts.join(' AND ');
      }

      const response = await globalThis.fetch(
        `https://api.atlassian.com/ex/confluence/${this.cloudId}/rest/api/search?cql=${encodeURIComponent(cqlQuery)}&limit=${maxResults}&expand=space,version,excerpt`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to search Confluence content: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error searching Confluence content: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Search Confluence spaces
  async searchConfluenceSpaces(
    query: string,
    maxResults: number = 10
  ): Promise<AtlassianApiResponse<ConfluenceSpaceSearchResult>> {
    try {
      // Ensure we have a cloud ID
      if (!this.cloudId) {
        const resourcesResult = await this.getAccessibleResources();
        if (
          !resourcesResult.success ||
          !resourcesResult.data ||
          resourcesResult.data.length === 0
        ) {
          return {
            success: false,
            error: 'No accessible Atlassian resources found',
          };
        }
      }

      const response = await globalThis.fetch(
        `https://api.atlassian.com/ex/confluence/${this.cloudId}/rest/api/space?limit=${maxResults}&expand=description.plain`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Failed to search Confluence spaces: ${response.status} ${errorText}`,
        };
      }

      const result = await response.json();

      // Filter spaces by query if provided
      if (query) {
        const filteredResults = result.results.filter(
          (space: ConfluenceSpace) =>
            space.name.toLowerCase().includes(query.toLowerCase()) ||
            space.key.toLowerCase().includes(query.toLowerCase())
        );
        result.results = filteredResults;
        result.size = filteredResults.length;
      }

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      return {
        success: false,
        error: `Error searching Confluence spaces: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  // Legacy method for backward compatibility
  async searchConfluencePages(
    query: string,
    maxResults: number = 10
  ): Promise<AtlassianApiResponse<ConfluenceSearchResult>> {
    return this.searchConfluenceContent({ query }, maxResults);
  }
}
