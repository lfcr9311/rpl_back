import { Injectable, Logger } from '@nestjs/common'

type FetchTextResult = {
    ok: boolean
    status: number
    body: string
}

@Injectable()
export class NotamHttpService {
    private readonly logger = new Logger(NotamHttpService.name)

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private maskUrl(url: string): string {
        return url.replace(/apiPass=([^&]+)/i, 'apiPass=***')
    }

    private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), timeoutMs)

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
            })
        } finally {
            clearTimeout(timeout)
        }
    }

    async getTextWithRetry(url: string, fir: string, maxAttempts = 4, timeoutMs = 20000): Promise<string> {
        let lastError: unknown = null

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                this.logger.log(`[NOTAM] Consultando FIR ${fir}`)
                this.logger.log(`[NOTAM] URL: ${this.maskUrl(url)}`)
                this.logger.log(`[NOTAM] Tentativa ${attempt}/${maxAttempts} para ${fir}`)

                const response = await this.fetchWithTimeout(url, timeoutMs)
                const body = await response.text()

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} - ${response.statusText}`)
                }

                if (!body || !body.trim()) {
                    throw new Error('Resposta vazia da AISWEB')
                }

                return body
            } catch (error) {
                lastError = error

                const message =
                    error instanceof Error ? error.message : String(error)

                this.logger.error(`[NOTAM] Erro ao consultar ${fir} na tentativa ${attempt}: ${message}`)

                if (attempt < maxAttempts) {
                    const backoff = attempt * 2000
                    this.logger.warn(`[NOTAM] Nova tentativa para ${fir} em ${backoff}ms`)
                    await this.sleep(backoff)
                }
            }
        }

        throw lastError
    }
}