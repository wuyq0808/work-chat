// Helper function to extract token usage from LangChain responses
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- LangChain message content varies by model
export function getTokenUsage(message: any): {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
} {
  // Check for usage_metadata (preferred method in LangChain 2024+)
  if (message.usage_metadata) {
    return {
      input_tokens: message.usage_metadata.input_tokens || 0,
      output_tokens: message.usage_metadata.output_tokens || 0,
      total_tokens: message.usage_metadata.total_tokens || 0,
    };
  }

  return {
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  };
}

// Helper function to update token usage via progress callback
export function updateTokenUsage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- message can be any shape
  message: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Progress callback can be any shape
  onProgress?: (event: { type: string; data: any }) => void
): void {
  const tokenUsage = getTokenUsage(message);
  if (onProgress) {
    onProgress({
      type: 'token_usage',
      data: tokenUsage,
    });
  }
}
