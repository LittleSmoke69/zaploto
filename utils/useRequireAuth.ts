'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Rotas públicas que não devem redirecionar
    const publicPaths = ['/login', '/register'];

    // Garante que só roda no cliente
    if (typeof window === 'undefined') return;

    // Se estiver numa rota pública, não precisa checar sessão
    if (publicPaths.includes(pathname)) {
      setChecking(false);
      return;
    }

    // Sessão curta (some ao fechar o navegador)
    const userId = sessionStorage.getItem('user_id')
      || sessionStorage.getItem('profile_id'); // fallback temporário

    if (!userId) {
      router.replace('/login');
      return;
    }

    setChecking(false);
  }, [router, pathname]);

  return { checking };
}
