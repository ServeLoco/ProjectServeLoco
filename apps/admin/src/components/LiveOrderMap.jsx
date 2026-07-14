import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { OrdersApi } from '../api';
import './LiveOrderMap.css';

const DEFAULT_CENTER = { lat: 29.451998, lng: 75.668669 };
// No socket channel pushes rider GPS to the admin room (only to the
// customer) — poll the order while it's actually en route so the rider
// pin moves without a full page refresh.
const POLL_MS = 15000;

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function shopIcon() {
  return L.divIcon({
    className: 'live-map-marker-wrap',
    html: `
      <div class="live-map-shop">
        <div class="live-map-shop-facade"><span>🏪</span></div>
        <div class="live-map-shop-awning"></div>
      </div>
    `,
    iconSize: [42, 46],
    iconAnchor: [21, 44],
  });
}

function customerIcon() {
  return L.divIcon({
    className: 'live-map-marker-wrap',
    html: `
      <div class="live-map-pin live-map-pin-customer">
        <div class="live-map-pin-hole"></div>
      </div>
      <div class="live-map-pin-tail live-map-pin-tail-customer"></div>
    `,
    iconSize: [28, 40],
    iconAnchor: [14, 38],
  });
}

function riderIcon() {
  return L.divIcon({
    className: 'live-map-marker-wrap',
    html: `<div class="live-map-scooty"><span>🛵</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/**
 * Live order-tracking map for the web admin order drawer — same shop/
 * customer/rider markers as the customer app's Track Order screen.
 * `order` should already carry `shops[]` and `rider.lastLat/lastLng`
 * (additive fields on GET /admin/orders/:id). Polls for a fresher rider
 * position while the order is out for delivery, since GPS pings aren't
 * broadcast to the admin socket room.
 */
export default function LiveOrderMap({ order }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const shopMarkersRef = useRef([]);
  const customerMarkerRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const [liveOrder, setLiveOrder] = useState(order);

  useEffect(() => {
    setLiveOrder(order);
  }, [order]);

  const destination = useMemo(() => {
    const lat = numOrNull(liveOrder?.latitude ?? liveOrder?.lat);
    const lng = numOrNull(liveOrder?.longitude ?? liveOrder?.lng);
    return lat != null && lng != null ? { lat, lng } : null;
  }, [liveOrder]);

  const shops = useMemo(() => {
    const list = liveOrder?.shops || [];
    return list
      .map((s) => {
        const lat = numOrNull(s.latitude ?? s.lat);
        const lng = numOrNull(s.longitude ?? s.lng);
        if (lat == null || lng == null) return null;
        return { id: s.id, name: s.name, lat, lng };
      })
      .filter(Boolean);
  }, [liveOrder]);

  const riderCoord = useMemo(() => {
    const rider = liveOrder?.rider;
    const lat = numOrNull(rider?.lastLat ?? rider?.last_lat);
    const lng = numOrNull(rider?.lastLng ?? rider?.last_lng);
    return lat != null && lng != null ? { lat, lng } : null;
  }, [liveOrder]);

  const isActive = liveOrder?.status && !['Delivered', 'Cancelled'].includes(liveOrder.status);
  const hasRider = Boolean(liveOrder?.rider_id || liveOrder?.riderId || liveOrder?.rider);

  // Poll for a fresher rider position — only while it's actually useful.
  useEffect(() => {
    if (!isActive || !hasRider || !liveOrder?.id) return undefined;
    const id = setInterval(async () => {
      try {
        const res = await OrdersApi.get(liveOrder.id);
        const fresh = res?.data || res;
        if (fresh) setLiveOrder((prev) => (prev && prev.id === fresh.id ? fresh : prev));
      } catch (_) { /* keep last known position on failure */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [isActive, hasRider, liveOrder?.id]);

  // Mount map once.
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return undefined;
    const center = destination || shops[0] || DEFAULT_CENTER;
    const map = L.map(mapElRef.current, { zoomControl: true }).setView([center.lat, center.lng], 14);
    mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    setTimeout(() => map.invalidateSize(), 100);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shop markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    shopMarkersRef.current.forEach((m) => map.removeLayer(m));
    shopMarkersRef.current = shops.map((s) => L.marker([s.lat, s.lng], { icon: shopIcon() })
      .bindTooltip(s.name || 'Shop', { permanent: true, direction: 'top', className: 'live-map-tooltip' })
      .addTo(map));
  }, [shops]);

  // Customer marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (customerMarkerRef.current) {
      map.removeLayer(customerMarkerRef.current);
      customerMarkerRef.current = null;
    }
    if (destination) {
      customerMarkerRef.current = L.marker([destination.lat, destination.lng], { icon: customerIcon() })
        .bindTooltip('You (delivery)', { permanent: true, direction: 'top', className: 'live-map-tooltip' })
        .addTo(map);
    }
  }, [destination]);

  // Rider marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (riderCoord) {
      if (riderMarkerRef.current) {
        riderMarkerRef.current.setLatLng([riderCoord.lat, riderCoord.lng]);
      } else {
        riderMarkerRef.current = L.marker([riderCoord.lat, riderCoord.lng], { icon: riderIcon() })
          .bindTooltip('Rider (live)', { permanent: true, direction: 'top', className: 'live-map-tooltip' })
          .addTo(map);
      }
    } else if (riderMarkerRef.current) {
      map.removeLayer(riderMarkerRef.current);
      riderMarkerRef.current = null;
    }
  }, [riderCoord]);

  // Fit bounds whenever the set of visible points changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const points = [...shops.map((s) => [s.lat, s.lng])];
    if (destination) points.push([destination.lat, destination.lng]);
    if (riderCoord) points.push([riderCoord.lat, riderCoord.lng]);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [shops, destination, riderCoord]);

  return (
    <div
      className="live-order-map-wrap"
      style={{
        position: 'relative',
        width: '100%',
        height: 240,
        flexShrink: 0,
        overflow: 'hidden',
        marginBottom: '1rem',
      }}
    >
      <div ref={mapElRef} className="live-order-map" style={{ width: '100%', height: '100%' }} />
      {!destination && shops.length === 0 ? (
        <div className="live-order-map-empty">No location pins yet for this order.</div>
      ) : null}
    </div>
  );
}
