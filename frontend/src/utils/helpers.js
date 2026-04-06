export const SEV = {
  critical:{ label:'CRITICAL', cls:'pill-critical', dot:'#ef4444' },
  high:    { label:'HIGH',     cls:'pill-high',     dot:'#f97316' },
  medium:  { label:'MEDIUM',   cls:'pill-medium',   dot:'#f59e0b' },
  low:     { label:'LOW',      cls:'pill-low',      dot:'#22c55e' },
}
export const STATUS_DOT = {
  open:'dot-open', planning:'dot-planning', diagnosing:'dot-diagnosing',
  debating:'dot-debating', scheduling:'dot-scheduling',
  awaiting_approval:'dot-awaiting', approved:'dot-resolved',
  resolved:'dot-resolved', auto_resolved:'dot-auto', rejected:'dot-rejected',
}
export const STATUS_LABEL = {
  open:'OPEN', planning:'PLANNING', diagnosing:'DIAGNOSING', debating:'DEBATING',
  scheduling:'SCHEDULING', awaiting_approval:'AWAITING APPROVAL',
  approved:'APPROVED', resolved:'RESOLVED', auto_resolved:'AUTO-RESOLVED',
  rejected:'REJECTED', closed:'CLOSED',
}
export const isLive = (s) => ['open','planning','diagnosing','debating','scheduling'].includes(s)
export const fmtTs  = (ts) => ts ? ts.slice(0,16).replace('T',' ') : '—'
export const pct    = (v)  => Math.round((v||0)*100)
