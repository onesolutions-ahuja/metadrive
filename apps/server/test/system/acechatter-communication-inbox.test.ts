import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  buildCommunicationInbox,
  communicationSenderPhone,
  mergeCommunicationMessages
} from '../../../acechatter/src/communicationInbox.js';

test('AceChatter groups inbound Communication records by WhatsApp sender number and filters by number',()=>{
  const communications=[
    {Id:'comm-1',Channel:'WhatsApp',Direction:'Inbound',Status:'Received',
      Sender:'Test Customer (447700900123)',Recipient:'15551234567',
      Body:'First message',ExternalMessageId:'wamid.1',ReceivedAt:'2026-10-22T22:15:00.000Z'},
    {Id:'comm-2',Channel:'WhatsApp',Direction:'Inbound',Status:'Received',
      Sender:'Test Customer (447700900123)',Recipient:'15551234567',
      Body:'Second message',ExternalMessageId:'wamid.2',ReceivedAt:'2026-10-22T22:16:00.000Z'},
    {Id:'comm-3',Channel:'WhatsApp',Direction:'Inbound',Status:'Received',
      Sender:'Other Customer (447700900124)',Recipient:'15551234567',
      Body:'Different chat',ExternalMessageId:'wamid.3',ReceivedAt:'2026-10-22T22:17:00.000Z'}
  ];
  assert.equal(communicationSenderPhone(communications[0]),'447700900123');
  const inbox=buildCommunicationInbox([],communications,'+44 7700 900123');
  assert.equal(inbox.length,1);
  assert.equal(inbox[0].Id,'communication:447700900123');
  assert.equal(inbox[0].PhoneNumber,'447700900123');
  assert.equal(inbox[0].Name,'Test Customer');
  assert.equal(inbox[0].__lastMessageBody,'Second message');
});

test('AceChatter groups inbound and outbound Communication by the same customer number',()=>{
  const communications=[
    {Id:'incoming',Channel:'WhatsApp',Direction:'Inbound',Sender:'Customer Name (447700900123)',
      Recipient:'15551234567',Body:'Hello',ExternalMessageId:'wamid.in',
      ReceivedAt:'2026-10-22T10:00:00.000Z'},
    {Id:'outgoing',Channel:'WhatsApp',Direction:'Outbound',Sender:'WhatsApp Business',
      Recipient:'447700900123',Body:'Hi there',ExternalMessageId:'wamid.out',
      SentAt:'2026-10-22T10:01:00.000Z'},
    {Id:'sms',Channel:'SMS',Direction:'Inbound',Sender:'Customer Name (447700900123)',
      Body:'This is not a WhatsApp message',ExternalMessageId:'sms.1',
      ReceivedAt:'2026-10-22T10:02:00.000Z'}
  ];
  assert.equal(communicationSenderPhone(communications[0]),'447700900123');
  assert.equal(communicationSenderPhone(communications[1]),'447700900123');
  const inbox=buildCommunicationInbox([],communications);
  assert.equal(inbox.length,1);
  assert.equal(inbox[0].PhoneNumber,'447700900123');
  const thread=mergeCommunicationMessages(communications,[],'447700900123');
  assert.deepEqual(thread.map(row=>row.Id),['incoming','outgoing']);
  assert.deepEqual(thread.map(row=>row.Direction),['Inbound','Outbound']);
});

test('AceChatter links Communication threads to authorised ChatConversation and deduplicates legacy copies',()=>{
  const communications=[
    {Id:'comm-1',Channel:'WhatsApp',Direction:'Inbound',Status:'Received',
      Sender:'Test Customer (447700900123)',Body:'Hello',ExternalMessageId:'wamid.1',
      ReceivedAt:'2026-10-22T22:15:00.000Z'},
    {Id:'comm-2',Channel:'WhatsApp',Direction:'Inbound',Status:'Received',
      Sender:'Other Customer (447700900124)',Body:'Other chat',ExternalMessageId:'wamid.2',
      ReceivedAt:'2026-10-22T22:16:00.000Z'}
  ];
  const inbox=buildCommunicationInbox([
    {Id:'conversation-1',Name:'Saved contact',PhoneNumber:'+44 7700 900123',Status:'Open'}
  ],communications,'447700900123');
  assert.equal(inbox.length,1);
  assert.equal(inbox[0].Id,'conversation-1');
  assert.equal(inbox[0].PhoneNumber,'447700900123');
  const bySenderName=buildCommunicationInbox([
    {Id:'conversation-1',Name:'Saved contact',PhoneNumber:'+44 7700 900123',Status:'Open'}
  ],communications,'Test Customer');
  assert.equal(bySenderName.length,1,'filter should match the WhatsApp sender name even when the saved contact label differs');

  const merged=mergeCommunicationMessages(communications,[
    {Id:'legacy-copy',Direction:'Inbound',Body:'Hello',ExternalMessageId:'wamid.1',
      SentAt:'2026-10-22T22:15:00.000Z'},
    {Id:'outbound-1',Direction:'Outbound',Body:'Reply',ExternalMessageId:'wamid.out',
      SentAt:'2026-10-22T22:18:00.000Z'}
  ],'447700900123');
  assert.deepEqual(merged.map(row=>row.Id),['comm-1','outbound-1']);
  assert.equal(merged[0].Body,'Hello');
  assert.equal(merged[1].Direction,'Outbound');
});
