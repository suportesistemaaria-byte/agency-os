'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Button, Field, Input } from '@/components/ui';

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await authClient.resetPassword({ newPassword: password, token });
    if (r.error) return setError(r.error.message ?? 'Link inválido ou expirado.');
    router.push('/login');
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-[20px] font-semibold">Nova senha</h1>
      <Field label="Senha (mínimo 8 caracteres)">
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
        Salvar senha
      </Button>
    </form>
  );
}
export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
