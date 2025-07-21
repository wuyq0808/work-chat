import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  HumanMessage,
  ToolMessage,
  SystemMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { SlackAPIClient } from '../mcp-servers/slack/slack-client.js';
import { SlackTools } from '../mcp-servers/slack/slack-tools.js';
import { AzureAPIClient } from '../mcp-servers/azure/azure-client.js';
import { AzureTools } from '../mcp-servers/azure/azure-tools.js';
import { AtlassianAPIClient } from '../mcp-servers/atlassian/atlassian-client.js';
import { AtlassianTools } from '../mcp-servers/atlassian/atlassian-tools.js';
import type { AIRequest, StreamingAIRequest } from '../services/llmService.js';
import { withRetry, isGeminiPartsError } from '../utils/retryUtils.js';

const chatGemini = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxOutputTokens: 1024 * 8,
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
- Provide summary if the found items are repetitive, otherwise it's ok to display individual items
- Aim for more than 10 pieces of information
- Keep responses concise and focused on the most important information

## QUALITY ASSURANCE
- Be persistent in finding relevant results before responding
- If initial results are poor, try additional search strategies with different approaches
- Use multiple tools if available to get comprehensive results
- Never ask follow-up questions or suggest ways to make requests more specific
- Always provide results only`);
}

// Helper function to extract string content from AIMessage
function extractContentAsString(message: any): string {
  return typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);
}

async function processResponseWithTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response: any, // LangChain response type is complex and varies by model
  tools: StructuredTool[],
  conversationId: string, // Needed to add tool messages to history
  onProgress?: (event: { type: string; data: any }) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  // Returns AIMessage
  // Check if the response has tool calls
  if (response.tool_calls && response.tool_calls.length > 0) {
    const toolMessages: ToolMessage[] = [];

    // Execute each tool call
    for (const toolCall of response.tool_calls) {
      const tool = tools.find(t => t.name === toolCall.name);

      if (tool) {
        try {
          // Send progress update for tool execution
          onProgress?.({
            type: 'tool_start',
            data: {
              tool: toolCall.name,
              args: toolCall.args,
            },
          });

          const result = await tool.invoke(toolCall.args);

          // Send progress update for tool completion
          onProgress?.({
            type: 'tool_complete',
            data: {
              tool: toolCall.name,
              result:
                typeof result === 'string'
                  ? result.substring(0, 200) +
                    (result.length > 200 ? '...' : '')
                  : 'Done',
            },
          });

          toolMessages.push(
            new ToolMessage({
              content: result,
              tool_call_id: toolCall.id,
            })
          );
        } catch (error) {
          // Send progress update for tool error
          onProgress?.({
            type: 'tool_error',
            data: {
              tool: toolCall.name,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          });

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

    // Add tool messages to conversation history
    toolMessages.forEach(toolMessage => {
      addToConversationHistory(conversationId, toolMessage);
    });

    // Create the complete message sequence that Gemini requires:
    // Use the updated conversation history which now includes the AI response and tool results
    const updatedHistory = getConversationHistory(conversationId);

    // Let the model process the tool results and generate a final response
    onProgress?.({ type: 'status', data: 'Processing results...' });
    const finalResponse = await withRetry(
      () => chatGemini.invoke(updatedHistory),
      { retries: 3 },
      isGeminiPartsError
    );

    return finalResponse; // Return the AIMessage directly
  }

  // No tool calls, return the original response
  return response; // Return the AIMessage directly
}

export async function callGemini(_request: AIRequest): Promise<string> {
  // TODO: Clean up and consolidate with callGeminiWithStream - remove duplicate tool initialization logic
  throw new Error(
    'callGemini is deprecated - use callGeminiWithStream instead'
  );
}

export async function callGeminiWithStream(
  request: StreamingAIRequest
): Promise<string> {
  try {
    const allTools = [];
    if (!request.conversationId) {
      throw new Error('conversationId is required');
    }
    const conversationId = request.conversationId;

    // Send initial status
    request.onProgress?.({ type: 'status', data: 'Initializing Gemini...' });

    // Try Slack
    if (request.slackToken) {
      try {
        request.onProgress?.({
          type: 'status',
          data: 'Setting up Slack tools...',
        });
        const slackClient = new SlackAPIClient({
          userToken: request.slackToken,
        });
        const slackTools = new SlackTools(slackClient);
        allTools.push(...slackTools.getTools());
      } catch (error) {
        console.error('Failed to initialize Slack tools:', error);
      }
    }

    // Try Azure
    if (request.azureToken) {
      try {
        request.onProgress?.({
          type: 'status',
          data: 'Setting up Azure tools...',
        });
        const azureClient = new AzureAPIClient({
          accessToken: request.azureToken,
        });
        const azureTools = new AzureTools(azureClient);
        allTools.push(...azureTools.getTools());
      } catch (error) {
        console.error('Failed to initialize Azure tools:', error);
      }
    }

    // Try Atlassian
    if (request.atlassianToken) {
      try {
        request.onProgress?.({
          type: 'status',
          data: 'Setting up Atlassian tools...',
        });
        const atlassianClient = new AtlassianAPIClient({
          accessToken: request.atlassianToken,
        });
        const atlassianTools = new AtlassianTools(atlassianClient);
        allTools.push(...atlassianTools.getTools());
      } catch (error) {
        console.error('Failed to initialize Atlassian tools:', error);
      }
    }

    if (allTools.length === 0) {
      throw new Error(
        'No tools were successfully initialized. Please check your tokens.'
      );
    }

    // Get conversation history
    const history = getConversationHistory(conversationId);

    // Add user message to history
    const userMessage = new HumanMessage(request.input);
    addToConversationHistory(conversationId, userMessage);

    // Create the conversation context for Gemini
    const conversationContext = [
      createPromptEnhancementMessage(allTools),
      ...history.slice(-10), // Keep last 10 messages for context
    ];

    request.onProgress?.({ type: 'status', data: 'Starting new query...' });

    // Bind tools to the model
    const geminiWithTools = chatGemini.bindTools(allTools);

    // Get the response (which might include tool calls)
    const response = await geminiWithTools.invoke(conversationContext);

    // Add the AI response with tool_calls to conversation history
    addToConversationHistory(conversationId, response);

    // Handle the response which may contain tool calls
    const finalAIMessage = await processResponseWithTools(
      response,
      allTools,
      conversationId,
      request.onProgress
    );

    // Add final AI response to history
    addToConversationHistory(conversationId, finalAIMessage);

    return extractContentAsString(finalAIMessage);
  } catch (error) {
    console.error('Gemini error:', error);
    throw error;
  }
}
