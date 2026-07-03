import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — Mondeto',
}

// Mondeto Privacy Policy, provided by counsel — rendered verbatim. Any
// edits to this text need legal sign-off. Analytics-relevant constraint:
// §6 states no cookies / tracking storage, which is why PostHog runs
// with persistence: 'memory' (see posthog-provider.tsx).

const SECTIONS: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: '1. Introduction and Scope',
    paragraphs: [
      'This Privacy Policy explains how Celo Core Co. processes personal data when you use the Services, including the following Mini Apps: MiniQuiz, Mondeto, and MiniStreak, offered through the MiniPay environment on the Celo Network. This Privacy Policy along with the "Celo Mini Apps Terms and Conditions" forms part of a legally binding contract between Celo Core Co. and you.',
    ],
  },
  {
    title: '2. Data Controller and Contact Information',
    paragraphs: [
      'cLabs, Inc. d/b/a Celo Core Co. ("Celo Core Co.", "we", "us" or "our") acts as the Data Controller of any personal data collected via the Services. Celo Core Co. is responsible for ensuring that the systems and processes we use are compliant with data protection laws, to the extent applicable to us. Celo Core Co. personnel are required to comply with this Privacy Policy, where appropriate.',
      'Privacy contact: privacy@celo.org',
    ],
  },
  {
    title: '3. Personal Data We Collect',
    paragraphs: [
      'We collect information that you provide when using the Mini Apps, as well as certain technical and usage data. We process the minimum data needed to operate the games.',
      'The categories of personal data we collect are:',
      'Blockchain data: your public Wallet address and on-chain transactions associated with your use of the Services. This data is publicly recorded on the Celo Network blockchain (see Section 4).',
      'Username: an optional display name you choose. For some games usernames/names are stored off-chain per game and for others usernames are stored on-chain only, with no off-chain database.',
      'Usage and device data: app interaction and technical data, including device IP address and associated location data, identifiers associated with your device, device type, web browser characteristics, language preferences, and dates and times of use.',
      'Data you provide to us: we collect data that we may receive from you, in particular as is relevant for troubleshooting, user assistance and support, and bug reports / fixes.',
      'We do not use cookies or similar tracking technologies at this time (see Section 6).',
    ],
  },
  {
    title: '4. The Blockchain and Public Data',
    paragraphs: [
      'Transactions submitted through the Services are recorded on the Celo blockchain, which is publicly accessible, transparent, and immutable. Data written on-chain (including Wallet addresses, transactions, and in certain cases usernames), cannot be altered, erased, or made private by us and is outside our control. Please consider this carefully before transacting.',
    ],
  },
  {
    title: '5. How We Use Personal Data and Legal Bases',
    paragraphs: [
      'We use the personal data we collect for the following purposes:',
      'To operate and provide the Services, including for administering prize payouts for certain Mini Apps;',
      'To make our Services more intuitive and easy to use, using device data and other information you provide;',
      'To secure, debug, and monitor the Services, and to prevent abuse and misuse;',
      'To improve and develop our Services and user experience;',
      'To comply with legal obligations;',
      'To carry out any other purpose for which the information was collected.',
      'Where the GDPR or similar data protection law applies, our legal bases for processing are:',
      'Performance of a contract — to provide you with the Services you have requested.',
      'Legitimate interests — including security, prevention of misuse, improving the Services, and monitoring how our Services are used to help us improve them. We have assessed that our legitimate interests are not overridden by your interests or rights in these cases.',
      'Compliance with legal obligations.',
      'Consent — where required by applicable law.',
    ],
  },
  {
    title: '6. Cookies and Similar Technologies',
    paragraphs: [
      'The Mini Apps do not currently use cookies, local storage for tracking, or similar technologies. If this changes, this Policy will be updated and any required consent mechanism implemented.',
    ],
  },
  {
    title: '7. Sharing and Disclosure',
    paragraphs: [
      'We do not sell personal data. We may share personal data in the following circumstances:',
      'With our affiliates, vendors, consultants, and other service providers (sub-processors) who need access to such information to carry out work on our behalf, including those listed below.',
      'With the MiniPay environment and the Celo network, as necessary to deliver the Services. These operate under their own terms and privacy practices.',
      'In response to a lawful request for information if we believe disclosure is required by applicable law, regulation, or legal process.',
      'If we believe your actions are inconsistent with our user agreements or policies, or to protect the rights, property, and safety of us or any third party.',
      'In connection with, or during negotiations of, any merger, sale of company assets, financing, or acquisition of all or a portion of our business.',
      'With your consent or at your direction.',
      'We may also share aggregated or de-identified information that cannot reasonably be used to identify you.',
    ],
  },
  {
    title: '8. International Transfers',
    paragraphs: [
      'Personal data may be processed outside your country, including outside the EEA and UK. Celo Core Co.’s headquarters and some of its IT systems (including email) are located in the United States.',
      'Where transfers outside the EEA or UK are required, we protect those transfers using appropriate safeguards.',
    ],
  },
  {
    title: '9. Data Retention',
    paragraphs: [
      'In general, we retain personal data only for as long as necessary for the purposes described in this Policy, and in accordance with applicable legal and regulatory obligations.',
    ],
  },
  {
    title: '10. Security',
    paragraphs: [
      'We maintain administrative, technical, and physical safeguards designed to protect personal data against accidental, unlawful, or unauthorized destruction, loss, alteration, access, disclosure, or use. No method of transmission or storage is fully secure, and you remain responsible for the security of your Wallet and private keys.',
    ],
  },
  {
    title: '11. Your Rights',
    paragraphs: [
      'Subject to applicable law, you may have rights in relation to your personal data. These may include the right to:',
      'Access the personal data we hold about you, and receive a copy.',
      'Require that incomplete or inaccurate personal data is corrected (rectification).',
      'Request that we delete your personal data (right to erasure), subject to legal or other obligations that require us to retain it.',
      'Object to, or request restriction of, our processing of your personal data.',
      'Data portability where processing is based on consent or contract and is carried out by automated means.',
      'Withdraw consent at any time where processing is based on consent, without affecting the lawfulness of processing before withdrawal.',
      'California residents may additionally have rights under the CCPA/CPRA to: know what personal information is collected, sold, or disclosed; delete personal information; correct inaccurate personal information; opt out of the ‘sale’ or ‘sharing’ of personal information; and not be discriminated against for exercising these rights.',
      'To exercise your rights, please contact us at privacy@celo.org.',
      'Please note that rights cannot be exercised over immutable blockchain data (including Wallet addresses and transaction data), which is outside our control.',
    ],
  },
  {
    title: '12. Children',
    paragraphs: [
      'The Services are not directed to children under the age of 18. If you learn that a child under the age of 18 has provided personal information without consent, please contact us at privacy@celo.org so we can take appropriate steps to delete it.',
    ],
  },
  {
    title: '13. Third-Party Links and Services',
    paragraphs: [
      'The Services may rely on or link to third-party services with their own privacy practices. We have no control or responsibility for any third-party services and linking to or permitting the use, access, or installation of any third-party services does not imply approval or endorsement of the service or their privacy practices by Celo Core Co. We recommend carefully reviewing the privacy policy of each third-party service prior to use.',
    ],
  },
  {
    title: '14. Changes to this Policy',
    paragraphs: [
      'We reserve the right to change and update this Privacy Policy from time to time. If we make changes, you will be notified of the change by the updated date at the top of the Policy.',
    ],
  },
  {
    title: '15. Contact and Complaints',
    paragraphs: [
      'For privacy enquiries, please contact us at privacy@celo.org.',
      'If you are located in the EEA or UK, you also have the right to lodge a complaint with your local data protection supervisory authority.',
    ],
  },
]

export default function PrivacyPage() {
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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ fontSize: 13, marginBottom: 4 }}>Mondeto Privacy Policy</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
        Effective Date: June 8, 2026
      </p>

      {SECTIONS.map((section) => (
        <section key={section.title} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, marginBottom: 8 }}>{section.title}</h2>
          {section.paragraphs.map((p, i) => (
            <p key={i} style={{ fontSize: 13, marginBottom: 8 }}>
              {p}
            </p>
          ))}
        </section>
      ))}

      <p style={{ fontSize: 13, marginBottom: 24 }}>
        The Celo Mini Apps Terms and Conditions are available at{' '}
        <Link href="/terms" style={{ color: 'var(--accent)' }}>
          mondeto.app/terms
        </Link>
        .
      </p>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 32 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>← Back to Mondeto</Link>
      </p>
    </article>
  )
}
