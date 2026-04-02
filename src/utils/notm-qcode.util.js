"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isIgnoredQCode = isIgnoredQCode;
exports.isAreaQCode = isAreaQCode;
exports.isRestrictedAreaQCode = isRestrictedAreaQCode;
exports.inferAreaKindFromQCode = inferAreaKindFromQCode;
exports.mapAreaKindToAreaType = mapAreaKindToAreaType;
exports.shouldIgnoreNotamByQCode = shouldIgnoreNotamByQCode;
const RESTRICTED_AREA_PREFIXES = [
    'RA',
    'RD',
    'RM',
    'RO',
    'RP',
    'RR',
    'RT'
];
const AREA_QCODES = new Set([
    'QRACA',
    'QRACC',
    'QRACD',
    'QRACH',
    'QRACS',
    'QRALW',
    'QRATT',
    'QRAXX',
    'QRAYY',
    'QRAYZ',
    'QRDAW',
    'QRDCA',
    'QRDCC',
    'QRDCD',
    'QRDCH',
    'QRDCL',
    'QRDCS',
    'QRDLP',
    'QRDTT',
    'QRDXX',
    'QRMAC',
    'QRMAP',
    'QRMAW',
    'QRMCA',
    'QRMCC',
    'QRMCD',
    'QRMCH',
    'QRMCS',
    'QRMLP',
    'QRMTT',
    'QRMXX',
    'QROCC',
    'QROCS',
    'QROLP',
    'QROLT',
    'QROTT',
    'QROXX',
    'QRPAW',
    'QRPCA',
    'QRPCC',
    'QRPCD',
    'QRPCH',
    'QRPCL',
    'QRPCS',
    'QRPTT',
    'QRPXX',
    'QRRAK',
    'QRRAP',
    'QRRAR',
    'QRRAW',
    'QRRCA',
    'QRRCC',
    'QRRCD',
    'QRRCH',
    'QRRCL',
    'QRRCS',
    'QRRLP',
    'QRRTT',
    'QRRXX',
    'QRTAR',
    'QRTAW',
    'QRTCA',
    'QRTCC',
    'QRTCD',
    'QRTCH',
    'QRTCL',
    'QRTCN',
    'QRTCS',
    'QRTLP',
    'QRTTT',
    'QRTXX'
]);
const IGNORED_QCODES = new Set([
    'QAFTT'
]);
function normalizeQCode(qcode) {
    return String(qcode ?? '').trim().toUpperCase();
}
function isIgnoredQCode(qcode) {
    return IGNORED_QCODES.has(normalizeQCode(qcode));
}
function isAreaQCode(qcode) {
    const code = normalizeQCode(qcode);
    return AREA_QCODES.has(code);
}
function isRestrictedAreaQCode(qcode) {
    const code = normalizeQCode(qcode);
    return RESTRICTED_AREA_PREFIXES.some(prefix => code.startsWith(prefix));
}
function inferAreaKindFromQCode(qcode) {
    const code = normalizeQCode(qcode);
    if (!isRestrictedAreaQCode(code)) {
        return 'OTHER';
    }
    if (code.startsWith('RA'))
        return 'AIRSPACE_RESERVATION';
    if (code.startsWith('RD'))
        return 'DANGER';
    if (code.startsWith('RM'))
        return 'MILITARY';
    if (code.startsWith('RO'))
        return 'OVERFLYING';
    if (code.startsWith('RP'))
        return 'PROHIBITED';
    if (code.startsWith('RR'))
        return 'RESTRICTED';
    if (code.startsWith('RT'))
        return 'TEMP_RESTRICTED';
    return 'OTHER';
}
function mapAreaKindToAreaType(kind) {
    switch (kind) {
        case 'PROHIBITED':
            return 'PROHIBITED';
        case 'RESTRICTED':
        case 'TEMP_RESTRICTED':
        case 'AIRSPACE_RESERVATION':
        case 'OVERFLYING':
            return 'RESTRICTED';
        case 'DANGER':
        case 'MILITARY':
            return 'DANGER';
        default:
            return 'OTHER';
    }
}
function shouldIgnoreNotamByQCode(qcode) {
    const code = normalizeQCode(qcode);
    if (!code) {
        return false;
    }
    if (isIgnoredQCode(code)) {
        return true;
    }
    if (isRestrictedAreaQCode(code)) {
        return true;
    }
    return false;
}
//# sourceMappingURL=notm-qcode.util.js.map