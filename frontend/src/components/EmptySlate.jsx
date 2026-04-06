import React from 'react'
export default function EmptySlate({ icon: Icon, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      {Icon && <Icon size={38} className="text-muted mb-4 opacity-30" />}
      <p className="text-sm font-semibold text-body">{title}</p>
      {sub && <p className="text-xs text-subtle mt-1">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
