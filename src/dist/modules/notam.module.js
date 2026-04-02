"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotamsModule = void 0;
const common_1 = require("@nestjs/common");
const notam_service_1 = require("../service/notam.service");
const env_service_1 = require("../config/env.service");
const notam_controller_1 = require("../controller/notam.controller");
const notam_geometry_service_1 = require("../service/notam-geometry.service");
const notam_http_service_1 = require("../service/notam-http.service");
const config_1 = require("@nestjs/config");
let NotamsModule = class NotamsModule {
};
exports.NotamsModule = NotamsModule;
exports.NotamsModule = NotamsModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule],
        controllers: [notam_controller_1.NotamsController],
        providers: [notam_service_1.NotamsService, env_service_1.EnvService, notam_geometry_service_1.NotamGeometryService, notam_http_service_1.NotamHttpService],
        exports: [notam_service_1.NotamsService],
    })
], NotamsModule);
//# sourceMappingURL=notam.module.js.map