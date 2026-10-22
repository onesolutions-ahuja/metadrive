/** Shared app Flow metadata. Scheduling invariants run in the reusable
 * RecordEngine node guards, never inside AceAssist's frontend. */
export const ACEASSIST_BOOKING_OVERLAP={
 startField:'StartDateTime',endField:'EndDateTime',
 groupFields:['AssignedUser','AssignedTo','Resource'],
 statusField:'Status',excludedStatuses:['Cancelled','No Show','Completed']
} as const;
export const ACEASSIST_BOOKING_AVAILABILITY={
 startField:'StartDateTime',endField:'EndDateTime',
 staffFields:['AssignedUser','AssignedTo'],resourceField:'Resource',
 statusField:'Status',excludedStatuses:['Cancelled','No Show','Completed'],
 schedule:{object:'StaffAvailability',staff:'OwnerId',active:'Active',
  weekday:'Weekday',start:'StartTime',end:'EndTime'},
 exception:{object:'AvailabilityException',staff:'OwnerId',resource:'Resource',
  active:'Active',start:'StartDateTime',end:'EndDateTime'}
} as const;
