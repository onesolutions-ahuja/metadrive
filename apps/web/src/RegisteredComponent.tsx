import * as React from 'react';
import { useMemo, type ReactNode } from 'react';
import type { LibraryComponentMetadata } from './metadata';
import ComponentSandbox from './ComponentSandbox';
import {resolveComponentSettings} from './componentSettingDefinitions';
import {compileComponentModule} from './componentRuntimeModule';

type ComponentBoundaryState = { error?: string };

class ComponentRenderBoundary extends React.Component<{ children: ReactNode }, ComponentBoundaryState> {
  state: ComponentBoundaryState = {};

  static getDerivedStateFromError(error: Error): ComponentBoundaryState {
    return { error: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Registered component render failed', error, info.componentStack);
  }

  render() {
    if (this.state.error) return <div className="registered-component-error" role="alert">Component error: {this.state.error}</div>;
    return this.props.children;
  }
}

function RegisteredComponentBody({ definition, props }: { definition: LibraryComponentMetadata; props: Record<string, unknown> }) {
  const Component = useMemo(() => compileComponentModule(definition.compiledJs, React), [definition.compiledJs]);

  return <div className={`registered-component metadrive-component-${definition.apiName.toLowerCase()}`}>
    {definition.scopedCss && <style>{definition.scopedCss}</style>}
    <Component {...props} />
  </div>;
}

export default function RegisteredComponent({ definition, props }: { definition: LibraryComponentMetadata; props: Record<string, unknown> }) {
  if (definition.status === 'Draft') return <div role="status" className="registered-component-error">Component is a draft. Publish it before use.</div>;
  const effectiveProps = definition.propertyDefinitions?.length ? resolveComponentSettings(definition.propertyDefinitions, props) : props;
  if (definition.trustedBundled !== true) return <ComponentSandbox definition={definition} props={effectiveProps} />;
  return <ComponentRenderBoundary key={`${definition.apiName}-${definition.version}`}>
    <RegisteredComponentBody definition={definition} props={effectiveProps} />
  </ComponentRenderBoundary>;
}
