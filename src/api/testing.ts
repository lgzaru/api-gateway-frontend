import client from './client'
import type { AxiosResponse } from 'axios'

export type TestRunStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR'

export interface TestSuite {
  id: string
  proxyApiId: string
  name: string
  description: string | null
  createdAt: string
}

export interface TestCase {
  id: string
  suiteId: string
  name: string
  method: string
  path: string
  expectedStatus: number
  orderIndex: number
  createdAt: string
}

export interface TestRun {
  id: string
  suiteId: string
  status: TestRunStatus
  environment: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

export interface TestResult {
  id: string
  runId: string
  testCaseId: string
  passed: boolean
  actualStatus: number
  responseTimeMs: number
  errorMessage: string | null
  createdAt: string
}

export interface TestRunSummary {
  runId: string
  status: TestRunStatus
  total: number
  passed: number
  failed: number
}

export interface PageResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export const listSuites = (apiId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<TestSuite>>> =>
  client.get(`/tag/testing/apis/${apiId}/suites`, { params })

export const createSuite = (apiId: string, data: { name: string; description?: string }): Promise<AxiosResponse<TestSuite>> =>
  client.post(`/tag/testing/apis/${apiId}/suites`, data)

export const deleteSuite = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/testing/suites/${id}`)

export const listCases = (suiteId: string): Promise<AxiosResponse<TestCase[]>> =>
  client.get(`/tag/testing/suites/${suiteId}/cases`)

export const addCase = (suiteId: string, data: {
  name: string
  method: string
  path: string
  requestHeaders?: string
  requestBody?: string
  expectedStatus: number
  assertions?: string
  orderIndex: number
}): Promise<AxiosResponse<TestCase>> =>
  client.post(`/tag/testing/suites/${suiteId}/cases`, data)

export const updateCase = (id: string, data: Partial<{
  name: string; method: string; path: string; expectedStatus: number; orderIndex: number
}>): Promise<AxiosResponse<TestCase>> =>
  client.patch(`/tag/testing/cases/${id}`, data)

export const deleteCase = (id: string): Promise<AxiosResponse<void>> =>
  client.delete(`/tag/testing/cases/${id}`)

export const runSuite = (suiteId: string, environment = 'prod'): Promise<AxiosResponse<TestRunSummary>> =>
  client.post(`/tag/testing/suites/${suiteId}/run`, { environment })

export const listRuns = (suiteId: string, params?: { page?: number; size?: number }): Promise<AxiosResponse<PageResponse<TestRun>>> =>
  client.get(`/tag/testing/suites/${suiteId}/runs`, { params })

export const getRunSummary = (runId: string): Promise<AxiosResponse<TestRunSummary>> =>
  client.get(`/tag/testing/runs/${runId}/summary`)

export const getRunResults = (runId: string): Promise<AxiosResponse<TestResult[]>> =>
  client.get(`/tag/testing/runs/${runId}/results`)
