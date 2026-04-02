import type { AiswebItemModel, LatLon } from '../models/notams/aisweb-response.model';
export type GeometryParserType = 'geojson' | 'wkt' | 'geo-dms' | 'textE-dms' | 'none' | 'ignored-qcode';
export declare class NotamGeometryService {
    private readonly ignoredQCodes;
    private isFiniteCoord;
    private pushUniqueCoord;
    private closeRingIfNeeded;
    private normalizeCoords;
    private toLatLonFromLonLat;
    private parseGeoJsonLike;
    private parseWktRing;
    private parseWkt;
    private dmsToDecimal;
    private parseCompactDmsToken;
    private parseDmsSequence;
    isIgnoredQCode(item: AiswebItemModel): boolean;
    isPolygonParser(parser: GeometryParserType): boolean;
    extractCoordsFromItem(item: AiswebItemModel): {
        coords: LatLon[];
        parser: GeometryParserType;
    };
    inferAreaType(item: AiswebItemModel): string;
}
