import React, { useState, useEffect, useCallback } from 'react'
import { CalendarCheck, CheckCircle2, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { getTasks, completeTask } from '../utils/api'
import { toast } from '../utils/toaster'
import EmptySlate from '../components/EmptySlate'
import Spinner from '../components/Spinner'
import { fmtTs } from '../utils/helpers'

const PRI_COLORS = { high:'#ef4444', medium:'#f59e0b', low:'#22c55e' }

function TaskCard({ task, onComplete }) {
  const [completing, setCompleting] = useState(false)
  const color = PRI_COLORS[task.priority] || '#6b7094'
  const done  = task.status === 'completed'
  const complete = async () => {
    setCompleting(true)
    try { await onComplete(task.id); toast.ok('Task marked complete!') }
    catch { toast.err('Failed to complete task') }
    finally { setCompleting(false) }
  }
  return (
    <div className="panel p-4 transition-all" style={{opacity:done?0.6:1,borderLeft:`3px solid ${done?'#3d4258':color}`}}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          {done ? <CheckCircle2 size={15} className="text-success flex-shrink-0"/> : <Clock size={15} className="text-subtle flex-shrink-0"/>}
          <p className="text-sm font-medium text-heading">{task.title}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`pill ${task.priority==='high'?'pill-critical':task.priority==='low'?'pill-low':'pill-medium'}`}>{task.priority}</span>
        </div>
      </div>
      {task.description && task.description !== task.title && <p className="text-xs text-subtle mb-2 ml-6">{task.description}</p>}
      <div className="flex items-center justify-between ml-6">
        <div className="font-mono text-[10px] text-subtle space-y-0.5">
          <p>Incident: <span className="text-accent">{task.incident_id}</span></p>
          <p>Due: <span className={new Date(task.due_at) < new Date() && !done ? 'text-danger' : ''}>{fmtTs(task.due_at)}</span></p>
        </div>
        {!done && (
          <button onClick={complete} disabled={completing} className="btn-primary btn-ghost text-xs py-1.5 px-3">
            {completing ? <Spinner size={11}/> : <><CheckCircle2 size={11}/> Complete</>}
          </button>
        )}
      </div>
    </div>
  )
}

export default function TaskManager() {
  const [tasks,   setTasks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('pending')

  const load = useCallback(async () => {
    try { const r = await getTasks(); setTasks(r.data||[]) }
    catch {} finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t=setInterval(load,8000); return()=>clearInterval(t) }, [load])

  const handleComplete = async (id) => {
    await completeTask(id)
    await load()
  }

  const visible = filter === 'all' ? tasks : tasks.filter(t => t.status === filter)
  const pendingCount = tasks.filter(t => t.status==='pending').length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck size={15} className="text-warning"/>
          <h1 className="text-lg font-bold text-heading">Task Manager</h1>
          {pendingCount > 0 && (
            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse" style={{background:'rgba(249,115,22,0.15)',color:'#f97316',border:'1px solid rgba(249,115,22,0.35)'}}>
              {pendingCount} PENDING
            </span>
          )}
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors">
          <RefreshCw size={12}/> Refresh
        </button>
      </div>

      <div className="panel p-4 text-xs text-subtle">
        <p className="font-mono text-[10px] text-accent mb-1 tracking-wider">TASKAGENT</p>
        Tasks are created automatically by the TaskAgent after each incident. Each remediation step becomes a scheduled task with priority and due date.
      </div>

      <div className="flex gap-1.5">
        {['all','pending','completed'].map(f=>(
          <button key={f} onClick={()=>setFilter(f)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{background:filter===f?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.025)',border:`1px solid ${filter===f?'rgba(99,102,241,0.45)':'#1e2130'}`,color:filter===f?'#818cf8':'#6b7094'}}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
            {f==='pending'&&pendingCount>0?` (${pendingCount})`:''}
          </button>
        ))}
      </div>

      {loading ? <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="skel h-24"/>)}</div>
        : visible.length===0 ? <EmptySlate icon={CalendarCheck} title="No tasks" sub="Fire an alert to see TaskAgent create follow-up tasks"/>
        : <div className="space-y-2">{visible.sort((a,b)=>new Date(a.due_at)-new Date(b.due_at)).map(t=><TaskCard key={t.id} task={t} onComplete={handleComplete}/>)}</div>}
    </div>
  )
}
