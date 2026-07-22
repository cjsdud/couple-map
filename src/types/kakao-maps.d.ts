// Kakao Maps JS SDK — 사용하는 범위만 최소 타입 선언
declare namespace kakao.maps {
  function load(callback: () => void): void;

  class LatLng {
    constructor(lat: number, lng: number);
  }
  class LatLngBounds {
    constructor();
    extend(latlng: LatLng): void;
  }
  interface MapOptions {
    center: LatLng;
    level: number;
  }
  class Map {
    constructor(container: HTMLElement, options: MapOptions);
    setLevel(level: number): void;
    getLevel(): number;
    setBounds(bounds: LatLngBounds): void;
    relayout(): void;
    addControl(control: ZoomControl, position: unknown): void;
  }
  interface PolygonOptions {
    map?: Map;
    path: LatLng[] | LatLng[][];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    fillColor?: string;
    fillOpacity?: number;
  }
  class Polygon {
    constructor(options: PolygonOptions);
    setMap(map: Map | null): void;
  }
  interface PolylineOptions {
    map?: Map;
    path: LatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
  }
  class Polyline {
    constructor(options: PolylineOptions);
    setMap(map: Map | null): void;
  }
  interface CustomOverlayOptions {
    map?: Map;
    position: LatLng;
    content: HTMLElement | string;
    yAnchor?: number;
    zIndex?: number;
  }
  class CustomOverlay {
    constructor(options: CustomOverlayOptions);
    setMap(map: Map | null): void;
  }
  class ZoomControl {
    constructor();
  }
  const ControlPosition: { RIGHT: unknown };
}

interface Window {
  kakao: { maps: typeof kakao.maps };
}
