import { useState } from 'react'
import { Plus, Trash2, Download, PlayCircle, RotateCcw } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listSchedules, createSchedule, deleteSchedule,
  listExports, generateReport, downloadExport,
  listBackups, createBackup, restoreBackup, downloadBackup,
} from '../api/reporting'
import type { ReportSchedule, ReportExport, ConfigBackup } from '../api/reporting'
import {
  Btn, Inp, Sel, Tag, Switch, Tbl, Tabs, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column, TabItem } from '../components/ui'
import dayjs from 'dayjs'

const EXPORT_STATUS_COLOR: Record<string, 'muted' | 'blue' | 'green' | 'red'> = {
  PENDING: 'muted', RUNNING: 'blue', COMPLETED: 'green', FAILED: 'red',
}

const BACKUP_STATUS_COLOR: Record<string, 'green' | 'orange' | 'blue' | 'red'> = {
  ACTIVE: 'green', PENDING_RESTORE: 'orange', RESTORED: 'blue', FAILED: 'red',
}

const REPORT_TYPES = ['USAGE', 'BILLING', 'AUDIT', 'INCIDENT', 'PARTNER', 'SLA']
const FORMATS = ['CSV', 'JSON', 'XLSX', 'PDF']

export default function Reporting() {
  const [scheduleDrawer, setScheduleDrawer] = useState(false)
  const [exportDrawer, setExportDrawer] = useState(false)
  const [backupDrawer, setBackupDrawer] = useState(false)

  const [scheduleForm, setScheduleForm] = useState({ name: '', reportType: '', format: '', cronExpression: '', recipients: [] as string[], enabled: true })
  const [exportForm, setExportForm] = useState({ reportType: '', format: '' })
  const [backupForm, setBackupForm] = useState({ description: '' })
  const [scheduleErrors, setScheduleErrors] = useState<Record<string, string>>({})
  const [exportErrors, setExportErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['report-schedules'],
    queryFn: () => listSchedules({ size: 50 }),
    select: (res) => res.data,
  })

  const { data: exports, isLoading: exportsLoading } = useQuery({
    queryKey: ['report-exports'],
    queryFn: () => listExports({ size: 50 }),
    select: (res) => res.data,
    refetchInterval: 10_000,
  })

  const { data: backups, isLoading: backupsLoading } = useQuery({
    queryKey: ['config-backups'],
    queryFn: () => listBackups({ size: 50 }),
    select: (res) => res.data,
  })

  const createScheduleMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-schedules'] }); setScheduleDrawer(false); setScheduleForm({ name: '', reportType: '', format: '', cronExpression: '', recipients: [], enabled: true }); toast.success('Schedule created') },
    onError: () => toast.error('Failed to create schedule'),
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-schedules'] }); toast.success('Schedule deleted') },
    onError: () => toast.error('Failed to delete schedule'),
  })

  const generateMutation = useMutation({
    mutationFn: generateReport,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-exports'] }); setExportDrawer(false); setExportForm({ reportType: '', format: '' }); toast.success('Report generation started') },
    onError: () => toast.error('Failed to trigger report'),
  })

  const createBackupMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config-backups'] }); setBackupDrawer(false); setBackupForm({ description: '' }); toast.success('Backup created') },
    onError: () => toast.error('Failed to create backup'),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreBackup(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config-backups'] }); toast.success('Restore submitted for approval') },
    onError: () => toast.error('Failed to submit restore'),
  })

  function submitSchedule() {
    const e: Record<string, string> = {}
    if (!scheduleForm.name.trim()) e.name = 'Required'
    if (!scheduleForm.reportType) e.reportType = 'Required'
    if (!scheduleForm.format) e.format = 'Required'
    if (!scheduleForm.cronExpression.trim()) e.cronExpression = 'Required'
    if (Object.keys(e).length) { setScheduleErrors(e); return }
    createScheduleMutation.mutate(scheduleForm)
  }

  function submitExport() {
    const e: Record<string, string> = {}
    if (!exportForm.reportType) e.reportType = 'Required'
    if (!exportForm.format) e.format = 'Required'
    if (Object.keys(e).length) { setExportErrors(e); return }
    generateMutation.mutate(exportForm)
  }

  const scheduleList = schedules?.content ?? []
  const exportList = exports?.content ?? []
  const backupList = backups?.content ?? []

  const scheduleColumns: Column<ReportSchedule>[] = [
    { key: 'name', title: 'Name', render: (r) => <strong>{r.name}</strong> },
    { key: 'reportType', title: 'Type', width: 110, render: (r) => <Tag color="blue">{r.reportType}</Tag> },
    { key: 'cronExpression', title: 'Cron', width: 140, render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.cronExpression}</span> },
    { key: 'format', title: 'Format', width: 80, render: (r) => <Tag color="muted">{r.format}</Tag> },
    { key: 'enabled', title: 'Active', width: 70, render: (r) => <Tag color={r.enabled ? 'green' : 'muted'}>{r.enabled ? 'On' : 'Off'}</Tag> },
    {
      key: 'actions', title: '', width: 60,
      render: (r) => (
        <Confirm danger title="Delete this schedule?" onConfirm={() => deleteScheduleMutation.mutate(r.id)}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={14} />} />
        </Confirm>
      ),
    },
  ]

  const exportColumns: Column<ReportExport>[] = [
    { key: 'reportType', title: 'Type', width: 110, render: (r) => <Tag color="blue">{r.reportType}</Tag> },
    { key: 'format', title: 'Format', width: 80, render: (r) => <Tag color="muted">{r.format}</Tag> },
    {
      key: 'status', title: 'Status', width: 120,
      render: (r) => <Tag color={EXPORT_STATUS_COLOR[r.status] ?? 'muted'}>{r.status}</Tag>,
    },
    { key: 'requestedAt', title: 'Requested', width: 150, render: (r) => dayjs(r.requestedAt).format('MMM D, HH:mm') },
    { key: 'completedAt', title: 'Completed', width: 150, render: (r) => r.completedAt ? dayjs(r.completedAt).format('MMM D, HH:mm') : '—' },
    {
      key: 'dl', title: '', width: 100,
      render: (r) => r.status === 'COMPLETED' ? (
        <a href={downloadExport(r.id)} download>
          <Btn variant="secondary" size="sm" icon={<Download size={13} />}>Download</Btn>
        </a>
      ) : null,
    },
  ]

  const backupColumns: Column<ConfigBackup>[] = [
    {
      key: 'description', title: 'Description',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.description ?? 'Config Backup'}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-3)' }}>{r.id}</div>
        </div>
      ),
    },
    {
      key: 'status', title: 'Status', width: 130,
      render: (r) => <Tag color={BACKUP_STATUS_COLOR[r.status] ?? 'muted'}>{r.status}</Tag>,
    },
    { key: 'createdAt', title: 'Created', width: 150, render: (r) => dayjs(r.createdAt).format('MMM D, YYYY HH:mm') },
    {
      key: 'actions', title: '', width: 170,
      render: (r) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <a href={downloadBackup(r.id)} download>
            <Btn variant="secondary" size="sm" icon={<Download size={13} />}>Download</Btn>
          </a>
          {r.status === 'ACTIVE' && (
            <Confirm title="Submit this backup for restore? It will require maker-checker approval." onConfirm={() => restoreMutation.mutate(r.id)}>
              <Btn variant="secondary" size="sm" icon={<RotateCcw size={13} />} loading={restoreMutation.isPending && restoreMutation.variables === r.id}>
                Restore
              </Btn>
            </Confirm>
          )}
        </div>
      ),
    },
  ]

  const statCard = (label: string, value: number | string) => (
    <div className="card-sm" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 11, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--txt-1)' }}>{value}</div>
    </div>
  )

  const tabs: TabItem[] = [
    {
      key: 'schedules',
      label: 'Scheduled Reports',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon={<Plus size={15} />} onClick={() => setScheduleDrawer(true)}>New Schedule</Btn>
          </div>
          <Tbl columns={scheduleColumns} data={scheduleList} rowKey="id" loading={schedulesLoading} emptyText="No schedules configured" />
        </div>
      ),
    },
    {
      key: 'exports',
      label: 'On-Demand Exports',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon={<PlayCircle size={15} />} onClick={() => setExportDrawer(true)}>Generate Report</Btn>
          </div>
          <Tbl columns={exportColumns} data={exportList} rowKey="id" loading={exportsLoading} emptyText="No exports yet" />
        </div>
      ),
    },
    {
      key: 'backups',
      label: 'Config Backups',
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="primary" icon={<Plus size={15} />} onClick={() => setBackupDrawer(true)}>Create Backup</Btn>
          </div>
          <Tbl columns={backupColumns} data={backupList} rowKey="id" loading={backupsLoading} emptyText="No backups yet" />
        </div>
      ),
    },
  ]

  return (
    <div style={{ height: 'calc(100vh - 98px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flexShrink: 0, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt-1)' }}>Reporting & Backups</h2>
        <p style={{ margin: '2px 0 0', color: 'var(--txt-3)', fontSize: 13 }}>
          Scheduled reports, on-demand exports, and configuration backups
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, flexShrink: 0, marginBottom: 12 }}>
        {statCard('Active Schedules', scheduleList.filter(s => s.enabled).length)}
        {statCard('Exports (All Time)', exports?.totalElements ?? 0)}
        {statCard('Running Exports', exportList.filter(e => e.status === 'RUNNING').length)}
        {statCard('Config Backups', backups?.totalElements ?? 0)}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Tabs items={tabs} />
      </div>

      {/* Schedule Drawer */}
      <Drawer
        open={scheduleDrawer}
        onClose={() => { setScheduleDrawer(false); setScheduleErrors({}) }}
        title="New Report Schedule"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setScheduleDrawer(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createScheduleMutation.isPending} onClick={submitSchedule}>Create</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp label="Schedule Name" value={scheduleForm.name} onChangeValue={v => setScheduleForm(f => ({ ...f, name: v }))} placeholder="e.g. Monthly Billing Summary" error={scheduleErrors.name} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel label="Report Type" value={scheduleForm.reportType} onChangeValue={v => setScheduleForm(f => ({ ...f, reportType: v }))} options={REPORT_TYPES.map(t => ({ value: t, label: t }))} placeholder="Select type" error={scheduleErrors.reportType} />
            <Sel label="Format" value={scheduleForm.format} onChangeValue={v => setScheduleForm(f => ({ ...f, format: v }))} options={FORMATS.map(f => ({ value: f, label: f }))} placeholder="Select format" error={scheduleErrors.format} />
          </div>
          <Inp label="Cron Expression" value={scheduleForm.cronExpression} onChangeValue={v => setScheduleForm(f => ({ ...f, cronExpression: v }))} placeholder="e.g. 0 0 1 * * (1st of each month)" error={scheduleErrors.cronExpression} />
          <div>
            <div className="field-label">Enabled</div>
            <div style={{ marginTop: 8 }}>
              <Switch checked={scheduleForm.enabled} onChange={v => setScheduleForm(f => ({ ...f, enabled: v }))} />
            </div>
          </div>
        </div>
      </Drawer>

      {/* Generate Export Drawer */}
      <Drawer
        open={exportDrawer}
        onClose={() => { setExportDrawer(false); setExportErrors({}) }}
        title="Generate Report"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setExportDrawer(false)}>Cancel</Btn>
            <Btn variant="primary" loading={generateMutation.isPending} icon={<PlayCircle size={14} />} onClick={submitExport}>Generate</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Sel label="Report Type" value={exportForm.reportType} onChangeValue={v => setExportForm(f => ({ ...f, reportType: v }))} options={REPORT_TYPES.map(t => ({ value: t, label: t }))} placeholder="Select type" error={exportErrors.reportType} />
          <Sel label="Format" value={exportForm.format} onChangeValue={v => setExportForm(f => ({ ...f, format: v }))} options={FORMATS.map(f => ({ value: f, label: f }))} placeholder="Select format" error={exportErrors.format} />
        </div>
      </Drawer>

      {/* Backup Drawer */}
      <Drawer
        open={backupDrawer}
        onClose={() => setBackupDrawer(false)}
        title="Create Config Backup"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setBackupDrawer(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createBackupMutation.isPending} onClick={() => createBackupMutation.mutate(backupForm)}>Create Backup</Btn>
          </div>
        }
      >
        <Inp label="Description" value={backupForm.description} onChangeValue={v => setBackupForm({ description: v })} placeholder="e.g. Pre-migration config snapshot" />
      </Drawer>
    </div>
  )
}
