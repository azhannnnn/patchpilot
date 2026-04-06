import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { BookOpen, Search, Filter, Clock, TrendingUp, X, Database, ChevronDown, ChevronRight } from 'lucide-react'
import { getRunbooks, seedRunbooks } from '../utils/api'
import { toast } from '../utils/toaster'
import EmptySlate from '../components/EmptySlate'
import Spinner from '../components/Spinner'

const ISSUE_PALETTE = { high_cpu:'#f97316', oom_kill:'#ef4444', db_latency:'#6366f1', service_down:'#ef4444', disk_full:'#f59e0b' }
const successColor = r => r>=0.9?'#22c55e':r>=0.8?'#f59e0b':'#f97316'
const dedup = list => { const seen=new Set(),result=[]; for(const r of list){const k=(r.issue_type||r.title||'').toLowerCase().trim();if(!seen.has(k)){seen.add(k);result.push(r)}} return result }

function RunbookRow({ rb, idx }) {
  const [open, setOpen] = useState(false)
  const color = ISSUE_PALETTE[rb.issue_type] || '#6366f1'
  const tags  = rb.tags ? rb.tags.split(' ').filter(Boolean) : []
  return (
    <div className="panel overflow-hidden animate-fade-up" style={{animationDelay:`${idx*30}ms`}}>
      <button onClick={()=>setOpen(!open)} className="w-full text-left p-4 flex items-start gap-3">
        <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{background:color,boxShadow:`0 0 6px ${color}50`,minHeight:36}}/>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              {rb.issue_type && <span className="font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded" style={{color,background:`${color}15`,border:`1px solid ${color}30`}}>{rb.issue_type.replace(/_/g,' ')}</span>}
              <span className="text-sm font-semibold text-heading">{rb.title}</span>
            </div>
            {open?<ChevronDown size={13} className="text-subtle flex-shrink-0 mt-0.5"/>:<ChevronRight size={13} className="text-subtle flex-shrink-0 mt-0.5"/>}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {rb.avg_resolution_minutes && <div className="flex items-center gap-1 font-mono text-[10px]"><Clock size={9} style={{color:'#38bdf8'}}/><span style={{color:'#38bdf8'}}>{rb.avg_resolution_minutes}min avg</span></div>}
            {rb.success_rate && <div className="flex items-center gap-1 font-mono text-[10px]"><TrendingUp size={9} style={{color:successColor(rb.success_rate)}}/><span style={{color:successColor(rb.success_rate)}}>{Math.round(rb.success_rate*100)}% success</span></div>}
            <div className="flex gap-1 flex-wrap">{tags.slice(0,5).map(tag=><span key={tag} className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{background:'rgba(99,102,241,0.1)',color:'#818cf8',border:'1px solid rgba(99,102,241,0.2)'}}>{tag}</span>)}</div>
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-5 py-4 ml-4">
          <p className="font-mono text-[10px] text-subtle mb-3 tracking-wider">RUNBOOK STEPS</p>
          <div className="space-y-2.5">
            {rb.content?.split('\n').filter(Boolean).map((line,i)=>{const m=line.match(/^(\d+)\.\s(.+)/);return m?<div key={i} className="flex gap-2.5"><span className="font-mono text-[10px] font-bold flex-shrink-0 mt-0.5" style={{color}}>{m[1]}.</span><p className="text-sm text-body leading-relaxed">{m[2]}</p></div>:<p key={i} className="text-xs text-subtle font-mono">{line}</p>})}
          </div>
        </div>
      )}
    </div>
  )
}

export default function RunbookLibrary() {
  const [runbooks,   setRunbooks]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [seeding,    setSeeding]    = useState(false)
  const [query,      setQuery]      = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const load = useCallback(async () => {
    try { const r = await getRunbooks(); setRunbooks(dedup(r.data||[])) } catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const seed = async () => {
    setSeeding(true)
    try { await seedRunbooks(); toast.ok('Runbooks seeded!'); await load() }
    catch { toast.err('Seed failed') } finally { setSeeding(false) }
  }

  const issueTypes = useMemo(() => [...new Set(runbooks.map(r=>r.issue_type).filter(Boolean))].sort(), [runbooks])
  const visible = useMemo(() => {
    let out = runbooks
    if (query) { const q=query.toLowerCase(); out=out.filter(r=>['title','tags','issue_type','content'].some(f=>(r[f]||'').toLowerCase().includes(q))) }
    if (typeFilter) out = out.filter(r=>r.issue_type===typeFilter)
    return out
  }, [runbooks,query,typeFilter])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2"><BookOpen size={15} className="text-accent-light"/><h1 className="text-lg font-bold text-heading">Runbook Library</h1><span className="font-mono text-xs text-subtle">({visible.length}/{runbooks.length})</span></div>
        <button onClick={seed} disabled={seeding} className="btn-primary text-xs py-2 flex-shrink-0">
          {seeding?<><Spinner size={12}/> Seeding…</>:<><Database size={12}/> Seed Demo Data</>}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search by title, tag or issue type…" className="field pl-9 w-full"/>
          {query && <button onClick={()=>setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-body"><X size={12}/></button>}
        </div>
        <div className="relative sm:w-48">
          <Filter size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"/>
          <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="field pl-8 pr-3 w-full appearance-none cursor-pointer text-xs font-mono">
            <option value="">All issue types</option>
            {issueTypes.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
          </select>
        </div>
        {(query||typeFilter) && <button onClick={()=>{setQuery('');setTypeFilter('')}} className="btn-primary btn-ghost text-xs py-2 px-3 flex-shrink-0">Clear</button>}
      </div>
      {loading && <div className="space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="skel h-16"/>)}</div>}
      {!loading && visible.length===0 && <EmptySlate icon={BookOpen} title={runbooks.length===0?'No runbooks yet':'No results match your search'} sub={runbooks.length===0?'Click "Seed Demo Data" to populate the library':'Try a different search term'}/>}
      {!loading && visible.length>0 && <div className="space-y-2">{visible.map((rb,i)=><RunbookRow key={rb.id||rb.issue_type||i} rb={rb} idx={i}/>)}</div>}
    </div>
  )
}
