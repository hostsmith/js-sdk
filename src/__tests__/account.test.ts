import { describe, it, expect, vi } from "vitest";
import { AccountResource } from "../resources/account.js";
import type { HttpClient } from "../http.js";

describe("AccountResource", () => {
  it("get() calls GET /v1/account", async () => {
    const http = {
      get: vi.fn().mockResolvedValue({ account: { orgId: "o1" } }),
    } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };

    const account = new AccountResource(http);
    await account.get();
    expect(http.get).toHaveBeenCalledWith("/v1/account");
  });
});
