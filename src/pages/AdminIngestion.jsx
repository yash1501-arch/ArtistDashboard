import { useState, useRef } from 'react'
import { Upload, RefreshCw, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../components/ui/PageHeader'
import client from '../api/client'

const PLATFORMS = [
  { key: 'instagram',  label: 'Instagram',   color: '#E1306C' },
  { key: 'youtube',    label: 'YouTube',     color: '#FF0000' },
  { key: 'spotify',    label: 'Spotify',     color: '#1DB954' },
  { key: 'facebook',   label: 'Facebook',    color: '#1877F2' },
  { key: 'twitter',    label: 'Twitter / X', color: '#000000' },
]

const STATUS_META = {
  SUCCESS: { icon: CheckCircle, color: 'var(--accent-green)', bg: 'rgba(16,185,129,0.12)',  label: 'Success' },
  FAILED:  { icon: XCircle,     color: 'var(--accent-red)',   bg: 'rgba(239,68,68,0.12)',   label: 'Failed'  },
  RUNNING: { icon: RefreshCw,   color: 'var(--accent-indigo)',bg: 'rgba(99,102,241,0.12)', label: 'Running' },
  PENDING: { icon: Clock,       color: 'var(--accent-gold)',  bg: 'rgba(245,158,11,0.12)', label: 'Pending' },
}

function AdminIngestion() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver]     = useState(false)
  const [uploadedFile, setFile]     = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const fileRef = useRef()

  // Fetch jobs
  const { data: jobsData } = useQuery({
    queryKey: ['ingestionJobs'],
    queryFn: async () => {
      const response = await client.get('/ingestion/jobs')
      return response.data.data.jobs
    },
    refetchInterval: 5000, // Poll every 5s while on this page
  })

  const jobs = jobsData || []

  // Sync platform mutation
  const syncMutation = useMutation({
    mutationFn: (platform) => client.post(`/ingestion/sync/${platform}`),
    onSuccess: () => queryClient.invalidateQueries(['ingestionJobs'])
  })

  // Excel upload mutation
  const uploadMutation = useMutation({
    mutationFn: (formData) => client.post('/ingestion/excel/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
    onSuccess: () => {
      setUploading(false)
      setUploadDone(true)
      queryClient.invalidateQueries(['ingestionJobs'])
      setTimeout(() => { setFile(null); setUploadDone(false) }, 3000)
    },
    onError: () => setUploading(false)
  })

  function handleSync(platform) {
    syncMutation.mutate(platform.key)
  }

  function handleFileDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0] || e.target.files?.[0]
    if (file) setFile(file)
  }

  function handleUpload() {
    if (!uploadedFile) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', uploadedFile)
    uploadMutation.mutate(formData)
  }

  return (
    <div>
      <PageHeader title="Data Ingestion" subtitle="Sync platform data and upload Excel files" />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">

        {/* Upload */}
        <div className="glass-card p-5 animate-fade-up">
          <h3 className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Excel Data Upload</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Upload .xlsx files for artist metrics, concerts or demographics</p>

          <div onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleFileDrop}
            onClick={() => fileRef.current.click()}
            className="rounded-2xl p-10 text-center cursor-pointer transition-all duration-200"
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent-indigo)' : uploadedFile ? 'var(--accent-green)' : 'var(--border-strong)'}`,
              background: dragOver ? 'rgba(99,102,241,0.05)' : uploadedFile ? 'rgba(16,185,129,0.05)' : 'var(--bg-secondary)'
            }}>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileDrop} />
            {uploadDone ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={32} style={{ color: 'var(--accent-green)' }} />
                <p className="text-sm font-bold" style={{ color: 'var(--accent-green)' }}>Upload Successful!</p>
              </div>
            ) : uploadedFile ? (
              <div className="flex flex-col items-center gap-2">
                <CheckCircle size={28} style={{ color: 'var(--accent-green)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{uploadedFile.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(uploadedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={28} style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Drop your Excel file here</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>or click to browse · .xlsx .xls .csv</p>
              </div>
            )}
          </div>

          {uploadedFile && !uploadDone && (
            <button onClick={handleUpload} disabled={uploading}
              className="w-full mt-3 py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #6366F1, #818CF8)', color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.3)' }}>
              {uploading ? <><RefreshCw size={14} className="animate-spin" /> Processing...</> : <><Upload size={14} /> Upload & Import</>}
            </button>
          )}

          <div className="mt-4 p-3 rounded-xl flex items-start gap-2"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <AlertCircle size={13} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-indigo)' }} />
            <p className="text-xs" style={{ color: 'var(--accent-indigo)' }}>
              Use the provided template. Sheets: <strong>Artist_Metrics</strong>, <strong>Concerts</strong>
            </p>
          </div>
        </div>

        {/* Platform Sync */}
        <div className="glass-card p-5 animate-fade-up delay-1">
          <h3 className="font-display font-semibold text-sm mb-1" style={{ color: 'var(--text-primary)' }}>Platform API Sync</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Manually trigger a data sync for any connected platform</p>
          <div className="space-y-3">
            {PLATFORMS.map(platform => (
              <div key={platform.key} className="flex items-center justify-between p-3 rounded-xl transition-all duration-200"
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                    style={{ background: platform.color }}>
                    {platform.label[0]}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{platform.label}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Last sync: Today 04:00</p>
                  </div>
                </div>
                <button onClick={() => handleSync(platform)} disabled={syncMutation.isPending}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all duration-200 disabled:opacity-60"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-indigo)'; e.currentTarget.style.color = 'var(--accent-indigo)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}>
                  <RefreshCw size={12} className={syncMutation.isPending ? 'animate-spin' : ''} />
                  {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Job Log */}
      <div className="glass-card overflow-hidden animate-fade-up delay-2">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Ingestion Job Log</h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Recent sync and import activity</p>
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
            <tr>
              {['Job', 'Status', 'Rows', 'Duration', 'Time'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const meta = STATUS_META[job.status] || STATUS_META.PENDING
              const Icon = meta.icon
              return (
                <tr key={job.id} style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td className="px-4 py-3 font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                    {job.jobType === 'EXCEL_IMPORT' ? `Excel: ${job.fileName}` : `${job.fileName} Sync`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: meta.bg, color: meta.color }}>
                      <Icon size={10} className={job.status === 'RUNNING' ? 'animate-spin' : ''} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {job.rowCount > 0 ? `${job.rowCount} rows` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    {job.duration ? `${job.duration}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(job.startedAt).toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default AdminIngestion