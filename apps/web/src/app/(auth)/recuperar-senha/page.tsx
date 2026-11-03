'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { Button, Field, Input } from '@/components/ui';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    await authClient.requestPasswordReset({ email, redirectTo: '/redefinir-senha' });
    setSent(true);
  }
  return sent ? (
    <div className="space-y-3">
      <h1 className="text-[20px] font-semibold">Verifique seu e-mail</h1>
      <p className="text-muted">
        Se o e-mail existir, enviamos um link para criar uma nova senha. Em desenvolvimento, o link aparece no
        log do servidor.
      </p>
      <Link href="/login" className="text-[12.5px] text-muted">
        Voltar ao login
      </Link>
    </div>
  ) : (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-[20px] font-semibold">Recuperar senha</h1>
      <Field label="E-mail">
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" className="w-full">
        Enviar link
      </Button>
    </form>
  );
}
