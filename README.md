# Lupira Assistant

The user-facing surface of the Lupira Assistant — a proactive, consent-first personal chief-of-staff
running entirely on self-hosted infrastructure. Product intent: [docs/product-brief.md](docs/product-brief.md);
architecture: [docs/app-backbone.md](docs/app-backbone.md); status: [docs/roadmap.md](docs/roadmap.md).

## Layout (npm workspaces monorepo, mirrors LupiraCal)

| Path | What |
|---|---|
| `apps/mobile` | The Expo/React Native app — the canonical surface (inbox, archive, settings). See its [README](apps/mobile/README.md). |
| `packages/domain` | `@lupira/assistant-domain` — shared pure TS (consumed as source, vitest-tested, purity enforced by its own eslint config). |
| `src/LupiraAssistantBff` | .NET 10 BFF: the app's single public backend — Authentik bearer + YARP over an `exposed.json` allowlist to assistant-api (`/api`), comms-api (`/comms-api`), location-api (`/location-api`), health-api (`/health-api`) and device ingest (`/ingest/*`). Integration tests: `dotnet test tests/LupiraAssistantBff.IntegrationTests`. |
| `docs/` | Product brief, app backbone, cross-repo roadmap. |

## Scripts

```bash
npm install         # once, at the root (workspaces)
npm run typecheck   # fans out to every workspace
npm run lint
npm test
npm run gen:api     # orval clients in apps/mobile (after fetch:openapi)
```
