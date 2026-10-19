import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  evaluateFlowFormula,flowFormulaReferences,inferFlowFormulaType,validateFlowFormula
} from '../../src/system-files/flow-formula-runtime.js';

test('Flow formulas evaluate arithmetic, precedence, references and short-circuit functions',()=>{
  const resources:Record<string,unknown>={Amount:20,Name:'MetaDrive'};
  const resolve=(name:string)=>resources[name];
  assert.equal(evaluateFlowFormula('Amount + 2 * 3',resolve),26);
  assert.equal(evaluateFlowFormula('IF(Amount >= 20, UPPER(@Name), 1 / 0)',resolve),'METADRIVE');
  assert.equal(evaluateFlowFormula('AND(Amount > 10, NOT(FALSE))',resolve),true);
  assert.equal(evaluateFlowFormula('LEFT(Name, 4) & "!"',resolve),'Meta!');
  assert.equal(evaluateFlowFormula('IFERROR(1 / 0, "fallback")',resolve),'fallback');
  assert.equal(evaluateFlowFormula('IFERROR("ok", 1 / 0)',resolve),'ok');
  assert.equal(evaluateFlowFormula('T(Name)',resolve),'MetaDrive');
  assert.equal(evaluateFlowFormula('T(12)',resolve),'');
  assert.equal(evaluateFlowFormula('ISCLONE()',resolve),false);
  assert.equal(evaluateFlowFormula('ISCLONE()',resolve,{isClone:true}),true);
  assert.equal(evaluateFlowFormula('CURRENCYRATE("GBP")',resolve,
    {currencyRates:{GBP:0.79}}),0.79);
  assert.throws(()=>evaluateFlowFormula('CURRENCYRATE("EUR")',resolve,
    {currencyRates:{GBP:0.79}}),/unavailable for currency EUR/);
  assert.deepEqual(evaluateFlowFormula('IMAGE("https://example.com/a.png", "alt", 120, 240)',resolve),{
    __formulaImage:'MetaDriveFormulaImage',url:'https://example.com/a.png',
    alt:'alt',height:120,width:240
  });
  assert.throws(()=>evaluateFlowFormula('IMAGE("javascript:alert(1)", "unsafe")',resolve),/HTTPS or tenant file URL/);
  assert.throws(()=>evaluateFlowFormula('IMAGE("https://example.com/a.png", "alt", 9000)',resolve),/dimensions/);
});

test('record-triggered Flow formulas expose change, prior-value, and new-record functions',()=>{
  const vars:Record<string,unknown>={
    '$Record':{Status:'Active',Description:'New'},
    '$Record__Prior':{Status:'Draft',Description:null}
  };
  const resolve=(name:string)=>{
    const [resource,field]=name.split('.');
    if(!Object.hasOwn(vars,resource))throw new Error('Unknown formula resource');
    const record=vars[resource];
    return field&&record&&typeof record==='object'
      ?(record as Record<string,unknown>)[field]:record;
  };
  assert.equal(evaluateFlowFormula('ISCHANGED({!$Record.Status})',resolve),true);
  assert.equal(evaluateFlowFormula('ISCHANGED({!$Record.Description})',resolve),true);
  assert.equal(evaluateFlowFormula('PRIORVALUE({!$Record.Status})',resolve),'Draft');
  assert.equal(evaluateFlowFormula('ISNEW()',resolve),false);
  assert.equal(inferFlowFormulaType('ISCHANGED({!$Record.Status})',()=> 'Text'),'Checkbox');
  assert.equal(inferFlowFormulaType('PRIORVALUE({!$Record.Status})',()=> 'Text'),'Text');
  assert.throws(()=>evaluateFlowFormula('PRIORVALUE("Status")',resolve),/field reference/);
  assert.throws(()=>evaluateFlowFormula('ISNEW()',()=>undefined),/Record-Triggered Flow/);
});

test('Flow formulas reject unsupported functions, malformed syntax and division by zero',()=>{
  const resolve=()=>null;
  assert.throws(()=>evaluateFlowFormula('RUN_CODE("x")',resolve),/Unsupported Flow formula function/);
  assert.throws(()=>evaluateFlowFormula('1 + (2 * 3',resolve),/parenthesis/);
  assert.throws(()=>evaluateFlowFormula('4 / 0',resolve),/division by zero/);
  assert.throws(()=>evaluateFlowFormula('1 @ 2',resolve),/Unsupported Flow formula character/);
});

test('Flow formulas support bounded text, predicate, and picklist functions',()=>{
  const resolve=()=>null;
  assert.equal(evaluateFlowFormula('XOR(TRUE, FALSE, TRUE)',resolve),false);
  assert.equal(evaluateFlowFormula('EXACT("Meta", "meta")',resolve),false);
  assert.equal(evaluateFlowFormula('SUBSTITUTE("abcabc", "a", "x", 2)',resolve),'abcxbc');
  assert.equal(evaluateFlowFormula('CONCATENATE(PROPER("meta drive"), " ", ASCII("A"))',resolve),'Meta Drive 65');
  assert.equal(evaluateFlowFormula('ISNUMBER("12.5") AND NOT(ISNUMBER("12x"))',resolve),true);
  assert.equal(evaluateFlowFormula('ISPICKVAL("Open", "Open")',resolve),true);
  assert.equal(evaluateFlowFormula('INCLUDES("Red;Blue", "Blue")',resolve),true);
  assert.equal(evaluateFlowFormula('REPT("xy", 3) & REVERSE("A🙂")',resolve),'xyxyxy🙂A');
  assert.equal(evaluateFlowFormula('URLDECODE(ENCODEURL("a b&c"))',resolve),'a b&c');
  assert.throws(()=>evaluateFlowFormula('REPT("long", 2000)',resolve),/4000-character limit/);
  assert.throws(()=>evaluateFlowFormula('URLDECODE("%")',resolve),/URL-encoded/);
  assert.doesNotThrow(()=>validateFlowFormula('INCLUDES("Red;Blue", "Blue")'));
  assert.doesNotThrow(()=>validateFlowFormula('TODAY()'));
});

test('formula DISTANCE calculates miles and kilometers between geolocations',()=>{
  const expression='DISTANCE(GEOLOCATION(0, 0), GEOLOCATION(0, 1), "km")';
  const distance=evaluateFlowFormula(expression,()=>null);
  assert.ok(typeof distance==='number'&&Math.abs(distance-111.195)<0.01);
  const miles=evaluateFlowFormula('DISTANCE(GEOLOCATION(0, 0), GEOLOCATION(0, 1), "mi")',()=>null);
  assert.ok(typeof miles==='number'&&Math.abs(miles-69.093)<0.01);
  assert.throws(()=>evaluateFlowFormula('GEOLOCATION(91, 0)',()=>null),/coordinates/);
});

test('Salesforce formula date, CASE and numeric functions evaluate consistently',()=>{
  const resolve=()=>null;
  assert.equal(evaluateFlowFormula('DATE(2024, 2, 29)',resolve),'2024-02-29');
  assert.equal(evaluateFlowFormula('DATEVALUE("2024-06-15T12:30:00Z")',resolve),'2024-06-15');
  assert.equal(evaluateFlowFormula('DATEVALUE("2024-06-15T00:30:00Z")',resolve,
    {timeZone:'America/Los_Angeles'}),'2024-06-14');
  assert.equal(evaluateFlowFormula('DATETIMEVALUE("2024-06-15T12:30:00")',resolve,
    {timeZone:'America/Los_Angeles'}),'2024-06-15T19:30:00.000Z');
  assert.equal(evaluateFlowFormula('TIMEVALUE("2024-06-15T00:30:00Z")',resolve,
    {timeZone:'America/Los_Angeles'}),'17:30:00.000');
  assert.equal(evaluateFlowFormula('HOUR("2024-06-15T00:30:00Z")',resolve,
    {timeZone:'America/Los_Angeles'}),17);
  assert.equal(evaluateFlowFormula('TZOFFSET("2024-06-15T00:30:00Z")',resolve,
    {timeZone:'America/Los_Angeles'}),-25200000);
  assert.equal(evaluateFlowFormula('TZOFFSET("2024-01-15T12:30:00Z")',resolve,
    {timeZone:'America/Los_Angeles'}),-28800000);
  assert.equal(evaluateFlowFormula('ISOWEEK("2021-01-01")',resolve),53);
  assert.equal(evaluateFlowFormula('ISOWEEK("2021-01-04")',resolve),1);
  assert.equal(evaluateFlowFormula('ISOYEAR("2021-01-01")',resolve),2020);
  assert.equal(evaluateFlowFormula('ISOYEAR("2021-01-04")',resolve),2021);
  assert.equal(evaluateFlowFormula('TIMEVALUE("12:34:56.7")',resolve),'12:34:56.700');
  assert.equal(evaluateFlowFormula('HOUR(TIMEVALUE("12:34:56"))',resolve),12);
  assert.equal(evaluateFlowFormula('YEAR(ADDMONTHS("2024-01-31", 1))',resolve),2024);
  assert.equal(evaluateFlowFormula('ADDMONTHS("2024-01-31", 1)',resolve),'2024-02-29');
  assert.equal(evaluateFlowFormula('CASE("Open", "Closed", 0, "Open", 1, -1)',resolve),1);
  assert.equal(evaluateFlowFormula('POWER(3, 2) + MOD(8, 3) + SQRT(9)',resolve),14);
  assert.equal(evaluateFlowFormula('CEILING(2.1) + FLOOR(2.9)',resolve),5);
  assert.throws(()=>evaluateFlowFormula('DATE(2024, 2, 30)',resolve),/Invalid DATE/);
  assert.throws(()=>evaluateFlowFormula('DATEVALUE("2024-02-31")',resolve),/date\/time value/);
  assert.throws(()=>evaluateFlowFormula('DATETIMEVALUE("2024-03-10T02:30:00")',resolve,
    {timeZone:'America/Los_Angeles'}),/does not exist/);
});

test('Salesforce formula text, ID and numeric helpers remain bounded',()=>{
  const resolve=()=>null;
  assert.equal(evaluateFlowFormula('LPAD("abc", 5, "0") & RPAD("xy", 4, "!")',resolve),'00abcxy!!');
  assert.equal(evaluateFlowFormula('REPLACE("12345", 2, 2, "xy")',resolve),'1xy45');
  assert.equal(evaluateFlowFormula('CHAR(65) & INITCAP("hello world")',resolve),'AHello World');
  assert.equal(evaluateFlowFormula('ROUNDUP(-2.31, 1)',resolve),-2.4);
  assert.equal(evaluateFlowFormula('ROUND(-2.5) + ROUND(2.5)',resolve),0);
  assert.equal(evaluateFlowFormula('ROUND(-2.55, 1)',resolve),-2.6);
  assert.equal(evaluateFlowFormula('ROUND(1.005, 2)',resolve),1.01);
  assert.equal(evaluateFlowFormula('ROUNDDOWN(-2.39, 1) + TRUNC(2.39, 1)',resolve),0);
  assert.equal(evaluateFlowFormula('SIGN(-2) + MCEILING(1.2) + MFLOOR(1.8)',resolve),2);
  assert.equal(evaluateFlowFormula('CASESAFEID("001000000000000")',resolve),'001000000000000AAA');
  assert.equal(evaluateFlowFormula('CASESAFEID("001000000000000AAA")',resolve),'001000000000000AAA');
  assert.throws(()=>evaluateFlowFormula('CASESAFEID("001000000000000BBB")',resolve),/invalid 18-character/);
  assert.ok(Math.abs(Number(evaluateFlowFormula('SIN(PI() / 2) + DEGREES(ATAN(1))',resolve))-46)<1e-10);
  assert.throws(()=>evaluateFlowFormula('ASIN(2)',resolve),/between -1 and 1/);
});

test('formula type inference enforces operators, functions and declared results',()=>{
  const types:Record<string,'Number'|'Text'|'Checkbox'|'Date'|'Geolocation'>={
    'Invoice__c.Amount':'Number','Invoice__c.Name':'Text',
    'Invoice__c.Paid__c':'Checkbox','Invoice__c.Location__c':'Geolocation'
  };
  const resolve=(name:string)=>types[name]??null;
  assert.deepEqual(flowFormulaReferences('IF(@Invoice__c.Paid__c, @Invoice__c.Amount, 0)'),[
    'Invoice__c.Paid__c','Invoice__c.Amount'
  ]);
  assert.equal(inferFlowFormulaType('IF(@Invoice__c.Paid__c, @Invoice__c.Amount, 0)',resolve),'Number');
  assert.equal(inferFlowFormulaType('DISTANCE(@Invoice__c.Location__c, GEOLOCATION(0, 0), "km")',resolve),'Number');
  assert.equal(inferFlowFormulaType('DATEVALUE("2024-01-01")',resolve),'Date');
  assert.equal(inferFlowFormulaType('TIMEVALUE("12:00:00")',resolve),'Time');
  assert.equal(inferFlowFormulaType('CASESAFEID(@Invoice__c.Name)',resolve),'Text');
  assert.equal(inferFlowFormulaType('COS(PI())',resolve),'Number');
  assert.equal(inferFlowFormulaType('IFERROR(1 / 0, 0)',resolve),'Number');
  assert.equal(inferFlowFormulaType('T(@Invoice__c.Paid__c)',resolve),'Text');
  assert.equal(inferFlowFormulaType('ISOWEEK(TODAY())',resolve),'Number');
  assert.equal(inferFlowFormulaType('ISOYEAR(TODAY())',resolve),'Number');
  assert.equal(inferFlowFormulaType('TZOFFSET(NOW())',resolve),'Number');
  assert.throws(()=>inferFlowFormulaType('TZOFFSET(TODAY())',resolve),/argument type/);
  assert.equal(inferFlowFormulaType('ISCLONE()',resolve),'Checkbox');
  assert.equal(inferFlowFormulaType('CURRENCYRATE("GBP")',resolve),'Number');
  assert.equal(inferFlowFormulaType('IMAGE("https://example.com/a.png", "Alt")',resolve),'Text');
  assert.throws(()=>inferFlowFormulaType('IFERROR(1, "fallback")',resolve),/result types do not match/);
  assert.throws(()=>inferFlowFormulaType('@Invoice__c.Name + 1',resolve),/Arithmetic formula operators/);
  assert.throws(()=>inferFlowFormulaType('IF(@Invoice__c.Name, 1, 0)',resolve),/argument type/);
  assert.throws(()=>inferFlowFormulaType('UPPER(@Invoice__c.Amount)',resolve),/argument type/);
  assert.throws(()=>inferFlowFormulaType('@Invoice__c.Missing__c',resolve),/Unknown formula field/);
});
