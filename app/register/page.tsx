'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const RegisterPage = () => {
  const router = useRouter();

  const [fullName, setFullName]   = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!fullName.trim()) {
      setErrorMsg('Informe seu nome.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Informe um email.');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Informe uma senha.');
      return;
    }

    setLoading(true);

    // tenta criar o registro manualmente
    const { data, error } = await supabase
      .from('profiles')
      .insert([
        {
          full_name: fullName,
          email: email.toLowerCase(),
          password: password // <- texto puro, como você pediu
        }
      ])
      .select('id')
      .single();

    if (error) {
      // erro comum: e-mail duplicado (unique constraint)
      setLoading(false);
      setErrorMsg(error.message || 'Erro ao registrar usuário.');
      return;
    }

    if (!data?.id) {
      setLoading(false);
      setErrorMsg('Não foi possível criar o usuário.');
      return;
    }

    // sucesso
    setSuccessMsg('Conta criada com sucesso! Faça login.');
    setLoading(false);

    // manda pro login
    router.push('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-6">
          Criar conta
        </h1>

        {errorMsg && (
          <div className="mb-4 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm px-4 py-2">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 rounded-lg bg-green-100 border border-green-300 text-green-700 text-sm px-4 py-2">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome completo
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-gray-900"
              placeholder="Seu nome"
              disabled={loading}
            />
          </div>

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
            {loading ? 'Criando conta...' : 'Registrar'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600 mt-6">
          Já tem conta?{' '}
          <a
            href="/login"
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Fazer login
          </a>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
