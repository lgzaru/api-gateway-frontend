import { useState } from 'react'
import { Plus, Trash2, PlayCircle, CheckCircle2, XCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listSuites, createSuite, deleteSuite,
  listCases, addCase, deleteCase,
  runSuite, listRuns, getRunResults,
} from '../api/testing'
import type { TestSuite, TestCase, TestRun, TestResult, TestRunSummary } from '../api/testing'
import {
  Btn, Inp, Sel, Tag, Tbl, Drawer, Confirm, toast,
} from '../components/ui'
import type { Column } from '../components/ui'
import dayjs from 'dayjs'

const RUN_STATUS_COLOR: Record<string, 'muted' | 'blue' | 'green' | 'red'> = {
  PENDING: 'muted', RUNNING: 'blue', PASSED: 'green', FAILED: 'red', ERROR: 'red',
}

const METHOD_COLOR: Record<string, 'blue' | 'green' | 'orange' | 'accent' | 'red'> = {
  GET: 'blue', POST: 'green', PUT: 'orange', PATCH: 'accent', DELETE: 'red',
}

const ENVS = ['prod', 'dev', 'sandbox']

export default function Testing() {
  const [apiId, setApiId] = useState('')
  const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(null)
  const [suiteView, setSuiteView] = useState<'cases' | 'runs'>('cases')
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null)
  const [lastRunSummary, setLastRunSummary] = useState<TestRunSummary | null>(null)
  const [runEnv, setRunEnv] = useState('prod')
  const [createSuiteOpen, setCreateSuiteOpen] = useState(false)
  const [addCaseOpen, setAddCaseOpen] = useState(false)

  const [suiteForm, setSuiteForm] = useState({ name: '', description: '' })
  const [suiteErrors, setSuiteErrors] = useState<Record<string, string>>({})
  const [caseForm, setCaseForm] = useState({ name: '', method: '', path: '', expectedStatus: '', requestHeaders: '', requestBody: '', assertions: '', orderIndex: '0' })
  const [caseErrors, setCaseErrors] = useState<Record<string, string>>({})

  const qc = useQueryClient()

  const { data: suitesData, isLoading: suitesLoading } = useQuery({
    queryKey: ['test-suites', apiId],
    queryFn: () => apiId ? listSuites(apiId, { size: 50 }) : null,
    enabled: !!apiId,
    select: (res) => res?.data,
  })

  const { data: cases, isLoading: casesLoading } = useQuery({
    queryKey: ['test-cases', selectedSuite?.id],
    queryFn: () => selectedSuite ? listCases(selectedSuite.id) : null,
    enabled: !!selectedSuite,
    select: (res) => res?.data,
  })

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['test-runs', selectedSuite?.id],
    queryFn: () => selectedSuite ? listRuns(selectedSuite.id, { size: 20 }) : null,
    enabled: !!selectedSuite,
    select: (res) => res?.data,
  })

  const { data: runResults, isLoading: resultsLoading } = useQuery({
    queryKey: ['run-results', selectedRun?.id],
    queryFn: () => selectedRun ? getRunResults(selectedRun.id) : null,
    enabled: !!selectedRun,
    select: (res) => res?.data,
  })

  const createSuiteMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => createSuite(apiId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-suites', apiId] }); setCreateSuiteOpen(false); setSuiteForm({ name: '', description: '' }); toast.success('Suite created') },
    onError: () => toast.error('Failed to create suite'),
  })

  const deleteSuiteMutation = useMutation({
    mutationFn: deleteSuite,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-suites', apiId] }); setSelectedSuite(null); toast.success('Suite deleted') },
    onError: () => toast.error('Failed to delete suite'),
  })

  const addCaseMutation = useMutation({
    mutationFn: (data: Parameters<typeof addCase>[1]) => selectedSuite ? addCase(selectedSuite.id, data) : Promise.reject(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-cases', selectedSuite?.id] }); setAddCaseOpen(false); setCaseForm({ name: '', method: '', path: '', expectedStatus: '', requestHeaders: '', requestBody: '', assertions: '', orderIndex: '0' }); toast.success('Test case added') },
    onError: () => toast.error('Failed to add test case'),
  })

  const deleteCaseMutation = useMutation({
    mutationFn: deleteCase,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['test-cases', selectedSuite?.id] }); toast.success('Test case deleted') },
    onError: () => toast.error('Failed to delete test case'),
  })

  const runMutation = useMutation({
    mutationFn: (env: string) => selectedSuite ? runSuite(selectedSuite.id, env) : Promise.reject(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['test-runs', selectedSuite?.id] })
      setLastRunSummary(res.data)
      setSuiteView('runs')
    },
    onError: () => toast.error('Failed to run suite'),
  })

  function submitSuite() {
    const e: Record<string, string> = {}
    if (!suiteForm.name.trim()) e.name = 'Required'
    if (Object.keys(e).length) { setSuiteErrors(e); return }
    createSuiteMutation.mutate({ name: suiteForm.name, description: suiteForm.description || undefined })
  }

  function submitCase() {
    const e: Record<string, string> = {}
    if (!caseForm.name.trim()) e.name = 'Required'
    if (!caseForm.method) e.method = 'Required'
    if (!caseForm.path.trim()) e.path = 'Required'
    if (!caseForm.expectedStatus) e.expectedStatus = 'Required'
    if (Object.keys(e).length) { setCaseErrors(e); return }
    addCaseMutation.mutate({
      name: caseForm.name,
      method: caseForm.method,
      path: caseForm.path,
      expectedStatus: Number(caseForm.expectedStatus),
      requestHeaders: caseForm.requestHeaders || undefined,
      requestBody: caseForm.requestBody || undefined,
      assertions: caseForm.assertions || undefined,
      orderIndex: Number(caseForm.orderIndex) || 0,
    })
  }

  const suites = suitesData?.content ?? []

  const suiteColumns: Column<TestSuite>[] = [
    { key: 'name', title: 'Name', render: (r) => <strong>{r.name}</strong> },
    { key: 'description', title: 'Description', render: (r) => r.description ?? <span style={{ color: 'var(--txt-3)' }}>—</span> },
    { key: 'createdAt', title: 'Created', width: 120, render: (r) => dayjs(r.createdAt).format('MMM D, YYYY') },
    {
      key: 'actions', title: '', width: 120,
      render: (r) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <Btn variant="ghost" size="sm" onClick={() => { setSelectedSuite(r); setSuiteView('cases') }}>Open</Btn>
          <Confirm danger title="Delete this suite and all test cases?" onConfirm={() => deleteSuiteMutation.mutate(r.id)}>
            <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
          </Confirm>
        </div>
      ),
    },
  ]

  const caseColumns: Column<TestCase>[] = [
    { key: 'orderIndex', title: '#', width: 40, render: (r) => <span style={{ color: 'var(--txt-3)', fontSize: 12 }}>{r.orderIndex}</span> },
    { key: 'name', title: 'Name', render: (r) => <strong>{r.name}</strong> },
    { key: 'method', title: 'Method', width: 80, render: (r) => <Tag color={METHOD_COLOR[r.method] ?? 'muted'}>{r.method}</Tag> },
    { key: 'path', title: 'Path', render: (r) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.path}</span> },
    { key: 'expectedStatus', title: 'Expected Status', width: 130, render: (r) => <Tag color="muted">{r.expectedStatus}</Tag> },
    {
      key: 'actions', title: '', width: 60,
      render: (r) => (
        <Confirm danger title="Delete this test case?" onConfirm={() => deleteCaseMutation.mutate(r.id)}>
          <Btn variant="ghost" size="sm" iconOnly icon={<Trash2 size={13} />} />
        </Confirm>
      ),
    },
  ]

  const runColumns: Column<TestRun>[] = [
    { key: 'environment', title: 'Environment', width: 110, render: (r) => <Tag color="muted">{r.environment}</Tag> },
    { key: 'status', title: 'Status', width: 110, render: (r) => <Tag color={RUN_STATUS_COLOR[r.status]}>{r.status}</Tag> },
    { key: 'startedAt', title: 'Started', width: 140, render: (r) => r.startedAt ? dayjs(r.startedAt).format('MMM D HH:mm:ss') : <span style={{ color: 'var(--txt-3)' }}>—</span> },
    { key: 'completedAt', title: 'Completed', width: 140, render: (r) => r.completedAt ? dayjs(r.completedAt).format('MMM D HH:mm:ss') : <span style={{ color: 'var(--txt-3)' }}>—</span> },
    {
      key: 'results', title: '', width: 90,
      render: (r) => <Btn variant="ghost" size="sm" onClick={() => setSelectedRun(r)}>Results</Btn>,
    },
  ]

  const resultColumns: Column<TestResult>[] = [
    {
      key: 'passed', title: 'Pass', width: 56,
      render: (r) => r.passed
        ? <CheckCircle2 size={15} style={{ color: 'var(--green)' }} />
        : <XCircle size={15} style={{ color: 'var(--red)' }} />,
    },
    {
      key: 'actualStatus', title: 'Status', width: 80,
      render: (r) => <Tag color={r.actualStatus >= 200 && r.actualStatus < 300 ? 'green' : 'red'}>{r.actualStatus}</Tag>,
    },
    { key: 'responseTimeMs', title: 'Response Time', width: 130, render: (r) => `${r.responseTimeMs} ms` },
    {
      key: 'errorMessage', title: 'Error',
      render: (r) => r.errorMessage
        ? <span style={{ color: 'var(--red)', fontSize: 12 }}>{r.errorMessage}</span>
        : <span style={{ color: 'var(--txt-3)' }}>—</span>,
    },
  ]

  const passRate = lastRunSummary && lastRunSummary.total > 0
    ? Math.round((lastRunSummary.passed / lastRunSummary.total) * 100)
    : null

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--txt-1)' }}>API Testing Suite</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--txt-3)', fontSize: 14 }}>Automated test suites for API validation</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'flex-end' }}>
        <div style={{ flex: 1, maxWidth: 440 }}>
          <Inp
            label="API ID"
            value={apiId}
            onChangeValue={v => { setApiId(v); setSelectedSuite(null) }}
            placeholder="Paste proxy API UUID to load its test suites"
          />
        </div>
        {apiId && (
          <Btn variant="primary" icon={<Plus size={15} />} onClick={() => { setCreateSuiteOpen(true); setSuiteErrors({}) }}>
            New Suite
          </Btn>
        )}
      </div>

      {!apiId ? (
        <p style={{ color: 'var(--txt-3)', fontSize: 14 }}>Enter an API ID above to manage its test suites.</p>
      ) : !selectedSuite ? (
        <Tbl columns={suiteColumns} data={suites} rowKey="id" loading={suitesLoading} emptyText="No test suites yet" />
      ) : (
        <>
          {/* Suite detail header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Btn variant="link" onClick={() => setSelectedSuite(null)}>← All Suites</Btn>
              <span style={{ color: 'var(--divider)' }}>/</span>
              <strong style={{ color: 'var(--txt-1)' }}>{selectedSuite.name}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ display: 'flex', borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                {(['cases', 'runs'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setSuiteView(v)}
                    style={{
                      padding: '5px 14px', fontSize: 13, cursor: 'pointer', border: 'none',
                      background: suiteView === v ? 'var(--accent)' : 'transparent',
                      color: suiteView === v ? '#fff' : 'var(--txt-2)',
                    }}
                  >
                    {v === 'cases' ? 'Test Cases' : 'Run History'}
                  </button>
                ))}
              </div>
              <Sel
                value={runEnv}
                onChangeValue={setRunEnv}
                options={ENVS.map(e => ({ value: e, label: e }))}
              />
              <Btn variant="primary" icon={<PlayCircle size={15} />} loading={runMutation.isPending} onClick={() => runMutation.mutate(runEnv)}>
                Run
              </Btn>
            </div>
          </div>

          {/* Last run summary */}
          {lastRunSummary && (
            <div className="card-sm" style={{ marginBottom: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 10 }}>
                {[
                  { label: 'Status', value: lastRunSummary.status, color: lastRunSummary.status === 'PASSED' ? 'var(--green)' : 'var(--red)' },
                  { label: 'Total', value: lastRunSummary.total, color: 'var(--txt-1)' },
                  { label: 'Passed', value: lastRunSummary.passed, color: 'var(--green)' },
                  { label: 'Failed', value: lastRunSummary.failed, color: lastRunSummary.failed > 0 ? 'var(--red)' : 'var(--txt-3)' },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 11, color: 'var(--txt-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>
              {passRate !== null && (
                <div>
                  <div style={{ height: 6, borderRadius: 99, background: 'var(--border)' }}>
                    <div style={{ width: passRate + '%', height: '100%', background: lastRunSummary.failed > 0 ? 'var(--red)' : 'var(--green)', borderRadius: 99, transition: 'width 0.3s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 4 }}>{passRate}% pass rate</div>
                </div>
              )}
            </div>
          )}

          {suiteView === 'cases' ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Btn variant="secondary" icon={<Plus size={14} />} onClick={() => { setAddCaseOpen(true); setCaseErrors({}) }}>Add Case</Btn>
              </div>
              <Tbl columns={caseColumns} data={cases ?? []} rowKey="id" loading={casesLoading} emptyText="No test cases yet" />
            </>
          ) : (
            <>
              <Tbl columns={runColumns} data={runsData?.content ?? []} rowKey="id" loading={runsLoading} emptyText="No runs yet" />
              <Drawer
                title={`Run Results — ${dayjs(selectedRun?.createdAt).format('MMM D HH:mm')}`}
                open={!!selectedRun}
                onClose={() => setSelectedRun(null)}
                width={640}
              >
                <Tbl columns={resultColumns} data={runResults ?? []} rowKey="id" loading={resultsLoading} emptyText="No results" />
              </Drawer>
            </>
          )}
        </>
      )}

      {/* Create Suite Drawer */}
      <Drawer
        open={createSuiteOpen}
        onClose={() => { setCreateSuiteOpen(false); setSuiteErrors({}) }}
        title="New Test Suite"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setCreateSuiteOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={createSuiteMutation.isPending} onClick={submitSuite}>Create</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp label="Suite Name" value={suiteForm.name} onChangeValue={v => setSuiteForm(f => ({ ...f, name: v }))} placeholder="e.g. Payments API Smoke Tests" error={suiteErrors.name} />
          <div className="field">
            <label className="field-label">Description</label>
            <textarea
              rows={2}
              value={suiteForm.description}
              onChange={e => setSuiteForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What does this suite verify?"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </Drawer>

      {/* Add Test Case Drawer */}
      <Drawer
        open={addCaseOpen}
        onClose={() => { setAddCaseOpen(false); setCaseErrors({}) }}
        title="Add Test Case"
        width={560}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Btn variant="secondary" onClick={() => setAddCaseOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={addCaseMutation.isPending} onClick={submitCase}>Add</Btn>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Inp label="Test Name" value={caseForm.name} onChangeValue={v => setCaseForm(f => ({ ...f, name: v }))} placeholder="e.g. POST /payments returns 201" error={caseErrors.name} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Sel
              label="Method"
              value={caseForm.method}
              onChangeValue={v => setCaseForm(f => ({ ...f, method: v }))}
              options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => ({ value: m, label: m }))}
              placeholder="Select method"
              error={caseErrors.method}
            />
            <Inp label="Expected Status" type="number" value={caseForm.expectedStatus} onChangeValue={v => setCaseForm(f => ({ ...f, expectedStatus: v }))} placeholder="200" error={caseErrors.expectedStatus} />
          </div>
          <Inp label="Path" value={caseForm.path} onChangeValue={v => setCaseForm(f => ({ ...f, path: v }))} placeholder="/v1/payments" error={caseErrors.path} />
          <div className="field">
            <label className="field-label">Request Headers (JSON)</label>
            <textarea rows={2} value={caseForm.requestHeaders} onChange={e => setCaseForm(f => ({ ...f, requestHeaders: e.target.value }))} placeholder='{"Content-Type": "application/json"}' style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div className="field">
            <label className="field-label">Request Body (JSON)</label>
            <textarea rows={3} value={caseForm.requestBody} onChange={e => setCaseForm(f => ({ ...f, requestBody: e.target.value }))} placeholder='{"amount": 100}' style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <div className="field">
            <label className="field-label">Assertions (JSON)</label>
            <textarea rows={2} value={caseForm.assertions} onChange={e => setCaseForm(f => ({ ...f, assertions: e.target.value }))} placeholder='{"$.id": "not-null"}' style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--txt-1)', fontSize: 12, fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          <Inp label="Order" type="number" value={caseForm.orderIndex} onChangeValue={v => setCaseForm(f => ({ ...f, orderIndex: v }))} />
        </div>
      </Drawer>
    </div>
  )
}
