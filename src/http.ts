import { ApiError, AuthError, HostsmithError } from "./errors.js";
import type { ApiErrorBody } from "./types.js";

export class HttpClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(baseUrl: string, accessToken: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.accessToken = accessToken;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new HostsmithError(
        `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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
