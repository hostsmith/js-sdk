import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SitesResource } from "../resources/sites.js";
import type { HttpClient } from "../http.js";

function createMockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

describe("SitesResource", () => {
  it("list() calls GET /v1/sites", async () => {
    const http = createMockHttp();
    http.get.mockResolvedValue({ sites: [] });
    const sites = new SitesResource(http);
    await sites.list();
    expect(http.get).toHaveBeenCalledWith("/v1/sites");
  });

  it("get() calls GET /v1/sites/<id>", async () => {
    const http = createMockHttp();
    http.get.mockResolvedValue({ id: "s1" });
    const sites = new SitesResource(http);
    await sites.get("s1");
    expect(http.get).toHaveBeenCalledWith("/v1/sites/s1");
  });

  it("get() URL-encodes special characters in siteId", async () => {
    const http = createMockHttp();
    http.get.mockResolvedValue({ id: "a/b c" });
    const sites = new SitesResource(http);
    await sites.get("a/b c");
    expect(http.get).toHaveBeenCalledWith("/v1/sites/a%2Fb%20c");
  });

  it("create() posts body to POST /v1/sites", async () => {
    const http = createMockHttp();
    http.post.mockResolvedValue({ siteId: "new-id" });
    const sites = new SitesResource(http);
    const params = { subdomain: "my", domain: "hostsmith.link" };
    await sites.create(params);
    expect(http.post).toHaveBeenCalledWith("/v1/sites", params);
  });

  it("delete() calls DELETE /v1/sites/<encoded id>", async () => {
    const http = createMockHttp();
    http.delete.mockResolvedValue({ status: "DELETING" });
    const sites = new SitesResource(http);
    await sites.delete("id/special");
    expect(http.delete).toHaveBeenCalledWith("/v1/sites/id%2Fspecial");
  });
});

describe("SitesResource.deploy", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function setupDeployMocks(http: ReturnType<typeof createMockHttp>, opts?: {
    fileCount?: number;
    partsPerFile?: number;
  }) {
    const fileCount = opts?.fileCount ?? 1;
    const partsPerFile = opts?.partsPerFile ?? 1;

    const filesResponse: Record<string, {
      uploadId: string;
      key: string;
      partUploadUrls: { part: number; url: string }[];
    }> = {};

    for (let i = 0; i < fileCount; i++) {
      const fileName = `file${i}.html`;
      const partUrls = [];
      for (let p = 1; p <= partsPerFile; p++) {
        partUrls.push({ part: p, url: `https://s3.example.com/${fileName}/part${p}` });
      }
      filesResponse[fileName] = {
        uploadId: `upload-${i}`,
        key: `key-${i}`,
        partUploadUrls: partUrls,
      };
    }

    http.post
      .mockResolvedValueOnce({ versionId: "v1", files: filesResponse })
      .mockResolvedValueOnce({ status: "DEPLOYED" });

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ ETag: '"abc123"' }),
      } as Partial<Response> as Response),
    );

    return vi.mocked(globalThis.fetch);
  }

  it("deploys DeployFile array without reading directory", async () => {
    const http = createMockHttp();
    setupDeployMocks(http);
    const sites = new SitesResource(http);

    const files = [{ fileName: "file0.html", content: Buffer.from("<h1>hi</h1>") }];
    await sites.deploy("site1", files);

    expect(http.post).toHaveBeenCalledWith(
      "/v1/sites/site1/uploads",
      { files: [{ fileName: "file0.html", fileSize: 11, parts: 1 }] },
    );
  });

  it("builds manifest with correct part count for large files", async () => {
    const http = createMockHttp();
    const PART_SIZE = 5 * 1024 * 1024;
    const bigContent = Buffer.alloc(PART_SIZE * 2 + 100);

    const filesResponse: Record<string, any> = {
      "big.bin": {
        uploadId: "u1",
        key: "k1",
        partUploadUrls: [
          { part: 1, url: "https://s3.example.com/big/1" },
          { part: 2, url: "https://s3.example.com/big/2" },
          { part: 3, url: "https://s3.example.com/big/3" },
        ],
      },
    };
    http.post
      .mockResolvedValueOnce({ versionId: "v1", files: filesResponse })
      .mockResolvedValueOnce({ status: "DEPLOYED" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ ETag: '"etag"' }),
    } as Partial<Response> as Response);

    const sites = new SitesResource(http);
    await sites.deploy("s1", [{ fileName: "big.bin", content: bigContent }]);

    expect(http.post).toHaveBeenCalledWith(
      "/v1/sites/s1/uploads",
      { files: [{ fileName: "big.bin", fileSize: 5 * 1024 * 1024 * 2 + 100, parts: 3 }] },
    );
  });

  it("POSTs manifest to /v1/sites/{id}/uploads", async () => {
    const http = createMockHttp();
    setupDeployMocks(http);
    const sites = new SitesResource(http);
    await sites.deploy("s1", [{ fileName: "file0.html", content: Buffer.from("x") }]);
    expect(http.post.mock.calls[0][0]).toBe("/v1/sites/s1/uploads");
  });

  it("uploads each part via PUT to presigned URL", async () => {
    const http = createMockHttp();
    const fetcher = setupDeployMocks(http, { fileCount: 1, partsPerFile: 2 });
    const PART_SIZE = 5 * 1024 * 1024;
    const content = Buffer.alloc(PART_SIZE + 100);
    const sites = new SitesResource(http);
    await sites.deploy("s1", [{ fileName: "file0.html", content }]);

    const putCalls = fetcher.mock.calls;
    expect(putCalls).toHaveLength(2);
    expect(putCalls[0][0]).toBe("https://s3.example.com/file0.html/part1");
    expect(putCalls[1][0]).toBe("https://s3.example.com/file0.html/part2");
    expect(putCalls[0][1]).toEqual(expect.objectContaining({ method: "PUT" }));
  });

  it("extracts ETag from upload response headers", async () => {
    const http = createMockHttp();

    const filesResponse = {
      "file0.html": {
        uploadId: "u1",
        key: "k1",
        partUploadUrls: [
          { part: 1, url: "https://s3.example.com/part1" },
          { part: 2, url: "https://s3.example.com/part2" },
        ],
      },
    };
    http.post
      .mockResolvedValueOnce({ versionId: "v1", files: filesResponse })
      .mockResolvedValueOnce({ status: "DEPLOYED" });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ ETag: `"etag-${callCount}"` }),
      } as Partial<Response> as Response);
    });

    const PART_SIZE = 5 * 1024 * 1024;
    const sites = new SitesResource(http);
    await sites.deploy("s1", [{ fileName: "file0.html", content: Buffer.alloc(PART_SIZE + 1) }]);

    const finalizeCall = http.post.mock.calls[1];
    const body = finalizeCall[1] as { completions: Array<{ parts: Array<{ ETag: string; PartNumber: number }> }> };
    const parts = body.completions[0].parts;
    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ETag: '"etag-1"' }),
        expect.objectContaining({ ETag: '"etag-2"' }),
      ]),
    );
  });

  it("sorts parts by PartNumber before finalize", async () => {
    const http = createMockHttp();

    const filesResponse = {
      "file0.html": {
        uploadId: "u1",
        key: "k1",
        partUploadUrls: [
          { part: 3, url: "https://s3.example.com/p3" },
          { part: 1, url: "https://s3.example.com/p1" },
          { part: 2, url: "https://s3.example.com/p2" },
        ],
      },
    };
    http.post
      .mockResolvedValueOnce({ versionId: "v1", files: filesResponse })
      .mockResolvedValueOnce({ status: "DEPLOYED" });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ ETag: '"e"' }),
    } as Partial<Response> as Response);

    const PART_SIZE = 5 * 1024 * 1024;
    const sites = new SitesResource(http);
    await sites.deploy("s1", [
      { fileName: "file0.html", content: Buffer.alloc(PART_SIZE * 3) },
    ]);

    const finalizeCall = http.post.mock.calls[1];
    const body = finalizeCall[1] as { completions: Array<{ parts: Array<{ PartNumber: number }> }> };
    const partNumbers = body.completions[0].parts.map((p) => p.PartNumber);
    expect(partNumbers).toEqual([1, 2, 3]);
  });

  it("POSTs completions to finalize endpoint", async () => {
    const http = createMockHttp();
    setupDeployMocks(http);
    const sites = new SitesResource(http);
    await sites.deploy("s1", [{ fileName: "file0.html", content: Buffer.from("x") }]);
    expect(http.post.mock.calls[1][0]).toBe("/v1/sites/s1/uploads/v1/finalize");
  });

  describe("deploy from directory", () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "sdk-test-"));
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("reads files recursively and normalizes paths", async () => {
      await mkdir(join(tmpDir, "sub"), { recursive: true });
      await writeFile(join(tmpDir, "index.html"), "<html>");
      await writeFile(join(tmpDir, "sub", "style.css"), "body{}");

      const http = createMockHttp();
      const filesResponse: Record<string, any> = {
        "index.html": {
          uploadId: "u1",
          key: "k1",
          partUploadUrls: [{ part: 1, url: "https://s3.example.com/index/1" }],
        },
        "sub/style.css": {
          uploadId: "u2",
          key: "k2",
          partUploadUrls: [{ part: 1, url: "https://s3.example.com/style/1" }],
        },
      };
      http.post
        .mockResolvedValueOnce({ versionId: "v1", files: filesResponse })
        .mockResolvedValueOnce({ status: "DEPLOYED" });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ ETag: '"e"' }),
      } as Partial<Response> as Response);

      const sites = new SitesResource(http);
      await sites.deploy("s1", tmpDir);

      const manifest = http.post.mock.calls[0][1] as { files: Array<{ fileName: string }> };
      const fileNames = manifest.files.map((f) => f.fileName).sort();
      expect(fileNames).toEqual(["index.html", "sub/style.css"]);
    });
  });

  describe("startUpload / finalizeUpload (public primitives)", () => {
    it("startUpload posts manifest to /v1/sites/<id>/uploads", async () => {
      const http = createMockHttp();
      const envelope = {
        versionId: "v1",
        files: {
          "a.bin": {
            uploadId: "u1",
            key: "k1",
            partUploadUrls: [{ part: 1, url: "https://s3.example.com/a/1" }],
          },
        },
      };
      http.post.mockResolvedValue(envelope);
      const sites = new SitesResource(http);

      const result = await sites.startUpload("s1", [
        { fileName: "a.bin", fileSize: 100, parts: 1 },
      ]);

      expect(http.post).toHaveBeenCalledWith(
        "/v1/sites/s1/uploads",
        { files: [{ fileName: "a.bin", fileSize: 100, parts: 1 }] },
      );
      expect(result).toBe(envelope);
    });

    it("startUpload URL-encodes siteId", async () => {
      const http = createMockHttp();
      http.post.mockResolvedValue({ versionId: "v1", files: {} });
      const sites = new SitesResource(http);
      await sites.startUpload("a/b", [{ fileName: "x", fileSize: 1, parts: 1 }]);
      expect(http.post).toHaveBeenCalledWith(
        "/v1/sites/a%2Fb/uploads",
        expect.anything(),
      );
    });

    it("finalizeUpload posts completions to /v1/sites/<id>/uploads/<v>/finalize", async () => {
      const http = createMockHttp();
      http.post.mockResolvedValue({ status: "processing" });
      const sites = new SitesResource(http);

      const completions = [
        {
          uploadId: "u1",
          key: "k1",
          parts: [{ ETag: '"e1"', PartNumber: 1 }],
        },
      ];
      const result = await sites.finalizeUpload("s1", "v1", completions);

      expect(http.post).toHaveBeenCalledWith(
        "/v1/sites/s1/uploads/v1/finalize",
        { completions },
      );
      expect(result).toEqual({ status: "processing" });
    });

    it("finalizeUpload sends undefined body when completions empty/omitted", async () => {
      const http = createMockHttp();
      http.post.mockResolvedValue({ status: "processing" });
      const sites = new SitesResource(http);
      await sites.finalizeUpload("s1", "v1");
      expect(http.post).toHaveBeenCalledWith(
        "/v1/sites/s1/uploads/v1/finalize",
        undefined,
      );

      http.post.mockClear();
      await sites.finalizeUpload("s1", "v1", []);
      expect(http.post).toHaveBeenCalledWith(
        "/v1/sites/s1/uploads/v1/finalize",
        undefined,
      );
    });

    it("finalizeUpload URL-encodes siteId and versionId", async () => {
      const http = createMockHttp();
      http.post.mockResolvedValue({ status: "processing" });
      const sites = new SitesResource(http);
      await sites.finalizeUpload("a/b", "v 1");
      expect(http.post).toHaveBeenCalledWith(
        "/v1/sites/a%2Fb/uploads/v%201/finalize",
        undefined,
      );
    });
  });

  describe("partition-host URL shape", () => {
    it("PUTs to partition-host URLs unchanged (no S3 hostname in deploy path)", async () => {
      const http = createMockHttp();

      const filesResponse = {
        "file0.html": {
          uploadId: "",
          key: "uploads/orgA/s1/v1/file0.html",
          partUploadUrls: [
            {
              part: 1,
              url: "https://us.api.hostsmith.net/v1/uploads/uploads/orgA/s1/v1/file0.html?ut=eyJhbGciOiJIUzI1NiJ9.payload.sig",
            },
          ],
        },
      };
      http.post
        .mockResolvedValueOnce({ versionId: "v1", mode: "partition_host", files: filesResponse })
        .mockResolvedValueOnce({ status: "DEPLOYED" });

      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ ETag: '"abc123"' }),
      } as Partial<Response> as Response);
      globalThis.fetch = fetcher;

      const sites = new SitesResource(http);
      await sites.deploy("s1", [{ fileName: "file0.html", content: Buffer.from("hi") }]);

      // Single PUT, to the exact partition-host URL we were handed.
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetcher.mock.calls[0];
      expect(calledUrl).toBe(
        "https://us.api.hostsmith.net/v1/uploads/uploads/orgA/s1/v1/file0.html?ut=eyJhbGciOiJIUzI1NiJ9.payload.sig",
      );
      expect(init).toEqual(expect.objectContaining({ method: "PUT" }));
      // SDK did not rewrite or strip the ut query parameter.
      expect(String(calledUrl)).toContain("ut=");
    });

    it("captures ETag and finalizes correctly for partition-host multipart upload", async () => {
      const http = createMockHttp();

      const filesResponse = {
        "big.bin": {
          uploadId: "upl-xyz",
          key: "uploads/orgA/s1/v1/big.bin",
          partUploadUrls: [
            {
              part: 1,
              url: "https://us.api.hostsmith.net/v1/uploads/uploads/orgA/s1/v1/big.bin?partNumber=1&uploadId=upl-xyz&ut=tok1",
            },
            {
              part: 2,
              url: "https://us.api.hostsmith.net/v1/uploads/uploads/orgA/s1/v1/big.bin?partNumber=2&uploadId=upl-xyz&ut=tok2",
            },
          ],
        },
      };
      http.post
        .mockResolvedValueOnce({ versionId: "v1", mode: "partition_host", files: filesResponse })
        .mockResolvedValueOnce({ status: "DEPLOYED" });

      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          headers: new Headers({ ETag: `"etag-${callCount}"` }),
        } as Partial<Response> as Response);
      });

      const PART_SIZE = 5 * 1024 * 1024;
      const sites = new SitesResource(http);
      await sites.deploy("s1", [{ fileName: "big.bin", content: Buffer.alloc(PART_SIZE + 1) }]);

      const finalizeCall = http.post.mock.calls[1];
      const body = finalizeCall[1] as { completions: Array<{ uploadId: string; key: string; parts: Array<{ ETag: string; PartNumber: number }> }> };
      expect(body.completions[0].uploadId).toBe("upl-xyz");
      expect(body.completions[0].key).toBe("uploads/orgA/s1/v1/big.bin");
      expect(body.completions[0].parts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ ETag: '"etag-1"', PartNumber: 1 }),
          expect.objectContaining({ ETag: '"etag-2"', PartNumber: 2 }),
        ]),
      );
    });
  });
});
