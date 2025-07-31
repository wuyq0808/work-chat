// Progress event types for the chat system

export interface ToolStartData {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolCompleteData {
  tool: string;
}

export interface ToolErrorData {
  tool: string;
  error: string;
}

export type ProgressEventData = 
  | { type: 'status'; data: string }
  | { type: 'ai_processing'; data: string }
  | { type: 'tool_start'; data: ToolStartData }
  | { type: 'tool_complete'; data: ToolCompleteData }
  | { type: 'tool_error'; data: ToolErrorData }
  | { type: 'token_usage'; data: number };

export type ProgressCallback = (event: ProgressEventData) => void;