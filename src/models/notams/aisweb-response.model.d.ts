export type LatLon = [number, number];
export interface AiswebItemModel {
    id: string;
    n?: string;
    number?: string;
    cod?: string;
    status?: string;
    cat?: string;
    dist?: string;
    tp?: string;
    dt?: string;
    loc?: string;
    fir?: string;
    b?: string;
    c?: string;
    d?: string;
    e?: string;
    f?: string;
    g?: string;
    lower?: string;
    upper?: string;
    geo?: string;
    geo_url?: string;
    traffic?: string;
    purpose?: string;
    scope?: string;
}
export interface AiswebNotamEnvelopeModel {
    item?: AiswebItemModel | AiswebItemModel[];
}
export interface AiswebRootModel {
    notam?: AiswebNotamEnvelopeModel;
}
export interface AiswebResponseModel {
    aisweb?: AiswebRootModel;
}
export interface AreaNotamApiModel {
    nome: string;
    numero_notam: string;
    fir_match: string;
    area_type: string;
    valid_from: string;
    valid_to: string;
    q_line: string;
    coords_latlon: LatLon[];
    texto_notam: string;
    source_id?: string;
    geometry_type?: 'POLYGON' | 'CIRCLE';
    center?: LatLon | null;
    radius_m?: number | null;
}
export interface AeroportoModel {
    icao: string;
    latitude: number;
    longitude: number;
}
export interface WaypointModel {
    ident: string;
    latitude: number;
    longitude: number;
}
export interface RotaRplModel {
    ident: string;
    tipo_anv: string;
    nivel_voo: string;
    origem: string;
    destino: string;
    eobt: string;
    eet: string;
    eta: string;
    rota_texto: string;
    linha_original: string;
    coords_latlon: LatLon[];
}
export interface AeroviaLinhaModel {
    nome: string;
    coords_latlon: LatLon[];
}
export interface AeroviasResponseModel {
    alta: AeroviaLinhaModel[];
    baixa: AeroviaLinhaModel[];
}
export interface GeoJsonGeometryModel {
    type: 'LineString' | 'MultiLineString' | string;
    coordinates: any;
}
export interface GeoJsonFeatureModel {
    type: 'Feature' | string;
    geometry?: GeoJsonGeometryModel | null;
    properties?: Record<string, any>;
}
export interface GeoJsonResponseModel {
    type?: string;
    features?: GeoJsonFeatureModel[];
}
export interface AeroviaUruguayCsvRowModel {
    route: string;
    section: string;
    seq: number;
    waypoint_name: string;
    detail: string;
    coord_dms: string;
    latitude: number;
    longitude: number;
    page: number;
    effective_date: string;
    source_file: string;
}
export interface AeroviaUruguayWaypointModel {
    seq: number;
    nome: string;
    detail: string;
    coord_dms: string;
    latitude: number;
    longitude: number;
    page: number;
    effective_date: string;
    source_file: string;
}
export interface AeroviaUruguayModel {
    nome: string;
    section: string;
    coords_latlon: LatLon[];
    waypoints: AeroviaUruguayWaypointModel[];
}
