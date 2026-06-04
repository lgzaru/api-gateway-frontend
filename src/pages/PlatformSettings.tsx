import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPlatformConfig, updatePlatformConfig } from '../api/platform'
import { Btn, Inp, Alert, Spin, toast } from '../components/ui'
import { Globe, Server, Code2, FlaskConical } from 'lucide-react'

const ENV_CARDS = [
  {
    key:         'prodDomain' as const,
    label:       'Production',
    tier:        'Live',
    icon:        <Server size={18} />,
    placeholder: 'https://api.1010tech.io',
    color:       'var(--red)',
    hex:         '#ef4444',
    description: 'Live environment — changes affect all production traffic immediately.',
  },
  {
    key:         'devDomain' as const,
    label:       'Development',
    tier:        'Internal',
    icon:        <Code2 size={18} />,
    placeholder: 'https://dev.api.1010tech.io',
    color:       'var(--blue)',
    hex:         '#3b82f6',
    description: 'Development / integration environment for internal testing.',
  },
  {
    key:         'sandboxDomain' as const,
    label:       'Sandbox',
    tier:        'External',
    icon:        <FlaskConical size={18} />,
    placeholder: 'https://sandbox.api.1010tech.io',
    color:       'var(--accent)',
    hex:         '#324dff',
    description: 'Public sandbox for partner and third-party integration testing.',
  },
]

function EnvCard({
  env,
  value,
  onChange,
}: {
  env: typeof ENV_CARDS[0]
  value: string
  onChange: (v: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 'var(--r-lg)',
        border: `1px solid ${hovered ? env.hex + '50' : 'var(--border)'}`,
        background: 'var(--surface)',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: hovered
          ? `0 8px 32px ${env.hex}18, 0 0 0 1px ${env.hex}20`
          : 'var(--shadow-sm)',
        transform: hovered ? 'translateY(-2px)' : 'none',
        transition: 'border-color var(--dur-normal) var(--ease-snappy), box-shadow var(--dur-normal) var(--ease-snappy), transform var(--dur-normal) var(--ease-snappy)',
      }}
    >
      {/* Colored top accent */}
      <div style={{
        height: 3,
        background: `linear-gradient(90deg, ${env.hex} 0%, ${env.hex}55 60%, transparent 100%)`,
        opacity: hovered ? 1 : 0.65,
        transition: 'opacity var(--dur-normal)',
      }} />

      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header row: icon container + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: `radial-gradient(circle at 30% 30%, ${env.hex}30, ${env.hex}10)`,
            border: `1px solid ${env.hex}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: env.color,
            boxShadow: hovered ? `0 0 14px ${env.hex}30` : 'none',
            transition: 'box-shadow var(--dur-normal)',
          }}>
            {env.icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt-1)', letterSpacing: '-0.2px', lineHeight: 1 }}>
              {env.label}
            </div>
            <div style={{
              marginTop: 4, display: 'inline-block',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.3px',
              color: env.color,
              background: `${env.hex}15`,
              border: `1px solid ${env.hex}28`,
              borderRadius: 4, padding: '1px 6px',
            }}>
              {env.tier}
            </div>
          </div>
        </div>

        {/* Description */}
        <div style={{ fontSize: 11, color: 'var(--txt-3)', lineHeight: 1.6 }}>
          {env.description}
        </div>

        {/* Input */}
        <Inp
          label="Base URL"
          value={value}
          onChangeValue={onChange}
          placeholder={env.placeholder}
        />
      </div>
    </div>
  )
}

export default function PlatformSettings() {
  const qc = useQueryClient()

  const [form, setForm] = useState({
    prodDomain:    '',
    devDomain:     '',
    sandboxDomain: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['platform-config'],
    queryFn:  () => getPlatformConfig(),
    select:   (r) => r.data,
  })

  useEffect(() => {
    if (data) {
      setForm({
        prodDomain:    data.prodDomain    ?? '',
        devDomain:     data.devDomain     ?? '',
        sandboxDomain: data.sandboxDomain ?? '',
      })
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: updatePlatformConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-config'] })
      toast.success('Platform configuration saved')
      toast.info('Kong routes are being resynced in the background — this may take a few seconds.')
    },
    onError: () => toast.error('Failed to save configuration'),
  })

  if (isLoading) return <Spin />

  return (
    <div style={{ padding: '0 2px', maxWidth: 960 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <Globe size={18} style={{ color: 'var(--txt-2)' }} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt-1)' }}>
            Platform Domain Configuration
          </div>
          <div style={{ fontSize: 12, color: 'var(--txt-3)', marginTop: 2 }}>
            Configure the base URLs used by TAG for each environment. These domains are used when constructing exposed API URLs for proxy registrations.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Alert
          type="info"
          description="Domain changes are applied immediately and will be reflected in all exposed API URL calculations. Ensure the domain resolves correctly before saving."
        />
      </div>

      {/* Environment cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        {ENV_CARDS.map(env => (
          <EnvCard
            key={env.key}
            env={env}
            value={form[env.key]}
            onChange={(v) => setForm(f => ({ ...f, [env.key]: v }))}
          />
        ))}
      </div>

      {/* Save */}
      <div style={{
        display: 'flex', justifyContent: 'flex-end',
        borderTop: '1px solid var(--divider)', paddingTop: 16,
      }}>
        <Btn
          variant="primary"
          loading={saveMutation.isPending}
          onClick={() => saveMutation.mutate(form)}
        >
          Save Configuration
        </Btn>
      </div>
    </div>
  )
}
