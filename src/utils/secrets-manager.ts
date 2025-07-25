/**
 * Secrets Manager - Fetches TEMP_WORKCHAT_SECRETS using mshell-node-secrets
 * and parses the configuration secrets
 */

/**
 * AWS Configuration
 */
export interface AWSConfig {
  AWS_BEDROCK_CLAUDE_37_MODEL_ID?: string;
  AWS_BEDROCK_CLAUDE_35_MODEL_ID?: string;
  AWS_REGION?: string;
}

/**
 * Slack OAuth Configuration
 */
export interface SlackConfig {
  SLACK_CLIENT_ID?: string;
  SLACK_CLIENT_SECRET?: string;
  SLACK_STATE_SECRET?: string;
  SLACK_REDIRECT_URI?: string;
  SLACK_TOKEN?: string;
}

/**
 * Azure OAuth Configuration
 */
export interface AzureConfig {
  AZURE_CLIENT_ID?: string;
  AZURE_CLIENT_SECRET?: string;
  AZURE_TENANT_ID?: string;
  AZURE_REDIRECT_URI?: string;
}

/**
 * Atlassian OAuth Configuration
 */
export interface AtlassianConfig {
  ATLASSIAN_CLIENT_ID?: string;
  ATLASSIAN_CLIENT_SECRET?: string;
  ATLASSIAN_REDIRECT_URI?: string;
}

/**
 * General Application Configuration
 */
export interface GeneralConfig {
  HOME_PAGE_URL?: string;
}

/**
 * Complete Application Configuration
 */
export interface AppConfig
  extends AWSConfig,
    SlackConfig,
    AzureConfig,
    AtlassianConfig,
    GeneralConfig {}

// Configuration matching hotels-website development.ts
const config = {
  secrets: {
    account: 'sandbox',
    projectName: 'hotels-website',
    preferredRegion: 'eu-west-1',
    assumeRoleArn: 'arn:aws:iam::325714046698:role/sandbox-secrets-access',
  },
  secretKeys: ['TEMP_WORKCHAT_SECRETS'],
};

// Cache for fetched secrets
const secretMaps: { [key: string]: string | null } = {};

/**
 * Fetches secrets from mshell-node-secrets
 */
const fetchSecrets = async (): Promise<void> => {
  try {
    console.log('📡 Fetching secrets from mshell-node-secrets...');

    // Load SecretsDecryptor locally
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    const mshellModule = require('mshell-node-secrets');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SecretsDecryptor: any = mshellModule.default;
    console.log('✅ Loaded mshell-node-secrets from local installation');

    const secretsDecryptor = new SecretsDecryptor(config.secrets);

    const secrets = await secretsDecryptor.getSecrets(config.secretKeys);

    config.secretKeys.forEach((key: string) => {
      secretMaps[key] = secrets.get(key) || null;
    });
  } catch (error) {
    console.warn(
      '❌ Could not fetch from mshell-node-secrets:',
      (error as Error).message
    );
    console.warn('💡 Falling back to environment variables only');
  }
};

/**
 * Parses environment variables from a string (like .env format)
 */
const parseEnvString = (envString: string): Record<string, string> => {
  const envVars: Record<string, string> = {};

  const lines = envString.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE format
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      envVars[key] = value;
    }
  }

  return envVars;
};

/**
 * Loads configuration with comprehensive fallback strategy:
 * 1. Environment variables (highest priority)
 * 2. mshell-node-secrets (TEMP_WORKCHAT_SECRETS)
 * 3. .env file (via dotenv - lowest priority)
 *
 * Returns a complete AppConfig with all available values
 */
export const loadAppConfigWithFallbacks = async (): Promise<AppConfig> => {
  console.log('🔐 Loading application configuration with fallbacks...');

  // Step 1: Try to get configuration from mshell-node-secrets
  let secretsConfig: AppConfig = {};

  const hasAWSCredentials =
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;

  if (hasAWSCredentials) {
    try {
      console.log('📡 Attempting to fetch from mshell-node-secrets...');
      await fetchSecrets();

      const tempSecrets = secretMaps['TEMP_WORKCHAT_SECRETS'];
      if (tempSecrets) {
        console.log('✅ Found TEMP_WORKCHAT_SECRETS, parsing...');
        secretsConfig = parseEnvString(tempSecrets) as AppConfig;
        console.log(
          `📊 Loaded ${Object.keys(secretsConfig).length} values from mshell-secrets`
        );
      } else {
        console.log('⚠️  TEMP_WORKCHAT_SECRETS not found in mshell-secrets');
      }
    } catch (error) {
      console.warn(
        '⚠️  Failed to fetch from mshell-secrets:',
        (error as Error).message
      );
    }
  } else {
    console.log('⚠️  No AWS credentials, skipping mshell-secrets');
    console.log(
      '💡 Run: SAML_CMD="saml2aws script --profile default" && $(eval $SAML_CMD)'
    );
  }

  // Step 2: Helper method for clean fallback logic
  const getConfigValue = (key: keyof AppConfig): string | undefined => {
    return process.env[key] || secretsConfig[key];
  };

  // Step 3: Create final config with clean fallback calls
  const finalConfig: AppConfig = {
    // AWS Bedrock
    AWS_BEDROCK_CLAUDE_37_MODEL_ID: getConfigValue(
      'AWS_BEDROCK_CLAUDE_37_MODEL_ID'
    ),
    AWS_BEDROCK_CLAUDE_35_MODEL_ID: getConfigValue(
      'AWS_BEDROCK_CLAUDE_35_MODEL_ID'
    ),
    AWS_REGION: getConfigValue('AWS_REGION'),

    // General
    HOME_PAGE_URL: getConfigValue('HOME_PAGE_URL'),

    // Slack OAuth
    SLACK_CLIENT_ID: getConfigValue('SLACK_CLIENT_ID'),
    SLACK_CLIENT_SECRET: getConfigValue('SLACK_CLIENT_SECRET'),
    SLACK_STATE_SECRET: getConfigValue('SLACK_STATE_SECRET'),
    SLACK_REDIRECT_URI: getConfigValue('SLACK_REDIRECT_URI'),
    SLACK_TOKEN: getConfigValue('SLACK_TOKEN'),

    // Azure OAuth
    AZURE_CLIENT_ID: getConfigValue('AZURE_CLIENT_ID'),
    AZURE_CLIENT_SECRET: getConfigValue('AZURE_CLIENT_SECRET'),
    AZURE_TENANT_ID: getConfigValue('AZURE_TENANT_ID'),
    AZURE_REDIRECT_URI: getConfigValue('AZURE_REDIRECT_URI'),

    // Atlassian OAuth
    ATLASSIAN_CLIENT_ID: getConfigValue('ATLASSIAN_CLIENT_ID'),
    ATLASSIAN_CLIENT_SECRET: getConfigValue('ATLASSIAN_CLIENT_SECRET'),
    ATLASSIAN_REDIRECT_URI: getConfigValue('ATLASSIAN_REDIRECT_URI'),
  };

  // Step 4: Report configuration sources
  const configSources = {
    fromSecrets: Object.keys(secretsConfig).length,
    fromEnv: Object.keys(process.env).length,
    total: Object.values(finalConfig).filter(v => v).length,
  };

  console.log('📋 Configuration loaded:');
  console.log(`  • From mshell-secrets: ${configSources.fromSecrets} values`);
  console.log(
    `  • From environment: ${configSources.fromEnv} env vars available`
  );
  console.log(`  • Total config values: ${configSources.total} values`);

  // Step 5: Validate critical configuration
  const criticalMissing = [];
  if (!finalConfig.SLACK_CLIENT_ID) criticalMissing.push('SLACK_CLIENT_ID');
  if (!finalConfig.AZURE_CLIENT_ID) criticalMissing.push('AZURE_CLIENT_ID');
  if (!finalConfig.ATLASSIAN_CLIENT_ID)
    criticalMissing.push('ATLASSIAN_CLIENT_ID');

  if (criticalMissing.length > 0) {
    console.warn(
      `⚠️  Missing critical configuration: ${criticalMissing.join(', ')}`
    );
    console.warn('💡 Services may fail to initialize without these values');
  } else {
    console.log('✅ All critical configuration values present');
  }

  return finalConfig;
};

/**
 * Extracts Slack-specific configuration from AppConfig
 */
export const getSlackConfig = (appConfig: AppConfig): SlackConfig => ({
  SLACK_CLIENT_ID: appConfig.SLACK_CLIENT_ID,
  SLACK_CLIENT_SECRET: appConfig.SLACK_CLIENT_SECRET,
  SLACK_STATE_SECRET: appConfig.SLACK_STATE_SECRET,
  SLACK_REDIRECT_URI: appConfig.SLACK_REDIRECT_URI,
  SLACK_TOKEN: appConfig.SLACK_TOKEN,
});

/**
 * Extracts Azure-specific configuration from AppConfig
 */
export const getAzureConfig = (appConfig: AppConfig): AzureConfig => ({
  AZURE_CLIENT_ID: appConfig.AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET: appConfig.AZURE_CLIENT_SECRET,
  AZURE_TENANT_ID: appConfig.AZURE_TENANT_ID,
  AZURE_REDIRECT_URI: appConfig.AZURE_REDIRECT_URI,
});

/**
 * Extracts Atlassian-specific configuration from AppConfig
 */
export const getAtlassianConfig = (appConfig: AppConfig): AtlassianConfig => ({
  ATLASSIAN_CLIENT_ID: appConfig.ATLASSIAN_CLIENT_ID,
  ATLASSIAN_CLIENT_SECRET: appConfig.ATLASSIAN_CLIENT_SECRET,
  ATLASSIAN_REDIRECT_URI: appConfig.ATLASSIAN_REDIRECT_URI,
});

/**
 * Extracts AWS-specific configuration from AppConfig
 */
export const getAWSConfig = (appConfig: AppConfig): AWSConfig => ({
  AWS_BEDROCK_CLAUDE_37_MODEL_ID: appConfig.AWS_BEDROCK_CLAUDE_37_MODEL_ID,
  AWS_BEDROCK_CLAUDE_35_MODEL_ID: appConfig.AWS_BEDROCK_CLAUDE_35_MODEL_ID,
  AWS_REGION: appConfig.AWS_REGION,
});

/**
 * Extracts General configuration from AppConfig
 */
export const getGeneralConfig = (appConfig: AppConfig): GeneralConfig => ({
  HOME_PAGE_URL: appConfig.HOME_PAGE_URL,
});
