/**
 * Descarga real disparada por el click del propio usuario en su navegador
 * (Blob + <a download> sintético). `bom`: antepone el BOM de UTF-8, que Excel
 * necesita para leer bien las tildes y la eñe de un CSV.
 */
export function downloadCsv(filename: string, content: string, options: { bom?: boolean } = {}): void {
  const blob = new Blob([options.bom ? `﻿${content}` : content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
