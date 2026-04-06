import axios from 'axios'
const BASE = 'https://patchpilot-backend-35y4wrt27a-uc.a.run.app'
const http = axios.create({ baseURL: BASE, timeout: 60000 })

export const API_BASE      = BASE
export const simulateAlert = (type)    => http.post('/api/alerts/simulate', { alert_type: type })
export const getAlertTypes = ()        => http.get('/api/alerts/types')
export const getIncidents  = ()        => http.get('/api/incidents/')
export const getIncident   = (id)      => http.get(`/api/incidents/${id}`)
export const getPending    = ()        => http.get('/api/approvals/pending')
export const decide        = (payload) => http.post('/api/approvals/decide', payload)
export const getRunbooks   = (params)  => http.get('/api/runbook/', { params })
export const seedRunbooks  = ()        => http.post('/api/runbook/seed')
export const getAgentTrace = (id)      => http.get(`/api/agents/${id}/trace`)
export const getToolSchemas= ()        => http.get('/api/agents/tools/schema')
export const getMemoryStats= ()        => http.get('/api/agents/memory/stats')
export const healthCheck   = ()        => http.get('/health')
export const getTasks      = (params)  => http.get('/api/tasks/', { params })
export const completeTask  = (id)      => http.post(`/api/tasks/${id}/complete`)
