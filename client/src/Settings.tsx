import { useEffect, useState } from 'react'
import api, { type DatabaseStats, type ServerStats } from './api'
import RefreshIcon from './icons/RefreshIcon'

const Settings: React.FC = () => {
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    setLoading(true)
    api
      .getDatabaseStats()
      .then((data: { stats: DatabaseStats }) => {
        setStats(data.stats)
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  return (
    <div className="settings">
      <div className="settings-head">
        <h1 className="settings-title">Settings</h1>
      </div>

      <section className="settings-section">
        <header className="settings-section-head">
          <h2 className="settings-section-title">Server</h2>
          {stats && (
            <span className="settings-muted">{stats.database.name}</span>
          )}
        </header>
        {stats ? (
          <ServerBody stats={stats.server} />
        ) : (
          <p className="settings-muted">{error ? '' : 'Loading…'}</p>
        )}
      </section>

      <section className="settings-section">
        <header className="settings-section-head">
          <h2 className="settings-section-title">Database</h2>
          <button
            className={`settings-reload${loading ? ' is-refreshing' : ''}`}
            onClick={load}
            disabled={loading}
          >
            <RefreshIcon />
            Reload
          </button>
        </header>

        {error && <p className="settings-error">{error}</p>}
        {!stats ? (
          <p className="settings-muted">{error ? '' : 'Loading…'}</p>
        ) : (
          <StatsBody stats={stats} />
        )}
      </section>
    </div>
  )
}

const ServerBody: React.FC<{ stats: ServerStats }> = ({ stats }) => {
  const { postgres: pg, node, pool } = stats
  const s = pg.settings

  return (
    <div className="stat-grid">
      <Stat
        label="Postgres"
        value={pg.version.split(' ')[0] ?? pg.version}
        hint={pg.startedAt ? `up ${since(pg.startedAt)}` : undefined}
      />
      <Stat
        label="Connections"
        value={`${num(pg.connections.total)} / ${num(pg.connections.max)}`}
        hint={`${num(pg.connections.active)} active · ${num(
          pg.connections.idle,
        )} idle`}
      />
      <Stat
        label="Cache hit ratio"
        value={
          pg.cacheHitRatio === null
            ? '—'
            : `${(pg.cacheHitRatio * 100).toFixed(2)}%`
        }
        hint={pg.statsResetAt ? `since ${ago(pg.statsResetAt)}` : undefined}
      />
      <Stat
        label="Shared buffers"
        value={s.shared_buffers ?? '—'}
        hint={hints([
          s.effective_cache_size && `cache est. ${s.effective_cache_size}`,
          s.work_mem && `work_mem ${s.work_mem}`,
        ])}
      />
      <Stat
        label="Transactions"
        value={num(pg.commits)}
        hint={`${num(pg.rollbacks)} rolled back · ${num(
          pg.deadlocks,
        )} deadlocks · ${bytes(pg.tempBytes)} temp`}
      />
      <Stat
        label="Connection pool"
        value={`${num(pool.total)} / ${num(pool.max)}`}
        hint={`${num(pool.idle)} idle · ${num(pool.waiting)} waiting`}
      />
      <Stat label="Node" value={node.version} hint={node.platform} />
      <Stat
        label="API memory"
        value={bytes(node.rssBytes)}
        hint={`heap ${bytes(node.heapUsedBytes)} of ${bytes(
          node.heapTotalBytes,
        )}`}
      />
      <Stat
        label="API uptime"
        value={duration(node.uptimeSec)}
        hint="this api process"
      />
    </div>
  )
}

const StatsBody: React.FC<{ stats: DatabaseStats }> = ({ stats }) => {
  const { content, jobs, snapshots, tables, database } = stats
  const jobsTotal = Object.values(jobs.byStatus).reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="stat-grid">
        <Stat label="Total size" value={bytes(database.bytes)} hint={database.name} />
        <Stat label="Dashboards" value={num(content.dashboards)} />
        <Stat
          label="Widgets"
          value={num(content.widgets)}
          hint={hints([
            content.widgetsWithoutUrl > 0 &&
              `${content.widgetsWithoutUrl} without a url`,
            content.widgetsNeverFetched > 0 &&
              `${content.widgetsNeverFetched} never fetched`,
          ])}
        />
        <Stat
          label="Articles"
          value={num(content.articles)}
          hint={`${num(content.newArticles)} unseen`}
        />
        <Stat
          label="Page snapshots"
          value={num(snapshots.count)}
          hint={`${bytes(snapshots.bytes)} of html${
            snapshots.oldestAt ? `, oldest ${ago(snapshots.oldestAt)}` : ''
          }`}
        />
        <Stat
          label="Jobs"
          value={num(jobsTotal)}
          hint={
            jobs.oldestQueuedAt
              ? `oldest queued ${ago(jobs.oldestQueuedAt)}`
              : 'nothing waiting'
          }
        />
        <Stat
          label="Jobs · last 24h"
          value={num(jobs.last24h.total)}
          hint={`${num(jobs.last24h.succeeded)} ok · ${num(
            jobs.last24h.failed,
          )} failed`}
        />
        <Stat
          label="Avg job time"
          value={
            jobs.avgDurationSec === null
              ? '—'
              : `${jobs.avgDurationSec.toFixed(1)}s`
          }
          hint="succeeded, last 24h"
        />
        <Stat
          label="Newest article"
          value={content.newestArticleAt ? ago(content.newestArticleAt) : '—'}
          hint={
            content.oldestArticleAt
              ? `oldest ${ago(content.oldestArticleAt)}`
              : undefined
          }
        />
      </div>

      <h3 className="settings-subtitle">Tables</h3>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Table</th>
            <th className="num">Rows</th>
            <th className="num">Size</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => (
            <tr key={t.name}>
              <td>{t.name}</td>
              <td className="num">{num(t.rows)}</td>
              <td className="num">{bytes(t.bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="settings-subtitle">Per dashboard</h3>
      <table className="settings-table">
        <thead>
          <tr>
            <th>Dashboard</th>
            <th className="num">Widgets</th>
            <th className="num">Articles</th>
            <th className="num">Last fetch</th>
          </tr>
        </thead>
        <tbody>
          {stats.dashboards.map((d) => (
            <tr key={d.id}>
              <td>{d.id}</td>
              <td className="num">{num(d.widgets)}</td>
              <td className="num">{num(d.articles)}</td>
              <td className="num">
                {d.lastFetchedAt ? ago(d.lastFetchedAt) : 'never'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="stat-card">
    <span className="stat-label">{label}</span>
    <span className="stat-value">{value}</span>
    {hint && <span className="stat-hint">{hint}</span>}
  </div>
)

function hints(parts: (string | false)[]): string | undefined {
  const kept = parts.filter(Boolean) as string[]
  return kept.length > 0 ? kept.join(' · ') : undefined
}

function num(value: number): string {
  return value.toLocaleString()
}

function bytes(value: number): string {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  const scaled = value / 1024 ** exp
  return `${scaled >= 10 || exp === 0 ? Math.round(scaled) : scaled.toFixed(1)} ${units[exp]}`
}

/** "3d 4h" — coarse on purpose, these are uptimes not timings. */
function duration(secs: number): string {
  if (secs < 60) return `${Math.round(secs)}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ${mins % 60}m`
  return `${Math.floor(hours / 24)}d ${hours % 24}h`
}

function since(date: string): string {
  return duration(Math.max(0, (Date.now() - new Date(date).getTime()) / 1000))
}

function ago(date: string): string {
  const secs = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return `${Math.round(secs)}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export default Settings
