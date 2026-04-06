import React from 'react'
import { SEV } from '../utils/helpers'
export default function SevPill({ sev }) {
  const s = SEV[sev] || SEV.medium
  return <span className={`pill ${s.cls}`}>{s.label}</span>
}
