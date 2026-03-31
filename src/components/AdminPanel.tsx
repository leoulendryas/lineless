'use client';

import React, { useState } from 'react';
import { Shield, Plus, RefreshCw, Key, Check, Info, Map as MapIcon, Eye, EyeOff } from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ADDIS_ABABA_CENTER: [number, number] = [9.01, 38.75];

interface Station {
  id: string;
  externalId: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  accessKey: string | null;
  isPartner: boolean;
}

interface OSMElement {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: {
    name?: string;
    brand?: string;
    operator?: string;
    amenity?: string;
    [key: string]: string | undefined;
  };
}

const LOCAL_INFRA_GRID = [
  { id: 9001, lat: 9.0212, lon: 38.7456, name: "Bole Medhanealem Hub", type: "charging" },
  { id: 9002, lat: 8.9912, lon: 38.7856, name: "Sarbet Multi-Power", type: "charging" },
  { id: 9003, lat: 9.0312, lon: 38.7656, name: "Piazza Central Grid", type: "charging" },
  { id: 9004, lat: 9.0012, lon: 38.7256, name: "Mexico Square Terminal", type: "charging" },
  { id: 9005, lat: 8.9812, lon: 38.7556, name: "Gotera Energy Interchange", type: "fuel" },
  { id: 9006, lat: 9.0512, lon: 38.7156, name: "Gullele Power Node", type: "charging" },
  { id: 9007, lat: 9.0152, lon: 38.7926, name: "CMC Road Energy Station", type: "charging" },
  { id: 9008, lat: 8.9512, lon: 38.7056, name: "Akaki Kality Logistics Hub", type: "fuel" },
  { id: 9009, lat: 9.0812, lon: 38.7456, name: "Addis Ketema Power Station", type: "charging" },
  { id: 9010, lat: 9.0412, lon: 38.8256, name: "Yeka Hills Energy Hub", type: "charging" },
  { id: 9011, lat: 8.9112, lon: 38.6256, name: "Sebeta Industrial Power", type: "charging" },
  { id: 9012, lat: 9.1212, lon: 38.7556, name: "Sululta Gateway Node", type: "fuel" },
  { id: 9013, lat: 8.8812, lon: 38.8556, name: "Dukem Logistics Energy", type: "charging" },
];

// Map Click Handler Component
const MapPicker = ({ onLocationSelect }: { onLocationSelect: (lat: number, lon: number) => void }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const AdminPanel = () => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuth, setIsAuth] = useState(false);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [form, setForm] = useState({
    name: '',
    externalId: '',
    type: 'fuel',
    lat: '',
    lon: '',
    accessKey: '',
    isPartner: true
  });

  const handleLocationSelect = async (lat: number, lon: number, existingStation?: Station) => {
    setForm(prev => ({ 
      ...prev, 
      lat: lat.toFixed(6), 
      lon: lon.toFixed(6),
      name: existingStation?.name || prev.name,
      externalId: existingStation?.externalId || prev.externalId,
      accessKey: existingStation?.accessKey || prev.accessKey,
      type: existingStation?.type || prev.type
    }));
    
    if (existingStation) return; // Don't lookup if we clicked an existing one

    // Attempt to reverse-fetch OSM ID if possible (Overpass API)
    try {
      const query = `[out:json][timeout:25];node(around:50,${lat},${lon})[amenity~"fuel|charging_station|parking|car_wash"];out;`;
      const res = await fetch(`https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Overpass link failed');
      const data = await res.json();
      if (data.elements && data.elements[0]) {
        const el = data.elements[0];
        setForm(prev => ({ 
          ...prev, 
          externalId: String(el.id),
          name: el.tags.name || el.tags.brand || el.tags.operator || prev.name,
          type: el.tags.amenity === 'charging_station' ? 'charging' : el.tags.amenity === 'parking' ? 'parking' : el.tags.amenity === 'car_wash' ? 'car_wash' : 'fuel'
        }));
      }
    } catch (e) { console.error('OSM reverse lookup failed', e); }
  };

  const fetchAllStations = async (pwd = password) => {
    setLoading(true);
    try {
      // 1. Fetch Registered Stations from DB
      const dbRes = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd, action: 'FETCH' })
      });
      const dbData = await dbRes.json();
      if (!dbData.stations) {
        alert(dbData.error || 'Auth failed');
        return;
      }
      const dbStations = dbData.stations as Station[];
      setIsAuth(true);

      // 2. Fetch Potential Stations from OSM
      const query = `[out:json][timeout:60];(nwr["amenity"~"fuel|charging_station|parking|car_wash"](8.80,38.50,9.20,39.10);nwr["brand"~"Total|NOC|OLA|Yetebaberut|Gomeju|Kobil|TAF|Dalol|Global|Nile|Hambissa|Wodaj|Tulu|OiLibya|Horizon"](8.80,38.50,9.20,39.10););out center;`;
      const osmResponse = await fetch(`https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const osmData = await osmResponse.json();

      const mappedOSM = osmData.elements.map((el: OSMElement) => {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;
        if (!lat || !lon) return null;
        
        const dbStation = dbStations.find(s => s.externalId === String(el.id));
        const tags = el.tags;
        let type = 'fuel';
        if (tags.amenity === 'charging_station') type = 'charging';
        else if (tags.amenity === 'parking') type = 'parking';
        else if (tags.amenity === 'car_wash' || tags.name?.toLowerCase().includes('car wash')) type = 'car_wash';

        return {
          id: String(el.id),
          externalId: String(el.id),
          lat, lon,
          name: dbStation?.name || tags.name || tags.brand || tags.operator || (type === 'parking' ? 'Parking' : type === 'car_wash' ? 'Wash' : 'Energy Node'),
          type,
          isPartner: dbStation?.isPartner || false,
          accessKey: dbStation?.accessKey || null
        };
      }).filter((s: Station | null): s is Station => s !== null);

      const mappedLocal = LOCAL_INFRA_GRID.map(local => {
        const dbStation = dbStations.find(s => s.externalId === String(local.id));
        return {
          id: String(local.id),
          externalId: String(local.id),
          lat: local.lat,
          lon: local.lon,
          name: dbStation?.name || local.name,
          type: local.type,
          isPartner: dbStation?.isPartner || false,
          accessKey: dbStation?.accessKey || null
        };
      });

      // Merge and ensure uniqueness
      const allStations = [...mappedOSM];
      mappedLocal.forEach(ls => {
        if (!allStations.some(s => Math.abs(s.lat - ls.lat) < 0.0001 && Math.abs(s.lon - ls.lon) < 0.0001)) {
          allStations.push(ls);
        }
      });

      setStations(allStations);
    } catch (e) { console.error('Sync failed', e); }
    finally { setLoading(false); }
  };

  const handleUpsert = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...form, 
          isPartner: true, // Explicitly ensure it's marked as partner
          password, 
          action: 'UPSERT' 
        })
      });
      if (res.ok) {
        alert('Station Registered Successfully!');
        fetchAllStations();
      }
    } catch (e) { alert('Failed to save'); }
    finally { setLoading(false); }
  };

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 font-sans overflow-y-auto">
        <div className="w-full max-w-md bg-white p-12 rounded-sm border-2 border-zinc-900 shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)] my-8">
           <Shield className="mx-auto mb-8 text-zinc-950" size={48} />
           <h1 className="font-black text-2xl tracking-tighter uppercase italic text-center mb-10">Admin Access</h1>
           <div className="relative mb-6">
             <input 
               type={showPassword ? "text" : "password"} 
               value={password}
               onChange={(e) => setPassword(e.target.value)}
               placeholder="Admin Password"
               onKeyDown={(e) => e.key === 'Enter' && fetchAllStations()}
               className="w-full h-14 bg-zinc-50 border-2 border-zinc-200 px-5 pr-12 rounded-sm text-[11px] font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-zinc-950 text-zinc-950"
             />
             <button 
               type="button"
               onClick={() => setShowPassword(!showPassword)}
               className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900 transition-colors"
             >
               {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
             </button>
           </div>
           <button 
             onClick={() => fetchAllStations()}
             className="w-full h-16 bg-zinc-950 text-white font-black uppercase tracking-[0.2em] rounded-sm hover:bg-zinc-800 transition-all shadow-lg active:scale-95"
           >
             Unlock Terminal
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6 md:p-12 font-sans selection:bg-zinc-900 selection:text-white overflow-y-auto">
      <div className="max-w-7xl mx-auto flex flex-col gap-12 pb-12">
        <div className="flex justify-between items-center">
          <h1 className="font-black text-4xl tracking-tighter uppercase italic text-zinc-950">System Admin</h1>
          <button onClick={() => fetchAllStations()} className="p-4 bg-white border-2 border-zinc-200 hover:border-zinc-950 transition-all rounded-sm shadow-sm active:scale-90"><RefreshCw size={20} className={loading ? 'animate-spin' : ''} /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
           {/* Map Picker Section */}
           <div className="lg:col-span-7 h-[600px] border-2 border-zinc-950 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden group rounded-sm">
              <div className="absolute top-4 left-4 z-[1000] bg-zinc-950 text-white px-6 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-xl border border-white/20">
                <MapIcon size={14} /> Click Grid to Select Node
              </div>
              <MapContainer center={ADDIS_ABABA_CENTER} zoom={13} className="h-full w-full grayscale contrast-[1.1]">
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <MapPicker onLocationSelect={handleLocationSelect} />
                
                {/* Existing Stations Markers */}
                {stations.map(station => (
                  <Marker 
                    key={station.id} 
                    position={[station.lat, station.lon]}
                    bubblingMouseEvents={false}
                    eventHandlers={{
                      click: (e) => {
                        handleLocationSelect(station.lat, station.lon, station);
                      }
                    }}
                    icon={L.divIcon({ 
                      className: '', 
                      html: `<div class="w-6 h-6 ${station.isPartner ? 'bg-zinc-950' : 'bg-zinc-400'} border-2 border-white shadow-lg flex items-center justify-center text-white text-[8px] font-black rounded-sm">${station.type === 'fuel' ? 'F' : station.type === 'charging' ? 'E' : station.type === 'parking' ? 'P' : station.type === 'car_wash' ? 'W' : 'N'}</div>`,
                      iconSize: [24, 24], iconAnchor: [12, 12] 
                    })}
                  >
                    <Popup className="admin-popup">
                      <div className="p-2 font-sans">
                        <p className="font-black text-[10px] uppercase tracking-tighter mb-1">{station.name}</p>
                        <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">KEY: {station.accessKey || 'NONE'}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Currently Selecting Marker */}
                {form.lat && form.lon && (
                  <Marker 
                    position={[parseFloat(form.lat), parseFloat(form.lon)]} 
                    icon={L.divIcon({ 
                      html: '<div class="w-8 h-8 bg-orange-500 border-2 border-white shadow-xl flex items-center justify-center text-white animate-bounce"><Plus size={16}/></div>',
                      className: '', iconSize: [32, 32], iconAnchor: [16, 16] 
                    })} 
                  />
                )}
              </MapContainer>
           </div>

           {/* Registration Form */}
           <div className="lg:col-span-5 space-y-8">
              <div className="bg-white p-8 border-2 border-zinc-950 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-sm">
                 <h2 className="font-black text-xl uppercase italic mb-8 flex items-center gap-3"><Plus size={20} /> Node Registration</h2>
                 <form onSubmit={handleUpsert} className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Station Name</label>
                       <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full h-12 px-4 bg-zinc-50 border-2 border-zinc-100 outline-none focus:border-zinc-950 transition-all text-[11px] font-black text-zinc-950 uppercase" placeholder="NOC Airport" required />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">External ID (OSM)</label>
                       <div className="relative">
                          <input type="text" value={form.externalId} onChange={(e) => setForm({...form, externalId: e.target.value})} className="w-full h-12 px-4 bg-zinc-50 border-2 border-zinc-100 outline-none focus:border-zinc-950 transition-all text-[11px] font-black text-zinc-950" placeholder="12345678" required />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-300"><Info size={14} /></div>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Lat</label>
                          <input type="text" value={form.lat} readOnly className="w-full h-12 px-4 bg-zinc-100 border-2 border-zinc-100 text-[11px] font-black text-zinc-400 cursor-not-allowed" />
                       </div>
                       <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Lon</label>
                          <input type="text" value={form.lon} readOnly className="w-full h-12 px-4 bg-zinc-100 border-2 border-zinc-100 text-[11px] font-black text-zinc-400 cursor-not-allowed" />
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Access Key</label>
                       <input type="text" value={form.accessKey} onChange={(e) => setForm({...form, accessKey: e.target.value})} className="w-full h-12 px-4 bg-zinc-50 border-2 border-zinc-100 outline-none focus:border-zinc-950 transition-all text-[11px] font-black text-zinc-950 uppercase" placeholder="KEY-2026" required />
                    </div>
                    <button type="submit" disabled={!form.lat || loading} className="w-full py-5 bg-zinc-950 text-white font-black uppercase tracking-[0.2em] text-[10px] shadow-lg hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-50">Authorize & Deploy</button>
                 </form>
              </div>
           </div>
        </div>

        {/* Station List */}
        <div className="space-y-6">
           <h2 className="font-black text-2xl uppercase italic flex items-center gap-3"><Key size={24} /> Active Partner Grid</h2>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {stations.filter(s => s.isPartner).map(s => (
                <div key={s.id} className="p-6 bg-white border-2 border-zinc-200 rounded-sm hover:border-zinc-950 transition-all shadow-sm group">
                   <div className="flex justify-between items-start mb-4">
                      <div className="flex flex-col">
                         <h4 className="font-black text-[14px] uppercase tracking-tight text-zinc-950 group-hover:italic transition-all">{s.name}</h4>
                         <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mt-1">ID: {s.externalId}</span>
                      </div>
                      <div className="w-8 h-8 bg-zinc-950 text-white flex items-center justify-center rounded-sm text-[10px] font-black shadow-md">P</div>
                   </div>
                   <div className="flex items-center gap-3 pt-4 border-t border-zinc-100">
                      <Key size={14} className="text-zinc-300" />
                      <span className="text-[11px] font-black text-zinc-950 uppercase tracking-widest">{s.accessKey}</span>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>
      <style jsx global>{`
        .admin-popup .leaflet-popup-content-wrapper { 
          border-radius: 2px; 
          border: 2px solid #18181b; 
          box-shadow: 4px 4px 0px 0px rgba(0,0,0,1);
        }
        .admin-popup .leaflet-popup-tip { display: none; }
      `}</style>
    </div>
  );
};

export default AdminPanel;
