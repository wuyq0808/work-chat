import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import type { AIRequest } from '../services/llmService.js';
import { withRetry, isGeminiPartsError } from '../utils/retryUtils.js';

// Create a wrapper that implements retry logic for Gemini
class RetryableGeminiChat {
  private gemini: ChatGoogleGenerativeAI;

  constructor() {
    this.gemini = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      temperature: 0.7,
      maxOutputTokens: 1024 * 8,
      apiKey: process.env.GEMINI_API_KEY,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message and response types are complex
  async invoke(messages: any[]): Promise<any> {
    return withRetry(
      () => this.gemini.invoke(messages),
      { retries: 3 },
      isGeminiPartsError
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain tool types are complex
  bindTools(tools: any[]): RetryableGeminiChat {
    const boundGemini = this.gemini.bindTools(tools);
    const wrapper = new RetryableGeminiChat();
    wrapper.gemini = boundGemini as ChatGoogleGenerativeAI;
    return wrapper;
  }
}

// Export function to create Gemini chat model for LangChainChatHandler
export function createGeminiChatModel(): RetryableGeminiChat {
  return new RetryableGeminiChat();
}

export async function callGemini(_request: AIRequest): Promise<string> {
  throw new Error(
    'callGemini is deprecated - Gemini is now handled through LangChainChatHandler in llmService'
  );
}
