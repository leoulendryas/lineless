'use client';

import React from 'react';
import dynamic from 'next/dynamic'

// Use dynamic import for MapComponent to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-2 border-zinc-900 animate-[spin_3s_linear_infinite] rounded-sm"></div>
          <div className="absolute inset-2 border border-zinc-200 animate-[spin_2s_linear_infinite_reverse] rounded-sm"></div>
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-900 animate-pulse">Initializing Terminal</span>
      </div>
    </div>
  )
})

export default function Home() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent animate-spin"></div>
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-900">Syncing Terminal</span>
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex flex-col h-screen w-full bg-white font-sans overflow-hidden">
      {/* Better Auth Background Decorations */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-zinc-100/50 rounded-full blur-[120px] -z-10 translate-x-1/2 -translate-y-1/2"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-zinc-100/50 rounded-full blur-[120px] -z-10 -translate-x-1/2 translate-y-1/2"></div>
      
      {/* Decorative Technical Elements */}
      <div className="absolute top-10 left-10 w-2 h-2 border border-zinc-200 rotate-45 opacity-20"></div>
      <div className="absolute top-20 left-12 w-1 h-1 bg-zinc-900 rounded-full opacity-10"></div>
      <div className="absolute bottom-10 right-10 w-3 h-3 border border-zinc-900/10 rotate-12 opacity-20"></div>
      
      <div className="flex-1 relative z-0">
        <MapComponent />
      </div>
    </main>
  );
}
