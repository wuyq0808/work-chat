import { StructuredTool } from '@langchain/core/tools';
import type { ToolCall } from '@langchain/core/messages/tool';
import type { ProgressCallback } from '../types/progress.js';
import type { ToolCallExecutionResult } from '../types/chat.js';
import { SlackAPIClient } from '../mcp-tools/slack/slack-client.js';
import { SlackTools } from '../mcp-tools/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-tools/azure/azure-client.js';
import { AzureTools } from '../mcp-tools/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-tools/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-tools/atlassian/atlassian-tools.js';
import { GitHubAPIClient } from '../mcp-tools/github/github-client.js';
import { GitHubTools } from '../mcp-tools/github/github-tools.js';
import { CombinedTools } from '../mcp-tools/combined/combined-tools.js';

export async function executeToolCall(
  toolCall: ToolCall,
  tools: StructuredTool[],
  onProgress: ProgressCallback
): Promise<ToolCallExecutionResult> {
  const tool = tools.find(t => t.name === toolCall.name);

  if (!tool) {
    const error = `Tool ${toolCall.name} not found`;
    onProgress({
      type: 'tool_error',
      data: {
        tool: toolCall.name,
        error,
      },
    });
    return { toolCall, result: '', error };
  }

  // Send progress update for tool execution start
  onProgress({
    type: 'tool_start',
    data: {
      tool: toolCall.name,
      args: toolCall.args,
    },
  });

  try {
    const result = await tool.invoke(toolCall.args);

    // Send progress update for tool completion
    onProgress({
      type: 'tool_complete',
      data: {
        tool: toolCall.name,
      },
    });

    return { toolCall, result, error: '' };
  } catch (error) {
    // Send progress update for tool error
    onProgress({
      type: 'tool_error',
      data: {
        tool: toolCall.name,
        error: String(error),
      },
    });

    return { toolCall, result: '', error: String(error) };
  }
}

export async function setupTools(request: {
  slackToken?: string;
  azureToken?: string;
  atlassianToken?: string;
  githubToken?: string;
  timezone?: string;
}): Promise<StructuredTool[]> {
  const allTools: StructuredTool[] = [];
  let slackTools: SlackTools | undefined;
  let azureTools: AzureTools | undefined;
  let atlassianTools: AtlassianTools | undefined;
  let githubTools: GitHubTools | undefined;

  // Setup Slack tools
  if (request.slackToken) {
    const slackClient = new SlackAPIClient(request.slackToken);
    slackTools = new SlackTools(slackClient);
    allTools.push(...slackTools.getTools());
  }

  // Setup Azure tools
  if (request.azureToken) {
    const azureClient = new AzureAPIClient({
      accessToken: request.azureToken,
    });
    azureTools = new AzureTools(azureClient, request.timezone);
    allTools.push(...azureTools.getTools());
  }

  // Setup Atlassian tools
  if (request.atlassianToken) {
    const atlassianClient = new AtlassianAPIClient({
      accessToken: request.atlassianToken,
    });
    atlassianTools = new AtlassianTools(atlassianClient);
    allTools.push(...atlassianTools.getTools());
  }

  // Setup GitHub tools
  if (request.githubToken) {
    const githubClient = new GitHubAPIClient({
      accessToken: request.githubToken,
    });
    githubTools = new GitHubTools(githubClient);
    allTools.push(...githubTools.getTools());
  }

  // Setup Combined tools (only if at least one platform is available)
  if (slackTools || azureTools || atlassianTools) {
    const combinedTools = new CombinedTools(
      slackTools,
      azureTools,
      atlassianTools
    );
    allTools.push(...combinedTools.getTools());
  }

  if (allTools.length === 0) {
    throw new Error(
      'No tools were successfully initialized. Please check your tokens.'
    );
  }

  return allTools;
}
