import { Children, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

const RouterContext = createContext({ path: '/', params: {}, navigate: () => {} })

let carAudioContext
function playCarLaunchSound() {
  try {
    const AudioContext=window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    carAudioContext ||= new AudioContext()
    const context=carAudioContext
    const start=() => {
      const now=context.currentTime+.01, duration=.9
      const compressor=context.createDynamicsCompressor(), master=context.createGain()
      compressor.threshold.value=-18; compressor.knee.value=12; compressor.ratio.value=5; compressor.attack.value=.004; compressor.release.value=.18
      master.gain.setValueAtTime(.0001,now); master.gain.exponentialRampToValueAtTime(.52,now+.035); master.gain.setValueAtTime(.52,now+.48); master.gain.exponentialRampToValueAtTime(.0001,now+duration)
      master.connect(compressor).connect(context.destination)
      ;[[48,'sawtooth',.24],[73,'square',.1],[96,'sawtooth',.07]].forEach(([frequency,type,volume],index) => {
        const oscillator=context.createOscillator(), gain=context.createGain(), wobble=context.createOscillator(), wobbleGain=context.createGain()
        oscillator.type=type; oscillator.frequency.setValueAtTime(frequency,now); oscillator.frequency.exponentialRampToValueAtTime(frequency*(index === 0 ? 4.7 : 5.4),now+.72)
        wobble.frequency.value=24+index*7; wobbleGain.gain.value=frequency*.08; wobble.connect(wobbleGain).connect(oscillator.frequency)
        gain.gain.setValueAtTime(volume,now); gain.gain.exponentialRampToValueAtTime(.001,now+duration)
        oscillator.connect(gain).connect(master); oscillator.start(now); wobble.start(now); oscillator.stop(now+duration); wobble.stop(now+duration)
      })
      const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate), data=buffer.getChannelData(0)
      for (let index=0;index<data.length;index++) data[index]=(Math.random()*2-1)*(1-index/data.length)
      const exhaust=context.createBufferSource(), filter=context.createBiquadFilter(), exhaustGain=context.createGain()
      exhaust.buffer=buffer; filter.type='bandpass'; filter.frequency.setValueAtTime(85,now); filter.frequency.exponentialRampToValueAtTime(1800,now+.68); filter.Q.value=.8
      exhaustGain.gain.setValueAtTime(.38,now); exhaustGain.gain.exponentialRampToValueAtTime(.001,now+duration)
      exhaust.connect(filter).connect(exhaustGain).connect(master); exhaust.start(now); exhaust.stop(now+duration)
      ;[.08,.2].forEach((offset,index) => { const pop=context.createOscillator(), popGain=context.createGain(); pop.type='square'; pop.frequency.setValueAtTime(72-index*12,now+offset); pop.frequency.exponentialRampToValueAtTime(38,now+offset+.1); popGain.gain.setValueAtTime(.2-index*.04,now+offset); popGain.gain.exponentialRampToValueAtTime(.001,now+offset+.12); pop.connect(popGain).connect(master); pop.start(now+offset); pop.stop(now+offset+.13) })
    }
    if (context.state === 'suspended') context.resume().then(start).catch(() => {})
    else start()
  } catch {}
}

export function BrowserRouter({ children }) {
  const [path, setPath] = useState(() => window.location.pathname)
  const [transition, setTransition] = useState('idle')
  const [transitionDirection, setTransitionDirection] = useState('right')
  const nextDirection = useRef('right')
  const timers = useRef([])
  useEffect(() => { const onPop = () => setPath(window.location.pathname); window.addEventListener('popstate', onPop); return () => window.removeEventListener('popstate', onPop) }, [])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const navigate = (to) => {
    if (to === path || transition !== 'idle') return
    if (to === '/products' || to.startsWith('/products/category/')) playCarLaunchSound()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { history.pushState({}, '', to); setPath(window.location.pathname); window.scrollTo({ top:0 }); return }
    timers.current.forEach(clearTimeout)
    const direction=nextDirection.current
    setTransitionDirection(direction)
    nextDirection.current=direction === 'right' ? 'left' : 'right'
    setTransition('spin')
    timers.current=[
      setTimeout(() => { history.pushState({}, '', to); setPath(window.location.pathname); window.scrollTo({ top:0 }); setTransition('launch') },300),
      setTimeout(() => setTransition('idle'),850),
    ]
  }
  return <RouterContext.Provider value={{ path, params:{}, navigate }}>{children}{transition !== 'idle' && <PageTransition phase={transition} direction={transitionDirection}/>}</RouterContext.Provider>
}

function PageTransition({ phase, direction }) {
  return <div className={`page-transition ${phase} dir-${direction}`} role="status" aria-live="polite" aria-label="Loading page"><div className="transition-speed-lines"/><div className="transition-machine"><div className="transition-smoke">{Array.from({length:7},(_,index) => <i key={index}/>)}</div><div className="transition-wheel"><span className="transition-rim">{Array.from({length:6},(_,index) => <i key={index}/>)}</span><b>R</b></div><div className="transition-road"/></div><span className="transition-word">REVTROVE</span></div>
}

function match(pattern, pathname) {
  if (pattern === '*') return { params:{}, score:0 }
  if (pattern.endsWith('/*')) return pathname === pattern.slice(0,-2) || pathname.startsWith(pattern.slice(0,-1)) ? { params:{}, score:1 } : null
  const patternParts = pattern.split('/').filter(Boolean), pathParts = pathname.split('/').filter(Boolean)
  if (patternParts.length !== pathParts.length) return null
  const params = {}
  for (let i=0;i<patternParts.length;i++) {
    if (patternParts[i].startsWith(':')) params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    else if (patternParts[i] !== pathParts[i]) return null
  }
  return { params, score:10 + patternParts.length }
}

export function Routes({ children }) {
  const context = useContext(RouterContext)
  const selected = useMemo(() => Children.toArray(children).map((child) => ({ child, result:match(child.props.path, context.path) })).filter((x) => x.result).sort((a,b) => b.result.score-a.result.score)[0], [children, context.path])
  if (!selected) return null
  return <RouterContext.Provider value={{ ...context, params:selected.result.params }}>{selected.child.props.element}</RouterContext.Provider>
}

export function Route() { return null }
export function useParams() { return useContext(RouterContext).params }

export function Link({ to, children, className='', onClick, ...props }) {
  const { navigate } = useContext(RouterContext)
  return <a href={to} className={className} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); navigate(to) } }} {...props}>{children}</a>
}

export function NavLink({ to, children, className='', end=false, ...props }) {
  const { path } = useContext(RouterContext)
  const active = end ? path === to : path === to || path.startsWith(`${to}/`)
  return <Link to={to} className={`${className}${active ? ' active' : ''}`} {...props}>{children}</Link>
}
