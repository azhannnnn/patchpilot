import React, { useState, useEffect } from 'react'
import { Zap, LayoutDashboard, AlertTriangle, ShieldCheck, GitBranch, BookOpen, CalendarCheck, ChevronLeft, ChevronRight, Radio, Cpu, Brain } from 'lucide-react'
import CommandCenter  from './pages/CommandCenter'
import IncidentList   from './pages/IncidentList'
import ApprovalQueue  from './pages/ApprovalQueue'
import RunbookLibrary from './pages/RunbookLibrary'
import TaskManager    from './pages/TaskManager'
import Toaster        from './components/Toaster'
import { getIncidents, getMemoryStats } from './utils/api'

const NAV = [
  { id:'cmd',      label:'Command Center',  Icon:LayoutDashboard },
  { id:'incidents',label:'Incidents',       Icon:AlertTriangle   },
  { id:'approvals',label:'Approvals',       Icon:ShieldCheck     },
  { id:'tasks',    label:'Task Manager',    Icon:CalendarCheck   },
  { id:'runbooks', label:'Runbook Library', Icon:BookOpen        },
]

export default function App() {
  const [page,      setPage]  = useState('cmd')
  const [collapsed, setCol]   = useState(false)
  const [stats,     setStats] = useState({ total:0, live:0, pending:0, mem:0, gemini:false, tasksPending:0 })

  useEffect(() => {
    const load = async () => {
      try {
        const [i,m] = await Promise.allSettled([getIncidents(), getMemoryStats()])
        const inc   = i.status==='fulfilled'?(i.value.data||[]):[]
        const mem   = m.status==='fulfilled'?m.value.data:null
        setStats({
          total:        inc.length,
          live:         inc.filter(x=>['open','planning','diagnosing','debating','scheduling'].includes(x.status)).length,
          pending:      inc.filter(x=>x.status==='awaiting_approval').length,
          mem:          mem?.faiss_index_size||0,
          gemini:       inc.some(x=>x.gemini_active),
          tasksPending: inc.reduce((s,x)=>(x.scheduled_tasks||[]).filter(t=>t.status==='pending').length+s,0),
        })
      } catch {}
    }
    load(); const t=setInterval(load,8000); return()=>clearInterval(t)
  }, [])

  const renderPage = () => {
    switch(page) {
      case 'cmd':       return <CommandCenter  onNav={setPage}/>
      case 'incidents': return <IncidentList/>
      case 'approvals': return <ApprovalQueue/>
      case 'tasks':     return <TaskManager/>
      case 'runbooks':  return <RunbookLibrary/>
      default:          return <CommandCenter  onNav={setPage}/>
    }
  }

  return (
    <div className="min-h-screen">
      <div className="orb orb-1"/><div className="orb orb-2"/><div className="orb orb-3"/>
      <aside className={`sidebar ${collapsed?'collapsed':''}`}>
        <div className="px-3 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:'linear-gradient(135deg,#6366f1,#4f46e5)',boxShadow:'0 0 16px rgba(99,102,241,0.45)'}}>
              <Zap size={14} className="text-white"/>
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2" style={{borderColor:'#0d0f17',boxShadow:'0 0 5px #22c55e'}}/>
            </div>
            {!collapsed && <div><p className="font-bold text-heading text-sm tracking-tight">PatchPilot</p><p className="font-mono text-[9px] text-subtle">v5 · 7 Agents · MCP</p></div>}
          </div>
          <button onClick={()=>setCol(!collapsed)} className="text-subtle hover:text-body transition-colors flex-shrink-0 p-1 rounded-lg hover:bg-panel">
            {collapsed?<ChevronRight size={14}/>:<ChevronLeft size={14}/>}
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {NAV.map(({id,label,Icon}) => (
            <button key={id} onClick={()=>setPage(id)} title={collapsed?label:undefined}
              className={`nav-item w-full ${page===id?'active':''} ${collapsed?'justify-center':''}`}>
              <Icon size={15} className="flex-shrink-0"/>
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && id==='approvals' && stats.pending>0 && (
                <span className="ml-auto font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse" style={{background:'rgba(245,158,11,0.18)',color:'#f59e0b'}}>{stats.pending}</span>
              )}
              {!collapsed && id==='tasks' && stats.tasksPending>0 && (
                <span className="ml-auto font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse" style={{background:'rgba(249,115,22,0.18)',color:'#f97316'}}>{stats.tasksPending}</span>
              )}
            </button>
          ))}
        </nav>
        {!collapsed && (
          <div className="px-3 py-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              {stats.live>0 ? <Radio size={10} className="text-warning animate-pulse"/> : <span className="w-2 h-2 rounded-full bg-success" style={{boxShadow:'0 0 5px #22c55e'}}/>}
              <span className="font-mono text-[10px] text-subtle">{stats.live>0?<span className="text-warning">{stats.live} active</span>:<span className="text-success">All clear</span>}</span>
            </div>
            <div className="flex items-center gap-2">
              <Brain size={10} className={stats.gemini?'text-accent':'text-subtle'}/>
              <span className={`font-mono text-[10px] ${stats.gemini?'text-accent-light':'text-subtle'}`}>{stats.gemini?'Gemini active':'Fallback mode'}</span>
            </div>
            <div className="flex items-center gap-2"><Cpu size={10} className="text-subtle"/><span className="font-mono text-[10px] text-subtle">FAISS: <span style={{color:'#a855f7'}}>{stats.mem}</span></span></div>
            <div className="flex items-center gap-2"><Zap size={10} className="text-accent"/><span className="font-mono text-[10px] text-subtle">7 agents · MCP JSON-RPC 2.0</span></div>
          </div>
        )}
      </aside>
      <main className={`main-content ${collapsed?'sidebar-collapsed':''} relative z-10`}>
        <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-border px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold text-heading">{NAV.find(n=>n.id===page)?.label||'PatchPilot'}</h1>
          <div className="flex items-center gap-4">
            {stats.gemini && (
              <span className="gemini-active inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full">
                <Brain size={10}/> GEMINI ACTIVE
              </span>
            )}
            {stats.live>0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.3)'}}>
                <Radio size={9} className="text-warning animate-pulse"/>
                <span className="font-mono text-[10px] text-warning font-bold">{stats.live} LIVE</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" style={{boxShadow:'0 0 5px #22c55e'}}/>
              <span className="font-mono text-[10px] text-subtle">ONLINE</span>
            </div>
          </div>
        </header>
        <div className="px-6 py-6 max-w-6xl">{renderPage()}</div>
      </main>
      <Toaster/>
    </div>
  )
}
