import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FlowExecutionLogMetadata } from './metadata';

type FlowLogsProps = {
  logs: FlowExecutionLogMetadata[];
  loading: boolean;
  onOpenFlow: (apiName: string) => void;
};

function formatFailedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function FlowLogs({ logs, loading, onOpenFlow }: FlowLogsProps) {
  const [search, setSearch] = useState('');
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return logs.filter((log) => !query || `${log.flowLabel} ${log.flowApiName} ${log.trigger} ${log.error}`.toLocaleLowerCase().includes(query));
  }, [logs, search]);

  return (
    <div className="flow-logs-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SETUP / AUTOMATION</div>
          <h1>Failed Flow Logs</h1>
          <p>Review flow executions that ended with an error.</p>
        </div>
      </div>
      <section className="surface flow-logs-surface">
        <div className="list-view-header">
          <div>
            <div className="list-view-label">FLOW EXECUTION HISTORY</div>
            <h2>Failed Executions</h2>
            <span>{loading ? 'Loading flow logs…' : `${filteredLogs.length} failed ${filteredLogs.length === 1 ? 'execution' : 'executions'}`}</span>
          </div>
          <label className="scheduled-flows-search">
            <Search size={14} />
            <input
              aria-label="Search failed flow logs"
              placeholder="Search failed flow logs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table className="slds-table flow-logs-table">
            <thead>
              <tr>
                <th scope="col">Flow</th>
                <th scope="col">Trigger</th>
                <th scope="col">Failed At</th>
                <th scope="col">Error</th>
                <th scope="col">User ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <button className="flow-log-link" type="button" onClick={() => onOpenFlow(log.flowApiName)}>
                      {log.flowLabel}
                    </button>
                    <div className="api-name">{log.flowApiName}</div>
                  </td>
                  <td>{log.trigger}</td>
                  <td>{formatFailedAt(log.failedAt)}</td>
                  <td className="flow-log-error">{log.error}</td>
                  <td>{log.userId ?? 'System'}</td>
                </tr>
              ))}
              {!loading && filteredLogs.length === 0 && (
                <tr>
                  <td className="scheduled-flows-empty" colSpan={5}>
                    {search ? 'No failed executions match your search.' : 'No failed flow executions have been logged.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
