import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../utils/api'

export default function useIncidentWS(incidentId) {
  const [trace,   setTrace]   = useState([])
  const [status,  setStatus]  = useState(null)
  const [gemini,  setGemini]  = useState(false)
  const [wsState, setWsState] = useState('disconnected') // 'connecting'|'open'|'closed'
  const wsRef = useRef(null)

  const connect = useCallback(() => {
    if (!incidentId) return
    const wsUrl = API_BASE.replace('https://','wss://').replace('http://','ws://')
    const ws = new WebSocket(`${wsUrl}/ws/${incidentId}`)
    wsRef.current = ws
    setWsState('connecting')

    ws.onopen  = () => setWsState('open')
    ws.onclose = () => setWsState('closed')
    ws.onerror = () => setWsState('closed')

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.event === 'snapshot') {
          setTrace(msg.data.agent_trace || [])
          setStatus(msg.data.status)
          setGemini(msg.data.gemini_active || false)
        }
        if (msg.event === 'trace_update') {
          setTrace(msg.data.agent_trace || [])
          setStatus(msg.data.status)
          setGemini(msg.data.gemini_active || false)
        }
        if (msg.event === 'completed') {
          setTrace(msg.data.agent_trace || [])
          setStatus(msg.data.status)
          setGemini(msg.data.gemini_active || false)
          ws.close()
        }
      } catch {}
    }
  }, [incidentId])

  useEffect(() => {
    connect()
    return () => { if (wsRef.current) wsRef.current.close() }
  }, [connect])

  return { trace, status, gemini, wsState }
}
