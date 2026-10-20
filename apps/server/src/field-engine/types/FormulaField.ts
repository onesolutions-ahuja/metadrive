import type {FieldTypeDefinition} from '../FieldRegistry.js';
/** FormulaField: formula metadata descriptor. */
export const FormulaDefinition:FieldTypeDefinition=Object.freeze({
 name:'FormulaField',dataType:'formula',kind:'computed',
 storage:'record'
});

// Formula fields share the existing parser/evaluator; no parallel formula engine.
export {evaluateFlowFormula,validateFlowFormula,flowFormulaReferences,inferFlowFormulaType} from '../../system-files/flow-formula-runtime.js';
