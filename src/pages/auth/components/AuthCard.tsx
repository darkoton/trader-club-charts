import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}

/**
 * Centered auth card with uppercase title + optional subtitle.
 * Shared layout for Login / Register / Reset / Register step 2.
 */
export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 pb-12">
      <div className="w-full" style={{ maxWidth: 480 }}>
        <h1 className="mb-4 text-center text-[1.75rem] font-bold uppercase tracking-wide text-white sm:text-[2rem] lg:text-[2.375rem]">
          {title}
        </h1>

        {subtitle ? (
          <p className="mb-8 text-center text-[0.875rem] leading-relaxed text-[#BABDC3]">
            {subtitle}
          </p>
        ) : (
          <div className="mb-8" />
        )}

        <div className="rounded-2xl border border-white/[0.06] bg-card p-8">{children}</div>
      </div>
    </div>
  );
}
