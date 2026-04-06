import React from 'react'
export default function SourceBadge({ source }) {
  const isReal = source && source !== 'mocked'
  return (
    <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${isReal ? 'source-gcp' : 'source-mocked'}`}>
      {isReal ? `⚡ ${source.replace('_','-')}` : '⚙ mocked'}
    </span>
  )
}
