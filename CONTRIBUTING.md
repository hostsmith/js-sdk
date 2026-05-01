# Contributing

Thanks for your interest in `@hostsmith/sdk`. This SDK is the official Node.js client for the [Hostsmith](https://hostsmith.net) Public API. Issues and PRs are welcome - please read this short guide first.

## Scope

This repo is the SDK only. Feature requests for the Hostsmith platform itself (new APIs, billing, dashboard) belong on [hostsmith.net](https://hostsmith.net), not here. Good fits for this repo:

- SDK bugs (incorrect request shapes, broken types, regressions)
- DX improvements (better errors, better TypeScript inference, ergonomic helpers around existing endpoints)
- Documentation fixes
- Test coverage

## Development

```bash
git clone https://github.com/hostsmith/js-sdk
cd js-sdk
npm install
git config core.hooksPath .githooks
```

Common commands:

```bash
npm test          # run vitest
npm run typecheck # tsc --noEmit
npm run build     # tsdown
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/). The `commit-msg` hook enforces the format - enable it with `git config core.hooksPath .githooks` (the install step above).

| Type                                                       | When                          | Releases? |
| ---------------------------------------------------------- | ----------------------------- | --------- |
| `feat:`                                                    | new functionality             | minor     |
| `fix:`                                                     | bug fix                       | patch     |
| `feat!:` or `BREAKING CHANGE:`                             | breaking API change           | major     |
| `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `chore:` | non-shipping                  | none      |

Releases are automated from `main` via GitHub Actions.

## Pull requests

- Open a PR against `main`
- CI must pass (`typecheck` + `vitest`)
- Keep PRs focused; small is better than complete
- Reference an issue in the description if one exists

## Reporting security issues

Please don't open public issues for security reports. See [SECURITY.md](./SECURITY.md).
