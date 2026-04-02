'use client';

import React from 'react';
import dynamic from 'next/dynamic'

// Use dynamic import for MapComponent to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('@/components/MapComponent'), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex items-center justify-center bg-white dark:bg-zinc-950 transition-colors duration-500">
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-4 border-zinc-900 dark:border-zinc-50 animate-[spin_3s_linear_infinite] rounded-sm"></div>
          <div className="absolute inset-2 border-2 border-zinc-200 dark:border-zinc-800 animate-[spin_2s_linear_infinite_reverse] rounded-sm shadow-xl"></div>
        </div>
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
      <div className="h-full w-full flex items-center justify-center bg-white dark:bg-zinc-950">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 border-4 border-zinc-900 dark:border-zinc-50 border-t-transparent animate-spin rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <main className="relative flex flex-col h-screen w-full bg-white dark:bg-zinc-950 font-sans overflow-hidden transition-colors duration-500">
      {/* Background Decorations */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-zinc-100/50 dark:bg-zinc-900/20 rounded-full blur-[120px] -z-10 translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-zinc-100/50 dark:bg-zinc-900/20 rounded-full blur-[120px] -z-10 -translate-x-1/3 translate-y-1/3"></div>
      
      {/* Technical Brutalist Details */}
      <div className="absolute top-12 left-12 w-3 h-3 border-2 border-zinc-200 dark:border-zinc-800 rotate-45 opacity-40"></div>
      <div className="absolute top-24 left-14 w-1.5 h-1.5 bg-zinc-900 dark:bg-zinc-50 rounded-full opacity-20"></div>
      <div className="absolute bottom-12 right-12 w-4 h-4 border-2 border-zinc-900/10 dark:border-zinc-50/10 rotate-12 opacity-40"></div>
      
      <div className="flex-1 relative z-0">
        <MapComponent />
      </div>
    </main>
  );
}
