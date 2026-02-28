// ============================================================================
// STEP 4 — AGENT ARCHITECTURE: ORCHESTRATOR AGENT (Mistral Large 3)
// ============================================================================
// The orchestrator is the central brain:
//   - Routes commands to specialized agents
//   - Manages session state machine
//   - Handles confirmation gating
//   - Coordinates multi-agent workflows
//   - Maintains undo stack
// ============================================================================

import { BaseAgent } from './baseAgent.js';
import { MistralClient } from './mistralClient.js';
import type {
  AgentMessage,
  OrchestratorContext,
  OrchestratorState,
  OrchestratorEvent,
  CreativeIntent,
  AgentRole,
} from '../../types/agents.js';
import type { EditingStrategy } from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Orchestrator agent
// ---------------------------------------------------------------------------
export class OrchestratorAgent extends BaseAgent {
  private contexts = new Map<string, OrchestratorContext>();

  constructor(client: MistralClient) {
    super(client, {
      role: 'orchestrator',
      model: 'mistral-large-latest',
      maxTokens: 8192,
      temperature: 0.2,
      systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
      tools: ORCHESTRATOR_TOOLS,
      timeoutMs: 15000,
      retryCount: 2,
    });
  }

  /**
   * Process an incoming message.
   * The orchestrator decides which agents to invoke and in what order.
   */
  async process(message: AgentMessage): Promise<AgentMessage> {
    const ctx = this.getOrCreateContext(message.sessionId);

    switch (message.type) {
      case 'voice_command':
      case 'voice_transcript':
        return this.handleVoiceInput(message, ctx);

      case 'intent_response':
        return this.handleIntentResponse(message, ctx);

      case 'strategy_response':
        return this.handleStrategyResponse(message, ctx);

      case 'error':
        return this.handleError(message, ctx);

      default:
        return this.createResponse(
          message.fromAgent,
          'error',
          { error: `Unknown message type: ${message.type}` },
          message.id,
        );
    }
  }

  /**
   * Handle raw voice/text input from the creator.
   * This is the main entry point for user commands.
   */
  private async handleVoiceInput(
    message: AgentMessage,
    ctx: OrchestratorContext,
  ): Promise<AgentMessage> {
    const rawInput = message.payload as string;
    this.transitionState(ctx, 'interpreting_intent');

    // Route to intent interpreter
    const intentRequest: AgentMessage = {
      id: `msg_${Date.now()}`,
      fromAgent: 'orchestrator',
      toAgent: 'intent_interpreter',
      sessionId: message.sessionId,
      type: 'intent_request',
      payload: {
        rawInput,
        context: {
          currentStrategy: ctx.currentStrategy,
          creatorProfile: ctx.creatorProfile,
          state: ctx.currentState,
        },
      },
      timestamp: Date.now(),
      correlationId: message.id,
    };

    return intentRequest;
  }

  /**
   * Handle interpreted intent from the Intent Interpreter agent.
   */
  private async handleIntentResponse(
    message: AgentMessage,
    ctx: OrchestratorContext,
  ): Promise<AgentMessage> {
    const intent = message.payload as CreativeIntent;
    ctx.currentIntent = intent;

    // If confidence is too low or ambiguity requires confirmation
    if (intent.confidenceScore < 0.4 || intent.ambiguityFlags.some(f => f.requiresConfirmation)) {
      this.transitionState(ctx, 'confirming');
      return this.createResponse(
        'voice',
        'status_update',
        {
          type: 'confirmation_needed',
          intent,
          question: this.buildConfirmationQuestion(intent),
        },
        message.correlationId,
      );
    }

    // Route to editing strategy agent
    this.transitionState(ctx, 'planning_strategy');
    return this.createResponse(
      'editing_strategy',
      'strategy_request',
      { intent },
      message.correlationId,
    );
  }

  /**
   * Handle completed editing strategy.
   */
  private async handleStrategyResponse(
    message: AgentMessage,
    ctx: OrchestratorContext,
  ): Promise<AgentMessage> {
    const strategy = message.payload as EditingStrategy;

    // Push current strategy to undo stack
    if (ctx.currentStrategy) {
      ctx.undoStack.push(ctx.currentStrategy);
      if (ctx.undoStack.length > 20) ctx.undoStack.shift(); // limit stack
    }
    ctx.currentStrategy = strategy;

    // Check if this is a destructive operation requiring confirmation
    const isDestructive = this.isDestructiveStrategy(strategy);
    if (isDestructive) {
      this.transitionState(ctx, 'confirming');
      return this.createResponse(
        'voice',
        'status_update',
        {
          type: 'destructive_confirmation',
          strategy,
          summary: this.summarizeStrategy(strategy),
        },
        message.correlationId,
      );
    }

    // Proceed to execution
    this.transitionState(ctx, 'executing');
    return this.createResponse(
      'orchestrator', // self — triggers execution pipeline
      'status_update',
      {
        type: 'execute_strategy',
        strategy,
      },
      message.correlationId,
    );
  }

  /**
   * Handle undo — pop from undo stack.
   */
  handleUndo(sessionId: string): EditingStrategy | null {
    const ctx = this.contexts.get(sessionId);
    if (!ctx || ctx.undoStack.length === 0) return null;

    const previous = ctx.undoStack.pop()!;
    ctx.currentStrategy = previous;
    return previous;
  }

  /**
   * Get orchestrator context for a session.
   */
  getContext(sessionId: string): OrchestratorContext | undefined {
    return this.contexts.get(sessionId);
  }

  // --- Private helpers ---

  private handleError(message: AgentMessage, ctx: OrchestratorContext): AgentMessage {
    this.transitionState(ctx, 'error');
    return this.createResponse(
      'voice',
      'error',
      { error: message.payload, recovery: 'retry' },
      message.correlationId,
    );
  }

  private getOrCreateContext(sessionId: string): OrchestratorContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        sessionId,
        creatorId: '',
        projectId: '',
        currentState: 'idle',
        history: [],
        undoStack: [],
      });
    }
    return this.contexts.get(sessionId)!;
  }

  private transitionState(ctx: OrchestratorContext, newState: OrchestratorState): void {
    const event: OrchestratorEvent = {
      state: newState,
      timestamp: Date.now(),
    };
    ctx.history.push(event);
    ctx.currentState = newState;
  }

  private buildConfirmationQuestion(intent: CreativeIntent): string {
    const flags = intent.ambiguityFlags.filter(f => f.requiresConfirmation);
    if (flags.length > 0) {
      return flags[0].suggestions.join(' or ') + '?';
    }
    return `I understood "${intent.rawInput}" as ${intent.intentClass}. Should I proceed?`;
  }

  private isDestructiveStrategy(strategy: EditingStrategy): boolean {
    return strategy.operations.some(op =>
      op.type === 'reorder' || op.type === 'cut'
    );
  }

  private summarizeStrategy(strategy: EditingStrategy): string {
    const opTypes = strategy.operations.map(o => o.type);
    return `Strategy: ${opTypes.join(', ')} targeting ${strategy.targetPlatform}`;
  }
}

// ---------------------------------------------------------------------------
// Orchestrator system prompt
// ---------------------------------------------------------------------------
const ORCHESTRATOR_SYSTEM_PROMPT = `You are the orchestrator of a professional AI video editing system.

Your responsibilities:
1. Interpret the creator's intent (delegate to Intent Interpreter when needed)
2. Route to the correct specialized agent
3. Manage session state and undo history
4. Handle confirmation for destructive operations
5. Coordinate multi-agent workflows

Decision framework:
- If the command is a simple adjustment (zoom, speed, caption): route directly to Strategy Agent
- If the command is vague or creative ("make it viral"): route to Intent Interpreter first
- If the command involves collaboration: route to Collaboration Agent
- If the command involves publishing: route to Publishing Agent
- If the command is "undo" or "go back": handle undo directly

Always provide clear, concise feedback to the creator about what you're doing.
Never make irreversible changes without confirmation.
Optimize for speed — creators expect real-time responsiveness.`;

// ---------------------------------------------------------------------------
// Orchestrator tools
// ---------------------------------------------------------------------------
const ORCHESTRATOR_TOOLS = [
  {
    name: 'route_to_agent',
    description: 'Route a task to a specialized agent',
    parameters: [
      { name: 'agent', type: 'string' as const, description: 'Target agent role', required: true,
        enum: ['intent_interpreter', 'editing_strategy', 'collaboration', 'publishing'] },
      { name: 'task', type: 'string' as const, description: 'Task description', required: true },
      { name: 'payload', type: 'object' as const, description: 'Task payload', required: true },
    ],
  },
  {
    name: 'request_confirmation',
    description: 'Ask the creator to confirm a destructive or ambiguous action',
    parameters: [
      { name: 'question', type: 'string' as const, description: 'Confirmation question', required: true },
      { name: 'options', type: 'array' as const, description: 'Response options', required: false },
    ],
  },
  {
    name: 'execute_strategy',
    description: 'Execute an editing strategy on the timeline',
    parameters: [
      { name: 'strategyId', type: 'string' as const, description: 'Strategy to execute', required: true },
    ],
  },
  {
    name: 'undo_last',
    description: 'Undo the last editing operation',
    parameters: [],
  },
];
