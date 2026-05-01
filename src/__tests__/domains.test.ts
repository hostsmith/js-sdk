import { describe, it, expect, vi } from "vitest";
import { DomainsResource } from "../resources/domains.js";
import type { HttpClient } from "../http.js";

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({ domains: [] }),
  } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };
}

describe("DomainsResource", () => {
  it("list() with no params calls GET /v1/domains", async () => {
    const http = createMockHttp();
    const domains = new DomainsResource(http);
    await domains.list();
    expect(http.get).toHaveBeenCalledWith("/v1/domains");
  });

  it("list({ shared: true }) appends ?shared=true", async () => {
    const http = createMockHttp();
    const domains = new DomainsResource(http);
    await domains.list({ shared: true });
    expect(http.get).toHaveBeenCalledWith("/v1/domains?shared=true");
  });

  it("list({ shared: false }) appends ?shared=false", async () => {
    const http = createMockHttp();
    const domains = new DomainsResource(http);
    await domains.list({ shared: false });
    expect(http.get).toHaveBeenCalledWith("/v1/domains?shared=false");
  });
});
