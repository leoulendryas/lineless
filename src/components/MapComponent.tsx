'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import TelegramLogin from './TelegramLogin';

interface User {
  id: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  trustScore: number;
}

interface GlobalPrice {
  price: number;
  unit: string;
}

interface FuelStatus {
  latest: {
    id: string;
    status: 'Available' | 'Out of Stock' | 'Unknown';
    queue: 'No Line' | 'Short' | 'Medium' | 'Long' | 'Unknown';
    upvotes: number;
    downvotes: number;
    lastUpdated?: string;
    createdAt?: string;
    userId?: string;
    user?: {
      trustScore: number;
      username?: string;
      firstName?: string;
    };
  } | null;
  stats: {
    available: number;
    outOfStock: number;
    total: number;
  };
}

interface Station {
  id: number;
  lat: number;
  lon: number;
  name: string;
  type: 'fuel' | 'charging' | 'parking' | 'car_wash';
  amenities: {
    shop: boolean;
    cafe: boolean;
    car_wash: boolean;
    toilets: boolean;
    atm: boolean;
  };
  reports: {
    Benzene: FuelStatus & { price: GlobalPrice | null };
    Gasoline: FuelStatus & { price: GlobalPrice | null };
    Electric: FuelStatus & { price: GlobalPrice | null };
  };
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
    parking?: string;
    shop?: string;
    convenience?: string;
    "service:car_wash"?: string;
    "amenity:cafe"?: string;
    "amenity:restaurant"?: string;
    "amenity:toilets"?: string;
    "amenity:toilets:wheelchair"?: string;
    "amenity:atm"?: string;
    "fuel:gasoline"?: string;
    "fuel:diesel"?: string;
    "cafe"?: string;
    [key: string]: string | undefined;
  };
}

const ADDIS_ABABA_CENTER: [number, number] = [9.01, 38.75];

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

const MapComponent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [globalPrices, setGlobalPrices] = useState<Record<string, GlobalPrice> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activePopupId, setActivePopupId] = useState<number | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'fuel' | 'charging' | 'parking' | 'car_wash'>('all');
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [syncError, setSyncFailed] = useState<string | null>(null);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);

  useEffect(() => { 
    fetchAllStations(); 
    checkUser();

    // Close sidebar on mobile by default
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setShowSidebar(false);
    }

    // Auto-locate user on mount
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(loc);
          if (mapRef) mapRef.flyTo(loc, 15);
        },
        () => {
          console.log('Location access declined - defaulting to center.');
        },
        { timeout: 10000 }
      );
    }
  }, [mapRef]);

  const checkUser = async () => {
    try {
      const res = await fetch('/api/auth/telegram');
      const data = await res.json();
      if (data.user) setUser(data.user);
    } catch (e) { console.error('Check user failed', e); }
  };

  const handleTelegramAuth = async (telegramUser: any) => {
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telegramUser)
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
        setShowAuthPrompt(false);
      }
    } catch (e) { console.error('Auth failed', e); }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/telegram', { method: 'DELETE' });
    setUser(null);
  };

  const fetchAllStations = async () => {
    setScanning(true);
    setSyncFailed(null);
    try {
      const query = `[out:json][timeout:60];(nwr["amenity"~"fuel|charging_station|parking|car_wash"](8.80,38.50,9.20,39.10);nwr["brand"~"Total|NOC|OLA|Yetebaberut|Gomeju|Kobil|TAF|Dalol|Global|Nile|Hambissa|Wodaj|Tulu|OiLibya|Horizon"](8.80,38.50,9.20,39.10););out center;`;
      const osmResponse = await fetch(`https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      if (!osmResponse.ok) throw new Error(`Link Error: ${osmResponse.status}`);
      const contentType = osmResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) throw new Error('Invalid format');
      
      const osmData = await osmResponse.json();
      const dbResponse = await fetch('/api/reports');
      const { stations: dbStations, prices } = await dbResponse.json();
      setGlobalPrices(prices);

      const mappedOSM = osmData.elements.map((el: OSMElement) => {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;
        if (!lat || !lon) return null;
        const dbStation = Array.isArray(dbStations) ? dbStations.find((s: { externalId: string }) => s.externalId === String(el.id)) : null;
        
        const formatFuel = (type: 'Benzene' | 'Gasoline' | 'Electric'): FuelStatus & { price: GlobalPrice | null } => {
          const data = dbStation?.[type];
          return {
            latest: data?.latest ? { ...data.latest, lastUpdated: new Date(data.latest.createdAt).toLocaleTimeString() } : null,
            stats: data?.stats || { available: 0, outOfStock: 0, total: 0 },
            price: prices[type] || null
          };
        };

        const tags = el.tags;
        let type: 'fuel' | 'charging' | 'parking' | 'car_wash' = 'fuel';
        if (tags.amenity === 'charging_station') type = 'charging';
        else if (tags.amenity === 'parking') type = 'parking';
        else if (tags.amenity === 'car_wash' || tags.name?.toLowerCase().includes('car wash')) type = 'car_wash';
        
        return {
          id: el.id,
          lat, lon,
          name: tags.name || tags.brand || tags.operator || (type === 'parking' ? 'Secure Parking Hub' : type === 'car_wash' ? 'Clean Point' : 'Infrastructure Node'),
          type,
          amenities: {
            shop: !!(tags.shop || tags.amenity === 'shop' || tags.convenience || tags.supermarket || tags.kiosk),
            cafe: !!(tags.amenity === 'cafe' || tags.amenity === 'restaurant' || tags.cuisine || tags.fast_food || tags.food_court || tags.cafe === 'yes' || tags.name?.toLowerCase().includes('cafe') || tags.name?.toLowerCase().includes('coffee')),
            car_wash: type === 'car_wash' || !!(tags["service:car_wash"] === 'yes' || tags.amenity === 'car_wash' || tags.name?.toLowerCase().includes('wash')),
            toilets: !!(tags["amenity:toilets"] === 'yes' || tags.toilets === 'yes' || tags.amenity === 'toilets' || tags.name?.toLowerCase().includes('toilet')),
            atm: !!(tags["amenity:atm"] === 'yes' || tags.atm === 'yes' || tags.amenity === 'atm' || tags.name?.toLowerCase().includes('atm')),
          },
          reports: { Benzene: formatFuel('Benzene'), Gasoline: formatFuel('Gasoline'), Electric: formatFuel('Electric') }
        };
      }).filter((s: Station | null): s is Station => s !== null);

      const localStations = LOCAL_INFRA_GRID.map(local => {
        const dbStation = Array.isArray(dbStations) ? dbStations.find((s: { externalId: string }) => s.externalId === String(local.id)) : null;
        const formatFuel = (type: 'Benzene' | 'Gasoline' | 'Electric'): FuelStatus & { price: GlobalPrice | null } => {
          const data = dbStation?.[type];
          return {
            latest: data?.latest ? { ...data.latest, lastUpdated: new Date(data.latest.createdAt).toLocaleTimeString() } : null,
            stats: data?.stats || { available: 0, outOfStock: 0, total: 0 },
            price: prices[type] || null
          };
        };
        return {
          ...local,
          type: local.type as 'fuel' | 'charging' | 'parking' | 'car_wash',
          amenities: { shop: false, cafe: false, car_wash: false, toilets: false, atm: false },
          reports: { Benzene: formatFuel('Benzene'), Gasoline: formatFuel('Gasoline'), Electric: formatFuel('Electric') }
        };
      });

      const uniqueLocal = localStations.filter(ls => !mappedOSM.some((os: Station) => Math.abs(os.lat - ls.lat) < 0.001 && Math.abs(os.lon - ls.lon) < 0.001));
      setStations([...mappedOSM, ...uniqueLocal]);
    } catch (e) { 
      const msg = e instanceof Error ? e.message : 'Unknown';
      setSyncFailed(msg);
    } finally { setLoading(false); setScanning(false); }
  };

  const handleSidebarClick = (s: Station) => {
    if (mapRef) {
      mapRef.flyTo([s.lat, s.lon], 16, { animate: true, duration: 1.5 });
      setActivePopupId(s.id);
    }
  };

  const handleReport = async (station: Station, fuelType: string, status: string, queue: string) => {
    const res = await fetch('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ externalId: String(station.id), name: station.name, type: station.type, lat: station.lat, lon: station.lon, fuelType, status, queue })
    });
    if (res.ok) { fetchAllStations(); setSelectedStation(null); }
  };

  const locateUser = () => {
    if (!navigator.geolocation) return alert('GPS not supported');
    navigator.geolocation.getCurrentPosition((pos) => {
      if (mapRef) mapRef.flyTo([pos.coords.latitude, pos.coords.longitude], 15);
      setUserLocation([pos.coords.latitude, pos.coords.longitude]);
    });
  };

  const handleVote = async (reportId: string, action: 'upvote' | 'downvote') => {
    if (!user) return setShowAuthPrompt(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action })
      });
      if (res.ok) fetchAllStations();
      else {
        const errorData = await res.json();
        if (errorData.error) alert(errorData.error);
      }
    } catch (e) { console.error('Vote failed', e); }
  };

  const filteredStations = stations.filter(s => filter === 'all' || s.type === filter);

  if (loading) return (
    <div className="h-full w-full flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-6">
        <div className="grid grid-cols-2 gap-1 animate-pulse">
          <div className="w-4 h-4 bg-zinc-900"></div>
          <div className="w-4 h-4 bg-zinc-200"></div>
          <div className="w-4 h-4 bg-zinc-200"></div>
          <div className="w-4 h-4 bg-zinc-900"></div>
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-900">Establishing Lineless Link</span>
      </div>
    </div>
  );

  const iconSize = zoomLevel < 10 ? 4 : zoomLevel < 12 ? 8 : zoomLevel < 14 ? 16 : zoomLevel < 16 ? 24 : 32;

  const getQueueLabel = (q: string) => {
    if (q === 'No Line') return 'Clear (< 10 Cars)';
    if (q === 'Short') return 'Short (10 - 30 Cars)';
    if (q === 'Medium') return 'Moderate (30 - 70 Cars)';
    if (q === 'Long') return 'Extended (70+ Cars)';
    return q || 'N/A';
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-white text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white relative">
      <aside className={`fixed md:relative inset-y-0 left-0 transition-all duration-500 bg-white border-r border-zinc-200 z-[3000] flex flex-col ${showSidebar ? 'w-full md:w-[460px] translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 overflow-hidden'}`}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        
        <div className="p-6 md:p-10 pb-6 flex flex-col gap-8 md:gap-10 relative">
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-zinc-900 flex items-center justify-center rounded-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4V20H20" stroke="white" strokeWidth="4" strokeLinecap="square"/>
                    <path d="M12 4L12 12" stroke="white" strokeWidth="4" strokeLinecap="square" opacity="0.3"/>
                  </svg>
                </div>
                <h2 className="font-black text-2xl tracking-tighter leading-none text-zinc-900 italic uppercase">Lineless</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-3 group">
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-900 leading-none">{user.firstName}</span>
                    <span className="text-[7px] font-black uppercase tracking-widest text-zinc-400 leading-none mt-1">Trust: {user.trustScore}</span>
                  </div>
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt="Avatar" className="w-8 h-8 rounded-sm border border-zinc-200 grayscale hover:grayscale-0 transition-all cursor-pointer" onClick={handleLogout} title="Logout" />
                  ) : (
                    <div className="w-8 h-8 bg-zinc-100 flex items-center justify-center rounded-sm border border-zinc-200 text-[10px] font-black cursor-pointer" onClick={handleLogout}>{user.firstName?.[0]}</div>
                  )}
                </div>
              ) : (
                <TelegramLogin botName="lineless_help_bot" onAuth={handleTelegramAuth} className="w-[120px] h-[36px]">
                  <div className="w-full h-full bg-zinc-900 text-white flex items-center justify-center gap-2 rounded-sm border border-zinc-800 shadow-sm hover:bg-zinc-800 transition-all cursor-pointer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 5L2 12.5L9 13.5M21 5L18.5 20L9 13.5M21 5L9 13.5M9 13.5V19L12 15.5" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter"/>
                    </svg>
                    <span className="text-[9px] font-black uppercase tracking-widest">Connect</span>
                  </div>
                </TelegramLogin>
              )}
              <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-zinc-50 border border-transparent hover:border-zinc-200 rounded-sm transition-all text-zinc-900">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
          
          <div className="flex gap-2">
             <button onClick={locateUser} className="flex-1 py-3 px-4 bg-white hover:bg-zinc-50 text-zinc-900 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border border-zinc-200 shadow-sm active:scale-95">Locate Me</button>
             <button onClick={fetchAllStations} disabled={scanning} className="flex-1 py-3 px-4 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-400 text-white rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border border-zinc-800 shadow-sm active:scale-95">Refresh Grid</button>
          </div>

          <div className="grid grid-cols-3 gap-2">
             <PriceCard label="Benzene" price={globalPrices?.Benzene} activeColor="bg-orange-500" />
             <PriceCard label="Diesel" price={globalPrices?.Gasoline} activeColor="bg-zinc-900" />
             <PriceCard label="EV" price={globalPrices?.Electric} activeColor="bg-blue-600" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10 space-y-8 no-scrollbar relative">
          <div className="sticky top-0 bg-white/95 backdrop-blur-md pt-2 pb-6 z-10 border-b border-zinc-100">
             <select value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'fuel' | 'charging' | 'parking' | 'car_wash')} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-sm text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-zinc-900 transition-all appearance-none cursor-pointer">
                <option value="all">Lineless Pool: {stations.length}</option>
                <option value="fuel">Fuel Infrastructure</option>
                <option value="charging">Energy Nodes</option>
                <option value="parking">Parking Hubs</option>
                <option value="car_wash">Car Wash Centers</option>
             </select>
          </div>

          <div className="space-y-4">
            {stations.find(s => s.id === activePopupId) ? (
              (() => {
                const s = stations.find(s => s.id === activePopupId)!;
                return (
                  <div className="space-y-6">
                    <div className="p-6 bg-zinc-900 rounded-sm border border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400">Terminal Selected</span>
                          <h3 className="font-black text-white tracking-tight text-lg uppercase italic leading-none">{s.name}</h3>
                        </div>
                        <div className={`w-3 h-3 rounded-full ${s.type === 'fuel' ? 'bg-orange-500' : s.type === 'charging' ? 'bg-blue-600' : s.type === 'parking' ? 'bg-zinc-400' : 'bg-green-500'}`}></div>
                      </div>
                      <div className="flex gap-2">
                        {(s.type === 'fuel' || s.type === 'charging') && (
                          <button 
                            onClick={() => {
                              if (user) setSelectedStation(s);
                              else setShowAuthPrompt(true);
                            }} 
                            className="flex-1 py-3 px-4 bg-white text-zinc-900 rounded-sm text-[9px] font-black uppercase tracking-widest transition-all hover:bg-zinc-100 active:scale-95"
                          >
                            Update Status
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <AmenityItem label="Shop" available={s.amenities.shop} icon={<ShoppingCartIcon />} />
                      <AmenityItem label="Cafe" available={s.amenities.cafe} icon={<CoffeeIcon />} />
                      <AmenityItem label="Car Wash" available={s.amenities.car_wash} icon={<CarIcon />} />
                      <AmenityItem label="Toilets" available={s.amenities.toilets} icon={<ToiletIcon />} />
                      <AmenityItem label="ATM" available={s.amenities.atm} icon={<ATMIcon />} />
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="p-12 border border-dashed border-zinc-200 rounded-sm flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-zinc-50 flex items-center justify-center rounded-full mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Select a terminal on the map to view amenities</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="relative flex-1 h-full bg-zinc-50">
        {!showSidebar && (
          <button onClick={() => setShowSidebar(true)} className="absolute top-8 left-8 z-[3000] bg-zinc-900 text-white px-8 py-4 rounded-sm shadow-2xl font-black text-[10px] uppercase tracking-widest border border-zinc-800 transition-all active:scale-95">Open Terminal</button>
        )}
        
        {/* Floating Legend - High Contrast Grid Color Key */}
        <div className="absolute bottom-8 right-8 z-[3000] flex flex-col gap-1 bg-white p-1 rounded-sm shadow-2xl border border-zinc-200 min-w-[180px] md:min-w-[220px]">
           <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-100 mb-1 hidden md:block">
             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-900 leading-none">Grid Color Key</span>
           </div>
           <LegendItem color="bg-orange-500" label="Benzene / Diesel" />
           <LegendItem color="bg-blue-600" label="Energy / EV Hubs" />
           <LegendItem color="bg-zinc-400" label="Secure Parking" />
           <LegendItem color="bg-green-500" label="Car Wash Centers" />
        </div>
        
        <MapContainer 
          center={ADDIS_ABABA_CENTER} 
          zoom={12} 
          className="h-full w-full grayscale-[0.2]" 
          zoomControl={false}
          ref={setMapRef}
          tap={false}
        >
          <TileLayer attribution='&copy; CartoDB' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          <MapEvents setZoom={setZoomLevel} />
          <MapRecenter location={userLocation} />
          
          {userLocation && (
            <Marker position={userLocation} bubblingMouseEvents={false} icon={L.divIcon({ className: '', html: '<div class="w-6 h-6 bg-zinc-900 rounded-full border-4 border-white shadow-2xl animate-pulse"></div>', iconSize: [24, 24] })}>
              <Popup className="better-auth-popup text-center">User Access Point</Popup>
            </Marker>
          )}

          {filteredStations.map(station => {
            const isFuel = station.type === 'fuel';
            const isParking = station.type === 'parking';
            const isCarWash = station.type === 'car_wash';
            const colorClass = isFuel ? 'bg-orange-500' : isParking ? 'bg-zinc-400' : isCarWash ? 'bg-green-500' : 'bg-blue-600';
            const isActive = activePopupId === station.id;
            
            return (
              <Marker 
                key={station.id} 
                position={[station.lat, station.lon]} 
                bubblingMouseEvents={false}
                eventHandlers={{ click: () => {
                   setActivePopupId(station.id);
                   // Remove auto-opening sidebar on click
                   // if (window.innerWidth < 768) setShowSidebar(true);
                }}}
                icon={L.divIcon({ 
                  className: '', 
                  html: zoomLevel < 12 
                    ? `<div class="w-2.5 h-2.5 ${colorClass} rounded-full border border-white shadow-md ${isActive ? 'scale-150 ring-2 ring-zinc-900' : ''}"></div>` 
                    : `<div class="w-7 h-7 ${colorClass} border-2 border-white shadow-xl flex items-center justify-center text-[10px] text-white font-black rounded-sm ${isActive ? 'scale-125 ring-2 ring-zinc-900' : ''}">${isFuel ? 'F' : isParking ? 'P' : isCarWash ? 'W' : 'E'}</div>`, 
                  iconSize: [iconSize, iconSize], 
                  iconAnchor: [iconSize/2, iconSize/2] 
                })}
              >
                {isActive && (
                  <Popup 
                    className="better-auth-popup" 
                    eventHandlers={{ 
                      remove: () => setActivePopupId(null) 
                    }}
                    autoPan={true}
                  >
                    <div className="min-w-[280px] md:min-w-[340px] p-2">
                      <div className="flex justify-between items-center mb-6 border-b border-zinc-100 pb-4">
                        <h3 className="font-black text-xl tracking-tighter text-zinc-900 uppercase italic leading-none">{station.name}</h3>
                        <div className={`w-2 h-2 rounded-full ${colorClass}`}></div>
                      </div>
                      {station.type === 'fuel' || station.type === 'charging' ? (
                        <div className="space-y-4">
                          <DetailedStatus label="Benzene" report={station.reports.Benzene} colorClass="text-orange-600" getQueueLabel={getQueueLabel} onVote={handleVote} userId={user?.id} />
                          <DetailedStatus label="Diesel" report={station.reports.Gasoline} colorClass="text-zinc-900" getQueueLabel={getQueueLabel} onVote={handleVote} userId={user?.id} />
                          {(station.type === 'charging' || station.reports.Electric.stats.total > 0) && <DetailedStatus label="Electric" report={station.reports.Electric} colorClass="text-blue-600" getQueueLabel={getQueueLabel} onVote={handleVote} userId={user?.id} />}
                        </div>

                      ) : station.type === 'parking' ? (
                        <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-sm">
                           <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Vehicle Storage Facility</span>
                           <p className="text-[8px] text-zinc-400 uppercase tracking-widest mt-2">Public access parking node. Verification pending for real-time occupancy.</p>
                        </div>
                      ) : (
                        <div className="p-4 bg-zinc-50 border border-zinc-100 rounded-sm">
                           <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900">Vehicle Detailing Hub</span>
                           <p className="text-[8px] text-zinc-400 uppercase tracking-widest mt-2">Professional cleaning and maintenance point.</p>
                        </div>
                      )}
                      {(station.type === 'fuel' || station.type === 'charging') && (
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActivePopupId(station.id);
                            setShowSidebar(true);
                          }} 
                          className="w-full mt-8 bg-zinc-900 text-white py-4 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all hover:bg-zinc-800 border border-zinc-800 active:scale-[0.98] cursor-pointer"
                        >
                          View Amenities & Updates
                        </button>
                      )}
                    </div>
                  </Popup>
                )}
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {showAuthPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-12 rounded-sm shadow-2xl w-full max-w-[420px] border border-zinc-200 relative text-center">
            <button onClick={() => setShowAuthPrompt(false)} className="absolute top-4 right-4 p-2 hover:bg-zinc-50 rounded-sm transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
            <div className="w-16 h-16 bg-zinc-900 mx-auto mb-8 flex items-center justify-center rounded-sm">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 4V20H20" stroke="white" strokeWidth="4" strokeLinecap="square"/>
                <path d="M12 4L12 12" stroke="white" strokeWidth="4" strokeLinecap="square" opacity="0.3"/>
              </svg>
            </div>
            <h3 className="font-black text-2xl text-zinc-900 tracking-tighter mb-4 uppercase italic">Verification Required</h3>
            <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-10 leading-relaxed">Please authenticate via Telegram to contribute to the grid status.</p>
            <div className="flex justify-center">
              <TelegramLogin botName="lineless_help_bot" onAuth={handleTelegramAuth} className="w-full h-14">
                <div className="w-full h-full bg-zinc-900 text-white flex items-center justify-center gap-3 rounded-sm border border-zinc-800 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all cursor-pointer">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21 5L2 12.5L9 13.5M21 5L18.5 20L9 13.5M21 5L9 13.5M9 13.5V19L12 15.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter"/>
                  </svg>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] italic">Access Grid Terminal</span>
                </div>
              </TelegramLogin>
            </div>
          </div>
        </div>
      )}

      {selectedStation && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white p-12 rounded-sm shadow-2xl w-full max-w-[480px] border border-zinc-200 relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-zinc-900"></div>
            <h3 className="font-black text-3xl text-zinc-900 tracking-tighter mb-2 uppercase italic">Broadcast</h3>
            <p className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.2em] mb-10">{selectedStation.name}</p>
            <div className="space-y-6">
              <FormGroup label="Resource"><select id="type-select" className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-sm text-[10px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer focus:ring-1 focus:ring-zinc-900 transition-all">{selectedStation.type === 'fuel' ? <><option value="Benzene">Benzene</option><option value="Gasoline">Diesel</option></> : <option value="Electric">Electric</option>}</select></FormGroup>
              <FormGroup label="Status"><select id="status-select" className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-sm text-[10px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer focus:ring-1 focus:ring-zinc-900 transition-all"><option value="Available">Available</option><option value="Out of Stock">Unavailable</option></select></FormGroup>
              <FormGroup label="Queue Depth"><select id="queue-select" className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-sm text-[10px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer focus:ring-1 focus:ring-zinc-900 transition-all"><option value="No Line">Clear (&lt; 10 Cars)</option><option value="Short">Short (10 - 30 Cars)</option><option value="Medium">Moderate (30 - 70 Cars)</option><option value="Long">Extended (70+ Cars)</option></select></FormGroup>
            </div>
            <div className="flex gap-2 mt-10">
              <button onClick={() => setSelectedStation(null)} className="flex-1 bg-zinc-50 hover:bg-zinc-100 text-zinc-900 py-4 rounded-sm font-black text-[10px] uppercase tracking-widest border border-zinc-200 transition-all">Abort</button>
              <button onClick={() => { 
                const f = (document.getElementById('type-select') as HTMLSelectElement).value; 
                const s = (document.getElementById('status-select') as HTMLSelectElement).value; 
                const q = (document.getElementById('queue-select') as HTMLSelectElement).value; 
                if (selectedStation) handleReport(selectedStation, f, s, q); 
              }} className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white py-4 rounded-sm font-black text-[10px] uppercase tracking-widest border border-zinc-800 transition-all shadow-xl active:scale-[0.98]">Commit</button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .leaflet-container { font-family: inherit; background: #ffffff; }
        .better-auth-popup .leaflet-popup-content-wrapper { border-radius: 0px; padding: 20px; border: 1px solid #e4e4e7; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.2); background: #ffffff; }
        .better-auth-popup .leaflet-popup-tip { display: none; }
      `}</style>
    </div>
  );
};

const PriceCard = ({ label, price, activeColor }: { label: string, price: GlobalPrice | undefined, activeColor: string }) => (
  <div className="p-4 rounded-sm border border-zinc-200 bg-zinc-50 transition-all hover:border-zinc-900 group">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-400 group-hover:text-zinc-900">{label}</span>
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeColor}`}></span>
    </div>
    <div className="flex flex-col">
      <span className="text-sm font-black tracking-tighter text-zinc-900">{price ? price.price.toFixed(2) : '--'}</span>
      <span className="text-[7px] font-black text-zinc-400 uppercase tracking-widest leading-none">ETB/UNIT</span>
    </div>
  </div>
);

const AmenityBadge = ({ type }: { type: string }) => (
  <span className="bg-zinc-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-widest border border-zinc-800">{type}</span>
);

const StationMiniFeed = ({ label, report, activeColor }: { label: string, report: FuelStatus & { price: GlobalPrice | null }, activeColor: string }) => {
  if (report.stats.total === 0) return null;
  const isAvailable = report.latest?.status === 'Available';
  return (
    <div className="flex items-center justify-between bg-zinc-50 p-2 rounded-sm border border-zinc-100 group-hover:bg-zinc-100 transition-colors">
      <span className={`text-[8px] font-black uppercase tracking-widest ${isAvailable ? activeColor : 'text-zinc-400'}`}>{label}</span>
      <span className={`text-[8px] font-black uppercase tracking-widest ${isAvailable ? 'text-zinc-900' : 'text-zinc-300'}`}>{report.latest?.status}</span>
    </div>
  );
};

const DetailedStatus = ({ label, report, colorClass, getQueueLabel, onVote, userId }: { 
  label: string, 
  report: FuelStatus & { price: GlobalPrice | null }, 
  colorClass: string, 
  getQueueLabel: (q: string) => string,
  onVote: (id: string, action: 'upvote' | 'downvote') => void,
  userId?: string
}) => {
  const isAvailable = report.latest?.status === 'Available';
  const latest = report.latest;
  
  return (
    <div className="bg-zinc-50 p-5 rounded-sm border border-zinc-100 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 leading-none mb-1">{label}</span>
          <span className={`text-sm font-black tracking-tighter ${colorClass}`}>{report.price ? `${report.price.price} ${report.price.unit}` : 'N/A'}</span>
        </div>
        <div className={`px-3 py-1.5 rounded-sm text-[8px] font-black uppercase tracking-widest border ${isAvailable ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-300 border-zinc-200'}`}>{report.latest?.status || 'N/A'}</div>
      </div>
      
      <div className="flex justify-between items-center border-b border-zinc-100 pb-3 mb-1">
        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Queue: <span className="text-zinc-900">{getQueueLabel(report.latest?.queue || '')}</span></span>
        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 opacity-40 uppercase">{report.stats.total} REPORTS</span>
      </div>

      {latest && (
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-zinc-400 leading-none mb-1">Contributor</span>
              <div className="flex items-center gap-1.5">
                 <span className="text-[9px] font-black uppercase tracking-widest text-zinc-900 italic">{latest.user?.firstName || 'Anonymous'}</span>
                 <span className="bg-zinc-900 text-white text-[7px] font-black px-1.5 py-0.5 rounded-sm uppercase tracking-widest border border-zinc-800">TRUST: {latest.user?.trustScore || 0}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={(e) => { e.stopPropagation(); onVote(latest.id, 'upvote'); }}
              disabled={latest.userId === userId}
              title={latest.userId === userId ? "Cannot vote on your own report" : "Upvote reliability"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-sm border transition-all ${latest.userId === userId ? 'opacity-30 grayscale cursor-not-allowed' : 'bg-white border-zinc-200 hover:border-zinc-900 active:scale-95'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-900"><path d="m18 15-6-6-6 6"/></svg>
              <span className="text-[9px] font-black text-zinc-900">{latest.upvotes}</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onVote(latest.id, 'downvote'); }}
              disabled={latest.userId === userId}
              title={latest.userId === userId ? "Cannot vote on your own report" : "Report inaccuracy"}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-sm border transition-all ${latest.userId === userId ? 'opacity-30 grayscale cursor-not-allowed' : 'bg-white border-zinc-200 hover:border-zinc-900 active:scale-95'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-900"><path d="m6 9 6 6 6-6"/></svg>
              <span className="text-[9px] font-black text-zinc-900">{latest.downvotes}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
  <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 rounded-sm transition-colors cursor-default">
    <span className={`w-2.5 h-2.5 ${color} rounded-sm shadow-sm`}></span>
    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-900">{label}</span>
  </div>
);

const AmenityItem = ({ label, available, icon }: { label: string, available: boolean, icon: React.ReactNode }) => (
  <div className={`p-4 border rounded-sm flex flex-col gap-3 transition-all ${available ? 'bg-white border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]' : 'bg-zinc-50 border-zinc-100 opacity-40'}`}>
    <div className="flex justify-between items-center">
      <div className={`w-8 h-8 flex items-center justify-center rounded-sm ${available ? 'bg-zinc-900 text-white' : 'bg-zinc-200 text-zinc-400'}`}>
        {icon}
      </div>
      {available && <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>}
    </div>
    <span className="text-[9px] font-black uppercase tracking-widest leading-none">{label}</span>
  </div>
);

const ShoppingCartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>;
const CoffeeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>;
const CarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>;
const ToiletIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const ATMIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7 12 2"/></svg>;

const FormGroup = ({ label, children }: { label: string, children: React.ReactNode }) => (
  <div className="flex flex-col gap-2"><label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-300 leading-none ml-1">{label}</label>{children}</div>
);

const MapEvents = ({ setZoom }: { setZoom: (z: number) => void }) => {
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  return null;
};

const MapRecenter = ({ location }: { location: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => { if (location) map.flyTo(location, 15); }, [location, map]);
  return null;
};

export default MapComponent;
