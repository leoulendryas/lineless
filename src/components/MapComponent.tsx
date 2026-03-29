'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import TelegramLogin from './TelegramLogin';
import { 
  Sun, Moon, MapPin, RefreshCw, X, ShoppingCart, 
  Coffee, Waves, UserCircle, CreditCard, ChevronUp, 
  ChevronDown, Info, Radio, Zap, Fuel
} from 'lucide-react';

// Helper to calculate distance in meters
const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

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
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState(12);
  const [syncError, setSyncFailed] = useState<string | null>(null);
  const [mapRef, setMapRef] = useState<L.Map | null>(null);

  useEffect(() => { 
    fetchAllStations(); 
    checkUser();

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setUserLocation(loc);
          if (mapRef) mapRef.flyTo(loc, 15);
        },
        () => { console.log('Location access declined.'); },
        { timeout: 10000 }
      );
    }

    if (mapRef) {
       // @ts-ignore
       if (mapRef.tap) mapRef.tap.disable();
    }
  }, [mapRef]);

  useEffect(() => {
    const isDark = localStorage.getItem('lineless_dark_mode') === 'true' || 
                   (!('lineless_dark_mode' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkMode(isDark);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('lineless_dark_mode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('lineless_dark_mode', 'false');
    }
  }, [darkMode]);

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
    if (!userLocation) return alert('GPS data required to commit status.');
    const dist = getDistance(userLocation[0], userLocation[1], station.lat, station.lon);
    if (dist > 300) {
       return alert(`PROXIMITY ALERT: You are ${Math.round(dist)}m away. Move closer to the terminal to broadcast.`);
    }

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
    <div className="h-full w-full flex items-center justify-center bg-white dark:bg-zinc-950 transition-colors duration-500">
      <div className="flex flex-col items-center gap-6">
        <div className="grid grid-cols-2 gap-1 animate-pulse">
          <div className="w-4 h-4 bg-zinc-900 dark:bg-zinc-50"></div>
          <div className="w-4 h-4 bg-zinc-200 dark:bg-zinc-800"></div>
          <div className="w-4 h-4 bg-zinc-200 dark:bg-zinc-800"></div>
          <div className="w-4 h-4 bg-zinc-900 dark:bg-zinc-50"></div>
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-zinc-900 dark:text-zinc-50">Lineless Grid Initializing</span>
      </div>
    </div>
  );

  const getQueueLabel = (q: string) => {
    if (q === 'No Line') return 'Clear (< 10 Cars)';
    if (q === 'Short') return 'Short (10 - 30 Cars)';
    if (q === 'Medium') return 'Moderate (30 - 70 Cars)';
    if (q === 'Long') return 'Extended (70+ Cars)';
    return q || 'N/A';
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans selection:bg-zinc-900 selection:text-white transition-colors duration-500 relative">
      {/* Sidebar Terminal */}
      <aside className={`fixed md:relative inset-y-0 left-0 transition-all duration-500 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 z-[3000] flex flex-col ${showSidebar ? 'w-full md:w-[460px] translate-x-0' : 'w-0 -translate-x-full md:translate-x-0 overflow-hidden'}`}>
        <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
        
        <div className="p-4 md:p-10 pb-6 flex flex-col gap-6 md:gap-10 relative">
          <div className="flex justify-between items-center gap-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-white dark:bg-zinc-900 flex items-center justify-center rounded-sm shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shrink-0">
                  <svg className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="24" height="24" className="fill-white dark:fill-zinc-900"/>
                    <path d="M4 4V20H20" className="stroke-zinc-900 dark:stroke-zinc-50" strokeWidth="4" strokeLinecap="square"/>
                    <path d="M12 4L12 12" className="stroke-zinc-900 dark:stroke-zinc-50" strokeWidth="4" strokeLinecap="square" opacity="0.3"/>
                  </svg>
                </div>
                <h2 className="font-black text-xl md:text-2xl tracking-tighter leading-none text-zinc-950 dark:text-zinc-50 italic uppercase whitespace-nowrap">Lineless</h2>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              <button 
                onClick={() => setDarkMode(!darkMode)} 
                className="p-2 md:p-3 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-sm border border-zinc-200 dark:border-zinc-800 text-zinc-950 dark:text-zinc-50 transition-all shadow-sm active:scale-90"
              >
                {darkMode ? <Sun className="w-4 h-4 md:w-[18px] md:h-[18px]" /> : <Moon className="w-4 h-4 md:w-[18px] md:h-[18px]" />}
              </button>
              {user ? (
                <div className="flex items-center gap-2 md:gap-3 group">
                  <div className="flex flex-col items-end hidden sm:flex">
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-950 dark:text-zinc-50 leading-none">{user.firstName}</span>
                    <span className="text-[7px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500 leading-none mt-1">Trust Score: {user.trustScore}</span>
                  </div>
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt="Avatar" className="w-8 h-8 md:w-10 md:h-10 rounded-sm border border-zinc-200 dark:border-zinc-800 grayscale hover:grayscale-0 transition-all cursor-pointer shadow-md" onClick={handleLogout} />
                  ) : (
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center rounded-sm border border-zinc-200 dark:border-zinc-800 text-[10px] md:text-[12px] font-black cursor-pointer text-zinc-950 dark:text-zinc-50 shadow-md" onClick={handleLogout}>{user.firstName?.[0]}</div>
                  )}
                </div>
              ) : (
                <TelegramLogin botName={process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "lineless_help_bot"} onAuth={handleTelegramAuth} className="w-[100px] md:w-[120px] h-[36px] md:h-[40px]">
                  <div className="w-full h-full bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 flex items-center justify-center gap-1 md:gap-2 rounded-sm border border-zinc-800 dark:border-zinc-200 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all cursor-pointer">
                    <svg className="w-3 h-3 md:w-3.5 md:h-3.5" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42l10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.703l-.333 4.965c.487 0 .702-.223.974-.488l2.338-2.274l4.86 3.59c.896.494 1.54.24 1.763-.829l3.19-15.035c.326-1.306-.5-1.9-1.352-1.564z"/>
                    </svg>
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">Connect</span>
                  </div>
                </TelegramLogin>
              )}
              <button onClick={() => setShowSidebar(false)} className="p-2 md:p-3 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:border-zinc-800 rounded-sm transition-all text-zinc-950 dark:text-zinc-50 active:scale-90">
                 <X className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
          
          <div className="flex gap-2">
             <button onClick={locateUser} className="flex-1 py-4 px-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-950 dark:text-zinc-50 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border border-zinc-200 dark:border-zinc-800 shadow-sm active:scale-95 flex items-center justify-center gap-2"><MapPin size={14} /> Locate</button>
             <button onClick={fetchAllStations} disabled={scanning} className="flex-1 py-4 px-4 bg-zinc-950 dark:bg-zinc-50 hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:bg-zinc-400 text-white dark:text-zinc-950 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all border border-zinc-200 dark:border-zinc-800 shadow-sm active:scale-95 flex items-center justify-center gap-2"><RefreshCw size={14} className={scanning ? 'animate-spin' : ''} /> Sync</button>
          </div>

          <div className="grid grid-cols-3 gap-2">
             <PriceCard label="Benzene" price={globalPrices?.Benzene} activeColor="bg-orange-500" />
             <PriceCard label="Diesel" price={globalPrices?.Gasoline} activeColor="bg-zinc-950 dark:bg-zinc-100" />
             <PriceCard label="Electric" price={globalPrices?.Electric} activeColor="bg-blue-600" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10 space-y-8 no-scrollbar relative">
          <div className="sticky top-0 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-md pt-2 pb-6 z-10 border-b border-zinc-200 dark:border-zinc-800">
             <div className="relative">
               <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="w-full p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-sm text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-zinc-950 dark:focus:ring-zinc-50 transition-all appearance-none cursor-pointer text-zinc-950 dark:text-zinc-50">
                  <option value="all">Pool: {stations.length}</option>
                  <option value="fuel">Fuel Hubs</option>
                  <option value="charging">Energy Nodes</option>
                  <option value="parking">Parking Slots</option>
                  <option value="car_wash">Wash Centers</option>
               </select>
               <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                 <ChevronDown size={14} />
               </div>
             </div>
          </div>

          <div className="space-y-4">
            {stations.find(s => s.id === activePopupId) ? (
              (() => {
                const s = stations.find(s => s.id === activePopupId)!;
                return (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-6 bg-white dark:bg-zinc-900 rounded-sm border-2 border-zinc-950 dark:border-zinc-50 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,0.15)] transition-colors">
                      <div className="flex justify-between items-start mb-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500 flex items-center gap-2"><Radio size={10} className="animate-pulse" /> Active Node</span>
                          <h3 className="font-black text-zinc-950 dark:text-zinc-50 tracking-tight text-xl uppercase italic leading-none">{s.name}</h3>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 border-white dark:border-zinc-900 ${s.type === 'fuel' ? 'bg-orange-500' : s.type === 'charging' ? 'bg-blue-600' : s.type === 'parking' ? 'bg-zinc-400' : 'bg-green-500'}`}></div>
                      </div>
                      <div className="flex gap-2">
                        {(s.type === 'fuel' || s.type === 'charging') && (
                          <button 
                            onClick={() => {
                              if (!userLocation) return alert('GPS data required.');
                              const dist = getDistance(userLocation[0], userLocation[1], s.lat, s.lon);
                              if (dist > 300) return alert(`PROXIMITY ERROR: Must be within 200m (Currently ${Math.round(dist)}m).`);
                              
                              if (user) setSelectedStation(s);
                              else setShowAuthPrompt(true);
                            }} 
                            className="flex-1 py-4 px-4 bg-zinc-950 dark:bg-zinc-50 text-white dark:text-zinc-950 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200 active:scale-95 shadow-lg border border-transparent dark:border-zinc-800"
                          >
                            Update Status
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <AmenityItem label="Store" available={s.amenities.shop} icon={<ShoppingCart size={16} />} />
                      <AmenityItem label="Cafe" available={s.amenities.cafe} icon={<Coffee size={16} />} />
                      <AmenityItem label="Wash" available={s.amenities.car_wash} icon={<Waves size={16} />} />
                      <AmenityItem label="Toilets" available={s.amenities.toilets} icon={<Info size={16} />} />
                      <AmenityItem label="ATM" available={s.amenities.atm} icon={<CreditCard size={16} />} />
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="p-16 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-sm flex flex-col items-center justify-center text-center bg-white/50 dark:bg-zinc-900/20">
                <div className="w-16 h-16 bg-white dark:bg-zinc-900 flex items-center justify-center rounded-full mb-6 shadow-sm border border-zinc-100 dark:border-zinc-800">
                  <MapPin size={24} className="text-zinc-300 dark:text-zinc-700" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 max-w-[200px] leading-relaxed">Select an active node on the grid to initialize link</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Map View */}
      <div className="relative flex-1 h-full bg-zinc-100 dark:bg-zinc-950 transition-colors duration-500">
        {!showSidebar && (
          <button onClick={() => setShowSidebar(true)} className="absolute top-8 left-8 z-[3000] bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-950 px-10 py-5 rounded-sm shadow-2xl font-black text-[11px] uppercase tracking-[0.2em] border border-zinc-800 dark:border-white transition-all active:scale-95 hover:translate-y-[-2px] flex items-center gap-3">
            <Radio size={16} className="animate-pulse" /> Open Terminal
          </button>
        )}
        
        {/* Map Legend */}
        <div className="absolute bottom-8 right-8 z-[3000] flex flex-col gap-1 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md p-1 rounded-sm shadow-2xl border border-zinc-200 dark:border-zinc-800 min-w-[200px] md:min-w-[240px]">
           <div className="bg-zinc-50 dark:bg-zinc-900 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 mb-1 hidden md:block">
             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-zinc-50 leading-none">Grid</span>
           </div>
           <LegendItem color="bg-orange-500" label="Fuel Infrastructure" />
           <LegendItem color="bg-blue-600" label="Energy Hubs" />
           <LegendItem color="bg-zinc-400" label="Public Parking" />
           <LegendItem color="bg-green-500" label="Service Centers" />
        </div>
        
        <MapContainer 
          center={ADDIS_ABABA_CENTER} 
          zoom={12} 
          className="h-full w-full grayscale-[0.3] contrast-[1.1] transition-all" 
          zoomControl={false}
          ref={setMapRef}
        >
          <TileLayer 
            attribution='&copy; CartoDB' 
            url={darkMode 
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" 
              : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"} 
          />
          <MapEvents setZoom={setZoomLevel} />
          <MapRecenter location={userLocation} />
          
          {/* User Location Marker */}
          {userLocation && (
            <Marker position={userLocation} bubblingMouseEvents={false} keyboard={false} icon={L.divIcon({ 
              className: '', 
              html: darkMode 
                ? '<div class="w-8 h-8 bg-zinc-50 rounded-full border-4 border-zinc-950 shadow-2xl animate-pulse flex items-center justify-center"><div class="w-2 h-2 bg-blue-500 rounded-full"></div></div>' 
                : '<div class="w-8 h-8 bg-zinc-900 rounded-full border-4 border-white shadow-2xl animate-pulse flex items-center justify-center"><div class="w-2 h-2 bg-blue-400 rounded-full"></div></div>', 
              iconSize: [32, 32] 
            })}>
              <Popup className="better-auth-popup">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">Local Access Point</div>
              </Popup>
            </Marker>
          )}

          <MarkerClusterGroup
            chunkedLoading
            showCoverageOnHover={false}
            maxClusterRadius={50}
            iconCreateFunction={(cluster: any) => {
              const count = cluster.getChildCount();
              return L.divIcon({
                html: `<div class="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md text-zinc-950 dark:text-zinc-50 text-[11px] font-black w-10 h-10 rounded-sm flex items-center justify-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.2)] border-2 border-zinc-950 dark:border-zinc-50 hover:scale-110 transition-transform">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: [40, 40]
              });
            }}
            >
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
                  keyboard={false}
                  eventHandlers={{ click: () => {
                     setActivePopupId(station.id);
                  }}}
                  icon={L.divIcon({ 
                    className: '', 
                    html: zoomLevel < 12 
                      ? `<div class="w-3 h-3 ${colorClass} rounded-full border-2 border-white dark:border-zinc-900 shadow-md ${isActive ? 'scale-150 ring-2 ring-zinc-950 dark:ring-zinc-50' : ''}"></div>` 
                      : `<div class="w-8 h-8 ${colorClass} border border-white dark:border-zinc-950 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,0.2)] flex items-center justify-center text-[11px] text-white font-black rounded-sm ${isActive ? 'scale-125 ring-2 ring-zinc-950 dark:ring-zinc-50' : ''}">${isFuel ? 'F' : isParking ? 'P' : isCarWash ? 'W' : 'E'}</div>`, 
                    iconSize: [32, 32], 
                    iconAnchor: [16, 16] 
                  })}
                >

                  {isActive && (
                    <Popup 
                      className="better-auth-popup" 
                      eventHandlers={{ remove: () => setActivePopupId(null) }}
                      autoPan={true}
                    >
                      <div className="min-w-[300px] md:min-w-[360px] p-2 bg-white dark:bg-zinc-950 transition-colors">
                        <div className="flex justify-between items-center mb-6 border-b border-zinc-100 dark:border-zinc-800 pb-5">
                          <h3 className="font-black text-xl tracking-tighter text-zinc-900 dark:text-zinc-50 uppercase italic leading-none">{station.name}</h3>
                          <div className={`w-3 h-3 rounded-full ${colorClass} border border-white dark:border-zinc-900 shadow-sm`}></div>
                        </div>
                        
                        {station.type === 'fuel' || station.type === 'charging' ? (
                          <div className="space-y-4">
                            <DetailedStatus label="Benzene" report={station.reports.Benzene} colorClass="text-orange-600" getQueueLabel={getQueueLabel} onVote={handleVote} userId={user?.id} />
                            <DetailedStatus label="Diesel" report={station.reports.Gasoline} colorClass="text-zinc-900 dark:text-zinc-50" getQueueLabel={getQueueLabel} onVote={handleVote} userId={user?.id} />
                            {(station.type === 'charging' || station.reports.Electric.stats.total > 0) && <DetailedStatus label="Electric" report={station.reports.Electric} colorClass="text-blue-600" getQueueLabel={getQueueLabel} onVote={handleVote} userId={user?.id} />}
                          </div>
                        ) : (
                          <div className="p-6 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-sm text-zinc-900 dark:text-zinc-50">
                             <div className="flex items-center gap-3 mb-3">
                               <Info size={16} className="text-zinc-400" />
                               <span className="text-[11px] font-black uppercase tracking-widest">{station.type === 'parking' ? 'Storage Node' : 'Detialing Node'}</span>
                             </div>
                             <p className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest leading-loose">Automated infrastructure tracking. Verification active for real-time status.</p>
                          </div>
                        )}

                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setActivePopupId(station.id);
                            setShowSidebar(true);
                          }} 
                          className="w-full mt-8 bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-950 py-5 rounded-sm text-[11px] font-black uppercase tracking-[0.2em] transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200 border border-zinc-800 dark:border-white active:scale-[0.98] cursor-pointer flex items-center justify-center gap-3"
                        >
                          <ChevronUp size={16} /> Open Detailed Terminal
                        </button>
                      </div>
                    </Popup>
                  )}
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* Auth Prompt Modal */}
      {showAuthPrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-900/60 dark:bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 p-12 rounded-sm shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] dark:shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)] w-full max-w-[440px] border-2 border-zinc-900 dark:border-zinc-50 relative text-center animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowAuthPrompt(false)} className="absolute top-6 right-6 p-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-sm transition-all text-zinc-900 dark:text-zinc-50"><X size={24} /></button>
            <div className="w-20 h-20 bg-zinc-900 dark:bg-zinc-50 mx-auto mb-10 flex items-center justify-center rounded-sm shadow-2xl">
              <UserCircle size={40} className="text-white dark:text-zinc-900" />
            </div>
            <h3 className="font-black text-3xl text-zinc-900 dark:text-zinc-50 tracking-tighter mb-4 uppercase italic">ID Verification</h3>
            <p className="text-zinc-400 dark:text-zinc-500 text-[11px] font-black uppercase tracking-[0.2em] mb-12 leading-relaxed px-4">Authenticate through secure Telegram channels to contribute to the global grid status.</p>
            <div className="flex justify-center">
              <TelegramLogin botName={process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || "lineless_help_bot"} onAuth={handleTelegramAuth} className="w-full h-16">
                <div className="w-full h-full bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-950 flex items-center justify-center gap-3 rounded-sm border-2 border-zinc-800 dark:border-zinc-200 shadow-xl hover:translate-x-[2px] hover:translate-y-[2px] transition-all cursor-pointer">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42l10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.703l-.333 4.965c.487 0 .702-.223.974-.488l2.338-2.274l4.86 3.59c.896.494 1.54.24 1.763-.829l3.19-15.035c.326-1.306-.5-1.9-1.352-1.564z"/>
                  </svg>
                  <span className="text-[14px] font-black uppercase tracking-[0.2em]">Connect</span>
                </div>
              </TelegramLogin>
            </div>          </div>
        </div>
      )}

      {/* Broadcast Status Modal (Now Update Modal) */}
      {selectedStation && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-900/60 dark:bg-zinc-950/80 backdrop-blur-md p-4">
          <div className="bg-white dark:bg-zinc-900 p-12 rounded-sm shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] dark:shadow-[12px_12px_0px_0px_rgba(255,255,255,0.1)] w-full max-w-[520px] border-2 border-zinc-900 dark:border-zinc-50 relative animate-in slide-in-from-bottom-8 duration-500">
            <div className="absolute top-0 left-0 w-2 h-full bg-zinc-900 dark:bg-zinc-50"></div>
            <div className="flex items-center gap-4 mb-2">
               <Radio size={20} className="text-zinc-900 dark:text-zinc-50 animate-pulse" />
               <h3 className="font-black text-4xl text-zinc-900 dark:text-zinc-50 tracking-tighter uppercase italic">Update</h3>
            </div>
            <p className="text-zinc-400 dark:text-zinc-500 text-[11px] font-black uppercase tracking-[0.3em] mb-12 border-b border-zinc-100 dark:border-zinc-800 pb-6">{selectedStation.name}</p>
            <div className="space-y-8">
              <FormGroup label="Resource">
                <div className="relative">
                  <select id="type-select" className="w-full h-14 px-5 bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 rounded-sm text-[11px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-all text-zinc-900 dark:text-zinc-50">
                    {selectedStation.type === 'fuel' ? <><option value="Benzene">Benzene</option><option value="Gasoline">Diesel</option></> : <option value="Electric">Electric</option>}
                  </select>
                  <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400" />
                </div>
              </FormGroup>
              <FormGroup label="Status">
                <div className="relative">
                  <select id="status-select" className="w-full h-14 px-5 bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 rounded-sm text-[11px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-all text-zinc-900 dark:text-zinc-50">
                    <option value="Available">Available</option>
                    <option value="Out of Stock">Unavailable</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400" />
                </div>
              </FormGroup>
              <FormGroup label="Queue Intensity">
                <div className="relative">
                  <select id="queue-select" className="w-full h-14 px-5 bg-zinc-50 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 rounded-sm text-[11px] font-black uppercase tracking-widest outline-none appearance-none cursor-pointer focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-50 transition-all text-zinc-900 dark:text-zinc-50">
                    <option value="No Line">Clear (&lt; 10 Units)</option>
                    <option value="Short">Short (10 - 30 Units)</option>
                    <option value="Medium">Moderate (30 - 70 Units)</option>
                    <option value="Long">Extended (70+ Units)</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400" />
                </div>
              </FormGroup>
            </div>
            <div className="flex gap-4 mt-14">
              <button onClick={() => setSelectedStation(null)} className="flex-1 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-50 py-5 rounded-sm font-black text-[11px] uppercase tracking-[0.2em] border-2 border-zinc-200 dark:border-zinc-700 transition-all shadow-md active:scale-95">Abort</button>
              <button onClick={() => { 
                const f = (document.getElementById('type-select') as HTMLSelectElement).value; 
                const s = (document.getElementById('status-select') as HTMLSelectElement).value; 
                const q = (document.getElementById('queue-select') as HTMLSelectElement).value; 
                if (selectedStation) handleReport(selectedStation, f, s, q); 
              }} className="flex-1 bg-zinc-900 dark:bg-zinc-50 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 py-5 rounded-sm font-black text-[11px] uppercase tracking-[0.2em] border-2 border-zinc-800 dark:border-zinc-200 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">Commit</button>
            </div>
          </div>
        </div>
      )}

      {/* High-level Global Styles for Map & Brutalism */}
      <style jsx global>{`
        .leaflet-container { font-family: inherit; background: #ffffff; }
        .dark .leaflet-container { background: #09090b; }
        .leaflet-marker-icon { outline: none !important; -webkit-tap-highlight-color: transparent !important; }
        
        .better-auth-popup .leaflet-popup-content-wrapper { border-radius: 4px; padding: 0px; border: 2px solid #09090b; box-shadow: 5px 5px 0px 0px rgba(0,0,0,1); background: #ffffff; color: #09090b; overflow: hidden; }
        .dark .better-auth-popup .leaflet-popup-content-wrapper { background: #09090b; border-color: #fafafa; color: #fafafa; box-shadow: 5px 5px 0px 0px rgba(255,255,255,0.15); }
        .better-auth-popup .leaflet-popup-content { margin: 0; width: auto !important; }
        .better-auth-popup .leaflet-popup-tip { display: none; }
        
        .custom-cluster-icon { background: none; border: none; }
        
        /* Modern Scrollbar for Terminal */
        .no-scrollbar::-webkit-scrollbar { width: 4px; }
        .no-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .no-scrollbar::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 10px; }
        .dark .no-scrollbar::-webkit-scrollbar-thumb { background: #27272a; }
      `}</style>
    </div>
  );
};

const PriceCard = ({ label, price, activeColor }: { label: string, price: GlobalPrice | undefined, activeColor: string }) => (
  <div className="p-5 rounded-sm border-2 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 transition-all hover:border-zinc-900 dark:hover:border-zinc-100 group shadow-sm hover:shadow-md">
    <div className="flex items-center justify-between mb-3">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-50">{label}</span>
      <span className={`w-2 h-2 rounded-full animate-pulse ${activeColor} shadow-sm`}></span>
    </div>
    <div className="flex flex-col">
      <span className="text-lg font-black tracking-tighter text-zinc-900 dark:text-zinc-50 leading-tight">{price ? price.price.toFixed(2) : '--'}</span>
      <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-1">ETB/L</span>
    </div>
  </div>
);

const AmenityItem = ({ label, available, icon }: { label: string, available: boolean, icon: React.ReactNode }) => (
  <div className={`p-5 border-2 rounded-sm flex flex-col gap-4 transition-all ${available ? 'bg-white dark:bg-zinc-900 border-zinc-950 dark:border-zinc-50 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)] hover:translate-x-[-2px] hover:translate-y-[-2px]' : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-100 dark:border-zinc-800 opacity-30 grayscale'}`}>
    <div className="flex justify-between items-center">
      <div className={`w-10 h-10 flex items-center justify-center rounded-sm border-2 ${available ? 'bg-zinc-50 dark:bg-zinc-950 border-zinc-950 dark:border-zinc-50 text-zinc-950 dark:text-zinc-50' : 'bg-zinc-200 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-600'}`}>
        {icon}
      </div>
      {available && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse border border-white dark:border-zinc-900 shadow-sm"></div>}
    </div>
    <span className="text-[10px] font-black uppercase tracking-[0.1em] leading-none text-zinc-950 dark:text-zinc-50">{label}</span>
  </div>
);

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
    <div className="bg-zinc-50 dark:bg-zinc-900/60 p-6 rounded-sm border-2 border-zinc-100 dark:border-zinc-800 flex flex-col gap-5 group hover:border-zinc-300 dark:hover:border-zinc-600 transition-all shadow-sm">
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 leading-none mb-2">{label}</span>
          <span className={`text-xl font-black tracking-tighter ${colorClass} group-hover:scale-105 transition-transform origin-left`}>{report.price ? `${report.price.price} ${report.price.unit}` : 'OFFLINE'}</span>
        </div>
        <div className={`px-4 py-2 rounded-sm text-[9px] font-black uppercase tracking-[0.2em] border-2 transition-all ${isAvailable ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-50 shadow-md' : 'bg-white dark:bg-zinc-800 text-zinc-300 dark:text-zinc-600 border-zinc-200 dark:border-zinc-700'}`}>{report.latest?.status || 'N/A'}</div>
      </div>
      
      <div className="flex justify-between items-center border-b-2 border-zinc-100 dark:border-zinc-800 pb-4 mb-1">
        <span className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400 dark:text-zinc-500 flex items-center gap-2"><MapPin size={10} /> Queue: <span className="text-zinc-900 dark:text-zinc-50">{getQueueLabel(report.latest?.queue || '')}</span></span>
        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600 opacity-60">REPORTS</span>
      </div>

      {latest && (
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500 leading-none mb-2 italic">Contributor</span>
              <div className="flex items-center gap-2">
                 <span className="text-[10px] font-black uppercase tracking-widest text-zinc-900 dark:text-zinc-50">{latest.user?.firstName || 'Unknown Unit'}</span>
                 <span className="bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900 text-[8px] font-black px-2 py-1 rounded-sm uppercase tracking-widest border border-zinc-800 dark:border-zinc-200 shadow-sm">TRUST: {latest.user?.trustScore || 0}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onVote(latest.id, 'upvote'); }}
              disabled={latest.userId === userId}
              className={`flex items-center gap-2 px-4 py-3 rounded-sm border-2 transition-all ${latest.userId === userId ? 'opacity-20 grayscale cursor-not-allowed' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-zinc-900 dark:hover:border-zinc-50 active:scale-95 shadow-sm'}`}
            >
              <ChevronUp size={16} className="text-zinc-900 dark:text-zinc-50" />
              <span className="text-[10px] font-black text-zinc-900 dark:text-zinc-50">{latest.upvotes}</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onVote(latest.id, 'downvote'); }}
              disabled={latest.userId === userId}
              className={`flex items-center gap-2 px-4 py-3 rounded-sm border-2 transition-all ${latest.userId === userId ? 'opacity-20 grayscale cursor-not-allowed' : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 hover:border-zinc-900 dark:hover:border-zinc-50 active:scale-95 shadow-sm'}`}
            >
              <ChevronDown size={16} className="text-zinc-900 dark:text-zinc-50" />
              <span className="text-[10px] font-black text-zinc-900 dark:text-zinc-50">{latest.downvotes}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
  <div className="flex items-center gap-4 px-5 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 rounded-sm transition-colors cursor-default group">
    <span className={`w-3 h-3 ${color} rounded-sm shadow-sm border border-white dark:border-zinc-800 group-hover:scale-125 transition-transform`}></span>
    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-900 dark:text-zinc-50">{label}</span>
  </div>
);

const FormGroup = ({ label, children }: { label: string, children: React.ReactNode }) => (
  <div className="flex flex-col gap-3"><label className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-500 leading-none ml-1">{label}</label>{children}</div>
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
