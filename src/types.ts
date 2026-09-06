export type Score = number;

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
    mustInclude?: string[];
    mustNotInclude?: string[];
    category?: string;
    requiredConcepts?: EvaluationConcept[];
    forbiddenContent?: EvaluationConcept[];
    qualityCriteria?: EvaluationCriterion[];
    structuredFields?: ExpectedStructuredField[];
    passThreshold?: number;
  };
  tags: string[];
}

export interface EvaluationConcept {
  name: string;
  aliases: string[];
  weight?: number;
}

export interface EvaluationCriterion {
  name: string;
  description: string;
  weight?: number;
  allOf?: string[];
  anyOf?: string[];
}

export interface ExpectedStructuredField {
  name: string;
  aliases?: string[];
  required?: boolean;
  weight?: number;
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
  status?: "success" | "error";
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface CaseEvaluation {
  caseId: string;
  score: Score;
  overallScore: number;
  passed: boolean;
  criterionResults: CriterionResult[];
  missingRequiredTerms: string[];
  missingRequiredConcepts: string[];
  forbiddenTermsFound: string[];
  forbiddenContentViolations: string[];
  expectedCategory?: string;
  detectedCategory?: string;
  explanation: string;
}

export interface CriterionResult {
  id: string;
  type: "category" | "required_concept" | "forbidden_content" | "quality" | "structured_field";
  passed: boolean;
  score: number;
  weight: number;
  explanation: string;
}

export interface EvaluationReport {
  benchmarkId: string;
  agentSpecId: string;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  accuracy: number;
  overallScore: number;
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

export type FailurePatternType =
  | "missing_required_information"
  | "incorrect_classification"
  | "incomplete_response"
  | "policy_violation"
  | "escalation_failure"
  | "verification_failure"
  | "structured_field_failure"
  | "run_failure";

export type FailureSeverity = "low" | "medium" | "high" | "critical";

export interface FailureEvidence {
  caseId: string;
  criterionId: string;
  criterionType: CriterionResult["type"];
  explanation: string;
  outputExcerpt: string;
  tags: string[];
}

export interface FailurePattern {
  patternId: string;
  type: FailurePatternType;
  description: string;
  affectedCases: string[];
  frequency: number;
  severity: FailureSeverity;
  supportingEvidence: FailureEvidence[];
  failedCriteria: string[];
}

export interface RootCause {
  hypothesis: string;
  supportingEvidence: string[];
  confidence: number;
  relatedFailurePatterns: string[];
}

export interface ImprovementRecommendation {
  recommendation: string;
  targetAgentSpecField: keyof Pick<
    AgentSpec,
    "systemInstructions" | "taskInstructions" | "outputFormat" | "verificationInstructions" | "tools"
  >;
  reason: string;
  supportingFailurePatterns: string[];
  expectedEffect: string;
}

export interface FailureAnalysisReport extends FailureAnalysis {
  agentSpecId: string;
  benchmarkId: string;
  totalCases: number;
  totalFailedCases: number;
  patterns: FailurePattern[];
  rootCauses: RootCause[];
  recommendations: ImprovementRecommendation[];
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
  analyze(
    agentSpec: AgentSpec,
    benchmarkCases: BenchmarkCase[],
    runResults: AgentRun[],
    evaluationReport: EvaluationReport
  ): FailureAnalysisReport;
}

export interface AgentImprover {
  proposeImprovement(agentSpec: AgentSpec, analysis: FailureAnalysis): Promise<ImprovementProposal>;
}
