import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './ShopLocationPicker.css';

const DEFAULT_CENTER = { lat: 29.451998, lng: 75.668669 };

/** Store-front marker (not a pin) for shop pickup location. */
function createShopMarkerIcon(L) {
  return L.divIcon({
    className: 'shop-store-marker-wrap',
    html: `
      <div class="shop-store-marker">
        <div class="shop-store-facade">
          <span class="shop-store-emoji" aria-hidden="true">🏪</span>
        </div>
        <div class="shop-store-awning"></div>
        <div class="shop-store-base"></div>
      </div>
    `,
    iconSize: [48, 52],
    iconAnchor: [24, 50],
  });
}

/**
 * Click-to-place shop location on OpenStreetMap (Leaflet).
 * value: { latitude, longitude } | null
 */
export default function ShopLocationPicker({ value, onChange, shopName }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!mapRef.current) return undefined;

    try {
      const lat = value?.latitude ?? value?.lat ?? DEFAULT_CENTER.lat;
      const lng = value?.longitude ?? value?.lng ?? DEFAULT_CENTER.lng;

      const map = L.map(mapRef.current, { zoomControl: true }).setView([lat, lng], 15);
      mapInstanceRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const placeMarker = (plat, plng) => {
        if (markerRef.current) {
          markerRef.current.setLatLng([plat, plng]);
        } else {
          markerRef.current = L.marker([plat, plng], {
            icon: createShopMarkerIcon(L),
            draggable: true,
          }).addTo(map);
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current.getLatLng();
            onChange?.({ latitude: pos.lat, longitude: pos.lng });
          });
        }
      };

      if (value?.latitude != null && value?.longitude != null) {
        placeMarker(value.latitude ?? value.lat, value.longitude ?? value.lng);
      }

      map.on('click', (e) => {
        const { lat: clickLat, lng: clickLng } = e.latlng;
        placeMarker(clickLat, clickLng);
        onChange?.({ latitude: clickLat, longitude: clickLng });
      });

      setReady(true);
      // The drawer this sits in slides open with a CSS transition, so the
      // container can measure 0x0 at the exact moment Leaflet initializes.
      setTimeout(() => map.invalidateSize(), 100);
    } catch (err) {
      setError('Could not load map');
      console.error(err);
    }

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !markerRef.current || !value) return;
    const lat = value.latitude ?? value.lat;
    const lng = value.longitude ?? value.lng;
    if (lat == null || lng == null) return;
    markerRef.current.setLatLng([lat, lng]);
  }, [value?.latitude, value?.longitude, value?.lat, value?.lng, ready]);

  const lat = value?.latitude ?? value?.lat;
  const lng = value?.longitude ?? value?.lng;

  return (
    <div className="shop-location-picker">
      <div className="shop-location-picker-head">
        <span className="shop-location-picker-title">Shop pickup location</span>
        <span className="shop-location-picker-hint">
          Tap the map to place the store{shopName ? ` — ${shopName}` : ''}. Drag to fine-tune.
        </span>
      </div>
      <div ref={mapRef} className="shop-location-map" role="application" aria-label="Shop location map" />
      {error ? <p className="shop-location-error">{error}</p> : null}
      <div className="shop-location-coords">
        <label>
          Latitude
          <input
            type="number"
            step="any"
            className="form-input"
            value={lat ?? ''}
            placeholder="29.451998"
            onChange={(e) => {
              const nextLat = e.target.value === '' ? null : Number(e.target.value);
              if (nextLat == null || lng == null) {
                onChange?.(nextLat != null && lng != null ? { latitude: nextLat, longitude: lng } : null);
              } else {
                onChange?.({ latitude: nextLat, longitude: lng });
              }
            }}
          />
        </label>
        <label>
          Longitude
          <input
            type="number"
            step="any"
            className="form-input"
            value={lng ?? ''}
            placeholder="75.668669"
            onChange={(e) => {
              const nextLng = e.target.value === '' ? null : Number(e.target.value);
              if (lat == null || nextLng == null) {
                onChange?.(lat != null && nextLng != null ? { latitude: lat, longitude: nextLng } : null);
              } else {
                onChange?.({ latitude: lat, longitude: nextLng });
              }
            }}
          />
        </label>
        <button
          type="button"
          className="btn-secondary shop-location-clear"
          onClick={() => onChange?.(null)}
        >
          Clear location
        </button>
      </div>
    </div>
  );
}