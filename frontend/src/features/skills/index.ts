/**
 * Skills feature — barrel exports.
 *
 * Graph workflow builder components, stores, and utilities
 * for visual skill composition.
 */

// Node type system
export {
  WorkflowNodeType,
  WORKFLOW_NODE_SPECS,
  createWorkflowNode,
  type WorkflowNodeData,
  type HandleSpec,
  type WorkflowNodeSpec,
} from './utils/graph-node-types';

// MobX store
export { GraphWorkflowStore, type ValidationError } from './stores/GraphWorkflowStore';

// Context bridge
export {
  GraphWorkflowContext,
  useGraphWorkflowContext,
  type GraphWorkflowContextValue,
} from './contexts/graph-workflow-context';
