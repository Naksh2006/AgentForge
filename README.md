# AgentForge

AgentForge is a hackathon foundation for automated agent engineering.

The current milestone implements a local TypeScript vertical slice:

```text
Task -> AgentSpec -> Benchmark -> AgentRunner -> Evaluation -> Failure Analysis -> Improvement -> Regression Guard
```

The included runner is deterministic for testability. The core interfaces are designed so LLM-backed agent design, running, evaluation, and improvement can be added without rewriting benchmark or regression code.

## Commands

```bash
npm install
npm test
npm run demo
```
