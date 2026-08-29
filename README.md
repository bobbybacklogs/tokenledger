# TokenLedger

TokenLedger is a browser-based AI unit economics planner for SaaS products. It helps product, finance, and engineering teams estimate AI spend based on their user base, compare provider/model pricing, project subscription margins, and define customer-tier usage quotas.

## What it does

- Compare seeded estimates for OpenAI, Anthropic, Google, and Mistral models.
- Select an active model and calculate projected monthly AI spend.
- Set the total number of SaaS users for the scenario.
- Adjust Free, Pro, and Business tier allocations and subscription prices.
- Model input and output tokens per user by customer tier.
- Calculate monthly AI cost, blended cost per user, projected revenue, and gross margin.
- Set dynamic monthly token quotas for each customer tier.
- Export the current budget projection as CSV.
- Print the planner or save it as a PDF through the browser print dialog.

## Cost model

TokenLedger estimates monthly model cost from the configured audience and usage assumptions:

```text
monthly AI cost = users × ((input tokens / 1,000,000 × input rate)
                         + (output tokens / 1,000,000 × output rate))
```

Provider rates are displayed as estimated USD per 1 million tokens. The model pricing in this version is seeded in the client application and is intended for planning, not billing reconciliation.

## Getting started

### Requirements

- Node.js 20 or newer
- pnpm

### Install dependencies

```bash
pnpm install
```

### Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Create a production build

```bash
pnpm build
pnpm start
```

## Using the planner

1. Enter the total number of SaaS users in the **SaaS users** control.
2. Choose a model or select **Use model** from the provider comparison table.
3. Review the calculated KPIs at the top of the workspace.
4. Edit tier names, user allocations, and subscription prices.
5. Update per-tier token assumptions and quotas as needed.
6. Use **Export CSV** for spreadsheet analysis or **Print report** for a printable budget snapshot.

The sidebar navigation scrolls between Overview, Model costs, Subscription tiers, and Usage quotas.

## Project structure

```text
app/
  page.tsx       Main interactive cost planner
  layout.tsx     App metadata and root layout
  globals.css    Theme, dashboard styles, and print rules
components/
  ui/            Shared shadcn/ui primitives
```

## Data and integrations

The current version does not connect to cloud billing systems, provider billing APIs, a database, or external credentials. All calculations run in the browser from editable seeded assumptions. This keeps the planner useful for early SaaS modeling without requiring account access.

For a production billing product, future work could add versioned pricing catalogs, saved scenarios, authenticated workspaces, provider API synchronization, regional pricing, caching, and audit history.

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui-compatible primitives
- Lucide React icons

## Notes

- Prices are estimates and should be verified against current provider pricing before making purchasing or pricing decisions.
- CSV export reflects the currently selected model, user count, tiers, quotas, and calculated margins.
- Print output is generated with the browser's native print functionality.
- No environment variables are required for the current version.

## License

This project is private and does not currently specify an open-source license.
