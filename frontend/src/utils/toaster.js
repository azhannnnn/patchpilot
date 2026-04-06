let _push = null
export const _setToastFn = (fn) => { _push = fn }
let _id = 0
const show = (msg, type, ms=3500) => {
  if (!_push) return
  const id = ++_id
  _push(p => [...p, {id,msg,type}])
  setTimeout(() => _push(p => p.filter(t=>t.id!==id)), ms)
}
export const toast = { ok:(m)=>show(m,'ok'), err:(m)=>show(m,'err'), info:(m)=>show(m,'info') }
