'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, BarChart3, ChevronDown, CircleHelp, Download, FileText, Gauge, Layers3, MoreHorizontal, Plus, Settings2, Sparkles, WalletCards, Zap } from 'lucide-react'

type Model = { provider: string; name: string; color: string; input: number; output: number; context: string; best: string }
type Tier = { name: string; users: number; price: number; input: number; output: number; quota: number; accent: string }

const models: Model[] = [
  { provider: 'OpenAI', name: 'GPT-4o mini', color: 'coral', input: 0.15, output: 0.6, context: '128k', best: 'High-volume chat' },
  { provider: 'Anthropic', name: 'Claude 3.5 Haiku', color: 'orange', input: 0.8, output: 4, context: '200k', best: 'Fast reasoning' },
  { provider: 'Google', name: 'Gemini 2.0 Flash', color: 'blue', input: 0.1, output: 0.4, context: '1M', best: 'Long context' },
  { provider: 'Mistral', name: 'Mistral Small', color: 'plum', input: 0.1, output: 0.3, context: '32k', best: 'Balanced workloads' },
]

const initialTiers: Tier[] = [
  { name: 'Free', users: 8000, price: 0, input: 18000, output: 6000, quota: 25000, accent: 'gray' },
  { name: 'Pro', users: 3200, price: 29, input: 120000, output: 40000, quota: 250000, accent: 'coral' },
  { name: 'Business', users: 800, price: 99, input: 420000, output: 140000, quota: 1000000, accent: 'plum' },
]

const money = (value: number) => value < 0.01 ? `$${value.toFixed(3)}` : `$${value.toFixed(2)}`
const compact = (value: number) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${Math.round(value / 1000)}k` : value.toString()

export default function Page() {
  const [users, setUsers] = useState(12000)
  const [selected, setSelected] = useState('GPT-4o mini')
  const [tiers, setTiers] = useState(initialTiers)
  const [activeSection, setActiveSection] = useState('overview')
  const activeModel = models.find((model) => model.name === selected) ?? models[0]

  const goToSection = (section: string) => {
    setActiveSection(section)
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const totals = useMemo(() => {
    const spend = tiers.reduce((sum, tier) => sum + tier.users * ((tier.input / 1000000) * activeModel.input + (tier.output / 1000000) * activeModel.output), 0)
    const revenue = tiers.reduce((sum, tier) => sum + tier.users * tier.price, 0)
    const weightedCost = spend / users
    return { spend, revenue, weightedCost, margin: revenue ? ((revenue - spend) / revenue) * 100 : 0 }
  }, [activeModel, tiers, users])

  const updateTier = (index: number, key: keyof Tier, value: string) => {
    setTiers((current) => current.map((tier, i) => i === index ? { ...tier, [key]: key === 'name' || key === 'accent' ? value : Number(value) } : tier))
  }

  const exportCsv = () => {
    const rows = [['Tier', 'Users', 'Price', 'Input tokens/user', 'Output tokens/user', 'Quota', 'Monthly AI cost', 'Gross margin']]
    tiers.forEach((tier) => {
      const cost = tier.users * ((tier.input / 1000000) * activeModel.input + (tier.output / 1000000) * activeModel.output)
      rows.push([tier.name, String(tier.users), String(tier.price), String(tier.input), String(tier.output), String(tier.quota), cost.toFixed(2), tier.price ? `${(((tier.price - cost / tier.users) / tier.price) * 100).toFixed(1)}%` : '—'])
    })
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'tokenledger-budget.csv'; link.click(); URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="sidebar fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-border bg-sidebar px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2"><div className="brand-mark"><Zap /></div><span className="font-mono text-sm font-bold tracking-tight">TOKENLEDGER</span></div>
        <div className="mt-12 flex flex-col gap-2">
          <p className="nav-label">WORKSPACE</p>
          <button className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => goToSection('overview')}><BarChart3 /> Overview</button><button className={`nav-item ${activeSection === 'models' ? 'active' : ''}`} onClick={() => goToSection('models')}><Layers3 /> Model costs</button><button className={`nav-item ${activeSection === 'tiers' ? 'active' : ''}`} onClick={() => goToSection('tiers')}><WalletCards /> Subscription tiers</button><button className={`nav-item ${activeSection === 'quotas' ? 'active' : ''}`} onClick={() => goToSection('quotas')}><Gauge /> Usage quotas</button>
          <p className="nav-label mt-8">TOOLS</p><button className="nav-item" onClick={exportCsv}><Download /> Export report</button><button className="nav-item" onClick={() => window.print()}><FileText /> Print budget</button>
        </div>
        <div className="mt-auto border-t border-border pt-5"><div className="flex items-center gap-3"><div className="avatar">AL</div><div><p className="text-xs font-semibold">Alex Lee</p><p className="text-[11px] text-muted-foreground">Growth workspace</p></div><MoreHorizontal className="ml-auto size-4 text-muted-foreground" /></div></div>
      </aside>

      <section className="lg:pl-60">
        <header className="topbar flex min-h-20 items-center justify-between border-b border-border px-6 py-4 lg:px-10"><div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Workspace</span><span>/</span><span className="text-foreground">Cost planner</span></div><h1 className="mt-1 text-xl font-semibold tracking-tight">Scenario: <span className="text-primary">Growth plan</span></h1></div><div className="flex items-center gap-3"><button className="icon-button" aria-label="Help"><CircleHelp /></button><button className="outline-button" onClick={() => window.print()}><FileText /> Print report</button><button className="primary-button" onClick={exportCsv}><Download /> Export CSV</button></div></header>

        <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">AI UNIT ECONOMICS</p><h2 className="display-title">Know your cost<br /><em>before</em> you scale.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Model your AI spend across providers, tune usage by tier, and protect your margins with dynamic quotas.</p></div><div className="assumption-bar"><Settings2 /><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active model</p><select value={selected} onChange={(e) => setSelected(e.target.value)} className="bg-transparent text-sm font-semibold outline-none"><option>{models[0].name}</option>{models.slice(1).map((model) => <option key={model.name}>{model.name}</option>)}</select></div><ChevronDown className="size-4 text-muted-foreground" /></div></div>

          <div id="overview" className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Kpi label="Monthly AI spend" value={money(totals.spend)} change="12.4%" down /><Kpi label="Blended cost / user" value={money(totals.weightedCost)} change="vs. last scenario" /><Kpi label="Projected revenue" value={money(totals.revenue)} change={`${users.toLocaleString()} users`} /><Kpi label="Gross margin" value={`${totals.margin.toFixed(1)}%`} change="Healthy range" /></div>

          <section id="models" className="panel mb-6 overflow-hidden"><div className="panel-header"><div><p className="eyebrow">PROVIDER BENCHMARK</p><h3 className="section-title">Compare model economics</h3></div><span className="muted-chip">Estimates · USD / 1M tokens</span></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Provider / model</th><th>Input / 1M</th><th>Output / 1M</th><th>Context</th><th>Best for</th><th>Cost / user</th><th /></tr></thead><tbody>{models.map((model) => { const cost = (tiers.reduce((s, t) => s + t.input * t.users, 0) / 1000000 * model.input + tiers.reduce((s, t) => s + t.output * t.users, 0) / 1000000 * model.output) / users; return <tr key={model.name} className={selected === model.name ? 'selected-row' : ''}><td><div className="flex items-center gap-3"><span className={`provider-dot ${model.color}`} /><div><p className="font-semibold">{model.name}</p><p className="text-xs text-muted-foreground">{model.provider}</p></div></div></td><td className="font-mono">${model.input.toFixed(2)}</td><td className="font-mono">${model.output.toFixed(2)}</td><td>{model.context}</td><td className="text-muted-foreground">{model.best}</td><td className="font-mono font-semibold">{money(cost)}</td><td><button className="select-button" onClick={() => setSelected(model.name)}>{selected === model.name ? 'Selected' : 'Use model'}</button></td></tr>})}</tbody></table></div></section>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section id="tiers" className="panel overflow-hidden"><div className="panel-header"><div><p className="eyebrow">SUBSCRIPTION MODEL</p><h3 className="section-title">Tiered projections</h3></div><button className="ghost-button"><Plus /> Add tier</button></div><div className="tier-list">{tiers.map((tier, index) => { const monthly = tier.users * ((tier.input / 1000000) * activeModel.input + (tier.output / 1000000) * activeModel.output); const margin = tier.price ? ((tier.price - monthly / tier.users) / tier.price) * 100 : 0; return <div className="tier-row" key={tier.name}><div className={`tier-accent ${tier.accent}`} /><div className="tier-name"><input value={tier.name} onChange={(e) => updateTier(index, 'name', e.target.value)} /><span>{tier.users.toLocaleString()} users</span></div><div><p className="field-label">PRICE / MO</p><div className="inline-input"><span>$</span><input type="number" value={tier.price} onChange={(e) => updateTier(index, 'price', e.target.value)} /></div></div><div><p className="field-label">AI COST / MO</p><p className="metric-value">{money(monthly)}</p></div><div><p className="field-label">MARGIN</p><p className={`metric-value ${margin > 70 ? 'positive' : 'warning'}`}>{tier.price ? `${margin.toFixed(1)}%` : '—'}</p></div></div>})}</div><div className="table-footer"><span><Sparkles className="size-4 text-primary" /> Projections update as you edit assumptions</span><button className="text-button">View assumptions <ArrowUpRight /></button></div></section>

            <section id="quotas" className="panel"><div className="panel-header"><div><p className="eyebrow">GUARDRAILS</p><h3 className="section-title">Dynamic quotas</h3></div><button className="icon-button"><Settings2 /></button></div><p className="text-sm leading-6 text-muted-foreground">Set monthly token ceilings by customer tier to keep usage predictable.</p><div className="quota-list">{tiers.map((tier, index) => <div className="quota-item" key={tier.name}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={`mini-dot ${tier.accent}`} /><span className="text-sm font-semibold">{tier.name}</span></div><span className="font-mono text-xs text-muted-foreground">{compact(tier.quota)} tokens</span></div><input className="quota-range" type="range" min="5000" max="2000000" step="5000" value={tier.quota} onChange={(e) => updateTier(index, 'quota', e.target.value)} /><div className="flex justify-between text-[10px] text-muted-foreground"><span>5k</span><span>2M max</span></div></div>)}</div><div className="quota-callout"><Gauge /><div><p className="text-xs font-semibold">Quota forecast</p><p className="mt-1 text-xs leading-5 text-muted-foreground">At current usage, <strong className="text-foreground">92%</strong> of Pro users stay within their monthly limit.</p></div></div></section></div>
        </div>
      </section>
    </main>
  )
}

function Kpi({ label, value, change, down }: { label: string; value: string; change: string; down?: boolean }) { return <div className="kpi-card"><div className="flex items-center justify-between"><p className="eyebrow">{label}</p><span className={`trend ${down ? 'negative' : ''}`}>{down ? <ArrowDown /> : <ArrowUpRight />}{change}</span></div><p className="kpi-value">{value}</p><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /></div></div> }
