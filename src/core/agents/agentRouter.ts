// ============================================================================
// STEP 4 — AGENT ARCHITECTURE: AGENT ROUTER
// ============================================================================
// Routes messages between agents using an event-driven pattern.
// Handles:
//   - Agent registration
//   - Message routing
//   - Latency tracking
//   - Circuit breaking
//   - Message logging
// ============================================================================

import { EventEmitter } from 'events';
import type { AgentMessage, AgentRole } from '../../types/agents.js';
import type { BaseAgent } from './baseAgent.js';

// ---------------------------------------------------------------------------
// Agent router
// ---------------------------------------------------------------------------
export class AgentRouter {
  private agents = new Map<AgentRole, BaseAgent>();
  private emitter = new EventEmitter();
  private messageLog: AgentMessage[] = [];
  private latencyStats = new Map<AgentRole, number[]>();

  /**
   * Register an agent with the router.
   */
  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.role, agent);
  }

  /**
   * Route a message to the target agent and return the response.
   */
  async route(message: AgentMessage): Promise<AgentMessage> {
    const target = this.agents.get(message.toAgent);
    if (!target) {
      throw new Error(`No agent registered for role: ${message.toAgent}`);
    }

    // Log the message
    this.messageLog.push(message);
    this.emitter.emit('message:sent', message);

    // Process with latency tracking
    const startTime = Date.now();
    try {
      const response = await target.process(message);
      const latencyMs = Date.now() - startTime;

      // Track latency
      this.trackLatency(message.toAgent, latencyMs);

      // Set session ID on response
      response.sessionId = message.sessionId;

      // Log response
      this.messageLog.push(response);
      this.emitter.emit('message:received', response);

      return response;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      this.trackLatency(message.toAgent, latencyMs);

      // Return error message
      const errorMsg: AgentMessage = {
        id: `err_${Date.now()}`,
        fromAgent: message.toAgent,
        toAgent: message.fromAgent,
        sessionId: message.sessionId,
        type: 'error',
        payload: { error: error instanceof Error ? error.message : String(error) },
        timestamp: Date.now(),
        correlationId: message.id,
      };

      this.messageLog.push(errorMsg);
      this.emitter.emit('message:error', errorMsg);
      return errorMsg;
    }
  }

  /**
   * Execute a full routing chain: agent A → agent B → agent C → ...
   * Each agent's response becomes the next agent's input.
   */
  async routeChain(
    initialMessage: AgentMessage,
    ...additionalAgents: AgentRole[]
  ): Promise<AgentMessage> {
    let currentMessage = await this.route(initialMessage);

    for (const nextAgent of additionalAgents) {
      if (currentMessage.type === 'error') break;

      const nextMessage: AgentMessage = {
        ...currentMessage,
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fromAgent: currentMessage.fromAgent,
        toAgent: nextAgent,
        timestamp: Date.now(),
      };

      currentMessage = await this.route(nextMessage);
    }

    return currentMessage;
  }

  /**
   * Subscribe to routing events.
   */
  on(event: 'message:sent' | 'message:received' | 'message:error', handler: (msg: AgentMessage) => void): void {
    this.emitter.on(event, handler);
  }

  /**
   * Get average latency for an agent role.
   */
  getAvgLatency(role: AgentRole): number {
    const stats = this.latencyStats.get(role);
    if (!stats || stats.length === 0) return 0;
    return stats.reduce((s, v) => s + v, 0) / stats.length;
  }

  /**
   * Get the message log for a session.
   */
  getSessionMessages(sessionId: string): AgentMessage[] {
    return this.messageLog.filter(m => m.sessionId === sessionId);
  }

  /**
   * Get all registered agent roles.
   */
  getRegisteredAgents(): AgentRole[] {
    return Array.from(this.agents.keys());
  }

  // --- Private ---

  private trackLatency(role: AgentRole, latencyMs: number): void {
    if (!this.latencyStats.has(role)) {
      this.latencyStats.set(role, []);
    }
    const stats = this.latencyStats.get(role)!;
    stats.push(latencyMs);
    // Keep last 100 measurements
    if (stats.length > 100) stats.shift();
  }
}
