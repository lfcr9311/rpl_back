"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var NotamHttpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotamHttpService = void 0;
const common_1 = require("@nestjs/common");
let NotamHttpService = NotamHttpService_1 = class NotamHttpService {
    logger = new common_1.Logger(NotamHttpService_1.name);
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    maskUrl(url) {
        return url.replace(/apiPass=([^&]+)/i, 'apiPass=***');
    }
    async fetchWithTimeout(url, timeoutMs) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Accept': 'application/xml,text/xml,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
                    'User-Agent': 'Mozilla/5.0 NOTAM Client',
                    'Connection': 'close',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async getTextWithRetry(url, fir, maxAttempts = 4, timeoutMs = 20000) {
        let lastError = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.logger.log(`[NOTAM] Consultando FIR ${fir}`);
                this.logger.log(`[NOTAM] URL: ${this.maskUrl(url)}`);
                this.logger.log(`[NOTAM] Tentativa ${attempt}/${maxAttempts} para ${fir}`);
                const response = await this.fetchWithTimeout(url, timeoutMs);
                const body = await response.text();
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} - ${response.statusText}`);
                }
                if (!body || !body.trim()) {
                    throw new Error('Resposta vazia da AISWEB');
                }
                return body;
            }
            catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`[NOTAM] Erro ao consultar ${fir} na tentativa ${attempt}: ${message}`);
                if (attempt < maxAttempts) {
                    const backoff = attempt * 2000;
                    this.logger.warn(`[NOTAM] Nova tentativa para ${fir} em ${backoff}ms`);
                    await this.sleep(backoff);
                }
            }
        }
        throw lastError;
    }
};
exports.NotamHttpService = NotamHttpService;
exports.NotamHttpService = NotamHttpService = NotamHttpService_1 = __decorate([
    (0, common_1.Injectable)()
], NotamHttpService);
//# sourceMappingURL=notam-http.service.js.map