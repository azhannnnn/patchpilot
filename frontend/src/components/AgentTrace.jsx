import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Terminal, CheckCircle2, XCircle, Brain, Cpu } from 'lucide-react'
import SourceBadge from './SourceBadge'

const AGENT_COLORS = {
  'PlannerAgent':    '#6366f1',
  'MemoryAgent':     '#a855f7',
  'ToolAgent (MCP)': '#38bdf8',
  'DiagnosticAgent': '#f59e0b',
  'DebateAgent':     '#ec4899',
  'TaskAgent':       '#f97316',
  'ControllerAgent': '#22c55e',
}

function ToolCallRow({ tc }) {
  const [open, setOpen] = useState(false)
  const isReal = tc.source && tc.source !== 'mocked'
  return (
    <div className="mt-2 rounded-lg overflow-hidden" style={{background:'#07090f',border:'1px solid rgba(56,189,248,0.12)'}}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        {tc.error ? <XCircle size={11} style={{color:'#ef4444',flexShrink:0}}/> : <CheckCircle2 size={11} style={{color:'#22c55e',flexShrink:0}}/>}
        <span className="font-mono text-xs font-semibold" style={{color:'#38bdf8'}}>{tc.tool_name}</span>
        <SourceBadge source={tc.source} />
        {tc.duration_ms !== undefined && <span className="font-mono text-[10px] text-subtle ml-auto">{tc.duration_ms}ms</span>}
        {open ? <ChevronDown size={10} className="text-subtle ml-1"/> : <ChevronRight size={10} className="text-subtle ml-1"/>}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <p className="font-mono text-[10px] text-subtle mb-1">PARAMS</p>
            <pre className="text-[10px] font-mono text-info/80 whitespace-pre-wrap break-all">{JSON.stringify(tc.parameters,null,2)}</pre>
          </div>
          {tc.result !== undefined && (
            <div>
              <p className="font-mono text-[10px] text-subtle mb-1">RESULT {isReal ? '(real GCP data)' : '(simulated)'}</p>
              <pre className="text-[10px] font-mono text-success/80 whitespace-pre-wrap break-all">{JSON.stringify(tc.result,null,2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TraceStep({ step, idx, last }) {
  const [open, setOpen] = useState(idx === 0)
  const color = AGENT_COLORS[step.agent] || '#6366f1'
  const hasCalls = (step.tool_calls||[]).length > 0
  return (
    <div className="relative flex gap-3 animate-slide-in" style={{animationDelay:`${idx*60}ms`}}>
      {!last && <div className="absolute left-4 top-9 bottom-0 w-px" style={{background:`linear-gradient(to bottom,${color}40,transparent)`}}/>}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-1 text-xs font-mono font-bold"
        style={{background:`${color}18`,border:`1px solid ${color}40`,color}}>
        {idx+1}
      </div>
      <div className="flex-1 min-w-0 pb-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold" style={{color}}>{step.agent}</p>
              {step.gemini_active !== undefined && (
                <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${step.gemini_active ? 'gemini-active' : ''}`}
                  title={step.gemini_active ? 'Gemini 1.5 Flash was used' : ''}>
                  {step.gemini_active ? <Brain size={9} style={{display:'inline'}}/> : null}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-body mt-0.5">{step.action}</p>
          </div>
          {step.timestamp && <span className="font-mono text-[10px] text-subtle flex-shrink-0">{step.timestamp?.slice(11,19)}</span>}
        </div>
        <p className="text-xs text-subtle mt-1 leading-relaxed">{step.reasoning}</p>
        {hasCalls && (
          <button onClick={() => setOpen(!open)} className="mt-2 flex items-center gap-1 font-mono text-[10px] text-info hover:text-info/70 transition-colors">
            <Terminal size={10}/>
            {open ? 'Hide' : 'Show'} {step.tool_calls.length} tool call{step.tool_calls.length!==1?'s':''}
          </button>
        )}
        {hasCalls && open && <div className="mt-1">{step.tool_calls.map((tc,i)=><ToolCallRow key={i} tc={tc}/>)}</div>}
        {step.output && (
          <p className="mt-2 text-xs font-mono px-2 py-1.5 rounded-md" style={{background:`${color}0a`,borderLeft:`2px solid ${color}50`,color:`${color}cc`}}>
            → {step.output}
          </p>
        )}
      </div>
    </div>
  )
}

export default function AgentTrace({ steps=[], plan=[] }) {
  if (!steps.length && !plan.length) return <div className="flex flex-col items-center py-10 text-subtle text-xs font-mono">No trace data yet</div>
  return (
    <div>
      {plan.length > 0 && (
        <div className="mb-5 rounded-lg p-3" style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.18)'}}>
          <p className="font-mono text-[10px] font-bold text-accent mb-2 tracking-wider">PLANNER OUTPUT — {plan.length} STEPS</p>
          {plan.map((s,i) => (
            <div key={i} className="flex gap-2 mb-1">
              <span className="font-mono text-[10px] text-accent/40 flex-shrink-0">{String(i+1).padStart(2,'0')}.</span>
              <p className="text-xs text-body/70">{typeof s === 'string' ? s : JSON.stringify(s)}</p>
            </div>
          ))}
        </div>
      )}
      <div>{steps.map((s,i)=><TraceStep key={i} step={s} idx={i} last={i===steps.length-1}/>)}</div>
    </div>
  )
}
