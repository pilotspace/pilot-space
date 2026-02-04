# Pilot Space Business Context

*This file contains business strategy, competitive analysis, and go-to-market information. For implementation details, see main CLAUDE.md*

## Competitive Moat

moat[6]{layer,depth,time_to_copy}
Note-First philosophy,Deep,12-18 months
1 orchestrator + 3 subagents + 8 skills,Deep,6-12 months
MCP Tool ecosystem (6 note tools + DB/GitHub/Search),Medium,6-9 months
Session persistence (relationship AI),Medium,3-6 months
Knowledge graph (cumulative value),Deep,Grows with usage
BYOK model (trust architecture),Medium,3 months to copy

## Anti-Personas (Do Not Target)

Enterprise 500+ (procurement cycles), solo developers (no collaboration value), non-technical teams, highly regulated industries (BYOK + cloud AI = compliance complexity).

## Pricing Tiers

**Community**: Free / Best effort support
**Pro**: $10/seat/mo / 48h response SLA
**Business**: $18/seat/mo / 24h response SLA
**Enterprise**: Custom pricing / Custom SLA

## BYOK Cost Estimates (Per User/Month)

**Light Usage** (~$2): Basic note-taking, occasional AI assistance
**Medium Usage** (~$8): Regular ghost text, weekly PR reviews, frequent agent usage
**Heavy Usage** (~$20): Constant ghost text, daily PR reviews, intensive agent interactions

## North Star Metric

**Weekly Active Writing Minutes (WAWM)** -- directly measures Note-First engagement, leading indicator of retention.

## Success Criteria

success_criteria[10]{id,criterion,target}
SC-001,Issue creation time,<2 minutes
SC-002,AI task decomposition,<60 seconds
SC-003,AI PR Review completion,<5 minutes
SC-004,AI label acceptance rate,80%
SC-005,Sprint planning reduction,30%
SC-006,Search response time,<2 seconds
SC-007,Page load time,<3 seconds
SC-010,AI feature weekly usage,70% of members
SC-012,PR linking success,95%
SC-019,RLS enforcement,100%

## Guardrail Metrics

guardrails[6]{metric,alert_if}
Ghost text dismissal rate,>80%
AI label rejection rate,>40%
Issue completion rate,<20%
Churn rate,>8%/month
Subagent latency (p95),>15s
MCP tool error rate,>5%

## Go-to-Market Phases

**Private Alpha** (8 weeks): 10 teams → NPS>30
**Closed Beta** (12 weeks): 200 waitlist → 25% activation
**Public Beta**: PLG → 500 WAU
**GA** (Q2 2026): $5K MRR

**Activation Criteria** (within 14 days):
- Create note >500 chars
- Accept 1+ ghost text suggestion
- Create first issue from note
- Invite 1 teammate

## Risk Mitigations

**Risk: Note-First doesn't resonate**
- Mitigation: Provide templates; pivot to "Quick Issue" if <20% adoption after 60 days

**Risk: AI feels generic**
- Mitigation: Confidence gating >=80%; default AI off if acceptance <15%

**Risk: SDK dependency**
- Mitigation: Abstraction layer; skills SDK-independent; fallback to direct API

**Risk: Incumbents add AI**
- Mitigation: Philosophy moat + AI depth (1+3+8 architecture)
