'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Radio, MapPin, User, Phone, Check, X, LogOut, RefreshCw } from 'lucide-react';

interface QueueEntry {
  id: string;
  ticketNumber: number;
  plateNumber: string;
  phoneNumber: string;
  fuelType: string;
  status: 'WAITING' | 'ACTIVE' | 'SERVED' | 'NO_SHOW';
  isWithinRange: boolean;
  user: {
    firstName: string;
    lastName: string;
    trustScore: number;
  };
}

interface Station {
  id: string;
  name: string;
  type: string;
  isPartner: boolean;
}

const TerminalPage = () => {
  const [accessKey, setAccessKey] = useState('');
  const [station, setStation] = useState<Station | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [stats, setStats] = useState({ totalRegistered: 0, activeCount: 0, currentTicket: 0 });
  const [resources, setResources] = useState<Record<string, boolean>>({ Benzene: true, Gasoline: true, Electric: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);

  const fetchQueue = useCallback(async () => {
    if (!station) return;
    try {
      const res = await fetch(`/api/terminal/queue?stationId=${station.id}`);
      const data = await res.json();
      if (data.queue) setQueue(data.queue);
      if (data.stats) setStats(data.stats);
    } catch (e) {
      console.error('Poll failed', e);
    }
  }, [station]);

  const toggleStock = async (fuelType: string) => {
    if (!station) return;
    const currentStatus = resources[fuelType];
    const newStatus = !currentStatus;
    
    try {
      // Use the existing reports API to broadcast official terminal status
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalId: station.id, 
          name: station.name,
          type: station.type,
          lat: 0, 
          lon: 0, 
          fuelType,
          status: newStatus ? 'Available' : 'Out of Stock',
          queue: 'Official Update',
          isPartner: true
        })
      });

      if (res.ok) {
        setResources(prev => ({ ...prev, [fuelType]: newStatus }));
      }
    } catch (e) {
      console.error('Stock update failed', e);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem('lineless_terminal_station');
    if (saved) {
      setStation(JSON.parse(saved));
    }
    setIsInitializing(false);
  }, []);

  useEffect(() => {
    if (station) {
      fetchQueue();
      const interval = setInterval(fetchQueue, 10000); // 10s poll
      return () => clearInterval(interval);
    }
  }, [station, fetchQueue]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/terminal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessKey })
      });
      const data = await res.json();
      if (data.station) {
        setStation(data.station);
        localStorage.setItem('lineless_terminal_station', JSON.stringify(data.station));
        localStorage.setItem('lineless_terminal_key', accessKey);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (e) {
      setError('Network Error');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (queueId: string, action: 'SERVED' | 'NO_SHOW') => {
    try {
      const res = await fetch('/api/terminal/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, action })
      });
      if (res.ok) {
        fetchQueue();
      }
    } catch (e) {
      console.error('Action failed', e);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('lineless_terminal_station');
    localStorage.removeItem('lineless_terminal_key');
    setStation(null);
  };

  if (isInitializing) return null;

  if (!station) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 selection:bg-zinc-50 selection:text-zinc-950">
        <div className="w-full max-w-md bg-white p-12 rounded-sm border-2 border-zinc-900 shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)] animate-in zoom-in-95 duration-300">
           <div className="w-16 h-16 bg-zinc-950 mx-auto mb-10 flex items-center justify-center rounded-sm">
             <Radio className="text-white animate-pulse" size={32} />
           </div>
           <h1 className="font-black text-3xl tracking-tighter text-zinc-950 uppercase italic text-center mb-4">Terminal Access</h1>
           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 text-center mb-10 leading-relaxed px-4">Initialize grid node connection via secure access key.</p>
           
           <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 ml-1">Secure Key</label>
                <input 
                  type="text" 
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="STATION-XXXX"
                  className="w-full h-14 bg-zinc-50 border-2 border-zinc-200 px-5 rounded-sm text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-zinc-950 transition-all text-zinc-950"
                  required
                />
              </div>
              {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest text-center">{error}</div>}
              <button 
                type="submit" 
                disabled={loading}
                className="w-full h-16 bg-zinc-950 text-white font-black uppercase tracking-[0.2em] rounded-sm text-[12px] shadow-xl hover:bg-zinc-800 transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? 'Validating...' : 'Connect to Grid'}
              </button>
           </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col selection:bg-zinc-950 selection:text-white transition-colors duration-500 font-sans">
      {/* Dashboard Header */}
      <header className="bg-zinc-950 text-white p-6 md:p-10 border-b-4 border-zinc-800 shadow-2xl sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white flex items-center justify-center rounded-sm shadow-xl">
                 <Radio className="text-zinc-950 animate-pulse" size={24} />
              </div>
              <h2 className="font-black text-2xl md:text-3xl tracking-tighter italic uppercase leading-none">{station.name}</h2>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-500 opacity-80 ml-1">Terminal Operator Dashboard</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button onClick={fetchQueue} className="p-4 hover:bg-zinc-800 border border-zinc-800 rounded-sm transition-all active:scale-90"><RefreshCw size={20} /></button>
            <button onClick={handleLogout} className="px-8 py-4 bg-white text-zinc-950 font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-zinc-200 transition-all active:scale-95 flex items-center gap-3"><LogOut size={16} /> Disconnect</button>
          </div>
        </div>
      </header>

      {/* Grid Stats Bar */}
      <div className="bg-white border-b-2 border-zinc-200 p-6 md:p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard label="Total Registered" value={stats.totalRegistered} icon={<User size={18} />} color="text-zinc-400" />
          <StatCard label="Active in 5km Zone" value={stats.activeCount} icon={<MapPin size={18} />} color="text-green-600" animate />
          <StatCard label="Last Ticket Served" value={`#${stats.currentTicket}`} icon={<Check size={18} />} color="text-blue-600" />
        </div>
      </div>

      {/* Resource Management Bar */}
      <div className="bg-zinc-100 border-b-2 border-zinc-200 p-4">
        <div className="max-w-7xl mx-auto flex items-center gap-6">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 border-r border-zinc-200 pr-6">Resource Control</span>
          <div className="flex gap-4">
            {station.type === 'fuel' ? (
              <>
                <StockToggle label="Benzene" active={resources.Benzene} onToggle={() => toggleStock('Benzene')} />
                <StockToggle label="Diesel" active={resources.Gasoline} onToggle={() => toggleStock('Gasoline')} />
              </>
            ) : (
              <StockToggle label="Electric" active={resources.Electric} onToggle={() => toggleStock('Electric')} />
            )}
          </div>
        </div>
      </div>

      {/* Main Terminal List */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 md:p-10">
        <div className="flex flex-col gap-10">
          <div className="flex justify-between items-end">
            <div className="flex flex-col gap-2">
              <h3 className="font-black text-4xl tracking-tighter uppercase italic text-zinc-950 leading-none">Live Queue</h3>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">Next 10 units pending grid clearance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {queue.length > 0 ? (
              queue.slice(0, 10).map((entry) => (
                <div key={entry.id} className={`p-8 bg-white border-2 rounded-sm transition-all group hover:translate-x-[-4px] hover:translate-y-[-4px] ${entry.status === 'ACTIVE' ? 'border-zinc-950 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]' : 'border-zinc-200 opacity-60 shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-8">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <span className="bg-zinc-950 text-white text-2xl font-black px-4 py-2 rounded-sm tracking-tighter">#{entry.ticketNumber}</span>
                        <div className="flex flex-col">
                           <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 leading-none mb-1">Plate Number</span>
                           <span className="text-xl font-black text-zinc-950 tracking-tighter leading-none uppercase">{entry.plateNumber}</span>
                        </div>
                        <div className="flex flex-col border-l-2 border-zinc-100 pl-4 ml-4">
                           <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 leading-none mb-1">Resource</span>
                           <span className="text-xl font-black text-zinc-950 tracking-tighter leading-none uppercase">{entry.fuelType}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`px-4 py-2 rounded-sm text-[10px] font-black uppercase tracking-[0.2em] border-2 transition-all ${entry.status === 'ACTIVE' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-zinc-300 border-zinc-200'}`}>
                      {entry.status}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-10 border-t border-zinc-100 pt-8">
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-2"><User size={12} /> Driver</span>
                      <span className="text-[12px] font-black text-zinc-950 uppercase tracking-widest">{entry.user.firstName} {entry.user.lastName}</span>
                      <div className="flex items-center gap-2 mt-1">
                         <span className="bg-zinc-100 px-2 py-1 text-[8px] font-black uppercase tracking-widest rounded-sm">Trust: {entry.user.trustScore}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 flex items-center gap-2"><Phone size={12} /> Comms</span>
                      <span className="text-[12px] font-black text-zinc-950 tracking-widest underline decoration-2 decoration-zinc-200 hover:decoration-zinc-950 transition-all cursor-pointer">
                        {entry.phoneNumber.slice(0, 4)}****{entry.phoneNumber.slice(-2)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={() => handleAction(entry.id, 'SERVED')}
                      className="flex-1 h-14 bg-zinc-950 text-white rounded-sm font-black text-[11px] uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-3"
                    >
                      <Check size={18} /> Clear Unit
                    </button>
                    <button 
                      onClick={() => handleAction(entry.id, 'NO_SHOW')}
                      className="w-14 h-14 bg-white border-2 border-red-200 text-red-500 rounded-sm font-black hover:bg-red-50 transition-all active:scale-95 flex items-center justify-center"
                      title="No Show"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="lg:col-span-2 p-24 bg-white border-2 border-dashed border-zinc-200 rounded-sm flex flex-col items-center justify-center text-center">
                <div className="w-20 h-20 bg-zinc-50 flex items-center justify-center rounded-full mb-8">
                   <User className="text-zinc-200" size={40} />
                </div>
                <h4 className="font-black text-xl text-zinc-300 uppercase italic tracking-tighter mb-2">Grid Silent</h4>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-200">No units currently pending clearance</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap');
        body { font-family: 'Space Grotesk', sans-serif; }
      `}</style>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  animate?: boolean;
}

const StatCard = ({ label, value, icon, color, animate }: StatCardProps) => (
  <div className="p-6 bg-zinc-50 border-2 border-zinc-100 rounded-sm hover:border-zinc-950 transition-all group">
    <div className="flex justify-between items-center mb-4">
      <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-400 group-hover:text-zinc-950 transition-colors">{label}</span>
      <div className={`${color} ${animate ? 'animate-pulse' : ''}`}>{icon}</div>
    </div>
    <div className="text-4xl font-black tracking-tighter text-zinc-950">{value}</div>
  </div>
);

const StockToggle = ({ label, active, onToggle }: { label: string, active: boolean, onToggle: () => void }) => (
  <button 
    onClick={onToggle}
    className={`px-4 py-2 border-2 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${
      active 
      ? 'bg-white border-zinc-950 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' 
      : 'bg-zinc-200 border-zinc-300 text-zinc-400 opacity-60'
    }`}
  >
    <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
    {label}: {active ? 'Available' : 'Out of Stock'}
  </button>
);

export default TerminalPage;
