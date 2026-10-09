import { RefreshCw, XCircle } from 'lucide-react';
import type { FlowInterviewMetadata } from './metadata';

type FlowInterviewsProps = {
  interviews: FlowInterviewMetadata[];
  loading: boolean;
  canManage: boolean;
  onRefresh: () => void;
  onCancel: (interview: FlowInterviewMetadata) => void;
  onOpenFlow: (apiName: string) => void;
};

function interviewState(interview: FlowInterviewMetadata): string {
  if (interview.kind === 'screen') return `Paused on ${interview.screenLabel ?? 'Screen'}`;
  if (interview.kind === 'scheduled') return 'Scheduled path';
  return interview.retryAt ? 'Waiting to retry' : 'Waiting';
}

export default function FlowInterviews({
  interviews, loading, canManage, onRefresh, onCancel, onOpenFlow
}: FlowInterviewsProps) {
  return (
    <div className="workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SETUP / AUTOMATION</div>
          <h1>Paused and Waiting Interviews</h1>
          <p>Inspect active Screen Flow interviews, waits, and scheduled paths. Cancel an interview to prevent it from resuming.</p>
        </div>
        <button className="btn" type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />Refresh
        </button>
      </div>
      {!canManage && <div className="info-callout">You need metadata write or Flow management permission to cancel interviews.</div>}
      <section className="surface">
        <div className="list-view-header">
          <div>
            <div className="list-view-label">ACTIVE INTERVIEWS</div>
            <h2>Pending Work</h2>
            <span>{loading ? 'Loading interviews…' : `${interviews.length} pending ${interviews.length === 1 ? 'interview' : 'interviews'}`}</span>
          </div>
        </div>
        {loading ? <div className="records-loading">Loading Flow interviews…</div>
          : interviews.length === 0 ? <div className="records-empty">There are no paused or waiting Flow interviews.</div>
            : <div className="records-table-wrap"><table className="records-table">
                <thead><tr><th>Flow</th><th>State</th><th>Running User</th><th>Record</th><th>Created</th><th>Resume / Expiry</th><th>Attempts</th><th>Actions</th></tr></thead>
                <tbody>{interviews.map((interview) => <tr key={interview.id}>
                  <td><button className="text-action" type="button" onClick={() => onOpenFlow(interview.flowApiName)}>{interview.flowLabel}</button><small>Version {interview.versionNumber}</small></td>
                  <td>{interviewState(interview)}</td>
                  <td>{interview.userName}</td>
                  <td>{interview.recordId ?? '—'}</td>
                  <td>{new Date(interview.createdAt).toLocaleString()}</td>
                  <td>{interview.waitUntil ? new Date(interview.waitUntil).toLocaleString()
                    : interview.retryAt ? `Retry ${new Date(interview.retryAt).toLocaleString()}`
                      : new Date(interview.expiresAt).toLocaleString()}</td>
                  <td>{interview.attempts}</td>
                  <td><button className="btn btn-danger" type="button" disabled={!canManage} onClick={() => onCancel(interview)}>
                    <XCircle size={14} />Cancel
                  </button></td>
                </tr>)}</tbody>
              </table></div>}
      </section>
    </div>
  );
}
