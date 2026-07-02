import Head from 'next/head'
import Image from 'next/image'
import { useState, useRef } from 'react'
import styles from '../styles/Home.module.css'
import pkRates from '../data/pkRates.json'

// ── Pakistan (WAPDA/DISCO) billing logic ────────────────────────────────────
// Protected consumers (≤200 units for 6 consecutive months) are billed on a
// progressive/telescopic slab basis — each portion of usage is charged at its
// own tier rate, like a tax bracket.
// Non-protected consumers (any month over 200 units) are billed at a single
// flat rate applied to their ENTIRE month's consumption — crossing 200 units
// causes a sharp jump, not a gradual increase.
// This app can't know a user's 6-month history, so it assumes: units ≤200
// this month -> protected rates, units >200 this month -> non-protected rates.
// Rates live in /data/pkRates.json -- edit that file when NEPRA/DISCO rates
// change. No code changes needed.

function calculateResidentialProtected(u: number) {
  const [t1, t2, t3] = pkRates.residential.protectedTiers
  if (u <= t1.upto) return u * t1.rate
  if (u <= t2.upto) return t1.upto * t1.rate + (u - t1.upto) * t2.rate
  return t1.upto * t1.rate + (t2.upto - t1.upto) * t2.rate + (u - t2.upto) * t3.rate
}

function calculateResidentialNonProtected(u: number) {
  for (const band of pkRates.residential.nonProtectedBands) {
    if (band.upto === null || u <= band.upto) {
      return u * band.rate
    }
  }
  const bands = pkRates.residential.nonProtectedBands
  return u * bands[bands.length - 1].rate
}

function calculateResidentialBase(u: number) {
  return u <= 200 ? calculateResidentialProtected(u) : calculateResidentialNonProtected(u)
}

interface PKBreakdown {
  costOfElectricity: number
  fixedCharge: number
  fcSurcharge: number
  electricityDuty: number
  tvFee: number
  gst: number
  njSurcharge: number
  total: number
  isProtected: boolean
}

function calculatePKBreakdown(u: number, propType: 'residential' | 'commercial'): PKBreakdown {
  const ec = pkRates.extraCharges
  let costOfElectricity: number
  let fixedCharge: number
  let isProtected = false

  if (propType === 'commercial') {
    costOfElectricity = u * pkRates.commercial.ratePerUnit
    fixedCharge = pkRates.commercial.fixedCharge
  } else {
    costOfElectricity = calculateResidentialBase(u)
    fixedCharge = pkRates.residential.fixedChargeSinglePhase
    isProtected = u <= 200
  }

  const fcSurcharge = u * ec.fcSurchargeRatePerUnit
  const electricityDuty = costOfElectricity * (ec.electricityDutyPercent / 100)
  const tvFee = ec.tvFeeFlat
  const njSurcharge = ec.njSurchargeFlat
  const gst = (costOfElectricity + fcSurcharge + electricityDuty) * (ec.gstPercent / 100)
  const total = costOfElectricity + fixedCharge + fcSurcharge + electricityDuty + tvFee + gst + njSurcharge

  return { costOfElectricity, fixedCharge, fcSurcharge, electricityDuty, tvFee, gst, njSurcharge, total, isProtected }
}

interface BillResult {
  units: number
  disco: string
  discoName: string
  propType: string
  breakdown: PKBreakdown
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

function fmtD(num: number) {
  return '₨' + num.toFixed(2)
}

export default function Home() {
  const [units, setUnits]     = useState('')
  const [disco, setDisco]     = useState('')
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
    if (!disco)        { alert('Please select your DISCO / city.'); return }

    const discoInfo = pkRates.discos.find(d => d.id === disco)
    const breakdown = calculatePKBreakdown(u, propType)

    const res: BillResult = { units: u, disco, discoName: discoInfo?.name ?? disco, propType, breakdown }
    setResult(res)
    setPred(null)
    setTips([])
    setPredError('')
    setTipsError('')
    setStep(2)

    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)

    fetchInsights(res)
  }

  async function fetchInsights(res: BillResult) {
    setPredLoad(true)
    setTipsLoad(true)

    // Prediction — AI-powered, one call
    fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        units: res.units,
        region: res.discoName,
        propType: res.propType,
        total: res.breakdown.total,
        symbol: '₨',
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setPred(data)
        setStep(s => Math.max(s, 3))
      })
      .catch(() => setPredError('Could not load prediction. Please try again.'))
      .finally(() => setPredLoad(false))

    // Tips — static, season-aware, no AI call, no quota usage
    fetch('/api/tips')
      .then(r => r.json())
      .then(data => {
        if (!data.success) throw new Error('Tips unavailable')
        const mapped: Tip[] = data.tips.map((t: { icon: string; title: string; desc: string; saving: string }) => ({
          emoji: t.icon,
          title: t.title,
          desc: t.desc,
          saving: t.saving,
        }))
        setTips(mapped)
        setStep(s => Math.max(s, 4))
      })
      .catch(() => setTipsError('Could not load tips. Please try again.'))
      .finally(() => setTipsLoad(false))
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
          bill: result ? fmtD(result.breakdown.total) : '',
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
      a: "Our estimates are based on NEPRA-notified DISCO tariff rates and updated regularly. Actual bills may vary because Fuel Price Adjustment (FPA), quarterly adjustments, and DISCO-specific surcharges change often. For the most precise figure, compare with your DISCO's official tariff notice.",
    },
    {
      q: "What's the difference between protected and non-protected consumers?",
      a: 'Protected consumers use 200 units or less for 6 consecutive months and get subsidized, progressive slab rates. If you cross 200 units in any single month, that month is billed at higher non-protected rates applied to your ENTIRE consumption -- not just the extra units. This is why bills can jump sharply right after 200 units.',
    },
    {
      q: "How is next month's bill predicted?",
      a: 'Our AI model analyzes your current usage, seasonal consumption patterns typical in Pakistan, and your property type to generate a probability-weighted forecast.',
    },
    {
      q: 'Can solar really reduce my electricity bill?',
      a: 'Yes -- solar systems can cut bills by 50-80% depending on your city, roof size, and consumption, especially valuable once you are in the non-protected tariff bracket. Net metering lets you sell excess units back to the grid.',
    },
    {
      q: 'Is the solar consultation really free?',
      a: 'Absolutely. Our solar consultation is 100% free with no obligation. A qualified advisor will assess your property and walk you through savings potential and financing options.',
    },
  ]

  return (
    <>
      <Head>
        <title>Pakistan Electricity Bill Calculator & Solar Savings Advisor</title>
      </Head>

      {/* ── HERO ── */}
      <header className={styles.hero}>
        <div className={styles.page} style={{ paddingBottom: 0 }}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            AI-Powered • NEPRA 2025-26 Rates • All DISCOs
          </div>
          <h1 className={styles.heroTitle}>
            Estimate Your Pakistan Bijli Bill{' '}
            <span className={styles.heroAccent}>Before It Arrives</span>
          </h1>
          <p className={styles.heroSub}>
            Pakistan ka #1 bijli bill calculator — LESCO, FESCO, IESCO, MEPCO,
            GEPCO, PESCO, HESCO, SEPCO, QESCO, K-Electric sab ke liye.
          </p>
          <button
            className={styles.heroCta}
            onClick={() => document.getElementById('calculator')?.scrollIntoView({ behavior: 'smooth' })}
          >
            ⚡ Bill Calculate Karein
          </button>
          <div className={styles.heroStats}>
            {[['50K+', 'Bills Calculated'], ['₨2,400', 'Avg. Monthly Savings'], ['4.9★', 'User Rating']].map(([n, l]) => (
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
          {['Units', 'Bill', 'Predict', 'Bachao'].map((label, i) => {
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
              <div className={styles.calcTitle}>Bijli Bill Calculator</div>
              <div className={styles.calcSub}>Apni details daalein, foran estimate paayein</div>
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Mahine ke Units <span style={{ color: 'var(--red)' }}>*</span></label>
              <div className={styles.unitInput}>
                <input
                  className={styles.formInput}
                  type="number"
                  placeholder="e.g. 210"
                  min={0}
                  value={units}
                  onChange={e => setUnits(e.target.value)}
                />
                <span className={styles.unitSuffix}>kWh</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>DISCO / Shehar <span style={{ color: 'var(--red)' }}>*</span></label>
              <select className={styles.formSelect} value={disco} onChange={e => setDisco(e.target.value)}>
                <option value="">Select karein...</option>
                {pkRates.discos.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 6 }}>
                Rates last verified {pkRates.lastUpdated} — actual bill NEPRA ke monthly FPA se thora vary kar sakta hai.
              </div>
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
                    {pt === 'residential' ? '🏠 Ghar (Residential)' : '🏢 Karobar (Commercial)'}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button className={styles.btnPrimary} onClick={calculate}>
            Bill Calculate Karein ⚡
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
                  <div className={styles.calcTitle}>Aapka Bill Estimate</div>
                  <div className={styles.calcSub}>
                    {result.discoName} · {result.propType === 'residential' ? 'Residential' : 'Commercial'} · {result.units} kWh
                    {result.propType === 'residential' && (
                      <> · <span style={{ color: result.breakdown.isProtected ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                        {result.breakdown.isProtected ? 'Protected' : 'Non-Protected'}
                      </span></>
                    )}
                  </div>
                </div>
              </div>
              <div className={styles.resultsGrid}>
                <div className={styles.resultCard}>
                  <div className={styles.resultLabel}>Units</div>
                  <div className={styles.resultValue}>{result.units}</div>
                  <div className={styles.resultSub}>kWh is mahine</div>
                </div>
                <div className={styles.resultCard}>
                  <div className={styles.resultLabel}>Charges (Taxes se pehle)</div>
                  <div className={styles.resultValue}>{fmtD(result.breakdown.costOfElectricity + result.breakdown.fixedCharge)}</div>
                  <div className={styles.resultSub}>+{fmtD(result.breakdown.fixedCharge)} fixed charge shamil</div>
                </div>
                <div className={`${styles.resultCard} ${styles.resultHighlight}`}>
                  <div className={styles.resultLabel}>Kul Bill</div>
                  <div className={styles.resultValue}>{fmtD(result.breakdown.total)}</div>
                  <div className={styles.resultSub}>tamam taxes shamil</div>
                </div>
              </div>
            </section>

            {/* Itemized breakdown */}
            <section className={`${styles.card} ${styles.animIn}`} style={{ animationDelay: '0.05s' }}>
              <div className={styles.calcHeader}>
                <div className={styles.calcIcon} style={{ background: 'var(--blue-light)' }}>🧾</div>
                <div>
                  <div className={styles.calcTitle}>Itemized Bill Breakdown</div>
                  <div className={styles.calcSub}>DISCO-style charge breakdown</div>
                </div>
              </div>
              {[
                ['Cost of Electricity', result.breakdown.costOfElectricity],
                ['Fixed / Meter Charges', result.breakdown.fixedCharge],
                ['F.C Surcharge', result.breakdown.fcSurcharge],
                ['Electricity Duty', result.breakdown.electricityDuty],
                ['TV Fee', result.breakdown.tvFee],
                ['GST', result.breakdown.gst],
                ['N.J Surcharge', result.breakdown.njSurcharge],
              ].map(([label, val]) => (
                <div key={label as string} className={styles.predRow}>
                  <span className={styles.predLabel}>{label}</span>
                  <span className={styles.predValue}>{fmtD(val as number)}</span>
                </div>
              ))}
              <div className={styles.predRow} style={{ fontWeight: 700, borderTop: '1px solid var(--gray-200)', marginTop: 4, paddingTop: 12 }}>
                <span className={styles.predLabel}>Total Estimated Bill</span>
                <span className={styles.predValue} style={{ color: 'var(--blue-dark)' }}>{fmtD(result.breakdown.total)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 12 }}>
                Note: Ye estimate hai. Actual bill Fuel Price Adjustment (FPA), quarterly tariff adjustments, aur DISCO-specific surcharges ki wajah se differ ho sakta hai.
              </div>
            </section>

            {/* Prediction */}
            <section className={`${styles.card} ${styles.animIn}`} style={{ animationDelay: '0.1s' }}>
              <div className={styles.calcHeader}>
                <div className={styles.calcIcon} style={{ background: '#fff4e8' }}>🔮</div>
                <div>
                  <div className={styles.calcTitle}>Agli Mahine Ka Bill</div>
                  <div className={styles.calcSub}>AI se powered forecast</div>
                </div>
              </div>
              {predLoading && (
                <div className={styles.loadingWrap}>
                  <div className={styles.spinner} />
                  <div className={styles.loadingText}>Prediction generate ho rahi hai...</div>
                </div>
              )}
              {predError && <p className={styles.errorText}>{predError}</p>}
              {pred && !predLoading && (
                <div>
                  {[
                    ['Predicted Bill', <span key="pb" style={{ fontSize: 20, color: 'var(--blue-dark)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{fmtD(pred.predictedBill)}</span>],
                    ['Is Mahine Se Farq', <span key="ch" className={`${styles.badge} ${pred.direction === 'up' ? styles.badgeUp : pred.direction === 'down' ? styles.badgeDown : styles.badgeNeutral}`}>{pred.direction === 'up' ? '↑' : pred.direction === 'down' ? '↓' : '→'} {Math.abs(pred.changePercent).toFixed(1)}%</span>],
                    ['Expected Range', `₨${pred.rangeLow.toFixed(0)} – ₨${pred.rangeHigh.toFixed(0)}`],
                    ['Confidence', <span key="fc" style={{ color: 'var(--green)', fontWeight: 700 }}>{pred.confidence}</span>],
                    ['Trend', <span key="tr" style={{ fontSize: 13, color: 'var(--gray-600)', textAlign: 'right', maxWidth: '60%', display: 'block' }}>{pred.trendReason}</span>],
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
                  <div className={styles.calcTitle}>AI Savings Tips</div>
                  <div className={styles.calcSub}>Bijli bachane ke personalized tarike</div>
                </div>
              </div>
              {tipsLoading && (
                <div className={styles.loadingWrap}>
                  <div className={styles.spinner} />
                  <div className={styles.loadingText}>Tips generate ho rahi hain...</div>
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
                  <h2>☀️ Bijli Bill Kam Karna Chahte Hain?</h2>
                  <p>
                    Free solar savings assessment lein aur dekhein har mahine kitna bacha sakte hain.
                    No commitment, no hidden costs.
                  </p>
                  <div className={styles.solarBenefits}>
                    {['80% tak bijli bachao', 'Free professional consultation', 'Net metering se extra kamayi', 'ROI 4–7 saal mein typically'].map(b => (
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
                  <h3>Free Solar Consultation Lein</h3>
                  <p className={styles.leadFormSub}>
                    Apni details daalein — humare solar experts 24 ghante mein contact karenge.
                  </p>
                  <div className={styles.leadGrid}>
                    <input className={styles.leadInput} type="text"    placeholder="Poora Naam *"    value={lfName}  onChange={e => setLfName(e.target.value)} />
                    <input className={styles.leadInput} type="tel"     placeholder="Phone Number *" value={lfPhone} onChange={e => setLfPhone(e.target.value)} />
                    <input className={styles.leadInput} type="text"    placeholder="Shehar *"         value={lfCity}  onChange={e => setLfCity(e.target.value)} />
                    <input className={styles.leadInput} type="text"    placeholder="Monthly Bill"   value={result ? fmtD(result.breakdown.total) : ''} readOnly />
                    <input className={styles.leadInput} type="text"    placeholder="Monthly Units"  value={result ? result.units + ' kWh' : ''} readOnly />
                  </div>
                  {leadError && <p className={styles.leadError}>{leadError}</p>}
                  <button className={styles.btnSolar} onClick={submitLead} disabled={leadLoading}>
                    {leadLoading ? 'Submit ho raha hai...' : '☀️ Free Solar Consultation Lein'}
                  </button>
                  <p className={styles.formPrivacy}>🔒 Aapka data mehfooz hai. Hum kabhi share nahi karte.</p>
                </div>
              ) : (
                <div className={styles.successBox}>
                  <div className={styles.successIcon}>🌟</div>
                  <div className={styles.successTitle}>Consultation Request Ho Gayi!</div>
                  <div className={styles.successSub}>Humare solar experts 24 ghante mein contact karenge. Bachat ke liye tayyar ho jayein!</div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── FAQ ── */}
        <section className={styles.card} style={{ marginTop: 8 }}>
          <div className={styles.sectionLabel}>FAQ</div>
          <div className={styles.sectionTitle} style={{ marginBottom: 20 }}>Aam Sawalat</div>
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
          ⚡ Pakistan Bijli Bill Calculator · NEPRA rates ke mutabiq · Kisi bhi DISCO se affiliated nahi
        </footer>
      </main>
    </>
  )
}
