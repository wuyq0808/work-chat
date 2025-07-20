import Anthropic from '@anthropic-ai/sdk';
import type { AIRequest } from '../services/llmService.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-beta': 'mcp-client-2025-04-04',
  },
});

export async function callClaude(request: AIRequest): Promise<string> {
  try {
    const mcpServers = [];

    // Add Slack MCP if token provided
    if (request.slackToken) {
      if (!process.env.SLACK_MCP_SERVER_URL) {
        throw new Error(
          'SLACK_MCP_SERVER_URL environment variable is required'
        );
      }
      mcpServers.push({
        type: 'url',
        url: process.env.SLACK_MCP_SERVER_URL,
        name: 'slack-mcp',
        authorization_token: `${process.env.API_KEY} ${request.slackToken}`,
      });
    }

    // Add Azure MCP if token provided
    if (request.azureToken) {
      if (!process.env.AZURE_MCP_SERVER_URL) {
        throw new Error(
          'AZURE_MCP_SERVER_URL environment variable is required'
        );
      }
      mcpServers.push({
        type: 'url',
        url: process.env.AZURE_MCP_SERVER_URL,
        name: 'azure-mcp',
        authorization_token: `${process.env.API_KEY} ${request.azureToken}`,
      });
    }

    // Add Atlassian MCP if token provided
    if (request.atlassianToken) {
      if (!process.env.ATLASSIAN_MCP_SERVER_URL) {
        throw new Error(
          'ATLASSIAN_MCP_SERVER_URL environment variable is required'
        );
      }
      mcpServers.push({
        type: 'url',
        url: process.env.ATLASSIAN_MCP_SERVER_URL,
        name: 'atlassian-mcp',
        authorization_token: `${process.env.API_KEY} ${request.atlassianToken}`,
      });
    }

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: request.input }],
      mcp_servers: mcpServers,
    } as any);

    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('\n');

    return output || 'No response generated';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}
