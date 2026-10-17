import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAppSeedCatalog} from '../../apps/server/src/seeders/catalog.mjs';
import {hasCustomComponentAppearance,registeredComponentAppearance,registeredComponentAppearanceClasses} from '../../apps/web/src/registeredComponentAppearance';

const sharedKeys=[
 'fontFamily','fontSize','fontWeight','lineHeight','textAlign','minWidth','maxWidth',
 'hideOnTablet','hideOnDesktop','cardDensity','cardPadding','cardRadius','cardMinHeight',
 'cardBackgroundColor','cardBorderColor','cardBorderWidth','cardShadow','cardHover',
 'imageHeight','imageFit','imageAspectRatio','showImage','showTitle','showPrice','showAddIcon'
];
test('all 41 One components expose shared visual metadata exactly once',()=>{
 const catalog=loadAppSeedCatalog();
 assert.equal(catalog.coreComponents.length,41);
 for(const component of catalog.coreComponents){
  const keys=component.propertyDefinitions.map((definition:{propertyKey:string})=>definition.propertyKey);
  assert.equal(keys.length,new Set(keys).size,component.apiName+' duplicate appearance key');
  for(const key of sharedKeys)assert(keys.includes(key),component.apiName+' missing '+key);
 }
 assert.deepEqual(loadAppSeedCatalog().coreComponents.map((c:{version:number})=>c.version),
  catalog.coreComponents.map((c:{version:number})=>c.version));
});
test('old components retain defaults without explicit appearance overrides',()=>{
 assert.equal(hasCustomComponentAppearance({}),false);
 assert.deepEqual(registeredComponentAppearance({}),{});
 assert.equal(registeredComponentAppearanceClasses({}),'');
});
test('shared appearance styles apply safe image, card and typography controls',()=>{
 const style=registeredComponentAppearance({
  cardDensity:'compact',cardPadding:10,cardRadius:9,cardMinHeight:120,
  cardBackgroundColor:'#ffffff',cardBorderColor:'#abcdef',cardShadow:'small',
  imageHeight:130,imageFit:'cover',imageAspectRatio:'4/3',
  fontFamily:'system',fontSize:14,fontWeight:'600',textAlign:'center',borderWidth:2
 });
 assert.equal(style['--md-card-padding'],'10px');
 assert.equal(style['--md-card-radius'],'9px');
 assert.equal(style['--md-image-fit'],'cover');
 assert.equal(style['--md-image-height'],'130px');
 assert.equal(style['--md-image-ratio'],'4/3');
 assert.equal(style.fontSize,14);
 assert.equal(style.borderWidth,2);
 assert.match(registeredComponentAppearanceClasses({hideOnTablet:true,hideOnDesktop:true}),/md-hide-tablet/);
});
test('invalid and out-of-range visual values never enter the style tokens',()=>{
 const style=registeredComponentAppearance({
  cardBackgroundColor:'not-a-color',fontFamily:'not-a-family',
  minWidth:'not-a-length',maxHeight:'99999px',cardRadius:-1,fontSize:999,
  imageFit:'unknown',imageAspectRatio:'unknown'
 });
 assert.equal(style['--md-card-background'],undefined);
 assert.equal(style.fontFamily,undefined);
 assert.equal(style.minWidth,undefined);
 assert.equal(style.maxHeight,undefined);
 assert.equal(style['--md-card-radius'],undefined);
 assert.equal(style['--md-image-fit'],undefined);
});
