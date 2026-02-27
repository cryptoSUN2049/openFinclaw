import { describe, expect, it, vi } from "vitest";
import plugin from "./index.js";

describe("fin-paper-trading plugin", () => {
  it("has correct plugin metadata", () => {
    expect(plugin.id).toBe("fin-paper-trading");
    expect(plugin.name).toBe("Paper Trading");
    expect(plugin.kind).toBe("financial");
  });

  it("registers 6 tools and 1 service", () => {
    const tools: Array<{ name: string }> = [];
    const services: Array<{ id: string }> = [];

    const api = {
      resolvePath: (p: string) => `/tmp/test-paper-plugin/${p}`,
      config: { financial: {} },
      registerTool: vi.fn((tool: Record<string, unknown>) => {
        tools.push({ name: tool.name as string });
      }),
      registerService: vi.fn((svc: Record<string, unknown>) => {
        services.push({ id: svc.id as string });
      }),
    };

    plugin.register(api as never);

    expect(services).toHaveLength(1);
    expect(services[0]!.id).toBe("fin-paper-engine");

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("fin_paper_create");
    expect(toolNames).toContain("fin_paper_order");
    expect(toolNames).toContain("fin_paper_positions");
    expect(toolNames).toContain("fin_paper_state");
    expect(toolNames).toContain("fin_paper_metrics");
    expect(toolNames).toContain("fin_paper_list");
    expect(tools).toHaveLength(6);
  });
});
