import * as React from 'react';
import { useMemo, type ReactNode } from 'react';
import type { LibraryComponentMetadata } from './metadata';

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
  const Component = useMemo(() => {
    const module: { exports: { default?: React.ComponentType<Record<string, unknown>> } } = { exports: {} };
    const execute = new Function('React', 'module', 'exports', definition.compiledJs) as (
      react: typeof React,
      componentModule: typeof module,
      componentExports: typeof module.exports
    ) => void;
    execute(React, module, module.exports);
    if (typeof module.exports.default !== 'function') throw new Error('The registered default export is not a React component');
    return module.exports.default;
  }, [definition.compiledJs]);

  return <div className={`registered-component metadrive-component-${definition.apiName.toLowerCase()}`}>
    {definition.scopedCss && <style>{definition.scopedCss}</style>}
    <Component {...props} />
  </div>;
}

export default function RegisteredComponent({ definition, props }: { definition: LibraryComponentMetadata; props: Record<string, unknown> }) {
  return <ComponentRenderBoundary key={`${definition.apiName}-${definition.version}`}>
    <RegisteredComponentBody definition={definition} props={props} />
  </ComponentRenderBoundary>;
}
