import Head from 'next/head'
import Image from 'next/image'
import { useState, useRef } from 'react'
import styles from '../styles/Home.module.css'
import pkRates from '../data/pkRates.json'

// ── Tariff data per region ──────────────────────────────────────────────────
const RATES: Record<string, { base: number; tax: number; standing: number; currency: string; symbol: string; name: string }> = {
  nl: { base: 0.36,  tax: 0.25, standing: 22,  currency: 'EUR', symbol: '€',    name: 'Netherlands' },
  uk: { base: 0.29,  tax: 0.05, standing: 16,  currency: 'GBP', symbol: '£',    name: 'United Kingdom' },
  de: { base: 0.40,  tax: 0.19, standing: 24,  currency: 'EUR', symbol: '€',    name: 'Germany' },
  fr: { base: 0.21,  tax: 0.20, standing: 12,  currency: 'EUR', symbol: '€',    name: 'France' },
  es: { base: 0.18,  tax: 0.21, standing: 14,  currency: 'EUR', symbol: '€',    name: 'Spain' },
  it: { base: 0.25,  tax: 0.22, standing: 18,  currency: 'EUR', symbol: '€',    name: 'Italy' },
  pk: { base: 0.045, tax: 0.17, standing: 3.5, currency: 'PKR', symbol: '₨',    name: 'Pakistan' },
  ae: { base: 0.085, tax: 0.05, standing: 4,   currency: 'AED', symbol: 'AED ', name: 'UAE' },
  sa: { base: 0.048, tax: 0.15, standing: 3,   currency: 'SAR', symbol: 'SAR ', name: 'Saudi Arabia' },
  in: { base: 0.085, tax: 0.05, standing: 2,   currency: 'INR', symbol: '₹',    name: 'India' },
  us: { base: 0.16,  tax: 0.00, standing: 12,  currency: 'USD', symbol: '$',    name: 'United States' },
  ca: { base: 0.13,  tax: 0.05, standing: 10,  currency: 'CAD', symbol: 'CA$',  name: 'Canada' },
}

// ── Pakistan (WAPDA/LESCO style) category-shift billing ────────────────────
// WAPDA/LESCO bills the ENTIRE month's units at the rate of whichever band
// the total consumption falls into — crossing a band boundary re-rates ALL
// units, not just the extra ones. This causes a sharp jump in the bill each
// time a boundary is crossed (most dramatic between 200 and 201 units).
//
// Rates live in /data/pkRates.json instead of here — NEPRA revises them via
// Fuel Price Adjustment roughly every 1–3 months, plus periodic base-tariff
// revisions. To update: open data/pkRates.json, edit the "bands" array and
// the lastUpdated date. No code changes needed.
function calculatePKBase(u: number) {
  for (const band of pkRates.bands) {
    if (band.upto === null || u <= band.upto) {
      return u * band.rate
    }
  }
  // fallback — should never hit this since the last band has upto: null
  return u * pkRates.bands[pkRates.bands.length - 1].rate
}

interface BillResult {
  units: number
  region: string
  propType: string
  base: number
  tax: number
  standing: number
  total: number
  r: typeof RATES[string]
}

interface Prediction {
  predictedBill: number
  predictedUnits: number
  changePercent: number
  direction: 'up' | 'down' | 'stable'
  confidence: string
  rangeLow: number
  rangeHigh: number
  trendReason: string
}

interface Tip {
  emoji: string
  title: string
  desc: string
  saving: string
}

function fmtD(symbol: string, num: number) {
  return symbol + num.toFixed(2)
}

export default function Home() {
  const [units, setUnits]     = useState('')
  const [region, setRegion]   = useState('')
  const [propType, setProp]   = useState<'residential' | 'commercial'>('residential')
  const [result, setResult]   = useState<BillResult | null>(null)
  const [pred, setPred]       = useState<Prediction | null>(null)
  const [tips, setTips]       = useState<Tip[]>([])
  const [predLoading, setPredLoad] = useState(false)
  const [tipsLoading, setTipsLoad] = useState(false)
  const [predError, setPredError]  = useState('')
  const [tipsError, setTipsError]  = useState('')
  const [step, setStep]       = useState(1)

  // Lead form
  const [lfName, setLfName]   = useState('')
  const [lfPhone, setLfPhone] = useState('')
  const [lfCity, setLfCity]   = useState('')
  const [leadSent, setLeadSent] = useState(false)
  const [leadLoading, setLeadLoad] = useState(false)
  const [leadError, setLeadError] = useState('')

  // FAQ open states
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const resultsRef = useRef<HTMLDivElement>(null)

  function calculate() {
    const u = parseFloat(units)
    if (!u || u <= 0) { alert('Please enter a valid number of units.'); return }
    if (!region)       { alert('Please select your region.'); return }

    const r = RATES[region]
    const mult = propType === 'commercial' ? 1.15 : 1

    const base = region === 'pk'
      ? calculatePKBase(u) * mult
      : u * r.base * mult

    const tax  = base * r.tax
    const standing = r.standing
    const total = base + tax + standing

    const res: BillResult = { units: u, region, propType, base, tax, standing, total, r }
    setResult(res)
    setPred(null)
    setTips([])
    setPredError('')
    setTipsError('')
    setStep(2)

    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)

    fetchPrediction(res)
    fetchTips(res)
  }

  async function fetchPrediction(res: BillResult) {
    setPredLoad(true)
    try {
      const r = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          units: res.units,
          region: res.region,
          propType: res.propType,
          total: res.total,
          symbol: res.r.symbol,
        }),
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setPred(data)
      setStep(s => Math.max(s, 3))
    } catch {
      setPredError('Could not load prediction. Please try again.')
    } finally {
      setPredLoad(false)
    }
  }

  async function fetchTips(res: BillResult) {
    setTipsLoad(true)
    try {
      const r = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: res.units, region: res.region, propType: res.propType }),
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setTips(data)
      setStep(s => Math.max(s, 4))
    } catch {
      setTipsError('Could not load tips. Please try again.')
    } finally {
      setTipsLoad(false)
    }
  }

  async function submitLead() {
    if (!lfName.trim() || !lfPhone.trim() || !lfCity.trim()) {
      setLeadError('Please fill in your name, phone, and city.')
      return
    }
    setLeadLoad(true)
    setLeadError('')
    try {
      await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: lfName,
          phone: lfPhone,
          city: lfCity,
          bill: result ? fmtD(result.r.symbol, result.total) : '',
          units: result ? result.units + ' kWh' : '',
        }),
      })
      setLeadSent(true)
    } catch {
      setLeadError('Submission failed. Please try again.')
    } finally {
      setLeadLoad(false)
    }
  }

  const faqs = [
    {
      q: 'How accurate is the bill estimate?',
      a: 'Our estimates are based on official tariff rates from each country\'s energy regulator and updated regularly. Actual bills may vary 5–15% depending on your specific provider and contract. For the most precise figure, compare with your provider\'s tariff sheet.',
    },
    {
      q: 'How is next month\'s bill predicted?',
      a: 'Our AI model (Llama 3 via Groq) analyzes your current usage, seasonal energy patterns, regional price trends, and typical consumption for your property type to generate a probability-weighted forecast.',
    },
    {
      q: 'Can solar really reduce my electricity costs?',
      a: 'Yes — solar systems can reduce bills by 50–80% depending on location, roof size, and consumption. European households typically see full ROI within 5–8 years. Feed-in tariffs let you sell excess energy back to the grid.',
    },
    {
      q: 'Is the solar consultation really free?',
      a: 'Absolutely. Our solar consultation is 100% free with no obligation. A qualified advisor will assess your property, calculate your savings potential, and walk you through financing options.',
    },
  ]

  return (
    <>
      <Head>
        <title>Electricity Bill Calculator & Solar Savings Advisor</title>
      </Head>

      {/* ── HERO ── */}
      <header className={styles.hero}>
        <div className={styles.page} style={{ paddingBottom: 0 }}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            AI-Powered Calculator
          </div>
          <h1 className={styles.heroTitle}>
            Estimate Your Electricity Bill{' '}
            <span className={styles.heroAccent}>Before It Arrives</span>
          </h1>
          <p className={styles.heroSub}>
            Use AI to calculate your current bill, predict next month&apos;s expenses,
            and discover ways to save money.
          </p>
          <button
            className={styles.heroCta}
            onClick={() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' })}
          >
            ⚡ Calculate My Bill
          </button>
          <div className={styles.heroStats}>
            {[['50K+', 'Bills Calculated'], ['€240', 'Avg. Annual Savings'], ['4.9★', 'User Rating']].map(([n, l]) => (
              <div key={l} className={styles.heroStat}>
                <div className={styles.heroStatNum}>{n}</div>
                <div className={styles.heroStatLabel}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
            <Image
              src="/smart-meter.png"
              alt="Smart electricity meter showing live kWh usage"
              width={640}
              height={360}
              style={{ width: '100%', maxWidth: 480, height: 'auto', borderRadius: 16, boxShadow: '0 12px 32px rgba(0,0,0,0.18)' }}
              priority
            />
          </div>
        </div>
      </header>

      <main className={styles.page}>

        {/* ── STEP INDICATOR ── */}
        <div className={styles.stepNav}>
          {['Usage', 'Bill', 'Predict', 'Save'].map((label, i) => {
            const n = i + 1
            const cls = n < step ? styles.stepDone : n === step ? styles.stepActive : styles.stepIdle
            return (
              <>
                <div key={label} className={`${styles.step} ${cls}`}>
                  <div className={styles.stepDot}>{n < step ? '✓' : n}</div>
                  <span className={styles.stepLabel}>{label}</span>
                </div>
                {i < 3 && (
                  <div key={`sep-${i}`} className={`${styles.stepSep} ${n < step ? styles.stepSepDone : n === step ? styles.stepSepActive : ''}`} />
                )}
              </>
            )
          })}
        </div>

        {/* ── CALCULATOR CARD ── */}
        <section className={styles.card} id="calculator">
          <div className={styles.calcHeader}>
            <div className={styles.calcIcon} style={{ background: 'var(--blue-light)' }}>⚡</div>
            <div>
              <div className={styles.calcTitle}>Electricity Bill Calculator</div>
              <div className={styles.calcSub}>Enter your usage details for an instant estimate</div>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Monthly Units <span style={{ color: 'var(--red)' }}>*</span></label>
              <div className={styles.unitInput}>
                <input
                  className={styles.formInput}
                  type="number"
                  placeholder="e.g. 350"
                  min={0}
                  value={units}
                  onChange={e => setUnits(e.target.value)}
                />
                <span className={styles.unitSuffix}>kWh</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Country / Region <span style={{ color: 'var(--red)' }}>*</span></label>
              <select className={styles.formSelect} value={region} onChange={e => setRegion(e.target.value)}>
                <option value="">Select region...</option>
                <optgroup label="Europe">
                  <option value="nl">🇳🇱 Netherlands</option>
                  <option value="uk">🇬🇧 United Kingdom</option>
                  <option value="de">🇩🇪 Germany</option>
                  <option value="fr">🇫🇷 France</option>
                  <option value="es">🇪🇸 Spain</option>
                  <option value="it">🇮🇹 Italy</option>
                </optgroup>
                <optgroup label="Middle East / Asia">
                  <option value="pk">🇵🇰 Pakistan</option>
                  <option value="ae">🇦🇪 UAE</option>
                  <option value="sa">🇸🇦 Saudi Arabia</option>
                  <option value="in">🇮🇳 India</option>
                </optgroup>
                <optgroup label="Americas">
                  <option value="us">🇺🇸 United States</option>
                  <option value="ca">🇨🇦 Canada</option>
                </optgroup>
              </select>
              {region === 'pk' && (
                <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
                  PK rates last verified {pkRates.lastUpdated} — actual bill may differ slightly, NEPRA rates change periodically.
                </div>
              )}
            </div>

            <div className={`${styles.formGroup} ${styles.full}`}>
              <label className={styles.formLabel}>Property Type <span style={{ color: 'var(--red)' }}>*</span></label>
              <div className={styles.propRow}>
                {(['residential', 'commercial'] as const).map(pt => (
                  <label
                    key={pt}
                    className={`${styles.propLabel} ${propType === pt ? styles.propActive : ''}`}
                    onClick={() => setProp(pt)}
                  >
                    <input type="radio" name="propType" value={pt} checked={propType === pt} onChange={() => setProp(pt)} />
                    {pt === 'residential' ? '🏠 Residential' : '🏢 Commercial'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button className={styles.btnPrimary} onClick={calculate}>
            Calculate My Bill ⚡
          </button>
        </section>

        {/* ── RESULTS ── */}
        {result && (
          <div ref={resultsRef}>

            {/* Bill Estimate */}
            <section className={`${styles.card} ${styles.animIn}`}>
              <div className={styles.calcHeader}>
                <div className={styles.calcIcon} style={{ background: 'var(--blue-light)' }}>📊</div>
                <div>
                  <div className={styles.calcTitle}>Your Bill Estimate</div>
                  <div className={styles.calcSub}>
                    {result.r.name} · {result.propType} · {result.units} kWh
                  </div>
                </div>
              </div>
              <div className={styles.resultsGrid}>
                <div className={styles.resultCard}>
                  <div className={styles.resultLabel}>Units Consumed</div>
                  <div className={styles.resultValue}>{result.units}</div>
                  <div className={styles.resultSub}>kWh this month</div>
                </div>
                <div className={styles.resultCard}>
                  <div className={styles.resultLabel}>Energy Charges</div>
                  <div className={styles.resultValue}>{fmtD(result.r.symbol, result.base)}</div>
                  <div className={styles.resultSub}>+{fmtD(result.r.symbol, result.standing)} standing charge</div>
                </div>
                <div className={`${styles.resultCard} ${styles.resultHighlight}`}>
                  <div className={styles.resultLabel}>Total Bill</div>
                  <div className={styles.resultValue}>{fmtD(result.r.symbol, result.total)}</div>
                  <div className={styles.resultSub}>incl. {Math.round(result.r.tax * 100)}% tax</div>
                </div>
              </div>
            </section>

            {/* Prediction */}
            <section className={`${styles.card} ${styles.animIn}`} style={{ animationDelay: '0.1s' }}>
              <div className={styles.calcHeader}>
                <div className={styles.calcIcon} style={{ background: '#fff4e8' }}>🔮</div>
                <div>
                  <div className={styles.calcTitle}>Next Month Prediction</div>
                  <div className={styles.calcSub}>AI-powered forecast based on usage patterns</div>
                </div>
              </div>
              {predLoading && (
                <div className={styles.loadingWrap}>
                  <div className={styles.spinner} />
                  <div className={styles.loadingText}>Generating prediction with Llama 3...</div>
                </div>
              )}
              {predError && <p className={styles.errorText}>{predError}</p>}
              {pred && !predLoading && (
                <div>
                  {[
                    ['Predicted Bill', <span key="pb" style={{ fontSize: 20, color: 'var(--blue-dark)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{result.r.symbol}{pred.predictedBill.toFixed(2)}</span>],
                    ['Change vs This Month', <span key="ch" className={`${styles.badge} ${pred.direction === 'up' ? styles.badgeUp : pred.direction === 'down' ? styles.badgeDown : styles.badgeNeutral}`}>{pred.direction === 'up' ? '↑' : pred.direction === 'down' ? '↓' : '→'} {Math.abs(pred.changePercent).toFixed(1)}%</span>],
                    ['Expected Cost Range', `${result.r.symbol}${pred.rangeLow.toFixed(0)} – ${result.r.symbol}${pred.rangeHigh.toFixed(0)}`],
                    ['Forecast Confidence', <span key="fc" style={{ color: 'var(--green)', fontWeight: 700 }}>{pred.confidence}</span>],
                    ['Trend Insight', <span key="tr" style={{ fontSize: 13, color: 'var(--gray-600)', textAlign: 'right', maxWidth: '60%', display: 'block' }}>{pred.trendReason}</span>],
                  ].map(([label, val], i) => (
                    <div key={i} className={styles.predRow}>
                      <span className={styles.predLabel}>{label}</span>
                      <span className={styles.predValue}>{val}</span>
                    </div>
                  ))}
                  <div className={styles.trendBar}>
                    <div className={styles.trendFill} style={{ width: pred.confidence === 'High' ? '85%' : '60%' }} />
                  </div>
                </div>
              )}
            </section>

            {/* Tips */}
            <section className={`${styles.card} ${styles.animIn}`} style={{ animationDelay: '0.2s' }}>
              <div className={styles.calcHeader}>
                <div className={styles.calcIcon} style={{ background: 'var(--green-light)' }}>💡</div>
                <div>
                  <div className={styles.calcTitle}>AI Savings Recommendations</div>
                  <div className={styles.calcSub}>Personalized tips to reduce your electricity costs</div>
                </div>
              </div>
              {tipsLoading && (
                <div className={styles.loadingWrap}>
                  <div className={styles.spinner} />
                  <div className={styles.loadingText}>Generating personalized tips with Llama 3...</div>
                </div>
              )}
              {tipsError && <p className={styles.errorText}>{tipsError}</p>}
              {tips.length > 0 && (
                <div className={styles.tipsGrid}>
                  {tips.map((t, i) => (
                    <div key={i} className={styles.tipCard}>
                      <div className={styles.tipIcon}>{t.emoji}</div>
                      <div>
                        <div className={styles.tipTitle}>{t.title}</div>
                        <div className={styles.tipDesc}>{t.desc}</div>
                        <div className={styles.tipSave}>{t.saving}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Solar CTA */}
            <section className={`${styles.solarSection} ${styles.animIn}`} style={{ animationDelay: '0.3s' }}>
              <div className={styles.solarHeader}>
                <div className={styles.solarHeaderText}>
                  <h2>☀️ Want to Cut Your Electricity Bill?</h2>
                  <p>
                    Get a free solar savings assessment and discover how much you could save
                    every month. No commitment, no hidden costs.
                  </p>
                  <div className={styles.solarBenefits}>
                    {['Save up to 80% on electricity', 'Free professional consultation', 'Government incentives available', 'ROI in 4–7 years typically'].map(b => (
                      <div key={b} className={styles.solarBenefit}>
                        <div className={styles.solarBenefitIcon}>✅</div>
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {!leadSent ? (
                <div className={styles.leadForm}>
                  <h3>Get Free Solar Consultation</h3>
                  <p className={styles.leadFormSub}>
                    Fill in your details — our solar experts will contact you within 24 hours.
                  </p>
                  <div className={styles.leadGrid}>
                    <input className={styles.leadInput} type="text"    placeholder="Full Name *"    value={lfName}  onChange={e => setLfName(e.target.value)} />
                    <input className={styles.leadInput} type="tel"     placeholder="Phone Number *" value={lfPhone} onChange={e => setLfPhone(e.target.value)} />
                    <input className={styles.leadInput} type="text"    placeholder="City *"         value={lfCity}  onChange={e => setLfCity(e.target.value)} />
                    <input className={styles.leadInput} type="text"    placeholder="Monthly Bill"   value={result ? fmtD(result.r.symbol, result.total) : ''} readOnly />
                    <input className={styles.leadInput} type="text"    placeholder="Monthly Units"  value={result ? result.units + ' kWh' : ''} readOnly />
                  </div>
                  {leadError && <p className={styles.leadError}>{leadError}</p>}
                  <button className={styles.btnSolar} onClick={submitLead} disabled={leadLoading}>
                    {leadLoading ? 'Submitting...' : '☀️ Get Free Solar Consultation'}
                  </button>
                  <p className={styles.formPrivacy}>🔒 Your data is secure. We never share your information.</p>
                </div>
              ) : (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}>🌟</div>
                  <div className={styles.successTitle}>Consultation Requested!</div>
                  <div className={styles.successSub}>Our solar experts will contact you within 24 hours. Get ready to save!</div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── FAQ ── */}
        <section className={styles.card} style={{ marginTop: 8 }}>
          <div className={styles.sectionLabel}>FAQ</div>
          <div className={styles.sectionTitle} style={{ marginBottom: 20 }}>Common Questions</div>
          {faqs.map((f, i) => (
            <div key={i} className={`${styles.faqItem} ${openFaq === i ? styles.faqOpen : ''}`}>
              <div className={styles.faqQ} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {f.q}
                <div className={styles.faqToggle}>{openFaq === i ? '−' : '+'}</div>
              </div>
              {openFaq === i && <div className={styles.faqA}>{f.a}</div>}
            </div>
          ))}
        </section>

        <footer style={{ textAlign: 'center', padding: '32px 0 0', color: 'var(--gray-400)', fontSize: 13 }}>
          ⚡ ElecCalc AI · Helping people save on energy · Not affiliated with any energy provider
        </footer>
      </main>
    </>
  )
}
