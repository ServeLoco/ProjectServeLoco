import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnalyticsApi } from '../api';
import { useAreaStore } from '../stores/useAreaStore';
import './Analytics.css';
import './HeatMap.css';

// Where people opened the app: every app session's first location (rounded
// to ~100 m on the server), for one IST day or the days ending on it. The
// area switcher scopes it by the area the phone was IN at the time; "All
// areas" also shows opens outside every zone — demand where there is no
// service yet. Sessions are kept 30 days.

const RANGES = [
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];
const DEFAULT_CENTER = [22.5, 79]; // India, until there is data to fit
const MAP_PADDING = [30, 30];

const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const shiftDate = (dateKey, days) => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Green (few opens) → red (most), relative to the busiest cell.
const heatStyle = (opens, max) => {
  const ratio = max > 0 ? Math.min(opens / max, 1) : 0;
  const color = `hsl(${Math.round((1 - ratio) * 120)}, 85%, 45%)`;
  return {
    radius: 6 + ratio * 14,
    color,
    fillColor: color,
    weight: 1,
    opacity: 0.9,
    fillOpacity: 0.35 + ratio * 0.45,
  };
};

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

export default function HeatMap() {
  const { areaId: selectedAreaId, isSuperAdmin } = useAreaStore() || {};
  const allAreas = isSuperAdmin && selectedAreaId === 'all';

  const today = useMemo(istToday, []);
  const [date, setDate] = useState(today);
  const [days, setDays] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await AnalyticsApi.heatmap({ date, days });
      setData(res.data || null);
    } catch (e) {
      setError(e?.message || 'Could not load the map');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, days]);

  useEffect(() => { load(); }, [load]);

  // One Leaflet map for the page's lifetime; layers are swapped on new data.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return undefined;
    // Wheel zoom only once the map is clicked: otherwise scrolling the page
    // down to the charts below zooms the map instead.
    const map = L.map(mapElRef.current, { zoomControl: true, preferCanvas: true, scrollWheelZoom: false })
      .setView(DEFAULT_CENTER, 5);
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!data) return;

    const bounds = L.latLngBounds([]);
    for (const zone of data.zones || []) {
      const ring = (zone.boundary || []).map((p) => [Number(p.lat), Number(p.lng)]);
      if (ring.length < 3) continue;
      L.polygon(ring, { color: '#2563eb', weight: 1.5, fillOpacity: 0.04, interactive: false }).addTo(layer);
      ring.forEach((p) => bounds.extend(p));
    }

    const points = data.points || [];
    const max = points.reduce((m, p) => Math.max(m, p.opens), 0);
    // Smallest first, so the busiest cells are drawn on top.
    [...points].sort((a, b) => a.opens - b.opens).forEach((p) => {
      L.circleMarker([p.lat, p.lng], heatStyle(p.opens, max))
        .bindTooltip(`${p.opens} open${p.opens === 1 ? '' : 's'} · ${p.users} ${p.users === 1 ? 'person' : 'people'}`)
        .addTo(layer);
      bounds.extend([p.lat, p.lng]);
    });

    if (bounds.isValid()) map.fitBounds(bounds, { padding: MAP_PADDING, maxZoom: 15 });
    // The container may have been sized while hidden behind the loader.
    setTimeout(() => map.invalidateSize(), 0);
  }, [data]);

  const byHour = data?.byHour || Array(24).fill(0);
  const maxHour = Math.max(...byHour, 0);
  const peakHour = maxHour > 0 ? byHour.indexOf(maxHour) : null;
  const byZone = data?.byZone || [];
  const outside = byZone.find((z) => z.outside);
  const totals = data?.totals || { opens: 0, users: 0 };

  return (
    <div className="analytics-container heatmap-page">
      <div className="analytics-header">
        <div>
          <h1>App opens map</h1>
          <p>Where people opened the app{allAreas ? ', in every area' : ''} — each dot is a ~100 m spot, redder means more opens.</p>
        </div>
        <div className="heatmap-controls">
          <input
            type="date"
            className="heatmap-date"
            value={date}
            max={today}
            min={shiftDate(today, -29)}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Day"
          />
          <div className="analytics-day-selector">
            {RANGES.map((r) => (
              <button key={r.days} className={days === r.days ? 'active' : ''} onClick={() => setDays(r.days)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-stats">
        <div className="heatmap-stat"><span>App opens</span><strong>{totals.opens}</strong></div>
        <div className="heatmap-stat"><span>People</span><strong>{totals.users}</strong></div>
        <div className="heatmap-stat"><span>Busiest hour</span><strong>{peakHour === null ? '—' : hourLabel(peakHour)}</strong></div>
        {allAreas && (
          <div className="heatmap-stat heatmap-stat-warn">
            <span>Outside every zone</span><strong>{outside ? outside.opens : 0}</strong>
          </div>
        )}
      </div>

      <div className="analytics-card heatmap-map-card">
        {error && <div className="heatmap-error">{error}</div>}
        {loading && <div className="heatmap-loading">Loading…</div>}
        {!loading && !error && totals.opens === 0 && (
          <div className="heatmap-empty">
            No app opens with a location {days === 1 ? 'on this day' : 'in these days'}. Locations are recorded from the app update that sends them.
          </div>
        )}
        <div ref={mapElRef} className="heatmap-map" />
        {data?.truncated && <div className="analytics-card-hint">Showing the 5,000 busiest spots.</div>}
      </div>

      <div className="analytics-card">
        <div className="analytics-card-head">
          <h2>Opens by hour</h2>
          <span className="analytics-card-hint">India time{days > 1 ? `, all ${days} days together` : ''}</span>
        </div>
        <div className="heatmap-hours">
          {byHour.map((count, h) => (
            <div key={h} className="heatmap-hour" title={`${hourLabel(h)} — ${count} opens`}>
              <div className="heatmap-hour-bar" style={{ height: `${maxHour ? Math.max((count / maxHour) * 100, count ? 4 : 0) : 0}%` }} />
              <span>{h % 3 === 0 ? h : ''}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="analytics-card">
        <div className="analytics-card-head">
          <h2>By zone</h2>
          <span className="analytics-card-hint">Which delivery zone each app open was in</span>
        </div>
        {byZone.length === 0 ? (
          <div className="analytics-empty">Nothing yet.</div>
        ) : (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  {allAreas && <th>Area</th>}
                  <th>Zone</th>
                  <th>App opens</th>
                  <th>People</th>
                </tr>
              </thead>
              <tbody>
                {byZone.map((z) => (
                  <tr key={`${z.areaId}-${z.zoneId}`}>
                    {allAreas && <td>{z.outside ? '—' : (z.areaCode || z.areaId)}</td>}
                    <td>{z.outside ? <em>Outside every zone</em> : (z.zoneName || `Zone ${z.zoneId}`)}</td>
                    <td>{z.opens}</td>
                    <td>{z.users}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
