export function summarizeOrders(orders) {
  return orders.reduce((summary, order) => {
    summary.count += 1;
    if (order.status === 'completed') {
      summary.completed += 1;
      summary.completedPaisa += order.total_paisa;
    } else if (order.status === 'cancelled') summary.cancelled += 1;
    else summary.open += 1;
    return summary;
  }, { count: 0, completed: 0, completedPaisa: 0, cancelled: 0, open: 0 });
}

export function ordersCsv(orders) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text) || (text.length > 0 && text.charCodeAt(0) < 32)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [['Order ID', 'Created at (UTC)', 'Status', 'Fulfilment', 'Total (PKR)'], ...orders.map(o => [o.id, o.created_at, o.status, o.fulfilment, (o.total_paisa / 100).toFixed(2)])].map(row => row.map(cell).join(',')).join('\r\n');
}
