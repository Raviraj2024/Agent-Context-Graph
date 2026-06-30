export interface ScopeDecision {
  nodeOrPath: string;
  classification: "auto_allowed" | "needs_approval" | "hard_stop";
  reason: string;
  resolvedAt: string | null;
  approved: boolean | null;
}

export interface TaskScope {
  scopeId: string;
  sessionId: string;
  createdAt: string;
  taskDescription: string;
  declaredNodeIds: string[];
  status: "active" | "completed" | "abandoned";
  decisions: ScopeDecision[];
}

export interface ProposedChange {
  nodeOrPath: string;
}

export interface ApprovalDecision {
  scopeId: string;
  decisions: ScopeDecision[];
}
