import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — Mondeto',
}

export default function TermsPage() {
  return (
    <article style={{ maxWidth: 720, margin: '0 auto', padding: '20px 20px 32px', fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text)', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <Link
          href="/profile"
          aria-label="Close"
          style={{
            fontSize: 16,
            fontFamily: "'Press Start 2P', monospace",
            color: 'var(--text-muted)',
            textDecoration: 'none',
            padding: '4px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            lineHeight: 1,
          }}
        >
          ✕
        </Link>
      </div>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
        Last updated: <span style={{ fontStyle: 'italic' }}>DRAFT — pending legal review</span>
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>1. About Mondeto</h2>
        <p style={{ fontSize: 13 }}>
          Mondeto is an on-chain pixel-buying game on the Celo network. Players claim pixels on
          shared world maps by paying an accepted stablecoin to one of the Mondeto smart contracts
          on Celo mainnet (addresses listed in the project README under Deployments). The map,
          ownership, and pricing are determined entirely by the contracts — Mondeto operates the
          frontend, not the chain.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>2. Eligibility</h2>
        <p style={{ fontSize: 13 }}>
          You must be the legal age of majority in your jurisdiction. You confirm that using
          on-chain stablecoin payment apps is legal where you live.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>3. Wallet and self-custody</h2>
        <p style={{ fontSize: 13 }}>
          Mondeto never holds your funds. All transactions are signed by your wallet (e.g. MiniPay).
          You are solely responsible for your wallet, seed phrase, and stablecoin balance. We cannot
          recover funds sent in error.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>4. Pixel ownership</h2>
        <p style={{ fontSize: 13 }}>
          Owning a pixel grants you the right, recorded on-chain, to set its color, label, and
          linked URL. Mondeto reserves the right to hide content on the frontend that violates
          the rules in §5 — the on-chain record is permanent regardless.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>5. Acceptable use</h2>
        <p style={{ fontSize: 13 }}>
          Pixel labels and URLs must not contain illegal content, malware, phishing, harassment,
          hate speech, sexually explicit material, or content that infringes third-party rights.
          We may de-list pixels that violate these rules from the frontend at any time.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>6. Network fees and stablecoins</h2>
        <p style={{ fontSize: 13 }}>
          Pixel prices are charged in USDT. Network fees on Celo are paid by MiniPay automatically
          through fee abstraction. Prices are determined by the on-chain pricing curve and may
          change between transactions.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>7. Disclaimer and liability</h2>
        <p style={{ fontSize: 13 }}>
          Mondeto is provided &quot;as is&quot;. To the maximum extent allowed by law, we disclaim
          all warranties and are not liable for losses caused by smart-contract bugs, network
          downtime, stablecoin de-pegs, wallet compromises, or third-party services.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>8. Changes</h2>
        <p style={{ fontSize: 13 }}>
          We may update these Terms. Material changes will be announced in-app and on the support
          channel. Continuing to use Mondeto after a change means you accept the new Terms.
        </p>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>9. Contact</h2>
        <p style={{ fontSize: 13 }}>
          Questions? Reach us at <a href="https://t.me/mondetoSupport" style={{ color: 'var(--accent)' }}>t.me/mondetoSupport</a>.
        </p>
      </section>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 32 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>← Back to Mondeto</Link>
      </p>
    </article>
  )
}
