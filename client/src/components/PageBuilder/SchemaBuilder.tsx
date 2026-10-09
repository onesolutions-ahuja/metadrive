import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';

export const SchemaBuilder: React.FC = () => {
  const [objects, setObjects] = useState<any[]>([]);
  const [newObject, setNewObject] = useState({ api_name: '', label: '', plural_label: '' });
  const [selectedObjectId, setSelectedObjectId] = useState<number | ''>('');
  const [newField, setNewField] = useState({ api_name: '', label: '', field_type: 'Text', is_required: false });

  useEffect(() => {
    loadObjects();
  }, []);

  const loadObjects = async () => {
    try {
      const res = await api.getObjects();
      setObjects(res.data);
    } catch (err: any) {
      console.error('Failed to load objects:', err.message);
    }
  };

  const handleCreateObject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createObject(newObject);
      alert('Object created successfully!');
      setNewObject({ api_name: '', label: '', plural_label: '' });
      loadObjects();
    } catch (err: any) {
      alert(`Error creating object: ${err.message}`);
    }
  };

  const handleCreateField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedObjectId) return alert('Select an object first');
    try {
      await api.createField({ ...newField, object_id: Number(selectedObjectId) });
      alert('Field added successfully!');
      setNewField({ api_name: '', label: '', field_type: 'Text', is_required: false });
    } catch (err: any) {
      alert(`Error adding field: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
      {/* Object Creator */}
      <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px', background: '#fff' }}>
        <h3>1. Create Custom Object</h3>
        <form onSubmit={handleCreateObject}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>API Name (e.g., OwlPost)</label>
            <input required value={newObject.api_name} onChange={e => setNewObject({...newObject, api_name: e.target.value})} style={{ width: '100%', padding: '8px' }} />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Label</label>
            <input required value={newObject.label} onChange={e => setNewObject({...newObject, label: e.target.value})} style={{ width: '100%', padding: '8px' }} />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Plural Label</label>
            <input required value={newObject.plural_label} onChange={e => setNewObject({...newObject, plural_label: e.target.value})} style={{ width: '100%', padding: '8px' }} />
          </div>
          <button type="submit" style={{ padding: '10px 15px', background: '#0070d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Create Object</button>
        </form>
      </div>

      {/* Field Creator */}
      <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px', background: '#fff' }}>
        <h3>2. Add Custom Fields</h3>
        <form onSubmit={handleCreateField}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Target Object</label>
            <select required value={selectedObjectId} onChange={e => setSelectedObjectId(Number(e.target.value))} style={{ width: '100%', padding: '8px' }}>
              <option value="">-- Select Object --</option>
              {objects.map(obj => (
                <option key={obj.id} value={obj.id}>{obj.label} ({obj.api_name})</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Field API Name</label>
            <input required value={newField.api_name} onChange={e => setNewField({...newField, api_name: e.target.value})} style={{ width: '100%', padding: '8px' }} />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Field Label</label>
            <input required value={newField.label} onChange={e => setNewField({...newField, label: e.target.value})} style={{ width: '100%', padding: '8px' }} />
          </div>
          <div style={{ marginBottom: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold' }}>Type</label>
              <select value={newField.field_type} onChange={e => setNewField({...newField, field_type: e.target.value})} style={{ width: '100%', padding: '8px' }}>
                <option value="Text">Text</option>
                <option value="Number">Number</option>
                <option value="Date">Date</option>
                <option value="Boolean">Checkbox</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '20px' }}>
              <input type="checkbox" checked={newField.is_required} onChange={e => setNewField({...newField, is_required: e.target.checked})} id="req" />
              <label htmlFor="req" style={{ marginLeft: '8px', fontWeight: 'bold' }}>Required?</label>
            </div>
          </div>
          <button type="submit" style={{ padding: '10px 15px', background: '#2e844a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Add Field</button>
        </form>
      </div>
    </div>
  );
};