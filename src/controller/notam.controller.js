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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotamsController = void 0;
const common_1 = require("@nestjs/common");
const notam_service_1 = require("../service/notam.service");
let NotamsController = class NotamsController {
    notamsService;
    constructor(notamsService) {
        this.notamsService = notamsService;
    }
    findRemote(icaocode, minutes) {
        const parsedMinutes = minutes && !Number.isNaN(Number(minutes)) ? Number(minutes) : undefined;
        return this.notamsService.getRemoteNotams({
            icaocode: icaocode?.trim().toUpperCase(),
            minutes: parsedMinutes,
        });
    }
    health() {
        console.log('Health check');
        return { ok: true };
    }
    refresh() {
        return this.notamsService.findAreasFromApiByTargetFirs();
    }
    findAll() {
        return this.notamsService.getRemoteNotams();
    }
    findNotamsByFirs() {
        return this.notamsService.findAreasFromApiByTargetFirs();
    }
    importAeroviasAlta() {
        return this.notamsService.importAeroviasAlta();
    }
    importAeroviasBaixa() {
        return this.notamsService.importAeroviasBaixa();
    }
    importAeroviasTodas() {
        return this.notamsService.importAeroviasTodas();
    }
    importRpl() {
        return this.notamsService.importRpl();
    }
    importAeroportos() {
        return this.notamsService.importAeroportos();
    }
    importWaypoints() {
        return this.notamsService.importWaypoints();
    }
};
exports.NotamsController = NotamsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('icaocode')),
    __param(1, (0, common_1.Query)('minutes')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "findRemote", null);
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "health", null);
__decorate([
    (0, common_1.Post)('refresh'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "refresh", null);
__decorate([
    (0, common_1.Get)('notams'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('firs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "findNotamsByFirs", null);
__decorate([
    (0, common_1.Get)('aerovias/alta'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "importAeroviasAlta", null);
__decorate([
    (0, common_1.Get)('aerovias/baixa'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "importAeroviasBaixa", null);
__decorate([
    (0, common_1.Get)('aerovias/todas'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "importAeroviasTodas", null);
__decorate([
    (0, common_1.Get)('rpl'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "importRpl", null);
__decorate([
    (0, common_1.Get)('aeroportos'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "importAeroportos", null);
__decorate([
    (0, common_1.Get)('waypoints'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotamsController.prototype, "importWaypoints", null);
exports.NotamsController = NotamsController = __decorate([
    (0, common_1.Controller)('notams'),
    __metadata("design:paramtypes", [notam_service_1.NotamsService])
], NotamsController);
//# sourceMappingURL=notam.controller.js.map