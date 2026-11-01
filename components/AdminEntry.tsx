'use client';

import Link from 'next/link';
import { LockKeyhole } from 'lucide-react';

export default function AdminEntry() {
  return (
    <Link
      href="/admin"
      aria-label="Store owner administration sign in"
      style={{
        position: 'fixed',
        left: 14,
        bottom: 14,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '10px 13px',
        border: '1px solid rgba(190,164,111,.55)',
        borderRadius: 999,
        background: '#171713',
        color: '#f4ead6',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.09em',
        textDecoration: 'none',
        boxShadow: '0 5px 22px rgba(0,0,0,.18)',
      }}
    >
      <LockKeyhole size={14} /> STORE ADMIN
    </Link>
  );
}
