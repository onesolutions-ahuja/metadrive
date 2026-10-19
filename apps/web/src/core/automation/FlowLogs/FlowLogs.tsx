import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FlowExecutionLogMetadata } from '../../metadata/Definitions/metadata';

type FlowLogsProps = {
  logs: FlowExecutionLogMetadata[];
  loading: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onOpenFlow: (apiName: string) => void;
};

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function FlowLogs({ logs, loading, loadingMore, hasMore, onLoadMore, onOpenFlow }: FlowLogsProps) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return logs.filter(log => {
      const actualStatus = log.status ?? 'failed';
      return (status === 'all' || status === actualStatus) &&
        (!query || (log.flowLabel + ' ' + log.flowApiName + ' ' + actualStatus + ' ' + (log.error ?? ''))
          .toLocaleLowerCase().includes(query));
    });
  }, [logs, search, status]);

  return (
    <div className="flow-logs-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SETUP / AUTOMATION</div>
          <h1>Flow Execution History</h1>
          <p>Review completed, failed, waiting, pending and cancelled SQL Flow runs. Read-only telemetry; debug traces are not persisted.</p>
        </div>
      </div>
      <section className="surface flow-logs-surface">
        <div className="list-view-header">
          <div>
            <div className="list-view-label">FLOW RUNS</div>
            <h2>Execution History</h2>
            <span>{loading ? 'Loading Flow history…' : filteredLogs.length + ' visible executions'}</span>
          </div>
          <label className="scheduled-flows-search">
            <Search size={14} />
            <input aria-label="Search Flow history" placeholder="Search executions"
              value={search} onChange={event => setSearch(event.target.value)} />
          </label>
          <label className="form-label">Status
            <select aria-label="Filter Flow status" className="form-control" value={status}
              onChange={event => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="waiting">Waiting</option>
              <option value="pending">Pending</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="slds-table flow-logs-table">
            <thead>
              <tr>
                <th scope="col">Flow</th>
                <th scope="col">Status</th>
                <th scope="col">Type / Version</th>
                <th scope="col">Started</th>
                <th scope="col">Finished</th>
                <th scope="col">Duration</th>
                <th scope="col">Error</th>
                <th scope="col">User ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id}>
                  <td>
                    <button className="flow-log-link" type="button" onClick={() => onOpenFlow(log.flowApiName)}>
                      {log.flowLabel}
                    </button>
                    <div className="api-name">{log.flowApiName}</div>
                  </td>
                  <td>{log.status ?? 'failed'}</td>
                  <td>{log.flowType ?? log.trigger}{log.versionNumber ? ' · v' + log.versionNumber : ''}</td>
                  <td>{formatTime(log.startedAt ?? log.failedAt)}</td>
                  <td>{formatTime(log.finishedAt ?? (log.status ? null : log.failedAt))}</td>
                  <td>{log.durationMs == null ? '—' : (log.durationMs / 1000).toFixed(2) + ' s'}</td>
                  <td className="flow-log-error">{log.error ?? '—'}</td>
                  <td>{log.userId ?? 'System'}</td>
                </tr>
              ))}
              {!loading && filteredLogs.length === 0 && (
                <tr><td className="scheduled-flows-empty" colSpan={8}>
                  {search || status !== 'all' ? 'No matching executions in the loaded history.' : 'No Flow executions have been logged.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore && <button type="button" className="btn" onClick={onLoadMore}
          disabled={loading || loadingMore}>{loadingMore ? 'Loading…' : 'Load more runs'}</button>}
      </section>
    </div>
  );
}
