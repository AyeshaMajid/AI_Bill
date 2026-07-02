import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta charSet="utf-8" />
        <meta name="description" content="Free AI electricity bill calculator. Estimate your bill, predict next month's costs, get personalized saving tips, and request a free solar consultation." />
        <meta name="keywords" content="electricity bill calculator, solar savings, energy cost estimator, AI bill prediction, solar consultation" />
        <meta property="og:title" content="Electricity Bill Calculator & Solar Savings Advisor" />
        <meta property="og:description" content="Calculate your electricity bill instantly using AI. Get predictions, saving tips, and a free solar consultation." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
