import * as React from 'react';
import { useMemo, type ReactNode } from 'react';
import type { LibraryComponentMetadata } from './metadata';
import ComponentSandbox from './ComponentSandbox';
import {resolveComponentSettings} from './componentSettingDefinitions';
import {compileComponentModule} from './componentRuntimeModule';
import {applyRecordViewAdapter} from './recordViewAdapterRegistry';
import {registeredComponentAppearance, registeredComponentAppearanceClasses} from './registeredComponentAppearance';
import './registeredComponentAppearance.css';
import {validatePrimitiveMetadata, primitiveAccessibilityProps} from './sharedPrimitiveMetadata';

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

// Only server-trusted bundled components reach this cache; untrusted tenant JSX
// continues through its isolated sandbox, never the host compiler.
const trustedModules=new Map<string,ReturnType<typeof compileComponentModule>>();
function resolveTrustedModule(source:string){
 const cached=trustedModules.get(source);
 if(cached)return cached;
 const compiled=compileComponentModule(source,React);
 if(trustedModules.size>=32)trustedModules.delete(trustedModules.keys().next().value!);
 trustedModules.set(source,compiled);
 return compiled;
}
function RegisteredComponentBody({ definition, props, appearanceProps, layoutTransparent=false }: { definition: LibraryComponentMetadata; props: Record<string, unknown>; appearanceProps: Record<string, unknown>; layoutTransparent?:boolean }) {
  const Component = useMemo(() => resolveTrustedModule(definition.compiledJs), [definition.compiledJs]);

  const appearanceStyle = registeredComponentAppearance(appearanceProps);
  const appearanceClass = registeredComponentAppearanceClasses(appearanceProps);
  return <div className={`registered-component metadrive-component-${definition.apiName.toLowerCase()} ${appearanceClass}`}
    style={layoutTransparent?{...appearanceStyle,display:'contents'}:appearanceStyle}>
    {definition.scopedCss && <style>{definition.scopedCss}</style>}
    <Component {...props} />
  </div>;
}

export default function RegisteredComponent({ definition, props, layoutTransparent=false }: { definition: LibraryComponentMetadata; props: Record<string, unknown>; layoutTransparent?:boolean }) {
  if (definition.status === 'Draft') return <div role="status" className="registered-component-error">Component is a draft. Publish it before use.</div>;
  const configuredProps = definition.propertyDefinitions?.length ? resolveComponentSettings(definition.propertyDefinitions, props) : props;
  const effectiveProps = applyRecordViewAdapter(configuredProps);
  const primitive = definition.primitiveMetadata;
  const primitiveCheck = primitive ? validatePrimitiveMetadata(primitive) : null;
  if (primitiveCheck && !primitiveCheck.valid) return <div className="registered-component-error" role="alert">Invalid primitive metadata: {primitiveCheck.errors.join('; ')}</div>;
  const accessibility = primitive ? primitiveAccessibilityProps(primitive) : {};
  if (definition.trustedBundled !== true) return <div {...accessibility}
    style={effectiveProps.fillRegion === true ? {height:'100%',minHeight:0,minWidth:0} : undefined}>
    <ComponentSandbox definition={definition} props={effectiveProps} />
  </div>;
  return <div {...accessibility} style={layoutTransparent?{display:'contents'}:undefined}><ComponentRenderBoundary key={`${definition.apiName}-${definition.version}`}>
    <RegisteredComponentBody definition={definition} props={effectiveProps} appearanceProps={props} layoutTransparent={layoutTransparent} />
  </ComponentRenderBoundary></div>;
}
