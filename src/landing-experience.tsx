import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { ArrowDown, ArrowUpRight, Check, ChevronRight, Coffee, FileText, Fingerprint, KeyRound, MapPin, Plus, RotateCcw, ShieldCheck, ShoppingBag, Sparkles, TrainFront, X } from 'lucide-react'
import './landing-experience.css'

// Folio-specific adaptations of Unlumen's documented Tilt Card, Animated List,
// and Motion FAQs interactions. https://ui.unlumen.com/components
function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const quiet = useReducedMotion()
  return <motion.div className={className} initial={quiet ? false : { opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .65, ease: [.22, 1, .36, 1] }}>{children}</motion.div>
}
function Tilt({ children }: { children: ReactNode }) {
  const quiet = useReducedMotion()
  const x = useSpring(0, { stiffness: 180, damping: 24 }), y = useSpring(0, { stiffness: 180, damping: 24 })
  return <motion.div className="folio-tilt" style={{ rotateX: x, rotateY: y, transformPerspective: 1200 }} onPointerMove={event => {
    if (quiet || event.pointerType !== 'mouse') return
    const r = event.currentTarget.getBoundingClientRect()
    x.set(-(event.clientY - r.top - r.height / 2) / r.height * 9)
    y.set((event.clientX - r.left - r.width / 2) / r.width * 9)
  }} onPointerLeave={() => { x.set(0); y.set(0) }}>{children}</motion.div>
}
const items = [
  { title: 'Your morning coffee', category: 'Dining', Icon: Coffee, color: 'peach' },
  { title: 'The weekly shop', category: 'Groceries', Icon: ShoppingBag, color: 'mint' },
  { title: 'The ride home', category: 'Transport', Icon: TrainFront, color: 'blue' },
]
function StatementDemo() {
  const [sorted, setSorted] = useState(false)
  const quiet = useReducedMotion()
  return <div className="statement-demo" data-ui>
    <div className="demo-window-top"><img src="/folio.svg" alt="" width="28" height="28" /><span>A little order, at last.</span><span className="demo-live">Interactive preview</span></div>
    <div className="demo-paper"><FileText size={24} /><div><strong>Your statement</strong><span>CSV, Excel, or text PDF</span></div><motion.span animate={{ rotate: sorted ? 360 : 0 }} transition={{ duration: quiet ? 0 : .6 }}>{sorted ? <Check size={24} /> : <ArrowDown size={24} />}</motion.span></div>
    <div className="demo-rows">{items.map(({ title, category, Icon, color }, index) => <motion.div layout={!quiet} className="demo-transaction" key={title} initial={false} animate={{ x: sorted ? 0 : (index - 1) * 8, rotate: sorted ? 0 : (index - 1) * -1.8 }} transition={{ duration: quiet ? 0 : .5, delay: index * .07 }}><span className={`demo-icon ${color}`}><Icon size={20} /></span><span>{title}</span><AnimatePresence mode="wait"><motion.span key={String(sorted)} className={`demo-category ${sorted ? color : ''}`} initial={quiet ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{sorted ? category : 'Unsorted'}</motion.span></AnimatePresence></motion.div>)}</div>
    <button className="demo-sort" onClick={() => setSorted(!sorted)}>{sorted ? <RotateCcw size={18} /> : <Sparkles size={18} />}{sorted ? 'Play it again' : 'Make sense of it'}<ChevronRight size={18} /></button>
    <p className="demo-caption" aria-live="polite">{sorted ? 'Organized. In your workspace, you review categories before import.' : 'Try sorting these illustrative labels. Nothing is saved.'}</p>
  </div>
}
function MerchantDemo() {
  const [open, setOpen] = useState(false)
  const quiet = useReducedMotion()
  return <div className={`merchant-demo ${open ? 'is-open' : ''}`} data-ui>
    <div className="merchant-illustration" aria-hidden="true"><svg viewBox="0 0 600 350" fill="none"><rect width="600" height="350" fill="#d9e5d7"/><path d="M0 70H600M0 270H600M100 0V350M460 0V350" stroke="#f3f5ec" strokeWidth="34"/><path d="M0 70H600M0 270H600" stroke="#bbcdb8" strokeWidth="2" strokeDasharray="8 12"/><rect x="190" y="95" width="180" height="155" rx="8" fill="#a7bfa2"/><rect x="210" y="130" width="140" height="120" fill="#f6f2df"/><path d="M198 130L218 100H342L362 130Z" fill="#e6a17b"/><path d="M220 102V130M250 102V130M280 102V130M310 102V130M340 102V130" stroke="#f9e9d7" strokeWidth="14"/><rect x="229" y="157" width="40" height="49" rx="18" fill="#536f59"/><rect x="289" y="157" width="40" height="93" rx="18" fill="#536f59"/><circle cx="405" cy="172" r="26" fill="#78996e"/><path d="M405 175V225" stroke="#536f59" strokeWidth="7"/><circle cx="155" cy="200" r="20" fill="#78996e"/></svg><span className="illustration-pin"><MapPin size={28} /></span></div>
    <div className="merchant-demo-body"><span className="demo-caption">Illustrated walkthrough · not a real merchant</span><h3>More than a line<br />on your statement.</h3><button onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="merchant-preview">{open ? 'Close the details' : 'Look a little closer'} {open ? <X size={18} /> : <ArrowUpRight size={18} />}</button>
    <AnimatePresence>{open && <motion.div id="merchant-preview" className="merchant-reveal" initial={quiet ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><p><MapPin size={18} /><span><strong>Find the place</strong>Website details, photos, and coordinates when available.</span></p><p><FileText size={18} /><span><strong>Follow the receipt</strong>Search your connected mailbox around the transaction date.</span></p><p><ShieldCheck size={18} /><span><strong>Check the source</strong>Review possible matches and confirm the correct branch.</span></p></motion.div>}</AnimatePresence></div>
  </div>
}
function AiDemo() {
  const [provider, setProvider] = useState('Gemini')
  return <div className="ai-demo" data-ui><div className="ai-symbol"><Sparkles size={40} /></div><h3>Your choice.<br />Your intelligence.</h3><div className="provider-switch" aria-label="Preview AI providers">{['Gemini', 'OpenAI', 'OpenRouter', 'Custom'].map(name => <button key={name} aria-pressed={provider === name} onClick={() => setProvider(name)}>{name}</button>)}</div><div className="demo-key"><KeyRound size={20} /><span>Your key stays in your encrypted vault</span><ShieldCheck size={20} /></div><div className="ai-response" aria-live="polite"><span>{provider === 'Custom' ? 'Your compatible endpoint' : provider} · Your chosen model</span><p>Bring your own key to generate a spending recap. No Folio AI subscription required.</p></div><p className="demo-caption">Provider preview only. No AI request is sent here.</p></div>
}
const questions = [
  ['Where does my financial data live?', 'Your financial records are encrypted in this browser. Folio manages your account and a protected vault key on Cloudflare. Records do not sync between devices yet. Email recovery is not available yet.'],
  ['Do I need to connect everything?', 'No. Start with a statement. AI and mailbox connections are optional, and you can revisit setup later. Merchant discovery uses Folio’s server-side Firecrawl integration.'],
  ['What gets sent to external services?', 'Merchant lookups send the merchant name and search location to Firecrawl. AI recaps send the relevant financial context to the provider you choose. Gmail receipt searches require your authorization.'],
  ['Will these examples appear in my workspace?', 'No. These are interactive illustrations of the workflow. Your workspace starts empty and only contains the statements and accounts you add.'],
]
export function LandingExperience({ exists, start }: { exists: boolean; start: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const quiet = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: root, offset: ['start start', 'end end'] })
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 25 })
  const heroRotate = useTransform(scrollYProgress, [0, .2], [-4, 0])
  const [faq, setFaq] = useState<number>()
  return <div className="landing-experience" ref={root}>
    {!quiet && <motion.div className="landing-progress" style={{ scaleX: progress }} />}
    <section className="experience-hero"><div className="experience-hero-copy"><h1><span>Your money.</span><span>More meaning.</span></h1><p>The coffee. The commute. The plans you’re saving for. Get a clearer picture of the life behind your spending.</p><button className="landing-cta" onClick={start}>{exists ? 'Welcome back' : 'Make it yours'} <ArrowUpRight size={22} /></button><a className="explore-link" href="#how-it-works">Take a little look around <ArrowDown size={16} /></a></div><motion.div className="hero-preview" style={{ rotate: quiet ? 0 : heroRotate }}><Tilt><StatementDemo /></Tilt><span className="preview-note">Less spreadsheet energy.<br />More “I’ve got this.”</span></motion.div></section>
    <section className="format-ribbon" aria-label="Supported statement formats"><span>Start with what you have.</span><div><FileText /> CSV <span> / </span> Excel <span> / </span> PDF</div><span>One calmer place for all of it.</span></section>
    <section id="how-it-works" className="experience-story"><div className="story-sticky"><Reveal><h2>Connect<br />the dots.</h2><p>A statement tells you what happened. Folio helps you look closer.</p><img src="/insights-origami.png" alt="Folded paper artwork" className="story-art" loading="lazy" /></Reveal></div><div className="story-chapters"><Reveal className="story-chapter"><span className="chapter-icon peach"><FileText size={26} /></span><h3>From a file<br />to a feeling of order.</h3><p>Import your statement, review the categories, and see your spending take shape. No bank login needed for statement imports.</p><div className="category-composition" aria-label="Spending categories">{items.map(({category,Icon,color},i)=><motion.span key={category} className={color} initial={quiet?false:{rotate:(i-1)*12,y:30}} whileInView={{rotate:(i-1)*-5,y:0}} viewport={{once:true}} transition={{delay:i*.12}}><Icon size={25}/>{category}</motion.span>)}</div></Reveal><Reveal className="story-chapter"><h3>Remember the moment.<br />Find the details.</h3><p>Open a transaction to explore merchant information through Firecrawl. Add a mailbox connection to look for the bill.</p><MerchantDemo /></Reveal></div></section>
    <section className="intelligence-section"><Reveal><h2>A second perspective.<br />On your terms.</h2><p>Bring the model you like. Keep control of the key. Use AI when you want a little help making sense of your spending.</p></Reveal><Reveal><Tilt><AiDemo /></Tilt></Reveal></section>
    <section className="privacy-section"><Reveal className="privacy-visual"><motion.div className="vault-plate" whileHover={quiet?{}:{rotate:-5,scale:1.03}}><img src="/folio.svg" alt="" width="64" height="64"/><Fingerprint size={100} strokeWidth={1}/><span>Your private vault</span><ShieldCheck size={26}/></motion.div><span className="privacy-key"><KeyRound size={32}/></span></Reveal><Reveal><h2>A private space.<br />A fresh start.</h2><p>Create your account with an email and password. Walk through setup. Add optional passkey protection. Then bring in your first statement.</p><p className="privacy-note">Encrypted in this browser. Your workspace starts empty. Your account is on Cloudflare; financial records stay on this device.</p><button className="landing-cta" onClick={start}>Settle in <ArrowUpRight size={22}/></button></Reveal></section>
    <section className="experience-faq"><Reveal><h2>A few good<br />questions.</h2></Reveal><div>{questions.map(([question,answer],index)=><div className="experience-faq-item" key={question}><button aria-expanded={faq===index} aria-controls={`faq-${index}`} onClick={()=>setFaq(faq===index?undefined:index)}>{question}<motion.span animate={{rotate:faq===index?45:0}} transition={{duration:quiet?0:.2}}><Plus size={23}/></motion.span></button><AnimatePresence initial={false}>{faq===index&&<motion.div id={`faq-${index}`} initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} transition={{duration:quiet?0:.25}}><p>{answer}</p></motion.div>}</AnimatePresence></div>)}</div></section>
    <footer className="experience-footer"><Reveal><img src="/folio.svg" alt="Folio" width="80" height="80"/><h2>Life’s for living.<br />Make room for it.</h2><button className="landing-cta" onClick={start}>Start with you <ArrowUpRight size={24}/></button></Reveal><div className="footer-fine"><span>Folio · Your finances, in focus.</span><a href="#">Back to the top ↑</a></div></footer>
  </div>
}
