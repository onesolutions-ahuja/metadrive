import type {PoolClient} from 'pg';
import {encodeMetadataValue} from '../system-files/component-runtime.js';
import {ONECHATTER_APP} from './onechatter-app-catalog.js';

/** Only SQL-owned Page Builder metadata is installed; AceChatter's code,
 * definitions, records and flows remain completely untouched. */
export async function seedOneChatterInstalledPage(client:Pick<PoolClient,'query'>,tenantId:string):Promise<boolean>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenantId+':app-page:OneChatter']);
  const {rows:apps}=await client.query<{id:string}>(`SELECT a.id FROM md_apps a
    JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
    JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
    WHERE a.api_name=$2 AND a.enabled=true AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
      AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now()) LIMIT 1`,
    [tenantId,ONECHATTER_APP.apiName]);
  const appId=apps[0]?.id;
  if(!appId)return false;
  const {rows:created}=await client.query<{id:string}>(`INSERT INTO md_page_definitions
    (tenant_id,api_name,title,enabled) VALUES($1,$2,'OneChatter Inbox',true)
    ON CONFLICT(tenant_id,api_name) DO NOTHING RETURNING id`,
    [tenantId,ONECHATTER_APP.homePageApi]);
  const {rows:pages}=await client.query<{id:string}>(`SELECT id FROM md_page_definitions
    WHERE tenant_id=$1 AND api_name=$2 AND enabled=true`,
    [tenantId,ONECHATTER_APP.homePageApi]);
  const pageId=pages[0]?.id;
  if(!pageId)throw new Error('OneChatter page name conflicts with disabled tenant page');
  if(created.length){
    await client.query(`INSERT INTO md_lightning_page_details
      (tenant_id,page_id,page_type,target_object,layout_mode,template,canvas_width,canvas_height,status,devices,revision)
      VALUES($1,$2,'App Page','','template','main-sidebar',1440,900,'Active',ARRAY['Desktop','Phone'],1)`,
      [tenantId,pageId]);
    await client.query(`INSERT INTO md_lightning_page_activation
      (tenant_id,page_id,assignment_id,scope,app_api,desktop,phone,sort_order)
      VALUES($1,$2,'onechatter-app-default','App Default',$3,true,true,0)`,
      [tenantId,pageId,ONECHATTER_APP.apiName]);
    // The send Flow starts Draft until the tenant configures a real provider;
    // the visual composer must never assume outbound permission.
    const requiredFlows=['AceChatterCreateConversation','AceChatterFindConversationByPhone',
      'AceChatterSendMessage','AceChatterLoadContacts'];
    const {rows:activeFlows}=await client.query<{api_name:string}>(`SELECT DISTINCT api_name
      FROM md_flow_definitions WHERE tenant_id=$1 AND api_name = ANY($2::text[])
        AND active=true AND archived=false`,[tenantId,requiredFlows]);
    const available=new Set(activeFlows.map(row=>row.api_name));
    const allowSend=['AceChatterCreateConversation','AceChatterFindConversationByPhone',
      'AceChatterSendMessage'].every(name=>available.has(name));
    const allowContacts=available.has('AceChatterLoadContacts');
    const nodes=[
      {key:'brand',type:'Custom:OneText',label:'OneChatter title',region:'header',
        props:{text:'OneChatter',fontSize:26,fontWeight:700,textColor:'#075E54'}},
      {key:'inbox',type:'Custom:OneConversation',label:'Editable conversations',region:'main',
        props:{
          viewMode:'inbox',title:'Chats',searchPlaceholder:'Search chats',
          placeholder:'Type a message',accentColor:'#128C7E',
          fillRegion:true,standalonePresentation:true,
          objectApiName:'Communication',recordPresenterApiName:'ConversationThread',
          conversationAccessMode:'recordPermissions',conversationDefaultAccount:'WhatsApp',
          conversationDirectionFieldApiName:'Direction',conversationAccountFieldApiName:'Channel',
          conversationFromFieldApiName:'Sender',conversationToFieldApiName:'Recipient',
          conversationOccurredFieldApiName:'ReceivedAt',
          conversationOutgoingOccurredFieldApiName:'SentAt',
          conversationBodyFieldApiName:'Body',conversationStatusFieldApiName:'Status',
          conversationContactNameFieldApiName:'Sender',
          contactNameFieldApiName:'Name',contactPhoneFieldApiName:'Phone',
          contactChoices:[], // Declared collection shape, populated by authorised Flow output.
          stateBindings:allowContacts?{contactChoices:'oneChatterContacts'}:{},
          conversationNormalizePhoneNumbers:true,conversationNameFromParticipant:true,
          conversationIncomingValue:'Inbound',conversationOutgoingValue:'Outbound',
          restrictToAssigned:false,liveRefreshEnabled:true,
          enableNewConversation:allowSend,enableSendPreparation:true,
          sendEnabled:allowSend,messageMaxLength:4096,
          filters:[{field:'Channel',operator:'Equals',value:'WhatsApp'}],
          actionFlows:{
            ...(allowContacts?{start:{actionType:'Flow',flowApiName:'AceChatterLoadContacts',
              inputs:{searchTerm:'',limit:200},
              outputs:{contacts:'oneChatterContacts'}}}:{}),
            create:{actionType:'Flow',flowApiName:'AceChatterCreateConversation',inputs:{
              chatName:'$event.chatName',phoneNumber:'$event.phoneNumber',
              sourceObjectApi:'',sourceRecordId:''}},
            resolve:{actionType:'Flow',flowApiName:'AceChatterFindConversationByPhone',
              inputs:{phoneNumber:'$event.phoneNumber',limit:200}},
            send:{actionType:'Flow',flowApiName:'AceChatterSendMessage',
              inputs:{conversationId:'$event.conversationId',message:'$event.body',
                recipientPhone:'$event.recipientPhone'}}
          }
        }}
    ] as const;
    for(const [index,node] of nodes.entries()){
      const componentApi=node.type.slice('Custom:'.length);
      const {rows:components}=await client.query<{api_name:string}>(`SELECT api_name
        FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true`,
        [tenantId,componentApi]);
      if(!components[0])throw new Error('Shared OneComponent missing: '+componentApi);
      await client.query(`INSERT INTO md_lightning_page_nodes
        (tenant_id,page_id,component_key,component_type,label,region,visible,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,true,$7)`,
        [tenantId,pageId,node.key,node.type,node.label,node.region,index]);
      const encoded:Array<{path:string;kind:string;text:string|null}>=[];
      encodeMetadataValue(node.props,'/props',encoded);
      encodeMetadataValue({},'/extra',encoded);
      for(const property of encoded)await client.query(`INSERT INTO md_lightning_page_node_properties
        (tenant_id,page_id,component_key,property_path,value_kind,value_text)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [tenantId,pageId,node.key,property.path,property.kind,property.text]);
    }
  }else{
    // Preserve drafts and user modifications. Never annex an unrelated page.
    const {rows:owned}=await client.query<{allowed:boolean}>(`SELECT EXISTS(
      SELECT 1 FROM md_lightning_page_details d
      JOIN md_lightning_page_activation a ON a.tenant_id=d.tenant_id AND a.page_id=d.page_id
      WHERE d.tenant_id=$1 AND d.page_id=$2 AND d.page_type='App Page'
        AND a.app_api=$3) AS allowed`,
      [tenantId,pageId,ONECHATTER_APP.apiName]);
    if(!owned[0]?.allowed)throw new Error('OneChatter page API conflicts with existing tenant metadata');
  }
  await client.query(`INSERT INTO md_tenant_app_navigation(tenant_id,app_id,entry_type,api_name,sort_order)
    VALUES($1,$2,'App Page',$3,0)
    ON CONFLICT(tenant_id,app_id,entry_type,api_name) DO NOTHING`,
    [tenantId,appId,ONECHATTER_APP.homePageApi]);
  for(const formFactor of ['desktop','phone','tablet'])await client.query(`INSERT INTO md_app_home_pages
    (tenant_id,app_id,form_factor,page_id) VALUES($1,$2,$3,$4)
    ON CONFLICT(tenant_id,app_id,form_factor) DO NOTHING`,[tenantId,appId,formFactor,pageId]);
  // Permission set is assignable, never auto-attached to a tenant user.
  await client.query(`INSERT INTO md_permission_sets
    (tenant_id,api_name,label,description,navigation_default_access)
    VALUES($1,'OneChatterUser','OneChatter User',
      'Read permitted communications and execute explicitly authorised shared chat Flows','Deny')
    ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId]);
  const rights=[
    ['App:OneChatter','read'],['PageDefinition','read'],['ComponentDefinition','read'],
    ['Communication','read'],['ChatConversation','read'],['ChatConversation','create'],
    ['ChatMessage','read'],['ChatMessage','create'],
    ...['Name','Channel','Direction','Status','Sender','Recipient','Body',
      'ReceivedAt','SentAt','ExternalMessageId','Provider'].map(field=>['Communication.'+field,'read']),
    ...['Name','PhoneNumber','Status','SourceObjectApi','SourceRecordId']
      .map(field=>['ChatConversation.'+field,'read']),
    ...['Name','PhoneNumber','Status','SourceObjectApi','SourceRecordId']
      .map(field=>['ChatConversation.'+field,'create']),
    ...['Name','ConversationId','Body','Direction','SentAt','Status','ExternalMessageId']
      .map(field=>['ChatMessage.'+field,'read']),
    ...['AceChatterLoadConversations','AceChatterLoadMessages','AceChatterLoadCommunications',
      'AceChatterLoadContacts','AceChatterCreateConversation',
      'AceChatterFindConversationByPhone','AceChatterSendMessage']
      .map(flow=>['Flow:'+flow,'execute'])
  ];
  for(const [resource,action] of rights)await client.query(`INSERT INTO md_permission_rules
    (tenant_id,permission_set_id,resource,action,effect)
    SELECT $1,p.id,$2,$3,'allow' FROM md_permission_sets p
    WHERE p.tenant_id=$1 AND p.api_name='OneChatterUser'
    ON CONFLICT DO NOTHING`,[tenantId,resource,action]);
  return true;
}
