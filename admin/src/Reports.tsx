import { useCallback, useState } from 'react';
import { db, money } from './api';
import { useLoad } from './useLoad';
import { ordersCsv, summarizeOrders, type ReportOrder } from './report-utils.mjs';

export function Reports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const load = useCallback(async () => {
    if (from && to && from > to) throw new Error('The start date must be before the end date.');
    const snapshot = new Date().toISOString();
    const rows: ReportOrder[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = db.from('orders').select('id,created_at,status,fulfilment,total_paisa').lte('created_at', snapshot).order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
      if (from) query = query.gte('created_at', `${from}T00:00:00+05:00`);
      if (to) query = query.lte('created_at', `${to}T23:59:59.999+05:00`);
      const { data, error } = await query;
      if (error) throw error;
      const batch = data as ReportOrder[];
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    return rows;
  }, [from, to]);
  const report = useLoad(load);
  function download() {
    if (!report.data) return;
    const url = URL.createObjectURL(new Blob(['\ufeff', ordersCsv(report.data)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `united-store-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const summary = summarizeOrders(report.data ?? []);
  return <><div className="section-head"><div><h2>Order report</h2><p>View order activity and export it as a CSV file.</p></div><button className="quiet" disabled={report.loading} onClick={report.refresh}>Refresh</button></div>
    <div className="filters"><label>From date<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>To date<input type="date" value={to} onChange={e => setTo(e.target.value)}/></label><button onClick={download} disabled={report.loading || !report.data?.length}>Export CSV</button></div>
    <p>Dates use Pakistan time. Completed order value reflects orders marked complete, not verified bank transactions or refunds.</p>
    {report.error && <p className="message error" role="alert">{report.error}</p>}
    {report.loading ? <p className="loading" role="status">Loading report…</p> : report.data && <><div className="stats report-stats"><section><h3>Orders</h3><p>{summary.count}</p></section><section><h3>Completed</h3><p>{summary.completed}</p></section><section><h3>Open</h3><p>{summary.open}</p></section><section><h3>Cancelled</h3><p>{summary.cancelled}</p></section></div><section className="welcome"><h3>Completed order value</h3><p className="total">{money(summary.completedPaisa)}</p><p>Export contains order IDs, dates, statuses, fulfilment and totals. Customer contact details are excluded.</p></section></>}
  </>;
}
