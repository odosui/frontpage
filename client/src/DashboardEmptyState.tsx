type Props = {
  onCreate: (name: string) => void
}

/** The first-run view shown before the reader has created a dashboard. */
const DashboardEmptyState = ({ onCreate }: Props) => {
  const create = () => {
    const name = window.prompt('Name this dashboard:')?.trim()
    if (name) onCreate(name)
  }

  return (
    <div className="arc arc--empty">
      <div className="arc-empty">
        <h1 className="arc-empty-title">No dashboards yet</h1>
        <p className="arc-empty-body">
          A dashboard is one running arc — the stories filed under it, what
          they establish, and what that points to. Name the one you want to
          follow.
        </p>
        <button className="arc-empty-btn" type="button" onClick={create}>
          New dashboard
        </button>
      </div>
    </div>
  )
}

export default DashboardEmptyState
