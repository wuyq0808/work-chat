# Claude Development Notes

## Development Guidelines
- Do not modify .env file without my explicit consent

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



