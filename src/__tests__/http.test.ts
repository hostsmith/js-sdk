import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http.js";
import { ApiError, AuthError, HostsmithError } from "../errors.js";

describe("HttpClient", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response?: Partial<Response>) {
    const defaults: Partial<Response> = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({ result: "ok" }),
      headers: new Headers(),
    };
    const merged = { ...defaults, ...response } as Response;
    vi.mocked(globalThis.fetch).mockResolvedValue(merged);
    return vi.mocked(globalThis.fetch);
  }

  it("strips trailing slashes from baseUrl", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com///", "tok");
    await client.get("/v1/test");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/v1/test",
      expect.anything(),
    );
  });

  it("calls fetch with GET method", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok");
    await client.get("/v1/things");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/v1/things",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("calls fetch with POST method and body", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok");
    await client.post("/v1/things", { name: "a" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/v1/things",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "a" }),
      }),
    );
  });

  it("calls fetch with DELETE method", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok");
    await client.delete("/v1/things/123");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.example.com/v1/things/123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("returns parsed JSON on success", async () => {
    mockFetch({
      json: () => Promise.resolve({ sites: [] }),
    });
    const client = new HttpClient("https://api.example.com", "tok");
    const result = await client.get("/v1/sites");
    expect(result).toEqual({ sites: [] });
  });

  it("throws AuthError on 401", async () => {
    mockFetch({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () =>
        Promise.resolve({ error: "token_expired", message: "Token expired" }),
    });
    const client = new HttpClient("https://api.example.com", "tok");
    await expect(client.get("/v1/me")).rejects.toThrow(AuthError);
    try {
      await client.get("/v1/me");
    } catch (err) {
      const authErr = err as AuthError;
      expect(authErr.status).toBe(401);
      expect(authErr.errorCode).toBe("token_expired");
      expect(authErr.message).toBe("Token expired");
    }
  });

  it("throws ApiError on other HTTP errors", async () => {
    mockFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () =>
        Promise.resolve({ error: "not_found", message: "Site not found" }),
    });
    const client = new HttpClient("https://api.example.com", "tok");
    await expect(client.get("/v1/sites/xyz")).rejects.toThrow(ApiError);
    try {
      await client.get("/v1/sites/xyz");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.errorCode).toBe("not_found");
    }
  });

  it("throws HostsmithError on network failure", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error("DNS failed"));
    const client = new HttpClient("https://api.example.com", "tok");
    await expect(client.get("/v1/test")).rejects.toThrow(HostsmithError);
    await expect(client.get("/v1/test")).rejects.toThrow("DNS failed");
  });

  it("throws ApiError with fallback message when error body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.reject(new Error("not json")),
    });
    const client = new HttpClient("https://api.example.com", "tok");
    try {
      await client.get("/v1/test");
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr).toBeInstanceOf(ApiError);
      expect(apiErr.status).toBe(500);
      expect(apiErr.errorCode).toBe("unknown");
      expect(apiErr.message).toBe("HTTP 500 Internal Server Error");
    }
  });
});
