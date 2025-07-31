import {
  BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from '@langchain/core/messages';
import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';

// Persistent conversation histories using Keyv with SQLite and LangChain serialization
const conversationStore = new Keyv(
  new KeyvSqlite('sqlite://conversations.sqlite'),
  {
    namespace: 'conversations',
    ttl: 1000 * 60 * 60 * 24, // 1 day TTL
  }
);

// Handle storage errors
conversationStore.on('error', err => {
  console.error('Conversation storage error:', err);
});

export async function getConversationHistory(
  conversationId: string
): Promise<BaseMessage[]> {
  const serializedMessages = await conversationStore.get(conversationId);
  if (!serializedMessages) {
    return [];
  }
  return mapStoredMessagesToChatMessages(serializedMessages);
}

export async function addToConversationHistory(
  conversationId: string,
  message: BaseMessage
): Promise<void> {
  const history = await getConversationHistory(conversationId);
  history.push(message);
  const serializedMessages = mapChatMessagesToStoredMessages(history);
  await conversationStore.set(conversationId, serializedMessages);
}

export async function updateConversationHistory(
  conversationId: string,
  messages: BaseMessage[]
): Promise<void> {
  const serializedMessages = mapChatMessagesToStoredMessages(messages);
  await conversationStore.set(conversationId, serializedMessages);
}