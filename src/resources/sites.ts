import { readdir, readFile } from "node:fs/promises";
import { join, relative, posix } from "node:path";
import { HostsmithError } from "../errors.js";
import type { HttpClient } from "../http.js";
import type {
  DeployFile,
  DeployResult,
  FinalizeUploadResponse,
  Site,
  SiteCreateParams,
  SiteCreateResponse,
  SiteDeleteResponse,
  SiteListResponse,
  StartUploadResponse,
  UploadCompletion,
  UploadFileEntry,
} from "../types.js";

const PART_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_CONCURRENCY = 5;

export class SitesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<SiteListResponse> {
    return this.http.get<SiteListResponse>("/v1/sites");
  }

  async get(siteId: string): Promise<Site> {
    return this.http.get<Site>(`/v1/sites/${encodeURIComponent(siteId)}`);
  }

  async create(params: SiteCreateParams): Promise<SiteCreateResponse> {
    return this.http.post<SiteCreateResponse>("/v1/sites", params);
  }

  async delete(siteId: string): Promise<SiteDeleteResponse> {
    return this.http.delete<SiteDeleteResponse>(
      `/v1/sites/${encodeURIComponent(siteId)}`,
    );
  }

  async deploy(
    siteId: string,
    source: string | DeployFile[],
  ): Promise<DeployResult> {
    const files = typeof source === "string"
      ? await readDirectory(source)
      : source;

    if (files.length === 0) {
      throw new HostsmithError("No files to deploy");
    }

    const manifest: UploadFileEntry[] = files.map((f) => ({
      fileName: f.fileName,
      fileSize: f.content.length,
      parts: Math.max(1, Math.ceil(f.content.length / PART_SIZE)),
    }));

    const encodedSiteId = encodeURIComponent(siteId);
    const upload = await this.http.post<StartUploadResponse>(
      `/v1/sites/${encodedSiteId}/uploads`,
      { files: manifest },
    );

    const completions: UploadCompletion[] = [];

    const uploadTasks: (() => Promise<void>)[] = [];
    for (const file of files) {
      const info = upload.files[file.fileName];
      if (!info) continue;

      const isMultipart = info.partUploadUrls.length > 1;
      const parts: { ETag: string; PartNumber: number }[] = [];

      for (const partUrl of info.partUploadUrls) {
        const partIndex = partUrl.part - 1;
        const start = partIndex * PART_SIZE;
        const end = Math.min(start + PART_SIZE, file.content.length);
        const chunk = file.content.subarray(start, end);

        uploadTasks.push(async () => {
          const response = await fetch(partUrl.url, {
            method: "PUT",
            body: chunk,
            headers: {
              "Content-Length": String(chunk.length),
            },
          });

          if (!response.ok) {
            throw new HostsmithError(
              `Failed to upload ${file.fileName} part ${partUrl.part}: HTTP ${response.status}`,
            );
          }

          const etag = response.headers.get("ETag");
          if (etag) {
            parts.push({ ETag: etag, PartNumber: partUrl.part });
          }
        });
      }

      if (isMultipart) {
        completions.push({
          uploadId: info.uploadId,
          key: info.key,
          parts,
        });
      }
    }

    await runWithConcurrency(uploadTasks, MAX_CONCURRENCY);

    for (const completion of completions) {
      completion.parts.sort((a, b) => a.PartNumber - b.PartNumber);
    }

    const finalizeBody = completions.length > 0
      ? { completions }
      : undefined;

    const finalize = await this.http.post<FinalizeUploadResponse>(
      `/v1/sites/${encodedSiteId}/uploads/${encodeURIComponent(upload.versionId)}/finalize`,
      finalizeBody,
    );

    return {
      versionId: upload.versionId,
      status: finalize.status,
    };
  }
}

async function readDirectory(dirPath: string): Promise<DeployFile[]> {
  const entries = await readdir(dirPath, { recursive: true, withFileTypes: true });
  const files: DeployFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fullPath = join(entry.parentPath, entry.name);
    const relativePath = relative(dirPath, fullPath);
    const fileName = relativePath.split("\\").join(posix.sep);

    const content = await readFile(fullPath);
    files.push({ fileName, content });
  }

  return files;
}

async function runWithConcurrency(
  tasks: (() => Promise<void>)[],
  limit: number,
): Promise<void> {
  let index = 0;
  const errors: Error[] = [];

  async function worker() {
    while (index < tasks.length) {
      const current = index++;
      try {
        await tasks[current]();
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => worker(),
  );
  await Promise.all(workers);

  if (errors.length > 0) {
    throw errors[0];
  }
}
