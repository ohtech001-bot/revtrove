import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link, NavLink, Route, Routes, useParams } from './router'
import { ArrowLeft, ArrowRight, Box, Check, ChevronDown, Globe2, Instagram, LocateFixed, LockKeyhole, Mail, MapPin, Menu, PackageCheck, Palette, Phone, PhoneCall, Plus, Printer, Rotate3D, Search, ShieldCheck, ShoppingBag, Sparkles, Upload, X } from 'lucide-react'
import { dictionaries, rtlLanguages } from './i18n'
import AccessibilityTools from './AccessibilityTools'

const fallbackProducts = [
  { id:1, slug:'bmw-m3-cs', name_ar:'BMW M3 CS Wheel', name_en:'BMW M3 CS Wheel', name_he:'גלגל BMW M3 CS', description_ar:'مجسم فاخر مطبوع ثلاثي الأبعاد ومصقول يدويًا.', description_en:'A premium 3D-printed, hand-finished automotive model.', description_he:'דגם רכב איכותי בהדפסת תלת־ממד ובגימור ידני.', price:129, images:['/assets/bmw/4e141d69-0cc6-47e3-84bb-5343aa265525.jpg','/assets/bmw/d6c6e38b-861a-40d3-815e-9b502b4a362e.jpg','/assets/bmw/4f12cebe-f72c-4b4a-a233-e016a48942a6.jpg','/assets/bmw/b5f83159-03c7-411a-b6e4-0ca04a047432.jpg','/assets/bmw/e5b305cf-13c6-43e9-83f2-6ce19e234016.jpg'], model_parts:{ rim:'/models/bmw-rim.glb', disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb', hub:'/models/hub-cs.glb' }, customizable_parts:['rim','disc','caliper','stand','hub'] },
  { id:2, slug:'dodge-srt', name_ar:'Dodge SRT Wheel', name_en:'Dodge SRT Wheel', name_he:'גלגל Dodge SRT', description_ar:'مجسم SRT رياضي بتفاصيل دقيقة.', description_en:'A detailed SRT display wheel with a bold stance.', description_he:'דגם SRT ספורטיבי עם פרטים מדויקים.', price:119, images:['/assets/srt/76f7ea82-6eac-451c-9653-f3f16a770a6f.jpg','/assets/srt/e78f7d63-e0ec-49b2-bd87-ba743b461927.jpg','/assets/srt/bbde8eee-44a1-49d2-bcdc-faece5d70e44.jpg'], model_parts:{ rim:'/models/srt-rim.glb', disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb' }, customizable_parts:['rim','disc','caliper','stand'] },
  { id:3, slug:'porsche-gt3rs', name_ar:'Porsche GT3 RS Wheel', name_en:'Porsche GT3 RS Wheel', name_he:'גלגל Porsche GT3 RS', description_ar:'قطعة مستوحاة من GT3 RS لعشاق بورشه.', description_en:'A GT3 RS-inspired collectible for Porsche enthusiasts.', description_he:'פריט בהשראת GT3 RS לאוהבי פורשה.', price:139, images:['/assets/porsche/24d3d0f8-fbef-474a-9fbb-845b245b9690.jpg','/assets/porsche/47cad8b1-7da3-4d9b-b133-9f581f9707bd.jpg','/assets/porsche/3657b30e-edc1-4ceb-845e-71099d41dcdd.jpg','/assets/porsche/e059cf1a-b77c-4dc3-9624-e78871b2b782.jpg'], model_parts:{ rim:'/models/bmw-rim.glb', disc:'/models/disc.glb', caliper:'/models/caliper.glb', stand:'/models/stand.glb' }, customizable_parts:['rim','disc','caliper','stand'] },
]

fallbackProducts.push({
  id:4, slug:'bmw-m-turbo', category:'turbo',
  name_ar:'مجسم تيربو BMW M', name_en:'BMW M Turbo Display', name_he:'דגם טורבו BMW M',
  description_ar:'مجسم تيربو مطبوع ثلاثي الأبعاد بتفاصيل دقيقة وفلتر ملوّن، قطعة عرض مميزة لعشاق السيارات.',
  description_en:'A detailed 3D-printed turbo display with a colored filter, made for automotive enthusiasts.',
  description_he:'דגם טורבו מודפס בתלת־ממד עם פרטים מדויקים ופילטר צבעוני לחובבי רכב.',
  price:149,
  images:['/assets/turbo/turbo-5.jpg','/assets/turbo/turbo-1.jpg','/assets/turbo/turbo-2.jpg','/assets/turbo/turbo-3.jpg','/assets/turbo/turbo-4.jpg'],
  model_parts:{}, customizable_parts:['airFilter','turboBody','fan','stand']
})

const colors = [
  { id:'light-gray', hex:'#b9bcc2', ar:'رمادي فاتح', en:'Light gray', he:'אפור בהיר' }, { id:'dark-gray', hex:'#4b4f56', ar:'رمادي غامق', en:'Dark gray', he:'אפור כהה' },
  { id:'light-blue', hex:'#42a5e8', ar:'ازرق فاتح', en:'Light blue', he:'כחול בהיר' }, { id:'dark-blue', hex:'#174db8', ar:'ازرق غامق', en:'Dark blue', he:'כחול כהה' },
  { id:'red', hex:'#df2029', ar:'احمر', en:'Red', he:'אדום' }, { id:'yellow', hex:'#f6bd00', ar:'اصفر', en:'Yellow', he:'צהוב' },
  { id:'black', hex:'#101114', ar:'اسود', en:'Black', he:'שחור' }, { id:'white', hex:'#f4f4ef', ar:'ابيض', en:'White', he:'לבן' },
  { id:'orange', hex:'#f36f21', ar:'برتقالي', en:'Orange', he:'כתום' }, { id:'light-green', hex:'#78c850', ar:'اخضر فاتح', en:'Light green', he:'ירוק בהיר' },
]

const SiteContext = createContext(null)
const useSite = () => useContext(SiteContext)
const localized = (item, field, language) => item?.[`${field}_${language}`] || item?.[`${field}_en`] || ''
const productCategory = (product) => {
  if (['turbo','shelves','keychains'].includes(product?.category)) return product.category
  return product?.slug?.includes('turbo') ? 'turbo' : 'wheels'
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
  const [language, setLanguage] = useState(localStorage.getItem('revtrove-language') || 'ar')
  const [products, setProducts] = useState(fallbackProducts)
  const direction = rtlLanguages.has(language) ? 'rtl' : 'ltr'
  const t = (key) => dictionaries[language][key] || dictionaries.en[key] || key
  useEffect(() => {
    document.documentElement.lang = language; document.documentElement.dir = direction; localStorage.setItem('revtrove-language', language)
  }, [language, direction])
  useEffect(() => { api('/api/products').then((data) => { if (!data?.length) return; const remoteSlugs=new Set(data.map((item) => item.slug)); const merged=data.map((item) => { const local=fallbackProducts.find((product) => product.slug === item.slug); if (!local) return item; return { ...local,...item,images:[...new Set([...(item.images || []),...(local.images || [])])],model_parts:{...(local.model_parts || {}),...(item.model_parts || {})},customizable_parts:item.customizable_parts?.length ? item.customizable_parts : local.customizable_parts } }); setProducts([...merged,...fallbackProducts.filter((item) => !remoteSlugs.has(item.slug))]) }).catch(() => {}) }, [])
  return <SiteContext.Provider value={{ language, setLanguage, direction, t, products, setProducts }}>
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
    <Route path="/custom-order" element={<CustomOrder />} />
    <Route path="/policies" element={<PolicyPage />} />
    <Route path="/privacy" element={<PolicyPage privacy />} />
  </Routes></main><Footer /></div>
}

function SiteCarRover() {
  return <div className="site-car-rover" aria-hidden="true"><i/><i/><i/><img src="/assets/hero/supercar-top.png" alt=""/></div>
}

function Brand() {
  return <Link className="brand" to="/" aria-label="Revtrove home"><img src="/logos/revtrove.jpg" alt="Revtrove" /></Link>
}

function Header() {
  const { language, setLanguage, t } = useSite()
  const [open, setOpen] = useState(false)
  const [languageOpen, setLanguageOpen] = useState(false)
  const [categoriesOpen,setCategoriesOpen]=useState(false)
  const productCategories=[['all','/products'],['wheels','/products/category/wheels'],['turbo','/products/category/turbo'],['shelves','/products/category/shelves'],['keychains','/products/category/keychains']]
  return <header className="header"><div className="header-menu-slot"><button className="menu-button" onClick={() => setOpen(true)} aria-label="Menu"><Menu/></button></div><Brand/><div className="header-actions"><div className="language-menu"><button className="header-icon" onClick={() => setLanguageOpen(!languageOpen)} aria-label="Language"><Globe2/></button>{languageOpen && <div className="language-popover">{[['ar','العربية'],['en','English'],['he','עברית']].map(([code,label]) => <button key={code} className={language === code ? 'active' : ''} onClick={() => { setLanguage(code); setLanguageOpen(false) }}>{label}{language === code && <Check size={15}/>}</button>)}</div>}</div><Link className="header-icon cart-button" to="/products" aria-label={t('products')}><ShoppingBag/><span>0</span></Link><a className="header-icon whatsapp-button" href="https://wa.me/972522538264" target="_blank" rel="noreferrer" aria-label={t('contact')}><PhoneCall/></a></div>
    {open && <button className="nav-scrim" aria-label="Close menu" onClick={() => setOpen(false)}/>}<nav className={open ? 'nav open' : 'nav'}><div className="drawer-head"><Brand/><button onClick={() => setOpen(false)} aria-label="Close menu"><X/></button></div><NavLink onClick={() => setOpen(false)} to="/" end>{t('home')}<ArrowRight size={17}/></NavLink><div className={`nav-products-menu${categoriesOpen?' open':''}`}><NavLink className="nav-products-desktop" onClick={() => setOpen(false)} to="/products">{t('products')}<ArrowRight size={17}/></NavLink><button type="button" className="nav-products-mobile" onClick={() => setCategoriesOpen(!categoriesOpen)} aria-expanded={categoriesOpen}>{t('products')}<ChevronDown size={18}/></button><div className="nav-category-submenu">{productCategories.map(([key,to])=><Link key={key} to={to} onClick={()=>{setOpen(false);setCategoriesOpen(false)}}>{t(key)}<ArrowRight size={14}/></Link>)}</div></div><NavLink onClick={() => setOpen(false)} to="/custom-order">{t('custom')}<ArrowRight size={17}/></NavLink><a href="/#about" onClick={() => setOpen(false)}>{t('about')}<ArrowRight size={17}/></a><a href="/#contact" onClick={() => setOpen(false)}>{t('contact')}<ArrowRight size={17}/></a><div className="drawer-contact"><span>REVTROVE</span><a href="https://wa.me/972522538264" target="_blank" rel="noreferrer">052-253-8264</a><a href="https://instagram.com/revtrove" target="_blank" rel="noreferrer">@revtrove</a></div></nav>
  </header>
}

function Home() {
  const { t } = useSite()
  return <>
    <HeroShowcase/>
    <BrandMarquee/>
    <section className="trust-strip"><Feature icon={<ShieldCheck/>} title={t('premium')}/><Feature icon={<Box/>} title={t('precision')}/><Feature icon={<Palette/>} title={t('personalization')}/><Feature icon={<Phone/>} title={t('support')}/></section>
    <section className="section home-collection" id="products"><ProductCollection home/></section>
    <section className="craft-section" id="about"><div className="craft-image"><img src="/assets/bmw/d6c6e38b-861a-40d3-815e-9b502b4a362e.jpg" alt="3D printed BMW wheel detail"/></div><div className="craft-copy"><p className="eyebrow">REVTROVE / 3D STUDIO</p><h2>{t('aboutTitle')}</h2><p>{t('aboutText')}</p><div className="stats"><div><b>10</b><span>{t('colors')}</span></div><div><b>360°</b><span>{t('product')}</span></div><div><b>100%</b><span>{t('personalization')}</span></div></div></div></section>
    <ContactSection />
  </>
}

function HeroShowcase() {
  const { t, products, language } = useSite()
  const slides=products.filter((product) => product.images?.[0])
  const [active,setActive]=useState(0)
  const [paused,setPaused]=useState(false)
  useEffect(() => { if (paused || slides.length < 2) return; const timer=setInterval(() => setActive((value) => (value + 1) % slides.length),5200); return () => clearInterval(timer) },[paused,slides.length])
  useEffect(() => { if (active >= slides.length) setActive(0) },[active,slides.length])
  const current=slides[active] || fallbackProducts[0]
  const move=(direction) => setActive((active + direction + slides.length) % slides.length)
  return <section className="showcase-hero" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
    <div className="showcase-media">{slides.map((product,index) => <img key={product.slug} className={index === active ? 'active' : ''} src={product.images[0]} alt="" aria-hidden={index !== active}/>)}</div>
    <div className="showcase-shade"/><div className="showcase-grid"/>
    <div className="showcase-copy"><div className="showcase-kicker"><Sparkles size={15}/><span>{t('heroEyebrow')}</span><i>{String(active + 1).padStart(2,'0')} / {String(slides.length).padStart(2,'0')}</i></div><h1>{t('heroTitle')}</h1><p>{t('heroText')}</p><div className="hero-actions"><Link className="button primary" to={`/products/${current.slug}`}>{t('viewProduct')}<ArrowRight size={18}/></Link><Link className="button ghost" to="/custom-order">{t('customCta')}</Link></div><div className="showcase-metrics"><span><b>360°</b>{t('product')}</span><span><b>10</b>{t('colors')}</span><span><b>1—1</b>{t('personalization')}</span></div></div>
    <Link className="showcase-product" to={`/products/${current.slug}`}><small>{t(productCategory(current))}</small><strong>{localized(current,'name',language)}</strong><span>{t('from')} ₪{Number(current.price || 0).toFixed(0)}<ArrowRight size={16}/></span></Link>
    <div className="showcase-controls"><button className="showcase-prev" onClick={() => move(-1)} aria-label="Previous"><ArrowLeft/></button><div>{slides.map((product,index) => <button key={product.slug} className={index === active ? 'active' : ''} onClick={() => setActive(index)} aria-label={localized(product,'name',language)}><i/></button>)}</div><button className="showcase-next" onClick={() => move(1)} aria-label="Next"><ArrowRight/></button></div>
  </section>
}

function BrandMarquee() {
  const brands=[['BMW M','/logos/bmw.jpg'],['PORSCHE GT3 RS','/logos/porsche-rs.png'],['DODGE SRT','/logos/srt.jpg'],['REVTROVE','/logos/revtrove.jpg']]
  return <section className="brand-marquee" aria-label="Automotive brands"><div className="brand-track">{[...brands,...brands].map(([name,logo],index) => <Link to="/products" className="brand-item" key={`${name}-${index}`}><img src={logo} alt=""/><span>{name}</span><i/></Link>)}</div></section>
}

function Feature({ icon, title }) { return <div className="feature">{icon}<span>{title}</span></div> }
function SectionHeading({ eyebrow, title, text }) { return <div className="section-heading"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{text}</p></div> }

function ProductCard({ product, index = 0, language }) {
  const { t } = useSite()
  const category=productCategory(product)
  const hasModel=Object.keys(product.model_parts || {}).length > 0
  return <article className="product-card"><Link to={`/products/${product.slug}`} className="product-image"><ProductCardImages product={product} name={localized(product,'name',language)}/><span className="product-index">{String(index + 1).padStart(2,'0')}</span><span className="image-swap-label">{t('productPhotos')}</span><span className="view-chip">{hasModel ? <><Rotate3D size={16}/>360°</> : <><Box size={16}/>{product.images?.length || 1} {t('photos')}</>}</span></Link><div className="product-info"><div><p className="eyebrow">{t(category)}</p><h3>{localized(product,'name',language)}</h3></div><div className="product-price"><small>{t('from')}</small><b>₪{Number(product.price || 0).toFixed(0)}</b></div></div><Link className="product-link" to={`/products/${product.slug}`}>{t('viewProduct')}<ArrowRight size={16}/></Link></article>
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
  const { t, products, language } = useSite()
  const validCategory=['all','wheels','turbo','shelves','keychains'].includes(initialCategory)?initialCategory:'all'
  const [category,setCategory]=useState(validCategory)
  const [query,setQuery]=useState('')
  useEffect(()=>setCategory(validCategory),[validCategory])
  const filtered=products.filter((product) => {
    const itemCategory=productCategory(product)
    const searchable=[product.name_ar,product.name_en,product.name_he,product.description_ar,product.description_en].filter(Boolean).join(' ').toLowerCase()
    return (category === 'all' || itemCategory === category) && searchable.includes(query.trim().toLowerCase())
  })
  return <><div className="collection-head"><SectionHeading eyebrow={t('collection')} title={t('collectionTitle')} text={t('collectionText')}/><div className="collection-controls"><div className="category-tabs" role="tablist" aria-label={t('filter')}>{['all','wheels','turbo','shelves','keychains'].map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{t(item)}</button>)}</div><label className="search-box"><Search size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('catalogSearch')}/></label></div></div><div className="collection-meta"><span>{filtered.length} {t('products')}</span><i/></div>{filtered.length ? <div className="product-grid">{filtered.map((product,index) => <ProductCard key={product.slug} product={product} index={index} language={language}/>)}</div> : <div className="empty product-empty">{t('noProducts')}</div>}{home && <div className="center"><Link to="/products" className="text-link">{t('shopNow')}<ArrowRight size={17}/></Link></div>}</>
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

function StandLabel({ text }) {
  const transform=partTransforms.stand
  return <group position={transform.position}><group rotation={transform.ultimateRotation}><group rotation={transform.finalRotation}><group rotation={transform.outerRotation}><group rotation={transform.rotation}><group position={[0,.103,-.18]} rotation={[-Math.PI/2,0,0]}><ProductLabel text={text} rotation={[0,0,Math.PI]} width={.098} height={.023}/></group></group></group></group></group></group>
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

function ProductViewer({ product, partColors, baseText, caliperText }) {
  const details=modelDetails(product), capColor=partColors.hub || '#111214'
  return <div className="viewer"><Canvas shadows camera={{ position:[0,0,.98], fov:34 }} dpr={[1,2]} gl={{ antialias:true,alpha:true,powerPreference:'high-performance' }} onCreated={({gl}) => { gl.toneMapping=THREE.ACESFilmicToneMapping; gl.toneMappingExposure=1.04 }}>
    <ambientLight intensity={.24}/><spotLight position={[.65,.85,1.25]} angle={.52} penumbra={.72} intensity={4.8} color="#fff8e7" castShadow/><spotLight position={[-.7,.35,.65]} angle={.55} penumbra={1} intensity={1.25} color="#6be8db"/><directionalLight position={[.4,-.45,.8]} intensity={.9} color="#f5b900"/>
    <Suspense fallback={null}>
      <group scale={1.43} position={[0,.045,0]}>{Object.entries(product.model_parts || {}).map(([part,url]) => <ModelPart key={`${part}-${url}`} part={part} url={url} color={partColors[part] || '#444444'}/>) }<CenterCap color={capColor} logo={details.logo}/><StandLabel text={baseText || details.base}/><ProductLabel text={caliperText || details.caliper} position={[-.092,0,-.011]} rotation={[0,0,Math.PI/2]} width={.13} height={.015}/></group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.34,0]} receiveShadow><planeGeometry args={[1.5,1.5]}/><meshStandardMaterial color="#060708" roughness={.72} metalness={.06}/></mesh>
      <Environment preset="studio"/><ContactShadows position={[0,-.335,0]} opacity={.55} scale={1.05} blur={.24} far={.45}/>
    </Suspense>
    <OrbitControls target={[0,-.025,0]} enablePan={false} enableDamping dampingFactor={.08} minDistance={.74} maxDistance={1.4} minPolarAngle={Math.PI*.3} maxPolarAngle={Math.PI*.7}/>
  </Canvas><div className="viewer-hint"><Rotate3D size={18}/><span>360°</span></div></div>
}

function ProductMediaGallery({ product, partColors={}, baseText='', caliperText='' }) {
  const { t } = useSite()
  const images=(product.images || []).filter(Boolean), hasModel=Object.keys(product.model_parts || {}).length > 0
  const [mode,setMode]=useState(images.length ? 'photo' : '360'), [selected,setSelected]=useState(0)
  useEffect(() => { setMode((product.images || []).length ? 'photo' : '360'); setSelected(0) }, [product.slug])
  const choosePhoto=(index) => { setSelected(index); setMode('photo') }
  return <div className="product-media-gallery"><div className="product-media-stage">{mode === '360' && hasModel ? <ProductViewer product={product} partColors={partColors} baseText={baseText} caliperText={caliperText}/> : <div className="product-detail-photo"><img src={images[selected]} alt={`${product.name_en} ${selected + 1}`}/><span className="photo-count"><Box size={16}/>{selected + 1} / {images.length}</span>{product.category === 'turbo' && <div className="turbo-preview-summary">{['airFilter','turboBody','fan','stand'].map((part) => <span key={part}><i style={{background:partColors[part]}}/>{t(part)}</span>)}{baseText && <b>{baseText}</b>}</div>}</div>}</div><div className="product-media-tabs">{hasModel && <button className={mode === '360' ? 'active model-tab' : 'model-tab'} onClick={() => setMode('360')}><Rotate3D size={19}/><span>{t('view360')}</span></button>}{images.map((image,index) => <button key={image} className={mode === 'photo' && selected === index ? 'active' : ''} onClick={() => choosePhoto(index)} aria-label={`${t('photo')} ${index + 1}`}><img src={image} alt=""/><span>{String(index + 1).padStart(2,'0')}</span></button>)}</div>{mode === '360' && <p className="drag-note"><Rotate3D size={17}/>{t('drag')}</p>}</div>
}

function initialPartColors(product) {
  if (product?.slug?.includes('turbo')) return { airFilter:'#df2029', turboBody:'#b9bcc2', fan:'#101114', stand:'#101114' }
  if (product?.slug?.includes('bmw')) return { rim:'#f6bd00', disc:'#777c84', caliper:'#df2029', stand:'#101114', hub:'#101114' }
  if (product?.slug?.includes('srt')) return { rim:'#101114', disc:'#777c84', caliper:'#df2029', stand:'#101114', hub:'#101114' }
  return { rim:'#b9bcc2', disc:'#4b4f56', caliper:'#f6bd00', stand:'#101114', hub:'#101114' }
}

function ProductPage() {
  const { slug } = useParams()
  const { products, t, language } = useSite()
  const product = products.find((p) => p.slug === slug) || fallbackProducts.find((p) => p.slug === slug) || products[0]
  const [partColors, setPartColors] = useState(() => initialPartColors(product))
  const [baseText, setBaseText] = useState('')
  const [caliperText, setCaliperText] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [showOrder, setShowOrder] = useState(false)
  const hasModel=Object.keys(product?.model_parts || {}).length > 0
  const isTurbo=product?.category === 'turbo' || product?.slug?.includes('turbo')
  const canCustomize=hasModel || isTurbo
  useEffect(() => setPartColors(initialPartColors(product)), [product?.slug])
  if (!product) return null
  return <section className="product-page">
    <div className="product-visual">
      <div className="product-topline"><button className="back-button" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign('/products')}><ArrowLeft size={17}/>{t('back')}</button><div className="breadcrumb"><Link to="/">{t('home')}</Link><span>/</span><Link to="/products">{t('products')}</Link><span>/</span><b>{localized(product,'name',language)}</b></div></div>
      <ProductMediaGallery product={product} partColors={partColors} baseText={baseText} caliperText={caliperText}/>
    </div>
    <div className="product-config">
      <p className="eyebrow">{t(product.category || 'product')} / 3D PRINT</p><h1>{localized(product,'name',language)}</h1><p className="price">₪{Number(product.price || 0).toFixed(0)}</p><p className="description">{localized(product,'description',language)}</p>
      {canCustomize && <><div className="config-panel"><h2>{t('customize')}</h2>{(product.customizable_parts || ['rim','disc','caliper','stand']).map((part) => <ColorSelector key={part} part={part} value={partColors[part]} onChange={(hex) => setPartColors({...partColors,[part]:hex})}/>)}</div><div className="text-fields"><label>{t('baseText')}<span>{t('optional')}</span><input maxLength={30} value={baseText} onChange={(e) => setBaseText(e.target.value)} placeholder={isTurbo ? 'BMW M Turbo' : 'GT3 RS'}/></label>{hasModel && <label>{t('caliperText')}<span>{t('optional')}</span><input maxLength={20} value={caliperText} onChange={(e) => setCaliperText(e.target.value)} placeholder="Brembo"/></label>}</div></>}
      <div className="order-bar"><div className="quantity"><span>{t('quantity')}</span><button onClick={() => setQuantity(Math.max(1,quantity-1))}>−</button><b>{quantity}</b><button onClick={() => setQuantity(Math.min(20,quantity+1))}>+</button></div><button className="button primary wide" onClick={() => setShowOrder(true)}>{t('orderNow')}<ArrowRight size={18}/></button></div>
    </div>
    {showOrder && <OrderModal product={product} partColors={canCustomize ? partColors : {}} baseText={canCustomize ? baseText : ''} caliperText={hasModel ? caliperText : ''} quantity={quantity} close={() => setShowOrder(false)}/>} 
  </section>
}

function ColorSelector({ part, value, onChange }) {
  const { t, language } = useSite()
  const [open, setOpen] = useState(false)
  const selected=colors.find((color) => color.hex === value)
  return <div className={open ? 'color-row open' : 'color-row'}><button type="button" className="color-row-head" onClick={() => setOpen(!open)}><span className="part-name"><i style={{background:value}}/>{t(part)}</span><span>{selected?.[language]}<ChevronDown size={15}/></span></button>{open && <div className="swatches">{colors.map((color) => <button type="button" key={color.id} className={value === color.hex ? 'swatch active' : 'swatch'} style={{'--swatch':color.hex}} title={color[language]} aria-label={color[language]} onClick={() => { onChange(color.hex); setOpen(false) }}>{value === color.hex && <Check size={14}/>}</button>)}</div>}</div>
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

function OrderModal({ product, partColors, baseText, caliperText, quantity, close }) {
  const { t } = useSite()
  const [state, setState] = useState({ status:'idle', id:'', fields:[] })
  const submit = async (event) => {
    event.preventDefault(); setState({ status:'loading', id:'', fields:[] })
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const allowedParts=new Set(product.customizable_parts || [])
    const orderParts=Object.fromEntries(Object.entries(partColors).filter(([part,color]) => allowedParts.has(part) && /^#[0-9a-f]{6}$/i.test(color)))
    try { const result = await api('/api/orders',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,productId:product.id,quantity,baseText,caliperText,parts:orderParts})}); setState({status:'success',id:result.id,fields:[]}) } catch (error) { setState({status:'error',id:'',fields:error.payload?.issues?.map((issue) => issue.field).filter(Boolean) || []}) }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}><div className="modal"><button className="modal-close" onClick={close}><X/></button>{state.status === 'success' ? <div className="success-state"><div className="success-icon"><Check/></div><h2>{t('success')}</h2><p>{t('successText')}</p><b>{state.id}</b><button className="button primary" onClick={close}>{t('products')}</button></div> : <form onSubmit={submit}><p className="eyebrow">{product.name_en}</p><h2>{t('yourDetails')}</h2><CustomerFields/><ProductTermsNotice/>{state.status === 'error' && <p className="form-error">{t('error')}{state.fields.length > 0 && <small>{t('invalidFields')}: {state.fields.map((field) => t(field)).join('، ')}</small>}</p>}<button disabled={state.status === 'loading'} className="button primary wide">{state.status === 'loading' ? t('sending') : t('orderNow')}</button></form>}</div></div>
}

function CustomOrder() {
  const { t } = useSite()
  const [state, setState] = useState({status:'idle',id:''})
  const submit = async (event) => {
    event.preventDefault(); setState({status:'loading',id:''})
    try { const result = await api('/api/custom-orders',{method:'POST',body:new FormData(event.currentTarget)}); setState({status:'success',id:result.id}); event.currentTarget.reset() } catch { setState({status:'error',id:''}) }
  }
  return <section className="custom-page"><div className="custom-intro"><p className="eyebrow">CUSTOM / 3D</p><h1>{t('customTitle')}</h1><p>{t('customText')}</p><div className="custom-process"><div><span>01</span><b>{t('upload')}</b></div><div><span>02</span><b>{t('details')}</b></div><div><span>03</span><b>{t('contact')}</b></div></div></div><form className="custom-form" onSubmit={submit}><label className="upload-box"><Upload size={34}/><b>{t('upload')}</b><small>JPG, PNG, WEBP · MAX 8MB</small><input type="file" name="referenceImage" accept="image/jpeg,image/png,image/webp" required/></label><label>{t('customName')}<input name="customName" required minLength={2}/></label><label>{t('partsDescription')}<textarea name="partsDescription" required minLength={5} rows="5"/></label><CustomerFields/><ProductTermsNotice/>{state.status === 'success' && <p className="form-success">{t('success')} — {state.id}</p>}{state.status === 'error' && <p className="form-error">{t('error')}</p>}<button disabled={state.status === 'loading'} className="button primary wide">{state.status === 'loading' ? t('sending') : t('submitCustom')}</button></form></section>
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
  const [token, setToken] = useState(sessionStorage.getItem('revtrove-admin-token') || '')
  if (!token) return <AdminLogin onLogin={(value) => { sessionStorage.setItem('revtrove-admin-token',value); setToken(value) }}/>
  return <AdminDashboard token={token} logout={() => {sessionStorage.removeItem('revtrove-admin-token');setToken('')}} t={t}/>
}

function AdminLogin({ onLogin }) {
  const { t, language, setLanguage } = useSite()
  const [error,setError] = useState(false)
  const submit = async (event) => { event.preventDefault(); setError(false); const data=Object.fromEntries(new FormData(event.currentTarget)); try { const result=await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); onLogin(result.token) } catch { setError(true) } }
  return <div className="admin-login"><div className="login-card"><Brand/><div className="lock"><LockKeyhole/></div><h1>{t('login')}</h1><form onSubmit={submit}><label>{t('email')}<input type="email" name="email" required/></label><label>{t('password')}<input type="password" name="password" required minLength={8}/></label>{error && <p className="form-error">{t('error')}</p>}<button className="button primary wide">{t('loginButton')}</button></form><select className="admin-language" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="ar">العربية</option><option value="en">English</option><option value="he">עברית</option></select></div></div>
}

function AdminDashboard({ token, logout, t }) {
  const [tab,setTab] = useState('orders'), [orders,setOrders] = useState([]), [search,setSearch] = useState(''), [status,setStatus] = useState('all'), [loading,setLoading] = useState(true)
  const headers = { Authorization:`Bearer ${token}` }
  const load = () => { setLoading(true); api(`/api/admin/orders?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`,{headers}).then(setOrders).catch(() => logout()).finally(() => setLoading(false)) }
  useEffect(() => { const timeout=setTimeout(load,250); return () => clearTimeout(timeout) },[search,status])
  return <div className="admin-shell"><aside><Brand/><nav><button className={tab==='orders'?'active':''} onClick={() => setTab('orders')}><PackageCheck/>{t('orders')}</button><button className={tab==='products'?'active':''} onClick={() => setTab('products')}><Plus/>{t('addProduct')}</button></nav><button className="logout" onClick={logout}>{t('logout')}</button></aside><main className="admin-main"><div className="admin-top"><div><p className="eyebrow">REVTROVE / CONTROL</p><h1>{tab==='orders'?t('orders'):t('addProduct')}</h1></div><span className="secure-badge"><ShieldCheck size={16}/>SECURE SESSION</span></div>{tab==='orders' ? <><div className="admin-filters"><div className="search-box"><Search/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')}/></div><select value={status} onChange={(e) => setStatus(e.target.value)}>{['all','new','contacted','quoted','in_production','ready','completed','cancelled'].map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></div><div className="orders-grid">{!loading && !orders.length && <div className="empty">{t('noOrders')}</div>}{orders.map((order) => <OrderCard key={order.public_id} order={order} token={token} refresh={load}/>)}</div></> : <AddProduct token={token}/>}</main></div>
}

function OrderCard({ order, token, refresh }) {
  const { t } = useSite(); const [open,setOpen]=useState(false)
  const update = async (event) => { event.preventDefault(); const data=Object.fromEntries(new FormData(event.currentTarget)); await api(`/api/admin/orders/${order.public_id}`,{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({status:data.status,quotedPrice:data.quotedPrice?Number(data.quotedPrice):null,productionEta:data.productionEta||null})}); refresh() }
  const print = async () => { const response=await fetch(`/api/admin/orders/${order.public_id}/print`,{headers:{Authorization:`Bearer ${token}`}}); const html=await response.text(); const win=window.open('','_blank'); win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(),250) }
  const parts = order.details?.parts || []
  const location=order.details?.deliveryLocation
  const mapsUrl=location ? `https://www.google.com/maps?q=${location.lat},${location.lng}` : ''
  return <article className={`order-card status-${order.status}`}><div className="order-head"><div><span className="order-type">{t(order.type==='custom'?'customType':'standard')}</span><h3>{order.public_id}</h3></div><span className="status-pill">{t(order.status)}</span></div><div className="customer"><b>{order.customer_name}</b><a href={`tel:${order.country_code}${order.phone}`}>{order.country_code} {order.phone}</a><span>{order.country} · {order.delivery_address}</span>{mapsUrl && <a className="order-map-link" href={mapsUrl} target="_blank" rel="noreferrer"><MapPin size={14}/>{t('openExactLocation')}</a>}</div><div className="order-summary"><b>{order.details?.productName || order.details?.customName}</b>{parts.slice(0,4).map((p) => <span key={p.label}><i style={{background:p.color}}/>{t(p.label)}: {p.color}</span>)}</div><div className="order-actions"><button onClick={() => setOpen(!open)}>{t('details')}</button><button onClick={print}><Printer size={16}/>{t('print')}</button></div>{open && <div className="order-expanded">{order.reference_image && <img src={order.reference_image} alt="Customer reference"/>}<p><b>{t('baseText')}:</b> {order.details?.baseText || '—'}</p><p><b>{t('caliperText')}:</b> {order.details?.caliperText || '—'}</p><p><b>{t('notes')}:</b> {order.notes || '—'}</p>{order.type==='standard' && <div className="mini-viewer"><ProductViewer product={{slug:order.details?.productSlug,model_parts:order.details?.modelParts || {}}} partColors={Object.fromEntries(parts.map((p)=>[p.label,p.color]))}/></div>}<form className="order-update" onSubmit={update}><select name="status" defaultValue={order.status}>{['new','contacted','quoted','in_production','ready','completed','cancelled'].map((s)=><option key={s} value={s}>{t(s)}</option>)}</select><input name="quotedPrice" type="number" min="0" step="0.01" defaultValue={order.quoted_price || ''} placeholder={t('priceQuote')}/><input name="productionEta" defaultValue={order.production_eta || ''} placeholder={t('eta')}/><button className="button primary">{t('update')}</button></form></div>}</article>
}

function AddProduct({ token }) {
  const { t } = useSite(); const [message,setMessage]=useState('')
  const submit=async(event)=>{event.preventDefault();setMessage('');try{await api('/api/admin/products',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:new FormData(event.currentTarget)});event.currentTarget.reset();setMessage('✓')}catch{setMessage(t('error'))}}
  return <form className="add-product-form" onSubmit={submit}><div className="form-grid"><label>{t('productSlug')}<input name="slug" required pattern="[a-z0-9-]{3,120}" placeholder="bmw-m4-wheel"/></label><label>{t('price')}<input name="price" required type="number" min="0" step="0.01"/></label><label>{t('category')}<select name="category" defaultValue="wheel"><option value="wheel">{t('wheels')}</option><option value="turbo">{t('turbo')}</option><option value="shelves">{t('shelves')}</option><option value="keychains">{t('keychains')}</option></select></label><label>{t('productNameAr')}<input name="nameAr" required/></label><label>{t('productNameEn')}<input name="nameEn" required/></label><label>{t('productNameHe')}<input name="nameHe" required/></label><label>{t('image')}<input name="image" type="file" accept="image/jpeg,image/png,image/webp"/></label><label>{t('model')}<input name="model" type="file" accept=".glb,model/gltf-binary"/></label></div>{message && <p>{message}</p>}<button className="button primary">{t('saveProduct')}</button></form>
}

export default App
