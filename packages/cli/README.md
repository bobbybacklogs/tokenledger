# @tokenledger/cli

Command-line AI unit economics for SaaS products. Pulls **live model pricing** from OpenRouter (or models.dev with `--source models.dev`) and projects AI spend, revenue, and gross margin for your subscription tiers.

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

List model pricing — live from OpenRouter (thousands of models), live from models.dev with `--source models.dev`, or the bundled estimate catalog with `--offline`.

```
tokenledger models
tokenledger models claude
tokenledger models --provider openai --sort price -l 5
tokenledger models --source models.dev "claude-opus"
tokenledger models --featured
tokenledger models -k coding --sort price      # cheapest coding models
tokenledger models -k reasoning -s price -l 10 # cheapest reasoning models
tokenledger models -k vision                   # vision-capable models
tokenledger models --sort context              # largest context windows first
tokenledger models --json
```

Options: `-p, --provider <name>`, `-s, --sort <price|output|context|provider|id>` (default provider), `-l, --limit <n>`, `-k, --category <general|coding|reasoning|vision|image|embedding|audio>`, `-f, --featured`, `--source <openrouter|models.dev|offline>`, `--search <term>`, `-o, --offline`, `-j, --json`.

Categories are inferred from a model's id/name (plus modality and per-image pricing when available): `general` (text), `coding`, `reasoning`, `vision` (image input), `image` (image generation), `embedding`, `audio`.

### `tokenledger search <term>`

Same as `models <term>` — search the catalog by id or name. Handy if `search` is easier to remember than the positional form.

```
tokenledger search gpt-4o
tokenledger search claude --source models.dev
tokenledger search coder -k coding --sort price -l 5
```

Options: `-p, --provider <name>`, `-s, --sort <price|output|context|provider|id>`, `-l, --limit <n>`, `-k, --category <name>`, `-f, --featured`, `--source <openrouter|models.dev|offline>`, `-o, --offline`, `-j, --json`.

### `tokenledger estimate`

Project AI spend, revenue, and margin for a model and tier mix.

```
tokenledger estimate
tokenledger estimate -m openai/gpt-4o-mini -u 12000
tokenledger estimate -t "Free:8000:0:18000:6000:25000" -t "Pro:3200:29:120000:40000:250000" -u 12000
```

Options: `-m, --model <id>`, `-u, --users <n>`, `-t, --tier <spec>` (repeatable — usage format `Name:users:price:requests`, or token format `Name:users:price:input:output:quota`), `-z, --size <brief|standard|detailed|intensive>` (default standard), `-f, --tiers <file>`, `--source <openrouter|models.dev|offline>`, `-o, --offline`, `-j, --json`.

Tiers can be written in **business terms** (requests per user per month, with an exchange-size preset) — no raw token counts needed. Example with the usage format:

```
tokenledger estimate -m openai/gpt-4o-mini -u 12000 \
  -t "Free:8000:0:100" -t "Pro:3200:29:1000" -t "Business:800:99:5000" --size standard
```

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

Compare models across different pricing sources by passing a `--source` list (commas or spaces) that maps positionally to each model. `default` means OpenRouter:

```
tokenledger compare openai/gpt-4o-mini openai/gpt-4o-mini --source models.dev,default
tokenledger compare openai/gpt-4o-mini anthropic/claude-3.5-haiku --source models.dev,offline
```

A single value (e.g. `--source models.dev`) applies to every model. When the comparison mixes sources, a **Source** column appears and each model is priced against its own catalog.

Options: `--scenario <file>`, `-t, --tier <spec>`, `-f, --tiers <file>`, `-u, --users <n>`, `-l, --limit <n>`, `-k, --category <name>`, `--source <openrouter|models.dev|offline|default,...>`, `-o, --offline`, `-j, --json`. With `-k, --category`, the default featured set is narrowed to that category (e.g. `compare -k coding` compares coding models).

### `tokenledger init [file]`

Scaffold a starter scenario JSON (the bundled Growth plan):

```
tokenledger init                           # writes scenario.json
tokenledger init my-plan.json -m openai/gpt-4o-mini
```

### `tokenledger wizard`

Build a scenario interactively, step by step — **no JSON required**. Every question shows a `[default]`; press Enter to accept it.

```
tokenledger wizard
tokenledger wizard --offline
tokenledger wizard --source models.dev
tokenledger wizard --name "Launch plan" --file launch.json
```

Flow: scenario name → token or image lane → model (type an id, or a search term like `claude` to choose from matches) → total users (0 to keep tier counts as-is) → **exchange size** (Brief/Standard/Detailed/Intensive) → number of tiers → per-tier users, price, and **requests per user / month** → live projection → save to a scenario JSON file. Token budgets are derived automatically from requests × exchange size, so you never enter raw token counts.

Options: `--source <openrouter|models.dev|offline>`, `-o, --offline`, `-n, --name <name>`, `-f, --file <file>`. To pipe/script answers, set `TOKENLEDGER_WIZARD_SCRIPT=1` (respects the non-interactive CLI guard).

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

Tiers can instead be written in **business terms** — `requests` per user per month plus an optional `size` preset — and the token budgets are derived for you (default size: standard):

```json
{
  "name": "Growth plan (usage)",
  "model": "openai/gpt-4o-mini",
  "tiers": [
    { "name": "Free", "users": 8000, "price": 0, "requests": 100 },
    { "name": "Pro", "users": 3200, "price": 29, "requests": 1000, "size": "detailed" }
  ]
}
```

`size` is one of `brief`, `standard`, `detailed`, `intensive`.

## Pricing source

By default every command hits the public OpenRouter models endpoint (`https://openrouter.ai/api/v1/models`) — no API key.

With `--source models.dev`, the token-lane commands (`models`, `estimate`, `scenario`, `compare`, `wizard`) use the models.dev public catalog instead (`https://models.dev`, via `mdev-sdk`) — the same open catalog of providers, models, and prices that powers OpenCode. It carries ~7,000⁺ priced models with provider display names from the catalog itself.

`compare` also accepts a **per-model source list**: `--source models.dev,default` prices the first model from models.dev and the second from OpenRouter (`default` = OpenRouter), each row showing its Source column.

If a live feed is unreachable, the CLI falls back to the bundled estimate catalog and tells you so. Use `--offline` (alias for `--source offline`) to force the bundled catalog. Image-lane commands (`images`, `image-estimate`, `image-compare`) run on OpenRouter or the offline catalog only — models.dev does not publish per-image prices.

## Output

Both referenced `money` formatting and per-tier tables come from `@tokenledger/core`, so the CLI always matches the web planner's math. `--json` emits the full projection for scripting.

## License

MIT