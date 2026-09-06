import type { Benchmark } from "./types.js";

export function createCustomerSupportBenchmark(): Benchmark {
  return {
    id: "customer-support-v1",
    name: "Customer Support Benchmark",
    description: "Checks whether a support agent gives policy-aware responses for common customer issues.",
    cases: [
      {
        id: "refund-window",
        input: "I bought this 20 days ago and want a refund. What should I do?",
        expected: {
          mustInclude: ["refund", "30 days", "order number"]
        },
        tags: ["refunds", "policy"]
      },
      {
        id: "late-shipment",
        input: "My package is five days late and the tracking page has not updated.",
        expected: {
          mustInclude: ["tracking", "carrier", "support ticket"]
        },
        tags: ["shipping", "triage"]
      },
      {
        id: "password-reset",
        input: "I cannot sign in because I forgot my password.",
        expected: {
          mustInclude: ["password reset", "email", "secure"]
        },
        tags: ["account", "security"]
      },
      {
        id: "billing-dispute",
        input: "I was charged twice this month. Fix it.",
        expected: {
          mustInclude: ["billing", "invoice", "escalate"]
        },
        tags: ["billing", "escalation"]
      },
      {
        id: "angry-customer",
        input: "Your product broke again. This is unacceptable.",
        expected: {
          mustInclude: ["sorry", "troubleshoot", "replacement"],
          mustNotInclude: ["calm down"]
        },
        tags: ["tone", "support"]
      },
      {
        id: "security-concern",
        input: "I think someone else accessed my account.",
        expected: {
          mustInclude: ["secure", "password", "escalate"]
        },
        tags: ["security", "escalation"]
      }
    ]
  };
}
