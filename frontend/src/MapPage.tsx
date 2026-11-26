import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { type LatLngBoundsExpression } from 'leaflet';
import { CircleMarker, GeoJSON, LayerGroup, LayersControl, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { FeatureCollection } from 'geojson';
import { type Data, type Page } from './api';
import { IncidentFilters, type Filter, type Incident } from './Incidents';
import { Failure, label, localDate, PageTitle, Pagination, queryString, Spinner, useLoad } from './ui';

const colors: Record<string, string> = { baja: '#aab9ca', media: '#facc15', alta: '#f97316', critica: '#e53948' };
const boundaries = [
  { file: 'departamento', name: 'Departamento', color: '#8dd5ed', weight: 3 },
  { file: 'provincias', name: 'Provincias', color: '#c39035', weight: 2 },
  { file: 'municipios', name: 'Municipios', color: '#5e869a', weight: 1 },
];
function Fit({ points }: { points: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (Array.isArray(points) && points.length) map.fitBounds(points, { padding: [36, 36], maxZoom: 13 });
  }, [map, points]);
  return null;
}
export default function MapPage() {
  const address = new URLSearchParams(window.location.search);
  const [filter, setFilter] = useState<Filter>({ q: address.get('q') || '' });
  const [page, setPage] = useState(1);
  const result = useLoad<Page<Incident>>('/emergencias' + queryString({ ...filter, page, limit: 100 }));
  const refuges = useLoad<Page>('/refugios?limit=100');
  const communities = useLoad<Data[]>('/comunidades' + queryString({ municipio_id: filter.municipio_id }));
  const contacts = useLoad<Page>('/contactos?limit=100');
  const [layers, setLayers] = useState<FeatureCollection[]>([]);
  const [layerError, setLayerError] = useState('');
  const [tiles, setTiles] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(boundaries.map(async entry => {
      const result = await fetch('/maps/' + entry.file + '.geojson', { signal: controller.signal });
      if (!result.ok) throw new Error('No se pudieron cargar los límites territoriales.');
      return result.json() as Promise<FeatureCollection>;
    })).then(setLayers).catch(error => {
      if (!controller.signal.aborted) setLayerError(String(error.message));
    });
    return () => controller.abort();
  }, []);
  const points = useMemo(() => (result.data?.data ?? []).filter(item => item.latitud !== null && item.longitud !== null), [result.data]);
  const locations = useMemo(() => points.map(item => [item.latitud!, item.longitud!] as [number, number]), [points]);
  return <>
    <PageTitle title="Mapa de incidentes" description="Consulta emergencias, refugios y límites de referencia de Cochabamba." />
    <section className="panel">
      <IncidentFilters filter={filter} change={change => { setFilter(change); setPage(1); }} />
      {(result.error || layerError || refuges.error || communities.error || contacts.error) && <Failure message={result.error || layerError || refuges.error || communities.error || contacts.error} />}
      {result.pending && <Spinner />}
      <div className="map-wrap">
        <MapContainer center={[-17.41, -66.16]} zoom={9} scrollWheelZoom={false} className="map" aria-label="Mapa interactivo de Cochabamba">
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Límites · mapa local">
              <LayerGroup />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Mapa base de OpenStreetMap">
              <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTiles(true), tileload: () => setTiles(false) }} />
            </LayersControl.BaseLayer>
            {boundaries.map((boundary, index) => layers[index] && <LayersControl.Overlay key={boundary.file} name={boundary.name} checked={index < 2}>
              <GeoJSON data={layers[index]} style={{ color: boundary.color, weight: boundary.weight, fillOpacity: 0.07 }}
                onEachFeature={(feature, layer) => {
                  const name = document.createElement('span');
                  name.textContent = String(feature.properties?.shapeName ?? boundary.name);
                  layer.bindTooltip(name);
                }} />
            </LayersControl.Overlay>)}
            <LayersControl.Overlay checked name="Incidentes">
              <LayerGroup>
                {points.map(item => <CircleMarker key={item.id} center={[item.latitud!, item.longitud!]} radius={8}
                  pathOptions={{ color: colors[item.prioridad], fillOpacity: item.verificacion === 'verificada' ? 0.85 : 0.3, weight: 3 }}>
                  <Popup><strong>{item.titulo}</strong><p>{item.municipio} · {label(item.prioridad)} · {label(item.verificacion)}</p><p>{localDate(item.fecha)}</p><Link to={'/emergencias/' + item.id}>Abrir ficha</Link></Popup>
                </CircleMarker>)}
              </LayerGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Refugios">
              <LayerGroup>
                {refuges.data?.data.map(item => <CircleMarker key={item.id} center={[Number(item.latitud), Number(item.longitud)]} radius={7}
                  pathOptions={{ color: '#42cca3', fillOpacity: 0.8 }}><Popup><strong>{String(item.nombre)}</strong><p>{String(item.direccion)}</p><Link to="/refugios">Ver refugios</Link></Popup></CircleMarker>)}
              </LayerGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Comunidades">
              <LayerGroup>{communities.data?.filter(item => item.latitud != null && item.longitud != null).map(item =>
                <CircleMarker key={item.id} center={[Number(item.latitud), Number(item.longitud)]} radius={5} pathOptions={{color:'#dce8fa',fillOpacity:0.85}}>
                  <Popup><strong>{String(item.nombre)}</strong><p>Comunidad registrada</p></Popup>
                </CircleMarker>)}</LayerGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay name="Servicios verificados">
              <LayerGroup>{contacts.data?.data.filter(item => item.verificado && item.latitud != null && item.longitud != null).map(item =>
                <CircleMarker key={item.id} center={[Number(item.latitud), Number(item.longitud)]} radius={6} pathOptions={{color:'#abd6fb',fillOpacity:0.85}}>
                  <Popup><strong>{String(item.nombre)}</strong><p>{String(item.cobertura)}</p><Link to="/contactos">Abrir directorio</Link></Popup>
                </CircleMarker>)}</LayerGroup>
            </LayersControl.Overlay>
          </LayersControl>
          <Fit points={locations} />
        </MapContainer>
      </div>
      {tiles && <p className="map-note">El mapa base requiere conexión a OpenStreetMap.</p>}
      <div className="map-legend">{Object.entries(colors).map(([key, color]) => <span key={key}><i style={{ background: color }} />{label(key)}</span>)}<span>Círculo hueco · verificación pendiente o descartada</span></div>
      <p className="map-note">Marcadores con coordenadas en esta página · {points.length}. Límites de referencia de 2015, publicados por geoBoundaries a partir de GeoBolivia. <Link to="/contactos">Ver directorio de servicios</Link></p>
      {contacts.data?.data.length === 0 && <p className="map-note">El directorio todavía no tiene servicios visibles para esta cuenta.</p>}
      {result.data && <Pagination page={result.data} change={setPage} />}
    </section>
  </>;
}
