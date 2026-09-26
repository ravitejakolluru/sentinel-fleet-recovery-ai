import { useEffect, useRef, useState } from 'react'
import { Loader } from '@googlemaps/js-api-loader'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
const center = { lat: Number(import.meta.env.VITE_OPERATIONS_LAT || 37.7749), lng: Number(import.meta.env.VITE_OPERATIONS_LNG || -122.4194) }
export const googleMapsConfigured = Boolean(apiKey)
const POIS = [
  { id: 'DEPOT', label: 'DEPOT', x: 12, y: 18, icon: '🏠' },
  { id: 'WAREHOUSE-A', label: 'WAREHOUSE A', x: 28, y: 20, icon: '▣' },
  { id: 'WAREHOUSE-B', label: 'WAREHOUSE B', x: 72, y: 38, icon: '▣' },
  { id: 'PICKUP-01', label: 'PICKUP 01', x: 36, y: 30, icon: '●' },
  { id: 'PICKUP-02', label: 'PICKUP 02', x: 58, y: 62, icon: '●' },
  { id: 'DROP-01', label: 'DROP POINT 01', x: 72, y: 38, icon: '◆' },
  { id: 'DROP-02', label: 'DROP POINT 02', x: 84, y: 78, icon: '◆' },
  { id: 'CHARGING-01', label: 'CHARGING STATION A', x: 16, y: 82, icon: '⚡' },
  { id: 'CHARGING-02', label: 'CHARGING STATION B', x: 88, y: 50, icon: '⚡' },
]

function toLatLng(point) {
  return { lat: center.lat + (Number(point?.y || 50) - 50) * 0.0008, lng: center.lng + (Number(point?.x || 50) - 50) * 0.001 }
}

export default function GoogleFleetMap({ robots, selectedRobot, onSelect, followId, onStreetView, onMessage }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const polylinesRef = useRef(new Map())
  const [ready, setReady] = useState(false)
  const [providerUnavailable, setProviderUnavailable] = useState(!apiKey)
  useEffect(() => {
    if (!apiKey || !containerRef.current) return undefined
    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['geometry'] })
    let mounted = true
    loader.load().then((google) => {
      if (!mounted || !containerRef.current) return
      mapRef.current = new google.maps.Map(containerRef.current, { center, zoom: 15, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, styles: [{ featureType: 'poi', stylers: [{ visibility: 'on' }] }] })
      POIS.forEach((poi) => new google.maps.Marker({ map: mapRef.current, position: toLatLng(poi), label: { text: `${poi.icon} ${poi.label}`, color: '#17324d', fontSize: '10px', fontWeight: '700' }, title: poi.label }))
      setReady(true)
    }).catch(() => {
      setProviderUnavailable(true)
      onMessage?.('Google Maps unavailable. Simulation fallback map is active.')
    })
    return () => { mounted = false; mapRef.current = null }
  }, [onMessage])
  useEffect(() => {
    if (!ready || !mapRef.current || !window.google?.maps) return
    const google = window.google
    const activeIds = new Set()
    robots.forEach((robot) => {
      activeIds.add(robot.id)
      const position = toLatLng(robot.position)
      const color = robot.id === selectedRobot?.id ? '#2563eb' : robot.status === 'critical' || robot.status === 'failed' ? '#dc2626' : robot.status === 'warning' ? '#f59e0b' : robot.status === 'recovering' ? '#7c3aed' : '#16a34a'
      let marker = markersRef.current.get(robot.id)
      if (!marker) {
        marker = new google.maps.Marker({ map: mapRef.current, label: { text: robot.id, color: '#172033', fontSize: '10px', fontWeight: '700' }, title: robot.id })
        marker.addListener('click', () => onSelect(robot))
        markersRef.current.set(robot.id, marker)
      }
      marker.setPosition(position)
      marker.setIcon({ path: google.maps.SymbolPath.CIRCLE, scale: robot.id === selectedRobot?.id ? 9 : 6, fillColor: color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 })

      const route = (robot.waypoints || []).map(toLatLng)
      let line = polylinesRef.current.get(robot.id)
      if (!line) { line = new google.maps.Polyline({ map: mapRef.current, geodesic: true }); polylinesRef.current.set(robot.id, line) }
      const showRoute = hasActiveRoute(robot)
      line.setMap(showRoute ? mapRef.current : null)
      if (showRoute) {
        line.setPath(route)
        line.setOptions({ strokeColor: color, strokeOpacity: robot.id === selectedRobot?.id ? 1 : 0.45, strokeWeight: robot.id === selectedRobot?.id ? 5 : 2 })
      }
    })
    markersRef.current.forEach((marker, id) => { if (!activeIds.has(id)) { marker.setMap(null); markersRef.current.delete(id) } })
    polylinesRef.current.forEach((line, id) => { if (!activeIds.has(id)) { line.setMap(null); polylinesRef.current.delete(id) } })
    if (followId) { const followed = robots.find((robot) => robot.id === followId); if (followed) mapRef.current.panTo(toLatLng(followed.position)) }
  }, [robots, selectedRobot, followId, ready, onSelect])
  if (providerUnavailable) return <FallbackFleetMap robots={robots} selectedRobot={selectedRobot} onSelect={onSelect} followId={followId} onStreetView={onStreetView} />
  return <div className="google-map-shell"><div ref={containerRef} className="google-fleet-map" /><div className="google-map-toolbar"><button onClick={() => onStreetView?.(selectedRobot)}>Street View</button><span>SIMULATED ROBOT OPERATIONS</span></div></div>
}

function statusColor(robot, selected) {
  if (selected) return '#2563eb'
  if (robot.status === 'critical' || robot.status === 'failed') return '#dc2626'
  if (robot.status === 'warning') return '#d97706'
  if (robot.status === 'recovering') return '#7c3aed'
  if (robot.status === 'reserve') return '#0891b2'
  return '#16a34a'
}

function hasActiveRoute(robot) {
  const assignedTask = Boolean(robot.task_id || robot.current_task || robot.mission_id)
  const assignedTasks = Array.isArray(robot.assigned_tasks) ? robot.assigned_tasks.length > 0 : false
  const hasWaypoints = Array.isArray(robot.waypoints) && robot.waypoints.length > 1
  return hasWaypoints && (assignedTask || assignedTasks || robot.status === 'recovering' || robot.status === 'critical' || robot.status === 'failed')
}

function FallbackFleetMap({ robots, selectedRobot, onSelect, followId, onStreetView }) {
  const followedRobot = robots.find((robot) => robot.id === followId)
  const followX = followedRobot?.position?.x || 50
  const followY = followedRobot?.position?.y || 50
  const viewportTransform = followedRobot ? `translate(${Math.max(-38, Math.min(38, 50 - followX))}%, ${Math.max(-38, Math.min(38, 50 - followY))}%) scale(1.04)` : 'translate(0, 0) scale(1)'
  return <div className="fallback-map-shell">
    <div className="fallback-map-toolbar"><span><i className="map-status-dot" /> SIMULATION MAP</span><small>{followId ? `FOLLOWING ${followId}` : 'Google Maps unavailable · fallback active'}</small></div>
    <div className="fallback-map-canvas">
      <div className="fallback-map-viewport" style={{ transform: viewportTransform }}>
        <div className="fallback-map-road road-one" /><div className="fallback-map-road road-two" /><div className="fallback-map-road road-three" />
        {POIS.map((poi) => <div key={poi.id} className={`fallback-poi poi-${poi.id.toLowerCase()}`} style={{ left: `${poi.x}%`, top: `${poi.y}%` }}><strong>{poi.icon}</strong><small>{poi.label}</small></div>)}
      {robots.map((robot) => {
        const route = robot.waypoints || []
        const points = route.map((point) => `${point.x},${point.y}`).join(' ')
        const color = statusColor(robot, robot.id === selectedRobot?.id)
        const showRoute = hasActiveRoute(robot)
        return <div key={robot.id} className={`fallback-robot-layer ${robot.id === followId ? 'is-followed' : ''}`}>
          {showRoute && route.length > 1 && <svg className="fallback-route-layer" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} fill="none" stroke={color} strokeWidth={robot.id === selectedRobot?.id ? 0.8 : 0.35} strokeDasharray={robot.status === 'critical' || robot.status === 'failed' ? '2 1' : 'none'} /></svg>}
          {showRoute && route[0] && <span className="fallback-route-point route-start" style={{ left: `${route[0].x}%`, top: `${route[0].y}%` }} title={`${robot.id} start`} />}
          {showRoute && route.at(-1) && <span className="fallback-route-point route-destination" style={{ left: `${route.at(-1).x}%`, top: `${route.at(-1).y}%` }} title={`${robot.id} destination`}>◆</span>}
          <button className="fallback-robot" style={{ left: `${robot.position?.x || 50}%`, top: `${robot.position?.y || 50}%`, '--robot-color': color }} onClick={() => onSelect(robot)} aria-label={`Select ${robot.id}`}>
            <span className="fallback-robot-dot" /><strong>{robot.id}</strong><small>{Math.round(robot.battery || 0)}% · {String(robot.status || 'healthy').toUpperCase()}</small>
          </button>
        </div>
      })}
      {selectedRobot && <div className="fallback-map-callout" style={{ left: `${Math.min(72, Math.max(8, (selectedRobot.position?.x || 50) + 4))}%`, top: `${Math.min(72, Math.max(8, (selectedRobot.position?.y || 50) - 16))}%` }}><strong>{selectedRobot.id}</strong><span>{String(selectedRobot.status || 'healthy').toUpperCase()} · {Math.round(selectedRobot.battery || 0)}%</span></div>}
      </div>
    </div>
    <div className="fallback-map-footer"><span><i className="map-legend-dot active" /> 10 robots tracked</span><span>● START</span><span>◆ DESTINATION</span><button onClick={() => onStreetView?.(selectedRobot)}>Street View</button></div>
  </div>
}
