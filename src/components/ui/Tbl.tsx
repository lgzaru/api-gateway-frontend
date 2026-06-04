import type { ReactNode } from 'react'
import Spin from './Spin'

export interface Column<T> {
  key:      string
  title:    string
  width?:   number | string
  render?:  (row: T, index: number) => ReactNode
  dataKey?: keyof T
}

interface TblProps<T> {
  columns:    Column<T>[]
  data:       T[]
  loading?:   boolean
  rowKey:     keyof T | ((row: T) => string)
  emptyText?: string
  onRow?:     (row: T) => { onClick?: () => void; style?: React.CSSProperties }
}

export default function Tbl<T>({ columns, data, loading, rowKey, emptyText = 'No data', onRow }: TblProps<T>) {
  const getKey = (row: T) =>
    typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey])

  return (
    <div className="pus-table-wrap">
      <table className="pus-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ width: col.width }}>{col.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length}><Spin tip="Loading..." /></td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--txt-3)', fontSize: 13 }}>
                  {emptyText}
                </div>
              </td>
            </tr>
          ) : (
            data.map((row, i) => {
              const handlers = onRow?.(row)
              return (
                <tr
                  key={getKey(row)}
                  onClick={handlers?.onClick}
                  style={{
                    cursor: handlers?.onClick ? 'pointer' : undefined,
                    ...handlers?.style,
                  }}
                >
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.render
                        ? col.render(row, i)
                        : col.dataKey !== undefined
                          ? String(row[col.dataKey] ?? '')
                          : null}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
