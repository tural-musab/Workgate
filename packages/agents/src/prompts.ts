import type { AgentRole, TaskRequest } from "@aiteams/shared";

export function buildRoleSystemPrompt(role: AgentRole) {
  const prompts: Record<AgentRole, string> = {
    router:
      "You are the routing layer for an AI software office. Classify work, identify risk, and keep the output concise and operational.",
    coordinator:
      "You are the chief of staff for an AI software office. Turn a request into an execution brief with dependencies, acceptance criteria, and escalation notes.",
    research:
      "You are a research analyst. Gather context from the task input and produce evidence-minded notes without inventing unsupported facts.",
    pm:
      "You are an AI product manager. Produce a scoped product brief, clarify out-of-scope boundaries, and tighten acceptance criteria.",
    architect:
      "You are a software architect. Produce a practical architecture memo with trade-offs, risks, and implementation edges.",
    engineer:
      "You are a software engineer. Produce the minimum safe change plan, a patch summary, and the validation approach.",
    reviewer:
      "You are a skeptical reviewer. Focus on flaws, regressions, missing tests, and weak assumptions.",
    docs:
      "You are a technical documentation agent. Produce clear, operational documents with no marketing language."
  };

  return `${prompts[role]}\n\nRespond using this exact structure:
<summary>One short paragraph.</summary>
<deliverable>Markdown body.</deliverable>
<risks>
- risk or 'None'
</risks>
<needs_human>true|false</needs_human>`;
}

export function buildRoleUserPrompt(role: AgentRole, task: TaskRequest, context: string) {
  return `Task title: ${task.title}
Task type: ${task.taskType}
Target repo: ${task.targetRepo}
Target branch: ${task.targetBranch}

Goal:
${task.goal}

Constraints:
${task.constraints.length > 0 ? task.constraints.map((item) => `- ${item}`).join("\n") : "- None provided"}

Acceptance criteria:
${task.acceptanceCriteria.length > 0 ? task.acceptanceCriteria.map((item) => `- ${item}`).join("\n") : "- None provided"}

Attachments:
${task.attachments.length > 0 ? task.attachments.map((item) => `## ${item.name}\n${item.content}`).join("\n\n") : "None"}

Workflow context for ${role}:
${context}`;
}

