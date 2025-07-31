import type { Request, Response } from 'express';
import { InstallProvider } from '@slack/oauth';
import { asyncHandler } from '../middleware/errorHandler.js';
import type { SlackConfig } from '../utils/secrets-manager.js';
import { getCookieString } from '../utils/cookie-utils.js';

export class SlackOAuthService {
  private installer: InstallProvider;

  constructor(config: SlackConfig) {
    if (
      !config.SLACK_CLIENT_ID ||
      !config.SLACK_CLIENT_SECRET ||
      !config.SLACK_STATE_SECRET
    ) {
      throw new Error('Missing required Slack configuration');
    }

    this.installer = new InstallProvider({
      clientId: config.SLACK_CLIENT_ID,
      clientSecret: config.SLACK_CLIENT_SECRET,
      stateSecret: config.SLACK_STATE_SECRET,
      installUrlOptions: {
        scopes: [], // Bot scopes (empty for user token only)
        userScopes: [
          'channels:history',
          'channels:read',
          'groups:history',
          'groups:read',
          'im:history',
          'im:read',
          'mpim:history',
          'mpim:read',
          'search:read',
          'search:read.files',
          'search:read.im',
          'search:read.mpim',
          'search:read.private',
          'search:read.public',
        ],
        redirectUri: config.SLACK_REDIRECT_URI,
      },
      installationStore: {
        storeInstallation: async _installation => {
          // TODO: Store in database for production
        },
        fetchInstallation: async _installQuery => {
          // For "install every time" - throw error to force fresh installation
          throw new Error('No stored installation - fresh install required');
        },
      },
    });
  }

  // OAuth installation route handler
  handleInstall = asyncHandler(async (req: Request, res: Response) => {
    // DEVELOPMENT ONLY: Workaround for localhost OAuth cookie issues
    // The Slack SDK sets cookies with 'Secure' flag, which prevents them from being sent
    // over HTTP (localhost). Since Slack doesn't provide official cookie security config,
    // we intercept and remove the Secure flag for development.
    if (process.env.NODE_ENV !== 'production') {
      const originalSetHeader = res.setHeader.bind(res);
      res.setHeader = function (name: string, value: string | string[]) {
        if (name.toLowerCase() === 'set-cookie') {
          // Remove Secure flag for localhost development only
          if (typeof value === 'string' && value.includes('Secure')) {
            value = value.replace(/;\s*Secure/gi, '');
          }
        }
        return originalSetHeader(name, value);
      };
    }
    await this.installer.handleInstallPath(req, res);
  });

  // OAuth callback route handler
  handleCallback = asyncHandler(async (req: Request, res: Response) => {
    await this.installer.handleCallback(req, res, {
      success: (installation, _installOptions, _req, res) => {
        // Get user token from installation
        const userToken = installation.user?.token;
        const teamName = installation.team?.name;
        const userId = installation.user?.id;

        if (userToken) {
          // Set secure HttpOnly cookies for token and team info
          const isProduction = process.env.NODE_ENV === 'production';

          // Set cookies using unified utility function
          const cookies = [
            getCookieString('slack_token', userToken, {
              expiresIn: 86400, // 24 hours
              isSecureCookie: isProduction,
              httpOnly: true,
            }),
          ];
          if (teamName) {
            cookies.push(
              getCookieString('team_name', teamName, {
                expiresIn: 86400, // 24 hours
                isSecureCookie: isProduction,
                httpOnly: false,
              })
            );
          }
          if (userId) {
            cookies.push(
              getCookieString('slack_user_id', userId, {
                expiresIn: 86400, // 24 hours
                isSecureCookie: isProduction,
                httpOnly: false,
              })
            );
          }
          res.setHeader('Set-Cookie', cookies);

          // Redirect back to main app
          const redirectUrl = new URL(`${process.env.HOME_PAGE_URL}/`);

          res.writeHead(302, { Location: redirectUrl.toString() });
          res.end();
        } else {
          // Fallback to success page if no user token
          const htmlResponse = `
            <html>
              <head>
                <title>Installation Successful</title>
                <style>
                  body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                  .success { color: #2eb886; }
                  .team-name { font-weight: bold; }
                </style>
              </head>
              <body>
                <h1 class="success">✅ Installation Successful!</h1>
                <p>Slack Assistant has been successfully installed to workspace: <span class="team-name">${teamName}</span></p>
                <p>You can now close this window and return to the main app.</p>
                <script>
                  setTimeout(() => {
                    window.close();
                  }, 5000);
                </script>
              </body>
            </html>
          `;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(htmlResponse);
        }
      },
      failure: (error, _installOptions, _req, res) => {
        const htmlResponse = `
          <html>
            <head>
              <title>Installation Failed</title>
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                .error { color: #e01e5a; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Installation Failed</h1>
              <p>There was an error installing the Slack Assistant.</p>
              <p>Error: ${error.message}</p>
              <p>Please try again or contact support.</p>
              <a href="/slack/install">Try Again</a>
            </body>
          </html>
        `;
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlResponse);
      },
    });
  });

  // Get the InstallProvider instance (for future use)
  getInstaller() {
    return this.installer;
  }
}
