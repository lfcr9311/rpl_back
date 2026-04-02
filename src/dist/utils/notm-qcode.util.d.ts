export type AreaKind = 'AIRSPACE_RESERVATION' | 'DANGER' | 'MILITARY' | 'OVERFLYING' | 'OTHER' | 'PROHIBITED' | 'RESTRICTED' | 'TEMP_RESTRICTED';
export declare function isIgnoredQCode(qcode?: string | null): boolean;
export declare function isAreaQCode(qcode?: string | null): boolean;
export declare function isRestrictedAreaQCode(qcode?: string | null): boolean;
export declare function inferAreaKindFromQCode(qcode?: string | null): AreaKind;
export declare function mapAreaKindToAreaType(kind: AreaKind): string;
export declare function shouldIgnoreNotamByQCode(qcode?: string | null): boolean;
