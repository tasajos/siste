import { useEffect, useState } from 'react';
import { icon, type LatLngTuple, type Marker as LeafletMarker } from 'leaflet';
import { GeoJSON, MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { FeatureCollection } from 'geojson';
import { OpenStreetMapTiles } from './OpenStreetMapTiles';

const cochabamba: LatLngTuple = [-17.41, -66.16];
const pin = icon({
  iconUrl: markerIcon, iconRetinaUrl: markerIconRetina, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41],
});

function MapSelection({ focus, onSelect }: { focus: LatLngTuple | null; onSelect: (latitude: number, longitude: number) => void }) {
  const map = useMap();
  useMapEvents({
    click: ({ latlng }) => {
      const position = latlng.wrap();
      onSelect(position.lat, position.lng);
    },
  });
  useEffect(() => {
    if (focus) map.setView(focus, Math.max(13, map.getZoom()));
  }, [focus, map]);
  return null;
}

export default function LocationMap({ position, focus, onSelect }: {
  position: LatLngTuple | null;
  focus: LatLngTuple | null;
  onSelect: (latitude: number, longitude: number) => void;
}) {
  const [boundaries, setBoundaries] = useState<FeatureCollection>();
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/maps/municipios.geojson', { signal: controller.signal })
      .then(response => response.ok ? response.json() : undefined)
      .then(data => { if (data && !controller.signal.aborted) setBoundaries(data); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return <>
    <div className="map-wrap" role="region" aria-label="Mapa para elegir la ubicación del incidente">
      <MapContainer center={position ?? cochabamba} zoom={position ? 14 : 11} scrollWheelZoom={false} className="map location-map">
        {!tilesUnavailable && <OpenStreetMapTiles eventHandlers={{ tileerror: () => setTilesUnavailable(true) }} />}
        {boundaries && <GeoJSON
          data={boundaries} interactive={false}
          attribution='<a href="/maps/FUENTES.md">GeoBolivia / geoBoundaries</a>'
          style={{ color: '#547fa0', weight: 1.5, fillOpacity: 0.04 }}
        />}
        <MapSelection focus={focus} onSelect={onSelect} />
        {position && <Marker
          position={position} icon={pin} alt="Punto del incidente" draggable autoPan
          eventHandlers={{ dragend: event => {
            const location = (event.target as LeafletMarker).getLatLng().wrap();
            onSelect(location.lat, location.lng);
          } }}
        />}
      </MapContainer>
    </div>
    {tilesUnavailable && <p className="map-note">Mostrando los límites locales. Puedes seguir seleccionando coordenadas.</p>}
  </>;
}
