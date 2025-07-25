# TODO

## CRITICAL: Conversation Cache Implementation

- [ ] **CRITICAL**: Create proper cache for conversations - they are now stored in memory permanently
  - Current issue: `conversationHistories` Map in LangChainChat grows indefinitely
  - Need TTL-based cache or persistent storage with cleanup
  - Memory leak risk in production
  - Consider Redis, file-based cache, or in-memory LRU with expiration

## GitHub Integration

- [ ] Implement GitHub OAuth service
  - Follow pattern from existing OAuth services (Azure, Slack, Atlassian)
  - Add GitHub OAuth endpoints to server
- [ ] Create GitHub API client
  - Similar to existing clients in `src/mcp-servers/`
  - Handle authentication and rate limiting
- [ ] Develop GitHub tools
  - Repository search and browsing
  - Issue management (create, update, search)
  - Pull request operations
  - Commit history and file operations

## Slack Tool Enhancement

- [ ] Improve Slack latest messages 
  - Current issue: Only shows messages to/from user (mentions)
  - Enhancement: Query recent channel history to construct complete conversation context
  - Show thread context and related messages for better understanding
  - Consider message threading and reply chains

## ClickUp Integration

- [ ] Implement ClickUp OAuth service
  - Follow pattern from existing OAuth services (Azure, Slack, Atlassian)
  - Add ClickUp OAuth endpoints to server
- [ ] Create ClickUp API client
  - Similar to existing clients in `src/mcp-servers/`
  - Handle authentication and rate limiting
- [ ] Develop ClickUp tools
  - Task management (create, update, search, assign)
  - Workspace and space browsing
  - Time tracking operations
  - Comment and collaboration features
  - Goal and milestone tracking

## Azure Email Tool Enhancement

- [ ] Modify get email method to accept keyword search instead of specific message IDs
  - Current issue: Tool requires specific messageId which users don't know
  - Enhancement: Allow searching emails by keywords, subject, sender, date range
  - Remove dependency on specific email IDs for better usability

## Desktop App Packaging

- [ ] Implement Electron packaging for desktop app distribution
  - Package Express server as sidecar process or embedded server
  - Handle OAuth flows with proper redirect URI handling for desktop environment
  - Create macOS installer (.dmg)

## Dependency Decoupling

- [ ] Decouple mshell secret dependency - make it optional
  - Current issue: App requires mshell-node-secrets package
  - Enhancement: Make secret management optional or use alternative approach
  - Allow app to run without external secret management dependencies
