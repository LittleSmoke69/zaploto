'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const setSessionArtifacts = (userId: string, userEmail: string) => {
    try {
      // Limpa possíveis restos de sessão anterior
      sessionStorage.removeItem('user_id');
      sessionStorage.removeItem('profile_id');
      sessionStorage.removeItem('profile_email');

      // Sessão (preferencial)
      sessionStorage.setItem('user_id', userId);
      sessionStorage.setItem('profile_id', userId);
      sessionStorage.setItem('profile_email', userEmail);

      // Compatibilidade (o dashboard ainda faz fallback para localStorage)
      localStorage.setItem('profile_id', userId);
      localStorage.setItem('profile_email', userEmail);

      // Cookie de sessão (sem Max-Age => expira ao fechar o navegador)
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const secureAttr = isHttps ? ' Secure;' : '';
      document.cookie = `user_id=${encodeURIComponent(userId)}; Path=/; SameSite=Lax;${secureAttr}`;
    } catch {
      // silencioso
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Informe email e senha.');
      return;
    }

    try {
      setLoading(true);

      const emailLower = email.toLowerCase().trim();

      const { data: user, error } = await supabase
        .from('profiles')
        .select('id, email, password_hash')
        .eq('email', emailLower)
        .single();

      if (error || !user) {
        setErrorMsg('Credenciais inválidas.');
        setLoading(false);
        return;
      }

      const matches = bcrypt.compareSync(password, user.password_hash || '');
      if (!matches) {
        setErrorMsg('Credenciais inválidas.');
        setLoading(false);
        return;
      }

      // Guarda artefatos de sessão (sessionStorage + cookie + fallback localStorage)
      setSessionArtifacts(user.id, user.email);

      // (Opcional) registra último login — ignora erro
      try {
        await supabase
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() })
          .eq('user_id', user.id);
      } catch {}

      router.push('/');
    } catch (err) {
      setErrorMsg('Erro ao efetuar login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-green-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8 border border-yellow-100">
        <div className="flex justify-center mb-6">
          <img
            src="/zaploto-logo.png"
            alt="ZapLoto"
            className="h-16 w-auto drop-shadow-md"
          />
        </div>

        <h1 className="text-2xl font-extrabold text-center text-green-800 mb-4">
          Acesse sua conta
        </h1>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm px-4 py-2 text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900"
            disabled={loading}
            autoComplete="username"
            inputMode="email"
          />

          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Senha"
            className="w-full px-4 py-3 border-2 border-yellow-200 rounded-lg focus:ring-2 focus:ring-green-500 text-gray-900"
            disabled={loading}
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-yellow-400 to-green-600 hover:from-yellow-500 hover:to-green-700 text-white font-semibold transition"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Não tem conta?{' '}
          <a
            href="/register"
            className="text-green-700 hover:text-green-800 font-medium"
          >
            Criar conta
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
