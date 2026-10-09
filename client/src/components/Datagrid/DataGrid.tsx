import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export const DataGrid: React.FC = () => {
  const [objects, setObjects] = useState<any[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<number | ''>('');
  const [records, setRecords] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [newRecordData, setNewRecordData] = useState<string>('{}');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadObjects();
  }, []);

  useEffect(() => {
    if (selectedObjectId) {
      loadObjectMetadataAndRecords(Number(selectedObjectId));
    } else {
      setRecords([]);
      setFields([]);
    }
  }, [selectedObjectId]);

  const loadObjects = async () => {
    try {
      const res = await api.getObjects();
      setObjects(res.data);
      if (res.data.length > 0) {
        setSelectedObjectId(res.data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load objects:', err.message);
    }
  };

  const loadObjectMetadataAndRecords = async (objectId: number) => {
    setLoading(true);
    try {
      // Fetch fields for this object
      const fieldsRes = await api.getFields(objectId);
      setFields(fieldsRes.data);

      // Fetch records for this object
      const recordsRes = await api.getRecords(objectId);
      setRecords(recordsRes.data);
    } catch (err: any) {
      console.error('Failed to load object data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedObjectId) return;
    try {
      const parsedData = JSON.parse(newRecordData);
      await api.createRecord({
        object_id: Number(selectedObjectId),
        data: parsedData,
      });
      alert('Record created successfully!');
      setNewRecordData('{}');
      loadObjectMetadataAndRecords(Number(selectedObjectId));
    } catch (err: any) {
      alert(`Error creating record (Ensure JSON is valid): ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', border: '1px solid #ccc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>📋 Dynamic Data Grid</h2>
        <div>
          <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Select Object:</label>
          <select
            value={selectedObjectId}
            onChange={(e) => setSelectedObjectId(Number(e.target.value))}
            style={{ padding: '8px', borderRadius: '4px', minWidth: '200px' }}
          >
            {objects.map((obj) => (
              <option key={obj.id} value={obj.id}>
                {obj.label} ({obj.api_name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Record Creation Form */}
      <div style={{ background: '#f4f6f9', padding: '15px', borderRadius: '6px', marginBottom: '25px' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>Add New Record (JSON Format)</h4>
        <form onSubmit={handleCreateRecord} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <textarea
            value={newRecordData}
            onChange={(e) => setNewRecordData(e.target.value)}
            rows={2}
            style={{ flex: 1, padding: '8px', fontFamily: 'monospace', borderRadius: '4px', border: '1px solid #ccc' }}
            placeholder='{"name": "Example Record", "status": "Active"}'
          />
          <button
            type="submit"
            style={{ padding: '10px 20px', background: '#2e844a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', height: 'fit-content' }}
          >
            Insert Record
          </button>
        </form>
      </div>

      {/* Data Table */}
      {loading ? (
        <p>Loading records...</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0070d2', color: '#fff' }}>
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>ID</th>
                {fields.map((field) => (
                  <th key={field.id} style={{ padding: '10px', border: '1px solid #ddd' }}>
                    {field.label} ({field.api_name})
                  </th>
                ))}
                <th style={{ padding: '10px', border: '1px solid #ddd' }}>Created At</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={fields.length + 2} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    No records found for this object.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{record.id}</td>
                    {fields.map((field) => (
                      <td key={field.id} style={{ padding: '10px', border: '1px solid #ddd' }}>
                        {record.data?.[field.api_name] !== undefined ? String(record.data[field.api_name]) : ''}
                      </td>
                    ))}
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                      {new Date(record.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};