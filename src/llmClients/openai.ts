import OpenAI from 'openai';
import type { AIRequest } from '../services/llmService.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function callOpenAI(request: AIRequest): Promise<string> {
  try {
    const tools = [];

    // Add Slack MCP if token provided
    if (request.slackToken) {
      if (!process.env.SLACK_MCP_SERVER_URL) {
        throw new Error(
          'SLACK_MCP_SERVER_URL environment variable is required'
        );
      }
      tools.push({
        type: 'mcp' as const,
        server_label: 'slack-mcp',
        server_url: process.env.SLACK_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer ${process.env.API_KEY} ${request.slackToken}`,
        },
        require_approval: 'never' as const,
      });
    }

    // Add Azure MCP if token provided
    if (request.azureToken) {
      if (!process.env.AZURE_MCP_SERVER_URL) {
        throw new Error(
          'AZURE_MCP_SERVER_URL environment variable is required'
        );
      }
      tools.push({
        type: 'mcp' as const,
        server_label: 'azure-mcp',
        server_url: process.env.AZURE_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer ${process.env.API_KEY} ${request.azureToken}`,
        },
        require_approval: 'never' as const,
      });
    }

    // Add Atlassian MCP if token provided
    if (request.atlassianToken) {
      if (!process.env.ATLASSIAN_MCP_SERVER_URL) {
        throw new Error(
          'ATLASSIAN_MCP_SERVER_URL environment variable is required'
        );
      }
      tools.push({
        type: 'mcp' as const,
        server_label: 'atlassian-mcp',
        server_url: process.env.ATLASSIAN_MCP_SERVER_URL,
        headers: {
          Authorization: `Bearer ${process.env.API_KEY} ${request.atlassianToken}`,
        },
        require_approval: 'never' as const,
      });
    }

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: request.input,
      tools,
    });

    return response.output_text || 'No response generated';
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}