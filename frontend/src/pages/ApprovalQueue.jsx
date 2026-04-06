import React, { useState, useEffect, useCallback } from 'react'
import { ShieldCheck, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { getPending, decide } from '../utils/api'
import { toast } from '../utils/toaster'
import SevPill from '../components/SevPill'
import GeminiBadge from '../components/GeminiBadge'
import DebatePanel from '../components/DebatePanel'
import ConfidenceBar from '../components/ConfidenceBar'
import EmptySlate from '../components/EmptySlate'
import { pct } from '../utils/helpers'

function ApprovalCard({ inc, approver, comment, onDecide, deciding }) {
  const [showDebate, setShowDebate] = useState(false)
  const d = inc.diagnostic, r = inc.remediation, deb = r?.debate_result
  return (
    <div className="kanban-card">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1"><SevPill sev={inc.alert?.severity}/><span className="font-mono text-[10px] text-warning uppercase tracking-widest">● AWAITING APPROVAL</span></div>
          <p className="text-sm font-semibold text-heading">{inc.alert?.title}</p>
          <p className="font-mono text-[10px] text-subtle mt-0.5">{inc.id} · {inc.alert?.service}</p>
        </div>
        <GeminiBadge active={inc.gemini_active}/>
      </div>
      {d && (
        <div className="rounded-lg p-3 mb-3" style={{background:'rgba(56,189,248,0.06)',border:'1px solid rgba(56,189,248,0.15)'}}>
          <p className="font-mono text-[10px] text-info mb-1.5 tracking-wider">DIAGNOSIS</p>
          <p className="text-xs text-body mb-2">{d.root_cause}</p>
          <ConfidenceBar value={d.confidence} color="#38bdf8"/>
        </div>
      )}
      {r?.steps?.length > 0 && (
        <div className="rounded-lg p-3 mb-3" style={{background:'rgba(34,197,94,0.06)',border:'1px solid rgba(34,197,94,0.15)'}}>
          <div className="flex justify-between mb-2"><p className="font-mono text-[10px] text-success tracking-wider">REMEDIATION</p><span className="font-mono text-[10px] text-subtle">~{r.estimated_time_minutes}min · {r.risk_level?.toUpperCase()} RISK</span></div>
          {r.steps.slice(0,3).map((s,i)=><div key={i} className="flex gap-2 mb-1"><span className="font-mono text-[10px] text-success flex-shrink-0">{String(i+1).padStart(2,'0')}.</span><p className="text-xs text-body/75">{s}</p></div>)}
          {r.steps.length>3 && <p className="text-[10px] text-subtle mt-1">+{r.steps.length-3} more steps...</p>}
        </div>
      )}
      {deb && (
        <button onClick={()=>setShowDebate(!showDebate)} className="flex items-center gap-1.5 text-[10px] font-mono text-purple-400 hover:text-purple-300 transition-colors mb-3">
          {showDebate?<ChevronDown size={10}/>:<ChevronRight size={10}/>} View Agent Debate ({pct(deb.consensus_confidence)}% confidence)
        </button>
      )}
      {showDebate && deb && <div className="mb-3"><DebatePanel debate={deb}/></div>}
      {onDecide && (
        <div className="flex gap-2 pt-2 border-t border-border">
          <button onClick={()=>onDecide(inc.id,'approve')} disabled={!approver.trim()||deciding===inc.id} className="btn-primary btn-success flex-1 justify-center text-xs py-2">
            {deciding===inc.id?'⏳ Applying...':<><CheckCircle size={13}/> Approve & Execute</>}
          </button>
          <button onClick={()=>onDecide(inc.id,'reject')} disabled={!approver.trim()||deciding===inc.id} className="btn-primary btn-danger-ghost py-2 px-4 text-xs">
            <XCircle size={13}/> Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function ApprovalQueue() {
  const [pending,  setPending]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [approver, setApprover] = useState('')
  const [comment,  setComment]  = useState('')
  const [deciding, setDeciding] = useState(null)

  const load = useCallback(async () => {
    try { const r = await getPending(); setPending(r.data||[]) }
    catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t=setInterval(load,5000); return()=>clearInterval(t) }, [load])

  const handleDecide = async (id, decision) => {
    if (!approver.trim()) { toast.err('Enter your name first'); return }
    setDeciding(id)
    try {
      await decide({incident_id:id,approver_name:approver,decision,comment})
      toast.ok(decision==='approve'?'✓ Fix approved & executing!':'Incident rejected.')
      await load()
    } catch(e) {
      toast.err('Decision failed: '+(e.response?.data?.detail||e.message))
    } finally { setDeciding(null) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ShieldCheck size={15} className="text-warning"/>
        <h1 className="text-lg font-bold text-heading">Approval Queue</h1>
        {pending.length>0 && <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse" style={{background:'rgba(245,158,11,0.15)',color:'#f59e0b',border:'1px solid rgba(245,158,11,0.35)'}}>{pending.length} PENDING</span>}
      </div>
      <div className="panel p-4">
        <p className="font-mono text-[10px] text-subtle mb-3 tracking-wider">OPERATOR IDENTITY</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-subtle block mb-1.5">Your Name *</label><input value={approver} onChange={e=>setApprover(e.target.value)} placeholder="e.g. Alex Chen (SRE Lead)" className="field"/></div>
          <div><label className="text-xs text-subtle block mb-1.5">Comment (optional)</label><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Reason for decision..." className="field"/></div>
        </div>
      </div>
      {loading ? <div className="space-y-3">{[1,2].map(i=><div key={i} className="skel h-48"/>)}</div>
        : pending.length===0 ? <EmptySlate icon={CheckCircle} title="All clear — no pending approvals" sub="Auto-resolved incidents don't require human approval"/>
        : <div className="grid lg:grid-cols-2 gap-3">{pending.map(inc=><ApprovalCard key={inc.id} inc={inc} approver={approver} comment={comment} deciding={deciding} onDecide={handleDecide}/>)}</div>}
    </div>
  )
}
