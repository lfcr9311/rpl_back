export declare class NotamHttpService {
    private readonly logger;
    private sleep;
    private maskUrl;
    private fetchWithTimeout;
    getTextWithRetry(url: string, fir: string, maxAttempts?: number, timeoutMs?: number): Promise<string>;
}
