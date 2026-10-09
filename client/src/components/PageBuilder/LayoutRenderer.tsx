
import React, { useEffect, useState } from 'react';
import { api } from '../../services/api';

type LayoutRendererProps = {
  objectId: number;
  objectApiName: string;
};

type Field = {
  id: number;
  api_name: string;
  label: string;
  field_type: string;
  is_required?: boolean;
};

export const LayoutRenderer: React.FC<LayoutRendererProps> = ({
  objectId,
  objectApiName,
}) => {
  const [fields, setFields] = useState<Field[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError('');

    api.getFields(objectId)
      .then((res) => {
        if (active) setFields(res.data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [objectId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await api.createRecord({
        object_id: objectId,
        data: values,
      });

      setValues({});
      alert('Record created successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading layout...</p>;

  return (
    <form onSubmit={save} style={{ padding: 24, background: '#fff' }}>
      <h2>{objectApiName}</h2>

      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

      {fields.map((field) => (
        <div key={field.id} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>
            {field.label}
          </label>

          {field.field_type === 'Boolean' ? (
            <input
              type="checkbox"
              checked={Boolean(values[field.api_name])}
              onChange={(e) =>
                setValues((previous) => ({
                  ...previous,
                  [field.api_name]: e.target.checked,
                }))
              }
            />
          ) : (
            <input
              type={
                field.field_type === 'Number' ? 'number' :
                field.field_type === 'Date' ? 'date' : 'text'
              }
              required={field.is_required}
              value={String(values[field.api_name] ?? '')}
              onChange={(e) =>
                setValues((previous) => ({
                  ...previous,
                  [field.api_name]:
                    field.field_type === 'Number'
                      ? e.target.value === '' ? null : Number(e.target.value)
                      : e.target.value,
                }))
              }
              style={{ width: '100%', padding: 8 }}
            />
          )}
        </div>
      ))}

      <button type="submit" disabled={saving || fields.length === 0}>
        {saving ? 'Saving...' : 'Save Record'}
      </button>
    </form>
  );
};
