export interface Column<T> {
  header: string
  align?: 'left' | 'right'
  value: (row: T) => string
}

const ANSI = /\u001b\[[0-9;]*m/g

function visibleWidth(value: string): number {
  return value.replace(ANSI, '').length
}

/**
 * Render a simple left/right-aligned text table. ANSI colors are stripped
 * when measuring column widths, so colored cells pad correctly.
 */
export function renderTable<T>(rows: readonly T[], columns: readonly Column<T>[]): string {
  const widths = columns.map((column, index) => {
    const headerWidth = column.header.length
    const maxRow = rows.reduce((max, row) => Math.max(max, visibleWidth(column.value(row))), 0)
    return Math.max(headerWidth, maxRow)
  })

  const renderRow = (cells: readonly string[], padTo: readonly number[]) =>
    cells
      .map((cell, index) => {
        const column = columns[index]!
        const width = padTo[index]!
        return column.align === 'right' ? cell.padStart(width) : cell.padEnd(width)
      })
      .join('  ')
      .trimEnd()

  const header = renderRow(columns.map((column) => column.header), widths)
  const separator = widths.map((width) => '-'.repeat(width)).join('  ').trimEnd()
  const body = rows.map((row) => renderRow(columns.map((column) => column.value(row)), widths))

  return [header, separator, ...body].join('\n')
}