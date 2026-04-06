import React, { useState, useEffect, useCallback } from 'react'
import { Zap, AlertTriangle, CheckCircle2, RotateCcw, Brain, Cpu, Database, Server, Activity, ChevronRight } from 'lucide-react'
import { simulateAlert, getIncidents, getMemoryStats } from '../utils/api'
import { toast } from '../utils/toaster'
import SevPill from '../components/SevPill'
import StatusChip from '../components/StatusChip'
import GeminiBadge from '../components/GeminiBadge'
import Spinner from '../components/Spinner'
import { isLive, fmtTs } from '../utils/helpers'

const ALERT_OPTIONS = [
  { id:'high_cpu',     label:'High CPU',     Icon:Cpu,           color:'#f97316', sev:'high',     desc:'payment-service >90%' },
  { id:'oom_kill',     label:'OOM Kill',     Icon:AlertTriangle, color:'#ef4444', sev:'critical', desc:'Container OOM restart' },
  { id:'db_latency',   label:'DB Latency',   Icon:Database,      color:'#6366f1', sev:'high',     desc:'P99 >4500ms' },
  { id:'service_down', label:'Service Down', Icon:Server,        color:'#ef4444', sev:'critical', desc:'503 on auth-service' },
  { id:'disk_full',    label:'Disk Full',    Icon:Activity,      color:'#f59e0b', sev:'medium',   desc:'Cloud SQL 95%' },
]

const PIPELINE = [
  {name:'Planner',color:'#6366f1'},{name:'Memory',color:'#a855f7'},{name:'Tool[×8]',color:'#38bdf8'},
  {name:'Diagnostic',color:'#f59e0b'},{name:'Debate',color:'#ec4899'},{name:'Task',color:'#f97316'},{name:'Controller',color:'#22c55e'},
]

// Statuses that mean a human explicitly reviewed and approved the resolution.
// 'auto_resolved' is intentionally excluded — that was machine-only and must
// NOT count as an approved strategy for future auto-resolution.
const HUMAN_APPROVED_STATUSES = new Set(['resolved'])

/**
 * Derives the two preconditions the backend needs to decide whether it may
 * auto-resolve an incoming alert.
 *
 * @param {string}   alertType  - The alert id being fired (e.g. 'high_cpu')
 * @param {Array}    incidents  - Current incident list from the API
 * @returns {{ is_repeat: boolean, has_approved_strategy: boolean }}
 *
 * Rules
 * ─────
 * is_repeat            → at least one prior incident exists for this alert type
 * has_approved_strategy→ at least one of those prior incidents was explicitly
 *                        approved by a human (status === 'resolved').
 *                        auto_resolved does NOT count.
 *
 * The backend should only auto-resolve when BOTH flags are true.
 */
function deriveAutoResolveFlags(alertType, incidents) {
  const prior = incidents.filter(i => i.alert?.alert_type === alertType)

  const is_repeat = prior.length > 0

  // A strategy is "approved" only if a human reviewed and resolved it —
  // not if it was previously auto-resolved (that itself needed approval).
  const has_approved_strategy = prior.some(i => HUMAN_APPROVED_STATUSES.has(i.status))

  return { is_repeat, has_approved_strategy }
}

function StatCard({ label, value, sub, color='#6366f1', loading }) {
  return (
    <div className="panel p-4">
      {loading ? <div className="skel h-14 w-full"/> :
        <><p className="text-xs text-subtle mb-1">{label}</p>
          <p className="text-2xl font-bold" style={{color}}>{value}</p>
          {sub && <p className="text-xs text-subtle mt-0.5">{sub}</p>}</>}
    </div>
  )
}

export default function CommandCenter({ onNav }) {
  const [incidents,  setIncidents]  = useState([])
  const [memStats,   setMemStats]   = useState(null)
  const [selected,   setSelected]   = useState('high_cpu')
  const [firing,     setFiring]     = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [pipeIdx,    setPipeIdx]    = useState(-1)
  const [loading,    setLoading]    = useState(true)
  const [geminiMode, setGeminiMode] = useState(null)

  const load = useCallback(async () => {
    try {
      const [i,m] = await Promise.allSettled([getIncidents(), getMemoryStats()])
      if (i.status==='fulfilled') setIncidents(i.value.data||[])
      if (m.status==='fulfilled') setMemStats(m.value.data)
      const inc = (i.status==='fulfilled' ? i.value.data : [])||[]
      const hasGemini = inc.some(x => x.gemini_active)
      if (hasGemini) setGeminiMode(true)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const t=setInterval(load,7000); return()=>clearInterval(t) }, [load])

  const fire = async () => {
    setFiring(true); setPipeIdx(0); setLastResult(null)
    try {
      let i=0
      const timer = setInterval(() => { i++; setPipeIdx(i); if(i>=PIPELINE.length-1) clearInterval(timer) }, 600)

      // ── Auto-resolve gate ────────────────────────────────────────────────────
      // Compute the two preconditions from local incident history and pass them
      // to the backend so it can make the correct auto-resolve decision:
      //   • is_repeat            — same alert type has fired before
      //   • has_approved_strategy— a human explicitly approved the fix before
      //
      // The backend MUST require both to be true before auto-resolving.
      // Passing these from the frontend keeps the gate logic transparent and
      // testable; the backend should treat them as advisory signals and apply
      // its own validation (e.g. checking memory/DB), not trust them blindly.
      const autoResolveFlags = deriveAutoResolveFlags(selected, incidents)

      const r = await simulateAlert(selected, autoResolveFlags)

      setLastResult(r.data)

      // Surface the actual outcome to the developer so they can see whether
      // auto-resolve fired or the full pipeline was deployed.
      const wasAutoResolved = r.data?.status === 'auto_resolved'
      if (wasAutoResolved) {
        toast.ok(`Incident ${r.data.incident_id} — auto-resolved from approved memory ✓`)
      } else {
        toast.ok(`Incident ${r.data.incident_id} — 7 agents deployed!`)
      }

      setTimeout(() => { clearInterval(timer); setPipeIdx(-1) }, 4800)
      await load()
    } catch(e) {
      toast.err('Failed: ' + (e.response?.data?.detail||e.message)); setPipeIdx(-1)
    } finally { setFiring(false) }
  }

  const stats = {
    total:    incidents.length,
    live:     incidents.filter(i=>isLive(i.status)).length,
    pending:  incidents.filter(i=>i.status==='awaiting_approval').length,
    resolved: incidents.filter(i=>['resolved','auto_resolved'].includes(i.status)).length,
  }

  // Derive flags for the currently selected alert to show a hint in the UI
  const { is_repeat, has_approved_strategy } = deriveAutoResolveFlags(selected, incidents)
  const canAutoResolve = is_repeat && has_approved_strategy

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Incidents"   value={stats.total}    sub="All time"                color="#6366f1" loading={loading}/>
        <StatCard label="Live / Processing" value={stats.live}     sub="Agent pipeline active"   color="#f59e0b" loading={loading}/>
        <StatCard label="Awaiting Approval" value={stats.pending}  sub="Human review needed"     color="#ef4444" loading={loading}/>
        <StatCard label="Resolved"          value={stats.resolved} sub="Successful remediations" color="#22c55e" loading={loading}/>
      </div>

      <div className="panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain size={15} className="text-accent-light"/>
            <h2 className="text-sm font-semibold text-heading">7-Agent Pipeline</h2>
          </div>
          <div className="flex items-center gap-3">
            {geminiMode !== null && <GeminiBadge active={geminiMode}/>}
            {memStats && <span className="font-mono text-[10px] text-subtle">FAISS: <span style={{color:'#a855f7'}}>{memStats.faiss_index_size} indexed</span></span>}
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-1.5">
          {PIPELINE.map((p,i) => {
            const isAct = pipeIdx === i
            const isDone = pipeIdx > i
            return (
              <React.Fragment key={p.name}>
                <div className={`pipeline-node ${isAct?'active':isDone?'done':'idle'}`}
                  style={isAct?{color:p.color,background:`${p.color}12`,borderColor:`${p.color}60`,boxShadow:`0 0 12px ${p.color}25`}:{}}>
                  {isAct && <span className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0" style={{background:p.color}}/>}
                  {isDone && <span className="text-success text-[10px]">✓</span>}
                  {p.name}
                </div>
                {i < PIPELINE.length-1 && <ChevronRight size={10} className="text-muted flex-shrink-0"/>}
              </React.Fragment>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Parallel tool execution','Real GCP APIs','FAISS vector memory','Gemini fn-calling','MCP JSON-RPC 2.0','Task scheduling'].map(f=>(
            <span key={f} className="font-mono text-[10px] px-2 py-0.5 rounded" style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',color:'#818cf8'}}>{f}</span>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-accent-light"/><h2 className="text-sm font-semibold text-heading">Trigger Demo Alert</h2></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
          {ALERT_OPTIONS.map(({id,label,Icon,color,sev,desc}) => (
            <button key={id} onClick={()=>setSelected(id)} className="rounded-xl p-3 text-left transition-all"
              style={{background:selected===id?`${color}0e`:'rgba(255,255,255,0.015)',border:`1px solid ${selected===id?color+'50':'#1e2130'}`,boxShadow:selected===id?`0 0 14px ${color}12`:'none'}}>
              <div className="flex items-center gap-1.5 mb-1"><Icon size={12} style={{color}}/><span className="text-xs font-semibold text-body">{label}</span></div>
              <p className="text-[10px] text-subtle leading-snug">{desc}</p>
              <span className="font-mono text-[10px] font-bold uppercase mt-2 block" style={{color}}>{sev}</span>
            </button>
          ))}
        </div>

        {/* Auto-resolve eligibility hint — visible only when an alert is selected */}
        {selected && (
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px]" style={{color: canAutoResolve ? '#22c55e' : '#6b7094'}}>
            {canAutoResolve
              ? <><CheckCircle2 size={11}/> Auto-resolve eligible — prior approved strategy found in memory</>
              : is_repeat
                ? <><AlertTriangle size={11} style={{color:'#f59e0b'}}/> <span style={{color:'#f59e0b'}}>Repeat alert — but no human-approved strategy yet. Full pipeline will run.</span></>
                : <><RotateCcw size={11}/> First occurrence — full 7-agent pipeline will run</>}
          </div>
        )}

        <button onClick={fire} disabled={firing} className="btn-primary">
          {firing ? <><Spinner size={14}/> Agents deploying...</> : <><Zap size={13}/> Fire Alert — Start 7-Agent Pipeline</>}
        </button>
        {lastResult && (
          <div className="mt-4 rounded-lg p-3.5" style={{background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.2)'}}>
            <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={13} className="text-success"/><span className="text-xs font-semibold text-success">Incident {lastResult.incident_id} created</span></div>
            <p className="font-mono text-[10px] text-subtle">{lastResult.workflow}</p>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-heading">Recent Incidents</h2>
          <button onClick={()=>onNav('incidents')} className="text-xs text-accent-light hover:text-accent transition-colors">View all →</button>
        </div>
        {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="skel h-14"/>)}</div>
          : incidents.length === 0 ? <div className="panel py-12 text-center text-subtle text-sm">No incidents yet — fire an alert above</div>
          : <div className="space-y-2">{incidents.slice(0,6).map(inc => {
              const live = isLive(inc.status)
              return (
                <button key={inc.id} onClick={()=>onNav('incidents')} className="panel panel-hover w-full text-left px-4 py-3 flex items-center gap-3 transition-all">
                  <div className={`status-dot ${live?'animate-pulse':''}`} style={{background:live?'#f59e0b':'#22c55e',boxShadow:`0 0 5px ${live?'#f59e0b':'#22c55e'}`}}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-heading truncate">{inc.alert?.title||inc.id}</p>
                    <p className="font-mono text-[10px] text-subtle">{inc.id} · {inc.alert?.service} · {fmtTs(inc.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {inc.is_repeat_issue && <span className="font-mono text-[10px] text-success flex items-center gap-1"><RotateCcw size={9}/> REPEAT</span>}
                    {inc.gemini_active && <Brain size={11} style={{color:'#818cf8'}} title="Gemini was active"/>}
                    <SevPill sev={inc.alert?.severity}/>
                    <StatusChip status={inc.status}/>
                  </div>
                </button>
              )
            })}</div>}
      </div>
    </div>
  )
}