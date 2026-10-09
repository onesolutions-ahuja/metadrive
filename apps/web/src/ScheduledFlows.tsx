import { Pencil, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FlowDefinitionMetadata, ObjectMetadata } from './metadata';

type ScheduledFlowsProps = {
  flows: FlowDefinitionMetadata[];
  objects: ObjectMetadata[];
  loading: boolean;
  onEdit: (apiName: string) => void;
};

function configText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export default function ScheduledFlows({ flows, objects, loading, onEdit }: ScheduledFlowsProps) {
  const [search, setSearch] = useState('');
  const scheduledFlows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return flows
      .filter((flow) => flow.flowType === 'Schedule-Triggered Flow')
      .filter((flow) => !query || `${flow.label} ${flow.apiName} ${flow.triggerObject ?? ''}`.toLocaleLowerCase().includes(query));
  }, [flows, search]);

  return (
    <div className="scheduled-flows-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SETUP / AUTOMATION</div>
          <h1>Scheduled Flows</h1>
          <p>Review and edit flows that run on a schedule.</p>
        </div>
      </div>
      <section className="surface scheduled-flows-surface">
        <div className="list-view-header">
          <div>
            <div className="list-view-label">FLOW DEFINITIONS</div>
            <h2>All Scheduled Flows</h2>
            <span>{loading ? 'Loading saved flows…' : `${scheduledFlows.length} scheduled ${scheduledFlows.length === 1 ? 'flow' : 'flows'}`}</span>
          </div>
          <label className="scheduled-flows-search">
            <Search size={14} />
            <input
              aria-label="Search scheduled flows"
              placeholder="Search scheduled flows"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table className="slds-table scheduled-flows-table">
            <thead>
              <tr>
                <th scope="col">Flow Label</th>
                <th scope="col">API Name</th>
                <th scope="col">Object</th>
                <th scope="col">Start Date &amp; Time</th>
                <th scope="col">Frequency</th>
                <th scope="col">Status</th>
                <th scope="col" aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {scheduledFlows.map((flow) => {
                const objectLabel = objects.find((object) => object.apiName === flow.triggerObject)?.label ?? flow.triggerObject ?? '—';
                const date = configText(flow.startConfig.startDate);
                const time = configText(flow.startConfig.startTime);
                return (
                  <tr key={flow.apiName}>
                    <td><strong>{flow.label}</strong></td>
                    <td><span className="api-name">{flow.apiName}</span></td>
                    <td>{objectLabel}</td>
                    <td>{[date, time].filter(Boolean).join(' · ') || 'Not configured'}</td>
                    <td>{configText(flow.startConfig.frequency) || 'Not configured'}</td>
                    <td>{flow.status}</td>
                    <td>
                      <button
                        className="row-menu"
                        type="button"
                        aria-label={`Edit ${flow.label}`}
                        title={`Edit ${flow.label}`}
                        onClick={() => onEdit(flow.apiName)}
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!loading && scheduledFlows.length === 0 && (
                <tr>
                  <td className="scheduled-flows-empty" colSpan={7}>
                    {search ? 'No scheduled flows match your search.' : 'No scheduled flows yet. Create a Schedule-Triggered Flow in Flow Builder to see it here.'}
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
