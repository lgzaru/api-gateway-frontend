import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/**
 * Format a UTC timestamp string from the backend into local time.
 * Handles ISO strings with or without the Z suffix.
 */
export const fmtTs = (ts: string, fmt = 'MMM D HH:mm:ss') =>
  dayjs.utc(ts).local().format(fmt)

export const fmtTsDate = (ts: string) =>
  dayjs.utc(ts).local().format('MMM D, YYYY')

export const fmtTsDateTime = (ts: string) =>
  dayjs.utc(ts).local().format('MMM D, YYYY HH:mm')

export const fmtTsFull = (ts: string) =>
  dayjs.utc(ts).local().format('YYYY-MM-DD HH:mm:ss')

export const fmtTsMs = (ts: string) =>
  dayjs.utc(ts).local().format('YYYY-MM-DD HH:mm:ss.SSS')
