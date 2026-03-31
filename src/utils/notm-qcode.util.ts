export type AreaKind =
    | 'AIRSPACE_RESERVATION'
    | 'DANGER'
    | 'MILITARY'
    | 'OVERFLYING'
    | 'OTHER'
    | 'PROHIBITED'
    | 'RESTRICTED'
    | 'TEMP_RESTRICTED'

const RESTRICTED_AREA_PREFIXES = [
    'RA',
    'RD',
    'RM',
    'RO',
    'RP',
    'RR',
    'RT'
] as const

const AREA_QCODES = new Set<string>([
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
])

const IGNORED_QCODES = new Set<string>([
    'QAFTT'
])

function normalizeQCode(qcode?: string | null): string {
    return String(qcode ?? '').trim().toUpperCase()
}

export function isIgnoredQCode(qcode?: string | null): boolean {
    return IGNORED_QCODES.has(normalizeQCode(qcode))
}

export function isAreaQCode(qcode?: string | null): boolean {
    const code = normalizeQCode(qcode)
    return AREA_QCODES.has(code)
}

export function isRestrictedAreaQCode(qcode?: string | null): boolean {
    const code = normalizeQCode(qcode)
    return RESTRICTED_AREA_PREFIXES.some(prefix => code.startsWith(prefix))
}

export function inferAreaKindFromQCode(qcode?: string | null): AreaKind {
    const code = normalizeQCode(qcode)

    if (!isRestrictedAreaQCode(code)) {
        return 'OTHER'
    }

    if (code.startsWith('RA')) return 'AIRSPACE_RESERVATION'
    if (code.startsWith('RD')) return 'DANGER'
    if (code.startsWith('RM')) return 'MILITARY'
    if (code.startsWith('RO')) return 'OVERFLYING'
    if (code.startsWith('RP')) return 'PROHIBITED'
    if (code.startsWith('RR')) return 'RESTRICTED'
    if (code.startsWith('RT')) return 'TEMP_RESTRICTED'

    return 'OTHER'
}

export function mapAreaKindToAreaType(kind: AreaKind): string {
    switch (kind) {
        case 'PROHIBITED':
            return 'PROHIBITED'
        case 'RESTRICTED':
        case 'TEMP_RESTRICTED':
        case 'AIRSPACE_RESERVATION':
        case 'OVERFLYING':
            return 'RESTRICTED'
        case 'DANGER':
        case 'MILITARY':
            return 'DANGER'
        default:
            return 'OTHER'
    }
}

export function shouldIgnoreNotamByQCode(qcode?: string | null): boolean {
    const code = normalizeQCode(qcode)

    if (!code) {
        return false
    }

    if (isIgnoredQCode(code)) {
        return true
    }

    if (isRestrictedAreaQCode(code)) {
        return true
    }

    return false
}