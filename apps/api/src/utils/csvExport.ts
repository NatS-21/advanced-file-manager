/**
 * Utility functions for CSV export
 * Handles proper escaping, UTF-8 BOM, and formatting
 */

/**
 * Escapes a CSV field value
 * - Wraps in quotes if contains comma, quote, or newline
 * - Doubles quotes inside quoted fields
 */
function escapeCSVField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);
  
  // If contains comma, quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape quotes by doubling them
    return `"${str.replace(/"/g, '""')}"`;
  }
  
  return str;
}

/**
 * Formats a value for CSV export
 * - Dates: ISO format
 * - Numbers: as-is
 * - Objects/Arrays: JSON string
 * - Other: string representation
 */
function formatCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

/**
 * Generates a CSV string from rows and headers
 * @param rows Array of objects or arrays representing rows
 * @param headers Array of header names
 * @param includeBOM Whether to include UTF-8 BOM (for Excel compatibility)
 * @returns CSV string with UTF-8 BOM
 */
export function generateCSV(
  rows: Array<Record<string, any> | any[]>,
  headers: string[],
  includeBOM: boolean = true
): string {
  // Escape headers
  const escapedHeaders = headers.map(escapeCSVField);
  const headerLine = escapedHeaders.join(',');

  // Process rows
  const rowLines = rows.map((row) => {
    const values = Array.isArray(row) 
      ? row.map(formatCSVValue)
      : headers.map((header) => formatCSVValue(row[header]));
    
    return values.map(escapeCSVField).join(',');
  });

  // Combine header and rows
  const csv = [headerLine, ...rowLines].join('\r\n');

  // Add UTF-8 BOM for Excel compatibility
  return includeBOM ? '\uFEFF' + csv : csv;
}

/**
 * Generates CSV from a simple array of arrays (no headers)
 */
export function generateCSVSimple(
  rows: any[][],
  includeBOM: boolean = true
): string {
  const rowLines = rows.map((row) => {
    return row.map((value) => escapeCSVField(formatCSVValue(value))).join(',');
  });

  const csv = rowLines.join('\r\n');
  return includeBOM ? '\uFEFF' + csv : csv;
}

