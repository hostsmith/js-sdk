import { describe, it, expect, vi } from "vitest";
import { RedirectsResource } from "../resources/redirects.js";
import { SitesResource } from "../resources/sites.js";
import type { HttpClient } from "../http.js";

function createMockHttp() {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as HttpClient & Record<"get" | "post" | "put" | "patch" | "delete", ReturnType<typeof vi.fn>>;
}

describe("RedirectsResource", () => {
  it("is reachable as sites.redirects", () => {
    expect(new SitesResource(createMockHttp()).redirects).toBeInstanceOf(RedirectsResource);
  });

  it("list() calls GET with the page in the query", async () => {
    const http = createMockHttp();
    const redirects = new RedirectsResource(http);
    await redirects.list("s1");
    await redirects.list("s1", { offset: 1000, limit: 200 });
    expect(http.get).toHaveBeenNthCalledWith(1, "/v1/sites/s1/redirects");
    expect(http.get).toHaveBeenNthCalledWith(2, "/v1/sites/s1/redirects?offset=1000&limit=200");
  });

  it("set() replaces with rules or text, and sends the version as If-Match", async () => {
    const http = createMockHttp();
    const redirects = new RedirectsResource(http);
    await redirects.set("s1", { rules: [{ from: "/a", to: "/b" }] });
    await redirects.set("s1", { text: "/a /b 302\n" }, { version: 4 });
    expect(http.put).toHaveBeenNthCalledWith(1, "/v1/sites/s1/redirects", { rules: [{ from: "/a", to: "/b" }] }, undefined);
    expect(http.put).toHaveBeenNthCalledWith(2, "/v1/sites/s1/redirects", { text: "/a /b 302\n" }, { "If-Match": '"4"' });
  });

  it("set() sends version 0 as If-Match", async () => {
    const http = createMockHttp();
    await new RedirectsResource(http).set("s1", { text: "" }, { version: 0 });
    expect(http.put).toHaveBeenCalledWith("/v1/sites/s1/redirects", { text: "" }, { "If-Match": '"0"' });
  });

  it("edit() calls PATCH with the operations", async () => {
    const http = createMockHttp();
    const operations = [
      { op: "add" as const, rule: { from: "/a", to: "/b" }, position: 0 },
      { op: "delete" as const, id: "r_1" },
    ];
    await new RedirectsResource(http).edit("s1", operations, { version: 2 });
    expect(http.patch).toHaveBeenCalledWith("/v1/sites/s1/redirects", { operations }, { "If-Match": '"2"' });
  });

  it("add() calls POST with the rule", async () => {
    const http = createMockHttp();
    http.post.mockResolvedValue({ rule: { id: "r_1", from: "/a", to: "/b", status: 301 }, version: 1 });
    const result = await new RedirectsResource(http).add("s1", { from: "/a", to: "/b", position: 0 });
    expect(http.post).toHaveBeenCalledWith("/v1/sites/s1/redirects", { from: "/a", to: "/b", position: 0 });
    expect(result.version).toBe(1);
  });

  it("delete() calls DELETE with the encoded rule id", async () => {
    const http = createMockHttp();
    await expect(new RedirectsResource(http).delete("s1", "r_1/x")).resolves.toBeUndefined();
    expect(http.delete).toHaveBeenCalledWith("/v1/sites/s1/redirects/r_1%2Fx");
  });

  it("setFileRules() calls PUT on file-rules", async () => {
    const http = createMockHttp();
    await new RedirectsResource(http).setFileRules("s1", false);
    expect(http.put).toHaveBeenCalledWith("/v1/sites/s1/redirects/file-rules", { enabled: false });
  });

  it("test() calls POST on test with the path and drafts", async () => {
    const http = createMockHttp();
    const params = { path: "/old?x=1", draftText: "/old /new\n" };
    await new RedirectsResource(http).test("s1", params);
    expect(http.post).toHaveBeenCalledWith("/v1/sites/s1/redirects/test", params);
  });

  it("URL-encodes the site id", async () => {
    const http = createMockHttp();
    await new RedirectsResource(http).list("a/b");
    expect(http.get).toHaveBeenCalledWith("/v1/sites/a%2Fb/redirects");
  });
});
