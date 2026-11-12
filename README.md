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

The SDK takes either an OAuth 2.0 access token or a Hostsmith API token. See the [authentication guide](https://hostsmith.net/docs/developers/authentication) for how to obtain them.

```ts
const client = new Hostsmith({
  accessToken: "your-access-token",
});
```

### API tokens (CI and automation)

An organization owner creates an API token in the Hostsmith dashboard (Developers → API Tokens). It can be limited to some sites and permissions, and it expires when the owner chooses. Pass it as `apiToken`: the client exchanges it for 1-hour access tokens and renews them as needed. The API token itself is sent only to the token endpoint.

```ts
const client = new Hostsmith({
  apiToken: process.env.HOSTSMITH_TOKEN, // "hsat_..."
  userAgent: "my-ci/1.0.0",
});

await client.sites.deploy(process.env.HOSTSMITH_SITE_ID!, "./dist");
```

Without `partition`, the client uses the home partition of the token's creator. Pass `partition` when the sites live in the other partition. A revoked or expired API token makes calls throw an `AuthError`.

In a GitHub Action, store the token as a repository secret and pass it through the environment:

```yaml
- run: node deploy.mjs
  env:
    HOSTSMITH_TOKEN: ${{ secrets.HOSTSMITH_TOKEN }}
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

// Create a redirect host on one of your custom domains
const { siteId: hostId } = await client.sites.create({
  subdomain: "go",
  domain: "example.com",
  kind: "redirect",
});

// Delete a site
await client.sites.delete("site-id");
```

A redirect host (`kind: "redirect"`) serves only its [redirect rules](#redirects), set with `client.sites.redirects` as for a site. It takes no files: `deploy()` and `startUpload()` are refused with `RedirectHostHasNoFiles`. It needs one of your organization's own custom domains, so a shared domain is refused with `CustomDomainRequired`. Redirect hosts don't count toward the plan's site limit; an organization can have up to 50, and the next create is refused with `RedirectHostLimitReached`. Every site has a `kind`, `"site"` or `"redirect"`.

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

### Redirects

A site's hostname has two sources of redirect rules, checked in order: **user rules**, kept on the hostname and changed through the API without a deploy, then **file rules**, from the live deploy's `_redirects`. The first match answers. Redirects apply only on your organization's own custom domains; a change to a site on a shared domain is refused with `CustomDomainRequired`. Rules default to 301.

```ts
// Read the rules in the order they are checked, with the file's report
const { version, rules, file } = await client.sites.redirects.list("site-id");

// Add one rule, or delete one by id
const { rule } = await client.sites.redirects.add("site-id", { from: "/old", to: "/new" });
await client.sites.redirects.delete("site-id", rule.id);

// Check a path before or after a change
const { match } = await client.sites.redirects.test("site-id", { path: "/old?ref=mail" });
// { managedBy: "user", id: "r_...", status: 301, location: "/new?ref=mail" }

// Switch the live deploy's file rules off until the next deploy, or back on
await client.sites.redirects.setFileRules("site-id", false);
```

For bulk work, replace the list or send a batch, rather than many single calls. Both are all or nothing. Pass the `version` you read to refuse the change if someone saved since:

```ts
// Replace the whole list, from rules or from `_redirects` text
await client.sites.redirects.set("site-id", { text: "/blog/* /posts/:splat\n/promo /sale 302\n" }, { version });

// Apply adds, updates and deletes in order
await client.sites.redirects.edit(
  "site-id",
  [
    { op: "add", rule: { from: "/a", to: "/b" }, position: 0 },
    { op: "update", id: "r_8f2a91c04b7e", rule: { from: "/c", to: "/d", status: 308 } },
    { op: "delete", id: "r_3bedf35348fa" },
  ],
  { version },
);
```

A refusal's details are on `err.details`, such as the `errors` of `InvalidRules`, each with the rule's `index` or the text's `line`, and the latest `version` of `StaleVersion`. A file rule can't be changed through these calls: naming its line answers `FileRule` with the `line`.

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

### User-Agent

Every request carries a `User-Agent` header with the SDK's product token, `hostsmith-js-sdk/<version>`. To identify your application, pass your own product token in `userAgent`; the SDK puts it first and appends its own:

```ts
const client = new Hostsmith({
  accessToken: "your-token",
  userAgent: "my-app/2.1.0",
});
// User-Agent: my-app/2.1.0 hostsmith-js-sdk/<version>
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
- `ApiError` - API returned an error response (has `status`, `errorCode`, `message`, and `details` with the body's other fields)
- `AuthError` - 401 Unauthorized (extends `ApiError`)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). For security issues, see [SECURITY.md](./SECURITY.md).

## License

MIT
