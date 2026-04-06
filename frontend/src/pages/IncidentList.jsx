import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronRight,
  RotateCcw, RefreshCw, Clock, Zap, Database
} from 'lucide-react'
import { getIncidents, getIncident } from '../utils/api'
import SevPill       from '../components/SevPill'
import StatusChip    from '../components/StatusChip'
import GeminiBadge   from '../components/GeminiBadge'
import AgentTrace    from '../components/AgentTrace'
import DebatePanel   from '../components/DebatePanel'
import ConfidenceBar from '../components/ConfidenceBar'
import EmptySlate    from '../components/EmptySlate'
import Spinner       from '../components/Spinner'
import { isLive, fmtTs } from '../utils/helpers'

const FILTERS = [
  { id:'all',      label:'All'              },
  { id:'live',     label:'Live'             },
  { id:'pending',  label:'Pending Approval' },
  { id:'resolved', label:'Resolved'         },
]

const TABS = [
  { id:'diag',   label:'Diagnosis'   },
  { id:'debate', label:'Debate'      },
  { id:'trace',  label:'Agent Trace' },
  { id:'tasks',  label:'Tasks'       },
  { id:'tools',  label:'Tool Log'    },
]

// Smart merge: never let a sparse list-poll nuke richer detail data
function mergeIncident(prev, next) {
  return {
    ...next,
    agent_trace: (next.agent_trace?.length ?? 0) >= (prev.agent_trace?.length ?? 0)
      ? (next.agent_trace ?? prev.agent_trace)
      : prev.agent_trace,
    diagnostic: next.diagnostic?.root_cause
      ? next.diagnostic
      : (prev.diagnostic ?? next.diagnostic),
    remediation: next.remediation?.steps?.length
      ? next.remediation
      : (prev.remediation ?? next.remediation),
    scheduled_tasks: next.scheduled_tasks?.length
      ? next.scheduled_tasks
      : (prev.scheduled_tasks ?? next.scheduled_tasks),
    plan: next.plan?.length
      ? next.plan
      : (prev.plan ?? next.plan),
    memory_hits: next.memory_hits?.length
      ? next.memory_hits
      : (prev.memory_hits ?? next.memory_hits),
  }
}

function DiagTab({ inc }) {
  const d = inc.diagnostic
  const r = inc.remediation
  if (!d?.root_cause) {
    return (
      <div className="flex flex-col items-center py-8 gap-2 text-subtle text-xs font-mono">
        <Clock size={24} className="opacity-30" />
        {isLive(inc.status)
          ? 'Agent pipeline running — diagnosis arriving shortly…'
          : 'No diagnosis data recorded for this incident.'
        }
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{ background:'rgba(56,189,248,0.06)', border:'1px solid rgba(56,189,248,0.18)' }}>
        <p className="font-mono text-[10px] font-bold text-info mb-2 tracking-wider">ROOT CAUSE</p>
        <p className="text-sm text-body">{d.root_cause}</p>
        <div className="mt-3"><ConfidenceBar value={d.confidence} color="#38bdf8" /></div>
        {d.is_repeat_issue && (
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-success">
            <RotateCcw size={10}/> Repeat issue — resolved automatically from memory
          </div>
        )}
      </div>
      {d.evidence?.length > 0 && (
        <div>
          <p className="font-mono text-[10px] text-subtle mb-2 tracking-wider">EVIDENCE</p>
          {d.evidence.map((e,i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <span className="text-info flex-shrink-0 text-xs mt-0.5">›</span>
              <p className="text-xs text-body/80">{e}</p>
            </div>
          ))}
        </div>
      )}
      {r?.steps?.length > 0 && (
        <div className="rounded-xl p-4" style={{ background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.18)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] font-bold text-success tracking-wider">REMEDIATION PLAN</p>
            <div className="flex items-center gap-3 font-mono text-[10px] text-subtle">
              <span>~{r.estimated_time_minutes}min</span>
              <span className={r.risk_level==='high'?'text-danger':r.risk_level==='medium'?'text-warning':'text-success'}>
                {r.risk_level?.toUpperCase()} RISK
              </span>
            </div>
          </div>
          {r.steps.map((s,i) => (
            <div key={i} className="flex gap-2 mb-2">
              <span className="font-mono text-[10px] text-success flex-shrink-0 mt-0.5">{String(i+1).padStart(2,'0')}.</span>
              <p className="text-sm text-body">{s}</p>
            </div>
          ))}
          {r.rollback_plan && (
            <div className="mt-3 rounded-lg p-3 font-mono text-[10px] text-warning/80"
              style={{ background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.18)' }}>
              ↩ ROLLBACK: {r.rollback_plan}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemoryHitsPanel({ memoryHits }) {
  if (!memoryHits?.length) return null
  const hits = memoryHits.map(h => {
    if (typeof h === 'object') return h
    try {
      const json = h.replace(/'/g,'"').replace(/\bTrue\b/g,'true').replace(/\bFalse\b/g,'false').replace(/\bNone\b/g,'null')
      return JSON.parse(json)
    } catch { return { raw: h } }
  })
  return (
    <div className="rounded-xl p-4" style={{ background:'rgba(168,85,247,0.06)', border:'1px solid rgba(168,85,247,0.2)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Database size={12} className="text-purple-400" />
        <p className="font-mono text-[10px] font-bold text-purple-400 tracking-wider">MEMORY MATCHES ({hits.length})</p>
      </div>
      {hits.map((h, i) => (
        <div key={i} className="mb-3 last:mb-0 rounded-lg p-3"
          style={{ background:'rgba(168,85,247,0.05)', border:'1px solid rgba(168,85,247,0.12)' }}>
          {h.raw ? (
            <p className="text-xs text-subtle font-mono break-all">{h.raw}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] text-purple-300 font-semibold">
                  {h.alert_title || h.incident_id || `Match ${i+1}`}
                </span>
                <span className="font-mono text-[10px] text-subtle">seen {h.occurrence_count ?? 1}×</span>
              </div>
              {h.root_cause && <p className="text-xs text-body/70 mb-2">{h.root_cause}</p>}
              {h.resolution_steps?.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] text-subtle mb-1 tracking-wider">PREVIOUS FIX</p>
                  {h.resolution_steps.map((s, j) => (
                    <div key={j} className="flex gap-1.5 mb-1">
                      <span className="font-mono text-[9px] text-purple-400/60 flex-shrink-0">{j+1}.</span>
                      <p className="text-[11px] text-body/60">{s}</p>
                    </div>
                  ))}
                </div>
              )}
              {h.last_seen && (
                <p className="font-mono text-[9px] text-subtle mt-2">Last seen: {h.last_seen.slice(0,16).replace('T',' ')}</p>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// FIX: auto-resolved incidents skip debate — show informative UI, never blank
function DebateTab({ inc }) {
  const debate = inc.remediation?.debate_result
  const isRepeat = inc.is_repeat_issue || inc.diagnostic?.is_repeat_issue
  const isAutoResolved = inc.status === 'auto_resolved'

  if (debate) return <DebatePanel debate={debate} />

  if (isRepeat || isAutoResolved) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)' }}>
          <Zap size={16} className="text-success flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-success mb-1">Debate skipped — auto-fix applied</p>
            <p className="text-xs text-subtle leading-relaxed">
              This is a repeat incident. MemoryAgent matched the fingerprint to a previously
              approved fix, so ControllerAgent applied it automatically without running the
              Proposer vs Challenger debate cycle.
            </p>
          </div>
        </div>
        <MemoryHitsPanel memoryHits={inc.memory_hits} />
        {inc.remediation?.steps?.length > 0 && (
          <div className="rounded-xl p-4" style={{ background:'rgba(99,102,241,0.06)', border:'1px solid rgba(99,102,241,0.2)' }}>
            <p className="font-mono text-[10px] font-bold text-accent mb-3 tracking-wider">RE-APPLIED FIX (FROM MEMORY)</p>
            {inc.remediation.steps.map((s,i) => (
              <div key={i} className="flex gap-2 mb-2">
                <span className="font-mono text-[10px] text-accent/50 flex-shrink-0 mt-0.5">{String(i+1).padStart(2,'0')}.</span>
                <p className="text-sm text-body">{s}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-8 gap-2 text-subtle text-xs font-mono">
      <Clock size={24} className="opacity-30" />
      {isLive(inc.status) ? 'Debate agent running — results arriving shortly…' : 'No debate data for this incident.'}
    </div>
  )
}

function TasksTab({ inc }) {
  const tasks = inc.scheduled_tasks || []
  if (!tasks.length) {
    return (
      <div className="flex flex-col items-center py-8 gap-2 text-subtle text-xs font-mono">
        <Clock size={24} className="opacity-30"/>
        {isLive(inc.status) ? 'TaskAgent running…' : 'No tasks scheduled.'}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="font-mono text-[10px] text-subtle mb-3 tracking-wider">SCHEDULED FOLLOW-UP TASKS ({tasks.length})</p>
      {tasks.map(t => (
        <div key={t.id} className="rounded-lg p-3" style={{ background:'rgba(249,115,22,0.06)', border:'1px solid rgba(249,115,22,0.2)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-body">{t.title}</p>
            <span className={`pill ${t.priority==='high'?'pri-high':t.priority==='low'?'pri-low':'pri-medium'}`}>{t.priority}</span>
          </div>
          <p className="text-xs text-subtle">Due: {fmtTs(t.due_at)} · Status: {t.status}</p>
        </div>
      ))}
    </div>
  )
}

// FIX: auto-resolved incidents have no tool calls — show why, not blank
function ToolLogTab({ inc }) {
  const allCalls = (inc.agent_trace || []).flatMap(s =>
    (s.tool_calls || []).map(tc => ({ agent: s.agent, ...tc }))
  )
  const isRepeat = inc.is_repeat_issue || inc.diagnostic?.is_repeat_issue
  const isAutoResolved = inc.status === 'auto_resolved'

  if (allCalls.length > 0) {
    const realCount = allCalls.filter(tc => tc.source && tc.source !== 'mocked').length
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="source-gcp font-mono text-[10px] px-2 py-0.5 rounded">⚡ {realCount} real GCP calls</span>
          <span className="source-mocked font-mono text-[10px] px-2 py-0.5 rounded">⚙ {allCalls.length - realCount} mocked</span>
        </div>
        <div className="code-block">
          {allCalls.map((tc) =>
            `[${tc.agent}] ${tc.tool_name}(${JSON.stringify(tc.parameters)}) → ${tc.duration_ms ?? '?'}ms [${tc.source||'mocked'}]`
          ).join('\n')}
        </div>
      </div>
    )
  }

  if (isRepeat || isAutoResolved) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background:'rgba(56,189,248,0.07)', border:'1px solid rgba(56,189,248,0.2)' }}>
          <Zap size={16} className="text-info flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-info mb-1">MCP tools not called — auto-fix path</p>
            <p className="text-xs text-subtle leading-relaxed">
              MemoryAgent matched this incident's fingerprint to a previously approved fix.
              The system skipped the full diagnostic tool pipeline (8 MCP calls) and applied
              the stored remediation directly — saving ~30 seconds of analysis time.
            </p>
          </div>
        </div>
        {inc.agent_trace?.length > 0 && (
          <div className="rounded-xl p-4" style={{ background:'rgba(255,255,255,0.02)', border:'1px solid #1e2130' }}>
            <p className="font-mono text-[10px] text-subtle mb-3 tracking-wider">
              AGENTS THAT RAN ({inc.agent_trace.length} steps)
            </p>
            {inc.agent_trace.map((step, i) => (
              <div key={i} className="flex gap-2 mb-2 last:mb-0">
                <span className="font-mono text-[10px] text-accent/40 flex-shrink-0 mt-0.5">{String(i+1).padStart(2,'0')}.</span>
                <div>
                  <span className="font-mono text-[10px] font-semibold text-accent-light">{step.agent}</span>
                  <span className="text-[10px] text-subtle"> — {step.action}</span>
                  {step.output && <p className="text-[11px] text-subtle/70 mt-0.5">{step.output}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
        <MemoryHitsPanel memoryHits={inc.memory_hits} />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-8 gap-2 text-subtle text-xs font-mono">
      <Clock size={24} className="opacity-30" />
      {isLive(inc.status) ? 'Tool calls arriving…' : 'No tool calls recorded.'}
    </div>
  )
}

function IncRow({ inc: initialInc }) {
  const [open,   setOpen]   = useState(false)
  const [subtab, setSubtab] = useState('diag')
  const [inc,    setInc]    = useState(initialInc)
  const pollRef = useRef(null)

  // Poll detail while expanded; auto-stop when incident reaches terminal state
  useEffect(() => {
    if (!open) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    const poll = async () => {
      try {
        const r = await getIncident(inc.id)
        if (r?.data) {
          setInc(prev => mergeIncident(prev, r.data))
          if (!isLive(r.data.status)) clearInterval(pollRef.current)
        }
      } catch {}
    }
    poll()
    pollRef.current = setInterval(poll, 2000)
    return () => clearInterval(pollRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inc.id])

  // Keep in sync with list-level updates without losing detail data
  useEffect(() => {
    setInc(prev => mergeIncident(prev, initialInc))
  }, [initialInc])

  const debate    = inc.remediation?.debate_result
  const steps     = inc.agent_trace || []
  const plan      = inc.plan        || []
  const hasData   = !!inc.diagnostic?.root_cause
  const isRunning = isLive(inc.status)
  const isRepeat  = inc.is_repeat_issue || inc.diagnostic?.is_repeat_issue

  return (
    <div className="panel panel-hover overflow-hidden animate-fade-up">
      <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3.5 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SevPill sev={inc.alert?.severity} />
            <StatusChip status={inc.status} />
            {isRepeat && (
              <span className="font-mono text-[10px] text-success flex items-center gap-1">
                <RotateCcw size={9}/> REPEAT
              </span>
            )}
            <GeminiBadge active={inc.gemini_active}/>
          </div>
          <p className="text-sm font-semibold text-heading">{inc.alert?.title || inc.id}</p>
          <p className="font-mono text-[10px] text-subtle mt-0.5">
            {inc.id} · {inc.alert?.service} · {fmtTs(inc.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right font-mono text-[10px] text-subtle hidden sm:block">
            <p>{steps.length} steps</p>
            <p>{steps.flatMap(s => s.tool_calls||[]).length} tools</p>
          </div>
          {isRunning && <Spinner size={12} className="text-accent" />}
          {open ? <ChevronDown size={13} className="text-subtle"/> : <ChevronRight size={13} className="text-subtle"/>}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4">
          <div className="tab-bar mb-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setSubtab(t.id)}
                className={`tab-item ${subtab===t.id?'active':''}`}>
                {t.label}
                {t.id === 'debate' && debate ? ' ⚔' : ''}
                {t.id === 'debate' && !debate && isRepeat ? ' ⟲' : ''}
                {t.id === 'tools' && !steps.flatMap(s=>s.tool_calls||[]).length && isRepeat ? ' ⟲' : ''}
                {t.id === 'tasks' && (inc.scheduled_tasks||[]).length > 0 ? ` (${inc.scheduled_tasks.length})` : ''}
                {isRunning && !hasData && t.id === 'trace' && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-warning inline-block animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {subtab === 'diag'   && <DiagTab inc={inc} />}
          {subtab === 'debate' && <DebateTab inc={inc} />}
          {subtab === 'trace'  && (
            steps.length > 0
              ? <AgentTrace steps={steps} plan={plan} />
              : <div className="flex flex-col items-center py-8 gap-2 text-subtle text-xs font-mono">
                  <Spinner size={16} className="text-accent" />
                  {isRunning ? 'Agents running — trace arriving…' : 'No trace data recorded.'}
                </div>
          )}
          {subtab === 'tasks' && <TasksTab inc={inc} />}
          {subtab === 'tools' && <ToolLogTab inc={inc} />}
        </div>
      )}
    </div>
  )
}

export default function IncidentList() {
  const [incidents, setIncidents] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('all')
  const [busy,      setBusy]      = useState(false)

  const load = useCallback(async (quiet=false) => {
    if (!quiet) setBusy(true)
    try { const r = await getIncidents(); setIncidents(r.data || []) }
    catch {} finally { setLoading(false); setBusy(false) }
  }, [])

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(true), 5000)
    return () => clearInterval(t)
  }, [load])

  const visible = incidents.filter(i => {
    if (filter === 'all')      return true
    if (filter === 'live')     return isLive(i.status)
    if (filter === 'pending')  return i.status === 'awaiting_approval'
    if (filter === 'resolved') return ['resolved','auto_resolved'].includes(i.status)
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="text-warning" />
          <h1 className="text-lg font-bold text-heading">Incidents</h1>
          <span className="font-mono text-xs text-subtle">({incidents.length})</span>
        </div>
        <button onClick={() => load()} disabled={busy}
          className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors disabled:opacity-40">
          <RefreshCw size={12} className={busy?'spin':''}/> Refresh
        </button>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: filter===f.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.025)',
              border:     `1px solid ${filter===f.id ? 'rgba(99,102,241,0.45)' : '#1e2130'}`,
              color:      filter===f.id ? '#818cf8' : '#6b7094',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading
        ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="skel h-16"/>)}</div>
        : visible.length === 0
        ? <EmptySlate icon={AlertTriangle} title="No incidents" sub="Try a different filter or fire a demo alert"/>
        : <div className="space-y-2">{visible.map(i=><IncRow key={i.id} inc={i}/>)}</div>
      }
    </div>
  )
}