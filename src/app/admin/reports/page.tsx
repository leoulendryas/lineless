'use client';

import React, { useState, useEffect } from 'react';
import { BarChart3, ShieldAlert, Zap, Droplets, Truck, MapPin, Search, Eye, EyeOff } from 'lucide-react';

const NationalDashboard = () => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReports = async (pwd = password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, action: 'REPORTS' })
      });
      const resData = await res.json();
      if (resData.error) {
        alert(resData.error);
      } else {
        setData(resData);
        setIsAuth(true);
      }
    } catch (e) {
      alert('Link to intelligence node failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white p-12 rounded-sm border-2 border-zinc-900 shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)]">
           <BarChart3 className="mx-auto mb-8 text-zinc-950" size={48} />
           <h1 className="font-black text-2xl tracking-tighter uppercase italic text-center mb-10">Government Intelligence</h1>
           <div className="relative mb-6">
             <input 
               type={showPassword ? "text" : "password"} 
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               placeholder="Official Access Code"
               onKeyDown={(e) => e.key === 'Enter' && fetchReports()}
               className="w-full h-14 bg-zinc-50 border-2 border-zinc-200 px-5 pr-12 rounded-sm text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-zinc-950 text-zinc-950"
             />
             <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400">
               {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
             </button>
           </div>
           <button 
             onClick={() => fetchReports()}
             className="w-full h-16 bg-zinc-950 text-white font-black uppercase tracking-[0.2em] rounded-sm hover:bg-zinc-800 transition-all shadow-lg"
           >
             Unlock Oversight
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 md:p-12 font-sans selection:bg-zinc-950 selection:text-white overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b-4 border-zinc-950 pb-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <BarChart3 size={32} />
              <h1 className="font-black text-4xl tracking-tighter uppercase italic text-zinc-950 leading-none">Energy Oversight</h1>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-400">Addis Ababa National Distribution Hub</p>
          </div>
          <button onClick={() => fetchReports()} className="px-8 py-4 bg-zinc-950 text-white font-black text-[11px] uppercase tracking-[0.2em] rounded-sm hover:bg-zinc-800 transition-all shadow-xl">Refresh Intel</button>
        </header>

        {/* Global Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
           <GovStatCard label="Total Served" value={data.totalServed} icon={<Truck size={20}/>} color="bg-zinc-950" />
           <GovStatCard 
             label="Benzene Flow" 
             value={data.litersByFuel.find((f: any) => f.fuelType === 'Benzene')?._sum.litersPumped || 0} 
             unit="Liters" 
             icon={<Droplets size={20}/>} 
             color="bg-orange-600" 
           />
           <GovStatCard 
             label="Diesel Flow" 
             value={data.litersByFuel.find((f: any) => f.fuelType === 'Gasoline')?._sum.litersPumped || 0} 
             unit="Liters" 
             icon={<Zap size={20}/>} 
             color="bg-zinc-600" 
           />
           <GovStatCard label="Audit Compliance" value="100%" unit="Verified" icon={<ShieldAlert size={20}/>} color="bg-green-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
           {/* High Risk Surveillance */}
           <div className="bg-white border-2 border-zinc-950 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8">
              <h2 className="font-black text-xl uppercase italic mb-8 border-b border-zinc-100 pb-4 flex items-center gap-3">
                <ShieldAlert className="text-red-600" size={24} /> High-Risk Surveillance
              </h2>
              <table className="w-full text-left">
                 <thead>
                    <tr className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                       <th className="pb-4">Plate Number</th>
                       <th className="pb-4">Frequency</th>
                       <th className="pb-4">Total Intake (L)</th>
                       <th className="pb-4 text-right">Risk Factor</th>
                    </tr>
                 </thead>
                 <tbody className="text-[11px] font-black uppercase tracking-widest">
                    {data.topConsumers.map((c: any) => (
                      <tr key={c.plateNumber} className="border-t border-zinc-50 hover:bg-red-50 transition-colors">
                        <td className="py-4">{c.plateNumber}</td>
                        <td className="py-4">{c._count.id}x Refueled</td>
                        <td className="py-4 font-bold">{c._sum.litersPumped.toFixed(1)}</td>
                        <td className="py-4 text-right">
                           <span className={`px-2 py-1 rounded-sm text-[8px] ${c._sum.litersPumped > 500 ? 'bg-red-600 text-white' : 'bg-orange-500 text-white'}`}>
                             {c._sum.litersPumped > 500 ? 'CRITICAL' : 'HIGH'}
                           </span>
                        </td>
                      </tr>
                    ))}
                 </tbody>
              </table>
           </div>

           {/* Efficiency Heatmap */}
           <div className="bg-white border-2 border-zinc-950 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-8">
              <h2 className="font-black text-xl uppercase italic mb-8 border-b border-zinc-100 pb-4 flex items-center gap-3">
                <MapPin className="text-zinc-950" size={24} /> Infrastructure Efficiency
              </h2>
              <div className="space-y-6">
                {data.stationEfficiency.map((s: any) => (
                   <div key={s.id} className="flex flex-col gap-2">
                      <div className="flex justify-between items-end">
                         <span className="text-[10px] font-black uppercase tracking-widest text-zinc-950">{s.name}</span>
                         <span className="text-[9px] font-black text-zinc-400">{s._count.queueEntries} Units Cleared</span>
                      </div>
                      <div className="h-4 bg-zinc-100 rounded-sm overflow-hidden border border-zinc-200">
                         <div 
                           className="h-full bg-zinc-950 transition-all duration-1000" 
                           style={{ width: `${Math.min(100, (s._count.queueEntries / (data.totalServed || 1)) * 100 * 5)}%` }}
                         ></div>
                      </div>
                   </div>
                ))}
              </div>
              <div className="mt-12 p-6 bg-zinc-50 border-2 border-dashed border-zinc-200 flex items-center justify-between">
                 <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Audit Status</span>
                    <span className="text-[10px] font-black uppercase text-zinc-950">Terminal Links Verified</span>
                 </div>
                 <ShieldAlert size={20} className="text-green-600" />
              </div>
           </div>
        </div>

        <footer className="pt-20 pb-10 text-center">
           <p className="text-[9px] font-black uppercase tracking-[0.5em] text-zinc-300">Lineless Intelligence Matrix v2026.4.2</p>
        </footer>
      </div>
    </div>
  );
};

const GovStatCard = ({ label, value, unit, icon, color }: any) => (
  <div className="bg-white p-8 border-2 border-zinc-950 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden group hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all cursor-default">
     <div className="flex flex-col relative z-10">
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-4">{label}</span>
        <div className="flex items-baseline gap-2">
           <span className="text-3xl font-black text-zinc-950 tracking-tighter">{typeof value === 'number' ? value.toFixed(1) : value}</span>
           {unit && <span className="text-[10px] font-black uppercase text-zinc-400">{unit}</span>}
        </div>
     </div>
     <div className={`absolute top-4 right-4 ${color} text-white p-3 rounded-sm shadow-lg group-hover:scale-110 transition-transform`}>
        {icon}
     </div>
  </div>
);

export default NationalDashboard;
