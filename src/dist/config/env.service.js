"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnvService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let EnvService = class EnvService {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    get aiswebApiUrl() {
        return this.configService.getOrThrow('AISWEB_API_URL');
    }
    get aiswebApiKey() {
        return this.configService.getOrThrow('AISWEB_API_KEY');
    }
    get aiswebApiPass() {
        return this.configService.getOrThrow('AISWEB_API_PASS');
    }
    get aiswebArea() {
        return this.configService.get('AISWEB_AREA', 'notam');
    }
    get aiswebDist() {
        return this.configService.get('AISWEB_DIST', 'I');
    }
    get aiswebAll() {
        return this.configService.get('AISWEB_ALL', '1');
    }
    get aiswebMinutes() {
        return Number(this.configService.get('AISWEB_MINUTES', '43200'));
    }
    get rplUrl() {
        return this.configService.getOrThrow('RPL_URL');
    }
    get aeroviasAltaUrl() {
        return this.configService.getOrThrow('AEROVIAS_ALTA_URL');
    }
    get aeroviasBaixaUrl() {
        return this.configService.getOrThrow('AEROVIAS_BAIXA_URL');
    }
    get airportsUrl() {
        return this.configService.getOrThrow('AIRPORTS_URL');
    }
    get waypointsUrl() {
        return this.configService.getOrThrow('WAYPOINTS_URL');
    }
    get aeroviasUruguayCsvPath() {
        return this.configService.getOrThrow('AEROVIAS_URUGUAY_CSV_PATH');
    }
    get frontendOrigin() {
        return this.configService.get('FRONTEND_ORIGIN', 'http://localhost:5173');
    }
    get port() {
        return Number(this.configService.get('PORT', '8000'));
    }
};
exports.EnvService = EnvService;
exports.EnvService = EnvService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], EnvService);
//# sourceMappingURL=env.service.js.map