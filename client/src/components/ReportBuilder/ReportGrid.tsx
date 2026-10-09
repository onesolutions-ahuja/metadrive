import React, { useState } from 'react';
import { api } from '../../services/api';

export const ReportGrid: React.FC = () => {
  const [objectApiName, setObjectApiName] = useState<string>('Account');
  const [groupByField, setGroupByField] = useState<string>('Type');
  const [aggregateField, setAggregateField] = useState<string>('AnnualRevenue');
  const [functionType, setFunctionType] = useState<string>('SUM');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const handleRunReport = async () => {
    setLoading(true);
    try {
      const res = await api.runReport({
        object_api_name: objectApiName,
        group_by_field: groupByField,
        aggregate_field: aggregateField,
        function_type: functionType,
      });
      setResults(res.data);
    } catch (err: any) {
      alert(`Report Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '8px', background: '#fff' }}>
      <h2>Report Builder & Dashboard Analytics</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Object</label>
          <input
            type="text"
            value={objectApiName}
            onChange={(e) => setObjectApiName(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Group By Field</label>
          <input
            type="text"
            value={groupByField}
            onChange={(e) => setGroupByField(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Aggregate Field</label>
          <input
            type="text"
            value={aggregateField}
            onChange={(e) => setAggregateField(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Function</label>
          <select
            value={functionType}
            onChange={(e) => setFunctionType(e.target.value)}
            style={{ width: '100%', padding: '8px', marginTop: '4px' }}
          >
            <option value="COUNT">COUNT</option>
            <option value="SUM">SUM</option>
            <option value="AVG">AVG</option>
            <option value="MAX">MAX</option>
            <option value="MIN">MIN</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleRunReport}
        disabled={loading}
        style={{ padding: '10px 20px', backgroundColor: '#0070d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        {loading ? 'Executing Query...' : 'Run Report'}
      </button>

      {results.length > 0 && (
        <div style={{ marginTop: '25px' }}>
          <h3>Query Results</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
            <thead>
              <tr style={{ background: '#f4f6f9', textAlign: 'left' }}>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Group ({groupByField})</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>Metric ({functionType})</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{row.category || '(Blank)'}</td>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{row.metric}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};