import React from 'react';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => {
  const tabs = [
    { id: 'data-grid', label: '📋 Data Grid' },
    { id: 'schema-builder', label: '🛠️ Schema Builder' },
    { id: 'page-builder', label: '📱 Page Builder & Forms' },
    { id: 'flow-builder', label: '⚡ Flow Builder (Temporal)' },
    { id: 'reports', label: '📊 Report & Analytics' },
  ];

  return (
    <div style={{ background: '#001e3c', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', letterSpacing: '0.5px' }}>MetaDrive Core Platform</h2>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? '#0070d2' : 'transparent',
              color: '#fff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};