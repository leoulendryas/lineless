'use client';

import dynamic from 'next/dynamic';

const AdminPanel = dynamic(() => import('@/components/AdminPanel'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-6">
        <div className="w-10 h-10 border-4 border-zinc-50 border-t-transparent animate-spin rounded-full"></div>
        <span className="text-[11px] font-black uppercase tracking-[0.5em] text-zinc-50">Initializing Admin Terminal...</span>
      </div>
    </div>
  )
});

export default function AdminPage() {
  return <AdminPanel />;
}
