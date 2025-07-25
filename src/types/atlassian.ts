/**
 * Shared type definitions for Atlassian OAuth and API interactions
 */

export interface AtlassianTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}
