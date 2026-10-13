import { ApiError, AuthError, HostsmithError } from "./errors.js";

/** The Hostsmith authorization server, where API tokens are exchanged. */
export const DEFAULT_AUTH_URL = "https://hostsmith.net";

const TOKEN_EXCHANGE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:token-exchange";
const API_TOKEN_SUBJECT_TYPE = "urn:hostsmith:params:oauth:token-type:api-token";
export const API_TOKEN_PREFIX = "hsat_";

// Exchange again when the access token has less than this left.
const RENEW_BEFORE_MS = 60_000;
// A token created moments ago may not have reached the token endpoint's region yet.
const FIRST_EXCHANGE_RETRY_MS = 2_000;

/** Where the HTTP client gets the bearer token for each request. */
export interface TokenSource {
  getToken(): Promise<string>;
  /** Drops the current token after a 401. Returns whether a new one can be obtained. */
  invalidate(): boolean;
}

/** A fixed OAuth access token. */
export class StaticTokenSource implements TokenSource {
  constructor(private readonly token: string) {}

  async getToken(): Promise<string> {
    return this.token;
  }

  invalidate(): boolean {
    return false;
  }
}

type ExchangeResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/**
 * An API token, exchanged at the token endpoint (RFC 8693) for 1-hour access
 * tokens. The API token is sent nowhere else and never appears in errors.
 */
export class ApiTokenSource implements TokenSource {
  private cached: { token: string; expiresAt: number } | undefined;
  private inFlight: Promise<string> | undefined;
  private exchangedOnce = false;

  constructor(
    private readonly apiToken: string,
    private readonly authUrl: string,
    private readonly userAgent: string,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  getToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - Date.now() > RENEW_BEFORE_MS) {
      return Promise.resolve(this.cached.token);
    }
    // Concurrent requests share one exchange.
    this.inFlight ??= this.exchange().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  invalidate(): boolean {
    this.cached = undefined;
    return true;
  }

  private async exchange(): Promise<string> {
    try {
      return await this.exchangeOnce();
    } catch (error) {
      if (!this.exchangedOnce && error instanceof AuthError && error.errorCode === "invalid_grant") {
        await this.sleep(FIRST_EXCHANGE_RETRY_MS);
        return this.exchangeOnce();
      }
      throw error;
    }
  }

  private async exchangeOnce(): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.authUrl}/api/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
        body: new URLSearchParams({
          grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
          subject_token: this.apiToken,
          subject_token_type: API_TOKEN_SUBJECT_TYPE,
        }).toString(),
      });
    } catch (err) {
      throw new HostsmithError(`API token exchange failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    let data: ExchangeResponse | undefined;
    try {
      data = (await response.json()) as ExchangeResponse;
    } catch {
      // Not JSON
    }

    if (!response.ok || !data?.access_token) {
      const code = data?.error ?? "unknown";
      if (code === "invalid_grant") {
        throw new AuthError(code, data?.error_description ?? "API token is invalid, expired or revoked");
      }
      throw new ApiError(response.status, code, data?.error_description ?? `API token exchange failed: HTTP ${response.status}`);
    }

    this.exchangedOnce = true;
    this.cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
    return data.access_token;
  }
}
