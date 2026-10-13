import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hostsmith } from "../client.js";
import { AuthError } from "../errors.js";

// A client created with `apiToken` exchanges it at the token endpoint for
// 1-hour access tokens, renews them, and takes the partition from the first
// exchanged token when `partition` isn't given.

const API_TOKEN = "hsat_0123456789abcdefghijABCDEFGHIJ0123456789";
const TOKEN_URL = "https://hostsmith.net/api/oauth/token";

function jwt(claims: Record<string, unknown>): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part(claims)}.sig`;
}

const json = (status: number, body: unknown) =>
  ({ ok: status < 400, status, statusText: "", json: () => Promise.resolve(body), headers: new Headers() }) as Response;

let exchanges = 0;
let apiResponses: Response[] = [];

function install(exchangeResponse: (n: number) => Response) {
  exchanges = 0;
  globalThis.fetch = vi.fn(async (url: string | URL) => {
    if (String(url) === TOKEN_URL || String(url).endsWith("/api/oauth/token")) return exchangeResponse(++exchanges);
    return apiResponses.shift() ?? json(200, { sites: [] });
  }) as unknown as typeof fetch;
}

const okExchange = (n: number) => json(200, { access_token: jwt({ homePartition: "eu", n }), token_type: "Bearer", expires_in: 3600 });
const calls = () => vi.mocked(globalThis.fetch).mock.calls.map(([url, init]) => ({ url: String(url), init: init as RequestInit }));
const apiCalls = () => calls().filter((c) => !c.url.endsWith("/api/oauth/token"));
const bearer = (c: { init: RequestInit }) => (c.init.headers as Record<string, string>).Authorization;

describe("Hostsmith client with apiToken", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    apiResponses = [];
    install(okExchange);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("exchanges the API token and sends only the access token to the API", async () => {
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us", userAgent: "hostsmith-site-kit/0.2.0" });
    await client.sites.list();

    const [exchange, request] = calls();
    expect(exchange!.url).toBe(TOKEN_URL);
    expect(exchange!.init.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(exchange!.init.body as string))).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: API_TOKEN,
      subject_token_type: "urn:hostsmith:params:oauth:token-type:api-token",
    });
    expect((exchange!.init.headers as Record<string, string>)["User-Agent"]).toMatch(/^hostsmith-site-kit\/0\.2\.0 hostsmith-js-sdk\//);
    expect(request!.url).toBe("https://us.api.hostsmith.net/v1/sites");
    expect(bearer(request!)).toBe(`Bearer ${jwt({ homePartition: "eu", n: 1 })}`);
    for (const c of apiCalls()) expect(JSON.stringify(c.init)).not.toContain(API_TOKEN);
  });

  it("takes the partition from the first exchanged token", async () => {
    const client = new Hostsmith({ apiToken: API_TOKEN });
    await client.sites.list();
    expect(apiCalls()[0]!.url).toBe("https://eu.api.hostsmith.net/v1/sites");
  });

  it("uses authUrl for the exchange", async () => {
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us", authUrl: "https://hostsmith-dev.com/" });
    await client.sites.list();
    expect(calls()[0]!.url).toBe("https://hostsmith-dev.com/api/oauth/token");
  });

  it("reuses the access token until it nears expiry, then exchanges again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us" });
    await client.sites.list();
    await client.sites.list();
    expect(exchanges).toBe(1);

    vi.setSystemTime(Date.now() + 59 * 60_000 + 1_000); // less than 60 s left
    await client.sites.list();
    expect(exchanges).toBe(2);

    vi.setSystemTime(Date.now() + 2 * 3600_000); // two hours on
    await client.sites.list();
    expect(exchanges).toBe(3);
    expect(apiCalls().map(bearer)).toEqual([1, 1, 2, 3].map((n) => `Bearer ${jwt({ homePartition: "eu", n })}`));
  });

  it("shares one exchange between concurrent requests", async () => {
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us" });
    await Promise.all([client.sites.list(), client.sites.list(), client.account.get()]);
    expect(exchanges).toBe(1);
  });

  it("exchanges again once after a 401, then retries the request", async () => {
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us" });
    apiResponses = [json(401, { error: "unauthorized", message: "Invalid or expired token" })];
    await client.sites.list();
    expect(exchanges).toBe(2);
    expect(apiCalls()).toHaveLength(2);
  });

  it("gives up after a second 401", async () => {
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us" });
    apiResponses = [json(401, { error: "unauthorized" }), json(401, { error: "unauthorized", message: "Invalid or expired token" })];
    await expect(client.sites.list()).rejects.toBeInstanceOf(AuthError);
    expect(apiCalls()).toHaveLength(2);
  });

  it("throws an AuthError without the token for a revoked token, after one retry", async () => {
    install(() => json(400, { error: "invalid_grant", error_description: "API token is invalid, expired or revoked" }));
    vi.useFakeTimers();
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us" });

    const result = client.sites.list().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2_000);
    const error = (await result) as AuthError;

    expect(error).toBeInstanceOf(AuthError);
    expect(error.message).toBe("API token is invalid, expired or revoked");
    expect(error.message).not.toContain(API_TOKEN);
    expect(exchanges).toBe(2);
    expect(apiCalls()).toHaveLength(0);
  });

  it("succeeds when the retry finds a newly created token", async () => {
    install((n) => (n === 1 ? json(400, { error: "invalid_grant" }) : okExchange(n)));
    vi.useFakeTimers();
    const client = new Hostsmith({ apiToken: API_TOKEN, partition: "us" });

    const result = client.sites.list();
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(result).resolves.toEqual({ sites: [] });
  });

  it("refuses both tokens, none, or a non-API token", () => {
    expect(() => new Hostsmith({ apiToken: API_TOKEN, accessToken: "tok", partition: "us" })).toThrow(/not both/);
    expect(() => new Hostsmith({ partition: "us" })).toThrow(/requires `accessToken` or `apiToken`/);
    expect(() => new Hostsmith({ apiToken: "eyJ.not.api", partition: "us" })).toThrow(/starting with "hsat_"/);
  });
});
