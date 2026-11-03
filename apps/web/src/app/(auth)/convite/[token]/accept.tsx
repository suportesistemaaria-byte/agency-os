'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button, Field, Input } from '@/components/ui';

export function AcceptInvite({
  token,
  email,
  name: n0,
  workspace,
}: {
  token: string;
  email: string;
  name: string;
  workspace: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(n0);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    let r = await authClient.signUp.email({ email, password, name });
    if (r.error) r = await authClient.signIn.email({ email, password });
    if (r.error) return setError(r.error.message ?? 'Não foi possível criar a conta.');
    const res = await fetch('/api/invites/accept', { method: 'POST', body: JSON.stringify({ token }) });
    if (!res.ok) return setError('Convite inválido.');
    router.push('/hoje');
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h1 className="text-[20px] font-semibold">Entrar na {workspace}</h1>
        <p className="text-muted">Convite para {email}</p>
      </div>
      <Field label="Seu nome">
        <Input required value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Crie uma senha (mínimo 8 caracteres)">
        <Input
          type="password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && <p className="text-[12.5px] text-bad">{error}</p>}
      <Button type="submit" variant="primary" className="w-full">
        Aceitar convite
      </Button>
    </form>
  );
}
