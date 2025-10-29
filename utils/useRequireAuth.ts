'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useRequireAuth() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const storedId = window.localStorage.getItem('profile_id');

    if (!storedId) {
      router.push('/login');
      return;
    }

    setChecking(false);
  }, [router]);

  return { checking };
}
