import * as React from 'react';
import {apiRequest} from '../../web/src/core/authentication/Client/authClient';
import AcetillTerminal from './AcetillTerminal';
import {ACETILL_STANDALONE_ENTRY} from './standalone-entry';

/** Acetill owns its branded standalone shell. MetaDrive still owns sessions and Flows. */
export default function AcetillShell({onLogout}:{onLogout:()=>void}){
  const logout=async()=>{
    try{await apiRequest('/auth/logout',{method:'POST'});}
    catch{/* Clear local session regardless. */}
    onLogout();
    window.location.assign('/login');
  };
  return <div className="standalone-product"
    style={{'--product-accent':ACETILL_STANDALONE_ENTRY.accent} as React.CSSProperties}>
    <header className="standalone-product-header">
      <div className="standalone-product-brand">
        <span className="standalone-product-mark">A</span>
        <span><strong>Acetill</strong><small>Point of sale</small></span>
      </div>
      <button type="button" className="standalone-product-logout"
        onClick={()=>void logout()}>Sign out</button>
    </header>
    <AcetillTerminal/>
  </div>;
}
