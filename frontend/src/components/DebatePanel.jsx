import React from 'react'
import { Scale, ShieldCheck, Swords } from 'lucide-react'
import ConfidenceBar from './ConfidenceBar'
export default function DebatePanel({ debate }) {
  if (!debate) return <div className="flex flex-col items-center py-10 text-subtle text-xs font-mono">No debate data</div>
  const conf   = debate.consensus_confidence || 0
  const winner = debate.winner || (conf > 0.5 ? 'PROPOSER' : 'CHALLENGER')
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.2)'}}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:'linear-gradient(135deg,#6366f1,#4f46e5)'}}><ShieldCheck size={14} className="text-white"/></div>
            <div><p className="text-xs font-semibold text-accent-light">PROPOSER</p><p className="font-mono text-[10px] text-subtle">Gemini Instance A</p></div>
          </div>
          <p className="text-sm text-body mb-2">{debate.proposer_fix}</p>
          {debate.proposer_reasoning && <p className="text-xs text-subtle italic leading-relaxed">{debate.proposer_reasoning}</p>}
        </div>
        <div className="rounded-xl p-4" style={{background:'rgba(236,72,153,0.06)',border:'1px solid rgba(236,72,153,0.2)'}}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:'linear-gradient(135deg,#ec4899,#a855f7)'}}><Swords size={14} className="text-white"/></div>
            <div><p className="text-xs font-semibold text-pink-400">CHALLENGER</p><p className="font-mono text-[10px] text-subtle">Gemini Instance B</p></div>
          </div>
          <p className="text-sm text-body mb-2">{debate.challenger_fix}</p>
          {debate.challenger_reasoning && <p className="text-xs text-subtle italic leading-relaxed">{debate.challenger_reasoning}</p>}
        </div>
      </div>
      <div className="rounded-xl p-4" style={{background:'rgba(168,85,247,0.08)',border:'1px solid rgba(168,85,247,0.25)'}}>
        <div className="flex items-center gap-2 mb-3"><Scale size={14} className="text-purple-400"/><p className="text-xs font-semibold text-purple-400">CONSENSUS · WINNER: {winner}</p></div>
        <ConfidenceBar value={conf} color="#a855f7" label="Confidence"/>
        <p className="text-sm text-body mt-3 leading-relaxed">{debate.final_verdict}</p>
      </div>
    </div>
  )
}
