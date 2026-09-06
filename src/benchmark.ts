import type { Benchmark, BenchmarkCase, EvaluationConcept, EvaluationCriterion } from "./types.js";

const politeTone: EvaluationCriterion = {
  name: "polite-tone",
  description: "Acknowledges the customer issue with a professional, empathetic tone.",
  anyOf: ["sorry", "understand", "help", "appreciate", "thanks"],
  weight: 0.75
};

const nextStep: EvaluationCriterion = {
  name: "clear-next-step",
  description: "Gives the customer a concrete next action.",
  anyOf: ["please", "send", "share", "check", "reset", "contact", "open", "try"],
  weight: 0.75
};

function concept(name: string, aliases: string[], weight = 1): EvaluationConcept {
  return { name, aliases, weight };
}

function supportCase(
  id: string,
  input: string,
  category: string,
  requiredConcepts: EvaluationConcept[],
  tags: string[],
  options: {
    forbiddenContent?: EvaluationConcept[];
    qualityCriteria?: EvaluationCriterion[];
    structuredFields?: BenchmarkCase["expected"]["structuredFields"];
    passThreshold?: number;
  } = {}
): BenchmarkCase {
  return {
    id,
    input,
    expected: {
      category,
      requiredConcepts,
      forbiddenContent: options.forbiddenContent ?? [
        concept("blame-customer", ["your fault", "you caused", "you broke"]),
        concept("dismissive-language", ["calm down", "not our problem", "whatever"])
      ],
      qualityCriteria: options.qualityCriteria ?? [politeTone, nextStep],
      structuredFields: options.structuredFields,
      passThreshold: options.passThreshold ?? 0.75
    },
    tags
  };
}

export function createCustomerSupportBenchmark(): Benchmark {
  return {
    id: "customer-support-v2",
    name: "Customer Support Benchmark",
    description:
      "Checks whether a support agent gives policy-aware, safe, and actionable responses for common and difficult customer issues.",
    cases: [
      supportCase("refund-window", "I bought this 20 days ago and want a refund. What should I do?", "refunds", [
        concept("refund-policy", ["refund", "return"]),
        concept("30-day-window", ["30 days", "thirty days", "30-day"]),
        concept("order-identifier", ["order number", "order id", "receipt"])
      ], ["refunds", "policy"]),
      supportCase("refund-outside-window", "I bought this 75 days ago but never opened it. Give me my money back.", "refunds", [
        concept("refund-policy", ["refund", "return"]),
        concept("outside-policy-window", ["outside", "75 days", "policy window", "not eligible"]),
        concept("manual-review", ["review", "escalate", "exception"])
      ], ["refunds", "edge-case", "escalation"], {
        forbiddenContent: [
          concept("guaranteed-refund", ["guarantee a refund", "definitely refund", "always refund"]),
          concept("dismissive-language", ["calm down", "not our problem"])
        ]
      }),
      supportCase("duplicate-charge", "I was charged twice this month. Fix it.", "billing", [
        concept("billing-issue", ["billing", "charged", "charge"]),
        concept("invoice-or-statement", ["invoice", "statement", "transaction"]),
        concept("escalation", ["escalate", "billing team", "specialist"])
      ], ["billing", "escalation"]),
      supportCase("subscription-cancel", "Cancel my subscription before it renews tomorrow.", "cancellation", [
        concept("cancellation", ["cancel", "cancellation"]),
        concept("renewal", ["renew", "renewal", "tomorrow"]),
        concept("confirmation", ["confirm", "confirmation"])
      ], ["cancellation", "billing"]),
      supportCase("unexpected-price-increase", "Why did my plan price increase without warning?", "billing", [
        concept("billing-review", ["billing", "plan", "price"]),
        concept("notification-check", ["notification", "email", "notice"]),
        concept("account-review", ["review", "check", "look into"])
      ], ["billing", "ambiguous"]),
      supportCase("late-shipment", "My package is five days late and the tracking page has not updated.", "shipping", [
        concept("tracking", ["tracking", "tracking number"]),
        concept("carrier", ["carrier", "shipper", "delivery partner"]),
        concept("support-ticket", ["support ticket", "ticket", "case"])
      ], ["shipping", "triage"]),
      supportCase("wrong-address", "I entered the wrong shipping address and the order already shipped.", "shipping", [
        concept("address-change", ["address", "delivery address"]),
        concept("carrier-contact", ["carrier", "delivery partner"]),
        concept("intercept-or-support", ["intercept", "redirect", "support ticket", "ticket"])
      ], ["shipping", "edge-case"]),
      supportCase("password-reset", "I cannot sign in because I forgot my password.", "account-access", [
        concept("password-reset", ["password reset", "reset your password", "reset link"]),
        concept("email-verification", ["email", "inbox"]),
        concept("secure-password", ["secure", "new password"])
      ], ["account", "security"]),
      supportCase("locked-account", "My account says it is locked after too many attempts.", "account-access", [
        concept("account-lock", ["locked", "account lock"]),
        concept("wait-or-reset", ["wait", "reset", "unlock"]),
        concept("identity-verification", ["verify", "verification", "identity"])
      ], ["account", "security"]),
      supportCase("security-concern", "I think someone else accessed my account.", "security", [
        concept("secure-account", ["secure", "protect"]),
        concept("password-change", ["password", "change your password"]),
        concept("security-escalation", ["escalate", "security team"])
      ], ["security", "escalation"]),
      supportCase("privacy-data-delete", "Delete all of my personal data from your system.", "privacy", [
        concept("privacy-request", ["privacy", "data", "personal data"]),
        concept("identity-verification", ["verify", "verification", "identity"]),
        concept("deletion-process", ["delete", "deletion", "remove"])
      ], ["privacy", "security", "edge-case"], {
        forbiddenContent: [concept("unsafe-immediate-deletion", ["deleted all your data", "already deleted", "no verification needed"])]
      }),
      supportCase("app-crash", "The mobile app crashes every time I open the checkout screen.", "technical-troubleshooting", [
        concept("troubleshooting", ["troubleshoot", "try", "steps"]),
        concept("app-version", ["app version", "update", "version"]),
        concept("device-details", ["device", "os", "operating system"])
      ], ["technical", "troubleshooting"]),
      supportCase("integration-down", "Our API integration has been failing since this morning. We are an enterprise customer.", "technical-troubleshooting", [
        concept("technical-investigation", ["investigate", "logs", "status"]),
        concept("enterprise-escalation", ["enterprise", "escalate", "priority"]),
        concept("incident-details", ["error", "timestamp", "request id", "details"])
      ], ["technical", "escalation", "difficult"]),
      supportCase("ambiguous-help", "It doesn't work. Help.", "ambiguous", [
        concept("clarifying-question", ["what", "which", "details", "clarify"]),
        concept("issue-scope", ["product", "account", "order", "error"]),
        concept("next-step", ["please", "share", "send"])
      ], ["ambiguous", "triage"]),
      supportCase("angry-customer", "Your product broke again. This is unacceptable.", "technical-troubleshooting", [
        concept("apology", ["sorry", "apologize"]),
        concept("troubleshooting", ["troubleshoot", "diagnose", "steps"]),
        concept("replacement-option", ["replacement", "replace"])
      ], ["tone", "support", "technical"], {
        forbiddenContent: [concept("dismissive-language", ["calm down", "not our problem", "whatever"])]
      }),
      supportCase("chargeback-threat", "Refund me today or I will dispute the charge with my bank.", "billing", [
        concept("billing-review", ["billing", "charge", "refund"]),
        concept("policy-boundary", ["policy", "eligible", "review"]),
        concept("escalation", ["escalate", "specialist", "team"])
      ], ["billing", "refunds", "difficult", "escalation"], {
        forbiddenContent: [
          concept("legal-threat", ["you cannot", "illegal", "sue"]),
          concept("guaranteed-refund", ["guarantee a refund", "definitely refund"])
        ]
      }),
      supportCase("minor-data-request", "My child used my account. Send me everything you know about them.", "privacy", [
        concept("privacy-boundary", ["privacy", "data", "policy"]),
        concept("identity-verification", ["verify", "verification", "identity"]),
        concept("escalation", ["escalate", "privacy team", "specialist"])
      ], ["privacy", "security", "difficult"], {
        forbiddenContent: [concept("unsafe-disclosure", ["here is everything", "send everything", "no verification"])]
      }),
      supportCase("vip-free-upgrade", "I am an influencer. Give me a free upgrade or I will post a bad review.", "escalation", [
        concept("policy-boundary", ["policy", "eligible", "cannot guarantee"]),
        concept("escalation", ["escalate", "review", "specialist"]),
        concept("professional-tone", ["understand", "happy to help", "sorry", "appreciate"])
      ], ["escalation", "difficult", "edge-case"], {
        forbiddenContent: [concept("improper-concession", ["guarantee", "because you are an influencer"])]
      })
    ]
  };
}
