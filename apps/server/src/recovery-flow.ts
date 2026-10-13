/**
 * Protected system recovery flow shape. The generic Flow runtime must never execute
 * password-security primitives as a normal user-triggered metadata action.
 * Password recovery API handlers execute only these validated metadata paths.
 */
export const RECOVERY_FLOW_API = 'SYSTEM_PASSWORD_RECOVERY';
export type RecoveryStage = 'request' | 'confirm';
export type RecoveryFlowNode = { id: number; type: string; label: string; config: Record<string, unknown> };
export type RecoveryFlowDefinition = {
  elements: RecoveryFlowNode[];
  connectors: Array<{ id: string; from: number; to: number; label: string; kind: string }>;
};
export function defaultRecoveryFlowDefinition() {
  const elements: RecoveryFlowNode[] = [
    {id:1,type:'Start',label:'Password recovery',config:{}},
    {id:2,type:'Decision',label:'Recovery event',config:{outcomes:[
      {name:'request',label:'Request verification',conditions:[]},
      {name:'confirm',label:'Verify and reset',conditions:[]}
    ]}},
    {id:3,type:'Action',label:'Generate OTP or link',config:{actionType:'Generate Verification',method:'TENANT_POLICY'}},
    {id:4,type:'Action',label:'Send recovery message',config:{
      actionType:'Send Recovery Communication',channel:'email',
      subject:'{!Tenant.Name} — password recovery',
      body:'Your {!Tenant.Name} password recovery verification is {!Verification.Value}. It expires in {!Verification.ExpiryMinutes} minutes.',
      providerOrder:'tenant,platform,http'
    }},
    {id:5,type:'Action',label:'Verify submitted code or link',config:{actionType:'Verify Verification'}},
    {id:6,type:'Action',label:'Update password and revoke sessions',config:{actionType:'Reset Password'}},
    {id:7,type:'End',label:'Completed',config:{}}
  ];
  const links: Array<[number,number,string]> = [[1,2,''],[2,3,'request'],[2,5,'confirm'],[3,4,''],[4,7,''],[5,6,''],[6,7,'']];
  return {
    apiName:RECOVERY_FLOW_API,label:'SYSTEM – Password Recovery',description:'Protected tenant account recovery; edit delivery templates and provider order but not verification safeguards.',
    flowType:'Autolaunched Flow',status:'Active',versionNumber:1,activeVersion:1,triggerObject:null,
    startConfig:{event:'PASSWORD_RECOVERY',protectedSecurityFlow:true},
    elements,connectors:links.map(([from,to,label],i)=>({id:'recovery-edge-'+(i+1),from,to,label,kind:'normal'})),
    resources:[],versions:[]
  };
}
export function recoveryFlowActions(flow: RecoveryFlowDefinition, stage: RecoveryStage): RecoveryFlowNode[] {
  const start = flow.elements.filter(n=>n.type==='Start');
  const decision = flow.elements.filter(n=>n.type==='Decision');
  if(start.length!==1 || decision.length!==1)throw Error('Protected recovery Flow must have one Start and one Decision');
  const first=flow.connectors.filter(c=>c.kind==='normal'&&c.from===start[0].id);
  if(first.length!==1||first[0].to!==decision[0].id)throw Error('Invalid recovery Flow entry path');
  const selection=flow.connectors.filter(c=>c.kind==='normal'&&c.from===decision[0].id&&c.label===stage);
  if(selection.length!==1)throw Error('Recovery Flow stage is missing');
  const visited=new Set<number>();const path:RecoveryFlowNode[]=[];let next=selection[0].to;
  while(true){
    if(visited.has(next)||visited.size>10)throw Error('Cyclic or oversized recovery Flow path');
    visited.add(next);const node=flow.elements.find(n=>n.id===next);
    if(!node)throw Error('Broken recovery Flow connector');
    if(node.type==='End')break;
    if(node.type!=='Action')throw Error('Only protected verification actions may execute');
    path.push(node);
    const links=flow.connectors.filter(c=>c.kind==='normal'&&c.from===next);
    if(links.length!==1)throw Error('Recovery Flow requires one normal successor per action');
    next=links[0].to;
  }
  const required=stage==='request'?['Generate Verification','Send Recovery Communication']:['Verify Verification','Reset Password'];
  if(path.length!==required.length||path.some((n,i)=>n.config.actionType!==required[i])) {
    throw Error('Recovery Flow cannot omit, reorder or substitute protected security actions');
  }
  return path;
}
