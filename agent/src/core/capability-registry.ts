/** 青穗集 · Agent 能力注册表：声明可交付能力、风险、证据和能力之间的后续关系。 */
import { invariant } from "../errors.js";

export type CapabilityRiskTier = "R0" | "R1" | "R2" | "R3";
export type CapabilityThinking = "on" | "off";

export interface CapabilitySpec {
  id: string;
  domain: string;
  name: string;
  description: string;
  requiredContext: string[];
  tools: string[];
  artifactType: string | null;
  proposalTypes: string[];
  riskTier: CapabilityRiskTier;
  requiresApproval: boolean;
  evidenceRequired: boolean;
  minDataCoverage: number;
  thinking: CapabilityThinking;
  maxTokens: number;
  outputSchema?: Record<string, unknown>;
  nextCapabilities: string[];
}

export interface CapabilityRegistryOptions {
  availableTools?: Iterable<string>;
  availableProposalTypes?: Iterable<string>;
}

export interface PublicCapability extends CapabilitySpec {}

/**
 * 能力是产品层的可交付单元，工具只是实现能力时可以使用的手段。
 * 注册表在启动时拒绝不完整声明，避免前端展示了一个实际上无法执行的能力。
 */
export class CapabilityRegistry {
  private readonly byId = new Map<string, CapabilitySpec>();

  constructor(
    readonly specs: readonly CapabilitySpec[],
    options: CapabilityRegistryOptions = {},
  ) {
    const tools = options.availableTools ? new Set(options.availableTools) : null;
    const proposalTypes = options.availableProposalTypes
      ? new Set(options.availableProposalTypes)
      : null;

    for (const raw of specs) {
      const spec = normalize(raw);
      invariant(
        /^[a-z][a-z0-9_]{1,63}$/.test(spec.id) && !this.byId.has(spec.id),
        500,
        "能力 ID 不合法或重复：" + spec.id,
      );
      invariant(spec.domain.trim() && spec.name.trim() && spec.description.trim(), 500, "能力声明缺少名称或说明：" + spec.id);
      invariant(spec.requiredContext.every(value => value.trim()), 500, "能力上下文声明不能为空：" + spec.id);
      invariant(spec.tools.every(value => /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(value)), 500, "能力引用了不合法工具：" + spec.id);
      invariant(new Set(spec.tools).size === spec.tools.length, 500, "能力工具不能重复：" + spec.id);
      invariant(new Set(spec.proposalTypes).size === spec.proposalTypes.length, 500, "能力提议类型不能重复：" + spec.id);
      invariant(new Set(spec.nextCapabilities).size === spec.nextCapabilities.length, 500, "能力后续关系不能重复：" + spec.id);
      invariant(spec.minDataCoverage >= 0 && spec.minDataCoverage <= 1, 500, "能力数据覆盖率必须在 0 到 1 之间：" + spec.id);
      invariant(Number.isInteger(spec.maxTokens) && spec.maxTokens > 0, 500, "能力输出预算不合法：" + spec.id);
      invariant((spec.riskTier === "R2" || spec.riskTier === "R3") ? spec.requiresApproval : true, 500, "R2/R3 能力必须要求审批：" + spec.id);
      if (tools) for (const tool of spec.tools) invariant(tools.has(tool), 500, `能力 ${spec.id} 引用了未注册工具：${tool}`);
      if (proposalTypes) for (const proposal of spec.proposalTypes) invariant(proposalTypes.has(proposal), 500, `能力 ${spec.id} 引用了未注册提议类型：${proposal}`);
      this.byId.set(spec.id, spec);
    }
    for (const spec of this.byId.values()) for (const next of spec.nextCapabilities)
      invariant(this.byId.has(next), 500, `能力 ${spec.id} 指向不存在的后续能力：${next}`);
  }

  get(id: string): CapabilitySpec | null {
    return this.byId.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  list(domain?: string): PublicCapability[] {
    return [...this.byId.values()]
      .filter(spec => !domain || spec.domain === domain)
      .map(spec => ({ ...spec, requiredContext: [...spec.requiredContext], tools: [...spec.tools], proposalTypes: [...spec.proposalTypes], nextCapabilities: [...spec.nextCapabilities] }));
  }
}

function normalize(spec: CapabilitySpec): CapabilitySpec {
  return {
    ...spec,
    requiredContext: [...spec.requiredContext],
    tools: [...spec.tools],
    proposalTypes: [...spec.proposalTypes],
    nextCapabilities: [...spec.nextCapabilities],
  };
}
