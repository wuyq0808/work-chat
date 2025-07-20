import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { SlackMCPClient } from '../mcp-servers/slack/slack-client.js';
import { SlackToolHandlers } from '../mcp-servers/slack/slack-tools.js';
import { AzureMCPClient } from '../mcp-servers/azure/azure-client.js';
import { AzureToolHandlers } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianMCPClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianToolHandlers } from '../mcp-servers/atlassian/atlassian-tools.js';
import type { AIRequest } from '../services/llmService.js';

const chatGemini = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxOutputTokens: 4096,
  apiKey: process.env.GEMINI_API_KEY,
});

async function processResponseWithTools(
  response: any,
  tools: StructuredTool[],
  originalInput: string
): Promise<string> {
  // Check if the response has tool calls
  if (response.tool_calls && response.tool_calls.length > 0) {
    const toolMessages: ToolMessage[] = [];

    // Execute each tool call
    for (const toolCall of response.tool_calls) {
      const tool = tools.find(t => t.name === toolCall.name);

      if (tool) {
        try {
          const result = await tool.invoke(toolCall.args);

          toolMessages.push(
            new ToolMessage({
              content: result,
              tool_call_id: toolCall.id,
            })
          );
        } catch (error) {
          toolMessages.push(
            new ToolMessage({
              content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              tool_call_id: toolCall.id,
            })
          );
        }
      } else {
        toolMessages.push(
          new ToolMessage({
            content: `Error: Tool ${toolCall.name} not found`,
            tool_call_id: toolCall.id,
          })
        );
      }
    }

    // Create a summary of tool results for the final response
    const toolResultsSummary = toolMessages
      .map(msg => `Tool result: ${msg.content}`)
      .join('\n\n');

    const finalPrompt = `${originalInput}\n\nI've executed the following tools for you:\n${toolResultsSummary}\n\nPlease provide a comprehensive response based on the tool results.`;
    const finalResponse = await chatGemini.invoke([
      new HumanMessage(finalPrompt),
    ]);
    return typeof finalResponse.content === 'string'
      ? finalResponse.content
      : JSON.stringify(finalResponse.content);
  }

  // No tool calls, return regular response
  return typeof response.content === 'string'
    ? response.content
    : JSON.stringify(response.content);
}

export async function callGemini(request: AIRequest): Promise<string> {
  try {
    const allTools = [];

    // Try Slack
    if (request.slackToken) {
      try {
        const slackClient = new SlackMCPClient({
          userToken: request.slackToken,
        });
        const slackToolHandlers = new SlackToolHandlers(slackClient);
        const slackTools = slackToolHandlers.getTools();

        allTools.push(...slackTools);
      } catch (error) {
        console.error('Failed to create Slack tools:', error);
      }
    }

    // Try Azure
    if (request.azureToken) {
      try {
        const azureClient = new AzureMCPClient({
          accessToken: request.azureToken,
        });
        const azureToolHandlers = new AzureToolHandlers(azureClient);
        const azureTools = azureToolHandlers.getTools();

        allTools.push(...azureTools);
      } catch (error) {
        console.error('Failed to create Azure tools:', error);
      }
    }

    // Try Atlassian
    if (request.atlassianToken) {
      try {
        const atlassianClient = new AtlassianMCPClient({
          accessToken: request.atlassianToken,
        });
        const atlassianToolHandlers = new AtlassianToolHandlers(
          atlassianClient
        );
        const atlassianTools = atlassianToolHandlers.getTools();

        allTools.push(...atlassianTools);
      } catch (error) {
        console.error('Failed to create Atlassian tools:', error);
      }
    }

    // If no tools loaded or tools cause issues, use without tools
    if (allTools.length === 0) {
      const response = await chatGemini.invoke(request.input);
      return typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    }

    // Use LangChain ChatGoogleGenerativeAI with tools
    const response = await chatGemini.invoke(
      [new HumanMessage(request.input)],
      { tools: allTools }
    );

    // Handle the response which may contain tool calls
    return await processResponseWithTools(response, allTools, request.input);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}
