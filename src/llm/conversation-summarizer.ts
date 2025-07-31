import {
  HumanMessage,
  SystemMessage,
  BaseMessage,
  AIMessage,
  isAIMessage,
} from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export async function summarizeConversationHistory(
  messages: BaseMessage[],
  chatModel: BaseChatModel
): Promise<BaseMessage[]> {
  // Only summarize when we have more than 12 messages to ensure fresh messages remain
  if (messages.length <= 12) {
    return messages;
  }

  // Find first AIMessage with tool calls after the 8th message
  let cutoffIndex = -1;
  for (let i = 8; i < messages.length; i++) {
    const msg = messages[i];
    if (isAIMessage(msg) && msg.tool_calls && msg.tool_calls.length > 0) {
      cutoffIndex = i;
      break;
    }
  }

  // If no AIMessage with tool calls found, return original messages
  if (cutoffIndex === -1) {
    return messages;
  }

  // Keep system message (first), summarize messages 1 to cutoffIndex-1, keep the rest
  const systemMessage = messages[0];
  const messagesToSummarize = messages.slice(1, cutoffIndex);
  const remainingMessages = messages.slice(cutoffIndex);

  // Create summarization prompt
  const summarizationPrompt = new SystemMessage(`
Summarize conversation messages to reduce token usage while preserving context.
`);

  // Convert messages to text for summarization
  const conversationText = JSON.stringify(messagesToSummarize);

  const summarizationRequest = new HumanMessage(`
conversation messages: ${conversationText}`);

  // Get summary from LLM
  const summaryResponse = await chatModel.invoke([
    summarizationPrompt,
    summarizationRequest,
  ]);

  // Extract summary content
  const summaryContent =
    typeof summaryResponse.content === 'string'
      ? summaryResponse.content
      : JSON.stringify(summaryResponse.content);

  // Create summary message - use AIMessage since it's generated content from the LLM
  const summaryMessage = new AIMessage(`
[SUMMARY]
${summaryContent}
[/SUMMARY]
`);

  // Return: system message + summary + remaining messages
  return [systemMessage, summaryMessage, ...remainingMessages];
}
