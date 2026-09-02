'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUpRight, BarChart3, ChevronDown, CircleHelp, Download, FileText, Gauge, Layers3, MoreHorizontal, Plus, RefreshCw, Settings2, Sparkles, WalletCards, Zap } from 'lucide-react'

import {
  CATALOG_EMBEDDING_MODELS,
  CATALOG_IMAGE_MODELS,
  CATALOG_MODELS,
  CATALOG_VIDEO_MODELS,
  DEFAULT_EMBEDDING_MODEL_ID,
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  calculateCreditScenario,
  calculateEmbeddingScenario,
  calculateImageScenario,
  calculateScenario,
  calculateVideoScenario,
  compact,
  contextLabel,
  defaultCreditScenario,
  defaultEmbeddingScenario,
  defaultImageScenario,
  defaultScenario,
  defaultVideoScenario,
  embeddingTierMonthlyCost,
  embeddingTierProjection,
  featuredEmbeddingModels,
  featuredImageModels,
  featuredModels,
  featuredVideoModels,
  findModel,
  imageTierMonthlyCost,
  imageTierProjection,
  isEmbeddingModel,
  isImageModel,
  isVideoModel,
  loadModels,
  money,
  monthlyEmbedTokens,
  monthlyImages,
  monthlyVideoSeconds,
  number,
  scaleUsersPerTier,
  tierMonthlyCost,
  tierProjection,
  videoTierMonthlyCost,
  videoTierProjection,
  type CreditResetCadence,
  type CreditTier,
  type LiveModel,
  type LoadOptions,
  type ModelList,
  type PricingSource,
} from '@tokenledger/core'

type UITier = CreditTier & { accent: string }
type PlannerSource = Exclude<NonNullable<LoadOptions['source']>, 'offline'>

const PLANNER_SOURCES: { id: PlannerSource; label: string }[] = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'modelsdev', label: 'models.dev' },
  { id: 'github', label: 'GitHub Copilot' },
  { id: 'vercel', label: 'Vercel' },
]

function pricingFeedLabel(source: PricingSource): string {
  switch (source) {
    case 'modelsdev':
      return 'models.dev'
    case 'github':
      return 'GitHub Copilot'
    case 'vercel':
      return 'Vercel AI Gateway'
    case 'offline':
      return 'offline estimates'
    default:
      return 'OpenRouter'
  }
}

const ACCENTS = ['gray', 'coral', 'plum', 'orange', 'blue']

const initialTiers = (): UITier[] =>
  defaultCreditScenario().tiers.map((tier, index) => {
    const images = defaultImageScenario().tiers[index]?.images ?? 0
    const embedTokens = defaultEmbeddingScenario().tiers[index]?.embedTokens ?? 0
    const videoSeconds = defaultVideoScenario().tiers[index]?.videoSeconds ?? 0
    return { ...tier, images, embedTokens, videoSeconds, accent: ACCENTS[index % ACCENTS.length] ?? 'gray' }
  })

const providerColor = (provider: string): string => {
  const key = provider.toLowerCase()
  if (key.includes('openai')) return 'coral'
  if (key.includes('anthropic')) return 'orange'
  if (key.includes('google')) return 'blue'
  if (key.includes('mistral')) return 'plum'
  if (key.includes('meta') || key.includes('xai')) return 'coral'
  if (key.includes('github')) return 'gray'
  if (key.includes('vercel')) return 'blue'
  return 'gray'
}

const providerLabel = (model: LiveModel) => (model.estimate ? `${model.name} · estimate` : model.name)

export default function Page() {
  const [modelList, setModelList] = useState<ModelList | null>(null)
  const [source, setSource] = useState<PlannerSource>('openrouter')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState('')
  const [selectedImage, setSelectedImage] = useState('')
  const [selectedEmbed, setSelectedEmbed] = useState('')
  const [selectedVideo, setSelectedVideo] = useState('')
  const [users, setUsers] = useState(defaultScenario().users ?? 12000)
  const [tiers, setTiers] = useState<UITier[]>(initialTiers)
  const [creditValue, setCreditValue] = useState(0.01)
  const [creditMultiplier, setCreditMultiplier] = useState(1)
  const [creditReset, setCreditReset] = useState<CreditResetCadence>('monthly')
  const [activeSection, setActiveSection] = useState('overview')

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await loadModels({ source })
    setModelList(list)
    setSelected((current) => (findModel(list.models, current) ? current : (findModel(list.models, DEFAULT_MODEL_ID) ?? list.models[0])?.id ?? ''))
    setSelectedImage((current) => {
      const imageModels = list.models.filter(isImageModel)
      return findModel(imageModels, current) ? current : (findModel(list.models, DEFAULT_IMAGE_MODEL_ID) ?? imageModels[0])?.id ?? ''
    })
    setSelectedEmbed((current) => {
      const embedModels = list.models.filter(isEmbeddingModel)
      return findModel(embedModels, current) ? current : (findModel(list.models, DEFAULT_EMBEDDING_MODEL_ID) ?? embedModels[0])?.id ?? ''
    })
    setSelectedVideo((current) => {
      const videoModels = list.models.filter(isVideoModel)
      return findModel(videoModels, current) ? current : (findModel(list.models, DEFAULT_VIDEO_MODEL_ID) ?? videoModels[0])?.id ?? ''
    })
    setLoading(false)
  }, [source])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const featured = useMemo(() => {
    if (!modelList) return []
    const backfill = modelList.source === 'live' || modelList.source === 'offline' ? CATALOG_MODELS : undefined
    return featuredModels(modelList.models, { backfill })
  }, [modelList])

  const activeModel = useMemo(
    () => featured.find((model) => model.id === selected) ?? featured[0],
    [featured, selected],
  )

  const projection = useMemo(() => {
    if (!activeModel) return null
    return calculateScenario({ name: 'Growth plan', model: activeModel.id, users, tiers }, activeModel)
  }, [activeModel, users, tiers])

  const creditProjection = useMemo(() => {
    if (!activeModel) return null
    return calculateCreditScenario(
      {
        name: 'Credits plan',
        model: activeModel.id,
        users,
        tiers,
        plan: { creditValueUsd: creditValue, modelMultiplier: creditMultiplier, reset: creditReset, resetDay: 1 },
      },
      activeModel,
    )
  }, [activeModel, users, tiers, creditValue, creditMultiplier, creditReset])

  const imageModels = useMemo(() => {
    if (!modelList) return []
    const backfill = modelList.source === 'live' || modelList.source === 'offline' ? CATALOG_IMAGE_MODELS : undefined
    return featuredImageModels(modelList.models, { backfill })
  }, [modelList])

  const activeImageModel = useMemo(
    () => imageModels.find((model) => model.id === selectedImage) ?? imageModels[0],
    [imageModels, selectedImage],
  )

  const imageProjection = useMemo(() => {
    if (!activeImageModel) return null
    return calculateImageScenario({ name: 'Growth plan', model: activeImageModel.id, users, tiers }, activeImageModel)
  }, [activeImageModel, users, tiers])

  const embeddingModels = useMemo(() => {
    if (!modelList) return []
    const backfill = modelList.source === 'live' || modelList.source === 'offline' || modelList.source === 'modelsdev' || modelList.source === 'vercel' ? CATALOG_EMBEDDING_MODELS : undefined
    return featuredEmbeddingModels(modelList.models, { backfill })
  }, [modelList])

  const activeEmbedModel = useMemo(
    () => embeddingModels.find((model) => model.id === selectedEmbed) ?? embeddingModels[0],
    [embeddingModels, selectedEmbed],
  )

  const embedProjection = useMemo(() => {
    if (!activeEmbedModel) return null
    return calculateEmbeddingScenario({ name: 'Growth plan', model: activeEmbedModel.id, users, tiers }, activeEmbedModel)
  }, [activeEmbedModel, users, tiers])

  const videoModels = useMemo(() => {
    if (!modelList) return []
    const backfill = modelList.source === 'vercel' || modelList.source === 'offline' ? CATALOG_VIDEO_MODELS : undefined
    return featuredVideoModels(modelList.models, { backfill })
  }, [modelList])

  const activeVideoModel = useMemo(
    () => videoModels.find((model) => model.id === selectedVideo) ?? videoModels[0],
    [videoModels, selectedVideo],
  )

  const videoProjection = useMemo(() => {
    if (!activeVideoModel) return null
    return calculateVideoScenario({ name: 'Growth plan', model: activeVideoModel.id, users, tiers }, activeVideoModel)
  }, [activeVideoModel, users, tiers])

  const totalImages = monthlyImages(tiers)
  const imageSpend = imageProjection?.spend ?? 0
  const embedSpend = embedProjection?.spend ?? 0
  const videoSpend = videoProjection?.spend ?? 0
  const totalSpend = (projection?.spend ?? 0) + imageSpend + embedSpend + videoSpend
  const totalCostPerUser = users > 0 ? totalSpend / users : 0
  const totalMargin = projection && projection.revenue > 0 ? ((projection.revenue - totalSpend) / projection.revenue) * 100 : 0

  const costForModel = useCallback(
    (model: LiveModel) => {
      const total = tiers.reduce((sum, tier) => sum + tierMonthlyCost(tier, model), 0)
      return users > 0 ? total / users : 0
    },
    [tiers, users],
  )

  const imageCostForUser = useCallback(
    (model: LiveModel) => {
      const total = tiers.reduce((sum, tier) => sum + imageTierMonthlyCost(tier, model), 0)
      return users > 0 ? total / users : 0
    },
    [tiers, users],
  )

  const embedCostForUser = useCallback(
    (model: LiveModel) => {
      const total = tiers.reduce((sum, tier) => sum + embeddingTierMonthlyCost(tier, model), 0)
      return users > 0 ? total / users : 0
    },
    [tiers, users],
  )

  const videoCostForUser = useCallback(
    (model: LiveModel) => {
      const total = tiers.reduce((sum, tier) => sum + videoTierMonthlyCost(tier, model), 0)
      return users > 0 ? total / users : 0
    },
    [tiers, users],
  )

  const goToSection = (section: string) => {
    setActiveSection(section)
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const updateUserBase = (value: string) => {
    const nextUsers = Math.max(0, Number(value) || 0)
    setUsers(nextUsers)
    setTiers((current) => scaleUsersPerTier(current, nextUsers) as UITier[])
  }

  const updateTier = (index: number, key: keyof UITier, value: string) => {
    setTiers((current) => current.map((tier, i) => (i === index ? { ...tier, [key]: key === 'name' || key === 'accent' ? value : Number(value) } : tier)))
  }

  const exportCsv = () => {
    const sourceLabel =
      modelList?.source && modelList.source !== 'offline'
        ? `live (${pricingFeedLabel(modelList.source)}, ${new Date(modelList.fetchedAt ?? '').toISOString()})`
        : 'offline estimates'
    const rows: string[][] = [
      [
        'TokenLedger budget',
        activeModel ? `${activeModel.name} (${activeModel.id})` : '',
        `${(projection?.users ?? users).toLocaleString()} users`,
        `pricing: ${sourceLabel}`,
        activeImageModel ? `image model: ${activeImageModel.name} (${activeImageModel.id})` : '',
      ],
      [],
        ['Tier', 'Users', 'Price', 'Input tokens/user', 'Output tokens/user', 'Quota', 'Cache hit %', 'Images/user', 'Embed tokens/user', 'Video seconds/user', 'Token AI cost/mo', 'Image cost/mo', 'Embed cost/mo', 'Video cost/mo', 'Total AI cost/mo', 'AI cost/user', 'Gross margin'],
    ]
    for (const tier of tiers) {
      const tp = activeModel ? tierProjection(tier, activeModel) : null
      const ip = activeImageModel ? imageTierProjection(tier, activeImageModel) : null
      const ep = activeEmbedModel ? embeddingTierProjection(tier, activeEmbedModel) : null
      const vp = activeVideoModel ? videoTierProjection(tier, activeVideoModel) : null
      const tokenCost = tp?.monthlyCost ?? 0
      const imageCost = ip?.monthlyCost ?? 0
      const embedCost = ep?.monthlyCost ?? 0
      const videoCost = vp?.monthlyCost ?? 0
      const total = tokenCost + imageCost + embedCost + videoCost
      const costPerUser = tier.users > 0 ? total / tier.users : 0
      const margin = tier.price > 0 && tier.users > 0 ? ((tier.price - costPerUser) / tier.price) * 100 : null
      rows.push([
        tier.name,
        String(tier.users),
        String(tier.price),
        String(tier.input),
        String(tier.output),
        String(tier.quota),
        String(tier.cacheHit ?? 0),
        String(tier.images ?? 0),
        String(tier.embedTokens ?? 0),
        String(tier.videoSeconds ?? 0),
        tokenCost.toFixed(2),
        imageCost.toFixed(2),
        embedCost.toFixed(2),
        videoCost.toFixed(2),
        total.toFixed(2),
        costPerUser.toFixed(4),
        margin === null ? '—' : `${margin.toFixed(1)}%`,
      ])
    }
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'tokenledger-budget.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const statusChip = modelList
    ? modelList.source === 'offline'
      ? `Offline estimates · ${modelList.models.length.toLocaleString()} models`
      : `Live · ${pricingFeedLabel(modelList.source)} · ${modelList.models.length.toLocaleString()} models`
    : 'Loading prices…'

  const proTier = tiers.find((tier) => tier.name.toLowerCase() === 'pro') ?? tiers[1] ?? tiers[0]
  const proUtilization = proTier && activeModel ? tierProjection(proTier, activeModel).quotaUtilization ?? 0 : 0

  return (
    <main className="min-h-screen bg-background text-foreground">
      <aside className="sidebar fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r border-border bg-sidebar px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2"><div className="brand-mark"><Zap /></div><span className="font-mono text-sm font-bold tracking-tight">TOKENLEDGER</span></div>
        <div className="mt-12 flex flex-col gap-2">
          <p className="nav-label">WORKSPACE</p>
          <button className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`} onClick={() => goToSection('overview')}><BarChart3 /> Overview</button><button className={`nav-item ${activeSection === 'models' ? 'active' : ''}`} onClick={() => goToSection('models')}><Layers3 /> Model costs</button><button className={`nav-item ${activeSection === 'tiers' ? 'active' : ''}`} onClick={() => goToSection('tiers')}><WalletCards /> Subscription tiers</button><button className={`nav-item ${activeSection === 'credits' ? 'active' : ''}`} onClick={() => goToSection('credits')}><Sparkles /> Credits plan</button><button className={`nav-item ${activeSection === 'quotas' ? 'active' : ''}`} onClick={() => goToSection('quotas')}><Gauge /> Usage quotas</button>
          <p className="nav-label mt-8">TOOLS</p><button className="nav-item" onClick={exportCsv}><Download /> Export report</button><button className="nav-item" onClick={() => window.print()}><FileText /> Print budget</button>
        </div>
        <div className="mt-auto border-t border-border pt-5"><div className="flex items-center gap-3"><div className="avatar">AL</div><div><p className="text-xs font-semibold">Alex Lee</p><p className="text-[11px] text-muted-foreground">Growth workspace</p></div><MoreHorizontal className="ml-auto size-4 text-muted-foreground" /></div></div>
      </aside>

      <section className="lg:pl-60">
        <header className="topbar flex min-h-20 items-center justify-between border-b border-border px-6 py-4 lg:px-10"><div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>Workspace</span><span>/</span><span className="text-foreground">Cost planner</span></div><h1 className="mt-1 text-xl font-semibold tracking-tight">Scenario: <span className="text-primary">Growth plan</span></h1></div><div className="flex items-center gap-3"><button className="icon-button" aria-label="Refresh prices" disabled={loading} onClick={() => void refresh()} title="Refresh model prices"><RefreshCw className={loading ? 'animate-spin' : ''} /></button><button className="icon-button" aria-label="Help"><CircleHelp /></button><button className="outline-button" onClick={() => window.print()}><FileText /> Print report</button><button className="primary-button" onClick={exportCsv}><Download /> Export CSV</button></div></header>

        <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">AI UNIT ECONOMICS</p><h2 className="display-title">Know your cost<br /><em>before</em> you scale.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Model your AI spend across providers, tune usage by tier, and protect your margins with dynamic quotas. Prices load live from OpenRouter, models.dev, GitHub Copilot, or Vercel AI Gateway.</p></div><div className="flex flex-wrap items-center gap-3"><div className="assumption-bar"><Settings2 /><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pricing source</p><select aria-label="Pricing source" value={source} onChange={(e) => setSource(e.target.value as PlannerSource)} className="bg-transparent text-sm font-semibold outline-none">{PLANNER_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div><ChevronDown className="size-4 text-muted-foreground" /></div><div className="assumption-bar"><Settings2 /><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active model</p><select value={selected} onChange={(e) => setSelected(e.target.value)} className="bg-transparent text-sm font-semibold outline-none"><option value="" disabled>{loading ? 'Loading…' : 'Select model'}</option>{featured.map((model) => <option key={model.id} value={model.id}>{providerLabel(model)}</option>)}</select></div><ChevronDown className="size-4 text-muted-foreground" /></div><label className="assumption-bar"><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SaaS users</p><div className="flex items-center gap-1 font-mono text-sm font-semibold"><input aria-label="SaaS users" type="number" min="0" value={users} onChange={(e) => updateUserBase(e.target.value)} className="w-20 bg-transparent outline-none" /><span className="text-xs text-muted-foreground">total</span></div></div></label></div></div>

          <div id="overview" className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Kpi label="Monthly AI spend" value={projection ? money(totalSpend) : '—'} change="tokens + images + embed + video" down={false} /><Kpi label="Blended cost / user" value={projection ? money(totalCostPerUser) : '—'} change="vs. last scenario" /><Kpi label="Projected revenue" value={projection ? money(projection.revenue) : '—'} change={`${users.toLocaleString()} users`} /><Kpi label="Gross margin" value={projection ? `${totalMargin.toFixed(1)}%` : '—'} change="Healthy range" /></div>

          <section id="models" className="panel mb-6 overflow-hidden"><div className="panel-header"><div><p className="eyebrow">PROVIDER BENCHMARK</p><h3 className="section-title">Compare model economics</h3></div><div className="flex items-center gap-2"><span className="muted-chip">{statusChip}</span></div></div><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Provider / model</th><th>Input / 1M</th><th>Output / 1M</th><th>Context</th><th>Best for</th><th>Cost / user</th><th /></tr></thead><tbody>{featured.map((model) => { const cost = costForModel(model); return <tr key={model.id} className={selected === model.id ? 'selected-row' : ''}><td><div className="flex items-center gap-3"><span className={`provider-dot ${providerColor(model.provider)}`} /><div><p className="font-semibold">{model.name}{model.estimate ? <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">est.</span> : null}</p><p className="text-xs text-muted-foreground">{model.provider}</p></div></div></td><td className="font-mono">${model.input.toFixed(2)}</td><td className="font-mono">${model.output.toFixed(2)}</td><td>{contextLabel(model.context)}</td><td className="text-muted-foreground">{model.best ?? '—'}</td><td className="font-mono font-semibold">{money(cost)}</td><td><button className="select-button" onClick={() => setSelected(model.id)}>{selected === model.id ? 'Selected' : 'Use model'}</button></td></tr>})}{featured.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-xs text-muted-foreground">Loading live prices…</td></tr> : null}</tbody></table></div></section>

          <section className="panel mb-6 overflow-hidden"><div className="panel-header"><div><p className="eyebrow">IMAGE LANE</p><h3 className="section-title">Image generation costs</h3></div><div className="flex flex-wrap items-center gap-3"><label className="assumption-bar"><Settings2 /><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active image model</p><select value={selectedImage} onChange={(e) => setSelectedImage(e.target.value)} className="bg-transparent text-sm font-semibold outline-none"><option value="" disabled>{loading ? 'Loading…' : 'Select image model'}</option>{imageModels.map((model) => <option key={model.id} value={model.id}>{providerLabel(model)}</option>)}</select></div><ChevronDown className="size-4 text-muted-foreground" /></label><span className="muted-chip">{modelList ? `${imageModels.length.toLocaleString()} image models` : 'Loading…'}</span></div></div>{activeImageModel && imageProjection ? <div className="image-summary"><div><p className="field-label">PRICE / IMAGE</p><p className="metric-value">{money(activeImageModel.image ?? 0)}</p></div><div><p className="field-label">IMAGES / MO</p><p className="metric-value">{number(totalImages)}</p></div><div><p className="field-label">IMAGE SPEND / MO</p><p className="metric-value">{money(imageSpend)}</p></div><div><p className="field-label">LANE MARGIN</p><p className="metric-value">{imageProjection.margin.toFixed(1)}%</p></div></div> : null}<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Provider / model</th><th>Price / image</th><th>Images / user</th><th>Image cost / user</th><th /></tr></thead><tbody>{imageModels.map((model) => { const cost = imageCostForUser(model); return <tr key={model.id} className={selectedImage === model.id ? 'selected-row' : ''}><td><div className="flex items-center gap-3"><span className={`provider-dot ${providerColor(model.provider)}`} /><div><p className="font-semibold">{model.name}{model.estimate ? <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">est.</span> : null}</p><p className="text-xs text-muted-foreground">{model.provider}{model.modality ? ` · ${model.modality}` : ''}</p></div></div></td><td className="font-mono">{money(model.image ?? 0)} / img</td><td className="font-mono">{imagesPerUser.toFixed(1)}</td><td className="font-mono font-semibold">{money(cost)}</td><td><button className="select-button" onClick={() => setSelectedImage(model.id)}>{selectedImage === model.id ? 'Selected' : 'Use model'}</button></td></tr>})}{imageModels.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">Loading live image model prices…</td></tr> : null}</tbody></table></div></section>

          <section className="panel mb-6 overflow-hidden"><div className="panel-header"><div><p className="eyebrow">EMBEDDINGS LANE</p><h3 className="section-title">RAG / embedding costs</h3></div><div className="flex flex-wrap items-center gap-3"><label className="assumption-bar"><Settings2 /><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active embedding model</p><select value={selectedEmbed} onChange={(e) => setSelectedEmbed(e.target.value)} className="bg-transparent text-sm font-semibold outline-none"><option value="" disabled>{loading ? 'Loading…' : 'Select embedding model'}</option>{embeddingModels.map((model) => <option key={model.id} value={model.id}>{providerLabel(model)}</option>)}</select></div><ChevronDown className="size-4 text-muted-foreground" /></label><span className="muted-chip">{modelList ? `${embeddingModels.length.toLocaleString()} embedding models` : 'Loading…'}</span></div></div>{activeEmbedModel && embedProjection ? <div className="image-summary"><div><p className="field-label">INPUT / 1M</p><p className="metric-value">{money(activeEmbedModel.input)}</p></div><div><p className="field-label">EMBED TOK / MO</p><p className="metric-value">{number(monthlyEmbedTokens(tiers))}</p></div><div><p className="field-label">EMBED SPEND / MO</p><p className="metric-value">{money(embedSpend)}</p></div><div><p className="field-label">LANE MARGIN</p><p className="metric-value">{embedProjection.margin.toFixed(1)}%</p></div></div> : null}<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Provider / model</th><th>Input / 1M</th><th>Embed tok / user</th><th>Embed cost / user</th><th /></tr></thead><tbody>{embeddingModels.map((model) => { const cost = embedCostForUser(model); return <tr key={model.id} className={selectedEmbed === model.id ? 'selected-row' : ''}><td><div className="flex items-center gap-3"><span className={`provider-dot ${providerColor(model.provider)}`} /><div><p className="font-semibold">{model.name}{model.estimate ? <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">est.</span> : null}</p><p className="text-xs text-muted-foreground">{model.provider}</p></div></div></td><td className="font-mono">{money(model.input)}</td><td className="font-mono">{users > 0 ? number(Math.round(monthlyEmbedTokens(tiers) / users)) : '0'}</td><td className="font-mono font-semibold">{money(cost)}</td><td><button className="select-button" onClick={() => setSelectedEmbed(model.id)}>{selectedEmbed === model.id ? 'Selected' : 'Use model'}</button></td></tr>})}{embeddingModels.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">No embedding models in this catalog.</td></tr> : null}</tbody></table></div></section>

          <section className="panel mb-6 overflow-hidden"><div className="panel-header"><div><p className="eyebrow">VIDEO LANE</p><h3 className="section-title">Video generation costs</h3></div><div className="flex flex-wrap items-center gap-3"><label className="assumption-bar"><Settings2 /><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Active video model</p><select value={selectedVideo} onChange={(e) => setSelectedVideo(e.target.value)} className="bg-transparent text-sm font-semibold outline-none"><option value="" disabled>{loading ? 'Loading…' : 'Select video model'}</option>{videoModels.map((model) => <option key={model.id} value={model.id}>{providerLabel(model)}</option>)}</select></div><ChevronDown className="size-4 text-muted-foreground" /></label><span className="muted-chip">{modelList ? `${videoModels.length.toLocaleString()} video models` : 'Loading…'}</span></div></div>{activeVideoModel && videoProjection ? <div className="image-summary"><div><p className="field-label">PRICE / SECOND</p><p className="metric-value">{money(activeVideoModel.video ?? 0)}</p></div><div><p className="field-label">SECONDS / MO</p><p className="metric-value">{number(monthlyVideoSeconds(tiers))}</p></div><div><p className="field-label">VIDEO SPEND / MO</p><p className="metric-value">{money(videoSpend)}</p></div><div><p className="field-label">LANE MARGIN</p><p className="metric-value">{videoProjection.margin.toFixed(1)}%</p></div></div> : null}<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Provider / model</th><th>Price / second</th><th>Seconds / user</th><th>Video cost / user</th><th /></tr></thead><tbody>{videoModels.map((model) => { const cost = videoCostForUser(model); return <tr key={model.id} className={selectedVideo === model.id ? 'selected-row' : ''}><td><div className="flex items-center gap-3"><span className={`provider-dot ${providerColor(model.provider)}`} /><div><p className="font-semibold">{model.name}{model.estimate ? <span className="ml-2 text-[10px] font-normal italic text-muted-foreground">est.</span> : null}</p><p className="text-xs text-muted-foreground">{model.provider}</p></div></div></td><td className="font-mono">{money(model.video ?? 0)}</td><td className="font-mono">{users > 0 ? number(Math.round((monthlyVideoSeconds(tiers) / users) * 10) / 10) : '0'}</td><td className="font-mono font-semibold">{money(cost)}</td><td><button className="select-button" onClick={() => setSelectedVideo(model.id)}>{selectedVideo === model.id ? 'Selected' : 'Use model'}</button></td></tr>})}{videoModels.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-xs text-muted-foreground">No video models in this catalog — try Vercel.</td></tr> : null}</tbody></table></div></section>

          <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]"><section id="tiers" className="panel overflow-hidden"><div className="panel-header"><div><p className="eyebrow">SUBSCRIPTION MODEL</p><h3 className="section-title">Tiered projections</h3></div><button className="ghost-button"><Plus /> Add tier</button></div><div className="tier-list">{tiers.map((tier, index) => { const tp = activeModel ? tierProjection(tier, activeModel) : null; const ip = activeImageModel ? imageTierProjection(tier, activeImageModel) : null; const ep = activeEmbedModel ? embeddingTierProjection(tier, activeEmbedModel) : null; const vp = activeVideoModel ? videoTierProjection(tier, activeVideoModel) : null; const monthly = (tp?.monthlyCost ?? 0) + (ip?.monthlyCost ?? 0) + (ep?.monthlyCost ?? 0) + (vp?.monthlyCost ?? 0); const costPerUser = tier.users > 0 ? monthly / tier.users : 0; const margin = tier.price > 0 ? ((tier.price - costPerUser) / tier.price) * 100 : null; return <div className="tier-row" key={tier.name}><div className={`tier-accent ${tier.accent}`} /><div className="tier-name"><input value={tier.name} onChange={(e) => updateTier(index, 'name', e.target.value)} /><span>{tier.users.toLocaleString()} users</span></div><div><p className="field-label">PRICE / MO</p><div className="inline-input"><span>$</span><input type="number" value={tier.price} onChange={(e) => updateTier(index, 'price', e.target.value)} /></div></div><div className="images-input"><p className="field-label">CACHE HIT %</p><div className="inline-input"><input type="number" min="0" max="100" value={tier.cacheHit ?? 0} onChange={(e) => updateTier(index, 'cacheHit', e.target.value)} /></div></div><div className="images-input"><p className="field-label">IMAGES / USER / MO</p><div className="inline-input"><input type="number" min="0" value={tier.images ?? 0} onChange={(e) => updateTier(index, 'images', e.target.value)} /></div></div><div className="images-input"><p className="field-label">EMBED TOK / USER</p><div className="inline-input"><input type="number" min="0" value={tier.embedTokens ?? 0} onChange={(e) => updateTier(index, 'embedTokens', e.target.value)} /></div></div><div className="images-input"><p className="field-label">VIDEO SEC / USER</p><div className="inline-input"><input type="number" min="0" value={tier.videoSeconds ?? 0} onChange={(e) => updateTier(index, 'videoSeconds', e.target.value)} /></div></div><div><p className="field-label">AI COST / MO</p><p className="metric-value">{money(monthly)}</p></div><div><p className="field-label">MARGIN</p><p className={`metric-value ${margin !== null && margin > 70 ? 'positive' : 'warning'}`}>{margin === null ? '—' : `${margin.toFixed(1)}%`}</p></div></div>})}</div><div className="table-footer"><span><Sparkles className="size-4 text-primary" /> Projections update as you edit assumptions</span><button className="text-button">View assumptions <ArrowUpRight /></button></div></section>

            <section id="credits" className="panel mb-6 overflow-hidden xl:col-span-2"><div className="panel-header"><div><p className="eyebrow">CREDITS PLAN</p><h3 className="section-title">Included credits + overage</h3></div><div className="flex flex-wrap items-center gap-3"><label className="assumption-bar"><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">$ / credit</p><input aria-label="Credit value USD" type="number" min="0.001" step="0.001" value={creditValue} onChange={(e) => setCreditValue(Math.max(0.001, Number(e.target.value) || 0.01))} className="w-16 bg-transparent font-mono text-sm font-semibold outline-none" /></div></label><label className="assumption-bar"><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Model ×</p><input aria-label="Credit multiplier" type="number" min="0.1" step="0.1" value={creditMultiplier} onChange={(e) => setCreditMultiplier(Math.max(0.1, Number(e.target.value) || 1))} className="w-14 bg-transparent font-mono text-sm font-semibold outline-none" /></div></label><label className="assumption-bar"><div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reset</p><select aria-label="Credit reset" value={creditReset} onChange={(e) => setCreditReset(e.target.value as CreditResetCadence)} className="bg-transparent text-sm font-semibold outline-none"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="never">Never</option></select></div></label></div></div>{creditProjection ? <div className="image-summary"><div><p className="field-label">CREDITS USED</p><p className="metric-value">{number(creditProjection.creditsUsed)}</p></div><div><p className="field-label">INCLUDED</p><p className="metric-value">{number(creditProjection.creditsIncluded)}</p></div><div><p className="field-label">OVERAGE $</p><p className="metric-value">{money(creditProjection.overageSpendUsd)}</p></div><div><p className="field-label">DAYS TO RESET</p><p className="metric-value">{creditProjection.daysToReset === null ? '—' : number(creditProjection.daysToReset)}</p></div></div> : null}<div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Tier</th><th>Credits / user</th><th>Overage budget / user</th><th>$ / overage credit</th><th>Used</th><th>Left</th><th>Util %</th><th>Overage $</th></tr></thead><tbody>{tiers.map((tier, index) => { const row = creditProjection?.perTier.find((p) => p.tier.name === tier.name); return <tr key={tier.name}><td className="font-semibold">{tier.name}</td><td><input className="w-20 bg-transparent font-mono outline-none" type="number" min="0" value={tier.creditsIncluded ?? 0} onChange={(e) => updateTier(index, 'creditsIncluded', e.target.value)} /></td><td><input className="w-20 bg-transparent font-mono outline-none" type="number" min="0" value={tier.overageBudgetUsd ?? 0} onChange={(e) => updateTier(index, 'overageBudgetUsd', e.target.value)} /></td><td><input className="w-20 bg-transparent font-mono outline-none" type="number" min="0" step="0.001" value={tier.overagePerCredit ?? 0} onChange={(e) => updateTier(index, 'overagePerCredit', e.target.value)} /></td><td className="font-mono">{row ? number(row.creditsUsed) : '—'}</td><td className="font-mono">{row ? number(row.creditsRemaining) : '—'}</td><td className="font-mono">{row ? `${row.creditUtilization.toFixed(0)}%` : '—'}</td><td className="font-mono font-semibold">{row ? money(row.overageSpendUsd) : '—'}</td></tr>})}</tbody></table></div><p className="px-5 pb-4 text-xs text-muted-foreground">Burn = list AI spend ÷ $ per credit × model multiplier. Included credits are prepaid; effective AI cost is overage only. Budget 0 = hard stop (no billed overage).</p></section>

            <section id="quotas" className="panel"><div className="panel-header"><div><p className="eyebrow">GUARDRAILS</p><h3 className="section-title">Dynamic quotas</h3></div><button className="icon-button"><Settings2 /></button></div><p className="text-sm leading-6 text-muted-foreground">Set monthly token ceilings by customer tier to keep usage predictable.</p><div className="quota-list">{tiers.map((tier, index) => <div className="quota-item" key={tier.name}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><span className={`mini-dot ${tier.accent}`} /><span className="text-sm font-semibold">{tier.name}</span></div><span className="font-mono text-xs text-muted-foreground">{compact(tier.quota)} tokens</span></div><input className="quota-range" type="range" min="5000" max="2000000" step="5000" value={tier.quota} onChange={(e) => updateTier(index, 'quota', e.target.value)} /><div className="flex justify-between text-[10px] text-muted-foreground"><span>5k</span><span>2M max</span></div></div>)}</div><div className="quota-callout"><Gauge /><div><p className="text-xs font-semibold">Quota forecast</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{proTier ? <>At current usage, <strong className="text-foreground">{proUtilization.toFixed(0)}%</strong> of <strong className="text-foreground">{proTier.name}</strong> users' monthly {compact(proTier.quota)}-token quota is consumed.</> : 'Adjust tiers to see the quota forecast.'}</p></div></div></section></div>
        </div>
      </section>
    </main>
  )
}

function Kpi({ label, value, change, down }: { label: string; value: string; change: string; down?: boolean }) { return <div className="kpi-card"><div className="flex items-center justify-between"><p className="eyebrow">{label}</p><span className={`trend ${down ? 'negative' : ''}`}>{down ? <ArrowDown /> : <ArrowUpRight />}{change}</span></div><p className="kpi-value">{value}</p><div className="sparkline"><span /><span /><span /><span /><span /><span /><span /></div></div> }