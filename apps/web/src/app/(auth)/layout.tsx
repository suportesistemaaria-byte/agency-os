import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-side px-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-[12px] font-bold text-white">
            4P
          </span>
          <span className="text-[15px] font-semibold">Agency OS</span>
        </div>
        <div className="rounded-xl border border-line bg-white p-6">{children}</div>
      </div>
    </div>
  );
}
