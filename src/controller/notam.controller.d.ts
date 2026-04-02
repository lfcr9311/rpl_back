import { NotamsService } from '../service/notam.service';
export declare class NotamsController {
    private readonly notamsService;
    constructor(notamsService: NotamsService);
    findRemote(icaocode?: string, minutes?: string): Promise<import("../models/notams/notam").NotamModel[]>;
    health(): {
        ok: boolean;
    };
    refresh(): Promise<Record<string, import("../models/notams/aisweb-response.model").AreaNotamApiModel[]>>;
    findAll(): Promise<import("../models/notams/notam").NotamModel[]>;
    findNotamsByFirs(): Promise<Record<string, import("../models/notams/aisweb-response.model").AreaNotamApiModel[]>>;
    importAeroviasAlta(): Promise<import("../models/notams/aisweb-response.model").AeroviaLinhaModel[]>;
    importAeroviasBaixa(): Promise<import("../models/notams/aisweb-response.model").AeroviaLinhaModel[]>;
    importAeroviasTodas(): Promise<import("../models/notams/aisweb-response.model").AeroviasResponseModel>;
    importRpl(): Promise<import("../models/notams/aisweb-response.model").RotaRplModel[]>;
    importAeroportos(): Promise<import("../models/notams/aisweb-response.model").AeroportoModel[]>;
    importWaypoints(): Promise<import("../models/notams/aisweb-response.model").WaypointModel[]>;
}
