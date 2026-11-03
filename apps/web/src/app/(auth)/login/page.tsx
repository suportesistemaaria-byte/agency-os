'use client';
import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button, Field, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/hoje';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const r = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (r.error)
      return setError(
        r.error.status === 401
          ? 'E-mail ou senha incorretos.'
          : (r.error.message ?? 'Não foi possível entrar.'),
      );
    router.push(next.startsWith('/') ? next : '/hoje');
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-[20px] font-semibold">Entrar</h1>
        <p className="text-muted">Use seu e-mail da agência.</p>
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
      <Button type="submit" variant="primary" className="w-full" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar'}
      </Button>
      <Link href="/recuperar-senha" className="block text-center text-[12.5px] text-muted">
        Esqueci minha senha
      </Link>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
