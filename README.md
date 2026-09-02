# TokenLedger

<p align="center">
  <a href="https://github.com/bobbybacklogs/tokenledger"><img src="https://img.shields.io/github/stars/bobbybacklogs/tokenledger" alt="GitHub stars"></a>
  <img src="https://img.shields.io/github/license/bobbybacklogs/tokenledger" alt="License">
  <img src="https://img.shields.io/github/last-commit/bobbybacklogs/tokenledger" alt="Last commit">
  <a href="https://www.npmjs.com/package/@tokenledger/core"><img src="https://img.shields.io/npm/v/@tokenledger/core?label=%40tokenledger%2Fcore" alt="@tokenledger/core"></a>
  <a href="https://www.npmjs.com/package/@tokenledger/cli"><img src="https://img.shields.io/npm/v/@tokenledger/cli?label=%40tokenledger%2Fcli" alt="@tokenledger/cli"></a>
  <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20+">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
</p>

TokenLedger is an AI unit-economics planner for SaaS products. It pulls **live model pricing** from the public [OpenRouter catalog](https://openrouter.ai/docs/models) (`GET /api/v1/models`, no API key required), [models.dev](https://models.dev), [GitHub Copilot](https://docs.github.com/en/copilot/reference/ai-models/supported-models), or [Vercel AI Gateway](https://ai-gateway.vercel.sh/v1/models), projects token and image-generation spend against your subscription tiers, and turns it into revenue, margin, and per-user cost — as an npm SDK, a CLI, and a browser planner.

## Packages

| Package | What it gives you |
| --- | --- |
| **[@tokenledger/core](https://www.npmjs.com/package/@tokenledger/core)** | The calculation engine + live pricing client. Framework-agnostic TypeScript, one runtime dependency (`mdev-sdk`, itself zero-dependency), works in Node ≥ 20 and the browser. |
| **[@tokenledger/cli](https://www.npmjs.com/package/@tokenledger/cli)** | The `tokenledger` terminal app, built on core. Browse pricing, project scenarios, compare models. |
| **`app/` (this repo)** | A Next.js web planner using the same core — instant to try, no install. |

All calculations live in `@tokenledger/core`, so the SDK, the CLI, and the web app produce identical numbers.

## What it does

- Pulls **live model pricing** from OpenRouter (default), models.dev, GitHub Copilot, or Vercel AI Gateway — covering OpenAI, Anthropic, Google, Mistral, and hundreds of other providers — with a bundled estimate catalog as an offline fallback, so it never breaks.
- Select an active model and calculate projected monthly AI spend.
- Define customer tiers (Free / Pro / Business) with user counts, subscription prices, token usage per user, and dynamic monthly quotas.
- Run parallel **image, embeddings, and video lanes** — plus prompt-cache hits on the token lane (`cacheHit` % × `cacheRead` rate).
- Report monthly AI cost, blended cost per user, projected revenue, and gross margin.
- Export the projection as CSV or JSON, or save it as PDF from the browser.

## Using the SDK

```bash
npm install @tokenledger/core
```

```ts
import { calculateImageScenario, calculateScenario, defaultScenario, findModel, loadModels } from '@tokenledger/core'

// 1. Live prices from OpenRouter by default; pass { source: 'modelsdev' | 'github' | 'vercel' } for the other catalogs.
//    The bundled catalog falls back when offline.
const models = await loadModels()

// 2. Pick a model by id, name, or partial slug.
const model = findModel(models.models, 'openai/gpt-4o-mini')

// 3. Project a scenario.
const projection = calculateScenario(defaultScenario(), model!)
console.log(projection.spend, projection.revenue, projection.margin)

// Image lane, same shape:
const imageModel = findModel(models.models, 'openai/gpt-5-image')
const imageProj  = calculateImageScenario(defaultImageScenario(), imageModel!)
```

See [packages/core/README.md](packages/core/README.md) for the full API.

## Using the CLI

```bash
npm install -g @tokenledger/cli
tokenledger --help
```

A few examples:

```bash
# Browse live pricing (search, providers, sorting, featured, JSON all supported)
tokenledger models
tokenledger models claude
tokenledger models --provider openai --sort price -l 5
tokenledger models --source models.dev "claude-opus"     # models.dev catalog instead
tokenledger models --source github                       # GitHub Copilot models
tokenledger models --source vercel                       # Vercel AI Gateway
tokenledger search gpt-4o                                 # dedicated search command
tokenledger models --featured --offline     # no network, bundled estimates

# Project AI spend / revenue / margin for a model and tier mix
tokenledger estimate
tokenledger estimate -m openai/gpt-4o-mini -u 12000
tokenledger estimate -t "Starter:5000:10:50000:15000:100000" -t "Pro:1500:29:120000:40000:250000"

# Work from a scenario file
tokenledger init my-scenario.json
tokenledger scenario my-scenario.json --json

# Compare models on the same scenario
tokenledger compare openai/gpt-4o-mini "~google/gemini-flash-latest"
tokenledger compare --scenario my-scenario.json --limit 10
# Compare the same model across pricing sources (default = OpenRouter)
tokenledger compare openai/gpt-4o-mini openai/gpt-4o-mini --source models.dev,default

# Build a scenario interactively (no JSON needed)
tokenledger wizard
tokenledger wizard --offline

# Image lane: price per generated image, projected, and benchmarked
tokenledger images
tokenledger image-estimate -m openai/gpt-5-image
tokenledger image-compare --limit 10

# Embeddings (RAG) and video seconds
tokenledger embeddings --source models.dev
tokenledger embed-estimate -m openai/text-embedding-3-small
tokenledger videos --source vercel
tokenledger video-estimate -m alibaba/wan-v2.6-t2v
tokenledger estimate --cache-hit 40

# Included credits + overage + reset
tokenledger credits
tokenledger credits --credit-value 0.01 --reset monthly --as-of 2026-09-02
```

Every command shows whether prices are **live** (source + fetch time + model count) or **offline estimates**. Token-lane commands accept `--source openrouter` (default), `--source models.dev`, `--source github`, `--source vercel`, or `--source offline`. See [packages/cli/README.md](packages/cli/README.md) for full documentation.

## Scenario file format

```json
{
  "name": "Growth plan",
  "model": "openai/gpt-4o-mini",
  "users": 12000,
  "tiers": [
    { "name": "Free", "users": 8000, "price": 0, "input": 18000, "output": 6000, "quota": 25000 },
    { "name": "Pro", "users": 3200, "price": 29, "input": 120000, "output": 40000, "quota": 250000 },
    { "name": "Business", "users": 800, "price": 99, "input": 420000, "output": 140000, "quota": 1000000 }
  ]
}
```

`model` and `users` are optional — when `users` is set it scales the per-tier splits proportionally. Tiers may also carry `"images"` (images per user per month) for the image lane: the token commands ignore it, the image commands (`image-estimate`, `image-compare`) use it.

Tiers can be defined in **business terms** instead of raw tokens — `requests` per user per month plus a `size` preset (tokens are derived for you):

```json
{ "name": "Pro", "users": 3200, "price": 29, "requests": 1000, "size": "long" }
```

## Cost model

```text
monthly AI cost = users × ((input tokens / 1,000,000 × input rate)
                         + (output tokens / 1,000,000 × output rate))

image lane: monthly image cost
           = users × (images per user / month) × price per image
```

Provider rates are USD per 1 million tokens, read live from OpenRouter (or models.dev / GitHub Copilot / Vercel with `--source`). Image generation is priced **per generated image** (OpenRouter's `image_output` is converted to USD per image, e.g. GPT-5 Image lists `0.00004` → `$0.04/image`; Vercel quotes `pricing.image` already in USD per image). Model pricing is intended for planning, not billing reconciliation. Revenue = users × price; gross margin = (revenue − spend) / revenue.

## Web planner

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The model benchmark table loads live prices on page load, includes a refresh button, and a pricing-source picker (OpenRouter, models.dev, GitHub Copilot, Vercel).

## Requirements & development

- Node.js 20 or newer, pnpm ([enable via corepack](https://pnpm.io/installation) with `corepack enable`).
- The repo is a pnpm monorepo: `app/` (Next.js web), `packages/core` (SDK), `packages/cli` (CLI).
- `pnpm test` runs the core test suite; `pnpm build:packages` builds both publishable packages; `pnpm build` builds core then the web app.

## Notes

- Live prices are list prices from the selected catalog (OpenRouter, models.dev, GitHub Copilot, or Vercel AI Gateway); verify against provider billing before making purchasing or pricing decisions. Offline fallback entries are flagged as estimates in the UI and CLI. GitHub Models was retired in July 2026 — `--source github` is Copilot pricing from models.dev.
- Image pricing: OpenRouter's feed reports `image_output` scaled ×1000; TokenLedger converts it to USD per generated image. Vercel quotes `pricing.image` already in USD per image. Providers that bill per token or per megapixel are approximated as a flat per-image rate.
- No environment variables or API keys are required.

## License

MIT. `@tokenledger/core` and `@tokenledger/cli` are MIT-licensed npm packages; the web app in this repo stays private unless you choose to license it separately.