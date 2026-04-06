import React from 'react'
import { STATUS_DOT, STATUS_LABEL } from '../utils/helpers'
export default function StatusChip({ status }) {
  const dotCls = STATUS_DOT[status] || 'dot-default'
  const label  = STATUS_LABEL[status] || (status||'').toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold text-subtle uppercase tracking-wider">
      <span className={`status-dot ${dotCls} ${['open','planning','diagnosing','debating','scheduling','awaiting_approval'].includes(status)?'animate-pulse':''}`} />
      {label}
    </span>
  )
}
