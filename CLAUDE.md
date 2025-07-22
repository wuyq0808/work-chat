# Claude Development Notes

## Testing Guidelines

### DO NOT start the server automatically after making changes
- When I make code changes, DO NOT run `npm start` or try to start the server
- Instead, tell me the changes are ready for testing
- Wait for me to start the server manually

### Testing Process
- After making changes, run `npm run build` to compile
- Let me know the build is complete and ready for testing
- I will start the server when ready

### Server Monitoring
- Keep `npm run dev 2>&1 | tee server.log` running during development
- Claude will monitor server.log for errors and debugging
- If server is not running, Claude will tell the user to run it (will not start it automatically)

### Environment Tokens
- Check the .env file for available tokens:
  - `OPENAI_API_KEY` - for OpenAI/GPT models
  - `GEMINI_API_KEY` - for Google Gemini models  
  - `ANTHROPIC_API_KEY` - for Claude models
  - `API_KEY` - for authenticating requests to our server
  - Various OAuth tokens may be available in cookies during testing

## Linting Guidelines
- Run `npm run lint:fix` to automatically fix formatting and address linting issues
- All remaining `any` types have been documented with eslint-disable comments and reasons
- Non-null assertions are documented where they are safe to use



