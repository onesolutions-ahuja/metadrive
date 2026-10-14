/** One metadata schema for visual property controls and normalization. */
export const appearanceNumberFields = [
  {key:'padding',label:'Padding (px)',min:0,max:128},
  {key:'margin',label:'Margin (px)',min:0,max:128},
  {key:'gap',label:'Child spacing (px)',min:0,max:128},
  {key:'borderWidth',label:'Border width (px)',min:0,max:16},
  {key:'borderRadius',label:'Corner radius (px)',min:0,max:128},
  {key:'desktopColumns',label:'Desktop grid columns',min:1,max:12},
  {key:'tabletColumns',label:'Tablet grid columns',min:1,max:12},
  {key:'mobileColumns',label:'Phone grid columns',min:1,max:12}
] as const;
export const appearanceColorFields = [
  {key:'backgroundColor',label:'Background colour'},
  {key:'color',label:'Text colour'},
  {key:'borderColor',label:'Border colour'}
] as const;
export const appearanceChoiceFields = [
  {key:'align',label:'Align items',options:['start','center','end','stretch']},
  {key:'justify',label:'Justify content',options:['start','center','end','space-between']}
] as const;
