import { ArrowRightIcon } from '@radix-ui/react-icons';
import { cn } from '../lib/utils';

export function BentoGrid({ children, className }) {
  return (
    <div
      className={cn(
        'grid w-full auto-rows-[minmax(18rem,auto)] grid-cols-1 md:grid-cols-3 gap-6 md:gap-7',
        className
      )}
    >
      {children}
    </div>
  );
}

export function BentoCard({
  name,
  className,
  background,
  Icon,
  description,
  href = '#',
  cta = 'Learn more',
  onCtaClick
}) {
  return (
    <div
      key={name}
      className={cn(
        'group relative col-span-1 md:col-span-3 flex min-h-[18rem] flex-col justify-between overflow-hidden rounded-3xl',
        'border border-purple-200/90 bg-white/80 backdrop-blur-xl',
        'hover:border-purple-400 hover:bg-white transition-all duration-300',
        'shadow-[0_16px_44px_-22px_rgba(54,36,74,0.28)]',
        className
      )}
    >
      {/* Background Graphic */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40 transition-opacity duration-300 group-hover:opacity-75">
        {background}
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 p-8 sm:p-10">
        <div className="pointer-events-none flex flex-col gap-3 transition-all duration-300 lg:group-hover:-translate-y-5">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-300 bg-purple-100 text-purple-800 transition-transform duration-300 group-hover:scale-95">
            {Icon && <Icon className="h-6 w-6" />}
          </div>
          <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            {name}
          </h3>
          <p className="max-w-xl text-base sm:text-lg text-slate-600 leading-relaxed font-normal">
            {description}
          </p>
        </div>

        {/* Mobile CTA (always visible on small screens) */}
        <div className="flex w-full items-center pt-5 lg:hidden">
          <a
            href={href}
            onClick={onCtaClick}
            className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-5 py-3 text-sm font-bold text-purple-900 hover:bg-purple-200 transition-colors cursor-pointer"
          >
            <span>{cta}</span>
            <ArrowRightIcon className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Desktop Animated Reveal CTA (slides up from bottom on hover) */}
      <div className="pointer-events-none absolute bottom-0 z-20 hidden w-full translate-y-6 flex-row items-center p-8 sm:p-10 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 lg:flex">
        <a
          href={href}
          onClick={onCtaClick}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-purple-100 px-5 py-3 text-sm font-bold text-purple-900 hover:bg-purple-200 transition-colors cursor-pointer"
        >
          <span>{cta}</span>
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </a>
      </div>

      {/* Subtle hover gradient wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-purple-100/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}
