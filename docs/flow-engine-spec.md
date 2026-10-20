# Flow Engine specification

The canonical Flow code lives in `apps/server/src/flow-engine/`, including the SQL-backed FlowRuntime/FlowEngineCore and shared draft validator. Nodes are modular under `apps/server/src/system-files/nodes/` and delegate record, messaging and integration work to shared engines. The five runtime types reuse the single execution engine and durable job infrastructure.

Metadata defines elements, variable bindings, decisions, fault connectors and published versions. Execution must enforce tenant, app activation, OneEngine RBAC, bounded collections, savepoints, idempotency, durable resume and explicit failure handling. Builder-only code never loads in published runtime.

Existing contracts: [FLOW_ENGINE_MODULE_BOUNDARIES.md](FLOW_ENGINE_MODULE_BOUNDARIES.md), [FLOW_CAPABILITY_REGISTRY.md](FLOW_CAPABILITY_REGISTRY.md), [FLOW_EXECUTION_CONTEXT_CONTRACT.md](FLOW_EXECUTION_CONTEXT_CONTRACT.md), [FLOW_NODE_EXTRACTION_STATUS.md](FLOW_NODE_EXTRACTION_STATUS.md).
