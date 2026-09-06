import type { AgentRun, AgentRunner, AgentSpec, BenchmarkCase } from "./types.js";

type ResponseRule = {
  pattern: RegExp;
  response: string;
};

const responseRules: ResponseRule[] = [
  {
    pattern: /refund|return/i,
    response:
      "Sorry this did not work out. Refund requests are available within 30 days; please send your order number so support can review it."
  },
  {
    pattern: /package|shipment|tracking|late/i,
    response:
      "Sorry about the delay. Please share your tracking number so we can check the carrier status and open a support ticket if needed."
  },
  {
    pattern: /password|sign in|login/i,
    response:
      "Use the password reset link from the sign-in page, confirm it through your email, and choose a secure new password."
  },
  {
    pattern: /charged|billing|invoice|twice/i,
    response:
      "For a billing issue, please share the invoice details. We will escalate the duplicate charge for account review."
  },
  {
    pattern: /broke|broken|unacceptable|defect/i,
    response:
      "Sorry for the repeated trouble. We can troubleshoot the issue first and arrange a replacement when the defect is confirmed."
  },
  {
    pattern: /accessed|account|security|someone else/i,
    response:
      "Please secure your account by changing your password immediately. We will escalate possible unauthorized access to the security team."
  }
];

export class DeterministicMockAgentRunner implements AgentRunner {
  async run(agentSpec: AgentSpec, benchmarkCase: BenchmarkCase): Promise<AgentRun> {
    const matchedRule = responseRules.find((rule) => rule.pattern.test(benchmarkCase.input));
    const output =
      matchedRule?.response ??
      "Sorry you are having trouble. Please share more details so support can route your request.";

    return {
      caseId: benchmarkCase.id,
      input: benchmarkCase.input,
      output,
      agentSpecId: agentSpec.id
    };
  }
}

export async function runBenchmark(
  runner: AgentRunner,
  agentSpec: AgentSpec,
  benchmarkCases: BenchmarkCase[]
): Promise<AgentRun[]> {
  return Promise.all(benchmarkCases.map((benchmarkCase) => runner.run(agentSpec, benchmarkCase)));
}
