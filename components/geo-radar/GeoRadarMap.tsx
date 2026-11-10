"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { GeoRadarClinic, GeoRadarRegion } from "./types";
import styles from "./GeoRadarWorkspace.module.css";

type Props = { region: GeoRadarRegion; clinics?: GeoRadarClinic[]; clientName?: string; compact?: boolean };
const EMPTY_CLINICS: GeoRadarClinic[] = [];

export function GeoRadarMap({ region, clinics = EMPTY_CLINICS, clientName, compact }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState("");
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  const { center_lat: centerLat, center_lng: centerLng, region_type: regionType, radius_m: radiusM, boundary_geojson_path: boundaryPath } = region;

  useEffect(() => {
    if (!sdkReady || !containerRef.current || !window.kakao?.maps || centerLat == null || centerLng == null) return;
    let active = true;
    setError("");
    window.kakao.maps.load(async () => {
      if (!active || !containerRef.current || !window.kakao?.maps) return;
      const maps = window.kakao.maps;
      const center = new maps.LatLng(centerLat, centerLng);
      const map = new maps.Map(containerRef.current, { center, level: regionType === "city" ? 9 : regionType === "districts" ? 7 : 4 });
      if (regionType === "radius" || regionType === "custom") {
        new maps.Circle({ map, center, radius: radiusM || 1000, strokeWeight: 2, strokeColor: "#155855", strokeOpacity: 0.8, fillColor: "#D5E3D4", fillOpacity: 0.25 });
      }
      const markers = clinics.filter((clinic) => clinic.latitude != null && clinic.longitude != null).map((clinic) => {
        const position = new maps.LatLng(clinic.latitude!, clinic.longitude!);
        const isClient = clinic.is_client || clinic.canonical_name === clientName;
        const size = Math.round(14 + Math.max(0, Math.min(1, clinic.mention_rate || 0)) * 16);
        const marker = new maps.Marker({
          map: regionType === "city" ? undefined : map,
          position,
          image: createMarkerImage(maps, size, isClient ? "#E85D2C" : "#155855"),
        });
        const website = safeHttpUrl(clinic.website);
        const info = new maps.InfoWindow({ content: `<div style="padding:9px 11px;min-width:190px;font:12px sans-serif;color:#293E34"><strong>${escapeHtml(clinic.canonical_name)}</strong><br>${escapeHtml(clinic.address || "")}${website ? `<br><a href="${escapeHtml(website)}" target="_blank" rel="noreferrer" style="color:#155855">홈페이지 보기</a>` : ""}${clinic.mention_rate != null ? `<br>언급률 ${Math.round(clinic.mention_rate * 100)}% · ${clinic.rank || "—"}위` : ""}</div>` });
        maps.event.addListener(marker, "click", () => info.open(map, marker));
        return marker;
      });
      if (regionType === "city" && maps.MarkerClusterer) {
        new maps.MarkerClusterer({ map, averageCenter: true, minLevel: 7, markers });
      }
      const client = clinics.find((clinic) => clinic.is_client || clinic.canonical_name === clientName);
      if (!client || client.latitude == null || client.longitude == null) {
        new maps.CustomOverlay({ map, position: center, content: `<span style="display:block;width:17px;height:17px;border:3px solid white;border-radius:50%;background:#E85D2C;box-shadow:0 1px 5px rgba(0,0,0,.28)"></span>`, yAnchor: 0.5 });
      }
      if (boundaryPath && regionType !== "radius") {
        try {
          const data = await fetch(boundaryPath).then((res) => res.json()) as GeoJsonFeatureCollection;
          data.features.forEach((feature) => drawFeature(maps, map, feature));
        } catch { setError("행정구역 경계를 불러오지 못했습니다."); }
      }
    });
    return () => { active = false; };
  }, [sdkReady, centerLat, centerLng, regionType, radiusM, boundaryPath, clinics, clientName]);

  if (!key) return <MapFallback clinics={clinics} message="카카오맵 JavaScript 키를 설정하면 지도와 반경·경계가 표시됩니다." compact={compact} />;
  if (region.center_lat == null || region.center_lng == null) return <MapFallback clinics={clinics} message="직접 지정 범위의 중심 좌표를 입력해 주세요." compact={compact} />;
  return (
    <div className={styles.mapWrap} data-compact={compact || undefined}>
      <Script src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=clusterer`} strategy="lazyOnload" onLoad={() => setSdkReady(true)} onError={() => setError("카카오맵을 불러오지 못했습니다. 등록 도메인과 키를 확인해 주세요.")} />
      <div ref={containerRef} className={styles.mapCanvas} aria-label={`${region.name} 지도`} />
      {!sdkReady && !error ? <div className={styles.mapLoading}>지도를 불러오는 중...</div> : null}
      {error ? <div className={styles.mapError}>{error}</div> : null}
    </div>
  );
}

function MapFallback({ clinics, message, compact }: { clinics: GeoRadarClinic[]; message: string; compact?: boolean }) {
  return <div className={styles.mapFallback} data-compact={compact || undefined}>
    <MapPin size={24} /><strong>지도 준비 필요</strong><span>{message}</span>
    {clinics.length ? <small>목록으로 {clinics.length}곳을 계속 확인할 수 있습니다.</small> : null}
  </div>;
}

type GeoJsonFeatureCollection = { features: GeoJsonFeature[] };
type GeoJsonFeature = { geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } };
type KakaoMaps = NonNullable<Window["kakao"]>["maps"];

function drawFeature(maps: KakaoMaps, map: InstanceType<KakaoMaps["Map"]>, feature: GeoJsonFeature) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][];
  polygons.forEach((polygon) => {
    const path = polygon[0].map(([lng, lat]) => new maps.LatLng(lat, lng));
    new maps.Polygon({ map, path, strokeWeight: 2, strokeColor: "#155855", strokeOpacity: 0.7, fillColor: "#D5E3D4", fillOpacity: 0.18 });
  });
}

function createMarkerImage(maps: KakaoMaps, size: number, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${Math.max(3, size / 2 - 2)}" fill="${color}" stroke="white" stroke-width="3"/></svg>`;
  return new maps.MarkerImage(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new maps.Size(size, size));
}

function safeHttpUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch { return ""; }
}

function escapeHtml(value: string) { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char); }

declare global {
  interface Window {
    kakao?: {
      maps: {
        load(callback: () => void): void;
        LatLng: new (lat: number, lng: number) => object;
        Map: new (container: HTMLElement, options: Record<string, unknown>) => { setCenter(position: object): void };
        Marker: new (options: Record<string, unknown>) => object;
        MarkerImage: new (src: string, size: object) => object;
        Size: new (width: number, height: number) => object;
        InfoWindow: new (options: Record<string, unknown>) => { open(map: object, marker: object): void };
        Circle: new (options: Record<string, unknown>) => object;
        Polygon: new (options: Record<string, unknown>) => object;
        CustomOverlay: new (options: Record<string, unknown>) => object;
        MarkerClusterer?: new (options: Record<string, unknown>) => object;
        event: { addListener(target: object, event: string, callback: () => void): void };
      };
    };
  }
}
