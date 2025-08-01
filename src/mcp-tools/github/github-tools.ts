import { tool, StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { GitHubAPIClient } from './github-client.js';

interface GitHubSearchArgs {
  query: string;
  maxResults?: number;
}

interface GitHubFileContentArgs {
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}

interface GitHubRepositoryTreeArgs {
  owner: string;
  repo: string;
  ref?: string;
  recursive?: boolean;
}

export class GitHubTools {
  private githubClient: GitHubAPIClient;
  private tools: StructuredTool[];

  constructor(githubClient: GitHubAPIClient) {
    this.githubClient = githubClient;
    this.tools = this.createTools();
  }

  getTools(): StructuredTool[] {
    return this.tools;
  }

  private createTools(): StructuredTool[] {
    return [
      tool(
        async (args: GitHubSearchArgs): Promise<string> => {
          return this.search(args);
        },
        {
          name: 'github__search',
          description:
            'Search private GitHub repositories for code, issues, and pull requests.',
          schema: z.object({
            query: z.string().describe('Search query keywords'),
            maxResults: z
              .number()
              .optional()
              .default(10)
              .describe(
                'Maximum number of results to return (1-100, default: 10)'
              ),
          }),
        }
      ),

      tool(
        async (args: GitHubFileContentArgs): Promise<string> => {
          return this.getFileContent(args);
        },
        {
          name: 'github__get_file_content',
          description:
            'Get the full content of a specific file from a GitHub repository.',
          schema: z.object({
            owner: z
              .string()
              .describe('Repository owner (username or organization)'),
            repo: z.string().describe('Repository name'),
            path: z.string().describe('File path within the repository'),
            ref: z
              .string()
              .optional()
              .describe('Branch, tag, or commit SHA (default: default branch)'),
          }),
        }
      ),

      tool(
        async (args: GitHubRepositoryTreeArgs): Promise<string> => {
          return this.getRepositoryTree(args);
        },
        {
          name: 'github__get_repository_tree',
          description:
            'Get the folder structure and file tree of a GitHub repository.',
          schema: z.object({
            owner: z
              .string()
              .describe('Repository owner (username or organization)'),
            repo: z.string().describe('Repository name'),
            ref: z
              .string()
              .optional()
              .describe('Branch, tag, or commit SHA (default: default branch)'),
            recursive: z
              .boolean()
              .optional()
              .default(false)
              .describe(
                'Get full recursive tree structure (default: false, shows top level only)'
              ),
          }),
        }
      ),
    ];
  }

  private async search(args: GitHubSearchArgs): Promise<string> {
    const { query, maxResults = 10 } = args;

    // Always search private repositories only
    const searchQuery = `${query} is:private`;

    // Search both code and issues/PRs in parallel
    const [codeResult, issuesResult] = await Promise.allSettled([
      this.searchCodeInternal({ query: searchQuery, maxResults }),
      this.searchIssuesInternal({
        query: searchQuery,
        maxResults,
      }),
    ]);

    let combinedResults = '';

    // Add code search results
    if (
      codeResult.status === 'fulfilled' &&
      !codeResult.value.startsWith('Error') &&
      !codeResult.value.startsWith('No code found')
    ) {
      combinedResults +=
        '## CODE SEARCH RESULTS\n\n' + codeResult.value + '\n\n';
    }

    // Add issues/PR search results
    if (
      issuesResult.status === 'fulfilled' &&
      !issuesResult.value.startsWith('Error') &&
      !issuesResult.value.startsWith('No issues')
    ) {
      combinedResults += '## ISSUES AND PULL REQUESTS\n\n' + issuesResult.value;
    }

    return combinedResults.trim();
  }

  private async searchCodeInternal(args: {
    query: string;
    maxResults: number;
  }): Promise<string> {
    const { query, maxResults } = args;

    const result = await this.githubClient.searchCode({
      query,
      per_page: Math.min(maxResults, 100), // GitHub API limit is 100
    });

    if (!result.success || !result.data) {
      return `Error searching GitHub code: ${result.error}`;
    }

    const { data } = result;

    if (data.total_count === 0) {
      return `No code found for query: "${query}"`;
    }

    // Format the results
    const formattedResults = data.items
      .map((item, index) => {
        const repo = item.repository;
        const stars =
          repo.stargazers_count !== undefined ? repo.stargazers_count : 0;
        const repoInfo = `${repo.full_name} (${stars} stars)`;
        const fileInfo = `File: ${item.path}`;
        const language = repo.language ? `[${repo.language}]` : '';

        let textMatches = '';
        if (item.text_matches && item.text_matches.length > 0) {
          const matches = item.text_matches
            .slice(0, 2) // Show first 2 matches
            .map(match => `"${match.fragment.trim()}"`)
            .join('\n   ');
          textMatches = `\n   ${matches}`;
        }

        return `${index + 1}. ${repoInfo} ${language}
   ${fileInfo}
   URL: ${item.html_url}${textMatches}`;
      })
      .join('\n\n');

    const summary = `GITHUB CODE SEARCH RESULTS
Found ${data.total_count.toLocaleString()} code files matching "${query}"
${data.incomplete_results ? 'WARNING: Results may be incomplete due to timeout' : ''}

Top Results:
${formattedResults}`;

    return summary;
  }

  private async searchIssuesInternal(args: {
    query: string;
    maxResults: number;
  }): Promise<string> {
    const { query, maxResults } = args;

    const result = await this.githubClient.searchIssues({
      query,
      per_page: Math.min(maxResults, 100), // GitHub API limit is 100
    });

    if (!result.success || !result.data) {
      return `Error searching GitHub issues/PRs: ${result.error}`;
    }

    const { data } = result;

    if (data.total_count === 0) {
      return `No issues or pull requests found for query: "${query}"`;
    }

    // Format the results
    const formattedResults = data.items
      .map((item, index) => {
        const repoName = item.repository_url.split('/').slice(-2).join('/');
        const isPR = !!item.pull_request;
        const type = isPR ? 'PR' : 'Issue';
        const stateText = item.state === 'open' ? 'OPEN' : 'CLOSED';

        // Format labels
        const labels =
          item.labels.length > 0
            ? ' [' +
              item.labels
                .map(label => label.name)
                .slice(0, 3)
                .join(', ') +
              ']'
            : '';

        // Format assignees
        const assignees =
          item.assignees.length > 0
            ? ` Assignees: ${item.assignees
                .map(a => a.login)
                .slice(0, 2)
                .join(', ')}`
            : item.assignee
              ? ` Assignee: ${item.assignee.login}`
              : '';

        // Format dates
        const createdDate = new Date(item.created_at).toLocaleDateString();
        const updatedDate = new Date(item.updated_at).toLocaleDateString();

        return `${index + 1}. ${stateText} ${type} #${item.number} - ${repoName}
   Title: ${item.title}${labels}
   Author: @${item.user.login}${assignees}
   Created: ${createdDate} | Updated: ${updatedDate}
   URL: ${item.html_url}`;
      })
      .join('\n\n');

    const summary = `GITHUB ISSUES AND PULL REQUESTS SEARCH RESULTS
Found ${data.total_count.toLocaleString()} items matching "${query}"
${data.incomplete_results ? 'WARNING: Results may be incomplete due to timeout' : ''}

Results:
${formattedResults}`;

    return summary;
  }

  private async getFileContent(args: GitHubFileContentArgs): Promise<string> {
    const { owner, repo, path, ref } = args;

    const result = await this.githubClient.getFileContent(
      owner,
      repo,
      path,
      ref
    );

    if (!result.success || !result.data) {
      return `Error getting file content: ${result.error}`;
    }

    const file = result.data;
    const sizeKB = Math.round(file.size / 1024);

    const header = `FILE CONTENT
Repository: ${owner}/${repo}
File: ${path}
Size: ${sizeKB}KB
${ref ? `Ref: ${ref}` : ''}

CONTENT:
`;

    return header + file.content;
  }

  private async getRepositoryTree(
    args: GitHubRepositoryTreeArgs
  ): Promise<string> {
    const { owner, repo, ref, recursive = false } = args;

    const result = await this.githubClient.getRepositoryTree(
      owner,
      repo,
      ref,
      recursive
    );

    if (!result.success || !result.data) {
      return `Error getting repository tree: ${result.error}`;
    }

    const tree = result.data;

    // Sort items: directories first, then files, alphabetically
    const sortedItems = tree.tree.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'tree' ? -1 : 1; // directories first
      }
      return a.path.localeCompare(b.path);
    });

    const header = `REPOSITORY TREE STRUCTURE
Repository: ${owner}/${repo}
${ref ? `Ref: ${ref}` : ''}
${recursive ? 'Full recursive structure' : 'Top level only'}
Total items: ${tree.tree.length}${tree.truncated ? ' (truncated)' : ''}

STRUCTURE:
`;

    const treeLines = sortedItems.map(item => {
      const type = item.type === 'tree' ? 'DIR' : 'FILE';
      const size = item.size ? ` (${Math.round(item.size / 1024)}KB)` : '';
      const indent = recursive
        ? '  '.repeat(item.path.split('/').length - 1)
        : '';
      const name = recursive ? item.path.split('/').pop() : item.path;

      return `${indent}${type}: ${name}${size}`;
    });

    return header + treeLines.join('\n');
  }
}
