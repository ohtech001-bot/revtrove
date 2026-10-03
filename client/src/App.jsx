import {showMessage,askConfirmation} from './lib/site-dialogs'
import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link, NavLink, Route, Routes, useParams } from './router'
import { Archive, ArrowLeft, ArrowRight, Box, Check, ChevronDown, Globe2, Instagram, LocateFixed, LockKeyhole, Mail, MapPin, Menu, PackageCheck, Palette, Phone, PhoneCall, Plus, Printer, Rotate3D, Search, ShieldCheck, ShoppingBag, Sparkles, Upload, X } from 'lucide-react'
import { dictionaries, rtlLanguages } from './i18n'
import AccessibilityTools from './AccessibilityTools'
import { formatProductPrice } from '../../shared/catalog-additions.mjs'
import './lib/firebase'
import {readCart,cartCopy,cartPayload} from './lib/cart'
import {startCatalogSync} from './lib/catalog-sync.mjs'
import './cart.css'
import './admin-checkboxes.css'
import {AdminDetails,detailTitle} from './AdminDetails'
import ArchiveRetention from './ArchiveRetention'
import {ordersFilterStatus} from './lib/archive-retention'
import { loopPhase } from '../../shared/animation.mjs'
import {uploadFile,discardUpload} from './lib/uploads'
import {printOrder} from './lib/order-print'
import {CustomImageInput,CustomMeasurements,CustomOrderNotice,MeasurementSettings,printReferenceImages} from './CustomOrderExtras'
import {AdminInventory,AdminCategories,AdminSettings,inventoryText} from './AdminInventory'
import {AdminColors,colorPageText} from './AdminColors'
import {configurationFields,fieldPalette,fieldName,requiresColor} from '../../shared/product-configuration.mjs'
import AdminSidebar from './AdminSidebar'
import {lockPageScroll} from './lib/scroll-lock.mjs'
import {shouldToggleOrder} from './lib/order-card-interaction.mjs'
import PasswordRecovery,{recoveryCopy} from './PasswordRecovery'
import {readAdminSession,saveAdminSession,clearAdminSession,tokenExpiry} from './lib/admin-session.mjs'
import {loginErrorMessage} from '../../shared/login-message.mjs'
import {viewerTextColors} from '../../shared/viewer-text-colors.mjs'
import {configurationCopy} from './CategoryConfiguration'
import {categoryId} from '../../shared/catalog-categories.mjs'


const closestPaletteColor=(value,colors=[])=>colors.find(c=>c.hex.toLowerCase()===String(value||'').toLowerCase())||null



const adminText = {
  ar:{ waiting:'بانتظار التأكيد',readyWork:'جاهز للعمل',contactWhatsapp:'تواصل عبر واتساب',sendQuote:'إرسال العرض عبر واتساب',confirmOrder:'تم تأكيد الزبون — ابدأ التجهيز',price:'السعر المقترح',days:'مدة التجهيز',day:'يوم',customer:'تفاصيل الزبون',order:'تفاصيل الطلب',close:'إغلاق',choosePrint:'اختر لغة الطباعة',arabic:'العربية',english:'English',hebrew:'עברית',defaultText:'النص الأساسي',colors:'الألوان المختارة',print:'طباعة 80 مم' },
  en:{ waiting:'Waiting for confirmation',readyWork:'Ready to start',contactWhatsapp:'Contact on WhatsApp',sendQuote:'Send quote on WhatsApp',confirmOrder:'Customer confirmed — start production',price:'Quoted price',days:'Production time',day:'days',customer:'Customer details',order:'Order details',close:'Close',choosePrint:'Choose print language',arabic:'العربية',english:'English',hebrew:'עברית',defaultText:'Default text',colors:'Selected colors',print:'Print 80 mm' },
  he:{ waiting:'ממתין לאישור',readyWork:'מוכן לעבודה',contactWhatsapp:'יצירת קשר ב-WhatsApp',sendQuote:'שליחת הצעה ב-WhatsApp',confirmOrder:'הלקוח אישר — התחלת ייצור',price:'מחיר מוצע',days:'זמן הכנה',day:'ימים',customer:'פרטי לקוח',order:'פרטי הזמנה',close:'סגירה',choosePrint:'בחירת שפת הדפסה',arabic:'العربية',english:'English',hebrew:'עברית',defaultText:'טקסט ברירת מחדל',colors:'צבעים שנבחרו',print:'הדפסת 80 מ״מ' },
}
Object.assign(adminText.ar,{print:'طباعة A4',archive:'الأرشيف',awaitingPickup:'بانتظار الاستلام',readyButton:'جاهز',receivedButton:'تم الاستلام'})
Object.assign(adminText.en,{print:'Print A4',archive:'Archive',awaitingPickup:'Waiting for pickup',readyButton:'Ready',receivedButton:'Received'})
Object.assign(adminText.he,{print:'הדפסת A4',archive:'ארכיון',awaitingPickup:'ממתין לאיסוף',readyButton:'מוכן',receivedButton:'נאסף'})

const SiteContext = createContext(null)
const useSite = () => useContext(SiteContext)
const localized = (item, field, language) => item?.[`${field}_${language}`] || item?.[`${field}_en`] || ''
const productCategory = (product) => {
  return categoryId(product?.category || (product?.slug?.includes('turbo') ? 'turbo' : 'wheel'))
}

async function api(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error=new Error(payload.error || 'request_failed')
    error.status=response.status
    error.payload=payload
    throw error
  }
  return payload
}

let googleMapsPromise
function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google)
  const key=import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!key) return Promise.reject(new Error('missing_google_maps_key'))
  if (googleMapsPromise) return googleMapsPromise
  googleMapsPromise=new Promise((resolve,reject) => {
    const callback='__revtroveGoogleMapsReady'
    window[callback]=() => { delete window[callback]; resolve(window.google) }
    const script=document.createElement('script'); script.async=true; script.defer=true
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=places,marker,geocoding&callback=${callback}`
    script.onerror=() => reject(new Error('google_maps_load_failed'))
    document.head.appendChild(script)
  })
  return googleMapsPromise
}

function App() {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('revtrove-language')
    return dictionaries[saved] ? saved : 'ar'
  })
  const [products, setProducts] = useState([])
  const [categories,setCategories]=useState([])
  const [colorCatalog,setColorCatalog]=useState([])
  const [catalogError,setCatalogError]=useState(false)
  const [cart,setCart]=useState(readCart)
  const [checkoutKey,setCheckoutKey]=useState(()=>{try{return localStorage.getItem('revtrove-checkout')||crypto.randomUUID()}catch{return crypto.randomUUID()}})
  useEffect(()=>{try{localStorage.setItem('revtrove-cart',JSON.stringify(cart));localStorage.setItem('revtrove-checkout',checkoutKey)}catch{}},[cart,checkoutKey])
  const changeCart=update=>{setCart(update);setCheckoutKey(crypto.randomUUID())}
  const direction = rtlLanguages.has(language) ? 'rtl' : 'ltr'
  const t = (key) => dictionaries[language][key] || dictionaries.en[key] || key
  useEffect(() => {
    document.documentElement.lang = language; document.documentElement.dir = direction; localStorage.setItem('revtrove-language', language)
  }, [language, direction])
  const catalogSync=useRef(null)
  const fetchCatalog=async()=>{try{const [items,groups,palette]=await Promise.all([api('/api/products',{cache:'no-store'}),api('/api/categories',{cache:'no-store'}),api('/api/colors',{cache:'no-store'})]);setProducts(items);setCategories(groups);setColorCatalog(palette);setCatalogError(false)}catch(error){setCatalogError(true);throw error}}
  const refreshCatalog=()=>catalogSync.current?catalogSync.current.refresh():fetchCatalog()
  useEffect(()=>{const sync=startCatalogSync({refresh:fetchCatalog});catalogSync.current=sync;return()=>{sync.stop();catalogSync.current=null}},[])
  return <SiteContext.Provider value={{ language, setLanguage, direction, t, products, setProducts,categories,colorCatalog,refreshCatalog,cart,changeCart,checkoutKey }}>
    {catalogError&&<div className="form-error">{language==='ar'?'تعذر تحميل البيانات من قاعدة البيانات.':language==='he'?'לא ניתן לטעון את הנתונים.':'Could not load database data.'}<button onClick={()=>refreshCatalog().catch(()=>{})}>{language==='ar'?'إعادة المحاولة':language==='he'?'נסה שוב':'Retry'}</button></div>}
    <Routes>
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Storefront />} />
    </Routes>
  </SiteContext.Provider>
}

function Storefront() {
  const { language }=useSite()
  return <div className="site-shell"><Header /><SiteCarRover/><AccessibilityTools language={language}/><main><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/products" element={<Catalog />} />
    <Route path="/products/category/:category" element={<Catalog />} />
    <Route path="/products/:slug" element={<ProductPage />} />
    <Route path="/cart" element={<CartPage />} />
    <Route path="/custom-order" element={<CustomOrder />} />
    <Route path="/policies" element={<PolicyPage />} />
    <Route path="/privacy" element={<PolicyPage privacy />} />
  </Routes></main><Footer /></div>
}

function SiteCarRover() {
  const carRef=useRef(null)
  useEffect(() => {
    const car=carRef.current
    const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!car || reduceMotion.matches) return

    // A closed Catmull-Rom route gives the car broad, road-like bends instead
    // of connecting waypoints with visibly sharp corners.
    const route=[
      [-.16,.82],[.12,.69],[.42,.83],[.72,.61],[1.16,.35],
      [.91,-.13],[.81,.27],[.61,.49],[.35,.28],[.07,.52],
      [.27,.76],[.73,.70],[1.16,.61]
    ]
    const duration=36000
    let frame=0
    let started=null

    const sample=(phase) => {
      const count=route.length
      const segment=Math.floor(phase) % count
      const t=phase-Math.floor(phase)
      const p0=route[(segment-1+count)%count]
      const p1=route[segment]
      const p2=route[(segment+1)%count]
      const p3=route[(segment+2)%count]
      const t2=t*t
      const t3=t2*t
      const point=(axis) => .5*((2*p1[axis])+(-p0[axis]+p2[axis])*t+(2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t2+(-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t3)
      const tangent=(axis) => .5*((-p0[axis]+p2[axis])+2*(2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t+3*(-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t2)
      return { x:point(0),y:point(1),dx:tangent(0),dy:tangent(1) }
    }

    const drive=(now) => {
      if (started === null) started=now
      const phase=loopPhase(now-started,duration,route.length)
      const point=sample(phase)
      const x=point.x*window.innerWidth-car.offsetWidth/2
      const y=point.y*window.innerHeight-car.offsetHeight/2
      const angle=Math.atan2(point.dy*window.innerHeight,point.dx*window.innerWidth)*180/Math.PI
      car.style.transform=`translate3d(${x}px,${y}px,0) rotate(${angle}deg)`
      frame=requestAnimationFrame(drive)
    }
    frame=requestAnimationFrame(drive)
    return () => cancelAnimationFrame(frame)
  },[])
  return <div ref={carRef} className="site-car-rover" aria-hidden="true"><i/><i/><i/><img src="/assets/hero/supercar-top.png" alt=""/></div>
}

function Brand() {
  return <Link className="brand" to="/" aria-label="Revtrove home"><img src="/logos/revtrove-main.jpg" alt="Revtrove" /></Link>
}

function Header() {
  const { language, setLanguage, t,categories,cart } = useSite()
  const [open, setOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [categoriesOpen,setCategoriesOpen]=useState(false)
  const productCategories=[['all','/products',t('all')],...categories.map(c=>[c.id,'/products/category/'+encodeURIComponent(c.id),localized(c,'name',language)])]
  return <header className="header"><div className="header-menu-slot"><button className="menu-button" onClick={() => setOpen(true)} aria-label="Menu"><Menu/></button></div><Brand/><div className="header-actions"><div className="language-menu"><button className="header-icon" onClick={() => setLanguageOpen(!languageOpen)} aria-label="Language"><Globe2/></button>{languageOpen && <div className="language-popover">{[['ar','العربية'],['en','English'],['he','עברית']].map(([code,label]) => <button key={code} className={language === code ? 'active' : ''} onClick={() => { setLanguage(code); setLanguageOpen(false) }}>{label}{language === code && <Check size={15}/>}</button>)}</div>}</div><Link className="header-icon cart-button" to="/cart" aria-label={cartCopy(language).title}><ShoppingBag/><span>{cart.reduce((sum,item)=>sum+item.quantity,0)}</span></Link><a className="header-icon whatsapp-button" href="https://wa.me/972522538264" target="_blank" rel="noreferrer" aria-label={t('contact')}><PhoneCall/></a></div>
    {open && <button className="nav-scrim" aria-label="Close menu" onClick={() => setOpen(false)}/>}<nav className={open ? 'nav open' : 'nav'}><div className="drawer-head"><Brand/><button onClick={() => setOpen(false)} aria-label="Close menu"><X/></button></div><NavLink onClick={() => setOpen(false)} to="/" end>{t('home')}<ArrowRight size={17}/></NavLink><div className={`nav-products-menu${categoriesOpen?' open':''}`}><NavLink className="nav-products-desktop" onClick={() => setOpen(false)} to="/products">{t('products')}<ArrowRight size={17}/></NavLink><button type="button" className="nav-products-mobile" onClick={() => setCategoriesOpen(!categoriesOpen)} aria-expanded={categoriesOpen}>{t('products')}<ChevronDown size={18}/></button><div className="nav-category-submenu">{productCategories.map(([key,to,label])=><Link key={key} to={to} onClick={()=>{setOpen(false);setCategoriesOpen(false)}}>{label}<ArrowRight size={14}/></Link>)}</div></div><NavLink onClick={() => setOpen(false)} to="/custom-order">{t('custom')}<ArrowRight size={17}/></NavLink><a href="/#about" onClick={() => setOpen(false)}>{t('about')}<ArrowRight size={17}/></a><a href="/#contact" onClick={() => setOpen(false)}>{t('contact')}<ArrowRight size={17}/></a><div className="drawer-contact"><span>REVTROVE</span><a href="https://wa.me/972522538264" target="_blank" rel="noreferrer">052-253-8264</a><a href="https://instagram.com/revtrove" target="_blank" rel="noreferrer">@revtrove</a></div></nav>
  </header>
}

function Home() {
  const { t,colorCatalog } = useSite()
  return <>
    <HeroShowcase/>
    <BrandMarquee/>
    <section className="trust-strip"><Feature icon={<ShieldCheck/>} title={t('premium')}/><Feature icon={<Box/>} title={t('precision')}/><Feature icon={<Palette/>} title={t('personalization')}/><Feature icon={<Phone/>} title={t('support')}/></section>
    <section className="section home-collection" id="products"><ProductCollection home/></section>
    <section className="craft-section" id="about"><div className="craft-image"><img src="/assets/bmw/d6c6e38b-861a-40d3-815e-9b502b4a362e.jpg" alt="3D printed BMW wheel detail"/></div><div className="craft-copy"><p className="eyebrow">REVTROVE / 3D STUDIO</p><h2>{t('aboutTitle')}</h2><p>{t('aboutText')}</p><div className="stats"><div><b>{colorCatalog.length}</b><span>{t('colors')}</span></div><div><b>360°</b><span>{t('product')}</span></div><div><b>100%</b><span>{t('personalization')}</span></div></div></div></section>
    <ContactSection />
  </>
}

function HeroShowcase() {
  const { t, products, language,colorCatalog } = useSite()
  const slides=products.filter((product) => product.images?.[0])
  const [active,setActive]=useState(0)
  const [paused,setPaused]=useState(false)
  useEffect(() => { if (paused || slides.length < 2) return; const timer=setInterval(() => setActive((value) => (value + 1) % slides.length),5200); return () => clearInterval(timer) },[paused,slides.length])
  useEffect(() => { if (active >= slides.length) setActive(0) },[active,slides.length])
  const current=slides[active]
  if(!current)return <section className="section"><p className="empty">{t('noProducts')}</p></section>
  const move=(direction) => setActive((active + direction + slides.length) % slides.length)
  return <section className="showcase-hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <div className="showcase-media">{slides.map((product,index) => <img key={product.slug} className={index === active ? 'active' : ''} src={product.images[0]} alt="" aria-hidden={index !== active}/>)}</div>
    <div className="showcase-shade"/><div className="showcase-grid"/>
    <div className="showcase-copy"><div className="showcase-kicker"><Sparkles size={15}/><span>{t('heroEyebrow')}</span><i>{String(active + 1).padStart(2,'0')} / {String(slides.length).padStart(2,'0')}</i></div><h1>{t('heroTitle')}</h1><p>{t('heroText')}</p><div className="hero-actions"><Link className="button primary" to={`/products/${current.slug}`}>{t('viewProduct')}<ArrowRight size={18}/></Link><Link className="button ghost" to="/custom-order">{t('customCta')}</Link></div><div className="showcase-metrics"><span><b>360°</b>{t('product')}</span><span><b>{colorCatalog.length}</b>{t('colors')}</span><span><b>1—1</b>{t('personalization')}</span></div></div>
    <Link className="showcase-product" to={`/products/${current.slug}`}><small>{t(productCategory(current))}</small><strong>{localized(current,'name',language)}</strong><span>{t('from')} {formatProductPrice(current.price,language)}<ArrowRight size={16}/></span></Link>
    <div className="showcase-controls"><button className="showcase-prev" onClick={() => move(-1)} aria-label="Previous"><ArrowLeft/></button><div>{slides.map((product,index) => <button key={product.slug} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={localized(product,'name',language)}><i/></button>)}</div><button className="showcase-next" onClick={() => move(1)} aria-label="Next"><ArrowRight/></button></div>
  </section>
}

function BrandMarquee() {
  const brands=[['BMW M','/logos/bmw.jpg'],['PORSCHE GT3 RS','/logos/porsche-rs.png'],['DODGE SRT','/logos/srt.jpg'],['REVTROVE','/logos/revtrove-main.jpg']]
  return <section className="brand-marquee" aria-label="Automotive brands"><div className="brand-track">{[...brands,...brands].map(([name,logo],index) => <Link to="/products" className="brand-item" key={`${name}-${index}`}><img src={logo} alt=""/><span>{name}</span><i/></Link>)}</div></section>
}

function Feature({ icon, title }) { return <div className="feature">{icon}<span>{title}</span></div> }
function SectionHeading({ eyebrow, title, text }) { return <div className="section-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div> }

function ProductCard({ product, index = 0, language }) {
  const { t,categories } = useSite()
  const category=productCategory(product)
  const hasModel=Object.keys(product.model_parts || {}).length > 0
  return <article className="product-card"><Link to={`/products/${product.slug}`} className="product-image"><ProductCardImages product={product} name={localized(product,'name',language)}/><span className="product-index">{String(index + 1).padStart(2,'0')}</span><span className="image-swap-label">{t('productPhotos')}</span><span className="view-chip">{hasModel ? <><Rotate3D size={16}/>360°</> : <><Box size={16}/>{product.images?.length || 1} {t('photos')}</>}</span></Link><div className="product-info"><div><p className="eyebrow">{localized(categories.find(c=>c.id===category),'name',language)||t(category)}</p><h3>{localized(product,'name',language)}</h3></div><div className="product-price"><small>{t('from')}</small><b>{formatProductPrice(product.price,language)}</b></div></div><Link className="product-link" to={`/products/${product.slug}`}>{t('viewProduct')}<ArrowRight size={16}/></Link></article>
}

function ProductCardImages({ product, name }) {
  const images=(product.images || []).filter(Boolean)
  const [active,setActive]=useState(0), timer=useRef(null)
  const start=() => { if (images.length < 2 || timer.current) return; timer.current=setInterval(() => setActive((value) => (value + 1) % images.length),1050) }
  const stop=() => { clearInterval(timer.current); timer.current=null }
  useEffect(() => { setActive(0); return stop },[product.slug])
  return <div className="product-card-images" onMouseEnter={start} onMouseLeave={stop} onFocus={start} onBlur={stop}>{images.map((image,index) => <img key={image} className={index === active ? 'active' : ''} src={image} alt={index === 0 ? name : ''} loading={index === 0 ? 'lazy' : 'eager'} onError={(event) => { event.currentTarget.hidden=true; if (index === active) setActive((index + 1) % Math.max(images.length,1)) }}/>) }{images.length > 1 && <span className="product-image-counter">{String(active + 1).padStart(2,'0')} / {String(images.length).padStart(2,'0')}</span>}</div>
}

function ProductCollection({ home=false, initialCategory='all' }) {
  const { t, products, language,categories } = useSite()
  const validCategory=initialCategory==='all'?'all':categoryId(initialCategory)
  const [category,setCategory]=useState(validCategory)
  const [query,setQuery]=useState('')
  useEffect(()=>setCategory(validCategory),[validCategory])
  const filtered=products.filter((product) => {
    const itemCategory=productCategory(product)
    const searchable=[product.name_ar,product.name_en,product.name_he,product.description_ar,product.description_en].filter(Boolean).join(' ').toLowerCase()
    return (category === 'all' || itemCategory === category) && searchable.includes(query.trim().toLowerCase())
  })
  return <><div className="collection-head"><SectionHeading eyebrow={t('collection')} title={t('collectionTitle')} text={t('collectionText')}/><div className="collection-controls"><div className="category-tabs" role="tablist" aria-label={t('filter')}>{[{id:'all',name_ar:t('all'),name_en:t('all'),name_he:t('all')},...categories].map(item=><button key={item.id} className={category===item.id?'active':''} onClick={()=>setCategory(item.id)}>{localized(item,'name',language)}</button>)}</div><label className="search-box"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('catalogSearch')}/></label></div></div><div className="collection-meta"><span>{filtered.length} {t('products')}</span><i/></div>{filtered.length ? <div className="product-grid">{filtered.map((product,index) => <ProductCard key={product.slug} product={product} index={index} language={language}/>)}</div> : <div className="empty product-empty">{t('noProducts')}</div>}{home && <div className="center"><Link to="/products" className="text-link">{t('shopNow')}<ArrowRight size={17}/></Link></div>}</>
}

function Catalog() {
  const { category }=useParams()
  return <section className="section catalog"><ProductCollection initialCategory={category||'all'}/></section>
}

const partTransforms = {
  rim: { position:[0,0,.028], rotation:[0,Math.PI / 2,0] },
  disc: { position:[0,0,-.04], rotation:[0,0,0] },
  caliper: { position:[0,0,-.015], rotation:[0,0,0] },
  hub: { position:[0,0,-.006], rotation:[0,0,0] },
  stand: { position:[0,0,-.045], rotation:[Math.PI / 2,0,0], outerRotation:[0,Math.PI,0], finalRotation:[0,0,Math.PI], ultimateRotation:[0,Math.PI,0] },
}

const partFinish = {
  rim: { metalness:.72, roughness:.18 }, disc:{ metalness:.86, roughness:.3 }, caliper:{ metalness:.42, roughness:.2 }, hub:{ metalness:.55, roughness:.2 }, stand:{ metalness:.22, roughness:.38 },
}

function ModelPart({ part, url, color }) {
  const { scene } = useGLTF(url)
  const clone = useMemo(() => {
    const value = scene.clone(true)
    value.traverse((child) => { if (child.isMesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      const finish = partFinish[part] || { metalness:.2, roughness:.35 }
      const prepared = materials.map((material) => { const next=material.clone(); next.color.set(color); next.metalness=finish.metalness; next.roughness=finish.roughness; next.envMapIntensity=1.65; next.needsUpdate=true; return next })
      child.material = Array.isArray(child.material) ? prepared : prepared[0]
      child.castShadow = true; child.receiveShadow = true
    } })
    return value
  }, [scene, color, part])
  const transform = partTransforms[part] || { position:[0,0,0], rotation:[0,0,0] }
  return <group position={transform.position}><group rotation={transform.ultimateRotation || [0,0,0]}><group rotation={transform.finalRotation || [0,0,0]}><group rotation={transform.outerRotation || [0,0,0]}><group rotation={transform.rotation}><primitive object={clone} /></group></group></group></group></group>
}

function ProductLabel({ text, width=.15, height=.036, color='#f4f4ef', ...props }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=256
    const context = canvas.getContext('2d'); context.clearRect(0,0,1024,256)
    context.fillStyle=color; context.textAlign='center'; context.textBaseline='middle'; context.direction=/[\u0590-\u08ff]/.test(text) ? 'rtl' : 'ltr'
    const length=Math.max(text.length,1); const size=Math.max(72,Math.min(154,760/Math.max(length*.58,4)))
    context.font=`800 ${size}px Arial, sans-serif`; context.fillText(text,512,134,930)
    const value=new THREE.CanvasTexture(canvas); value.colorSpace=THREE.SRGBColorSpace; value.anisotropy=8; value.needsUpdate=true
    return value
  }, [text,color])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh {...props}><planeGeometry args={[width,height]}/><meshBasicMaterial map={texture} transparent toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-3}/></mesh>
}

function StandLabel({ text, color }) {
  const transform=partTransforms.stand
  return <group position={transform.position}><group rotation={transform.ultimateRotation}><group rotation={transform.finalRotation}><group rotation={transform.outerRotation}><group rotation={transform.rotation}><group position={[0,.103,-.18]} rotation={[-Math.PI/2,0,0]}><ProductLabel text={text} color={color} rotation={[0,0,Math.PI]} width={.098} height={.023}/></group></group></group></group></group></group>
}

function DisplayStand({ color, label }) {
  return <group>
    <mesh position={[0,-.153,-.055]} castShadow receiveShadow><boxGeometry args={[.055,.095,.045]}/><meshStandardMaterial color={color} roughness={.42} metalness={.12}/></mesh>
    <mesh position={[0,-.184,-.002]} castShadow receiveShadow><boxGeometry args={[.19,.052,.105]}/><meshStandardMaterial color={color} roughness={.38} metalness={.14}/></mesh>
    <mesh position={[0,-.184,.054]}><boxGeometry args={[.166,.039,.01]}/><meshStandardMaterial color="#111214" roughness={.34} metalness={.18}/></mesh>
    <ProductLabel text={label} position={[0,-.184,.060]} width={.15} height={.031}/>
  </group>
}

function CenterCap({ color, logo }) {
  const source=useTexture(logo.url)
  const texture = useMemo(() => {
    const value=source.clone(); value.colorSpace=THREE.SRGBColorSpace; value.wrapS=THREE.ClampToEdgeWrapping; value.wrapT=THREE.ClampToEdgeWrapping
    value.repeat.set(logo.crop[2],logo.crop[3]); value.offset.set(logo.crop[0],logo.crop[1]); value.anisotropy=8; value.needsUpdate=true; return value
  }, [source,logo.url,logo.crop])
  useEffect(() => () => texture.dispose(), [texture])
  return <group><mesh position={[0,0,.008]} rotation={[Math.PI/2,0,0]} castShadow><cylinderGeometry args={[.022,.022,.008,64]}/><meshStandardMaterial color={color} metalness={.46} roughness={.24}/></mesh><mesh position={[0,0,.013]}><circleGeometry args={[.0195,64]}/><meshBasicMaterial map={texture} toneMapped={false}/></mesh></group>
}

function modelDetails(product) {
  if (product.slug?.includes('srt')) return { base:'SRT', caliper:'BREMBO', logo:{url:'/logos/srt.jpg',crop:[.15,.13,.67,.67]} }
  if (product.slug?.includes('porsche')) return { base:'PORSCHE GT3 RS', caliper:'PORSCHE', logo:{url:'/logos/porsche-rs.png',crop:[.05,0,.9,1]} }
  return { base:'BMW M3 CS', caliper:'M POWER', logo:{url:'/logos/bmw.jpg',crop:[0,0,1,1]} }
}

function ProductViewer({ product, partColors, baseText, caliperText, fields=[] }) {
  const textColors=viewerTextColors(fields,partColors)
  const details=modelDetails(product), capColor=partColors.hub || '#111214'
  return <div className="viewer"><Canvas shadows camera={{ position:[0,0,.98], fov:34 }} dpr={[1,2]} gl={{ antialias:true,alpha:true,powerPreference:'high-performance' }} onCreated={({gl}) => { gl.toneMapping=THREE.ACESFilmicToneMapping; gl.toneMappingExposure=1.04 }}>
    <ambientLight intensity={.24}/><spotLight position={[.65,.85,1.25]} angle={.52} penumbra={.72} intensity={4.8} color="#fff8e7" castShadow/><spotLight position={[-.7,.35,.65]} angle={.55} penumbra={1} intensity={1.25} color="#6be8db"/><directionalLight position={[.4,-.45,.8]} intensity={.9} color="#f5b900"/>
    <Suspense fallback={null}>
      <group scale={1.43} position={[0,.045,0]}>{Object.entries(product.model_parts || {}).map(([part,url]) => <ModelPart key={`${part}-${url}`} part={part} url={url} color={partColors[part] || '#444444'}/>) }<CenterCap color={capColor} logo={details.logo}/><StandLabel text={baseText || details.base} color={textColors.stand}/><ProductLabel text={caliperText || details.caliper} color={textColors.caliper} position={[-.092,0,-.011]} rotation={[0,0,Math.PI/2]} width={.13} height={.015}/></group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.34,0]} receiveShadow><planeGeometry args={[1.5,1.5]}/><meshStandardMaterial color="#060708" roughness={.72} metalness={.06}/></mesh>
      <Environment preset="studio"/><ContactShadows position={[0,-.335,0]} opacity={.55} scale={1.05} blur={.24} far={.45}/>
    </Suspense>
    <OrbitControls target={[0,-.025,0]} enablePan={false} enableDamping dampingFactor={.08} minDistance={.74} maxDistance={1.4} minPolarAngle={Math.PI*.3} maxPolarAngle={Math.PI*.7}/>
  </Canvas><div className="viewer-hint"><Rotate3D size={18}/><span>360°</span></div></div>
}

function ProductMediaGallery({ product, partColors={}, baseText='', caliperText='', fields=[] }) {
  const { t } = useSite()
  const images=(product.images || []).filter(Boolean), hasModel=Object.keys(product.model_parts || {}).length > 0
  const [mode,setMode]=useState(images.length ? 'photo' : '360'), [selected,setSelected]=useState(0)
  useEffect(() => { setMode((product.images || []).length ? 'photo' : '360'); setSelected(0) }, [product.slug])
  const choosePhoto=(index) => { setSelected(index); setMode('photo') }
return <div className="product-media-gallery"><div className="product-media-stage">{mode === '360' && hasModel ? <ProductViewer product={product} partColors={partColors} baseText={baseText} caliperText={caliperText} fields={fields}/> : <div className="product-detail-photo"><img src={images[selected]} alt={`${product.name_en} ${selected + 1}`}/><span className="photo-count"><Box size={16}/>{selected + 1} / {images.length}</span></div>}</div><div className="product-media-tabs">{hasModel && <button className={mode === '360' ? 'active model-tab' : 'model-tab'} onClick={() => setMode('360')}><Rotate3D size={19}/><span>{t('view360')}</span></button>}{images.map((image,index) => <button key={image} className={mode === 'photo' && selected === index ? 'active' : ''} onClick={() => choosePhoto(index)} aria-label={`${t('photo')} ${index + 1}`}><img src={image} alt=""/><span>{String(index + 1).padStart(2,'0')}</span></button>)}</div>{mode === '360' && <p className="drag-note"><Rotate3D size={17}/>{t('drag')}</p>}</div>
}

function initialPartColors(product) {
  if(product?.colors?.length)return Object.fromEntries((product.customizable_parts||['body']).map(part=>[part,product.colors[0].hex]))
  if (product?.slug === 'audi-rs3-black') return {rim:'#101114',disc:'#b9bcc2',caliper:'#df2029',stand:'#f4f4ef'}
  if (product?.slug === 'audi-rs3-mesh') return {rim:'#b9bcc2',disc:'#b9bcc2',caliper:'#78c850',stand:'#f4f4ef'}
  if (product?.slug === 'seat-cupra') return {rim:'#101114',disc:'#b9bcc2',caliper:'#78c850',stand:'#101114'}
  if (product?.slug === 'ferrari-wheel') return {rim:'#101114',disc:'#b9bcc2',caliper:'#f6bd00',stand:'#101114'}
  if (product?.slug?.includes('turbo')) return { airFilter:'#df2029', turboBody:'#b9bcc2', fan:'#101114', stand:'#101114' }
  if (product?.slug?.includes('bmw')) return { rim:'#f6bd00', disc:'#777c84', caliper:'#df2029', stand:'#101114', hub:'#101114' }
  if (product?.slug?.includes('srt')) return { rim:'#101114', disc:'#777c84', caliper:'#df2029', stand:'#101114', hub:'#101114' }
  return { rim:'#b9bcc2', disc:'#4b4f56', caliper:'#f6bd00', stand:'#101114', hub:'#101114' }
}

function ProductPage() {
  const { slug } = useParams()
  const { products, t, language,categories,cart,changeCart } = useSite()
  const product = products.find((p) => p.slug === slug)
  const [partColors, setPartColors] = useState({})
  const [fieldTexts,setFieldTexts]=useState({})
  const fields=configurationFields(categories.find(c=>c.id===categoryId(product?.category)),product)
  const configCopy=configurationCopy[language]||configurationCopy.en
  const [baseText, setBaseText] = useState('')
  const [caliperText, setCaliperText] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [showOrder, setShowOrder] = useState(false)
  const hasModel=Object.keys(product?.model_parts || {}).length > 0
  const isTurbo=product?.category === 'turbo' || product?.slug?.includes('turbo')
  const canCustomize=hasModel || isTurbo || product?.customizable_parts?.length > 0
  const hasCaliper=product?.customizable_parts?.includes('caliper')
  useEffect(() => {
    setPartColors({});setFieldTexts({}); setBaseText(''); setCaliperText(''); setQuantity(1); setShowOrder(false)
  }, [product?.slug])
  if (!product) return <section className="product-page"><Link to="/products">{t('back')}</Link><p>{t('noProducts')}</p></section>
  return <section className="product-page">
    <div className="product-visual">
      <div className="product-topline"><button className="back-button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/products')}><ArrowLeft size={17}/>{t('back')}</button><div className="breadcrumb"><Link to="/">{t('home')}</Link><span>/</span><Link to="/products">{t('products')}</Link><span>/</span><b>{localized(product,'name',language)}</b></div></div>
      <ProductMediaGallery product={product} fields={fields} partColors={{...initialPartColors(product),...partColors}} baseText={baseText} caliperText={caliperText}/>
    </div>
    <div className="product-config">
      <p className="eyebrow">{localized(categories.find(c=>c.id===productCategory(product)),'name',language)||t(product.category||'product')} / 3D PRINT</p><h1>{localized(product,'name',language)}</h1><p className="price">{formatProductPrice(product.price,language)}</p><p className="description">{localized(product,'description',language)}</p>
      {product.dimensions&&Object.values(product.dimensions).some(v=>v!=null)&&<p className="product-dimensions">{inventoryText(language).dimensions}: {['length','width','height'].map(k=>`${inventoryText(language)[k]} ${product.dimensions[k]??'—'}`).join(' · ')}</p>}
      {fields.length>0&&<><div className="config-panel"><h2>{t('customize')}</h2>{fields.filter(requiresColor).map(field=><ColorSelector key={field.key} part={field.key} label={fieldName(field,language)} palette={fieldPalette(product,field.key,field)} value={partColors[field.key]} onChange={hex=>setPartColors({...partColors,[field.key]:hex})}/>)}</div><div className="text-fields">{fields.filter(f=>f.textEnabled).map(field=><label key={field.key}>{fieldName(field,language)}<input required maxLength={field.key==='caliper'||field.key==='caliperText'?20:30} value={fieldTexts[field.key]||''} placeholder={field['placeholder_'+language]||configCopy.write} onChange={e=>{setFieldTexts({...fieldTexts,[field.key]:e.target.value});if(field.key==='stand'||field.key==='standText')setBaseText(e.target.value);if(field.key==='caliper'||field.key==='caliperText')setCaliperText(e.target.value)}}/></label>)}</div></>}
      <div className="order-bar"><div className="quantity"><span>{t('quantity')}</span><button onClick={()=>setQuantity(Math.max(1,quantity-1))}>−</button><b>{quantity}</b><button onClick={()=>setQuantity(Math.min(20,quantity+1))}>+</button></div><div className="cart-product-actions"><button className="button primary" onClick={()=>{if(fields.some(f=>(requiresColor(f)&&!partColors[f.key])||(f.textEnabled&&!fieldTexts[f.key]?.trim()))){showMessage(configCopy.required);return}setShowOrder(true)}}>{cartCopy(language).checkout}<ArrowRight size={18}/></button><button className="button outline" disabled={cart.length>=30} onClick={async()=>{if(fields.some(f=>(requiresColor(f)&&!partColors[f.key])||(f.textEnabled&&!fieldTexts[f.key]?.trim()))){await showMessage(configCopy.required);return}changeCart(current=>[...current,{id:crypto.randomUUID(),slug:product.slug,productId:product.id,quantity,parts:{...partColors},texts:{...fieldTexts}}]);await showMessage(cartCopy(language).added)}}><ShoppingBag size={18}/>{cartCopy(language).add}</button></div></div>
    </div>
    {showOrder && <OrderModal product={product} fields={fields} fieldTexts={fieldTexts} partColors={partColors} baseText={baseText} caliperText={caliperText} quantity={quantity} close={() => setShowOrder(false)}/>} 
  </section>
}

function ColorSelector({ part, value, onChange, palette,label }) {
  const { t, language } = useSite()
  const [open, setOpen] = useState(false)
  const options=Array.isArray(palette)?palette.map(c=>({id:c.hex,hex:c.hex,ar:c.name_ar,en:c.name_en,he:c.name_he})):[]
  const selected=value?options.find(c=>c.hex===value):null
  return <div className={open ? 'color-row open' : 'color-row'}><button type="button" className="color-row-head" onClick={() => setOpen(!open)}><span className="part-name"><i style={{background:value}}/>{label||(part==='body'?inventoryText(language).colors:t(part))}</span><span>{selected?.[language]||(configurationCopy[language]||configurationCopy.en).choose}<ChevronDown size={15}/></span></button>{open && <div className="swatches">{options.map((color) => <button type="button" key={color.id} className={value === color.hex ? 'swatch active' : 'swatch'} style={{'--swatch':color.hex}} title={color[language]} aria-label={color[language]} onClick={() => { onChange(color.hex); setOpen(false) }}>{value === color.hex && <Check size={14}/>}</button>)}</div>}</div>
}

function DeliveryLocationPicker() {
  const { t, language } = useSite()
  const mapElement=useRef(null), autocompleteElement=useRef(null), fallbackMapElement=useRef(null), mapInstance=useRef(null), markerInstance=useRef(null), geocoderInstance=useRef(null), fallbackMapInstance=useRef(null), fallbackMarkerInstance=useRef(null), fallbackUpdateRef=useRef(null), fallbackRequestId=useRef(0)
  const [address,setAddress]=useState(''), [coords,setCoords]=useState(null), [status,setStatus]=useState('loading'), [mapsReady,setMapsReady]=useState(false)
  const mapsUrl=coords ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : ''
  const lookupCurrentAddress=async (literal) => {
    const response=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${literal.lat}&longitude=${literal.lng}&localityLanguage=${encodeURIComponent(language)}`)
    if (!response.ok) throw new Error('reverse_lookup_failed')
    const value=await response.json()
    const parts=[value.locality,value.city,value.principalSubdivision,value.postcode,value.countryName].filter((item,index,list) => item && list.indexOf(item) === index)
    if (!parts.length) throw new Error('address_not_found')
    setAddress(parts.join('، '))
  }
  const updateFallbackPosition=async (position, isCurrentDeviceLocation=false) => {
    const literal={lat:Number(position.lat),lng:Number(position.lng)}
    const requestId=++fallbackRequestId.current
    setCoords({...literal,placeId:''}); setStatus('addressLookup')
    try { const result=await api(`/api/reverse-geocode?lat=${literal.lat}&lng=${literal.lng}&lang=${encodeURIComponent(language)}`); if (requestId !== fallbackRequestId.current) return; setAddress(result.address); setCoords({...literal,placeId:result.placeId || ''}); setStatus('ready') }
    catch { if (requestId !== fallbackRequestId.current) return; if (isCurrentDeviceLocation) { try { await lookupCurrentAddress(literal); if (requestId === fallbackRequestId.current) setStatus('ready'); return } catch {} } setAddress(`${literal.lat.toFixed(6)}, ${literal.lng.toFixed(6)}`); setStatus('geocodeError') }
  }
  fallbackUpdateRef.current=updateFallbackPosition
  const updatePosition=async (position, suppliedAddress='', placeId='') => {
    const literal={ lat:Number(typeof position.lat === 'function' ? position.lat() : position.lat), lng:Number(typeof position.lng === 'function' ? position.lng() : position.lng) }
    setCoords({ ...literal, placeId }); markerInstance.current.position=literal; mapInstance.current.panTo(literal); mapInstance.current.setZoom(17)
    if (suppliedAddress) { setAddress(suppliedAddress); setStatus('ready'); return }
    try { const response=await geocoderInstance.current.geocode({ location:literal }); const result=response.results?.[0]; if (result) { setAddress(result.formatted_address); setCoords({ ...literal, placeId:result.place_id || placeId }); setStatus('ready') } else setStatus('geocodeError') } catch { setStatus('geocodeError') }
  }
  useEffect(() => {
    let cancelled=false, autocomplete
    loadGoogleMaps().then(async (google) => {
      if (cancelled) return
      const [{ Map },{ AdvancedMarkerElement },{ Geocoder },{ PlaceAutocompleteElement }]=await Promise.all([google.maps.importLibrary('maps'),google.maps.importLibrary('marker'),google.maps.importLibrary('geocoding'),google.maps.importLibrary('places')])
      if (cancelled) return
      const center={ lat:31.7683,lng:35.2137 }
      mapInstance.current=new Map(mapElement.current,{ center,zoom:8,mapId:'DEMO_MAP_ID',mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false })
      geocoderInstance.current=new Geocoder()
      markerInstance.current=new AdvancedMarkerElement({ map:mapInstance.current,position:center,gmpDraggable:true,title:t('deliveryPin') })
      markerInstance.current.addListener('dragend',() => { const position=markerInstance.current.position; updatePosition({lat:position.lat,lng:position.lng}) })
      mapInstance.current.addListener('click',(event) => updatePosition({lat:event.latLng.lat(),lng:event.latLng.lng()}))
      autocomplete=new PlaceAutocompleteElement({ placeholder:t('searchAddress'),requestedLanguage:language })
      autocompleteElement.current.replaceChildren(autocomplete)
      autocomplete.addEventListener('gmp-select',async ({ placePrediction }) => { const place=placePrediction.toPlace(); await place.fetchFields({fields:['formattedAddress','location','id']}); if (place.location) updatePosition({lat:place.location.lat(),lng:place.location.lng()},place.formattedAddress || '',place.id || '') })
      setMapsReady(true); setStatus('ready')
    }).catch(() => setStatus('manual'))
    return () => { cancelled=true; autocomplete?.remove() }
  },[language])
  useEffect(() => {
    if (mapsReady || !coords || !fallbackMapElement.current || fallbackMapInstance.current) return
    const map=L.map(fallbackMapElement.current,{zoomControl:true,attributionControl:true}).setView([coords.lat,coords.lng],17)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map)
    const icon=L.divIcon({className:'delivery-leaflet-marker',html:'<span></span>',iconSize:[34,46],iconAnchor:[17,44]})
    const marker=L.marker([coords.lat,coords.lng],{draggable:true,icon,title:t('deliveryPin')}).addTo(map)
    marker.on('dragend',() => { const point=marker.getLatLng(); fallbackUpdateRef.current({lat:point.lat,lng:point.lng}) })
    map.on('click',(event) => { marker.setLatLng(event.latlng); fallbackUpdateRef.current({lat:event.latlng.lat,lng:event.latlng.lng}) })
    fallbackMapInstance.current=map; fallbackMarkerInstance.current=marker
    setTimeout(() => map.invalidateSize(),0)
    return () => { map.remove(); fallbackMapInstance.current=null; fallbackMarkerInstance.current=null }
  },[mapsReady,Boolean(coords),language])
  useEffect(() => { if (mapsReady || !coords || !fallbackMapInstance.current || !fallbackMarkerInstance.current) return; const point=[coords.lat,coords.lng]; fallbackMarkerInstance.current.setLatLng(point); fallbackMapInstance.current.panTo(point) },[mapsReady,coords?.lat,coords?.lng])
  const useCurrentLocation=() => {
    if (!navigator.geolocation) return setStatus('locationUnsupported')
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(async ({coords:position}) => { const literal={lat:position.latitude,lng:position.longitude}; if (mapsReady) await updatePosition(literal); else await updateFallbackPosition(literal,true) },() => setStatus('locationDenied'),{enableHighAccuracy:true,timeout:12000,maximumAge:60000})
  }
  return <div className="delivery-location full"><div className="delivery-heading"><div><b>{t('deliveryLocation')}</b><small>{t('deliveryLocationHelp')}</small></div><button type="button" onClick={useCurrentLocation} className="locate-button" disabled={status === 'loading' || status === 'locating' || status === 'addressLookup'}><LocateFixed size={17}/>{status === 'locating' || status === 'addressLookup' ? t('locating') : t('useMyLocation')}</button></div><div ref={autocompleteElement} className={`google-autocomplete${mapsReady ? '' : ' pending'}`}/><label>{t('confirmedAddress')}<input name="deliveryAddress" value={address} onChange={(event) => setAddress(event.target.value)} required minLength={5} placeholder={t('manualAddress')}/></label><input type="hidden" name="deliveryLat" value={coords?.lat ?? ''} readOnly/><input type="hidden" name="deliveryLng" value={coords?.lng ?? ''} readOnly/><input type="hidden" name="deliveryPlaceId" value={coords?.placeId ?? ''} readOnly/><div className={`delivery-map${mapsReady ? '' : ' pending'}`} ref={mapElement}/>{!mapsReady && coords && <div className="delivery-map fallback-map" ref={fallbackMapElement}/>}<div className="location-feedback"><div className={`location-status ${status}`}><MapPin size={15}/><span>{status === 'manual' ? t('mapsNeedsKey') : status === 'locationDenied' ? t('locationDenied') : status === 'locationUnsupported' ? t('locationUnsupported') : status === 'addressLookup' ? t('addressLookup') : status === 'geocodeError' ? t('geocodeError') : coords ? t('pinConfirmed') : t('pinInstruction')}</span></div>{mapsUrl && <a className="open-map-button" href={mapsUrl} target="_blank" rel="noreferrer"><MapPin size={16}/>{t('openInMaps')}</a>}</div>{!mapsReady && coords && <small className="location-provider">{t('locationProvider')}</small>}</div>
}

function CustomerFields() {
  const { t } = useSite()
  return <><div className="form-grid"><label>{t('name')}<input name="customerName" required minLength={2}/></label><label>{t('phone')}<div className="phone-row"><input name="countryCode" required defaultValue="+972" aria-label={t('code')}/><input name="phone" required inputMode="tel"/></div></label><label>{t('country')}<input name="country" required/></label><DeliveryLocationPicker/><label className="full">{t('notes')}<textarea name="notes" rows="3" maxLength={1500}/></label></div></>
}

function OrderModal({ product,fields,fieldTexts, partColors, baseText, caliperText, quantity, close }) {
  const { t,language } = useSite()
  const [state, setState] = useState({ status:'idle', id:'', fields:[] })
  const submit = async (event) => {
    event.preventDefault(); setState({ status:'loading', id:'', fields:[] })
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const allowedParts=new Set(fields.filter(requiresColor).map(f=>f.key))
    const orderParts=Object.fromEntries(Object.entries(partColors).filter(([part,color]) => allowedParts.has(part) && /^#[0-9a-f]{6}$/i.test(color)))
    const defaults=product.default_texts || { base:'',caliper:'' }
    try { const result = await api('/api/orders',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,productId:product.id,quantity,texts:fieldTexts,baseText:baseText.trim(),caliperText:caliperText.trim(),parts:orderParts})}); setState({status:'success',id:result.displayId||result.id,fields:[]}) } catch (error) { setState({status:'error',id:'',fields:error.payload?.issues?.map((issue) => issue.field).filter(Boolean) || []}) }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className="modal"><button className="modal-close" onClick={close}><X/></button>{state.status === 'success' ? <div className="success-state"><div className="success-icon"><Check/></div><h2>{t('success')}</h2><p>{t('successText')}</p><b>{state.id}</b><button className="button primary" onClick={close}>{t('products')}</button></div> : <form noValidate onSubmit={submit}><p className="eyebrow">{product.name_en}</p><h2>{t('yourDetails')}</h2><CustomerFields/><ProductTermsNotice/>{state.status === 'error' && <p className="form-error">{t('error')}{state.fields.length > 0 && <small>{t('invalidFields')}: {state.fields.map((field) => t(field)).join('، ')}</small>}</p>}<button disabled={state.status === 'loading'} className="button primary wide">{state.status === 'loading' ? t('sending') : cartCopy(language).checkout}</button></form>}</div></div>
}


function CartPage(){
 const {cart,changeCart,checkoutKey,products,categories,language,t}=useSite(),c=cartCopy(language)
 const [editor,setEditor]=useState(null),[checkout,setCheckout]=useState(false),[busy,setBusy]=useState(false)
 const [result,setResult]=useState(null),[error,setError]=useState('')
 const productFor=item=>products.find(p=>p.slug===item.slug)
 const submit=async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{const data=Object.fromEntries(new FormData(e.currentTarget));const response=await api('/api/cart/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({checkoutId:checkoutKey,customer:data,items:cart.map(cartPayload)})});setResult(response.orders);changeCart([]);setCheckout(false)}catch{setError(c.failed)}finally{setBusy(false)}}
 const remove=async id=>{if(await askConfirmation(c.confirm))changeCart(items=>items.filter(x=>x.id!==id))}
 const total=cart.reduce((sum,item)=>sum+Number(productFor(item)?.price||0)*item.quantity,0)
 return <section className="cart-page"><p className="eyebrow">REVTROVE / CART</p><h1>{c.title}</h1>{result&&<div className="success-state"><Check/><h2>{t('success')}</h2><p>{result.map(x=>x.displayId).join(' · ')}</p></div>}{!cart.length?<div className="empty"><p>{c.empty}</p><Link className="button primary" to="/products">{t('products')}</Link></div>:<><div className="cart-items">{cart.map(item=>{const product=productFor(item);const fields=configurationFields(categories.find(x=>x.id===categoryId(product?.category)),product);return <article key={item.id} className="cart-item"><img src={product?.images?.[0]} alt=""/><div><h2>{product?localized(product,'name',language):item.slug}</h2><div className="cart-selections">{fields.map(f=><span key={f.key}>{fieldName(f,language)}: {requiresColor(f)?(fieldPalette(product,f.key,f).find(x=>x.hex===item.parts[f.key])?.['name_'+language]||item.parts[f.key]||'—'):item.texts[f.key]||'—'}{requiresColor(f)&&f.textEnabled&&<span> · {item.texts[f.key]||'—'}</span>}</span>)}</div><b>{product?.price==null?formatProductPrice(null,language):'₪'+(Number(product.price)*item.quantity).toFixed(2)}</b><div className="cart-controls"><label>{t('quantity')}<input type="number" min="1" max="20" value={item.quantity} onChange={e=>{const quantity=Number(e.target.value);if(Number.isInteger(quantity)&&quantity>=1&&quantity<=20)changeCart(items=>items.map(x=>x.id===item.id?{...x,quantity}:x))}}/></label><button className="button outline" disabled={!product} onClick={()=>setEditor({...item,parts:{...item.parts},texts:{...item.texts}})}>{c.edit}</button><button className="button outline inventory-delete" onClick={()=>remove(item.id)}>{c.remove}</button></div>{!product&&<p>{c.unavailable}</p>}</div></article>})}</div><div className="cart-summary"><b>{c.total}: ₪{total.toFixed(2)}</b>{cart.some(x=>productFor(x)?.price==null)&&<small>{c.quote}</small>}<button className="button primary" disabled={cart.some(x=>!productFor(x))} onClick={()=>setCheckout(true)}>{c.checkout}<ArrowRight/></button></div></>}{editor&&(()=>{const product=productFor(editor),fields=configurationFields(categories.find(x=>x.id===categoryId(product?.category)),product);return <div className="modal-backdrop"><div className="modal cart-editor" role="dialog" aria-modal="true" aria-label={c.edit}><button className="modal-close" onClick={()=>setEditor(null)}><X/></button><h2>{c.edit}</h2>{fields.filter(requiresColor).map(f=><ColorSelector key={f.key} part={f.key} label={fieldName(f,language)} palette={fieldPalette(product,f.key,f)} value={editor.parts[f.key]} onChange={hex=>setEditor({...editor,parts:{...editor.parts,[f.key]:hex}})}/>)}{fields.filter(f=>f.textEnabled).map(f=><label key={f.key}>{fieldName(f,language)}<input value={editor.texts[f.key]||''} maxLength={f.key==='caliper'||f.key==='caliperText'?20:30} placeholder={f['placeholder_'+language]} onChange={e=>setEditor({...editor,texts:{...editor.texts,[f.key]:e.target.value}})}/></label>)}<button className="button primary" onClick={async()=>{if(fields.some(f=>(requiresColor(f)&&!editor.parts[f.key])||(f.textEnabled&&!editor.texts[f.key]?.trim()))){await showMessage(configurationCopy[language].required);return}const updated={...editor,parts:Object.fromEntries(fields.filter(requiresColor).map(f=>[f.key,editor.parts[f.key]])),texts:Object.fromEntries(fields.filter(f=>f.textEnabled).map(f=>[f.key,editor.texts[f.key].trim()]))};changeCart(items=>items.map(x=>x.id===editor.id?updated:x));setEditor(null)}}>{c.save}</button></div></div>})()}{checkout&&<div className="modal-backdrop"><div className="modal"><button className="modal-close" disabled={busy} onClick={()=>setCheckout(false)}><X/></button><form noValidate onSubmit={submit}><fieldset disabled={busy}><h2>{t('yourDetails')}</h2><CustomerFields/><ProductTermsNotice/>{error&&<p className="form-error">{error}</p>}<button className="button primary wide" disabled={busy}>{busy?t('sending'):c.checkout}</button></fieldset></form></div></div>}</section>
}

function CustomOrder() {
  const { t,language } = useSite()
  const [state, setState] = useState({status:'idle',id:''})
  const submit = async (event) => {
    event.preventDefault(); setState({status:'loading',id:''})
    const form=event.currentTarget,data=Object.fromEntries(new FormData(form));const referenceUploads=[]
    try {const files=new FormData(form).getAll('referenceImage').filter(file=>file.size>0);if(!files.length||files.length>3||files.some(f=>!f.size||f.size>8*1024*1024))throw Error('invalid_images');for(const file of files)referenceUploads.push(await uploadFile(file,'reference'));delete data.referenceImage;data.dimensions=Object.fromEntries(['length','width','height'].map(k=>[k,data[k]?Number(data[k]):null]));for(const k of ['length','width','height'])delete data[k];const result=await api('/api/custom-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,referenceUploads})});setState({status:'success',id:result.displayId||result.id});form.reset()}catch {await Promise.all(referenceUploads.map(x=>discardUpload(x).catch(()=>{})));setState({status:'error',id:''})}
  }
  return <section className="custom-page"><div className="custom-intro"><p className="eyebrow">CUSTOM / 3D</p><h1>{t('customTitle')}</h1><p>{t('customText')}</p><div className="custom-process"><div><span>01</span><b>{t('upload')}</b></div><div><span>02</span><b>{t('details')}</b></div><div><span>03</span><b>{t('contact')}</b></div></div></div><form noValidate className="custom-form" onSubmit={submit}><div className="custom-image-section"><b>{t('upload')}</b><small>JPG, PNG, WEBP · MAX 8 MiB / image</small><CustomImageInput/></div><label>{t('customName')}<input name="customName" required minLength={2}/></label><label>{t('partsDescription')}<textarea name="partsDescription" required minLength={5} rows="5"/></label><CustomMeasurements/><CustomerFields/><CustomOrderNotice/>{state.status === 'success' && <p className="form-success">{t('success')} — {state.id}</p>}{state.status === 'error' && <p className="form-error">{t('error')}</p>}<button disabled={state.status === 'loading'} className="button primary wide">{state.status === 'loading' ? t('sending') : cartCopy(language).checkout}</button></form></section>
}

function ContactSection() {
  const { t } = useSite()
  return <section className="contact-section" id="contact"><p className="eyebrow">CONTACT / REVTROVE</p><h2>{t('contactTitle')}</h2><div className="contact-links"><a href="tel:+972522538264"><Phone/><span>{t('call')}</span><b>052-253-8264</b></a><a href="https://instagram.com/revtrove" target="_blank" rel="noreferrer"><Instagram/><span>{t('instagram')}</span><b>@revtrove</b></a><a href="mailto:Rev.trove.911@gmail.com"><Mail/><span>{t('email')}</span><b>Rev.trove.911@gmail.com</b></a></div></section>
}

function ProductTermsNotice() {
  const { t } = useSite()
  return <aside className="product-notice"><b>{t('productDisclaimerTitle')}</b><p>{t('visualDisclaimer')}</p><ul><li>{t('productionNotice')}</li><li>{t('whatsappConfirm')}</li><li>{t('returnsNotice')}</li></ul></aside>
}

function PolicyPage({ privacy=false }) {
  const { t } = useSite()
  const sections=privacy ? [['privacyDataTitle','privacyDataText'],['privacyUseTitle','privacyUseText'],['privacySharingTitle','privacySharingText'],['privacySecurityTitle','privacySecurityText'],['privacyContactTitle','privacyContactText']] : [['returnsTitle','returnsText'],['productionTitle','productionText'],['confirmationTitle','confirmationText'],['visualPolicyTitle','visualDisclaimer']]
  return <section className="policy-page"><p className="eyebrow">REVTROVE / {privacy ? 'PRIVACY' : 'POLICY'}</p><h1>{t(privacy ? 'privacyTitle' : 'policiesTitle')}</h1><p className="policy-intro">{t(privacy ? 'privacyIntro' : 'policiesIntro')}</p><div className="policy-sections">{sections.map(([title,text],index) => <article key={title}><span>{String(index + 1).padStart(2,'0')}</span><div><h2>{t(title)}</h2><p>{t(text)}</p></div></article>)}</div><div className="policy-contact"><b>REVTROVE</b><a href="https://wa.me/972522538264" target="_blank" rel="noreferrer">052-253-8264</a><a href="mailto:Rev.trove.911@gmail.com">Rev.trove.911@gmail.com</a></div></section>
}

function Footer() {
  const { t } = useSite()
  return <footer><Brand/><div className="footer-center"><p>© {new Date().getFullYear()} Revtrove. {t('rights')}</p><nav><Link to="/policies">{t('policies')}</Link><Link to="/privacy">{t('privacy')}</Link></nav></div><p>{t('builtWith')} <a href="https://oh-tech.com" target="_blank" rel="noreferrer">O&amp;H Tech</a></p></footer>
}

function AdminApp() {
  const { t } = useSite()
  const [token,setToken]=useState(()=>{if(new URLSearchParams(window.location.search).has('resetToken')){clearAdminSession();return ''}return readAdminSession()})
  const logout=()=>{clearAdminSession();setToken('')}
  useEffect(()=>{
    if(!token)return
    const check=()=>{if(tokenExpiry(token)<=Date.now()||readAdminSession()!==token)logout()}
    const timer=setTimeout(check,Math.max(0,tokenExpiry(token)-Date.now()))
    window.addEventListener('focus',check);window.addEventListener('storage',check)
    return ()=>{clearTimeout(timer);window.removeEventListener('focus',check);window.removeEventListener('storage',check)}
  },[token])
  if (!token) return <AdminLogin onLogin={(value,remember) => {saveAdminSession(value,remember);setToken(value)}}/>
  return <AdminDashboard token={token} logout={logout} t={t}/>
}

function AdminLogin({ onLogin }) {
  const { t, language, setLanguage } = useSite()
  const [error,setError] = useState(false)
  const [languageOpen,setLanguageOpen] = useState(false)
  const [recovery,setRecovery]=useState(()=>new URLSearchParams(window.location.search).has('resetToken'))
  const [resetToken,setResetToken]=useState(()=>new URLSearchParams(window.location.search).get('resetToken')||'')
  const backToLogin=()=>{const url=new URL(window.location.href);url.searchParams.delete('resetToken');history.replaceState(null,'',url);setResetToken('');setRecovery(false)}
  const copy=recoveryCopy(language)
  const submit = async (event) => { event.preventDefault(); setError(false); const data=Object.fromEntries(new FormData(event.currentTarget)); try { data.rememberMe=data.rememberMe==='on'; const result=await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); onLogin(result.token,data.rememberMe) } catch { setError(true) } }
  if(recovery)return <PasswordRecovery language={language} token={resetToken} onBack={backToLogin}/>
  return <div className="admin-login"><div className="login-card"><Brand/><div className="lock"><LockKeyhole/></div><h1>{t('login')}</h1><form noValidate data-validation-message={loginErrorMessage(language)} onSubmit={submit}><label>{t('email')}<input type="email" name="email" required/></label><label>{t('password')}<input type="password" name="password" required minLength={8}/></label><label className="remember-admin"><input type="checkbox" name="rememberMe"/>{copy.remember}</label>{error && <p className="form-error">{loginErrorMessage(language)}</p>}<button className="button primary wide">{t('loginButton')}</button></form><button type="button" className="button ghost forgot-password" onClick={()=>setRecovery(true)}>{copy.forgot}</button><div className="language-menu admin-language-menu"><button type="button" className="header-icon" onClick={() => setLanguageOpen(!languageOpen)} aria-label="Language" aria-expanded={languageOpen}><Globe2/></button>{languageOpen && <div className="language-popover">{[['ar','العربية'],['en','English'],['he','עברית']].map(([code,label]) => <button type="button" key={code} lang={code} dir={code === 'en' ? 'ltr' : 'rtl'} className={language === code ? 'active' : ''} onClick={() => { setLanguage(code); setLanguageOpen(false) }}>{label}{language === code && <Check size={15}/>}</button>)}</div>}</div></div></div>
}

function AdminDashboard({ token, logout, t }) {
  const { language,categories,refreshCatalog,products }=useSite()
  const inventory=inventoryText(language)
  const copy=adminText[language] || adminText.en
  const [sidebarOpen,setSidebarOpen]=useState(false)
  const [tab,setTab]=useState('orders'),[orders,setOrders]=useState([]),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false)
  const headers={Authorization:`Bearer ${token}`}
  const load=()=>{setLoading(true);setLoadError(false);const requestedStatus=ordersFilterStatus(tab,status);api(`/api/admin/orders?status=${encodeURIComponent(requestedStatus)}&search=${encodeURIComponent(search)}`,{headers}).then(setOrders).catch((error)=>{if(error.status===401)logout();else setLoadError(true)}).finally(()=>setLoading(false))}
  useEffect(()=>{if(tab==='products'||tab==='settings'||tab==='colors'||tab==='categories'||tab==='details')return;const timeout=setTimeout(load,250);return()=>clearTimeout(timeout)},[search,status,tab])
  const statusName=(value)=>value==='quoted'?copy.waiting:value==='ready'?copy.readyWork:value==='awaiting_pickup'?copy.awaitingPickup:value==='archived'?copy.archive:t(value)
  const chooseTab=(value)=>{setSidebarOpen(false);setTab(value);setSearch('');if(value==='orders')setStatus('all')}
  const listPage=tab==='orders'||tab==='archive'
  return <div className="admin-shell admin-drawer-layout"><AdminSidebar open={sidebarOpen} onChange={setSidebarOpen} language={language}><Brand/><nav><button className={tab==='orders'?'active':''} onClick={()=>chooseTab('orders')}><PackageCheck/>{t('orders')}</button><button className={tab==='archive'?'active':''} onClick={()=>chooseTab('archive')}><Archive/>{copy.archive}</button><button className={tab==='products'?'active':''} onClick={()=>chooseTab('products')}><Box/>{inventory.products}</button><button className={tab==='categories'?'active':''} onClick={()=>chooseTab('categories')}><Box/>{language==='ar'?'الفئات':language==='he'?'קטגוריות':'Categories'}</button><button className={tab==='details'?'active':''} onClick={()=>chooseTab('details')}><Box/>{detailTitle(language)}</button><button className={tab==='colors'?'active':''} onClick={()=>chooseTab('colors')}><Palette/>{colorPageText(language).title}</button><button className={tab==='settings'?'active':''} onClick={()=>chooseTab('settings')}><LockKeyhole/>{inventory.settings}</button></nav><button className="logout" onClick={logout}>{t('logout')}</button></AdminSidebar><main className="admin-main"><div className="admin-top"><div><p className="eyebrow">REVTROVE / CONTROL</p><h1>{tab==='orders'?t('orders'):tab==='archive'?copy.archive:tab==='products'?inventory.products:tab==='colors'?colorPageText(language).title:tab==='details'?detailTitle(language):tab==='categories'?(language==='ar'?'الفئات':language==='he'?'קטגוריות':'Categories'):inventory.settings}</h1></div><span className="secure-badge"><ShieldCheck size={16}/>SECURE SESSION</span></div>{listPage?<><div className={`admin-filters${tab==='archive'?' archive-filters':''}`}><div className="search-box"><Search/><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder={t('search')}/></div>{tab==='orders'&&<select value={status} onChange={(event)=>setStatus(event.target.value)}>{['all','unprepared','prepared','received'].map((value)=><option key={value} value={value}>{({ar:{all:'الكل',unprepared:'جديد',prepared:'جاهز',received:'تم الاستلام'},en:{all:'All',unprepared:'New',prepared:'Ready',received:'Received'},he:{all:'הכל',unprepared:'חדש',prepared:'מוכן',received:'נאסף'}})[language]?.[value]||value}</option>)}</select>}</div><div className="orders-grid">{loadError&&<button className="form-error" onClick={load}>{language==='ar'?'تعذر تحميل الطلبات — أعد المحاولة':language==='he'?'טעינת ההזמנות נכשלה — נסה שוב':'Orders could not be loaded — retry'}</button>}{!loading&&!loadError&&!orders.length&&<div className="empty">{t('noOrders')}</div>}{orders.map((order)=><OrderCard key={order.public_id} order={order} token={token} refresh={load}/>)}</div></>:(tab==='products'?<AdminInventory token={token} language={language} categories={categories} refreshCatalog={refreshCatalog} logout={logout} storeProducts={products}/>:tab==='categories'?<AdminCategories token={token} language={language} categories={categories} refreshCatalog={refreshCatalog} logout={logout}/>:tab==='details'?<AdminDetails token={token} language={language} refreshCatalog={refreshCatalog}/>:tab==='colors'?<AdminColors token={token} language={language} categories={categories} refreshCatalog={refreshCatalog}/>:<><MeasurementSettings token={token} language={language}/><AdminSettings token={token} language={language} logout={logout}/></>)}</main></div>
}

function LegacyAdminDashboard({ token, logout, t }) {
  const { language }=useSite()
  const copy=adminText[language] || adminText.en
  const [tab,setTab] = useState('orders'), [orders,setOrders] = useState([]), [search,setSearch] = useState(''), [status,setStatus] = useState('all'), [loading,setLoading] = useState(true)
  const headers = { Authorization:`Bearer ${token}` }
  const load = () => { setLoading(true); api(`/api/admin/orders?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`,{headers}).then(setOrders).catch(() => logout()).finally(() => setLoading(false)) }
  useEffect(() => { const timeout=setTimeout(load,250); return () => clearTimeout(timeout) },[search,status])
  const statusName=(value) => value === 'quoted' ? copy.waiting : value === 'ready' ? copy.readyWork : t(value)
  return <div className="admin-shell"><aside><Brand/><nav><button className={tab==='orders'?'active':''} onClick={() => setTab('orders')}><PackageCheck/>{t('orders')}</button><button className={tab==='products'?'active':''} onClick={() => setTab('products')}><Plus/>{t('addProduct')}</button></nav><button className="logout" onClick={logout}>{t('logout')}</button></aside><main className="admin-main"><div className="admin-top"><div><p className="eyebrow">REVTROVE / CONTROL</p><h1>{tab==='orders'?t('orders'):t('addProduct')}</h1></div><span className="secure-badge"><ShieldCheck size={16}/>SECURE SESSION</span></div>{tab==='orders' ? <><div className="admin-filters"><div className="search-box"><Search/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')}/></div><select value={status} onChange={(e) => setStatus(e.target.value)}>{['all','new','contacted','quoted','in_production','ready','completed','cancelled'].map((s) => <option key={s} value={s}>{statusName(s)}</option>)}</select></div><div className="orders-grid">{!loading && !orders.length && <div className="empty">{t('noOrders')}</div>}{orders.map((order) => <OrderCard key={order.public_id} order={order} token={token} refresh={load}/>)}</div></> : <AddProduct token={token}/>}</main></div>
}

function OrderCard({order,token,refresh}){
  const {language}=useSite()
  const copy=adminText[language]||adminText.en
  const [saving,setSaving]=useState(false)
  const advance=async(status)=>{setSaving(true);try{await api(`/api/admin/orders/${order.public_id}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({status})});await refresh()}finally{setSaving(false)}}
  const canMarkReady=!['awaiting_pickup','archived','cancelled','completed'].includes(order.status)
  return <div className={`order-card-wrapper status-${order.status}`}><LegacyOrderCard order={order} token={token} refresh={refresh}/>{order.status==='archived'&&<ArchiveRetention order={order} language={language}/>}{canMarkReady&&<button disabled={saving} className="order-flow-button ready-flow" onClick={()=>advance('awaiting_pickup')}><Check size={17}/>{copy.readyButton}</button>}{order.status==='awaiting_pickup'&&<button disabled={saving} className="order-flow-button received-flow" onClick={()=>advance('archived')}><Archive size={17}/>{copy.receivedButton}</button>}</div>
}

function LegacyOrderCard({ order, token, refresh }) {
  const { t,language,products,categories,colorCatalog } = useSite()
  const colors=colorCatalog.map(c=>({hex:c.hex,ar:c.name_ar,en:c.name_en,he:c.name_he}))
  const copy=adminText[language] || adminText.en
  const [open,setOpen]=useState(false), [printOpen,setPrintOpen]=useState(false), [saving,setSaving]=useState(false)
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:800px)').matches)
  const detailsId=`order-details-${order.public_id}`
  useEffect(()=>{const media=window.matchMedia('(max-width:800px)');const update=()=>setCompact(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
  useEffect(()=>{
    if(!open||compact)return
    const unlock=lockPageScroll(),previous=document.activeElement
    document.getElementById(detailsId)?.querySelector('.order-detail-close')?.focus()
    const keyboard=event=>{if(event.key==='Escape'&&!printOpen)setOpen(false)}
    document.addEventListener('keydown',keyboard)
    return()=>{unlock();document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus()}
  },[open,compact,printOpen,detailsId])
  const originalProduct=products.find(p=>p.slug===order.details?.productSlug)
  const originalFields=originalProduct?configurationFields(categories.find(c=>c.id===categoryId(originalProduct.category)),originalProduct):[]
  const savedParts=order.details?.parts||[]
  const missingParts=order.details?.texts?[]:originalFields.filter(f=>requiresColor(f)&&!savedParts.some(p=>p.label===f.key)).map(f=>{const color=originalProduct.field_options?.[f.key]?.defaultColor||initialPartColors(originalProduct)[f.key];return color?{label:f.key,color,labels:{ar:f.label_ar,en:f.label_en,he:f.label_he},inferredDefault:true}:null}).filter(Boolean)
  const parts=[...savedParts,...missingParts]
  const location=order.details?.deliveryLocation
  const mapsUrl=location ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : ''
  const defaults=order.details?.defaultTexts || {base:'',caliper:''}
  const baseText=order.details?.texts?(order.details.baseText||'—'):(order.details?.baseText || originalProduct?.field_options?.stand?.defaultText || defaults.base || '—')
  const caliperText=order.details?.texts?(order.details.caliperText||'—'):(order.details?.caliperText || originalProduct?.field_options?.caliper?.defaultText || defaults.caliper || '—')
  const colorName=(hex) => { const matched=closestPaletteColor(hex,colors); return matched?.[language] || matched?.en || hex }
  const phone=`${String(order.country_code || '').replace(/\D/g,'')}${String(order.phone || '').replace(/\D/g,'').replace(/^0/,'')}`
  const statusName=order.status === 'quoted' ? copy.waiting : order.status === 'ready' ? copy.readyWork : order.status === 'awaiting_pickup' ? copy.awaitingPickup : order.status === 'archived' ? copy.archive : t(order.status)
  const contactUrl=`https://wa.me/${phone}?text=${encodeURIComponent(`${order.customer_name} — REVTROVE ${order.public_id}`)}`
  const patchOrder=async(body)=>{setSaving(true);try{await api(`/api/admin/orders/${order.public_id}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});await refresh()}finally{setSaving(false)}}
  const sendQuote=async(event)=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));const quotedPrice=Number(data.quotedPrice), productionEta=String(data.productionEta || '');if(!quotedPrice || !/^\d+$/.test(productionEta))return;const popup=window.open('','_blank');if(!popup){showMessage(language==='ar'?'يرجى السماح بفتح نافذة واتساب ثم المحاولة مجددًا':language==='he'?'יש לאפשר חלון WhatsApp ולנסות שוב':'Please allow the WhatsApp popup and try again');return}try{await patchOrder({status:'quoted',quotedPrice,productionEta});const message=language === 'he' ? `שלום ${order.customer_name}, הצעת מחיר להזמנה ${order.public_id}: ₪${quotedPrice}. זמן הכנה: ${productionEta} ימים. נא לאשר את ההזמנה.` : language === 'en' ? `Hello ${order.customer_name}, your Revtrove quote for ${order.public_id} is ₪${quotedPrice}. Production time: ${productionEta} days. Please confirm the order.` : `مرحباً ${order.customer_name}، عرض سعر طلبك ${order.public_id} من Revtrove هو ₪${quotedPrice}. مدة التجهيز ${productionEta} يوم. الرجاء تأكيد الطلب.`;if(popup) popup.location.href=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}catch(error){popup?.close();throw error}}
  const print=async(lang)=>{setPrintOpen(false);await printOrder({...order,details:{...order.details,parts,baseText:baseText==='—'?'':baseText,caliperText:caliperText==='—'?'':caliperText}},lang,{defaults:{},colors,labels:dictionaries[lang]})}
return <><article className={`order-card status-${order.status}`} onClick={event=>{if(shouldToggleOrder(event))setOpen(value=>!value)}}><div className="order-head"><div><span className="order-type">{t(order.type==='custom'?'customType':'standard')}</span><h3>{order.display_id||`ord${order.id}`}</h3></div><span className="status-pill">{statusName}</span></div>{order.type==='custom'&&(order.reference_images?.[0]||order.reference_image)&&<OrderReferenceImage path={order.reference_images?.[0]||order.reference_image} token={token}/>}<div className="customer compact-customer"><b>{order.customer_name}</b><a href={`tel:${order.country_code}${order.phone}`}>{order.phone}</a><span>{order.country} · {order.delivery_address}</span></div><div className="order-summary compact-summary"><b>{order.details?.productName || order.details?.customName}</b>{parts.slice(0,4).map((part)=><span className="chosen-color" key={part.label}><i style={{background:part.color}}/>{part.labels?.[language]||t(part.label==='body'?'colors':part.label)}: <strong>{(part.colorNames?.[language]||colorName(part.color))}{part.inferredDefault&&<small> · {(configurationCopy[language]||configurationCopy.en).inferred}</small>}</strong></span>)}</div><div className="order-actions"><button type="button" aria-expanded={open} aria-controls={detailsId} onClick={()=>setOpen(value=>!value)}>{open?copy.close:t('details')}<ChevronDown size={15} style={{transform:open?'rotate(180deg)':undefined}}/></button><a href={contactUrl} target="_blank" rel="noreferrer"><PhoneCall size={15}/>{copy.contactWhatsapp}</a><button onClick={()=>setPrintOpen(true)}><Printer size={16}/>{t('print')}</button></div></article>{open && <div className={compact?'order-inline-details':'order-detail-backdrop'} onMouseDown={(event)=>event.target===event.currentTarget&&setOpen(false)}><section id={detailsId} className="order-detail-modal order-compact-modal" role={compact?'region':'dialog'} aria-modal={compact?undefined:true} aria-label={`${copy.order} ${order.display_id||`ord${order.id}`}`}><button className="order-detail-close" onClick={()=>setOpen(false)} aria-label={copy.close}><X/></button><header><span>{t(order.type==='custom'?'customType':'standard')}</span><h2>{order.display_id||`ord${order.id}`}</h2><b className="status-pill">{statusName}</b></header><div className="order-compact-preview"><div className="order-preview-images">{order.type==='custom'?(order.reference_images||[order.reference_image].filter(Boolean)).map(path=><OrderReferenceImage key={path} path={path} token={token} alt={order.details?.customName||copy.order}/>):originalProduct?.images?.[0]?<OrderReferenceImage path={originalProduct.images[0]} token={token} alt={order.details?.productName||copy.order}/>:<span className="order-image-unavailable"><Box size={26}/></span>}</div><div className="order-selected-details"><b>{order.details?.productName || order.details?.customName}</b><small>{t('quantity')}: {order.details?.quantity || 1}</small>{parts.length>0&&<dl className="order-selected-colors">{parts.map(part=><div key={part.label}><dt>{part.labels?.[language]||t(part.label==='body'?'colors':part.label)}</dt><dd><i style={{background:part.color}}/>{part.colorNames?.[language]||colorName(part.color)}</dd></div>)}</dl>}<dl className="order-selected-texts">{baseText!=='—'&&<div><dt>{order.details?.textLabels?.standText?.[language]||order.details?.textLabels?.stand?.[language]||t('baseText')}</dt><dd>{baseText}</dd></div>}{caliperText!=='—'&&<div><dt>{order.details?.textLabels?.caliperText?.[language]||order.details?.textLabels?.caliper?.[language]||t('caliperText')}</dt><dd>{caliperText}</dd></div>}{Object.entries(order.details?.texts||{}).filter(([key,value])=>value&&!['stand','caliper','standText','caliperText'].includes(key)).map(([key,value])=><div key={key}><dt>{order.details?.textLabels?.[key]?.[language]||key}</dt><dd>{value}</dd></div>)}</dl></div></div><details className="order-extra-information"><summary>{copy.customer} · {t('notes')}</summary><div><b>{order.customer_name}</b><p><a href={`tel:${order.country_code}${order.phone}`}>{order.phone}</a></p><p>{order.country} · {order.delivery_address}</p>{mapsUrl&&<a className="order-map-link" href={mapsUrl} target="_blank" rel="noreferrer"><MapPin size={14}/>{t('openExactLocation')}</a>}{order.details?.partsDescription&&<p>{order.details.partsDescription}</p>}{order.notes&&<p>{t('notes')}: {order.notes}</p>}{order.details?.dimensions&&<p>{Object.entries(order.details.dimensions).filter(([,value])=>value!=null).map(([key,value])=>`${({length:'الطول / Length',width:'العرض / Width',height:'الارتفاع / Height'})[key]}: ${value} cm`).join(' · ')}</p>}</div></details>{order.type==='custom'&&(order.reference_images?.length||order.reference_image)&&<button className="button ghost order-print-images" onClick={()=>printReferenceImages(order,token)}><Printer size={16}/>{language==='ar'?'طباعة الصور':language==='he'?'הדפסת תמונות':'Print images'}</button>}{order.type==='custom'&&<div className="custom-order-workflow">{['new','contacted'].includes(order.status)&&<form noValidate onSubmit={sendQuote}><label>{copy.price}<input name="quotedPrice" type="number" min="1" step="0.01" defaultValue={order.quoted_price||''} required/></label><label>{copy.days}<div className="days-input"><input name="productionEta" type="number" inputMode="numeric" min="1" max="365" step="1" defaultValue={order.production_eta||''} required/><span>{copy.day}</span></div></label><button disabled={saving} className="button primary"><PhoneCall size={17}/>{copy.sendQuote}</button></form>}{order.status==='quoted'&&<button disabled={saving} className="button primary confirm-production" onClick={()=>patchOrder({status:'in_production',quotedPrice:Number(order.quoted_price),productionEta:String(order.production_eta||'')})}><Check size={18}/>{copy.confirmOrder}</button>}</div>}<footer className="order-detail-actions"><a className="button ghost" href={contactUrl} target="_blank" rel="noreferrer"><PhoneCall size={17}/>{copy.contactWhatsapp}</a><button className="button ghost" onClick={()=>setPrintOpen(true)}><Printer size={17}/>{copy.print}</button><button className="button ghost" onClick={()=>setOpen(false)}>{copy.close}</button></footer></section></div>}{printOpen&&<div className="print-language-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&setPrintOpen(false)}><div className="print-language-dialog" role="dialog" aria-modal="true"><Printer/><h3>{copy.choosePrint}</h3><button onClick={()=>print('ar')}>{copy.arabic}</button><button onClick={()=>print('en')}>{copy.english}</button><button onClick={()=>print('he')}>{copy.hebrew}</button><button className="cancel" onClick={()=>setPrintOpen(false)}>{copy.close}</button></div></div>}</>
}

function OrderReferenceImage({path,token,alt="Customer reference"}) {
  const [src,setSrc]=useState(path.startsWith('/api/files/')?'':path)
  useEffect(()=>{
    if(!path.startsWith('/api/files/')){setSrc(path);return}
    const controller=new AbortController()
    fetch(path+'?format=json',{headers:{Authorization:'Bearer '+token},signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('reference_unavailable');return response.json()}).then(value=>setSrc(value.url)).catch(()=>setSrc(''))
    return ()=>controller.abort()
  },[path,token])
  return src?<img className="order-reference" src={src} alt={alt}/>:null
}

function AddProduct({ token }) {
  const { t } = useSite(); const [message,setMessage]=useState('')
  const submit=async(event)=>{event.preventDefault();setMessage('');const form=event.currentTarget,data=Object.fromEntries(new FormData(form));const claims=[];try{if(data.image?.size){data.imageUpload=await uploadFile(data.image,'productImage',token);claims.push(data.imageUpload)}if(data.model?.size){data.modelUpload=await uploadFile(data.model,'productModel',token);claims.push(data.modelUpload)}delete data.image;delete data.model;await api('/api/admin/products',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(data)});form.reset();setMessage('✓')}catch{await Promise.all(claims.map(claim=>discardUpload(claim,token).catch(()=>{})));setMessage(t('error'))}}
  return <form noValidate className="add-product-form" onSubmit={submit}><div className="form-grid"><label>{t('productSlug')}<input name="slug" required pattern="[a-z0-9-]{3,120}" placeholder="bmw-m4-wheel"/></label><label>{t('price')}<input name="price" required type="number" min="0" step="0.01"/></label><label>{t('category')}<select name="category" defaultValue="wheel"><option value="wheel">{t('wheels')}</option><option value="turbo">{t('turbo')}</option><option value="shelves">{t('shelves')}</option><option value="keychains">{t('keychains')}</option></select></label><label>{t('productNameAr')}<input name="nameAr" required/></label><label>{t('productNameEn')}<input name="nameEn" required/></label><label>{t('productNameHe')}<input name="nameHe" required/></label><label>{t('image')}<input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label><label>{t('model')}<input name="model" type="file" accept=".glb,model/gltf-binary"/></label></div>{message && <p>{message}</p>}<button className="button primary">{t('saveProduct')}</button></form>
}

export default App







