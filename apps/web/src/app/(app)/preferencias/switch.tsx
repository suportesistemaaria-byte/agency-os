'use client';
import { api } from '@/lib/trpc';
import { useAction } from '@/components/client';

export function PrefSwitch({
  eventType,
  channel,
  value,
}: {
  eventType: string;
  channel: 'inApp' | 'email' | 'whatsapp';
  value: boolean;
}) {
  const { run, pending } = useAction();
  return (
    <input
      type="checkbox"
      aria-label={`${eventType} ${channel}`}
      className="h-4 w-4 accent-[#1a1a18]"
      checked={value}
      disabled={pending}
      onChange={() =>
        run(() => api.setPreference.mutate({ eventType, channel, value: !value }), 'Preferência salva.')
      }
    />
  );
}
