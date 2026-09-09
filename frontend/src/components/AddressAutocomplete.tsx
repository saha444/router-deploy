import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';

export interface AddressSuggestion {
  name: string;
  lat: number;
  lon: number;
  subtext?: string;
}

const LOCAL_LANDMARKS: AddressSuggestion[] = [
  {
    name: 'Connaught Place, Central Delhi',
    lat: 28.6315,
    lon: 77.2167,
    subtext: 'Central delivery corridor, New Delhi, 110001',
  },
  {
    name: 'Okhla Industrial Area Phase III, New Delhi',
    lat: 28.5355,
    lon: 77.2756,
    subtext: 'Major freight & manufacturing hub, South Delhi, 110020',
  },
  {
    name: 'Bandra Kurla Complex (BKC), Mumbai',
    lat: 19.0657,
    lon: 72.8687,
    subtext: 'Financial & corporate district, Mumbai, 400051',
  },
  {
    name: 'Bhiwandi Logistics & Warehousing Park, Mumbai',
    lat: 19.2968,
    lon: 73.0632,
    subtext: 'Primary national distribution zone, MMR, 421302',
  },
  {
    name: 'Koramangala Commercial Hub, Bengaluru',
    lat: 12.9352,
    lon: 77.6245,
    subtext: 'Urban retail & commerce quarter, Bengaluru, 560034',
  },
  {
    name: 'Peenya Industrial Terminal, Bengaluru',
    lat: 13.0334,
    lon: 77.5142,
    subtext: 'Heavy industrial & dispatch park, Bengaluru, 560058',
  },
  {
    name: 'Park Street Logistics Point, Kolkata',
    lat: 22.5535,
    lon: 88.3518,
    subtext: 'Central commercial arterial, Kolkata, 700016',
  },
  {
    name: 'Dankuni Freight Hub, Kolkata',
    lat: 22.6842,
    lon: 88.2934,
    subtext: 'Intermodal freight & railway logistics, West Bengal, 712311',
  },
  {
    name: 'HITEC City Freight Post, Hyderabad',
    lat: 17.4435,
    lon: 78.3772,
    subtext: 'Tech & corporate logistics corridor, Hyderabad, 500081',
  },
  {
    name: 'Sriperumbudur Logistics Park, Chennai',
    lat: 12.9675,
    lon: 79.9442,
    subtext: 'Automotive & industrial freight corridor, Tamil Nadu, 602105',
  },
  {
    name: 'Chakan Automotive Industrial Hub, Pune',
    lat: 18.7606,
    lon: 73.8636,
    subtext: 'Auto engineering & distribution cluster, Maharashtra, 410501',
  },
  {
    name: 'Sanand Industrial Terminal, Ahmedabad',
    lat: 22.9852,
    lon: 72.3812,
    subtext: 'Manufacturing & fleet terminal, Gujarat, 382110',
  },
];

interface AddressAutocompleteProps {
  placeholder?: string;
  value?: string;
  onSelect: (item: AddressSuggestion) => void;
  className?: string;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  placeholder = 'Type address or street name...',
  value = '',
  onSelect,
  className = '',
}) => {
  const { isDark } = useTheme();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync external value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch suggestions from Nominatim or local landmarks with debouncing
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const trimmed = query.trim().toLowerCase();

    // Immediate matching from local landmarks
    const localMatches = LOCAL_LANDMARKS.filter(
      (l) =>
        l.name.toLowerCase().includes(trimmed) ||
        (l.subtext && l.subtext.toLowerCase().includes(trimmed))
    );

    setSuggestions(localMatches);
    if (localMatches.length > 0) {
      setIsOpen(true);
    }

    // Debounced network query to OpenStreetMap Nominatim for live addresses
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&countrycodes=in&limit=6&addressdetails=1`;
        let res = await fetch(url, { signal: controller.signal });
        let data = res.ok ? await res.json() : [];
        if (!Array.isArray(data) || data.length === 0) {
          url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            query
          )}&limit=6&addressdetails=1`;
          res = await fetch(url, { signal: controller.signal });
          data = res.ok ? await res.json() : [];
        }
        if (Array.isArray(data) && data.length > 0) {
            const apiSuggestions: AddressSuggestion[] = data.map((item: any) => ({
              name: item.display_name.split(',').slice(0, 3).join(', ').trim(),
              lat: parseFloat(item.lat),
              lon: parseFloat(item.lon),
              subtext: item.display_name.split(',').slice(3).join(', ').trim() || item.type,
            }));

            const combined = [...localMatches];
            for (const apiItem of apiSuggestions) {
              if (!combined.some((c) => Math.abs(c.lat - apiItem.lat) < 0.0001 && Math.abs(c.lon - apiItem.lon) < 0.0001)) {
                combined.push(apiItem);
              }
            }
            setSuggestions(combined.slice(0, 6));
            setIsOpen(true);
          }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Autocomplete fetch error:', err);
        }
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleItemClick = (item: AddressSuggestion) => {
    setQuery(item.name);
    setIsOpen(false);
    onSelect(item);
  };

  return (
    <div ref={wrapperRef} className={`relative w-full ${className}`}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none transition-colors font-garamond ${
            isDark
              ? 'bg-neutral-900 border-neutral-700 text-white focus:border-white'
              : 'bg-white border-neutral-300 text-black focus:border-black'
          }`}
        />
        {isLoading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin border-neutral-400" />
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div
          className={`absolute top-full left-0 right-0 mt-1.5 rounded-xl border shadow-2xl z-[9999] overflow-hidden backdrop-blur-lg ${
            isDark
              ? 'bg-[#0d0d0d] border-neutral-800 text-white divide-neutral-800/60'
              : 'bg-white border-neutral-200 text-black divide-neutral-100'
          } divide-y`}
        >
          {suggestions.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleItemClick(item)}
              className={`w-full text-left px-4 py-2.5 text-xs transition-colors flex flex-col gap-0.5 ${
                isDark ? 'hover:bg-neutral-800/80' : 'hover:bg-neutral-50'
              }`}
            >
              <div className="font-semibold text-sm leading-snug">{item.name}</div>
              {item.subtext && (
                <div className="text-[11px] opacity-60 truncate">{item.subtext}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
