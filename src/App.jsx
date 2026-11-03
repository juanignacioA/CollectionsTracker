import { useEffect, useState } from 'react'
import { LOCALES, TEXT } from './i18n.js'

const ORDER = [1, 2, 3, 4, 5, 6, 0]
const block = () => [{ start: '08:00', end: '16:00' }]
const SCHEDULE = Array.from({ length: 7 }, (_, i) => (i >= 1 && i <= 5 ? { on: true, goal: 150, ranges: block() } : { on: false, goal: 0, ranges: block() }))
const DEF = { monthGoal: 3000, schedule: SCHEDULE, over: {}, payments: [] }

const pad = n => String(n).padStart(2, '0')
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = s => new Date(s + 'T12:00:00')
const sum = a => a.reduce((s, p) => s + p.amount, 0)
const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f } catch { return f } }
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const hash = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('')
const fmt = (n, loc) => new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0)
const dayName = (i, loc) => new Date(2023, 0, 1 + i).toLocaleDateString(loc, { weekday: 'long' })
const addDate = (s, k, freq) => {
  const d = parse(s)
  if (freq === 'monthly') { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + k); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())) }
  else d.setDate(d.getDate() + k * (freq === 'weekly' ? 7 : 14))
  return iso(d)
}

const mins = t => { if (!t) return 0; const [h, m] = t.split(':'); return +h * 60 + +m }
const hm = n => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`
const hours = c => c.ranges.reduce((s, r) => s + Math.max(0, mins(r.end) - mins(r.start)), 0) / 60
const mig = c => (c.ranges || (c.start == null && c.end == null)) ? c : (({ start, end, ...r }) => ({ ...r, ranges: [{ start: start ?? '08:00', end: end ?? '16:00' }] }))(c)
const migrate = d => ({ ...d, schedule: d.schedule.map(mig), over: Object.fromEntries(Object.entries(d.over || {}).map(([k, v]) => [k, mig(v)])) })

const tone = (v, goal) => {
  const r = goal ? v / goal : v > 0 ? 1 : 0
  return `hsl(${r >= 1 ? 120 : r >= 0.75 ? 80 : r >= 0.5 ? 45 : r >= 0.25 ? 20 : 0} 85% 50%)`
}

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem('cobros:session'))
  const [lang, setLang] = useState(() => localStorage.getItem('cobros:lang') || 'en')
  const pick = l => { localStorage.setItem('cobros:lang', l); setLang(l) }
  const enter = u => { localStorage.setItem('cobros:session', u); setUser(u) }
  const out = () => { localStorage.removeItem('cobros:session'); setUser(null) }
  const props = { lang, pick, L: TEXT[lang], loc: LOCALES[lang] }
  return user ? <Main key={user} user={user} out={out} {...props} /> : <Login onOk={enter} {...props} />
}

const LangPicker = ({ lang, pick }) => (
  <select className="lang" value={lang} onChange={e => pick(e.target.value)} aria-label="Language">
    <option value="en">English</option><option value="es">Español</option><option value="pt">Português</option>
  </select>
)

function Ranges({ value, onChange, L }) {
  const set = (i, p) => onChange(value.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const addBlock = () => {
    const s = Math.min(mins(value[value.length - 1].end) + 30, 1380)
    onChange([...value, { start: hm(s), end: hm(Math.min(s + 120, 1439)) }])
  }
  return (
    <div className="ranges">
      {value.map((r, i) => (
        <div key={i}>
          <div className="range">
            <input type="time" value={r.start} onChange={e => set(i, { start: e.target.value })} />
            <span>–</span>
            <input type="time" value={r.end} onChange={e => set(i, { end: e.target.value })} />
            <button type="button" className="x" disabled={value.length < 2} onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={L.del}>×</button>
          </div>
          {i < value.length - 1 && mins(value[i + 1].start) > mins(r.end) && <small className="brk">{L.breakTxt}: {mins(value[i + 1].start) - mins(r.end)} min</small>}
        </div>
      ))}
      <button type="button" className="btn sm ghost" onClick={addBlock}>+ {L.addBlock}</button>
    </div>
  )
}

function Login({ onOk, L, lang, pick }) {
  const [n, setN] = useState(''), [p, setP] = useState(''), [err, setErr] = useState('')
  const go = async e => {
    e.preventDefault()
    const name = n.trim().toLowerCase()
    if (!name || p.length < 4) return setErr(L.errFill)
    const users = load('cobros:users', {}), h = await hash(p)
    if (!users[name]) { users[name] = h; save('cobros:users', users) }
    else if (users[name] !== h) return setErr(L.errPass)
    onOk(name)
  }
  return (
    <main className="login">
      <form className="card form" onSubmit={go}>
        <h1>{L.title}</h1>
        <p className="muted">{L.loginHint}</p>
        <input placeholder={L.user} value={n} onChange={e => setN(e.target.value)} autoFocus />
        <input placeholder={L.pass} type="password" value={p} onChange={e => setP(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <button className="btn neon block">{L.enter}</button>
        <LangPicker lang={lang} pick={pick} />
      </form>
    </main>
  )
}

function Main({ user, out, L, lang, pick, loc }) {
  const money = n => fmt(n, loc)
  const key = 'cobros:data:' + user
  const [d, setD] = useState(() => migrate({ ...DEF, ...load(key, {}) }))
  useEffect(() => save(key, d), [d])
  const T = iso(new Date())
  const [tab, setTab] = useState('inicio')
  const [month, setMonth] = useState(T.slice(0, 7))
  const [f, setF] = useState({ amount: '', date: T, note: '', sched: false, mode: 'single', freq: 'weekly', count: 4 })
  const [ep, setEp] = useState(null)
  const [ed, setEd] = useState(T)

  const cfg = x => ({ ...d.schedule[parse(x).getDay()], ...(d.over[x] || {}) })
  const goalOf = x => (cfg(x).on ? cfg(x).goal : 0)
  const setOver = (x, patch) => setD(s => ({ ...s, over: { ...s.over, [x]: { ...s.over[x], ...patch } } }))
  const setDay = (i, patch) => setD(s => ({ ...s, schedule: s.schedule.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  const done = d.payments.filter(p => p.done)
  const pending = d.payments.filter(p => !p.done).sort((a, b) => a.date.localeCompare(b.date))
  const dayTotal = x => sum(done.filter(p => p.date === x))
  const monthPays = done.filter(p => p.date.startsWith(month))
  const monthTotal = sum(monthPays)
  const pct = d.monthGoal ? (monthTotal / d.monthGoal) * 100 : 0
  const [y, m] = month.split('-').map(Number)
  const days = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${pad(i + 1)}`)
  const base = parse(T), off = (base.getDay() + 6) % 7
  const week = Array.from({ length: 7 }, (_, i) => { const x = new Date(base); x.setDate(base.getDate() - off + i); return iso(x) })
  const weekGoal = sum(week.map(x => ({ amount: goalOf(x) }))), weekTotal = sum(week.map(x => ({ amount: dayTotal(x) })))
  const max = Math.max(1, ...days.map(dayTotal), ...days.map(goalOf))
  const tg = goalOf(T), tt = dayTotal(T), tc = cfg(T)

  const plan = f.mode === 'plan'
  const amt = parseFloat(f.amount) || 0
  const n = Math.min(120, Math.max(1, parseInt(f.count) || 1))
  const FREQS = [['weekly', L.weekly], ['biweekly', L.biweekly], ['monthly', L.monthly]]

  const add = e => {
    e.preventDefault()
    if (!amt) return
    const id = Date.now()
    const items = Array.from({ length: plan ? n : 1 }, (_, k) => ({
      id: id + k, amount: amt, done: plan ? false : !f.sched,
      date: plan ? addDate(f.date, k, f.freq) : f.date,
      note: plan ? `${f.note ? f.note + ' ' : ''}(${k + 1}/${n})` : f.note,
    }))
    setD(s => ({ ...s, payments: [...s.payments, ...items] }))
    setF({ ...f, amount: '', note: '' })
  }
  const del = id => setD(s => ({ ...s, payments: s.payments.filter(p => p.id !== id) }))
  const collect = id => setD(s => ({ ...s, payments: s.payments.map(p => (p.id === id ? { ...p, done: true, date: T } : p)) }))
  const saveEdit = () => {
    const amount = parseFloat(ep.amount)
    if (!amount || !ep.date) return
    setD(s => ({ ...s, payments: s.payments.map(p => (p.id === ep.id ? { ...p, amount, date: ep.date, note: ep.note } : p)) }))
    setEp(null)
  }

  const exportData = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }))
    a.download = `collections-${user}-${T}.json`
    a.click()
  }
  const importData = e => {
    const file = e.target.files[0]
    if (!file) return
    file.text().then(t => {
      try { const j = JSON.parse(t); if (!Array.isArray(j.payments)) throw 0; if (confirm(L.confirm)) setD(migrate({ ...DEF, ...j })) }
      catch { alert(L.bad) }
    })
    e.target.value = ''
  }

  const rows = (items, action) => items.length === 0 ? <p className="muted">{L.none}</p> : (
    <ul className="list">
      {items.map(p => ep?.id === p.id ? (
        <li key={p.id} className="editli">
          <input type="number" inputMode="decimal" step="0.01" value={ep.amount} onChange={e => setEp({ ...ep, amount: e.target.value })} />
          <input type="text" value={ep.note} onChange={e => setEp({ ...ep, note: e.target.value })} />
          <input type="date" value={ep.date} onChange={e => setEp({ ...ep, date: e.target.value })} />
          <div className="acts">
            <button className="btn sm" onClick={() => setEp(null)}>{L.cancel}</button>
            <button className="btn neon sm" onClick={saveEdit}>{L.save}</button>
          </div>
        </li>
      ) : (
        <li key={p.id}>
          <div><b>{money(p.amount)}</b> <small>{p.note}</small></div>
          <small className="muted">{p.date}</small>
          <div className="acts">
            {action && <button className="btn sm" onClick={() => collect(p.id)}>{L.collect}</button>}
            <button className="btn sm" onClick={() => setEp({ id: p.id, amount: p.amount, date: p.date, note: p.note || '' })}>{L.edit}</button>
            <button className="btn sm" onClick={() => del(p.id)}>{L.del}</button>
          </div>
        </li>
      ))}
    </ul>
  )

  const tabs = [['inicio', L.home], ['pagos', L.payments], ['agenda', `${L.scheduled} (${pending.length})`], ['ajustes', L.settings]]
  const MonthPick = <input className="month" type="month" value={month} onChange={e => setMonth(e.target.value)} />

  return (
    <div className="app">
      <header>
        <h1>{L.title}</h1>
        <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <div className="top"><LangPicker lang={lang} pick={pick} /><button className="link" title={user} onClick={out}>{L.logout}</button></div>
      </header>

      {tab === 'inicio' && <>
        <section className="grid">
          <div className="card big">
            <span className="muted">{L.today}</span>
            <strong className="neon-text">{money(tt)}</strong>
            <div className="bar"><i style={{ width: Math.min(100, tg ? (tt / tg) * 100 : 0) + '%', background: tone(tt, tg) }} /></div>
            <small className="muted">{L.goalToday}: {money(tg)} · {tc.on || tc.ranges.length ? `${tc.ranges.map(r => `${r.start}–${r.end}`).join(' · ')} (${hours(tc).toFixed(1)} h)` : L.off}</small>
            <label className="field">{L.editGoal}
              <input type="number" inputMode="decimal" value={d.over[T]?.goal ?? tc.goal} onChange={e => setOver(T, { goal: +e.target.value, on: true })} />
            </label>
          </div>
          <div className="card big">
            <span className="muted">{L.month}</span>
            <strong>{money(monthTotal)}</strong>
            <div className="bar"><i style={{ width: Math.min(100, pct) + '%', background: tone(pct, 100) }} /></div>
            <small className="muted">{pct.toFixed(1)}% {L.of} {money(d.monthGoal)} · {L.left} {money(Math.max(0, d.monthGoal - monthTotal))}</small>
          </div>
          <div className="card big">
            <span className="muted">{L.week}</span>
            <strong>{money(weekTotal)}</strong>
            <small className="muted">{L.weekLeft}: {money(weekGoal)}</small>
          </div>
        </section>

        <form className="card form" onSubmit={add}>
          <div className="seg">
            <button type="button" className={!plan ? 'on' : ''} onClick={() => setF({ ...f, mode: 'single' })}>{L.single}</button>
            <button type="button" className={plan ? 'on' : ''} onClick={() => setF({ ...f, mode: 'plan' })}>{L.plan}</button>
          </div>
          <label className="field">{plan ? L.each : L.amount}
            <div className="money"><span>$</span><input type="number" inputMode="decimal" step="0.01" placeholder="0.00" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></div>
          </label>
          <label className="field">{L.note}<input type="text" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
          {plan && <div className="field">{L.freq}
            <div className="seg">{FREQS.map(([k, l]) => <button type="button" key={k} className={f.freq === k ? 'on' : ''} onClick={() => setF({ ...f, freq: k })}>{l}</button>)}</div>
          </div>}
          {plan && <div className="field">{L.count}
            <div className="step">
              <button type="button" className="btn" onClick={() => setF({ ...f, count: Math.max(1, n - 1) })} aria-label="-">−</button>
              <input type="number" inputMode="numeric" min="1" max="120" value={f.count} onChange={e => setF({ ...f, count: e.target.value })} />
              <button type="button" className="btn" onClick={() => setF({ ...f, count: Math.min(120, n + 1) })} aria-label="+">+</button>
            </div>
          </div>}
          <label className="field">{plan ? L.start : L.date}
            <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value, sched: e.target.value > T })} />
          </label>
          {!plan && <label className="switch"><input type="checkbox" checked={f.sched} onChange={e => setF({ ...f, sched: e.target.checked })} /><i />{L.sched}</label>}
          {plan && amt > 0 && <div className="preview">{n} × {money(amt)} = <b>{money(amt * n)}</b><br /><small className="muted">{f.date} → {addDate(f.date, n - 1, f.freq)}</small></div>}
          <button className="btn neon block">{plan ? L.create : f.sched ? L.addSched : L.add}</button>
        </form>

        <section className="card">
          <div className="between"><h2>{L.chart}</h2>{MonthPick}</div>
          <div className="chart">
            {days.map(x => (
              <div key={x} className={'col' + (x === T ? ' today' : '')} title={`${x}: ${money(dayTotal(x))} / ${money(goalOf(x))}`}>
                <div className="stack"><i style={{ height: Math.max(1, (dayTotal(x) / max) * 100) + '%', background: tone(dayTotal(x), goalOf(x)) }} /></div>
                <small>{+x.slice(8)}</small>
              </div>
            ))}
          </div>
          <small className="muted">{L.legend}</small>
        </section>
      </>}

      {tab === 'pagos' && <section className="card">
        <div className="between"><h2>{L.paid}</h2>{MonthPick}</div>
        {rows([...monthPays].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id))}
      </section>}

      {tab === 'agenda' && <section className="card">
        <h2>{L.scheduled}</h2>
        <p className="muted">{L.pending}: {money(sum(pending))}</p>
        {rows(pending, true)}
      </section>}

      {tab === 'ajustes' && <>
        <section className="card form">
          <h2>{L.monthGoal}</h2>
          <div className="money"><span>$</span><input type="number" inputMode="decimal" value={d.monthGoal} onChange={e => setD({ ...d, monthGoal: +e.target.value })} /></div>
        </section>
        <section className="card form">
          <h2>{L.weekSet}</h2>
          {ORDER.map(i => {
            const c = d.schedule[i]
            return (
              <div className={'dayc' + (c.on ? '' : ' off')} key={i}>
                <div className="dayhead">
                  <label className="switch"><input type="checkbox" checked={c.on} onChange={e => setDay(i, { on: e.target.checked })} /><i />{dayName(i, loc)}</label>
                  <div className="money sm"><span>$</span><input type="number" inputMode="decimal" aria-label={L.goal} value={c.goal} onChange={e => setDay(i, { goal: +e.target.value })} /></div>
                </div>
                <Ranges value={c.ranges} onChange={r => setDay(i, { ranges: r })} L={L} />
              </div>
            )
          })}
          <small className="muted">{L.weekHelp}</small>
        </section>
        <section className="card form">
          <h2>{L.oneDay}</h2>
          <div className="dayc">
            <input type="date" value={ed} onChange={e => setEd(e.target.value)} />
            <label className="field">{L.goal}
              <div className="money"><span>$</span><input type="number" inputMode="decimal" value={cfg(ed).goal} onChange={e => setOver(ed, { goal: +e.target.value, on: true })} /></div>
            </label>
            <Ranges value={cfg(ed).ranges} onChange={r => setOver(ed, { ranges: r })} L={L} />
            <button className="btn sm" onClick={() => setD(s => { const o = { ...s.over }; delete o[ed]; return { ...s, over: o } })}>{L.reset}</button>
          </div>
        </section>
        <section className="card form">
          <button className="btn neon block" onClick={exportData}>{L.down}</button>
          <label className="btn block">{L.up}<input type="file" accept="application/json" hidden onChange={importData} /></label>
        </section>
      </>}
    </div>
  )
}
