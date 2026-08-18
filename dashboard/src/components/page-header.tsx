interface Stat { value: string | number; label: string }

interface PageHeaderProps {
  title: string;
  description: string;
  img: string;
  badge?: string;
  stats?: Stat[];
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, img, badge, stats, actions }: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden border-b border-slate-200 bg-slate-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25 transition duration-700" />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-slate-800/40" />

      <div className="relative px-8 py-10 lg:px-12">
        {badge && (
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/60">
            <span className="h-1 w-1 rounded-full bg-emerald-400" />
            {badge}
          </div>
        )}

        <h1 className="font-display text-[38px] font-semibold leading-[1.06] tracking-tight text-white lg:text-[46px]">
          {title}
        </h1>

        <p className="mt-3 max-w-2xl text-[14.5px] leading-relaxed text-white/60">
          {description}
        </p>

        {(stats || actions) && (
          <div className="mt-7 flex flex-wrap items-end gap-6">
            {stats?.map(({ value, label }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[26px] font-bold leading-none text-white">{value}</span>
                <span className="mt-1 text-[11px] text-white/45">{label}</span>
              </div>
            ))}
            {actions && (
              <div className="ml-auto flex items-center gap-2">
                {actions}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
