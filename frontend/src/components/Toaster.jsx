import React, { useState, useEffect } from 'react'
import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { _setToastFn } from '../utils/toaster'
const ICONS = { ok:{Icon:CheckCircle2,color:'#22c55e'}, err:{Icon:XCircle,color:'#ef4444'}, info:{Icon:Info,color:'#6366f1'} }
function ToastItem({ t }) {
  const { Icon, color } = ICONS[t.type] || ICONS.info
  return (
    <div className="panel flex items-center gap-3 px-4 py-3 min-w-64 shadow-2xl animate-fade-up" style={{borderColor:`${color}30`}}>
      <Icon size={15} style={{color,flexShrink:0}} />
      <span className="text-sm text-body">{t.msg}</span>
    </div>
  )
}
export default function Toaster() {
  const [toasts, set] = useState([])
  useEffect(() => { _setToastFn(set) }, [])
  return <div className="toast-wrap">{toasts.map(t=><ToastItem key={t.id} t={t}/>)}</div>
}
