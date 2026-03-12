/**
 * Playwright fixture for managing the mock OIDC Identity Provider.
 *
 * Starts the oidc-server-mock Docker container before tests and stops it after.
 * The mock IdP exposes OIDC discovery at http://localhost:9090/.well-known/openid-configuration
 *
 * Test clients are configured in infra/oidc-mock/oidc-mock-config.json
 * Test users are configured in infra/oidc-mock/oidc-mock-users.json
 */

import { test as base, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';

// Resolve project root (frontend/e2e/fixtures -> project root)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const COMPOSE_FILE = path.join(PROJECT_ROOT, 'infra', 'oidc-mock', 'docker-compose.yml');
const OIDC_MOCK_URL = 'http://localhost:9090';
const HEALTH_CHECK_URL = `${OIDC_MOCK_URL}/.well-known/openid-configuration`;
const HEALTH_CHECK_TIMEOUT_MS = 60_000;
const HEALTH_CHECK_INTERVAL_MS = 2_000;

/** Test client credentials matching oidc-mock-config.json */
export const OIDC_CLIENTS = {
  okta: {
    clientId: 'pilot-space-okta-test',
    clientSecret: 'okta-test-secret-2024',
    provider: 'okta' as const,
    testUser: {
      username: 'okta-test-user',
      password: 'OktaTestPass123!',
      email: 'okta-user@pilotspace.dev',
      name: 'Okta Test User',
    },
  },
  azure: {
    clientId: 'pilot-space-azure-test',
    clientSecret: 'azure-test-secret-2024',
    provider: 'azure' as const,
    testUser: {
      username: 'azure-test-user',
      password: 'AzureTestPass123!',
      email: 'azure-user@pilotspace.dev',
      name: 'Azure AD Test User',
    },
  },
  google: {
    clientId: 'pilot-space-google-test',
    clientSecret: 'google-test-secret-2024',
    provider: 'google' as const,
    testUser: {
      username: 'google-test-user',
      password: 'GoogleTestPass123!',
      email: 'google-user@pilotspace.dev',
      name: 'Google Workspace Test User',
    },
  },
} as const;

export type OidcProviderKey = keyof typeof OIDC_CLIENTS;

export interface OidcMockFixture {
  /** Base URL of the mock OIDC IdP */
  baseUrl: string;
  /** OIDC discovery endpoint URL */
  discoveryUrl: string;
  /** Get test client config by provider name */
  getClient: (provider: OidcProviderKey) => (typeof OIDC_CLIENTS)[OidcProviderKey];
  /** Whether the mock IdP is running and healthy */
  isHealthy: boolean;
}

/**
 * Wait for the mock OIDC server to be healthy by polling the discovery endpoint.
 */
async function waitForOidcMock(): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT_MS) {
    try {
      const response = await fetch(HEALTH_CHECK_URL);
      if (response.ok) {
        const discovery = await response.json();
        // Verify it's a valid OIDC discovery document
        if (discovery.issuer && discovery.authorization_endpoint) {
          return true;
        }
      }
    } catch {
      // Server not ready yet — retry
    }

    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS));
  }

  return false;
}

/**
 * Start the mock OIDC IdP Docker container.
 * Idempotent — if already running, docker compose up is a no-op.
 */
function startOidcMock(): void {
  try {
    execSync(`docker compose -f "${COMPOSE_FILE}" up -d --wait`, {
      stdio: 'pipe',
      timeout: 90_000,
      cwd: PROJECT_ROOT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start OIDC mock container: ${message}`);
  }
}

/**
 * Stop and remove the mock OIDC IdP Docker container.
 */
function stopOidcMock(): void {
  try {
    execSync(`docker compose -f "${COMPOSE_FILE}" down --volumes`, {
      stdio: 'pipe',
      timeout: 30_000,
      cwd: PROJECT_ROOT,
    });
  } catch {
    // Best-effort cleanup — don't fail tests on teardown errors
    console.warn('Warning: Failed to stop OIDC mock container');
  }
}

/**
 * Playwright test with OIDC mock IdP fixture.
 *
 * Usage:
 *   import { test, expect } from './fixtures/oidc-mock';
 *
 *   test('oidc login flow', async ({ page, oidcMock }) => {
 *     const client = oidcMock.getClient('okta');
 *     // ... test OIDC flow
 *   });
 */
export const test = base.extend<{ oidcMock: OidcMockFixture }>({
  oidcMock: [
    async ({}, use) => {
      // Start the mock IdP
      startOidcMock();

      // Wait for it to be healthy
      const isHealthy = await waitForOidcMock();
      if (!isHealthy) {
        throw new Error(
          `OIDC mock server did not become healthy within ${HEALTH_CHECK_TIMEOUT_MS}ms. ` +
            `Check Docker logs: docker compose -f "${COMPOSE_FILE}" logs`
        );
      }

      const fixture: OidcMockFixture = {
        baseUrl: OIDC_MOCK_URL,
        discoveryUrl: HEALTH_CHECK_URL,
        getClient: (provider: OidcProviderKey) => OIDC_CLIENTS[provider],
        isHealthy,
      };

      await use(fixture);

      // Teardown: stop container after all tests using this fixture
      stopOidcMock();
    },
    { scope: 'worker' },
  ],
});

export { expect };
