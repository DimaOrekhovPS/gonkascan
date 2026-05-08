interface CardProps {
  icon: string
  title: string
  description: string
  href?: string
  onClick?: () => void
}

function ResourceCard({ icon, title, description, href, onClick }: CardProps) {
  const content = (
    <>
      <div className="flex items-center justify-center w-12 h-12 shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-all duration-300 group-hover:scale-105 group-hover:bg-accent-500/8 group-hover:border-accent-400/30">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-[15px] font-semibold text-slate-50 group-hover:text-accent-300 transition-colors tracking-tight">{title}</div>
          <svg
            className="w-3.5 h-3.5 text-slate-600 group-hover:text-accent-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </div>
        <div className="text-[13px] text-slate-400 leading-relaxed mt-1">{description}</div>
      </div>
    </>
  )

  const baseCls = 'group flex items-center gap-3 sm:gap-4 surface surface-hover p-4 sm:p-5 cursor-pointer'

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={baseCls}>
        {content}
      </a>
    )
  }
  return (
    <button onClick={onClick} className={`${baseCls} text-left`}>
      {content}
    </button>
  )
}

export function Resource({ onNavigate }: { onNavigate?: (page: string) => void }) {
  return (
    <div className="space-y-8 sm:space-y-14 animate-fade-in">

      {/* Hero */}
      <section className="relative overflow-hidden surface aurora-bg border-gradient-top p-5 sm:p-10 md:p-12">
        <div className="absolute inset-0 grid-overlay opacity-60 pointer-events-none" />
        <div className="relative">
          <span className="chip border-accent-400/30 bg-accent-500/10 text-accent-300 mb-4 sm:mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 shadow-[0_0_6px_rgba(62,229,177,0.7)]" />
            About the project
          </span>
          <h2 className="text-[26px] sm:text-4xl md:text-5xl font-extrabold text-slate-50 mb-4 sm:mb-5 tracking-tight leading-[1.1]">
            Gonka Project <span className="text-gradient-accent">Overview</span>
          </h2>
          <p className="text-slate-300 leading-relaxed text-[14px] sm:text-base max-w-3xl">
            Gonka is a decentralized network for high-efficiency AI compute — run by those who run it.
            It functions as a cost-effective and efficient alternative to centralized cloud services for
            AI model training and inference. As a protocol, it&apos;s not a company or a start-up.
          </p>
        </div>
      </section>

      {/* Official Resources */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title">Official Resources</h2>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">6 links</span>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <ResourceCard icon="🌐" title="Official Website" description="gonka.ai" href="https://gonka.ai/" />
          <ResourceCard icon="📄" title="Tokenomics" description="Project tokenomics" href="https://gonka.ai/tokenomics.pdf" />
          <ResourceCard icon="📄" title="Whitepaper" description="Technical documentation" href="https://gonka.ai/whitepaper.pdf" />
          <ResourceCard icon="💬" title="Discord" description="Official Discord server" href="https://discord.com/invite/RADwCT2U6R" />
          <ResourceCard icon="🐦" title="X (Twitter)" description="Official account" href="https://x.com/gonka_ai" />
          <ResourceCard icon="💻" title="GitHub" description="Project source code" href="https://github.com/gonka-ai/gonka" />
        </div>
      </section>

      {/* Developer Resources */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="section-title">Developer Resources</h2>
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">5 links</span>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <ResourceCard
            icon="📚"
            title="Developer Quickstart"
            description="Official guide to creating a developer account and sending your first Gonka API request."
            href="https://gonka.ai/developer/quickstart/"
          />
          <ResourceCard
            icon="🪙"
            title="Test GNK Faucet"
            description="Get test GNK to pay for your initial inference requests."
            href="https://gnk.space/faucet"
          />
          <ResourceCard
            icon="🧩"
            title="GonkaAI Gateway"
            description="Community proxy with an OpenAI-compatible inference API and GNK billing."
            href="https://gonka-gateway.mingles.ai/"
          />
          <ResourceCard
            icon="🎮"
            title="GonkaGate"
            description="Community gateway with free signup credits and a Chat Playground."
            href="https://gonkagate.com/"
          />
          <ResourceCard
            icon="💰"
            title="Bounty Program"
            description="Recognize developers enhancing Gonka's performance, reliability, and security."
            onClick={() => onNavigate?.('bounty')}
          />
        </div>
      </section>
    </div>
  )
}
