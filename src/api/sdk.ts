import client from './client'

export function getPostmanCollection(partnerId: string) {
  return client.get<string>(`/tag/partners/${partnerId}/sdk/postman`, {
    responseType: 'text',
  })
}

export function getOpenApiSpec(partnerId: string) {
  return client.get<string>(`/tag/partners/${partnerId}/sdk/openapi`, {
    responseType: 'text',
  })
}

export function getCodeSnippet(partnerId: string, language: 'curl' | 'python' | 'javascript' | 'java') {
  return client.get<string>(`/tag/partners/${partnerId}/sdk/snippets/${language}`, {
    responseType: 'text',
  })
}

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
