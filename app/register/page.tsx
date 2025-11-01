'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

const PROFILE_TABLE = 'profiles';

const makeUuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxx4xxxyxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim() || !email.trim() || !password.trim()) {
      setErrorMsg('Preencha todos os campos.');
      return;
    }

    try {
      setLoading(true);
      const normalizedEmail = email.trim().toLowerCase();

      // 1) Checa e-mail existente
      const { data: exists, error: existsErr } = await supabase
        .from(PROFILE_TABLE)
        .select('user_id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existsErr) console.error('[REGISTER] existsErr:', existsErr);

      if (exists?.user_id) {
        setErrorMsg('Este e-mail já está cadastrado.');
        setLoading(false);
        return;
      }

      // 2) Gera user_id
      const newUserId = makeUuid();

      // 3) Hash da senha
      const password_hash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));

      // 4) Insere perfil (somente user_id como PK)
      const { data: inserted, error: insertErr } = await supabase
        .from(PROFILE_TABLE)
        .upsert(
          [
            {
              user_id: newUserId,
              full_name: fullName.trim(),
              email: normalizedEmail,
              password_hash,
              created_at: new Date().toISOString(),
            },
          ],
          { onConflict: 'email', ignoreDuplicates: false }
        )
        .select('user_id, email')
        .single();

      if (insertErr || !inserted?.user_id) {
        console.error('[REGISTER] insertErr:', insertErr);
        setErrorMsg(insertErr?.message || 'Erro ao salvar o perfil.');
        setLoading(false);
        return;
      }

      // 5) Sessão curta (fecha o navegador ⇒ volta pro login)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('user_id', inserted.user_id);
        sessionStorage.setItem('email', inserted.email);
        // cookie de sessão (sem Max-Age) para middleware
        document.cookie = `user_id=${inserted.user_id}; Path=/; SameSite=Lax`;
      }

      setSuccessMsg('Conta criada com sucesso!');
      router.push('/login'); // força passar pela tela de login
    } catch (err: any) {
      console.error('[REGISTER] Error:', err);
      setErrorMsg(err?.message || 'Erro ao criar a conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-green-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 border border-yellow-100">
        <div className="flex justify-center mb-6">
          <img src="/zaploto.png" alt="ZapLoto" className="h-16 w-auto drop-shadow-md" />
        </div>

        <h1 className="text-2xl font-extrabold text-center text-green-800 mb-4">Criar conta</h1>

        {errorMsg && <div className="mb-4 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm px-4 py-2 text-center">{errorMsg}</div>}
        {successMsg && <div className="mb-4 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm px-4 py-2 text-center">{successMsg}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nome completo" className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900" disabled={loading} />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail" className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900" disabled={loading} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Senha" autoComplete="new-password" className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900" disabled={loading} />
          <button type="submit" disabled={loading} className="w-full py-3 rounded-lg bg-gradient-to-r from-yellow-400 to-green-600 hover:from-yellow-500 hover:to-green-700 text-white font-semibold transition">
            {loading ? 'Criando conta...' : 'Registrar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Já tem conta?{' '}
          <a href="/login" className="text-green-700 hover:text-green-800 font-medium">Fazer login</a>
        </p>
      </div>
    </div>
  );
}
