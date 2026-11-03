'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button, Field, Input } from '@/components/ui';

export default function PortalLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const r = await authClient.signIn.email({ email, password });
    if (r.error)
      return setError(
        r.error.status === 429
          ? 'Muitas tentativas. Aguarde alguns segundos.'
          : 'E-mail ou senha incorretos.',
      );
    router.push('/portal');
    router.refresh();
  }
  return (
    <div className="grid min-h-screen place-items-center bg-side px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-[380px] space-y-4 rounded-xl border border-line bg-white p-6"
      >
        <div>
          <h1 className="text-[20px] font-semibold">Portal do cliente</h1>
          <p className="text-muted">Aprove conteúdos, peça alterações e acompanhe suas solicitações.</p>
        </div>
        <Field label="E-mail">
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && <p className="text-[12.5px] text-bad">{error}</p>}
        <Button type="submit" variant="primary" className="w-full">
          Entrar
        </Button>
      </form>
    </div>
  );
}
