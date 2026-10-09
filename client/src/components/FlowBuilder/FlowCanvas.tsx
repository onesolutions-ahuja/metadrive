import type {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect
} from '@xyflow/react';
import React, { useState, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../../services/api';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    data: { label: '⚡ Record Created (Account)' },
    position: { x: 250, y: 50 },
    style: { background: '#0070d2', color: '#fff', padding: 10, borderRadius: 5, fontWeight: 'bold' },
  },
  {
    id: '2',
    data: { label: '⚙️ Temporal Task: Send Welcome Email' },
    position: { x: 250, y: 180 },
    style: { border: '1px solid #0070d2', padding: 10, borderRadius: 5 },
  },
];

const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2', animated: true }];

export const FlowCanvas: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [flowName, setFlowName] = useState<string>('AccountOnboardingFlow');

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const handleAddActionNode = () => {
    const newNodeId = (nodes.length + 1).toString();
    const newNode: Node = {
      id: newNodeId,
      data: { label: `⚙️ Temporal Task #${newNodeId}` },
      position: { x: 250, y: nodes.length * 100 + 50 },
      style: { border: '1px solid #2e844a', padding: 10, borderRadius: 5 },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const handleTestTrigger = async () => {
    try {
      const res = await api.triggerFlow({
        flow_name: flowName,
        record_id: 101,
        payload: { account_name: 'Gringotts Bank', status: 'Active' },
      });
      alert(`Temporal Workflow Executed Successfully!\nWorkflow ID: ${res.data.workflowId}\nRun ID: ${res.data.runId}`);
    } catch (err: any) {
      alert(`Flow Execution Error: ${err.message}`);
    }
  };

  return (
    <div style={{ height: '80vh', width: '100%', border: '1px solid #ddd', borderRadius: '8px' }}>
      <div style={{ padding: '12px', background: '#f4f6f9', borderBottom: '1px solid #ddd', display: 'flex', gap: '10px', alignItems: 'center' }}>
        <strong style={{ fontSize: '16px' }}>Flow Builder</strong>
        <input
          type="text"
          value={flowName}
          onChange={(e) => setFlowName(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button onClick={handleAddActionNode} style={{ padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}>
          + Add Step
        </button>
        <button onClick={handleTestTrigger} style={{ padding: '6px 12px', backgroundColor: '#2e844a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginLeft: 'auto' }}>
          ▶️ Test Run via Temporal
        </button>
      </div>
      <div style={{ height: 'calc(100% - 50px)', width: '100%' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
};
