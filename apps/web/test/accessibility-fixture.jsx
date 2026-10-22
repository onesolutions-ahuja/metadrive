import React from 'react';
import { createRoot } from 'react-dom/client';
import OneButton from '../src/one/OneButton/OneButton.jsx';
import OneInput from '../src/one/OneInput/OneInput.jsx';
import OneOverlay from '../src/one/OneOverlay/OneOverlay.jsx';
import OneMenu from '../src/one/OneMenu/OneMenu.jsx';
import OneTabs from '../src/one/OneTabs/OneTabs.jsx';
import OneSearch from '../src/one/OneSearch/OneSearch.jsx';
import OneTable from '../src/one/OneTable/OneTable.jsx';
import '../src/core/workspace/WorkspaceTheme/design-system.css';
import '../src/one/shared/one.css';

window.React = React;

function AccessibilityFixture() {
  return <main className="one-ui" style={{display:'grid',gap:16,padding:24}}>
    <h1>Component accessibility fixture</h1>
    <OneTable kind="Table" label="Example records" records={[{Id:'record-1',Name:'Example record'}]} columns={[{key:'Name',label:'Name'}]} />
    <OneMenu kind="Menu" label="Actions" options={['First action','Second action','Third action']} />
    <OneTabs kind="Tabs" label="Example sections" tabs="Overview,Details" panels={[{content:'Overview content'},{content:'Details content'}]} />
    <OneSearch kind="Search" label="Contact search" showSuggestions={true} options={['Alice','Alex','Bob']} />
    <OneInput kind="Input" label="Email address" inputType="email" validationMessage="Enter a valid email address" />
    <OneButton kind="Button" label="Save" loading={true} />
    <OneOverlay kind="Overlay" title="Details dialog" openLabel="Open details">
      <p>Dialog content</p>
    </OneOverlay>
  </main>;
}

createRoot(document.getElementById('root')).render(<AccessibilityFixture />);
