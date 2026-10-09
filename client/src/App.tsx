import React, { useState } from 'react';
import { Navbar } from './components/Navigation/Navbar';
import { DataGrid } from './components/Datagrid/DataGrid';
import { SchemaBuilder } from './components/PageBuilder/SchemaBuilder';
import { LayoutRenderer } from './components/PageBuilder/LayoutRenderer';
import { FlowCanvas } from './components/FlowBuilder/FlowCanvas';
import { ReportGrid } from './components/ReportBuilder/ReportGrid';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('data-grid');

  return (
    <div style={{ fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif', minHeight: '100vh', background: '#fafafa' }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        {activeTab === 'data-grid' && <DataGrid />}
        {activeTab === 'schema-builder' && <SchemaBuilder />}
        {activeTab === 'page-builder' && <LayoutRenderer objectId={1} objectApiName="Account" />}
        {activeTab === 'flow-builder' && <FlowCanvas />}
        {activeTab === 'reports' && <ReportGrid />}
      </div>
    </div>
  );
};

export default App;
