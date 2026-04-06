import React from 'react'
export default function ConfidenceBar({ value, color='#6366f1', label='Confidence' }) {
  const p = Math.round((value||0)*100)
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-subtle">{label}</span>
        <span className="font-mono text-xs font-semibold" style={{color}}>{p}%</span>
      </div>
      <div className="prog-track"><div className="prog-fill" style={{width:`${p}%`,background:color}}/></div>
    </div>
  )
}
