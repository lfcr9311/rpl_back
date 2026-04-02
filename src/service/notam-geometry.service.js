"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotamGeometryService = void 0;
const common_1 = require("@nestjs/common");
let NotamGeometryService = class NotamGeometryService {
    ignoredQCodes = new Set(['QAFTT']);
    isFiniteCoord(coord) {
        return (Array.isArray(coord) &&
            coord.length === 2 &&
            Number.isFinite(coord[0]) &&
            Number.isFinite(coord[1]) &&
            Math.abs(coord[0]) <= 90 &&
            Math.abs(coord[1]) <= 180);
    }
    pushUniqueCoord(coords, coord) {
        if (!this.isFiniteCoord(coord))
            return;
        const last = coords[coords.length - 1];
        if (last && last[0] === coord[0] && last[1] === coord[1]) {
            return;
        }
        coords.push(coord);
    }
    closeRingIfNeeded(coords) {
        if (coords.length < 3)
            return coords;
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            return [...coords, first];
        }
        return coords;
    }
    normalizeCoords(coords) {
        const normalized = [];
        for (const coord of coords) {
            this.pushUniqueCoord(normalized, coord);
        }
        return this.closeRingIfNeeded(normalized);
    }
    toLatLonFromLonLat(point) {
        if (!Array.isArray(point) || point.length < 2)
            return null;
        const lon = Number(point[0]);
        const lat = Number(point[1]);
        const coord = [lat, lon];
        return this.isFiniteCoord(coord) ? coord : null;
    }
    parseGeoJsonLike(raw) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed?.type === 'Polygon' && Array.isArray(parsed.coordinates?.[0])) {
                return this.normalizeCoords(parsed.coordinates[0]
                    .map((point) => this.toLatLonFromLonLat(point))
                    .filter(Boolean));
            }
            if (parsed?.type === 'MultiPolygon' && Array.isArray(parsed.coordinates?.[0]?.[0])) {
                return this.normalizeCoords(parsed.coordinates[0][0]
                    .map((point) => this.toLatLonFromLonLat(point))
                    .filter(Boolean));
            }
            if (Array.isArray(parsed?.coordinates?.[0])) {
                return this.normalizeCoords(parsed.coordinates[0]
                    .map((point) => this.toLatLonFromLonLat(point))
                    .filter(Boolean));
            }
            return [];
        }
        catch {
            return [];
        }
    }
    parseWktRing(text) {
        const coords = [];
        for (const part of text.split(',')) {
            const pieces = part.trim().split(/\s+/);
            if (pieces.length < 2)
                continue;
            const lon = Number(pieces[0]);
            const lat = Number(pieces[1]);
            this.pushUniqueCoord(coords, [lat, lon]);
        }
        return this.closeRingIfNeeded(coords);
    }
    parseWkt(raw) {
        const text = raw.trim();
        const polygon = text.match(/^POLYGON\s*\(\((.+)\)\)$/i);
        if (polygon) {
            return this.parseWktRing(polygon[1]);
        }
        const multiPolygon = text.match(/^MULTIPOLYGON\s*\(\(\((.+?)\)\)\)/i);
        if (multiPolygon) {
            return this.parseWktRing(multiPolygon[1]);
        }
        return [];
    }
    dmsToDecimal(deg, min, sec, hemi) {
        let value = deg + min / 60 + sec / 3600;
        if (hemi === 'S' || hemi === 'W') {
            value *= -1;
        }
        return value;
    }
    parseCompactDmsToken(token) {
        const cleaned = token.trim().toUpperCase().replace(/\//g, '');
        const match = cleaned.match(/^(\d{2})(\d{2})(\d{2}(?:\.\d+)?)([NS])(\d{3})(\d{2})(\d{2}(?:\.\d+)?)([EW])$/);
        if (!match)
            return null;
        const lat = this.dmsToDecimal(Number(match[1]), Number(match[2]), Number(match[3]), match[4]);
        const lon = this.dmsToDecimal(Number(match[5]), Number(match[6]), Number(match[7]), match[8]);
        const coord = [lat, lon];
        return this.isFiniteCoord(coord) ? coord : null;
    }
    parseDmsSequence(raw) {
        const normalized = raw
            .replace(/,/g, ' ')
            .replace(/;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const matches = normalized.match(/\d{6}(?:\.\d+)?[NS]\/?\d{7}(?:\.\d+)?[EW]/gi) ?? [];
        const coords = [];
        for (const token of matches) {
            const coord = this.parseCompactDmsToken(token);
            if (coord) {
                this.pushUniqueCoord(coords, coord);
            }
        }
        return this.closeRingIfNeeded(coords);
    }
    isIgnoredQCode(item) {
        const q = String(item.cod ?? '').trim().toUpperCase();
        return this.ignoredQCodes.has(q);
    }
    isPolygonParser(parser) {
        return (parser === 'geojson' ||
            parser === 'wkt' ||
            parser === 'geo-dms' ||
            parser === 'textE-dms');
    }
    extractCoordsFromItem(item) {
        if (this.isIgnoredQCode(item)) {
            return { coords: [], parser: 'ignored-qcode' };
        }
        const geo = String(item.geo ?? '').trim();
        const textE = String(item.e ?? '').trim();
        if (geo) {
            const geoJson = this.parseGeoJsonLike(geo);
            if (geoJson.length >= 4) {
                return { coords: geoJson, parser: 'geojson' };
            }
            const wkt = this.parseWkt(geo);
            if (wkt.length >= 4) {
                return { coords: wkt, parser: 'wkt' };
            }
            const dmsFromGeo = this.parseDmsSequence(geo);
            if (dmsFromGeo.length >= 4) {
                return { coords: dmsFromGeo, parser: 'geo-dms' };
            }
        }
        if (textE) {
            const dmsFromText = this.parseDmsSequence(textE);
            if (dmsFromText.length >= 4) {
                return { coords: dmsFromText, parser: 'textE-dms' };
            }
        }
        return { coords: [], parser: 'none' };
    }
    inferAreaType(item) {
        const q = String(item.cod ?? '').toUpperCase();
        const e = String(item.e ?? '').toUpperCase();
        if (q.includes('QRR') || e.includes('RESTRICTED') || e.includes('AREA RESTRITA')) {
            return 'RESTRICTED';
        }
        if (q.includes('QRP') || e.includes('PROHIBITED') || e.includes('AREA PROIBIDA')) {
            return 'PROHIBITED';
        }
        if (q.includes('QRD') || e.includes('DANGER') || e.includes('PERIGOSA')) {
            return 'DANGER';
        }
        return 'OTHER';
    }
};
exports.NotamGeometryService = NotamGeometryService;
exports.NotamGeometryService = NotamGeometryService = __decorate([
    (0, common_1.Injectable)()
], NotamGeometryService);
//# sourceMappingURL=notam-geometry.service.js.map