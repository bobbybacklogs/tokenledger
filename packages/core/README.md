# @tokenledger/core

AI unit-economics engine for TokenLedger: live LLM pricing from OpenRouter, scenario projections, and tier math. Zero runtime dependencies, works in Node ≥ 20 and in the browser.

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
| `loadModels(options?)` | `Promise<ModelList>` — live OpenRouter feed with offline fallback. Never throws; check `list.source` (`'live'` \| `'offline'`). |
| `fetchModels(options?)` | `Promise<ModelList>` — live fetch only; throws on network/HTTP errors. |
| `catalogModels()` | `ModelList` — the bundled estimate catalog (token + image lanes). |
| `normalizeOpenRouterModels(payload)` | Normalize a raw OpenRouter `/api/v1/models` payload into `LiveModel[]`. |
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
| `money()` / `compact()` / `contextLabel()` / `number()` | Shared display helpers. |
| `CATALOG_MODELS`, `CATALOG_IMAGE_MODELS`, `FEATURED_MODEL_IDS`, `FEATURED_IMAGE_MODEL_IDS`, `DEFAULT_MODEL_ID`, `DEFAULT_IMAGE_MODEL_ID` | Constants. |

### Types

- `LiveModel` — normalized model with `input` / `output` in **USD per 1M tokens**, `context`, optional `image` (USD per generated image, image-capable models only), optional `modality`, optional `best`, optional `estimate` flag.
- `TierConfig` — `name`, `users`, `price`, `input`, `output`, `quota`, optional `images` (images per user per month, image lane only).
- `Scenario` — `name`, `model` (OpenRouter-style id), optional `users` total, `tiers`.
- `Projection` / `TierProjection` / `ModelList` / `PricingSource` — see `src/types.ts`. `quotaUtilization` is optional and only populated by the token lane.

## Pricing source

`fetchModels` calls `https://openrouter.ai/api/v1/models` (no API key). Prices arrive per token and are converted to per-1M-token values. Models without a usable prompt/completion price are skipped. When the network is unavailable, `loadModels` returns the bundled catalog (all entries flagged `estimate: true`) so callers can still run projections — but always surface `list.source` to your users.

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