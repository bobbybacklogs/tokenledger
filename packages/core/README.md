# @tokenledger/core

AI unit-economics engine for TokenLedger: live LLM pricing from OpenRouter and models.dev, scenario projections, and tier math. One runtime dependency (`mdev-sdk`, itself zero-dependency); works in Node ≥ 20 and in the browser.

## Install

```bash
npm install @tokenledger/core
```

## Quick start

```ts
import { calculateScenario, defaultScenario, loadModels, findModel } from '@tokenledger/core'

// 1. Load models — live from OpenRouter, bundled catalog as fallback.
const models = await loadModels()

// 2. Pick one (by id, name, or a partial slug).
const model = findModel(models.models, 'openai/gpt-4o-mini')

// 3. Project a scenario.
const scenario = defaultScenario()
const projection = calculateScenario(scenario, model)

console.log(projection.spend, projection.revenue, projection.margin)
```

## API

| Export | Description |
| --- | --- |
| `loadModels(options?)` | `Promise<ModelList>` — live OpenRouter feed by default, models.dev with `{ source: 'modelsdev' }`, offline fallback. Never throws; check `list.source` (`'live'` \| `'modelsdev'` \| `'offline'`). |
| `fetchModels(options?)` | `Promise<ModelList>` — live OpenRouter fetch only; throws on network/HTTP errors. |
| `fetchModelsDev(options?)` | `Promise<ModelList>` — live models.dev fetch only (via `mdev-sdk`); throws on network/HTTP errors. |
| `catalogModels()` | `ModelList` — the bundled estimate catalog (token + image lanes). |
| `normalizeOpenRouterModels(payload)` | Normalize a raw OpenRouter `/api/v1/models` payload into `LiveModel[]`. |
| `normalizeModelsDevProviders(providers)` | Normalize a models.dev `ProviderMap` into `LiveModel[]` (prices already USD/1M; unpriced models skipped). |
| `categorizeModel(model)` | Infer a coarse category for a model: `general` \| `coding` \| `reasoning` \| `vision` \| `image` \| `embedding` \| `audio` (heuristic on id/name/modality/image). |
| `matchesCategory(model, category)` | True when a model falls into the given category. |
| `MODEL_CATEGORIES` | The ordered list of supported categories. |
| `featuredModels(models, opts?)` | The curated benchmark set (pinned ids first, optional offline backfill, capped). |
| `featuredImageModels(models, opts?)` | Like `featuredModels`, but only image-capable models (per-image pricing). |
| `isImageModel(model)` | True when a model has per-image output pricing. |
| `findModel(models, query)` | Look up by exact id, exact name, or a trailing/partial slug. |
| `calculateScenario(scenario, model)` | `Projection` — spend, revenue, blended cost/user, margin, per-tier math. |
| `calculateImageScenario(scenario, model)` | `Projection` for the image lane: spend is image spend, per-tier cost is image cost. |
| `tierProjection(tier, model)` | Per-tier cost, revenue, margin, and quota utilization. |
| `imageTierProjection(tier, model)` | Per-tier image cost, revenue, and margin (no quota utilization). |
| `tierRevenue(tier)` | Monthly subscription revenue for a tier. |
| `tierMonthlyCost(tier, model)` / `imageTierMonthlyCost(tier, model)` | Tier cost building blocks (tokens / generated images). |
| `monthlyImages(tiers)` | Total images generated across tiers per month. |
| `scaleUsersPerTier(tiers, total)` | Redistribute users across tiers proportionally. |
| `defaultScenario()` | The bundled starter token scenario (Growth plan). |
| `defaultImageScenario()` | The bundled starter image-lane scenario. |
| `tierFromUsage(usage)` | Derive `{ input, output, quota }` from requests/month × exchange-size preset (business-friendly tier definition). |
| `EXCHANGE_ESTIMATES` / `EXCHANGE_SIZES` / `ExchangeSize` | Exchange-size presets (`brief`/`standard`/`detailed`/`intensive`) and their per-exchange token estimates. |
| `money()` / `compact()` / `contextLabel()` / `number()` | Shared display helpers. |
| `CATALOG_MODELS`, `CATALOG_IMAGE_MODELS`, `FEATURED_MODEL_IDS`, `FEATURED_IMAGE_MODEL_IDS`, `DEFAULT_MODEL_ID`, `DEFAULT_IMAGE_MODEL_ID` | Constants. |

### Types

- `LiveModel` — normalized model with `input` / `output` in **USD per 1M tokens**, `context`, optional `image` (USD per generated image, image-capable models only), optional `modality`, optional `best`, optional `estimate` flag.
- `TierConfig` — `name`, `users`, `price`, `input`, `output`, `quota`, optional `images` (images per user per month, image lane only).
- `Scenario` — `name`, `model` (OpenRouter-style id), optional `users` total, `tiers`.
- `Projection` / `TierProjection` / `ModelList` / `PricingSource` — see `src/types.ts`. `quotaUtilization` is optional and only populated by the token lane.

## Pricing source

`fetchModels` calls `https://openrouter.ai/api/v1/models` (no API key). Prices arrive per token and are converted to per-1M-token values. Models without a usable prompt/completion price are skipped.

`fetchModelsDev` calls the public [models.dev](https://models.dev) catalog via `mdev-sdk` (no API key) — the same open catalog of providers, models, and prices that powers OpenCode. Prices are already USD per 1M tokens; models without a `cost` are unpriced (absence ≠ free) and are skipped, mirroring the OpenRouter skip. Canonical model ids are `provider/model`, and provider display names come from the catalog itself. models.dev does not publish per-image pricing, so the image lane is only populated by OpenRouter data.

When neither live feed is reachable, `loadModels` returns the bundled catalog (all entries flagged `estimate: true`) so callers can still run projections — but always surface `list.source` to your users.

Image-capable models also expose `image` (USD per generated image). OpenRouter's feed reports `image_output` scaled ×1000, so TokenLedger converts it to per-image USD (e.g. GPT-5 Image lists `0.00004` → `$0.04/image`).

## Cost model

```
monthly AI cost = users × ((input tokens / 1,000,000 × model.input)
                         + (output tokens / 1,000,000 × model.output))

image lane: monthly image cost = users × (tier.images ?? 0) × (model.image ?? 0)
```

Revenue = users × price; gross margin = (revenue − spend) / revenue; blended cost/user = spend / total users. Image-lane projections reuse the same `Projection` shape with `spend` representing image spend.

## Development

```bash
pnpm install
pnpm --filter @tokenledger/core run build    # or: pnpm test (builds + runs node:test)
```

Run the tests with `node --test` (Node 22.18+ / 23+ can execute the `.ts` test files directly).

## License

MIT