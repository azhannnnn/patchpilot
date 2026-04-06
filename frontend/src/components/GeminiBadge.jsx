import React from 'react'
import { Brain, Cpu } from 'lucide-react'
export default function GeminiBadge({ active }) {
  if (active === undefined || active === null) return null
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full ${active ? 'gemini-active' : 'gemini-fallback'}`}>
      {active ? <Brain size={10}/> : <Cpu size={10}/>}
      {active ? 'GEMINI ACTIVE' : 'FALLBACK MODE'}
    </span>
  )
}
