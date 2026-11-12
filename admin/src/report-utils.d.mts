export type ReportOrder = { id: string; created_at: string; status: string; fulfilment: string; total_paisa: number };
export function summarizeOrders(orders: ReportOrder[]): { count: number; completed: number; completedPaisa: number; cancelled: number; open: number };
export function ordersCsv(orders: ReportOrder[]): string;
