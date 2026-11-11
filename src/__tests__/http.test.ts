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

  it("calls fetch with PUT and PATCH, the body and extra headers", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok");
    await client.put("/v1/things", { a: 1 }, { "If-Match": '"4"' });
    await client.patch("/v1/things", { b: 2 });
    const put = fetcher.mock.calls[0][1] as RequestInit;
    const patch = fetcher.mock.calls[1][1] as RequestInit;
    expect(put).toMatchObject({ method: "PUT", body: JSON.stringify({ a: 1 }) });
    expect((put.headers as Record<string, string>)["If-Match"]).toBe('"4"');
    expect((put.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(patch).toMatchObject({ method: "PATCH", body: JSON.stringify({ b: 2 }) });
    expect((patch.headers as Record<string, string>)["If-Match"]).toBeUndefined();
  });

  it("returns undefined on 204 without reading a body", async () => {
    const json = vi.fn(() => Promise.reject(new Error("no body")));
    mockFetch({ status: 204, statusText: "No Content", json });
    const client = new HttpClient("https://api.example.com", "tok");
    await expect(client.delete("/v1/things/1")).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  function sentUserAgent(fetcher: ReturnType<typeof mockFetch>): string {
    const init = fetcher.mock.calls[0][1] as RequestInit;
    return (init.headers as Record<string, string>)["User-Agent"];
  }

  it("sends the SDK product token alone as User-Agent by default", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok");
    await client.get("/v1/sites");
    expect(sentUserAgent(fetcher)).toMatch(/^hostsmith-js-sdk\/\S+$/);
  });

  it("puts the caller's product token before the SDK token", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok", "hostsmith-mcp-server/1.6.0");
    await client.post("/v1/sites", { subdomain: "a" });
    expect(sentUserAgent(fetcher)).toMatch(/^hostsmith-mcp-server\/1\.6\.0 hostsmith-js-sdk\/\S+$/);
  });

  it("ignores a blank caller token", async () => {
    const fetcher = mockFetch();
    const client = new HttpClient("https://api.example.com", "tok", "  ");
    await client.get("/v1/sites");
    expect(sentUserAgent(fetcher)).toMatch(/^hostsmith-js-sdk\/\S+$/);
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
      expect(apiErr.details).toBeUndefined();
    }
  });

  it("keeps the error body's other fields as details", async () => {
    mockFetch({
      ok: false,
      status: 409,
      statusText: "Conflict",
      json: () =>
        Promise.resolve({ error: "FileRule", message: "Line 3 is a file rule", managedBy: "file", line: 3, index: 1 }),
    });
    const client = new HttpClient("https://api.example.com", "tok");
    const err = (await client.patch("/v1/sites/s1/redirects", {}).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.errorCode).toBe("FileRule");
    expect(err.message).toBe("Line 3 is a file rule");
    expect(err.details).toEqual({ managedBy: "file", line: 3, index: 1 });
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
