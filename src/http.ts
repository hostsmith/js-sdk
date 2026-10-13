import { ApiError, AuthError, HostsmithError } from "./errors.js";
import { StaticTokenSource, type TokenSource } from "./tokens.js";
import type { ApiErrorBody } from "./types.js";
import { SDK_USER_AGENT } from "./version.js";

/** The `User-Agent` value: the caller's product token(s), then the SDK's own. */
export function buildUserAgent(userAgent?: string): string {
  const prefix = userAgent?.trim();
  return prefix ? `${prefix} ${SDK_USER_AGENT}` : SDK_USER_AGENT;
}

export class HttpClient {
  private baseUrl: string | undefined;
  private baseUrlPromise: Promise<string> | undefined;
  private readonly resolveBaseUrl: (() => Promise<string>) | undefined;
  private readonly tokens: TokenSource;
  private readonly userAgent: string;

  /**
   * @param baseUrl - the API base URL, or a function that resolves it before
   *   the first request (used when the partition comes from an exchanged token).
   * @param auth - a fixed access token, or a source that renews it.
   * @param userAgent - caller's product token(s), sent before the SDK's own
   *   `hostsmith-js-sdk/<version>` token in the `User-Agent` header.
   */
  constructor(baseUrl: string | (() => Promise<string>), auth: string | TokenSource, userAgent?: string) {
    if (typeof baseUrl === "string") this.baseUrl = baseUrl.replace(/\/+$/, "");
    else this.resolveBaseUrl = baseUrl;
    this.tokens = typeof auth === "string" ? new StaticTokenSource(auth) : auth;
    this.userAgent = buildUserAgent(userAgent);
  }

  private async getBaseUrl(): Promise<string> {
    if (this.baseUrl !== undefined) return this.baseUrl;
    this.baseUrlPromise ??= this.resolveBaseUrl!().then((url) => {
      this.baseUrl = url.replace(/\/+$/, "");
      return this.baseUrl;
    });
    return this.baseUrlPromise;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${await this.getBaseUrl()}${path}`;
    let response = await this.send(method, url, await this.tokens.getToken(), body);
    // A renewable token gets one more try with a fresh access token.
    if (response.status === 401 && this.tokens.invalidate()) {
      response = await this.send(method, url, await this.tokens.getToken(), body);
    }

    if (!response.ok) {
      let errorBody: ApiErrorBody | undefined;
      try {
        errorBody = (await response.json()) as ApiErrorBody;
      } catch {
        // Response body is not JSON
      }

      const errorCode = errorBody?.error ?? "unknown";
      const message =
        errorBody?.message ?? `HTTP ${response.status} ${response.statusText}`;

      if (response.status === 401) {
        throw new AuthError(errorCode, message);
      }
      throw new ApiError(response.status, errorCode, message);
    }

    return (await response.json()) as T;
  }

  private async send(method: string, url: string, token: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": this.userAgent,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    try {
      return await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new HostsmithError(
        `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
