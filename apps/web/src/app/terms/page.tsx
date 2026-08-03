import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms and Conditions — Mondeto',
}

// Celo Mini Apps Terms and Conditions, provided by counsel. The Mondeto
// game description (§5) and fee wording (§6) were aligned with the
// deployed contract mechanics (price doubles on purchase, halves over
// each 30-day period to a minimum price; 5% fee deducted from the
// previous owner's proceeds; unowned-pixel proceeds go to the contract
// treasury). Any further edits to this text need legal sign-off.

const SECTIONS: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: '1. Introduction and Acceptance',
    paragraphs: [
      'These Terms and Conditions (the "Terms") govern your access to and use of the mini applications operated by cLabs, Inc. d/b/a Celo Core Co. ("Celo Core Co.", "we", "us" or "our"), made available through the MiniPay environment on the Celo network, including MiniQuiz, Mondeto and MiniStreak (collectively the "Mini Apps" or the "Services", singly a "Mini App").',
      'These Terms are a legally binding contract between you and us and apply in full force and effect to your use of the Services. By accessing or using any Mini App you agree to be legally bound by these Terms. If you do not agree with the Terms, you must not use the Services.',
      'These Terms incorporate by reference our Privacy Policy and any app-specific terms presented within a Mini App.',
    ],
  },
  {
    title: '2. Definitions',
    paragraphs: [
      '"Wallet" means the self-custodial blockchain wallet you use to interact with a Mini App. We do not create, control, or have access to your Wallet. You are solely responsible for securing and controlling access to your Wallet, including any private key or back-up phrases associated with it.',
      '"Celo" or the "Celo Network" means the decentralized, permissionless Celo blockchain network on which the Services operate. We do not control Celo and therefore cannot ensure that transactions will be confirmed, processed or completed as intended.',
      '"Digital Assets" means any tokens transacted through the Services (including, for example, USDT, USDC, USDm, as applicable to a given Mini App).',
      '"Username" means an optional display name a user may add; no identity verification is performed.',
    ],
  },
  {
    title: '3. Eligibility and Availability',
    paragraphs: [
      'This Site and the Services are not for use by any minors. You must be at least 18 years of age to use the Services, or the older age of majority in your country. By using the Services you represent and warrant that you are at least 18 years old and are legally capable of entering into a binding contract and that you are not prohibited from using the Services under applicable laws or regulations in your country.',
      'The Services are available only in those jurisdictions where the MiniPay environment is available. Availability may be limited where required by law, including regulatory restrictions applicable to particular stablecoins in certain jurisdictions. In particular, the Services are not offered or made available to users located in the People’s Republic of China.',
      'You may not use the Services if you are subject to applicable sanctions or are located in a comprehensively sanctioned jurisdiction (see Section 17).',
    ],
  },
  {
    title: '4. Wallet-Based Access; No Custody; No KYC',
    paragraphs: [
      'The Services are accessed through your self-custodial Wallet. We do not create or hold accounts or private keys, and we do not take custody or control of your Digital Assets at any time.',
      'We do not perform identity verification (KYC) and do not collect identity documents. You may optionally add a Username; you are responsible for the content of any Username you choose.',
      'You are solely responsible for the security of your Wallet, recovery phrase and keys. We cannot reverse transactions or restore access to a lost or compromised Wallet.',
    ],
  },
  {
    title: '5. Description of the Services',
    paragraphs: [
      'MiniQuiz (miniquiz.club) — a quiz game where you join a global community and try to solve quizzes as fast as possible. Judging and prize payouts to participants are administered by and according to the sole discretion of Celo Core Co. and paid in USDT. There is currently no fee for playing MiniQuiz.',
      'Mondeto (mondeto.app) — a game where you may purchase pixels on digital representations of the world, one pixel at a time, across one or more identical maps. When a pixel is purchased, its price immediately doubles (2 times) for the next purchaser. The price of a pixel then gradually halves over each thirty (30) day period, down to a minimum price set in the smart contract. This means that if you purchase a pixel for two (2) units of a given digital asset, the price to purchase that pixel from you starts at four (4) units and returns to approximately two (2) units after thirty (30) days, continuing to halve thereafter while the pixel is not repurchased. When another user purchases a pixel you own, you receive the purchase price minus the service fee described in Section 6. Operated through its own smart contracts; Mondeto accepts payments in USDT, USDC and USDm.',
      'MiniStreak — a daily check-in game with weekly rewards.',
      'We may add, modify, suspend or discontinue any feature at any time. The Services are provided on an ‘as available’ basis and depend on third-party infrastructure including the MiniPay environment and the Celo Network.',
    ],
  },
  {
    title: '6. Fees & Prizes',
    paragraphs: [
      'For Mondeto, Celo Core Co. may receive a service fee of up to five percent (5%) of the value of each purchase of an owned pixel, deducted from the amount paid to the previous owner. The full purchase price of a previously unowned pixel is paid to Celo Core Co.’s smart-contract treasury. For MiniQuiz, judging and prize amounts are determined in the sole discretion of and paid by Celo Core Co. via its admin process in USDT. Participating in some of the Services and transacting on the Celo Network may require the payment of network "gas" fees. Gas fees fluctuate, are payable by you to network validators, and are non-refundable. Applicable amounts and currency are presented to you before you confirm a transaction.',
    ],
  },
  {
    title: '7. Blockchain Transactions and Associated Risks',
    paragraphs: [
      'Celo Core Co. does not provide trading, investment, or brokerage accounts or facilities, nor do we provide investment, financial, tax, or accounting advice of any kind. You are solely responsible for determining whether the purchasing and transacting in Digital Assets is appropriate for you. You acknowledge and accept that:',
      'Blockchain transactions are irreversible; once confirmed they cannot be cancelled, recalled or refunded by us.',
      'You are responsible for network (gas) fees, which fluctuate and are non-refundable.',
      'Digital Assets can be volatile and may lose value or liquidity.',
      'Smart contracts may contain vulnerabilities, which may be exploited, resulting in loss of value; interaction is at your own risk.',
      'Network congestion, forks, outages or changes to the Celo network or MiniPay environment may interrupt the Services.',
    ],
  },
  {
    title: '8. Acceptable Use and Restrictions',
    paragraphs: [
      'You represent, warrant, and agree not to use the Services to:',
      'Violate any applicable law or regulation;',
      'Engage in money laundering, fraud or sanctions evasion;',
      'Infringe the copyright, trademark, patent, trade secret or other intellectual property or other proprietary rights of third-parties;',
      'Interfere with, exploit or attack the Services or underlying infrastructure;',
      'Cheat or manipulate game outcomes or rewards;',
      'Circumvent any access or eligibility restriction;',
      'Sell, sublicense or otherwise commercialize any content or material from the Services;',
      'Use a VPN or other means to evade geographic or sanctions-based access restrictions.',
    ],
  },
  {
    title: '9. Intellectual Property',
    paragraphs: [
      'Celo Core Co. and/or its licensors own all rights to the intellectual property and material contained in the Services, and all such rights are reserved. You are granted a limited, non-exclusive, non-transferable, revocable licence to use the Services for their intended purpose only, subject to the restrictions in these Terms.',
    ],
  },
  {
    title: '10. Third-Party Services',
    paragraphs: [
      'The Services rely on or link to third-party services, including the MiniPay environment, the Celo Network, and hosting and infrastructure providers. We are not responsible for third-party services, which operate under their own terms. We have no control or responsibility for any third-party services and linking to or permitting the use, access, or installation of any third-party services does not imply approval or endorsement of the service by Celo Core Co. You must review and agree to the terms and privacy practices of each third-party service you use.',
    ],
  },
  {
    title: '11. Disclaimers of Warranties',
    paragraphs: [
      'To the maximum extent permitted by applicable law, the Services are provided "as is" and "as available" without warranties of any kind. Celo Core Co. hereby disclaims all warranties and conditions with regard to the services, including all express, implied or statutory warranties, and including warranties of merchantability, fitness for a particular purpose, non-infringement, availability, accuracy or security. We do not represent or warrant that the Services will be uninterrupted or error free, that defects will be corrected, or that the Services or the server that makes them available are free of viruses or other harmful components. You agree that Celo Core Co. is not be responsible for unauthorized access to or alteration of your devices, transmissions or data, any material or data sent or received or not sent or received, or any transactions entered into through the Services. Nothing contained in the Services constitutes legal, financial or other professional advice.',
    ],
  },
  {
    title: '12. Limitation of Liability',
    paragraphs: [
      'In no event shall Celo Core Co. or its officers, directors, employees and affiliates be liable for any indirect, incidental, special, consequential or punitive damages, or any damages whatsoever, including, or loss of profits, Digital Assets, data or goodwill, arising out of or in connection with the use or performance of the Services, whether based on contract, tort, negligence, strict liability, or otherwise, even if Celo Core Co. or its officers, directors, employees and affiliates have been advised of the possibility of damages. To the that the exclusion or limitation of liability is not permitted in certain jurisdictions, this limitation may subject to certain restrictions.',
    ],
  },
  {
    title: '13. Indemnification',
    paragraphs: [
      'You agree to indemnify and hold harmless Celo Core Co. and its officers, directors, employees and affiliates from and against any claims, liabilities, costs, demands, causes of action, damages and expenses (including reasonable attorneys’ fees) arising out of or in any way related to your use of the Services or your breach of these Terms, to the fullest extent permitted by applicable law.',
    ],
  },
  {
    title: '14. Suspension and Termination',
    paragraphs: [
      'We may suspend or terminate your access to the Services at any time, including where required by law, to protect the Services or other users, or where we reasonably believe you have breached these Terms. You may stop using the Services at any time. Provisions that by their nature should survive termination will do so.',
    ],
  },
  {
    title: '15. Changes to the Terms or Services',
    paragraphs: [
      'Celo Core Co. is permitted to revise these Terms from time to time and at any time. We will notify you of material changes by updating the effective date at the top of these Terms. Celo Core Co. reserves the right to modify or discontinue the Services in whole or in part at any time. By continuing to use the Services after changes take effect, you accept the revised Terms. You are expected to review these Terms regularly. If you terminate your use of the Services, your license thereto terminates immediately.',
    ],
  },
  {
    title: '16. Governing Law and Dispute Resolution',
    paragraphs: [
      'These Terms are governed by and construed in accordance with the laws of the State of California and applicable United States federal law without giving effect to any conflicts of laws principles that may require the application of the laws of a different jurisdiction. You submit to the exclusive jurisdiction and venue of the appropriate arbitral tribunal located in San Francisco, California for the resolution of any disputes.',
      'Any claims arising out of, relating to, or connected with these Terms must be asserted individually in binding arbitration. Before either party may seek arbitration, they must first send the other party a written notice of dispute describing the nature and basis of the claim and the requested relief. Notices to Celo Core Co. should be sent to: legal@celo.org. After the notice is received, the parties may attempt to resolve the dispute informally for 30 days before either party may begin an arbitration proceeding.',
      'Arbitration shall be conducted through the American Arbitration Association (AAA) under its Consumer Arbitration Rules, available at www.adr.org, by a single neutral arbitrator. Claims below USD 10,000 may be resolved through binding non-appearance-based arbitration. Any hearing will be held in San Francisco, California unless the parties agree otherwise. The United States Arbitration Act governs the interpretation and enforcement of these arbitration provisions.',
      'There is only one exception to the arbitration requirement: Celo Core Co. may seek injunctive or other appropriate relief in any court of competent jurisdiction where it reasonably believes you have violated or threatened to violate its intellectual property rights.',
      'TO THE EXTENT ALLOWED BY LAW, YOU AGREE TO IRREVOCABLY WAIVE ANY RIGHT TO A TRIAL BY JURY OR TO PARTICIPATE AS A REPRESENTATIVE OR CLASS MEMBER IN ANY LAWSUIT, ARBITRATION OR OTHER PROCEEDING FILED AGAINST CELO CORE CO.',
    ],
  },
  {
    title: '17. Compliance and Sanctions',
    paragraphs: [
      'You represent and warrant that you are not located, ordinarily resident, organized, established or domiciled in Iran, Cuba, North Korea, Syria, the Russian-occupied regions of Ukraine (Crimea, Donetsk and Luhansk), or any other country or jurisdiction against which the United States maintains comprehensive economic sanctions or an arms embargo.',
      'You shall not use, and will not allow any restricted persons to use, a VPN or other means to evade geographic or sanctions-based access restrictions. You will comply with all applicable export-control, anti-money-laundering and sanctions laws when using the Services.',
    ],
  },
  {
    title: '18. General',
    paragraphs: [
      'Severability: if any provision of these Terms is found to be unenforceable or invalid under applicable law, that provision shall be removed without affecting the remaining provisions.',
      'Assignment: Celo Core Co. may assign, transfer and subcontract its rights and obligations under these Terms without notice or consent. You may not assign, transfer or subcontract any of your rights or obligations without our consent.',
      'Entire Agreement: these Terms, together with our Privacy Policy and any app-specific terms, constitute the entire agreement between Celo Core Co. and you regarding the Services, and supersede all prior agreements and understandings.',
      'No Waiver: no failure or delay by Celo Core Co. to enforce any provision is a waiver of that provision.',
      'Force Majeure: we are not liable for delay or failure caused by events beyond our reasonable control.',
    ],
  },
  {
    title: '19. Securities Disclaimer',
    paragraphs: [
      'Nothing in these Terms or in the Services constitutes an offer to sell, or the solicitation of an offer to buy, any securities or tokens.',
    ],
  },
  {
    title: '20. Contact',
    paragraphs: [
      'For questions about these Terms, please contact: legal@celo.org, Celo Core Co.',
    ],
  },
]

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
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Celo Mini Apps Terms and Conditions</h1>
      <p style={{ fontSize: 13, marginBottom: 4 }}>Mondeto T&amp;C&rsquo;s</p>
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
        Our Privacy Policy is available at{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)' }}>
          mondeto.app/privacy
        </Link>
        .
      </p>

      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 32 }}>
        <Link href="/" style={{ color: 'var(--accent)' }}>← Back to Mondeto</Link>
      </p>
    </article>
  )
}
