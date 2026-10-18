import * as React from 'react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LibraryComponentMetadata } from '../../metadata/Definitions/metadata';
import ComponentSandbox from '../ComponentSandbox/ComponentSandbox';
import {resolveComponentSettings} from '../Properties/componentSettingDefinitions';
import {compileComponentModule} from './componentRuntimeModule';
import {applyRecordViewAdapter} from '../../records/RecordWorkspace/recordViewAdapterRegistry';
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
  const [asset, setAsset] = useState<{apiName:string;version:number;compiledJs:string;scopedCss:string}|null>(null);
  const [assetError, setAssetError] = useState('');
  useEffect(() => {
    if (!definition.trustedBundled || definition.compiledJs) { setAsset(null); setAssetError(''); return; }
    const controller = new AbortController();
    setAsset(null);
    setAssetError('');
    void fetch(`${import.meta.env.BASE_URL}component-library/components/${encodeURIComponent(definition.apiName)}.json`,
      { signal:controller.signal, cache:'no-cache' })
      .then(async response => {
        if (!response.ok) throw Error('Bundled renderer is unavailable');
        return response.json();
      })
      .then((value:unknown) => {
        if (!value || typeof value!=='object') throw Error('Invalid bundled renderer');
        const entry=value as Record<string,unknown>;
        if (entry.apiName!==definition.apiName || entry.version!==definition.version ||
          typeof entry.compiledJs!=='string'||!entry.compiledJs||
          typeof entry.scopedCss!=='string')
          throw Error('Bundled renderer revision mismatch');
        if (!controller.signal.aborted) setAsset(entry as {apiName:string;version:number;compiledJs:string;scopedCss:string});
      }).catch((error:unknown)=>{
        if (!controller.signal.aborted) setAssetError(error instanceof Error?error.message:'Renderer load failed');
      });
    return () => controller.abort();
  }, [definition.apiName,definition.version,definition.trustedBundled,definition.compiledJs]);
  if (definition.status === 'Draft') return <div role="status" className="registered-component-error">Component is a draft. Publish it before use.</div>;
  if (definition.trustedBundled && !definition.compiledJs && assetError)
    return <div role="alert" className="registered-component-error">{assetError}</div>;
  if (definition.trustedBundled && !definition.compiledJs && (!asset || asset.apiName!==definition.apiName || asset.version!==definition.version))
    return <div role="status">Loading component…</div>;
  const hydratedDefinition = definition.compiledJs ? definition : {...definition,
    compiledJs:asset!.compiledJs,scopedCss:asset!.scopedCss};
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
    <RegisteredComponentBody definition={hydratedDefinition} props={effectiveProps} appearanceProps={props} layoutTransparent={layoutTransparent} />
  </ComponentRenderBoundary></div>;
}
