# @hostsmith/sdk

[![CI](https://github.com/hostsmith/js-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/hostsmith/js-sdk/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/hostsmith/js-sdk)](https://github.com/hostsmith/js-sdk/releases/latest)
[![npm version](https://img.shields.io/npm/v/@hostsmith/sdk)](https://www.npmjs.com/package/@hostsmith/sdk)
[![Node Version](https://img.shields.io/node/v/@hostsmith/sdk)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Node.js SDK for the [Hostsmith](https://hostsmith.net) Public API. Manage sites and deploy files programmatically.

## Installation

```bash
npm install @hostsmith/sdk
```

Requires Node.js 20 or later.

## Quick Start

```ts
import { Hostsmith } from "@hostsmith/sdk";

const client = new Hostsmith({
  accessToken: "your-oauth-access-token",
  partition: "us", // "us" (United States) or "eu" (European Union)
});

// List all sites
const { sites } = await client.sites.list();

// Deploy a directory
await client.sites.deploy(sites[0].id, "./dist");
```

## Authentication

The SDK requires an OAuth 2.0 access token. See the [authentication guide](https://hostsmith.net/docs/developers/authentication) for how to obtain one.

```ts
const client = new Hostsmith({
  accessToken: "your-access-token",
});
```

## Usage

### Sites

```ts
// List all sites
const { sites } = await client.sites.list();

// Get a site by ID
const site = await client.sites.get("site-id");

// Create a site
const { siteId } = await client.sites.create({
  subdomain: "my-portfolio",
  domain: "us.hostsmith.link",
});

// Delete a site
await client.sites.delete("site-id");
```

### Domains

```ts
// List all domains (shared + custom)
const { domains } = await client.domains.list();

// List only shared hosting domains
const { domains: shared } = await client.domains.list({ shared: true });

// List only custom domains owned by your organization
const { domains: custom } = await client.domains.list({ shared: false });

// Each domain includes:
// - id, name, shared, partition, enableApexDomain, enableSubdomains, status
// - canonicalServedUrl: the URL where the site is actually served
//   (https://www.<apex> for apex-enabled domains, otherwise https://<name>)
// - bareApexCovered: whether the bare apex form (https://example.com) is reachable
```

### Deploying Files

Deploy an entire directory:

```ts
const result = await client.sites.deploy("site-id", "./dist");
// { versionId: "...", status: "processing" }
```

Or deploy specific files:

```ts
import { Buffer } from "node:buffer";

const result = await client.sites.deploy("site-id", [
  { fileName: "index.html", content: Buffer.from("<h1>Hello</h1>") },
  { fileName: "style.css", content: Buffer.from("body { margin: 0 }") },
]);
```

The deploy method handles the full upload flow: requesting per-part upload URLs, PUTting each part (with concurrency), capturing ETags, and finalizing the deployment.

Files larger than 5 MB are automatically split into multipart uploads.

By default the public API returns **partition-host upload URLs** (on the same hostname as the rest of the API, e.g. `https://us.api.hostsmith.net/v1/uploads/...`) - so the SDK only needs network access to your partition's API host. If you prefer direct-to-S3 presigned URLs (e.g. for CI runners in the same AWS region), pass `mode: "presigned"` when starting the upload via the lower-level `client.sites.startUpload(...)` API. `deploy()` follows the server default and works with either URL shape transparently.

## Configuration

### Partitions

Each Hostsmith data partition has its own API host. Pass `partition` to pick one:

| Partition | Label          | Base URL                       |
| --------- | -------------- | ------------------------------ |
| `us`      | United States  | `https://us.api.hostsmith.net` |
| `eu`      | European Union | `https://eu.api.hostsmith.net` |

A discovery endpoint (`GET /v1/partitions`) returns the live list with labels.

### Default partition from token

If `partition` is omitted, the SDK reads the access token's `homePartition` claim and uses it as the default. To call a partition other than the user's home partition, pass `partition` explicitly.

```ts
// Default to the user's home partition (from the token's `homePartition` claim).
const home = new Hostsmith({ accessToken: token });

// One token authorized for both partitions: target a specific one.
const us = new Hostsmith({ accessToken: token, partition: "us" });
const eu = new Hostsmith({ accessToken: token, partition: "eu" });
```

### Custom partition URLs (dev / staging)

Override the default URL map (e.g. to point at `hostsmith-dev.com`):

```ts
const client = new Hostsmith({
  accessToken: "your-token",
  partition: "us",
  partitionUrls: {
    us: "https://us.api.hostsmith-dev.com",
    eu: "https://eu.api.hostsmith-dev.com",
  },
});
```

Token-based defaulting also uses the overridden URLs.

### Custom Base URL

For local development:

```ts
const client = new Hostsmith({
  accessToken: "your-token",
  baseUrl: "http://localhost:3000",
});
```

## Error Handling

The SDK throws typed errors for API failures:

```ts
import { ApiError, AuthError } from "@hostsmith/sdk";

try {
  await client.sites.get("nonexistent-id");
} catch (err) {
  if (err instanceof AuthError) {
    // 401 - token expired or invalid
    console.error("Auth failed:", err.message);
  } else if (err instanceof ApiError) {
    // Other API errors (403, 404, 409, 429)
    console.error(`API error ${err.status}:`, err.errorCode, err.message);
  }
}
```

### Error Classes

- `HostsmithError` - base class for all SDK errors
- `ApiError` - API returned an error response (has `status`, `errorCode`, `message`)
- `AuthError` - 401 Unauthorized (extends `ApiError`)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For security issues, see [SECURITY.md](./SECURITY.md).

## License

MIT
