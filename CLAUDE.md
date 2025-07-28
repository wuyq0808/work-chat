# Claude Development Notes

## Development Guidelines
- Do not modify .env file without my explicit consent
- Do not commit changes automatically - always ask user before committing

## Testing Guidelines

### DO NOT start the server automatically after making changes
- When I make code changes, DO NOT run `npm start` or try to start the server
- Instead, tell me the changes are ready for testing
- Wait for me to start the server manually

### Testing Process
- After making changes, run `npm run build` to compile
- Let user know the build is complete and ready for testing
- User will start the server when ready

### Server Monitoring
- Keep `npm run dev 2>&1 | tee server.log` running during development
- Claude will monitor server.log for errors and debugging
- If server is not running, Claude will tell the user to run it (will not start it automatically)

## Linting Guidelines
- Run `npm run lint:fix` to automatically fix formatting and address linting issues
- eslint-disable comments needs reasons

## Quick Test Scripts for API/MCP Tool Testing

### Location: `quick-tests/` directory
- Contains test scripts for API and MCP tool testing
- **Pattern**: `test-{tool_name}.ts` - One script per tool
- Uses `get-tokens.js` utility for extracting auth tokens from COOKIES

### Setup for Testing:
1. **Copy browser cookies to .env file**:
   - In browser dev tools → Application/Storage → Cookies
   - Copy the entire cookie string 
   - Add to `.env` file: `COOKIES="your_cookie_string_here"`
   - Include tokens like: `azure_token=xxx; slack_token=yyy; atlassian_token=zzz`

2. **Run quick test scripts**:
   ```bash
   # Atlassian tools
   npm run test:script quick-tests/test-atlassian__jira_get_latest_issues.ts
   npm run test:script quick-tests/test-atlassian__confluence_get_latest_pages.ts
   npm run test:script quick-tests/test-atlassian__search_jira_issues.ts
   npm run test:script quick-tests/test-atlassian__search_confluence_pages.ts
   npm run test:script quick-tests/test-atlassian__get_latest_activity.ts
   
   # Azure tools
   npm run test:script quick-tests/test-azure__search_email.ts
   npm run test:script quick-tests/test-azure__get_upcoming_calendar.ts
   
   # Slack tools
   npm run test:script quick-tests/test-slack__get_latest_messages.ts
   ```

### Token Utility:
- All scripts use `get-tokens.js` utility for consistent token extraction
- Supports Azure, Slack, and Atlassian tokens from COOKIES environment variable
- Environment loading centralized in `get-tokens.ts` (imported automatically)
