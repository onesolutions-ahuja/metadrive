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

/** Responsive layout editor fields. Legacy visualStyle retains its historical
 * numeric limits above, while layoutStyle uses these published limits.
 */
export const responsiveNumberFields = [
  {key:'padding',label:'Padding',min:0,max:160},
  {key:'margin',label:'Margin',min:0,max:160},
  {key:'borderWidth',label:'Border width',min:0,max:24},
  {key:'borderRadius',label:'Corner radius',min:0,max:160},
  {key:'gap',label:'Spacing / gap',min:0,max:160},
  {key:'opacity',label:'Opacity (%)',min:0,max:100},
  {key:'fontSize',label:'Font size',min:8,max:96}
] as const;
export const responsiveOptionFields = [
  {key:'alignItems',label:'Cross-axis alignment',options:['stretch','flex-start','center','flex-end']},
  {key:'justifyContent',label:'Main-axis alignment',options:['flex-start','center','flex-end','space-between','space-around']},
  {key:'fontWeight',label:'Font weight',options:['400','500','600','700','800']},
  {key:'textAlign',label:'Text alignment',options:['left','center','right','start','end']},
  {key:'boxShadow',label:'Shadow',options:['none','sm','md','lg']}
] as const;
export const responsiveColorFields = [
  {key:'backgroundColor',label:'Background colour'},
  {key:'borderColor',label:'Border colour'}
] as const;
export const responsiveSettingKeys = [
  ...responsiveNumberFields.map(item=>item.key),
  ...responsiveOptionFields.map(item=>item.key),
  ...responsiveColorFields.map(item=>item.key),
  'hidden'
] as const;
