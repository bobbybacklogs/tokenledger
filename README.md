# TokenLedger

TokenLedger is an AI unit economics planner for SaaS products. It models AI spend across providers, compares live model pricing, projects subscription margins, and defines customer-tier usage quotas — in the browser **and** on the command line.

It's a pnpm monorepo:

- `app/` — Next.js web planner (live prices, no hardcoded model data)
- `packages/core` — `@tokenledger/core`, the calculation engine + live pricing client (publishable)
- `packages/cli` — `@tokenledger/cli`, the `tokenledger` CLI (publishable)

## What it does

- Pulls **live model pricing** from the public [OpenRouter catalog](https://openrouter.ai/docs/models) (`GET /api/v1/models`, no API key required), covering OpenAI, Anthropic, Google, Mistral, and hundreds of other providers.
- Falls back to a bundled estimate catalog when offline, so the planner never breaks.
- Select an active model and calculate projected monthly AI spend.
- Set the total number of SaaS users for the scenario.
- Adjust Free, Pro, and Business tier allocations and subscription prices.
- Model input and output tokens per user by customer tier.
- Calculate monthly AI cost, blended cost per user, projected revenue, and gross margin.
- Set dynamic monthly token quotas for each customer tier.
- Run a parallel **image lane** — image model × images/user/month × users — with its own benchmark table, per-image pricing, and projection.
- Export the current budget projection as CSV, print it, or save it as PDF via the browser.

All calculations live in `@tokenledger/core`, so the web app and the CLI produce identical numbers.

## Cost model

```text
monthly AI cost = users × ((input tokens / 1,000,000 × input rate)
                         + (output tokens / 1,000,000 × output rate))

image lane: monthly image cost
           = users × (images per user / month) × price per image
```

Provider rates are USD per 1 million tokens, read live from OpenRouter. Image generation is priced **per generated image** (OpenRouter's `image_output` is converted to USD per image, e.g. GPT-5 Image lists `0.00004` → `$0.04/image`). Model pricing is intended for planning, not billing reconciliation.

## Requirements

- Node.js 20 or newer
- pnpm ([enable via corepack](https://pnpm.io/installation) with `corepack enable`)

## Getting started

### Install dependencies

```bash
pnpm install
```

### Web planner

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The model benchmark table loads live prices on page load and includes a refresh button.

```bash
pnpm build
pnpm start
```

### CLI

The CLI is built as part of the workspace. To run it locally:

```bash
pnpm --filter @tokenledger/cli run build
pnpm cli                       # runs the built CLI binary
```

Or install the published packages from npm:

```bash
npm i -g @tokenledger/cli
tokenledger --help
```

### Example CLI usage

```bash
# Browse live pricing (filters, sorting, featured only, JSON all supported)
tokenledger models
tokenledger models google                # search by id/name
tokenledger models --provider openai --sort price -l 5
tokenledger models --featured --offline  # no network, bundled estimates

# Project AI spend/revenue/margin using the default Growth-plan scenario
tokenledger estimate
tokenledger estimate -m openai/gpt-4o-mini -u 12000
tokenledger estimate -t "Starter:5000:10:50000:15000:100000" -t "Pro:1500:29:120000:40000:250000"

# Work from a scenario file
tokenledger init my-scenario.json
tokenledger scenario my-scenario.json            # human-readable table
tokenledger scenario my-scenario.json --json     # machine-readable

# Compare models on the same scenario
tokenledger compare openai/gpt-4o-mini "~google/gemini-flash-latest"
tokenledger compare --scenario my-scenario.json --limit 10

# Image lane: browse and project image-generation costs
tokenledger images                          # price per generated image
tokenledger images --sort price -l 5
tokenledger image-estimate -m openai/gpt-5-image
tokenledger image-estimate -t "Pro:3200:29:100" -t "Business:800:99:500" -u 12000
tokenledger image-compare --limit 10
```

Every CLI command (except `--json` output) shows whether prices are **live** (OpenRouter + fetch time + model count) or **offline estimates**.

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

`model` is optional (defaults to a recommended model), and `users` is optional — when set it scales the per-tier splits proportionally. Tiers may also carry `"images"` (images generated per user per month) for the image lane; the token commands ignore it, the image commands (`image-estimate`, `image-compare`) use it.

## Project structure

```text
app/
  page.tsx       Main interactive cost planner (uses @tokenledger/core)
  layout.tsx     App metadata and root layout
  globals.css    Theme, dashboard styles, and print rules
packages/
  core/          @tokenledger/core — types, OpenRouter client, calculation engine
  cli/           @tokenledger/cli — commander-based CLI
```

## Data and integrations

Prices come from the public OpenRouter models endpoint and are refreshed on demand. No API keys or billing credentials are required for the current version — OpenRouter only aggregates published list prices.

For a production billing product, future work could add provider API synchronization, regional pricing, caching, versioned pricing catalogs, saved scenarios, and authenticated workspaces.

## Technology

- Next.js 16 App Router + React 19 + TypeScript + Tailwind CSS 4 (web)
- `@tokenledger/core` — framework-agnostic TypeScript engine, zero runtime dependencies, bundled with `tsc`
- `@tokenledger/cli` — Node ≥ 20, `commander` + `picocolors`
- pnpm workspaces

## Notes

- Live prices are list prices from OpenRouter; verify against provider billing before making purchasing or pricing decisions.
- Offline fallback catalog entries are flagged as estimates in the UI and CLI.
- Image pricing: OpenRouter's feed reports `image_output` scaled ×1000; TokenLedger converts it to USD per generated image (e.g. GPT-5 Image `0.00004` → `$0.04/image`). Providers that bill per token or per megapixel are approximated as a flat per-image rate.
- CSV export reflects the currently selected model, user count, tiers, quotas, and calculated margins.
- No environment variables are required.

## License

MIT (packages). The web app in this repo is private unless you choose to license it separately.