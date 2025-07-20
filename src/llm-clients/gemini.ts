import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  HumanMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
  AIMessage,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';
import type { AIRequest } from '../services/llmService.js';

const chatGemini = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxOutputTokens: 10240,
  apiKey: process.env.GEMINI_API_KEY,
});

// Simple in-memory conversation history storage
const conversationHistories = new Map<string, BaseMessage[]>();

function getConversationHistory(conversationId: string): BaseMessage[] {
  if (!conversationHistories.has(conversationId)) {
    conversationHistories.set(conversationId, []);
  }
  return conversationHistories.get(conversationId)!;
}

function addToConversationHistory(
  conversationId: string,
  message: BaseMessage
): void {
  const history = getConversationHistory(conversationId);
  history.push(message);
}

function createPromptEnhancementMessage(
  availableTools: StructuredTool[]
): SystemMessage {
  const toolsList = availableTools
    .map(tool => `- ${tool.name}: ${tool.description}`)
    .join('\n');

  return new SystemMessage(`You must automatically enhance vague requests and provide useful results without asking for clarification.

Available tools:
${toolsList}

## SEARCH STRATEGY
For vague requests like "find me something" or "show me something important":
- Use time-based searches WITHOUT specific keywords - focus on recent content from the last 2 weeks
- Retrieve at least 10 messages/items from each available tool to find truly important content
- Prioritize recency over keyword matching when requests are general or vague
- Cast a wide net first, then filter for the most important and relevant information

## CONTENT PRIORITIZATION
For Slack and Email specifically:
- Direct messages or mentions directed at you personally
- Questions or requests specifically addressed to you
- AVOID group broadcast emails, system notifications, automated messages
- Prioritize newer messages over older ones

## RESPONSE FORMAT
- Provide SUMMARIES, not full lists of results
- Keep responses concise and focused on the most important information

## QUALITY ASSURANCE
- Be persistent in finding relevant results before responding
- If initial results are poor, try additional search strategies with different approaches
- Use multiple tools if available to get comprehensive results
- Never ask follow-up questions or suggest ways to make requests more specific
- Always provide results only`);
}

async function processResponseWithTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any, // LangChain response type is complex and varies by model
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
    if (!request.conversationId) {
      throw new Error('conversationId is required');
    }
    const conversationId = request.conversationId;

    // Try Slack
    if (request.slackToken) {
      try {
        const slackClient = new SlackAPIClient({
          userToken: request.slackToken,
        });
        const slackToolsInstance = new SlackTools(slackClient);
        const slackTools = slackToolsInstance.getTools();

        allTools.push(...slackTools);
      } catch (error) {
        console.error('Failed to create Slack tools:', error);
      }
    }

    // Try Azure
    if (request.azureToken) {
      try {
        const azureClient = new AzureAPIClient({
          accessToken: request.azureToken,
        });
        const azureToolsInstance = new AzureTools(azureClient);
        const azureTools = azureToolsInstance.getTools();

        allTools.push(...azureTools);
      } catch (error) {
        console.error('Failed to create Azure tools:', error);
      }
    }

    // Try Atlassian
    if (request.atlassianToken) {
      try {
        const atlassianClient = new AtlassianAPIClient({
          accessToken: request.atlassianToken,
        });
        const atlassianToolsInstance = new AtlassianTools(atlassianClient);
        const atlassianTools = atlassianToolsInstance.getTools();

        allTools.push(...atlassianTools);
      } catch (error) {
        console.error('Failed to create Atlassian tools:', error);
      }
    }

    // If no tools loaded, return helpful message
    if (allTools.length === 0) {
      return 'No external tools are connected. Please ensure at least one token (Slack, Azure, or Atlassian) is properly configured to access your data.';
    }

    // Get conversation history
    const history = getConversationHistory(conversationId);

    // Add current user message to history
    const userMessage = new HumanMessage(request.input);
    addToConversationHistory(conversationId, userMessage);

    // Use LangChain ChatGoogleGenerativeAI with tools and message chain
    const response = await chatGemini.invoke(
      [createPromptEnhancementMessage(allTools), ...history, userMessage],
      {
        tools: allTools,
      }
    );

    // Handle the response which may contain tool calls
    const finalResponse = await processResponseWithTools(
      response,
      allTools,
      request.input
    );

    // Add AI response to history
    addToConversationHistory(conversationId, new AIMessage(finalResponse));

    return finalResponse;
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : 'Failed to generate response'}`;
  }
}
