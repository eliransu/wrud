---
sidebar_position: 5
title: Providers
---

# Providers

A **provider** is an agent wrud knows how to record. wrud is provider-agnostic at its core — each agent's specifics (where its hook config lives, which lifecycle event maps to which wrud action, how to read its payload) live in one small registry. Adding an agent is one registry entry, no other code changes.

`install-hooks` with no `--agent` **auto-detects** which of these you have and wires them all.

## Claude Code

- **Config:** `~/.claude/settings.json` (user) or `<project>/.claude/settings.json` (project)
- **Capture:** full — including **token and cost** read from the transcript
- **Events:** `SessionStart`, `UserPromptSubmit`, `PostToolUse` → record · `Stop` → flush · `SessionEnd` → finalize

```bash
npx @wrud/cli install-hooks --agent claude-code
```

## Cursor

- **Config:** `~/.cursor/hooks.json` (user) or `<project>/.cursor/hooks.json` (project)
- **Requires:** Cursor with Agent Hooks support
- **Capture:** model + actions. **Token/cost is deferred** until Cursor's transcript format is documented, so Cursor sessions show the model but not a dollar figure.
- **Events:** `sessionStart`, `beforeSubmitPrompt`, `afterFileEdit`, `afterShellExecution` → record · `afterAgentResponse` → flush · `sessionEnd` → finalize

```bash
npx @wrud/cli install-hooks --agent cursor
```

> Restart the agent after installing — hooks load at launch.

## How a session is recorded

The session is created **lazily on the first hook event of any kind** (not just `sessionStart`), so agents that don't fire a start event before the first prompt still record correctly. Events buffer locally; a detached worker summarizes on session end so closing a conversation never blocks.

When you **reopen and continue** a closed conversation, wrud opens a **new session** for that sitting (the previous one was already summarized). Both carry the same `agentSession` id, so they're recognizably the same conversation.

## Copy-to-your-AI prompts

The repo's [`providers/`](https://github.com/eliransu/wrud/tree/main/providers) folder has per-agent reference prompts you can paste into your assistant to set wrud up for you.
