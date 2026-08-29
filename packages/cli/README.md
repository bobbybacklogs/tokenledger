# @tokenledger/cli

Command-line AI unit economics for SaaS products. Pulls **live model pricing** from OpenRouter and projects AI spend, revenue, and gross margin for your subscription tiers.

## Install

```bash
npm install -g @tokenledger/cli
# or local:
npm install @tokenledger/cli
npx tokenledger --help
```

Requires Node.js ≥ 20.

## Commands

### `tokenledger models [search]`

List model pricing — live from OpenRouter (thousands of models), or the bundled estimate catalog with `--offline`.

```
tokenledger models
tokenledger models claude
tokenledger models --provider openai --sort price -l 5
tokenledger models --featured
tokenledger models --json
```

Options: `-p, --provider <name>`, `-s, --sort <price|provider|id>` (default provider), `-l, --limit <n>`, `-f, --featured`, `-o, --offline`, `-j, --json`.

### `tokenledger estimate`

Project AI spend, revenue, and margin for a model and tier mix.

```
tokenledger estimate
tokenledger estimate -m openai/gpt-4o-mini -u 12000
tokenledger estimate -t "Free:8000:0:18000:6000:25000" -t "Pro:3200:29:120000:40000:250000" -u 12000
```

Options: `-m, --model <id>`, `-u, --users <n>`, `-t, --tier <spec>` (repeatable, `Name:users:price:inputTokens:outputTokens:quota`), `-f, --tiers <file>`, `-o, --offline`, `-j, --json`.

### `tokenledger scenario <file>`

Run a projection from a scenario JSON file.

```
tokenledger scenario scenario.json
tokenledger scenario scenario.json --json
```

### `tokenledger compare [models...]`

Compare multiple models against the same scenario. Defaults to the curated featured set.

```
tokenledger compare
tokenledger compare openai/gpt-4o-mini "~google/gemini-flash-latest"
tokenledger compare --scenario scenario.json --limit 10
```

### `tokenledger init [file]`

Scaffold a starter scenario JSON (the bundled Growth plan):

```
tokenledger init                           # writes scenario.json
tokenledger init my-plan.json -m openai/gpt-4o-mini
```

### `tokenledger images [search]`

List **image-generation model pricing** (USD per generated image) — live from OpenRouter, or the bundled catalog with `--offline`.

```
tokenledger images
tokenledger images --sort price -l 5
tokenledger images --featured
tokenledger images --json
```

Options: `-p, --provider <name>`, `-s, --sort <price|provider|id>`, `-l, --limit <n>`, `-f, --featured`, `-o, --offline`, `-j, --json`.

### `tokenledger image-estimate`

Project image-generation spend, revenue, and margin — the image lane: **image model × images/user/month × users**.

```
tokenledger image-estimate
tokenledger image-estimate -m openai/gpt-5-image
tokenledger image-estimate -t "Free:8000:0:5" -t "Pro:3200:29:100" -t "Business:800:99:500" -u 12000
```

Options: `-m, --model <id>`, `-u, --users <n>`, `-t, --tier <spec>` (repeatable, `Name:users:price:imagesPerUser:quota`), `-f, --tiers <file>`, `-o, --offline`, `-j, --json`.

### `tokenledger image-compare [models...]`

Compare image-generation models against the same scenario. Defaults to the curated featured image set.

```
tokenledger image-compare
tokenledger image-compare openai/gpt-5-image google/gemini-3.1-flash-image
tokenledger image-compare --scenario scenario.json --limit 10
```

Options: `--scenario <file>`, `-t, --tier <spec>`, `-f, --tiers <file>`, `-u, --users <n>`, `-l, --limit <n>`, `-o, --offline`, `-j, --json`.

## Scenario format

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

`model` and `users` are optional; `users` scales the per-tier splits proportionally. Tiers may also carry `"images"` (images generated per user per month) for the image lane:

```json
{ "name": "Pro", "users": 3200, "price": 29, "input": 120000, "output": 40000, "quota": 250000, "images": 100 }
```

## Pricing source

By default every command hits the public OpenRouter models endpoint (`https://openrouter.ai/api/v1/models`) — no API key. If the feed is unreachable, the CLI falls back to the bundled estimate catalog and tells you so. Use `--offline` to force the catalog.

## Output

Both referenced `money` formatting and per-tier tables come from `@tokenledger/core`, so the CLI always matches the web planner's math. `--json` emits the full projection for scripting.

## License

MIT