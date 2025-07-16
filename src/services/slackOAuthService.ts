import type { Request, Response } from 'express';
import { InstallProvider } from '@slack/oauth';
import { asyncHandler } from '../middleware/errorHandler.js';

export class SlackOAuthService {
  private installer: InstallProvider;

  constructor() {
    console.log('Initializing SlackOAuthService with state secret:', process.env.SLACK_STATE_SECRET?.substring(0, 10) + '...');
    
    this.installer = new InstallProvider({
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      stateSecret: process.env.SLACK_STATE_SECRET!,
      installUrlOptions: {
        scopes: [],  // Bot scopes (empty for user token only)
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
          'search:read.public'
        ],
        redirectUri: process.env.SLACK_REDIRECT_URI
      },
      installationStore: {
        storeInstallation: async (installation) => {
          console.log('OAuth installation stored:', installation.team?.name);
          // TODO: Store in database for production
        },
        fetchInstallation: async (installQuery) => {
          console.log('OAuth installation fetched:', installQuery);
          // For "install every time" - throw error to force fresh installation
          throw new Error('No stored installation - fresh install required');
        }
      }
    });
  }

  // OAuth installation route handler
  handleInstall = asyncHandler(async (req: Request, res: Response) => {
    console.log('Starting OAuth installation flow');
    console.log('Request headers:', {
      host: req.headers.host,
      cookie: req.headers.cookie,
      'user-agent': req.headers['user-agent']
    });
    
    // Use handleInstallPath instead of manually generating URL and redirecting
    // This method handles both URL generation AND cookie setting
    await this.installer.handleInstallPath(req, res);
  });

  // OAuth callback route handler
  handleCallback = asyncHandler(async (req: Request, res: Response) => {
    console.log('OAuth callback received');
    console.log('Query params:', JSON.stringify(req.query, null, 2));
    console.log('Headers:', {
      host: req.headers.host,
      cookie: req.headers.cookie || 'NO COOKIES',
      referer: req.headers.referer || 'NO REFERER',
      'user-agent': req.headers['user-agent']
    });
    console.log('State param length:', (req.query.state as string)?.length);
    console.log('State param preview:', (req.query.state as string)?.substring(0, 100) + '...');
    
    try {
      await this.installer.handleCallback(req, res, {
      success: (installation, _installOptions, req, res) => {
        console.log('OAuth installation successful:', installation.team?.name);
        
        // Get user token from installation
        const userToken = installation.user?.token;
        const teamName = installation.team?.name;
        
        if (userToken) {
          // Redirect back to main app with token and team info
          const protocol = (req as any).protocol || 'http';
          const host = (req as any).get('host') || 'localhost:5173';
          const redirectUrl = new URL(`${protocol}://${host}/`);
          redirectUrl.searchParams.set('apikey', process.env.API_KEY!);
          redirectUrl.searchParams.set('slack_token', userToken);
          redirectUrl.searchParams.set('team_name', teamName || '');
          
          res.writeHead(302, { 'Location': redirectUrl.toString() });
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
        console.error('OAuth installation failed:', error);
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
      }
    });
    } catch (error) {
      console.error('Error in handleCallback:', error);
      throw error;
    }
  });

  // Get the InstallProvider instance (for future use)
  getInstaller() {
    return this.installer;
  }
}