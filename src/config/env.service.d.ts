import { ConfigService } from '@nestjs/config';
export declare class EnvService {
    private readonly configService;
    constructor(configService: ConfigService);
    get aiswebApiUrl(): string;
    get aiswebApiKey(): string;
    get aiswebApiPass(): string;
    get aiswebArea(): string;
    get aiswebDist(): string;
    get aiswebAll(): string;
    get aiswebMinutes(): number;
    get rplUrl(): string;
    get aeroviasAltaUrl(): string;
    get aeroviasBaixaUrl(): string;
    get airportsUrl(): string;
    get waypointsUrl(): string;
    get aeroviasUruguayCsvPath(): string;
    get frontendOrigin(): string;
    get port(): number;
}
