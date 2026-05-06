import { describe, it, expect, vi } from "vitest";
import { AccountResource } from "../resources/account.js";
import type { HttpClient } from "../http.js";
import type { Account } from "../types.js";

describe("AccountResource", () => {
  it("get() calls GET /v1/account", async () => {
    const http = {
      get: vi.fn().mockResolvedValue({ account: { orgId: "o1" } }),
    } as unknown as HttpClient & { get: ReturnType<typeof vi.fn> };

    const account = new AccountResource(http);
    await account.get();
    expect(http.get).toHaveBeenCalledWith("/v1/account");
  });

  it("Account type has orgName, user.homePartition, and no top-level partition or name", () => {
    const account: Account = {
      orgId: "o1",
      orgName: "Acme",
      user: { homePartition: "eu" },
      plan: {
        title: "Standard",
        sitesLimit: 5,
        domainsLimit: 5,
        uploadLimit: 1024,
        storageLimit: 10240,
        dataResidencySelector: false,
      },
      usage: { sites: 0, domains: 0, storage: 0 },
    };

    expect(account.orgName).toBe("Acme");
    expect(account.user.homePartition).toBe("eu");
    expect(account).not.toHaveProperty("partition");
    expect(account).not.toHaveProperty("name");
  });
});
