import type { ReactNode } from 'react';
import { Grid2X2 } from 'lucide-react';

type TemplatePageRuntimeLayoutProps = {
  apiName: string;
  label: string;
  pageType: string;
  template?: string;
  fullscreen: boolean;
  phone: boolean;
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
};

/** Shared, metadata-selected runtime layout. No app-specific paths or names. */
export default function TemplatePageRuntimeLayout({
  apiName, label, pageType, template, fullscreen, phone, header, main, sidebar
}: TemplatePageRuntimeLayoutProps) {
  const hasSidebar = template === 'main-sidebar' || template === 'header-main-sidebar';
  return <div className="records-page lightning-app-page" data-lightning-page={apiName}
    data-standalone-presentation={fullscreen ? 'true' : undefined}
    style={fullscreen ? { width:'100%', maxWidth:'none', height:'100dvh', minHeight:0,
      padding:0, margin:0, display:'flex', flexDirection:'column', overflow:'hidden',
      background:'#f7f7f7' } : undefined}>
    {!fullscreen && <div className="record-detail-heading surface">
      <div className="record-object-icon"><Grid2X2 size={18}/></div>
      <div><div className="eyebrow">{pageType}</div><h1>{label}</h1></div>
    </div>}
    {header}
    <div className={hasSidebar ? 'record-runtime-layout has-sidebar' : 'record-runtime-layout'}
      style={fullscreen ? {flex:1,minHeight:0,minWidth:0,display:'grid',
        gridTemplateColumns:hasSidebar && !phone ? 'minmax(0,1fr) minmax(300px,30%)' : 'minmax(0,1fr)',
        gap:0,margin:0,padding:0,width:'100%',overflow:'hidden'} : undefined}>
      <main className="record-runtime-main"
        style={fullscreen ? {minWidth:0,minHeight:0,overflowY:'auto',padding:phone?12:20,
          boxSizing:'border-box',background:'#f7f7f7'} : undefined}>{main}</main>
      {hasSidebar && <aside className="record-runtime-sidebar"
        style={fullscreen ? {minWidth:0,minHeight:0,overflowY:'auto',padding:0,
          borderLeft:phone?'none':'1px solid #e8e8e8',background:'#fff'} : undefined}>{sidebar}</aside>}
    </div>
  </div>;
}
