# Security Policy

## Reporting a Vulnerability

If you believe you've found a security issue in `@hostsmith/sdk`, please report it privately.

Email: **security@ops42.org**

Please include:

- A description of the issue and its impact
- Steps to reproduce, ideally a minimal proof-of-concept
- The SDK version (`@hostsmith/sdk` from `package.json`) and Node.js version
- Whether the issue affects the published SDK only, or also the Hostsmith platform itself

We aim to acknowledge reports within 5 business days and to provide a status update within 14 days. Coordinated disclosure is appreciated - please give us reasonable time to ship a fix before publishing details.

## Threat Model

This SDK is a client library that holds an OAuth 2.0 access token and calls the Hostsmith Public API on the user's behalf.

- **Tokens are sensitive.** Storing or logging an access token can give an attacker the same permissions the user granted. Do not log tokens, do not commit them, and prefer environment-variable storage in CI.
- **The SDK does not refresh tokens.** Refresh-token handling is the responsibility of the consuming application.
- **Network trust.** All requests go to `https://*.api.hostsmith.net` over TLS. Custom `baseUrl`/`partitionUrls` overrides are intended for development; using them against production is unsupported.
- **Out of scope.** Vulnerabilities in the Hostsmith platform (the API itself, the dashboard, the deployment runtime) are not handled in this repo - report those to the same address but indicate that the report is platform-related.

## Supported Versions

We provide security fixes for the latest minor version on npm. Older versions are best-effort.
