import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hostsmith } from "../client.js";
import { SitesResource } from "../resources/sites.js";
import { DomainsResource } from "../resources/domains.js";
import { AccountResource } from "../resources/account.js";

function makeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${header}.${payload}.sig`;
}

describe("Hostsmith client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
    } as Partial<Response>);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves us partition to correct base URL", async () => {
    const client = new Hostsmith({ accessToken: "tok", partition: "us" });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://us.api.hostsmith.net/v1/sites",
      expect.anything(),
    );
  });

  it("resolves eu partition to correct base URL", async () => {
    const client = new Hostsmith({ accessToken: "tok", partition: "eu" });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://eu.api.hostsmith.net/v1/sites",
      expect.anything(),
    );
  });

  it("uses custom baseUrl when provided", async () => {
    const client = new Hostsmith({
      accessToken: "tok",
      baseUrl: "https://custom.api.local",
    });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://custom.api.local/v1/sites",
      expect.anything(),
    );
  });

  it("infers partition from homePartition claim", async () => {
    const client = new Hostsmith({
      accessToken: makeJwt({ homePartition: "eu" }),
    });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://eu.api.hostsmith.net/v1/sites",
      expect.anything(),
    );
  });

  it("explicit partition wins over homePartition claim", async () => {
    const client = new Hostsmith({
      accessToken: makeJwt({ homePartition: "eu" }),
      partition: "us",
    });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://us.api.hostsmith.net/v1/sites",
      expect.anything(),
    );
  });

  it("does not infer partition from aud", () => {
    expect(() =>
      new Hostsmith({
        accessToken: makeJwt({ aud: "https://eu.api.hostsmith.net" }),
      }),
    ).toThrow(/partition/i);
  });

  it("requires partition when homePartition claim is missing", () => {
    expect(() =>
      new Hostsmith({ accessToken: makeJwt({}) }),
    ).toThrow(/partition/i);
  });

  it("requires partition when homePartition claim is unknown", () => {
    expect(() =>
      new Hostsmith({ accessToken: makeJwt({ homePartition: "ap" }) }),
    ).toThrow(/partition/i);
  });

  it("respects partitionUrls override (e.g. dev hosts)", async () => {
    const client = new Hostsmith({
      accessToken: "tok",
      partition: "us",
      partitionUrls: {
        us: "https://us.api.hostsmith-dev.com",
        eu: "https://eu.api.hostsmith-dev.com",
      },
    });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://us.api.hostsmith-dev.com/v1/sites",
      expect.anything(),
    );
  });

  it("infers partition from homePartition claim against overridden partitionUrls", async () => {
    const client = new Hostsmith({
      accessToken: makeJwt({ homePartition: "eu" }),
      partitionUrls: { eu: "https://eu.api.hostsmith-dev.com" },
    });
    await client.sites.list();
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledWith(
      "https://eu.api.hostsmith-dev.com/v1/sites",
      expect.anything(),
    );
  });

  it("exposes sites, domains, and account resources", () => {
    const client = new Hostsmith({ accessToken: "tok", partition: "us" });
    expect(client.sites).toBeInstanceOf(SitesResource);
    expect(client.domains).toBeInstanceOf(DomainsResource);
    expect(client.account).toBeInstanceOf(AccountResource);
  });
});
