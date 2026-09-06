export type Score = 0 | 1;

export interface Task {
  id: string;
  description: string;
}

export interface AgentSpec {
  id: string;
  name: string;
  version: number;
  role: string;
  systemInstructions: string;
  taskInstructions: string;
  outputFormat: string;
  verificationInstructions: string;
  instructions: string;
  capabilities: string[];
  tools?: ToolDefinition[];
  metadata?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface BenchmarkCase {
  id: string;
  input: string;
  expected: {
    mustInclude: string[];
    mustNotInclude?: string[];
  };
  tags: string[];
}

export interface Benchmark {
  id: string;
  name: string;
  description: string;
  cases: BenchmarkCase[];
}

export interface AgentRun {
  caseId: string;
  input: string;
  output: string;
  agentSpecId: string;
}

export interface CaseEvaluation {
  caseId: string;
  score: Score;
  passed: boolean;
  missingRequiredTerms: string[];
  forbiddenTermsFound: string[];
}

export interface EvaluationReport {
  benchmarkId: string;
  agentSpecId: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  accuracy: number;
  caseEvaluations: CaseEvaluation[];
}

export interface FailureInsight {
  caseId: string;
  tags: string[];
  reason: string;
  missingRequiredTerms: string[];
  forbiddenTermsFound: string[];
}

export interface FailureAnalysis {
  failedCases: FailureInsight[];
  failuresByTag: Record<string, number>;
  summary: string;
}

export interface ImprovementProposal {
  baseAgentSpecId: string;
  proposedAgentSpec: AgentSpec;
  rationale: string[];
}

export interface RegressionResult {
  passed: boolean;
  baselineAccuracy: number;
  candidateAccuracy: number;
  minimumAccuracy: number;
  regressions: CaseEvaluation[];
}

export interface AgentDesigner {
  design(task: Task): Promise<AgentSpec>;
}

export interface AgentRunner {
  run(agentSpec: AgentSpec, benchmarkCase: BenchmarkCase): Promise<AgentRun>;
}

export interface Evaluator {
  evaluate(agentSpec: AgentSpec, benchmark: Benchmark, runs: AgentRun[]): EvaluationReport;
}

export interface FailureAnalyzer {
  analyze(benchmark: Benchmark, report: EvaluationReport): FailureAnalysis;
}

export interface AgentImprover {
  proposeImprovement(agentSpec: AgentSpec, analysis: FailureAnalysis): Promise<ImprovementProposal>;
}
