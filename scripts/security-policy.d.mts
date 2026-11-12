export const backendOrigin: string;
export const inlineScripts: string[];
export function scriptHash(text: string): string;
export function headersFor(app: 'admin' | 'mobile'): Record<string, string>;
