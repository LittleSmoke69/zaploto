'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const LoginPage = () => {
  const router = useRouter();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Informe email e senha.');
      return;
    }

    setLoading(true);

    // procura o usuário pelo e-mail
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, password')
      .eq('email', email.toLowerCase())
      .limit(1)
      .single();

    if (error || !data) {
      setLoading(false);
      setErrorMsg('Credenciais inválidas.');
      return;
    }

    // compara senha enviada com a armazenada
    if (data.password !== password) {
      setLoading(false);
      setErrorMsg('Credenciais inválidas.');
      return;
    }

    // login ok -> salva "sessão" no localStorage
    window.localStorage.setItem('profile_id', data.id);

    setLoading(false);

    // manda pro dashboard (/)
    router.push('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-6">
          Entrar
        </h1>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm px-4 py-2">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
              placeholder="voce@email.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
              placeholder="********"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50 transition"
          >
            {loading ? 'Entrando...' : 'Login'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Não tem conta?{' '}
          <a
            href="/register"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Criar conta
          </a>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
