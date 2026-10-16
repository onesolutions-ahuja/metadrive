/** Convert permission-filtered Metadrive Communication_Records__c rows into Chatter props.
 * Channel account must come from a trusted backend mapping of webhook Phone Number ID.
 * This adapter does NOT grant access; callers must first enforce tenant RBAC.
 */
export type CommunicationRow = Record<string, unknown>;
export type ChatterThread = { id:string; contactName:string; phoneNumber:string; channelAccountId:string;
  assignedUserId:string|null; preview:string; lastMessageAt:string; unreadCount:number };
export type ChatterMessage = { id:string; conversationId:string; direction:string; body:string;
  sentAt:string; status:string; mediaUrl:string; mediaName:string; mediaType:string };
const str=(v:unknown):string=>typeof v==='string'?v.trim():v==null?'':String(v);
export function buildChatterView(rows:readonly CommunicationRow[]):{conversations:ChatterThread[];messages:ChatterMessage[]}{
  const chats=new Map<string,ChatterThread>();
  const messages:ChatterMessage[]=[];
  for(const row of rows) {
    if(str(row.Communication_Mode__c).toLowerCase()!=='whatsapp' ||
       str(row.Event_Type__c).toLowerCase()!=='message') continue;
    const direction=str(row.Direction__c).toLowerCase();
    if(direction!=='incoming'&&direction!=='outgoing')continue;
    const account=str(row.Channel_Account__c);
    const phone=str(direction==='incoming'?row.From_Number__c:row.To_Number__c);
    // Avoid cross-number coalescing and records with missing trusted account association.
    if(!account||!phone)continue;
    const key=JSON.stringify([account,phone]);
    const id=str(row.Id);if(!id)continue;
    const occurred=str(row.Occurred_At__c||row.CreatedDate);
    const body=str(row.Message_Body__c);
    const prior=chats.get(key);
    if(!prior){
      chats.set(key,{id:key,channelAccountId:account,contactName:str(row.Contact_Name__c)||phone,
        phoneNumber:phone,assignedUserId:str(row.Assigned_User__c)||null,preview:body,
        lastMessageAt:occurred,unreadCount:0});
    }
    const chat=chats.get(key)!;
    if(occurred>=chat.lastMessageAt){
      chat.preview=body;chat.lastMessageAt=occurred;
      chat.contactName=str(row.Contact_Name__c)||chat.contactName;
      chat.assignedUserId=str(row.Assigned_User__c)||chat.assignedUserId;
    }
    if(direction==='incoming'&&!row.Read_At__c)chat.unreadCount+=1;
    messages.push({id,conversationId:key,direction:direction==='incoming'?'inbound':'outbound',
      body,sentAt:occurred,status:str(row.Status__c),mediaUrl:str(row.Media_URL__c),
      mediaName:str(row.Media_Name__c),mediaType:str(row.Media_Type__c)});
  }
  messages.sort((a,b)=>a.sentAt.localeCompare(b.sentAt));
  return {conversations:[...chats.values()].sort((a,b)=>b.lastMessageAt.localeCompare(a.lastMessageAt)),messages};
}
